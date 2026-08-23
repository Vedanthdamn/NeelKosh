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
