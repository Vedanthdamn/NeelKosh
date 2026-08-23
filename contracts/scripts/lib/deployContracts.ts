import { ethers } from "hardhat";
import type { Signer } from "ethers";

export interface DemoRoleAddresses {
  registrar: string;
  verifier: string;
  oracle: string;
  platformTreasury: string;
  communityFund: string;
}

/** Default marketplace revenue split: 85% NGO, 10% platform, 5% community. */
export const DEFAULT_SPLIT_BPS = {
  ngo: 8_500,
  platform: 1_000,
  community: 500,
};

export interface DeployedSystem {
  projectRegistryAddress: string;
  verificationRegistryAddress: string;
  carbonCreditTokenAddress: string;
  simStablecoinAddress: string;
  marketplaceAddress: string;
  adminAddress: string;
  roles: DemoRoleAddresses;
  metadataUri: string;
  splitBps: typeof DEFAULT_SPLIT_BPS;
}

/**
 * Deploys the full NeelKosh contract system — ProjectRegistry, VerificationRegistry,
 * CarbonCreditToken, SimStablecoin and Marketplace — and wires the roles between them. Shared
 * by deploy-local.ts and deploy-amoy.ts so the two networks can never drift apart on how the
 * contracts are supposed to be connected.
 *
 * Granting CREDIT_ISSUER_ROLE to the token is the step that makes mintCredits work at all —
 * without it every mint reverts against VerificationRegistry's access control, so it happens
 * here rather than being left as a manual post-deploy step someone can forget.
 */
export async function deploySystem(
  admin: Signer,
  roles: DemoRoleAddresses,
  metadataUri: string
): Promise<DeployedSystem> {
  const adminAddress = await admin.getAddress();

  const projectRegistry = await (
    await ethers.getContractFactory("ProjectRegistry", admin)
  ).deploy(adminAddress);
  await projectRegistry.waitForDeployment();
  const projectRegistryAddress = await projectRegistry.getAddress();

  const verificationRegistry = await (
    await ethers.getContractFactory("VerificationRegistry", admin)
  ).deploy(adminAddress, projectRegistryAddress);
  await verificationRegistry.waitForDeployment();
  const verificationRegistryAddress = await verificationRegistry.getAddress();

  const carbonCreditToken = await (
    await ethers.getContractFactory("CarbonCreditToken", admin)
  ).deploy(metadataUri, adminAddress, projectRegistryAddress, verificationRegistryAddress);
  await carbonCreditToken.waitForDeployment();
  const carbonCreditTokenAddress = await carbonCreditToken.getAddress();

  const simStablecoin = await (await ethers.getContractFactory("SimStablecoin", admin)).deploy();
  await simStablecoin.waitForDeployment();
  const simStablecoinAddress = await simStablecoin.getAddress();

  const marketplace = await (
    await ethers.getContractFactory("Marketplace", admin)
  ).deploy(
    adminAddress,
    carbonCreditTokenAddress,
    simStablecoinAddress,
    projectRegistryAddress,
    roles.platformTreasury,
    roles.communityFund,
    DEFAULT_SPLIT_BPS.ngo,
    DEFAULT_SPLIT_BPS.platform,
    DEFAULT_SPLIT_BPS.community
  );
  await marketplace.waitForDeployment();
  const marketplaceAddress = await marketplace.getAddress();

  await (
    await verificationRegistry
      .connect(admin)
      .grantRole(await verificationRegistry.CREDIT_ISSUER_ROLE(), carbonCreditTokenAddress)
  ).wait();
  await (
    await verificationRegistry
      .connect(admin)
      .grantRole(await verificationRegistry.VERIFIER_ROLE(), roles.verifier)
  ).wait();
  await (
    await carbonCreditToken.connect(admin).grantRole(await carbonCreditToken.MINTER_ROLE(), roles.oracle)
  ).wait();
  if (roles.registrar.toLowerCase() !== adminAddress.toLowerCase()) {
    await (
      await projectRegistry
        .connect(admin)
        .grantRole(await projectRegistry.REGISTRAR_ROLE(), roles.registrar)
    ).wait();
  }

  return {
    projectRegistryAddress,
    verificationRegistryAddress,
    carbonCreditTokenAddress,
    simStablecoinAddress,
    marketplaceAddress,
    adminAddress,
    roles,
    metadataUri,
    splitBps: DEFAULT_SPLIT_BPS,
  };
}
