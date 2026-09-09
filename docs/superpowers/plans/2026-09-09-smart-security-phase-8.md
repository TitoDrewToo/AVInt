# Smart Security Phase 8 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status:** PARKED while AVIntelligence is pre-revenue. Activate immediately after the first recurring revenue, a funded enterprise compliance requirement, or another approved billing source becomes available. Google Cloud KMS requires billing; that dependency is intentional and does not block the deployed Phase 1–7 security posture.

**Goal:** Produce independently signed, externally stored checkpoints of every current Smart Security evidence-chain head without overstating the result as legally certified chain of custody.

**Architecture:** Build a deterministic checkpoint manifest from all current prescan correlation heads plus the global administrator-audit head. Hash the canonical manifest with SHA-256, sign that digest using a non-exportable Google Cloud KMS P-256 key, and write the signed envelope under a unique content-addressed name in a separate Google Cloud Storage bucket. Store an append-only Supabase receipt so exports can prove which database evidence was covered by an external checkpoint.

**Tech Stack:** Next.js 16 route handlers, TypeScript, Node `crypto`, Supabase/PostgreSQL, Google Cloud KMS `EC_SIGN_P256_SHA256`, Google Cloud Storage, Vercel Cron.

---

## Fixed decisions and boundaries

- Google Cloud project: `avint-core` (`14720117769`).
- Region: `asia-southeast1`.
- Bucket name: `avint-security-checkpoints-14720117769`.
- Key ring: `avint-security-evidence`.
- Asymmetric signing key: `checkpoint-signing`.
- Signing algorithm: `EC_SIGN_P256_SHA256`, the Google-recommended elliptic-curve signing algorithm.
- Checkpoint cadence: daily, after the existing retention reconciliation window.
- Object names are immutable and content-addressed: `v1/YYYY/MM/DD/<checkpoint_hash>.json`.
- The application identity receives KMS signing, public-key viewing, and bucket object-creation permissions only. It receives no object delete, overwrite, retention-policy, bucket-admin, or KMS-admin permission.
- The bucket begins with an unlocked 365-day retention policy. Bucket Lock is not enabled until legal retention and account-lifecycle policy are approved because locking cannot be reversed or shortened.
- Only hashes, event identifiers, timestamps, key identifiers, and external object receipts leave Supabase. Filenames, account IDs, user IDs, document metadata, detector signals, and file content never enter the external checkpoint.
- Phase 8 does not claim that application audit events cover direct Supabase administrator actions. Provider audit-log integration and legal review remain explicit closure requirements.

## Task 1: Deterministic checkpoint contract

**Files:**
- Create: `lib/security-checkpoint.ts`
- Create: `scripts/test-security-checkpoint.ts`

- [ ] **Step 1: Write the failing deterministic-contract test**

The test must prove that input ordering cannot change the manifest or digest, duplicate correlation heads are rejected, malformed hashes are rejected, a changed head changes the digest, and continuity requires the preceding checkpoint hash.

```ts
const first = buildSecurityCheckpointManifest({
  generatedAt: "2026-09-09T00:00:00.000Z",
  previousCheckpointHash: null,
  prescanHeads: [headB, headA],
  adminAuditHead,
})
const second = buildSecurityCheckpointManifest({
  generatedAt: "2026-09-09T00:00:00.000Z",
  previousCheckpointHash: null,
  prescanHeads: [headA, headB],
  adminAuditHead,
})
assert.equal(canonicalCheckpointPayload(first), canonicalCheckpointPayload(second))
assert.equal(checkpointDigest(first), checkpointDigest(second))
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx tsx scripts/test-security-checkpoint.ts`

Expected: module resolution failure for `lib/security-checkpoint.ts`.

- [ ] **Step 3: Implement the pure contract**

Use these public types and functions:

```ts
export type SecurityChainHead = {
  chain_id: string
  event_id: string
  event_hash: string
  created_at: string
}

export type SecurityCheckpointManifest = {
  format: "avint-security-checkpoint-v1"
  generated_at: string
  previous_checkpoint_hash: string | null
  prescan_heads: SecurityChainHead[]
  admin_audit_head: Omit<SecurityChainHead, "chain_id"> | null
}

export function buildSecurityCheckpointManifest(input: {
  generatedAt: string
  previousCheckpointHash: string | null
  prescanHeads: SecurityChainHead[]
  adminAuditHead: Omit<SecurityChainHead, "chain_id"> | null
}): SecurityCheckpointManifest

export function canonicalCheckpointPayload(manifest: SecurityCheckpointManifest): string
export function checkpointDigest(manifest: SecurityCheckpointManifest): string
export function assertCheckpointContinuity(previousHash: string | null, manifest: SecurityCheckpointManifest): void
```

