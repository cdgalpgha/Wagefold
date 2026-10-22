/**
 * Who can do what. Each person signs in with their own wallet and holds one role per company.
 * The owner is the treasury wallet: funds only ever move from it, so only it can send payroll.
 */
export const ROLES = ["owner", "admin", "preparer", "viewer"] as const;
export type Role = (typeof ROLES)[number];
/** Roles the owner can give to someone else. There is exactly one owner: the treasury wallet. */
export const ASSIGNABLE_ROLES = ["admin", "preparer", "viewer"] as const;
export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

export type Action = "view" | "editPeople" | "prepare" | "approve" | "send" | "settings" | "team";

const MATRIX: Record<Action, readonly Role[]> = {
  view: ROLES,
  editPeople: ["owner", "admin", "preparer"],
  prepare: ["owner", "admin", "preparer"],
  approve: ["owner", "admin"],
  send: ["owner"],
  settings: ["owner", "admin"],
  team: ["owner"],
};

export function can(role: Role | null | undefined, action: Action): boolean {
  return !!role && MATRIX[action].includes(role);
}

export const ROLE_LABEL: Record<Role, string> = { owner: "Owner", admin: "Admin", preparer: "Preparer", viewer: "Viewer" };

export const ROLE_HELP: Record<Role, string> = {
  owner: "The treasury wallet. Sends approved payroll, manages the team and the approval rule.",
  admin: "Approves or rejects payroll before it can be sent. Can edit People and settings.",
  preparer: "Keeps People up to date and prepares payroll for approval. Can't approve or send.",
  viewer: "Read-only: history, invoices and exports. Useful for an accountant.",
};

export const MAX_APPROVALS = 5;
