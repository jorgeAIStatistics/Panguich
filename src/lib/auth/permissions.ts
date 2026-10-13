export const ROLES = ["owner", "manager", "staff"] as const;
export type Role = (typeof ROLES)[number];

/**
 * Every protected thing someone can do in the owner workspace.
 * Checks happen on the server for every read and write; hiding a button is never the control.
 */
export const PERMISSIONS = [
  "today.view",
  // Catering
  "catering.view",
  "catering.manage", // change stage, notes, follow-ups, assignment, draft quotes, checklists
  "catering.fulfill", // tick production / packing / handoff checklist items
  "catering.quote.approve", // approve a quote version before it is shared
  "catering.deposit.record", // record that a deposit was requested or received (unverified)
  "catering.deposit.waive", // decide that no deposit is needed for an event
  // Growth
  "growth.view",
  "growth.edit", // draft and edit campaigns and creative
  "growth.approve", // approve content and any spend
  // Operations
  "operations.view", // see supplier invoices and financial exceptions
  "operations.act", // validate, dismiss, delegate an exception
  "operations.approve_dispute", // approve a supplier question / dispute
  // Settings & data
  "settings.view",
  "settings.manage",
  "data.export",
  "data.reset_demo",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const MATRIX: Record<Role, readonly Permission[]> = {
  owner: PERMISSIONS,
  manager: [
    "today.view",
    "catering.view",
    "catering.manage",
    "catering.fulfill",
    "catering.deposit.record",
    "growth.view",
    "growth.edit",
    "operations.view",
    "operations.act",
    "settings.view",
  ],
  // Staff help fulfill catering; they do not see financial documents or approve anything.
  staff: ["today.view", "catering.view", "catering.fulfill"],
};

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

export function can(role: Role, permission: Permission): boolean {
  return MATRIX[role].includes(permission);
}

export class PermissionError extends Error {
  readonly permission: Permission;
  readonly role: Role | null;
  constructor(permission: Permission, role: Role | null) {
    super(`Not allowed: ${permission}`);
    this.name = "PermissionError";
    this.permission = permission;
    this.role = role;
  }
}

/** Throws PermissionError unless the role holds the permission. */
export function assertCan(role: Role | null | undefined, permission: Permission): void {
  if (!role || !can(role, permission)) throw new PermissionError(permission, role ?? null);
}
