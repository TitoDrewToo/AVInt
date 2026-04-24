/**
 * Smart Security — tenant configuration.
 *
 * Year 1: single tenant. Year 2: per-request resolution.
 * This file is the single point of change for that transition.
 */

export const TENANT_ID = "avint" as const;

export type TenantId = typeof TENANT_ID | string;

export function resolveTenantId(): TenantId {
  return TENANT_ID;
}