Sort prescan heads by `chain_id`, build every object in a fixed key order, validate all hashes as 64 lowercase hexadecimal characters, validate all timestamps as finite ISO timestamps, and hash the UTF-8 canonical payload with SHA-256.

- [ ] **Step 4: Run the focused test**

Run: `npx tsx scripts/test-security-checkpoint.ts`

Expected: `security checkpoint contract: passed`.

- [ ] **Step 5: Commit**

```bash
git add lib/security-checkpoint.ts scripts/test-security-checkpoint.ts
git commit -m "feat(security): define external checkpoint contract"
```

## Task 2: Append-only checkpoint receipts

**Files:**
- Create: `supabase/migrations/20260909090000_add_security_checkpoint_receipts.sql`
- Create: `test/security_checkpoint_contract.sql`

- [ ] **Step 1: Add the failing database contract**

The contract must assert:

```sql
do $$
begin
  if has_table_privilege('anon', 'public.prescan_evidence_checkpoints', 'SELECT')
     or has_table_privilege('authenticated', 'public.prescan_evidence_checkpoints', 'SELECT') then
    raise exception 'Browser roles can read security checkpoints';
  end if;
  if has_table_privilege('service_role', 'public.prescan_evidence_checkpoints', 'UPDATE')
     or has_table_privilege('service_role', 'public.prescan_evidence_checkpoints', 'DELETE')
     or has_table_privilege('service_role', 'public.prescan_evidence_checkpoints', 'TRUNCATE') then
    raise exception 'Checkpoint receipts are mutable';
  end if;
end $$;
```

- [ ] **Step 2: Create the receipt table**

Create `public.prescan_evidence_checkpoints` with:

```sql
id uuid primary key default gen_random_uuid(),
checkpoint_hash text not null unique check (checkpoint_hash ~ '^[0-9a-f]{64}$'),
previous_checkpoint_hash text check (previous_checkpoint_hash is null or previous_checkpoint_hash ~ '^[0-9a-f]{64}$'),
manifest jsonb not null check (jsonb_typeof(manifest) = 'object'),
signature_base64 text not null,
algorithm text not null check (algorithm = 'EC_SIGN_P256_SHA256'),
kms_key_version text not null,
public_key_pem text not null,
external_bucket text not null,
external_object text not null unique,
external_generation bigint not null check (external_generation > 0),
anchored_at timestamptz not null,
created_at timestamptz not null default now()
```

Enable RLS, revoke all privileges from `public`, `anon`, and `authenticated`, and grant only `SELECT, INSERT` to `service_role`. Add a before-insert trigger that takes a transaction advisory lock and rejects any row whose `previous_checkpoint_hash` does not equal the latest checkpoint hash. Revoke direct execution on the trigger function from every API role, including `service_role`.

- [ ] **Step 3: Rebuild a fresh local database and run the contract**

Run: `supabase db reset`

Run: `psql "$LOCAL_DATABASE_URL" -v ON_ERROR_STOP=1 -f test/security_checkpoint_contract.sql`

Expected: both commands exit zero.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260909090000_add_security_checkpoint_receipts.sql test/security_checkpoint_contract.sql
git commit -m "feat(security): add append-only checkpoint receipts"
```

## Task 3: Google Cloud signing and storage adapter

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Create: `lib/security-checkpoint-gcp.ts`
- Create: `scripts/test-security-checkpoint-gcp.ts`

- [ ] **Step 1: Add Google client libraries**

Run: `pnpm add @google-cloud/kms @google-cloud/storage`

- [ ] **Step 2: Write adapter tests with injected clients**

Prove the adapter sends only a SHA-256 digest to KMS, requests the configured key version, uses `ifGenerationMatch: 0`, writes the content-addressed object name, and rejects a returned digest CRC or signature CRC failure.

- [ ] **Step 3: Implement the adapter**

Expose:

```ts
export async function signAndStoreSecurityCheckpoint(input: {
  manifest: SecurityCheckpointManifest
  kmsKeyVersion: string
  bucket: string
  kmsClient?: KeyManagementServiceClient
  storageClient?: Storage
}): Promise<{
  checkpoint_hash: string
  signature_base64: string
  algorithm: "EC_SIGN_P256_SHA256"
  kms_key_version: string
  public_key_pem: string
  external_bucket: string
  external_object: string
  external_generation: number
  anchored_at: string
}>
```

The external envelope contains the manifest, checkpoint hash, algorithm, exact key-version resource, public key, signature, and anchor timestamp. The adapter must upload with `resumable: false`, `validation: "crc32c"`, `preconditionOpts: { ifGenerationMatch: 0 }`, and `contentType: "application/json"`.

- [ ] **Step 4: Verify**

Run: `npx tsx scripts/test-security-checkpoint-gcp.ts`

Expected: `security checkpoint GCP adapter: passed`.

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml lib/security-checkpoint-gcp.ts scripts/test-security-checkpoint-gcp.ts
git commit -m "feat(security): sign and anchor checkpoints in Google Cloud"
```

