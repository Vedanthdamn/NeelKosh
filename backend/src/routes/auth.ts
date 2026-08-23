import { Router } from "express";
import { ethers } from "ethers";
import { z } from "zod";
import { prisma } from "../db";
import { validateBody } from "../middleware/validate";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";
import { issueNonce, consumeNonce } from "../services/nonceStore";
import { signAuthToken } from "../utils/jwt";
import { SELF_REGISTERABLE_ROLES, type RoleName } from "../utils/roles";

export const authRouter = Router();

const walletAddressSchema = z
  .string()
  .refine((value) => ethers.isAddress(value), "walletAddress must be a valid Ethereum address");

const nonceSchema = z.object({ walletAddress: walletAddressSchema });

const verifySchema = z.object({
  walletAddress: walletAddressSchema,
  signature: z.string().min(1),
});

const registerSchema = z.object({
  role: z.enum(SELF_REGISTERABLE_ROLES),
  organizationName: z.string().min(1).optional(),
});

function serializeUser(user: { id: number; walletAddress: string; role: string; organizationName: string | null; createdAt: Date }) {
  return {
    id: user.id,
    walletAddress: ethers.getAddress(user.walletAddress),
    role: user.role,
    organizationName: user.organizationName,
    createdAt: user.createdAt,
  };
}

/**
 * Step 1 of Sign-In With Ethereum: issues a one-time message for this wallet to sign. Proves
 * nothing on its own — anyone can request a nonce for any address — the actual authentication
 * happens at /verify, where only the real private key holder could have produced a valid
 * signature over this exact message.
 */
authRouter.post(
  "/nonce",
  validateBody(nonceSchema),
  asyncHandler(async (req, res) => {
    const { walletAddress } = req.body as z.infer<typeof nonceSchema>;
    const { message } = issueNonce(walletAddress);
    res.json({ message });
  })
);

/**
 * Step 2: verifies the wallet actually signed the nonce message issued above, using ecrecover
 * (via ethers' verifyMessage) rather than anything the caller asserts about themselves — the
 * recovered address either matches the claimed walletAddress or it doesn't. On success, issues a
 * session JWT. If this wallet has no User row yet, the token carries role: null and userId: null;
 * the frontend's next call is POST /api/auth/register, gated on this same token by requireAuth.
 */
authRouter.post(
  "/verify",
  validateBody(verifySchema),
  asyncHandler(async (req, res) => {
    const { walletAddress, signature } = req.body as z.infer<typeof verifySchema>;
    const address = walletAddress.toLowerCase();

    const pending = consumeNonce(address);
    if (!pending) {
      res.status(400).json({ error: "No pending nonce for this address (it may have expired) — request a new one from /api/auth/nonce." });
      return;
    }

    let recovered: string;
    try {
      recovered = ethers.verifyMessage(pending.message, signature);
    } catch {
      res.status(401).json({ error: "Malformed signature." });
      return;
    }

    if (recovered.toLowerCase() !== address) {
      res.status(401).json({ error: "Signature does not match the claimed wallet address." });
      return;
    }

    const user = await prisma.user.findUnique({ where: { walletAddress: address } });

    const token = signAuthToken({
      walletAddress: address,
      userId: user?.id ?? null,
      role: (user?.role as RoleName | undefined) ?? null,
    });

    res.json({
      token,
      registered: user !== null,
      user: user ? serializeUser(user) : null,
    });
  })
);

/**
 * First-time onboarding: an already-authenticated-but-unregistered wallet (see /verify above)
 * picks a role and organisation name. Requires a valid session token — proof of wallet control
 * already happened at /verify — but not any particular role, since an unregistered wallet's
 * role is null by definition. ADMIN is deliberately not a selectable option here; see
 * utils/roles.ts for why.
 */
authRouter.post(
  "/register",
  requireAuth,
  validateBody(registerSchema),
  asyncHandler(async (req, res) => {
    const { role, organizationName } = req.body as z.infer<typeof registerSchema>;
    const address = req.user!.walletAddress;

    const existing = await prisma.user.findUnique({ where: { walletAddress: address } });
    if (existing) {
      res.status(409).json({ error: "This wallet is already registered — use /api/auth/verify to sign in." });
      return;
    }

    const user = await prisma.user.create({
      data: { walletAddress: address, role, organizationName },
    });

    const token = signAuthToken({ walletAddress: address, userId: user.id, role: user.role as RoleName });

    res.status(201).json({ token, user: serializeUser(user) });
  })
);
