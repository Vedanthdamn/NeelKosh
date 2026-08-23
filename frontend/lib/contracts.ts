// Direct on-chain access for the marketplace buy flow — reading balance/allowance, and sending
// the ERC-20 approve the buyer's own wallet must sign. Everything else (listing/purchase/faucet)
// goes through the backend API (lib/api.ts); this file exists only for the pieces that must
// happen as a real transaction from the connected wallet, not a backend-held key.
//
// Addresses and ABIs come straight from ../shared — the same files the contracts deploy scripts
// write and the backend reads at runtime — so this can never drift from what's actually deployed.

import { Contract, type ContractRunner } from "ethers";
import addressBook from "../../shared/contract-addresses.json";
import simStablecoinAbi from "../../shared/abis/SimStablecoin.json";
import marketplaceAbi from "../../shared/abis/Marketplace.json";

// This demo only ever deploys to one network at a time, whichever the backend is configured for
// (NEXT_PUBLIC_CHAIN_NETWORK mirrors backend's CHAIN_NETWORK) — the deployment isn't ambiguous
// the way a multi-chain app's would be.
const NETWORK = process.env.NEXT_PUBLIC_CHAIN_NETWORK === "amoy" ? "amoy" : "localhost";

type Deployment = {
  chainId: number;
  contracts: { SimStablecoin: string; Marketplace: string };
};

const deployment = (addressBook as Record<string, Deployment>)[NETWORK];
if (!deployment) {
  throw new Error(`No deployment recorded for network "${NETWORK}" in shared/contract-addresses.json.`);
}

export const expectedChainId = BigInt(deployment.chainId);
export const simStablecoinAddress = deployment.contracts.SimStablecoin;
export const marketplaceAddress = deployment.contracts.Marketplace;

export function simStablecoinContract(runner: ContractRunner): Contract {
  return new Contract(simStablecoinAddress, simStablecoinAbi, runner);
}

export function marketplaceContract(runner: ContractRunner): Contract {
  return new Contract(marketplaceAddress, marketplaceAbi, runner);
}
