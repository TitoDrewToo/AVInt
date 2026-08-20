# Google Drive import — private MVP and Marketplace path

## What shipped in the private MVP

Smart Storage now has an `Import from Drive` entry beside the existing upload control. The flow:

1. authenticates the signed-in AVIntelligence user;
2. connects a Google account through a separate Drive OAuth flow;
3. lists Drive files and folders in a modal;
4. downloads selected supported files server-side;
5. writes them to the existing Smart Storage landing zone;
6. preserves `source_provider`, Drive file ID, Drive URL, and Drive modification time;
7. lets the existing Smart Security prescan, extraction, normalization, reports, and exports continue unchanged.

Refresh tokens are encrypted with AES-256-GCM before storage. The connection table is RLS-protected, and API routes derive the AVIntelligence user from the bearer session rather than accepting a browser-supplied user ID.

## Required environment variables

Configure these only in Vercel/Supabase environment settings or local `.env.local`; never commit values:

```text
GOOGLE_DRIVE_CLIENT_ID=
GOOGLE_DRIVE_CLIENT_SECRET=
GOOGLE_DRIVE_REDIRECT_URI=https://www.avintph.com/api/integrations/google-drive/callback
GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY=<base64-encoded 32-byte key>
```

Generate the encryption key locally with:

```bash
openssl rand -base64 32
```

## Google Cloud setup

1. Create or select the AVIntelligence Google Cloud project.
2. Configure the OAuth consent screen with AVIntelligence as the application name and `avintph.com` as the authorized domain.
3. Create a Web application OAuth client.
4. Add `https://www.avintph.com/api/integrations/google-drive/callback` as an authorized redirect URI.
5. Enable the Google Drive API.
6. Add the client ID, secret, redirect URI, and encryption key to the deployment environment.
7. Apply `supabase/migrations/20260820_google_drive_import.sql` before enabling the feature.

## Marketplace hardening still required

The private MVP uses the Drive read-only scope so the modal can browse existing files and folders. Before public Marketplace submission, replace broad browsing with a Google Picker/file-selection design and the narrowest feasible scope, then complete Google OAuth verification and the public listing review. Do not submit the current scope configuration as final without that review.

Required listing materials: privacy policy, terms, support URL, screenshots, test account, exact data-flow description, retention/deletion explanation, and a clear explanation of why the app needs each scope.

## Verification checklist

- [ ] Apply the migration in the intended Supabase project.
- [ ] Configure Google Cloud OAuth and deployment secrets.
- [ ] Connect with a test Google account.
- [ ] Import a supported PDF, image, CSV, or XLSX file.
- [ ] Confirm it appears in Smart Storage as `pending_scan` and follows normal prescan processing.
- [ ] Confirm the source Drive ID and link are attached only to the importing user’s file row.
- [ ] Confirm duplicate Drive imports are rejected by the unique index.
- [ ] Confirm unsupported and oversized files are skipped with a safe message.
- [ ] Test disconnect and reconnect.
- [ ] Test with a second AVIntelligence account to confirm no cross-user access.
