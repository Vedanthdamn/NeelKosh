import { ethers, network } from "hardhat";
import { deploySystem } from "./lib/deployContracts";
import { writeSharedOutputs } from "./lib/writeSharedOutputs";

const METADATA_URI =
  process.env.CREDIT_METADATA_URI || "https://registry.neelkosh.in/credits/{id}.json";

/**
 * Deploys the full contract system to a local Hardhat network and assigns each operational
 * role to a distinct funded account, rather than defaulting everything to the deployer. That
 * mirrors how the real system separates registrar, verifier and oracle keys, and it means
 * seed-demo-data.ts exercises the same access-control paths a real demo run would hit.
 *
 * Run against a persistent node (`npx hardhat node` in one terminal, this script with
 * --network localhost in another) so seed-demo-data.ts sees the same chain state afterwards.
 */
async function main() {
  const [deployer, registrar, verifier, oracle, , , , , , , platformTreasury, communityFund] =
    await ethers.getSigners();

  console.log(`Deploying to ${network.name} (chainId ${network.config.chainId})`);
  console.log(`  admin/deployer    ${deployer.address}`);
  console.log(`  registrar         ${registrar.address}`);
  console.log(`  verifier          ${verifier.address}`);
  console.log(`  oracle/minter     ${oracle.address}`);
  console.log(`  platform treasury ${platformTreasury.address}`);
  console.log(`  community fund    ${communityFund.address}`);

  const deployed = await deploySystem(
    deployer,
    {
      registrar: registrar.address,
      verifier: verifier.address,
      oracle: oracle.address,
      platformTreasury: platformTreasury.address,
      communityFund: communityFund.address,
    },
    METADATA_URI
  );

  console.log(`\nProjectRegistry       ${deployed.projectRegistryAddress}`);
  console.log(`VerificationRegistry  ${deployed.verificationRegistryAddress}`);
  console.log(`CarbonCreditToken     ${deployed.carbonCreditTokenAddress}`);
  console.log(`SimStablecoin         ${deployed.simStablecoinAddress}`);
  console.log(`Marketplace           ${deployed.marketplaceAddress}`);

  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  writeSharedOutputs(network.name, chainId, deployed);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
