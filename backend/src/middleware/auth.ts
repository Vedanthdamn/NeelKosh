import type { NextFunction, Request, Response } from "express";
import { verifyAuthToken, type AuthTokenPayload } from "../utils/jwt";
import type { RoleName } from "../utils/roles";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthTokenPayload;
    }
  }
}

/**
 * Decodes a bearer token if one is present and attaches it as req.user. Never rejects a
 * request itself — most of the API (project listings, credit history, the public verify lookup)
 * is intentionally open to anyone, registered or not. Route handlers that do need authentication
 * layer requireAuth or requireRole on top of this.
 */
export function attachUser(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    const token = header.slice("Bearer ".length).trim();
    const payload = verifyAuthToken(token);
    if (payload) req.user = payload;
  }
  next();
}

/** Requires a valid session token, but not any particular role — used by /api/auth/register, where an unregistered wallet (role: null) is exactly the expected caller. */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    res.status(401).json({ error: "Sign in first — POST /api/auth/nonce, then /api/auth/verify." });
    return;
  }
  next();
}

/**
 * Requires a valid session token AND that the caller's role is one of the given roles. This is
 * an off-chain, API-level gate — it decides who may call this HTTP endpoint at all. It doesn't
 * replace the on-chain access control in the contracts themselves (VerificationRegistry's
 * VERIFIER_ROLE, ProjectRegistry's REGISTRAR_ROLE): those still independently enforce who may
 * actually approve or register on chain, regardless of what this middleware allows through.
 */
export function requireRole(roles: RoleName[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({ error: "Sign in first — POST /api/auth/nonce, then /api/auth/verify." });
      return;
    }
    if (!req.user.role || !roles.includes(req.user.role)) {
      res.status(403).json({ error: `This action requires role ${roles.join(" or ")}.` });
      return;
    }
    next();
  };
}