## Task 4: Checkpoint orchestrator and scheduled route

**Files:**
- Create: `lib/security-checkpoint-server.ts`
- Create: `app/api/cron/security-checkpoint/route.ts`
- Modify: `vercel.json`
- Create: `scripts/test-security-checkpoint-server.ts`

- [ ] **Step 1: Test head selection and idempotency**

The server test must prove that one latest event is selected per prescan correlation, one latest administrator event is selected globally, a retry with unchanged heads returns the existing checkpoint, and an external upload without a database receipt is recoverable by its content-addressed name.

- [ ] **Step 2: Implement checkpoint creation**

`createSecurityCheckpoint()` must:

1. read the latest receipt;
2. select all current prescan correlation heads;
3. select the current administrator-audit head;
4. build and hash the deterministic manifest;
5. return the latest receipt when the exact manifest heads are already anchored;
6. sign and upload the external envelope;
7. insert the append-only Supabase receipt;
8. append `security_checkpoint_anchored` to the administrator audit chain without recursively rebuilding the checkpoint in the same run.

- [ ] **Step 3: Add a cron-authenticated route**

The route accepts only `Authorization: Bearer ${CRON_SECRET}`. Missing checkpoint configuration returns `503` and never produces an unsigned local substitute. Provider failure returns `502`, retains no database receipt, and is visible through sanitized server logging.

- [ ] **Step 4: Schedule after retention reconciliation**

Add this Vercel cron entry:

```json
{ "path": "/api/cron/security-checkpoint", "schedule": "30 3 * * *" }
```

- [ ] **Step 5: Verify and commit**

Run: `npx tsx scripts/test-security-checkpoint-server.ts`

Run: `npx tsc --noEmit`

Run: `npm run lint`

Run: `npm run build`

Expected: every command exits zero.

```bash
git add lib/security-checkpoint-server.ts app/api/cron/security-checkpoint/route.ts vercel.json scripts/test-security-checkpoint-server.ts
git commit -m "feat(security): schedule external evidence checkpoints"
```

## Task 5: Export continuity and offline verification

**Files:**
- Modify: `app/api/systems/security/export/route.ts`
- Modify: `scripts/verify-prescan-evidence.ts`
- Create: `scripts/test-security-evidence-export.ts`

- [ ] **Step 1: Add checkpoint receipts to exports**

Export receipts that overlap or follow the requested evidence window. Change the format to `avint-prescan-evidence-v2`. Keep the v1 verifier path supported.

- [ ] **Step 2: Verify offline**

The verifier must check:

- prescan row seals and correlation links;
- administrator row seals and global links;
- checkpoint canonical payload and SHA-256 digest;
- ECDSA P-256 signature against the embedded public key;
- checkpoint-to-checkpoint continuity;
- every exported chain head is covered by a checkpoint or explicitly reported as `not_yet_anchored`;
- a tampered visible event, manifest, signature, public key, or previous-checkpoint hash fails verification.

- [ ] **Step 3: Update assurance language**

Use: `Database-sealed evidence with externally signed checkpoint coverage. Legal chain-of-custody review is not complete.`

- [ ] **Step 4: Verify and commit**

Run: `npx tsx scripts/test-security-evidence-export.ts`

Run: `npx tsc --noEmit`

Expected: both exit zero.

```bash
git add app/api/systems/security/export/route.ts scripts/verify-prescan-evidence.ts scripts/test-security-evidence-export.ts
git commit -m "feat(security): verify external checkpoint coverage"
```

## Task 6: Operations visibility

**Files:**
- Modify: `app/api/systems/security/route.ts`
- Modify: `app/systems/security/page.tsx`

- [ ] **Step 1: Return checkpoint health**

The administrator API returns the latest anchor time, checkpoint hash, external object name, key version, age, and continuity status. It never returns Google credentials or a signed object URL.

- [ ] **Step 2: Add a read-only checkpoint panel**

Show `Current`, `Overdue`, `Unconfigured`, or `Continuity error`. Link the external object by stable `gs://` identity only; do not create a public URL.

