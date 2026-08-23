import * as crypto from "crypto";

/**
 * Pending Sign-In With Ethereum challenges, keyed by lowercased wallet address. In-memory and
 * single-process by design: a nonce only needs to survive the few seconds between issuing it and
 * the wallet signing it back, so there's no reason to give it a database row (or to care that a
 * restart clears every pending challenge — nothing was proven yet).
 *
 * This is a simplified SIWE-style scheme, not a full EIP-4361 implementation: the message below
 * carries an address, a nonce, and a timestamp, which is what actually matters for the
 * signature-proves-wallet-control property. Full EIP-4361 additionally binds the message to a
 * specific domain and chain ID, which matters once real wallet-connect UIs from arbitrary origins
 * are in play — out of scope for this backend-only prototype.
 */
const pendingNonces = new Map<string, { nonce: string; issuedAt: number }>();

const NONCE_TTL_MS = 5 * 60 * 1000;

export function issueNonce(walletAddress: string): { nonce: string; message: string } {
  const address = walletAddress.toLowerCase();
  const nonce = crypto.randomBytes(16).toString("hex");
  const issuedAt = Date.now();
  pendingNonces.set(address, { nonce, issuedAt });

  const message = buildMessage(address, nonce, issuedAt);
  return { nonce, message };
}

/** Reconstructs the exact message issueNonce would have produced, for signature verification. */
export function buildMessage(walletAddress: string, nonce: string, issuedAtMs: number): string {
  return [
    "Sign this message to authenticate with NeelKosh.",
    "",
    `Wallet: ${walletAddress.toLowerCase()}`,
    `Nonce: ${nonce}`,
    `Issued: ${new Date(issuedAtMs).toISOString()}`,
  ].join("\n");
}

/**
 * Consumes (and invalidates) the pending nonce for a wallet, returning the message it was issued
 * for — or null if there is none, it already expired, or it was already used. Single-use: a
 * signature that authenticated once should not authenticate again on replay.
 */
export function consumeNonce(walletAddress: string): { message: string } | null {
  const address = walletAddress.toLowerCase();
  const pending = pendingNonces.get(address);
  if (!pending) return null;

  pendingNonces.delete(address);

  if (Date.now() - pending.issuedAt > NONCE_TTL_MS) return null;

  return { message: buildMessage(address, pending.nonce, pending.issuedAt) };
}
