import { ethers } from "ethers";
import { config } from "../config";

// Passing chainId pins the provider to a static network, so a misconfigured RPC_URL that
// answers on the wrong chain fails fast with a network-mismatch error instead of quietly
// signing transactions against the wrong deployment.
export const provider = new ethers.JsonRpcProvider(config.rpcUrl, config.chainId);

// ethers' default polling interval (4s) is tuned for a public RPC endpoint, where polling every
// block would burn through rate limits for no real benefit. Against a local Hardhat node — free,
// on localhost, one new block per transaction — that default meant a purchase (or any state
// change) could take up to 4 seconds to show up anywhere that reads from event-sync's cache
// (GET /api/credits/:tokenId/history, in particular) after the transaction that caused it had
// already confirmed. Live-demo-visible lag, not just a cosmetic number. Amoy keeps the default:
// it's a real public testnet RPC, where the same aggressive interval would be the wrong tradeoff.
if (config.network === "localhost") {
  provider.pollingInterval = 250;
}
