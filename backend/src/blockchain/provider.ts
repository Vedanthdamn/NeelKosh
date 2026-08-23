import { ethers } from "ethers";
import { config } from "../config";

// Passing chainId pins the provider to a static network, so a misconfigured RPC_URL that
// answers on the wrong chain fails fast with a network-mismatch error instead of quietly
// signing transactions against the wrong deployment.
export const provider = new ethers.JsonRpcProvider(config.rpcUrl, config.chainId);
