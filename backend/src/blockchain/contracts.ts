import { ethers } from "ethers";
import * as fs from "fs";
import * as path from "path";
import { provider } from "./provider";
import { config } from "../config";
import { registrarWallet, verifierWallet, oracleWallet } from "./wallets";

function loadAbi(contractName: string) {
  const abiPath = path.join(config.sharedDir, "abis", `${contractName}.json`);
  return JSON.parse(fs.readFileSync(abiPath, "utf8"));
}

const projectRegistryAbi = loadAbi("ProjectRegistry");
const verificationRegistryAbi = loadAbi("VerificationRegistry");
const carbonCreditTokenAbi = loadAbi("CarbonCreditToken");

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

export const projectRegistryAsRegistrar = projectRegistry.connect(registrarWallet) as ethers.Contract;
export const verificationRegistryAsVerifier = verificationRegistry.connect(verifierWallet) as ethers.Contract;
export const carbonCreditTokenAsOracle = carbonCreditToken.connect(oracleWallet) as ethers.Contract;

export const abis = {
  ProjectRegistry: projectRegistryAbi,
  VerificationRegistry: verificationRegistryAbi,
  CarbonCreditToken: carbonCreditTokenAbi,
};
