import { ethers } from "ethers";
import { provider } from "./provider";
import { config } from "../config";

/**
 * Server-held wallets for the demo. Each corresponds to one on-chain role: the registrar signs
 * project registration, the verifier signs approvals, the oracle signs minting. Real deployments
 * would hold these keys in a KMS or HSM rather than a Node process; a hackathon backend holds
 * them directly, which is a scope call worth naming out loud rather than dressing up as more
 * secure than it is.
 */
export const registrarWallet = new ethers.Wallet(config.wallets.registrarPrivateKey, provider);
export const verifierWallet = new ethers.Wallet(config.wallets.verifierPrivateKey, provider);
export const oracleWallet = new ethers.Wallet(config.wallets.oraclePrivateKey, provider);

/**
 * A fixed pool of "implementer" (NGO) wallets this backend can sign on behalf of, standing in
 * for each project's own wallet for the demo. In production, submitForVerification and
 * retireCredits are signed client-side by the implementing organisation's own wallet (e.g. via
 * MetaMask) — this backend would never hold that key. Any implementer address outside this pool
 * is, correctly, one this backend cannot act for.
 */
export const implementerWallets = config.wallets.implementerPrivateKeys.map(
  (privateKey) => new ethers.Wallet(privateKey, provider)
);

const implementerWalletsByAddress = new Map(
  implementerWallets.map((wallet) => [wallet.address.toLowerCase(), wallet])
);

/** Returns the server-held wallet for an implementer address, or undefined if this backend doesn't hold its key. */
export function findImplementerWallet(address: string): ethers.Wallet | undefined {
  return implementerWalletsByAddress.get(address.toLowerCase());
}

/**
 * A fixed pool of "buyer" wallets this backend can sign on behalf of, the marketplace-side
 * counterpart to implementerWallets above — same demo affordance, same caveat: a production
 * buyer connects their own wallet client-side (MetaMask, WalletConnect) and signs
 * claimFaucet/buyCredits/approve themselves, rather than this backend holding their key.
 */
export const buyerWallets = config.wallets.buyerPrivateKeys.map(
  (privateKey) => new ethers.Wallet(privateKey, provider)
);

const buyerWalletsByAddress = new Map(buyerWallets.map((wallet) => [wallet.address.toLowerCase(), wallet]));

/** Returns the server-held wallet for a buyer address, or undefined if this backend doesn't hold its key. */
export function findBuyerWallet(address: string): ethers.Wallet | undefined {
  return buyerWalletsByAddress.get(address.toLowerCase());
}

/** Every wallet this backend can sign with, for retirement's "who currently holds this balance" lookup. */
export function allServerWallets(): ethers.Wallet[] {
  return [registrarWallet, verifierWallet, oracleWallet, ...implementerWallets, ...buyerWallets];
}

/**
 * Each server-held wallet gets exactly one NonceManager, reused for every transaction it ever
 * sends. Letting ethers auto-populate a nonce fresh per send (the default) intermittently
 * reverted with "nonce too low, expected N but got N-1" whenever the same wallet sent two
 * transactions close together — even across two separate HTTP requests seconds apart, not just
 * within one request — because the provider's own "pending" transaction-count query can return a
 * value taken just before the previous transaction's receipt actually landed. NonceManager mostly
 * sidesteps that by tracking the next nonce itself after its first query, incrementing locally
 * instead of asking the provider again on every send. A fresh instance per call would recreate
 * the same race (each one would re-query the provider from scratch), so this caches one per
 * wallet address and hands back the same instance every time.
 *
 * This alone doesn't cover every case, though: a buyer wallet is also signed for directly by
 * the connected browser wallet (the ERC-20 approve step — see routes/marketplace.ts), a
 * transaction this backend's NonceManager never sees. If that lands immediately before a
 * backend-signed send for the same address, the manager's very first "pending" query can itself
 * still return a stale count — the same race, just moved earlier. sendWithNonceRetry below is
 * the backstop for that: on the specific "nonce too low" failure, reset the manager (forcing a
 * fresh on-chain lookup) and retry once.
 */
const nonceManagers = new Map<string, ethers.NonceManager>();

export function nonceManagerFor(wallet: ethers.Wallet): ethers.NonceManager {
  const existing = nonceManagers.get(wallet.address);
  if (existing) return existing;
  const manager = new ethers.NonceManager(wallet);
  nonceManagers.set(wallet.address, manager);
  return manager;
}

function isStaleNonceError(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return code === "NONCE_EXPIRED";
}

/**
 * Sends a transaction (or runs any promise that sends one), retrying exactly once if it fails on
 * a stale nonce. `manager` is reset before the retry so the second attempt re-reads the nonce
 * from chain rather than reusing whatever the manager thought was next. Every route that signs
 * with a server-held wallet should send through this rather than calling the contract method
 * directly, since any of them can in principle race against another transaction from the same
 * address — this is the one place that knows how to recover instead of surfacing a raw
 * "nonce has already been used" error to the caller.
 */
export async function sendWithNonceRetry<T>(manager: ethers.NonceManager, send: () => Promise<T>): Promise<T> {
  try {
    return await send();
  } catch (error) {
    if (!isStaleNonceError(error)) throw error;
    manager.reset();
    return await send();
  }
}
