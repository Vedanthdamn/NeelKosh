import { ethers } from "ethers";
import * as fs from "fs";
import * as path from "path";
import { provider } from "./provider";
import { config } from "../config";
import { registrarWallet, verifierWallet, oracleWallet, nonceManagerFor } from "./wallets";

function loadAbi(contractName: string) {
  const abiPath = path.join(config.sharedDir, "abis", `${contractName}.json`);
  return JSON.parse(fs.readFileSync(abiPath, "utf8"));
}

const projectRegistryAbi = loadAbi("ProjectRegistry");
const verificationRegistryAbi = loadAbi("VerificationRegistry");
const carbonCreditTokenAbi = loadAbi("CarbonCreditToken");
const simStablecoinAbi = loadAbi("SimStablecoin");
const marketplaceAbi = loadAbi("Marketplace");

// Read-only instances, safe for any query. Role-bound instances below are the only way this
// backend sends state-changing transactions, and each is wired to exactly the wallet authorised
// for that action on chain.
export const projectRegistry = new ethers.Contract(config.contracts.ProjectRegistry, projectRegistryAbi, provider);
export const verificationRegistry = new ethers.Contract(
  config.contracts.VerificationRegistry,
  verificationRegistryAbi,
  provider
);
export const carbonCreditToken = new ethers.Contract(
  config.contracts.CarbonCreditToken,
  carbonCreditTokenAbi,
  provider
);
export const simStablecoin = new ethers.Contract(config.contracts.SimStablecoin, simStablecoinAbi, provider);
export const marketplace = new ethers.Contract(config.contracts.Marketplace, marketplaceAbi, provider);

// Connected via nonceManagerFor rather than the raw wallet — see wallets.ts for why sending two
// transactions from the same wallet without it can intermittently fail with a stale nonce.
export const projectRegistryAsRegistrar = projectRegistry.connect(nonceManagerFor(registrarWallet)) as ethers.Contract;
export const verificationRegistryAsVerifier = verificationRegistry.connect(nonceManagerFor(verifierWallet)) as ethers.Contract;
export const carbonCreditTokenAsOracle = carbonCreditToken.connect(nonceManagerFor(oracleWallet)) as ethers.Contract;
// Marketplace and SimStablecoin have no route-agnostic role-bound instance: listCredits signs as
// whichever implementer lists, and buyCredits/claimFaucet sign as whichever buyer calls — see
// routes/marketplace.ts, which connects the resolved per-request wallet itself.

export const abis = {
  ProjectRegistry: projectRegistryAbi,
  VerificationRegistry: verificationRegistryAbi,
  CarbonCreditToken: carbonCreditTokenAbi,
  SimStablecoin: simStablecoinAbi,
  Marketplace: marketplaceAbi,
};
