import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { TENANT_ID } from "@/smart-security/config/tenant";

const SMART_SECURITY_DIR = join(process.cwd(), "smart-security");

type HealthStatus = "ok" | "degraded" | "down";

type HealthResponse = {
  status: HealthStatus;
  tenant_id: string;
  checked_at: string;
  checks: {
    analyzer_reachable: boolean | null;
    doctrine_manifest_age_hours: number | null;
    last_incident_seconds_ago: number | null;
    detection_registry_version: string | null;
    action_matrix_version: string | null;
    mode_summary: { observe: number; enforce: number } | null;
    schema_versions: {
      decision: string | null;
      incident: string | null;
      evidence: string | null;
      detection: string | null;
      wire_scan_file: string | null;
      wire_decide: string | null;
    };
  };
};

async function readJson<T>(relativePath: string): Promise<T | null> {
  try {
    const buf = await readFile(join(SMART_SECURITY_DIR, relativePath), "utf8");
    return JSON.parse(buf) as T;
  } catch {
    return null;
  }
}

async function readSchemaVersion(name: string): Promise<string | null> {
  const schema = await readJson<{ $id?: string }>(
    `schemas/${name}.schema.json`,
  );
  if (!schema) return null;
  return "1.0.0";
}

async function summarizeDetectionModes(): Promise<
  | { observe: number; enforce: number }
  | null
> {
  type Registry = {
    detections: Array<{ mode: "observe" | "enforce" }>;
  };
  const reg = await readJson<Registry>("detections/registry.json");
  if (!reg) return null;
  return reg.detections.reduce(
    (acc, d) => {
      acc[d.mode] = (acc[d.mode] ?? 0) + 1;
      return acc;
    },
    { observe: 0, enforce: 0 } as { observe: number; enforce: number },
  );
}

export async function GET() {
  const [
    registry,
    modeSummary,
    decisionV,
    incidentV,
    evidenceV,
    detectionV,
    wireScanFileV,
    wireDecideV,
  ] = await Promise.all([
    readJson<{ $schema_version: string }>("detections/registry.json"),
    summarizeDetectionModes(),
    readSchemaVersion("decision"),
    readSchemaVersion("incident"),
    readSchemaVersion("evidence"),
    readSchemaVersion("detection"),
    readSchemaVersion("wire-scan-file"),
    readSchemaVersion("wire-decide"),
  ]);

  const checks: HealthResponse["checks"] = {
    analyzer_reachable: null,
    doctrine_manifest_age_hours: null,
    last_incident_seconds_ago: null,
    detection_registry_version: registry?.$schema_version ?? null,
    action_matrix_version: null,
    mode_summary: modeSummary,
    schema_versions: {
      decision: decisionV,
      incident: incidentV,
      evidence: evidenceV,
      detection: detectionV,
      wire_scan_file: wireScanFileV,
      wire_decide: wireDecideV,
    },
  };

  const requiredSchemas = [
    decisionV,
    incidentV,
    evidenceV,
    detectionV,
    wireScanFileV,
    wireDecideV,
  ];
  const allSchemasPresent = requiredSchemas.every((v) => v !== null);
  const status: HealthStatus = allSchemasPresent ? "ok" : "degraded";

  const body: HealthResponse = {
    status,
    tenant_id: TENANT_ID,
    checked_at: new Date().toISOString(),
    checks,
  };

  return NextResponse.json(body, { status: status === "ok" ? 200 : 503 });
}
