// Mirrors User.role in schema.prisma. Order has no meaning — unlike the on-chain enums this
// codebase also mirrors (see utils/ecosystem.ts), role is never packed into a contract call, so
// there's no encoding to keep in sync.
export const ROLE_NAMES = ["NGO", "VERIFIER", "BUYER", "ADMIN"] as const;
export type RoleName = (typeof ROLE_NAMES)[number];

// ADMIN is deliberately excluded: anyone who can call an open registration endpoint could
// otherwise grant themselves the platform's most privileged role. There's no self-service path
// to ADMIN in this prototype — see routes/auth.ts's register handler.
export const SELF_REGISTERABLE_ROLES = ["NGO", "VERIFIER", "BUYER"] as const;
export type SelfRegisterableRole = (typeof SELF_REGISTERABLE_ROLES)[number];

export function isRoleName(value: string): value is RoleName {
  return (ROLE_NAMES as readonly string[]).includes(value);
}
