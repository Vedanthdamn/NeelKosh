import { ethers, network } from "hardhat";
import { deploySystem } from "./lib/deployContracts";
import { writeSharedOutputs } from "./lib/writeSharedOutputs";

const METADATA_URI =
  process.env.CREDIT_METADATA_URI || "https://registry.neelkosh.in/credits/{id}.json";

/**
 * Deploys the full contract system to Polygon Amoy. The deployer key comes from
 * DEPLOYER_PRIVATE_KEY (see hardhat.config.js), loaded via dotenv from a local .env file that
 * is gitignored. Operational role addresses default to the deployer, since a testnet wallet
 * rarely has several funded accounts on hand; set them explicitly for anything beyond a demo.
 */
async function main() {
  if (network.name !== "amoy") {
    throw new Error(`Expected to run with --network amoy, got "${network.name}"`);
  }

  const [deployer] = await ethers.getSigners();
  if (!deployer) {
    throw new Error(
      "No signer available. Set DEPLOYER_PRIVATE_KEY in contracts/.env (see .env.example)."
    );
  }

  const registrar = process.env.REGISTRAR_ADDRESS || deployer.address;
  const verifier = process.env.VERIFIER_ADDRESS || deployer.address;
  const oracle = process.env.ORACLE_ADDRESS || deployer.address;

  console.log(`Deploying to ${network.name} (chainId ${network.config.chainId})`);
  console.log(`  admin/deployer  ${deployer.address}`);
  console.log(`  registrar       ${registrar}`);
  console.log(`  verifier        ${verifier}`);
  console.log(`  oracle/minter   ${oracle}`);

  const deployed = await deploySystem(deployer, { registrar, verifier, oracle }, METADATA_URI);

  console.log(`\nProjectRegistry       ${deployed.projectRegistryAddress}`);
  console.log(`VerificationRegistry  ${deployed.verificationRegistryAddress}`);
  console.log(`CarbonCreditToken     ${deployed.carbonCreditTokenAddress}`);

  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  writeSharedOutputs(network.name, chainId, deployed);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
