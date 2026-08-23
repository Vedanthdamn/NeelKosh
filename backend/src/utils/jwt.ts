import * as crypto from "crypto";
import jwt from "jsonwebtoken";
import type { RoleName } from "./roles";

export interface AuthTokenPayload {
  walletAddress: string; // always lowercase
  userId: number | null; // null until the wallet has completed /api/auth/register
  role: RoleName | null;
}

/**
 * Secret used to sign session JWTs. If JWT_SECRET isn't set, one is generated at process start
 * instead of falling back to a fixed string baked into the repo — a hardcoded "demo secret"
 * would be exactly as bad as no secret at all, since it'd be public the moment this code is.
 * The cost is that every restart invalidates existing sessions, which is a non-issue here: this
 * backend already resets its whole SQLite DB on every demo boot (see scripts/start-demo.sh), so
 * "log in again after a restart" is already the expected flow.
 */
function resolveJwtSecret(): string {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  console.warn(
    "[auth] JWT_SECRET not set — generated an ephemeral secret for this process. " +
      "Sessions will not survive a restart. Set JWT_SECRET in .env for a stable secret."
  );
  return crypto.randomBytes(32).toString("hex");
}

const JWT_SECRET = resolveJwtSecret();
const JWT_EXPIRY = "24h";

export function signAuthToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRY });
}

/** Returns the decoded payload, or null for a missing, expired, or invalid token. */
export function verifyAuthToken(token: string): AuthTokenPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as AuthTokenPayload;
  } catch {
    return null;
  }
}
