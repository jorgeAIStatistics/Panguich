import type { DbOrTx } from "@/db/client";
import { auditLog, type AuditOutcome } from "@/db/schema";
import { assertCan, PermissionError, type Permission, type Role } from "./auth/permissions";

/** The person performing an action. `null` means a website visitor or the system. */
export type Actor = { id: string; role: Role } | null;

export type AuditEntry = {
  actor: Actor;
  action: string;
  permission?: Permission;
  entityType?: string;
  entityId?: string;
  outcome: AuditOutcome;
  detail?: Record<string, unknown>;
};

export async function writeAudit(db: DbOrTx, entry: AuditEntry): Promise<void> {
  await db.insert(auditLog).values({
    actorId: entry.actor?.id ?? null,
    actorRole: entry.actor?.role ?? null,
    action: entry.action,
    permission: entry.permission ?? null,
    entityType: entry.entityType ?? null,
    entityId: entry.entityId ?? null,
    outcome: entry.outcome,
    detail: entry.detail ?? null,
  });
}

/**
 * Checks a permission on the server and records a refusal in the audit log.
 * Call this at the top of every service function that reads or changes protected data:
 *   const who = await authorize(db, actor, "catering.manage", { action: "catering.status_change" });
 * Throws PermissionError when the actor is missing or lacks the permission.
 */
export async function authorize(
  db: DbOrTx,
  actor: Actor,
  permission: Permission,
  context: { action: string; entityType?: string; entityId?: string },
): Promise<{ id: string; role: Role }> {
  try {
    assertCan(actor?.role, permission);
  } catch (error) {
    if (error instanceof PermissionError) {
      await writeAudit(db, { actor, permission, outcome: "denied", ...context });
    }
    throw error;
  }
  return actor as { id: string; role: Role };
}
