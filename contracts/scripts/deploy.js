const { ethers, network } = require("hardhat");
const fs = require("fs");
const path = require("path");

const METADATA_URI =
  process.env.CREDIT_METADATA_URI || "https://registry.neelkosh.in/credits/{id}.json";

/**
 * Deploys the three NeelKosh contracts and wires the roles between them.
 *
 * The grant of CREDIT_ISSUER_ROLE to the token is the load-bearing step: without it the token
 * cannot consume approvals and every mint reverts, so it happens here rather than being left
 * as a manual post-deploy chore.
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  const admin = deployer.address;

  // Default the operational roles to the deployer so a fresh local chain is demo-ready in one
  // command. On a shared network these should be distinct keys.
  const oracle = process.env.ORACLE_ADDRESS || admin;
  const verifier = process.env.VERIFIER_ADDRESS || admin;
  const registrar = process.env.REGISTRAR_ADDRESS || admin;

  console.log(`Deploying to ${network.name} as ${admin}`);

  const projectRegistry = await (await ethers.getContractFactory("ProjectRegistry")).deploy(admin);
  await projectRegistry.waitForDeployment();
  const projectRegistryAddress = await projectRegistry.getAddress();
  console.log(`ProjectRegistry       ${projectRegistryAddress}`);

  const verificationRegistry = await (
    await ethers.getContractFactory("VerificationRegistry")
  ).deploy(admin, projectRegistryAddress);
  await verificationRegistry.waitForDeployment();
  const verificationRegistryAddress = await verificationRegistry.getAddress();
  console.log(`VerificationRegistry  ${verificationRegistryAddress}`);

  const carbonCreditToken = await (
    await ethers.getContractFactory("CarbonCreditToken")
  ).deploy(METADATA_URI, admin, projectRegistryAddress, verificationRegistryAddress);
  await carbonCreditToken.waitForDeployment();
  const carbonCreditTokenAddress = await carbonCreditToken.getAddress();
  console.log(`CarbonCreditToken     ${carbonCreditTokenAddress}`);

  await (
    await verificationRegistry.grantRole(
      await verificationRegistry.CREDIT_ISSUER_ROLE(),
      carbonCreditTokenAddress
    )
  ).wait();
  await (
    await verificationRegistry.grantRole(await verificationRegistry.VERIFIER_ROLE(), verifier)
  ).wait();
  await (await carbonCreditToken.grantRole(await carbonCreditToken.MINTER_ROLE(), oracle)).wait();
  if (registrar !== admin) {
    await (
      await projectRegistry.grantRole(await projectRegistry.REGISTRAR_ROLE(), registrar)
    ).wait();
  }

  console.log(`\nRoles granted: issuer=token, verifier=${verifier}, minter=${oracle}`);

  const deployment = {
    network: network.name,
    chainId: Number((await ethers.provider.getNetwork()).chainId),
    deployedAt: new Date().toISOString(),
    deployer: admin,
    contracts: {
      ProjectRegistry: projectRegistryAddress,
      VerificationRegistry: verificationRegistryAddress,
      CarbonCreditToken: carbonCreditTokenAddress,
    },
    roles: { registrar, verifier, oracle },
    metadataUri: METADATA_URI,
  };

  const outputDir = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, `${network.name}.json`);
  fs.writeFileSync(outputPath, `${JSON.stringify(deployment, null, 2)}\n`);
  console.log(`Wrote ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