- [ ] **Step 3: Verify and commit**

Run: `npx tsc --noEmit`

Run: `npx eslint app/api/systems/security/route.ts app/systems/security/page.tsx`

Run: `npm run build`

Expected: every command exits zero.

```bash
git add app/api/systems/security/route.ts app/systems/security/page.tsx
git commit -m "feat(security): surface checkpoint health"
```

## Task 7: Provision the external boundary

**Files:**
- Modify: `docs/smart-security-architecture.md`

- [ ] **Step 1: Enable APIs and create the key**

```bash
gcloud services enable cloudkms.googleapis.com storage.googleapis.com --project=avint-core
gcloud kms keyrings create avint-security-evidence --location=asia-southeast1 --project=avint-core
gcloud kms keys create checkpoint-signing --keyring=avint-security-evidence --location=asia-southeast1 --purpose=asymmetric-signing --default-algorithm=ec-sign-p256-sha256 --protection-level=software --rotation-period=90d --next-rotation-time=2026-12-09T00:00:00Z --project=avint-core
```

- [ ] **Step 2: Create the external bucket with an unlocked retention policy**

```bash
gcloud storage buckets create gs://avint-security-checkpoints-14720117769 --project=avint-core --location=asia-southeast1 --uniform-bucket-level-access --public-access-prevention
gcloud storage buckets update gs://avint-security-checkpoints-14720117769 --retention-period=P365D
```

Do not run `--lock-retention-period` in this plan.

- [ ] **Step 3: Create a least-privilege runtime identity**

Create `avint-checkpoint-writer@avint-core.iam.gserviceaccount.com`. Grant only `roles/cloudkms.signerVerifier` on the signing key and `roles/storage.objectCreator` on the checkpoint bucket. Configure Vercel credentials through its encrypted Production environment; never commit a service-account key.

- [ ] **Step 4: Configure production**

Set:

```text
SECURITY_CHECKPOINT_GCS_BUCKET=avint-security-checkpoints-14720117769
SECURITY_CHECKPOINT_KMS_KEY_VERSION=projects/avint-core/locations/asia-southeast1/keyRings/avint-security-evidence/cryptoKeys/checkpoint-signing/cryptoKeyVersions/1
```

- [ ] **Step 5: Apply the migration, deploy, and invoke one checkpoint**

Apply only `20260909090000_add_security_checkpoint_receipts.sql`, deploy the application, call `/api/cron/security-checkpoint` with `CRON_SECRET`, and verify the database receipt, external object generation, KMS signature, export coverage, Systems health, and Cloud Audit Logs.

- [ ] **Step 6: Commit the production proof**

```bash
git add docs/smart-security-architecture.md
git commit -m "docs(security): record external checkpoint proof"
```

## Task 8: Governance and the irreversible lock gate

**Files:**
- Create: `docs/ops/security-evidence-custody.md`
- Modify: `docs/smart-security-architecture.md`

- [ ] **Step 1: Document operating procedures**

Define checkpoint alert response, KMS rotation, compromised-writer response, evidence hold, export, custody transfer, clock source, Supabase and Google administrator-log review, account deletion exceptions, and incident escalation.

- [ ] **Step 2: Enable Google Data Access audit logs**

Enable KMS and Storage Data Access logs and route them to a separately access-controlled log bucket. Confirm reads, writes, signing calls, denied operations, IAM changes, and retention-policy changes appear.

- [ ] **Step 3: Legal and retention approval gate**

Obtain written approval for the retention period and account-deletion exceptions. Only then decide whether to run:

```bash
gcloud storage buckets update gs://avint-security-checkpoints-14720117769 --lock-retention-period
```

This action is deliberately excluded from automatic execution because Google documents it as irreversible.

- [ ] **Step 4: Final language review**

Until legal review is complete, the product may say `externally signed, tamper-evident evidence checkpoints`. It must not say `legally certified`, `forensic chain of custody`, or `compliance guaranteed`.

## Self-review

- Spec coverage: signing, external storage, continuity, export verification, provider audit logs, key rotation, retention, holds, custody transfer, incident handling, account deletion, and legal review are each assigned to a task.
- Scope: raw files and sensitive document metadata never leave Supabase; only evidence-chain commitments do.
- Failure posture: provider unavailability produces no unsigned fallback and no false checkpoint receipt.
- Irreversible action: Bucket Lock is explicitly separated behind written retention/legal approval.
- Operational claim: completion of Tasks 1–7 supports `externally signed checkpoints`; legal chain-of-custody wording remains blocked on Task 8.
