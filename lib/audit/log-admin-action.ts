import { db, schema } from "@/lib/db";

/**
 * Records an admin write for the audit trail (see schema comment on
 * adminAuditLog). Call this at the end of a mutating admin action, after
 * it has actually succeeded — never before, so a failed mutation doesn't
 * log a false "this happened."
 *
 * Fire-and-forget in spirit: a logging failure is swallowed (logged to
 * console, not thrown) so it can never turn a successful admin action into
 * a failed one. This is an accountability trail, not a security boundary —
 * unlike e.g. webhook signature checks, it must fail open.
 */
export async function logAdminAction(
  adminId: string,
  action: string,
  entityType: string,
  entityId: string | null,
  metadata?: Record<string, unknown>,
): Promise<void> {
  try {
    await db.insert(schema.adminAuditLog).values({
      adminId,
      action,
      entityType,
      entityId,
      metadata: metadata ?? null,
    });
  } catch (err) {
    console.error(
      `[audit-log] failed to record "${action}" on ${entityType}:${entityId ?? "?"}`,
      err,
    );
  }
}
