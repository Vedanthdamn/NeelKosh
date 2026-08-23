const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

const Ecosystem = { Mangrove: 0, Seagrass: 1, Saltmarsh: 2 };
const Status = { Active: 0, Suspended: 1 };
const SubmissionStatus = { None: 0, Pending: 1, Approved: 2, Rejected: 3, Issued: 4 };

const BOUNDARY = [
  [21_949_000, 88_900_000],
  [21_949_000, 88_950_000],
  [21_900_000, 88_950_000],
  [21_900_000, 88_900_000],
];

const URI = "https://registry.neelkosh.in/credits/{id}.json";

const reportHash = (label) => ethers.keccak256(ethers.toUtf8Bytes(label));

/**
 * Exercises the three contracts wired together exactly as scripts/deploy.js wires them, with
 * no mocks. Each role is a distinct signer so that a missing access check shows up as a passing
 * transaction that should have reverted.
 */
describe("Blue carbon credit lifecycle", function () {
  async function deployedSystemFixture() {
    const [admin, registrar, verifier, oracle, ngo, corporateBuyer, outsider] =
      await ethers.getSigners();

    const projectRegistry = await (
      await ethers.getContractFactory("ProjectRegistry")
    ).deploy(admin.address);
    await projectRegistry.waitForDeployment();

    const verificationRegistry = await (
      await ethers.getContractFactory("VerificationRegistry")
    ).deploy(admin.address, await projectRegistry.getAddress());
    await verificationRegistry.waitForDeployment();

    const token = await (
      await ethers.getContractFactory("CarbonCreditToken")
    ).deploy(
      URI,
      admin.address,
      await projectRegistry.getAddress(),
      await verificationRegistry.getAddress()
    );
    await token.waitForDeployment();

    await projectRegistry.connect(admin).grantRole(
      await projectRegistry.REGISTRAR_ROLE(),
      registrar.address
    );
    await verificationRegistry.connect(admin).grantRole(
      await verificationRegistry.VERIFIER_ROLE(),
      verifier.address
    );
    // The token is the only holder of CREDIT_ISSUER_ROLE, so approvals can only be spent by it.
    await verificationRegistry.connect(admin).grantRole(
      await verificationRegistry.CREDIT_ISSUER_ROLE(),
      await token.getAddress()
    );
    await token.connect(admin).grantRole(await token.MINTER_ROLE(), oracle.address);

    return {
      projectRegistry,
      verificationRegistry,
      token,
      admin,
      registrar,
      verifier,
      oracle,
      ngo,
      corporateBuyer,
      outsider,
    };
  }

  it("carries a project from registration through issuance, sale and retirement", async function () {
    const {
      projectRegistry,
      verificationRegistry,
      token,
      registrar,
      verifier,
      oracle,
      ngo,
      corporateBuyer,
    } = await loadFixture(deployedSystemFixture);

    // 1. The registry onboards a restoration site run by an NGO.
    await projectRegistry
      .connect(registrar)
      .registerProject("Sundarbans Mangrove Restoration", Ecosystem.Mangrove, ngo.address, BOUNDARY);

    const projectId = 1n;
    expect(await projectRegistry.isProjectActive(projectId)).to.equal(true);
    expect(await projectRegistry.getImplementer(projectId)).to.equal(ngo.address);

    // 2. The NGO files its 2024 MRV claim, pinned to the archived report.
    const dataHash = reportHash("sundarbans-2024-mrv-report-v1");
    await verificationRegistry.connect(ngo).submitForVerification(projectId, 2024, 1500n, dataHash);
    expect(await verificationRegistry.isReadyToMint(projectId, 2024)).to.equal(false);

    // 3. An independent verifier signs off.
    await verificationRegistry.connect(verifier).approveVerification(1);
    expect(await verificationRegistry.isReadyToMint(projectId, 2024)).to.equal(true);

    // 4. The oracle bridge issues credits, which land with the NGO.
    const tokenId = await token.encodeTokenId(projectId, 2024);
    await token.connect(oracle).mintCredits(projectId, 2024, 1500n, verifier.address);

    expect(await token.balanceOf(ngo.address, tokenId)).to.equal(1500n);
    expect(await token.totalMinted(tokenId)).to.equal(1500n);
    expect(await verificationRegistry.isReadyToMint(projectId, 2024)).to.equal(false);
    expect((await verificationRegistry.getSubmission(1)).status).to.equal(SubmissionStatus.Issued);

    // The issued batch still points back at the exact report that justified it.
    const batch = await token.getBatch(tokenId);
    expect(batch.dataHash).to.equal(dataHash);
    expect(batch.verifier).to.equal(verifier.address);
    expect(batch.projectId).to.equal(projectId);

    // 5. The NGO sells part of the batch to a corporate buyer.
    await token.connect(ngo).safeTransferFrom(ngo.address, corporateBuyer.address, tokenId, 600n, "0x");
    expect(await token.balanceOf(ngo.address, tokenId)).to.equal(900n);
    expect(await token.balanceOf(corporateBuyer.address, tokenId)).to.equal(600n);
    expect(await token.circulatingSupply(tokenId)).to.equal(1500n);

    // 6. The buyer retires what it bought, permanently claiming the offset.
    await expect(
      token.connect(corporateBuyer).retireCredits(tokenId, 600n, "FY2024 scope 1 offset")
    ).to.emit(token, "RetirementRecord");

    expect(await token.balanceOf(corporateBuyer.address, tokenId)).to.equal(0n);
    expect(await token.totalRetired(tokenId)).to.equal(600n);
    expect(await token.circulatingSupply(tokenId)).to.equal(900n);
    // Issuance history is untouched by retirement.
    expect(await token.totalMinted(tokenId)).to.equal(1500n);

    const certificate = await token.getRetirement(0);
    expect(certificate.retiredBy).to.equal(corporateBuyer.address);
    expect(certificate.amount).to.equal(600n);
    expect(certificate.reason).to.equal("FY2024 scope 1 offset");

    // 7. Retired credits are gone: they cannot be sold on or claimed a second time.
    await expect(
      token
        .connect(corporateBuyer)
        .safeTransferFrom(corporateBuyer.address, ngo.address, tokenId, 1n, "0x")
    ).to.be.revertedWithCustomError(token, "ERC1155InsufficientBalance");

    await expect(token.connect(corporateBuyer).retireCredits(tokenId, 600n, "Claiming again"))
      .to.be.revertedWithCustomError(token, "InsufficientCredits")
      .withArgs(tokenId, 0n, 600n);
  });

  it("keeps vintages of the same project independent", async function () {
    const { projectRegistry, verificationRegistry, token, registrar, verifier, oracle, ngo } =
      await loadFixture(deployedSystemFixture);

    await projectRegistry
      .connect(registrar)
      .registerProject("Sundarbans Mangrove Restoration", Ecosystem.Mangrove, ngo.address, BOUNDARY);

    await verificationRegistry
      .connect(ngo)
      .submitForVerification(1, 2024, 1500n, reportHash("sundarbans-2024"));
    await verificationRegistry.connect(verifier).approveVerification(1);
    await token.connect(oracle).mintCredits(1, 2024, 1500n, verifier.address);

    // A second reporting period is a separate claim producing a separate batch.
    await verificationRegistry
      .connect(ngo)
      .submitForVerification(1, 2025, 2100n, reportHash("sundarbans-2025"));
    await verificationRegistry.connect(verifier).approveVerification(2);
    await token.connect(oracle).mintCredits(1, 2025, 2100n, verifier.address);

    const id2024 = await token.encodeTokenId(1, 2024);
    const id2025 = await token.encodeTokenId(1, 2025);
    expect(id2024).to.not.equal(id2025);
    expect(await token.balanceOf(ngo.address, id2024)).to.equal(1500n);
    expect(await token.balanceOf(ngo.address, id2025)).to.equal(2100n);

    // Retiring one vintage leaves the other untouched.
    await token.connect(ngo).retireCredits(id2024, 1500n, "Retiring the 2024 batch");
    expect(await token.circulatingSupply(id2024)).to.equal(0n);
    expect(await token.circulatingSupply(id2025)).to.equal(2100n);
  });

  it("keeps projects independent of one another", async function () {
    const {
      projectRegistry,
      verificationRegistry,
      token,
      registrar,
      verifier,
      oracle,
      ngo,
      corporateBuyer,
    } = await loadFixture(deployedSystemFixture);

    await projectRegistry
      .connect(registrar)
      .registerProject("Sundarbans Mangroves", Ecosystem.Mangrove, ngo.address, BOUNDARY);
    await projectRegistry
      .connect(registrar)
      .registerProject("Gulf of Mannar Seagrass", Ecosystem.Seagrass, corporateBuyer.address, BOUNDARY);

    // Each project's implementer may only file claims for their own site.
    await expect(
      verificationRegistry.connect(ngo).submitForVerification(2, 2024, 500n, reportHash("mannar-2024"))
    )
      .to.be.revertedWithCustomError(verificationRegistry, "NotProjectImplementer")
      .withArgs(ngo.address, corporateBuyer.address);

    await verificationRegistry
      .connect(ngo)
      .submitForVerification(1, 2024, 1500n, reportHash("sundarbans-2024"));
    await verificationRegistry
      .connect(corporateBuyer)
      .submitForVerification(2, 2024, 500n, reportHash("mannar-2024"));
    await verificationRegistry.connect(verifier).approveVerification(1);
    await verificationRegistry.connect(verifier).approveVerification(2);

    await token.connect(oracle).mintCredits(1, 2024, 1500n, verifier.address);
    await token.connect(oracle).mintCredits(2, 2024, 500n, verifier.address);

    expect(await token.balanceOf(ngo.address, await token.encodeTokenId(1, 2024))).to.equal(1500n);
    expect(
      await token.balanceOf(corporateBuyer.address, await token.encodeTokenId(2, 2024))
    ).to.equal(500n);
  });

  it("blocks issuance when any step of the chain of trust is missing", async function () {
    const {
      projectRegistry,
      verificationRegistry,
      token,
      registrar,
      verifier,
      oracle,
      ngo,
      outsider,
    } = await loadFixture(deployedSystemFixture);

    await projectRegistry
      .connect(registrar)
      .registerProject("Sundarbans Mangroves", Ecosystem.Mangrove, ngo.address, BOUNDARY);

    // Nothing submitted yet.
    await expect(token.connect(oracle).mintCredits(1, 2024, 1500n, verifier.address))
      .to.be.revertedWithCustomError(verificationRegistry, "NoApprovedSubmission")
      .withArgs(1n, 2024);

    // Submitted but not yet approved.
    await verificationRegistry
      .connect(ngo)
      .submitForVerification(1, 2024, 1500n, reportHash("sundarbans-2024"));
    await expect(token.connect(oracle).mintCredits(1, 2024, 1500n, verifier.address))
      .to.be.revertedWithCustomError(verificationRegistry, "NoApprovedSubmission")
      .withArgs(1n, 2024);

    // Approved, but the caller is not the oracle.
    await verificationRegistry.connect(verifier).approveVerification(1);
    await expect(token.connect(outsider).mintCredits(1, 2024, 1500n, verifier.address))
      .to.be.revertedWithCustomError(token, "AccessControlUnauthorizedAccount")
      .withArgs(outsider.address, await token.MINTER_ROLE());

    // Approved, but for a different tonnage than the oracle is trying to issue.
    await expect(token.connect(oracle).mintCredits(1, 2024, 5000n, verifier.address))
      .to.be.revertedWithCustomError(verificationRegistry, "TonnageMismatch")
      .withArgs(1500n, 5000n);

    // Everything correct: issuance succeeds.
    await token.connect(oracle).mintCredits(1, 2024, 1500n, verifier.address);
    expect(await token.totalMinted(await token.encodeTokenId(1, 2024))).to.equal(1500n);
  });

  it("stops a suspended project mid-flow without invalidating its existing credits", async function () {
    const { projectRegistry, verificationRegistry, token, registrar, verifier, oracle, ngo } =
      await loadFixture(deployedSystemFixture);

    await projectRegistry
      .connect(registrar)
      .registerProject("Sundarbans Mangroves", Ecosystem.Mangrove, ngo.address, BOUNDARY);

    await verificationRegistry
      .connect(ngo)
      .submitForVerification(1, 2024, 1500n, reportHash("sundarbans-2024"));
    await verificationRegistry.connect(verifier).approveVerification(1);
    await token.connect(oracle).mintCredits(1, 2024, 1500n, verifier.address);

    const id2024 = await token.encodeTokenId(1, 2024);

    // A dispute is raised and the registrar suspends the site.
    await verificationRegistry
      .connect(ngo)
      .submitForVerification(1, 2025, 2100n, reportHash("sundarbans-2025"));
    await verificationRegistry.connect(verifier).approveVerification(2);
    await projectRegistry.connect(registrar).setProjectStatus(1, Status.Suspended, "Boundary dispute");

    // Suspension stops new claims and stops issuance of already-approved ones.
    await expect(
      verificationRegistry.connect(ngo).submitForVerification(1, 2026, 100n, reportHash("s-2026"))
    )
      .to.be.revertedWithCustomError(verificationRegistry, "ProjectNotActive")
      .withArgs(1n);

    await expect(token.connect(oracle).mintCredits(1, 2025, 2100n, verifier.address))
      .to.be.revertedWithCustomError(token, "ProjectNotActive")
      .withArgs(1n);

    // Credits issued before the suspension stay valid and tradeable, which is the point of
    // suspending rather than deleting: buyers holding good credits are not punished.
    expect(await token.balanceOf(ngo.address, id2024)).to.equal(1500n);
    await token.connect(ngo).retireCredits(id2024, 100n, "Retiring during suspension");
    expect(await token.totalRetired(id2024)).to.equal(100n);

    // Once reinstated, the pending 2025 approval can still be issued.
    await projectRegistry.connect(registrar).setProjectStatus(1, Status.Active, "Dispute resolved");
    await token.connect(oracle).mintCredits(1, 2025, 2100n, verifier.address);
    expect(await token.balanceOf(ngo.address, await token.encodeTokenId(1, 2025))).to.equal(2100n);
  });

  it("cannot issue credits when the token was never granted the issuer role", async function () {
    const [admin, registrar, verifier, oracle, ngo] = await ethers.getSigners();

    const projectRegistry = await (
      await ethers.getContractFactory("ProjectRegistry")
    ).deploy(admin.address);
    await projectRegistry.waitForDeployment();

    const verificationRegistry = await (
      await ethers.getContractFactory("VerificationRegistry")
    ).deploy(admin.address, await projectRegistry.getAddress());
    await verificationRegistry.waitForDeployment();

    const token = await (
      await ethers.getContractFactory("CarbonCreditToken")
    ).deploy(
      URI,
      admin.address,
      await projectRegistry.getAddress(),
      await verificationRegistry.getAddress()
    );
    await token.waitForDeployment();

    await projectRegistry.connect(admin).grantRole(
      await projectRegistry.REGISTRAR_ROLE(),
      registrar.address
    );
    await verificationRegistry.connect(admin).grantRole(
      await verificationRegistry.VERIFIER_ROLE(),
      verifier.address
    );
    await token.connect(admin).grantRole(await token.MINTER_ROLE(), oracle.address);
    // CREDIT_ISSUER_ROLE deliberately not granted to the token.

    await projectRegistry
      .connect(registrar)
      .registerProject("Sundarbans Mangroves", Ecosystem.Mangrove, ngo.address, BOUNDARY);
    await verificationRegistry
      .connect(ngo)
      .submitForVerification(1, 2024, 1500n, reportHash("sundarbans-2024"));
    await verificationRegistry.connect(verifier).approveVerification(1);

    // A misconfigured deployment fails closed rather than minting unbacked credits.
    await expect(token.connect(oracle).mintCredits(1, 2024, 1500n, verifier.address))
      .to.be.revertedWithCustomError(verificationRegistry, "AccessControlUnauthorizedAccount")
      .withArgs(await token.getAddress(), await verificationRegistry.CREDIT_ISSUER_ROLE());
  });
});
