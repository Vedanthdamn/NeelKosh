import * as fs from "fs";
import * as path from "path";
import type { DeployedSystem } from "./deployContracts";

const SHARED_DIR = path.join(__dirname, "..", "..", "..", "shared");
const ADDRESSES_FILE = path.join(SHARED_DIR, "contract-addresses.json");
const ABIS_DIR = path.join(SHARED_DIR, "abis");
const ARTIFACTS_DIR = path.join(__dirname, "..", "..", "artifacts", "contracts");

const CONTRACT_NAMES = ["ProjectRegistry", "VerificationRegistry", "CarbonCreditToken"] as const;

interface NetworkDeploymentRecord {
  chainId: number;
  deployedAt: string;
  admin: string;
  contracts: {
    ProjectRegistry: string;
    VerificationRegistry: string;
    CarbonCreditToken: string;
  };
  roles: {
    registrar: string;
    verifier: string;
    oracle: string;
  };
  metadataUri: string;
}

type AddressesFile = Record<string, NetworkDeploymentRecord>;

/**
 * Records one network's deployment into the shared addresses file that the backend and
 * frontend read directly, and copies each contract's ABI alongside it.
 *
 * Keyed by network name rather than overwritten wholesale, so deploying to Amoy does not erase
 * the local Hardhat deployment a frontend dev still has open, and vice versa.
 */
export function writeSharedOutputs(
  networkName: string,
  chainId: number,
  deployed: DeployedSystem
): void {
  fs.mkdirSync(SHARED_DIR, { recursive: true });
  fs.mkdirSync(ABIS_DIR, { recursive: true });

  const existing: AddressesFile = fs.existsSync(ADDRESSES_FILE)
    ? JSON.parse(fs.readFileSync(ADDRESSES_FILE, "utf8"))
    : {};

  existing[networkName] = {
    chainId,
    deployedAt: new Date().toISOString(),
    admin: deployed.adminAddress,
    contracts: {
      ProjectRegistry: deployed.projectRegistryAddress,
      VerificationRegistry: deployed.verificationRegistryAddress,
      CarbonCreditToken: deployed.carbonCreditTokenAddress,
    },
    roles: deployed.roles,
    metadataUri: deployed.metadataUri,
  };

  fs.writeFileSync(ADDRESSES_FILE, `${JSON.stringify(existing, null, 2)}\n`);

  for (const name of CONTRACT_NAMES) {
    const artifactPath = path.join(ARTIFACTS_DIR, `${name}.sol`, `${name}.json`);
    const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
    fs.writeFileSync(
      path.join(ABIS_DIR, `${name}.json`),
      `${JSON.stringify(artifact.abi, null, 2)}\n`
    );
  }

  console.log(`\nWrote ${ADDRESSES_FILE}`);
  console.log(`Wrote ABIs to ${ABIS_DIR}`);
}
