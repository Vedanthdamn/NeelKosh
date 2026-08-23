// Thin wrapper around the browser's injected EIP-1193 wallet (MetaMask or compatible). No
// wagmi/viem — this portal only ever needs "get the connected address" and "sign one message,"
// which ethers' BrowserProvider covers directly without an extra abstraction layer.

import { BrowserProvider } from "ethers";

export class NoWalletError extends Error {
  constructor() {
    super("No wallet extension found. Install MetaMask (or a compatible wallet) and reload this page.");
    this.name = "NoWalletError";
  }
}

function injectedProvider(): NonNullable<(typeof window)["ethereum"]> {
  if (typeof window === "undefined" || !window.ethereum) throw new NoWalletError();
  return window.ethereum;
}

/** Requests account access and returns the connected address, checksummed. */
export async function connectWallet(): Promise<string> {
  const provider = new BrowserProvider(injectedProvider());
  const accounts = (await provider.send("eth_requestAccounts", [])) as string[];
  if (!accounts[0]) throw new Error("Wallet connection was rejected.");
  return accounts[0];
}

/** Signs a plain message with the connected wallet's key (EIP-191 personal_sign) — what the
 *  backend's Sign-In With Ethereum verification (ethers.verifyMessage) expects on the other end. */
export async function signMessage(message: string): Promise<string> {
  const provider = new BrowserProvider(injectedProvider());
  const signer = await provider.getSigner();
  return signer.signMessage(message);
}

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
      on?: (event: string, handler: (...args: unknown[]) => void) => void;
      removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
    };
  }
}
