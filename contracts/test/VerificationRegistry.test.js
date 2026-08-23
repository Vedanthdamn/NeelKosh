const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");

const Ecosystem = { Mangrove: 0, Seagrass: 1, Saltmarsh: 2 };
const Status = { Active: 0, Suspended: 1 };
const SubmissionStatus = { None: 0, Pending: 1, Approved: 2, Rejected: 3, Issued: 4 };

const BOUNDARY = [
  [21_949_000, 88_900_000],
  [21_949_000, 88_950_000],
  [21_900_000, 88_950_000],
];

const VINTAGE = 2024;
const TONNES = 1500n;
const DATA_HASH = ethers.keccak256(ethers.toUtf8Bytes("mrv-report-sundarbans-2024"));

describe("VerificationRegistry", function () {
  async function deployFixture() {
    const [admin, registrar, implementer, verifier, otherVerifier, issuer, outsider] =
      await ethers.getSigners();

    const registry = await (await ethers.getContractFactory("ProjectRegistry")).deploy(admin.address);
    await registry.waitForDeployment();
    await registry.connect(admin).grantRole(await registry.REGISTRAR_ROLE(), registrar.address);
    await registry
      .connect(registrar)
      .registerProject("Sundarbans Mangrove Restoration", Ecosystem.Mangrove, implementer.address, BOUNDARY);

    const verification = await (
      await ethers.getContractFactory("VerificationRegistry")
    ).deploy(admin.address, await registry.getAddress());
    await verification.waitForDeployment();

    const VERIFIER_ROLE = await verification.VERIFIER_ROLE();
    const CREDIT_ISSUER_ROLE = await verification.CREDIT_ISSUER_ROLE();
    await verification.connect(admin).grantRole(VERIFIER_ROLE, verifier.address);
    await verification.connect(admin).grantRole(VERIFIER_ROLE, otherVerifier.address);
    // Stands in for the token contract so consumeApproval can be tested directly.
    await verification.connect(admin).grantRole(CREDIT_ISSUER_ROLE, issuer.address);

    return {
      registry,
      verification,
      admin,
      registrar,
      implementer,
      verifier,
      otherVerifier,
      issuer,
      outsider,
      VERIFIER_ROLE,
      CREDIT_ISSUER_ROLE,
    };
  }

  async function submittedFixture() {
    const base = await loadFixture(deployFixture);
    await base.verification
      .connect(base.implementer)
      .submitForVerification(1, VINTAGE, TONNES, DATA_HASH);
    return base;
  }

  async function approvedFixture() {
    const base = await submittedFixture();
    await base.verification.connect(base.verifier).approveVerification(1);
    return base;
  }

  describe("submission", function () {
    it("records a claim from the project implementer", async function () {
      const { verification, implementer } = await loadFixture(deployFixture);

      await expect(verification.connect(implementer).submitForVerification(1, VINTAGE, TONNES, DATA_HASH))
        .to.emit(verification, "VerificationSubmitted")
        .withArgs(1n, 1n, VINTAGE, implementer.address, TONNES, DATA_HASH, anyValue);

      expect(await verification.totalSubmissions()).to.equal(1n);
      expect(await verification.getActiveSubmission(1, VINTAGE)).to.equal(1n);
      expect(await verification.isReadyToMint(1, VINTAGE)).to.equal(false);

      const submission = await verification.getSubmission(1);
      expect(submission.projectId).to.equal(1n);
      expect(submission.vintage).to.equal(VINTAGE);
      expect(submission.claimedTonnes).to.equal(TONNES);
      expect(submission.dataHash).to.equal(DATA_HASH);
      expect(submission.submitter).to.equal(implementer.address);
      expect(submission.status).to.equal(SubmissionStatus.Pending);
      expect(submission.verifier).to.equal(ethers.ZeroAddress);
    });

    it("reverts when anyone other than the implementer submits", async function () {
      const { verification, outsider, verifier, implementer } = await loadFixture(deployFixture);

      await expect(verification.connect(outsider).submitForVerification(1, VINTAGE, TONNES, DATA_HASH))
        .to.be.revertedWithCustomError(verification, "NotProjectImplementer")
        .withArgs(outsider.address, implementer.address);

      // Holding VERIFIER_ROLE does not confer the right to file claims either.
      await expect(verification.connect(verifier).submitForVerification(1, VINTAGE, TONNES, DATA_HASH))
        .to.be.revertedWithCustomError(verification, "NotProjectImplementer")
        .withArgs(verifier.address, implementer.address);
    });

    it("reverts when the project is suspended", async function () {
      const { verification, registry, registrar, implementer } = await loadFixture(deployFixture);

      await registry.connect(registrar).setProjectStatus(1, Status.Suspended, "Under investigation");

      await expect(verification.connect(implementer).submitForVerification(1, VINTAGE, TONNES, DATA_HASH))
        .to.be.revertedWithCustomError(verification, "ProjectNotActive")
        .withArgs(1n);
    });

    it("reverts on a second claim for a period already under review", async function () {
      const { verification, implementer } = await submittedFixture();

      await expect(verification.connect(implementer).submitForVerification(1, VINTAGE, 9000n, DATA_HASH))
        .to.be.revertedWithCustomError(verification, "SubmissionAlreadyOpen")
        .withArgs(1n, SubmissionStatus.Pending);
    });

    it("allows separate claims for different vintages of the same project", async function () {
      const { verification, implementer } = await submittedFixture();

      await verification.connect(implementer).submitForVerification(1, 2025, 800n, DATA_HASH);

      expect(await verification.totalSubmissions()).to.equal(2n);
      expect(await verification.getActiveSubmission(1, 2025)).to.equal(2n);
    });

    it("rejects a missing data hash, zero tonnage and zero vintage", async function () {
      const { verification, implementer } = await loadFixture(deployFixture);

      await expect(
        verification.connect(implementer).submitForVerification(1, VINTAGE, TONNES, ethers.ZeroHash)
      ).to.be.revertedWithCustomError(verification, "EmptyDataHash");

      await expect(
        verification.connect(implementer).submitForVerification(1, VINTAGE, 0, DATA_HASH)
      ).to.be.revertedWithCustomError(verification, "ZeroTonnes");

      await expect(verification.connect(implementer).submitForVerification(1, 0, TONNES, DATA_HASH))
        .to.be.revertedWithCustomError(verification, "InvalidVintage")
        .withArgs(0n);
    });
  });

  describe("approval", function () {
    it("approves a pending claim and records the verifier", async function () {
      const { verification, verifier } = await submittedFixture();

      await expect(verification.connect(verifier).approveVerification(1))
        .to.emit(verification, "VerificationApproved")
        .withArgs(1n, 1n, VINTAGE, verifier.address, TONNES, DATA_HASH, anyValue);

      const submission = await verification.getSubmission(1);
      expect(submission.status).to.equal(SubmissionStatus.Approved);
      expect(submission.verifier).to.equal(verifier.address);
      expect(await verification.isReadyToMint(1, VINTAGE)).to.equal(true);
    });

    it("reverts when the caller lacks VERIFIER_ROLE", async function () {
      const { verification, outsider, implementer, VERIFIER_ROLE } = await submittedFixture();

      await expect(verification.connect(outsider).approveVerification(1))
        .to.be.revertedWithCustomError(verification, "AccessControlUnauthorizedAccount")
        .withArgs(outsider.address, VERIFIER_ROLE);

      // The project cannot approve its own claim.
      await expect(verification.connect(implementer).approveVerification(1))
        .to.be.revertedWithCustomError(verification, "AccessControlUnauthorizedAccount")
        .withArgs(implementer.address, VERIFIER_ROLE);

      expect(await verification.isReadyToMint(1, VINTAGE)).to.equal(false);
    });

    it("reverts when a verifier tries to approve their own submission", async function () {
      const { verification, registry, registrar, admin, verifier } = await loadFixture(deployFixture);

      // A project run by an address that also holds VERIFIER_ROLE must still not self-approve.
      await registry
        .connect(registrar)
        .registerProject("Verifier Owned Site", Ecosystem.Seagrass, verifier.address, BOUNDARY);
      await verification.connect(verifier).submitForVerification(2, VINTAGE, TONNES, DATA_HASH);

      await expect(verification.connect(verifier).approveVerification(1))
        .to.be.revertedWithCustomError(verification, "VerifierCannotBeSubmitter")
        .withArgs(verifier.address);
    });

    it("reverts when approving twice", async function () {
      const { verification, verifier, otherVerifier } = await approvedFixture();

      await expect(verification.connect(otherVerifier).approveVerification(1))
        .to.be.revertedWithCustomError(verification, "SubmissionNotPending")
        .withArgs(1n, SubmissionStatus.Approved);
    });

    it("reverts on an unknown submission id", async function () {
      const { verification, verifier } = await loadFixture(deployFixture);

      await expect(verification.connect(verifier).approveVerification(42))
        .to.be.revertedWithCustomError(verification, "SubmissionDoesNotExist")
        .withArgs(42n);
    });
  });

  describe("rejection", function () {
    it("rejects a claim and frees the period for resubmission", async function () {
      const { verification, verifier, implementer } = await submittedFixture();

      await expect(verification.connect(verifier).rejectVerification(1, "Imagery does not support extent"))
        .to.emit(verification, "VerificationRejected")
        .withArgs(1n, 1n, VINTAGE, verifier.address, "Imagery does not support extent", anyValue);

      expect((await verification.getSubmission(1)).status).to.equal(SubmissionStatus.Rejected);
      expect(await verification.getActiveSubmission(1, VINTAGE)).to.equal(0n);

      const correctedHash = ethers.keccak256(ethers.toUtf8Bytes("mrv-report-sundarbans-2024-rev2"));
      await verification.connect(implementer).submitForVerification(1, VINTAGE, 900n, correctedHash);

      // The rejected claim stays on the record alongside the replacement.
      expect(await verification.totalSubmissions()).to.equal(2n);
      expect(await verification.getActiveSubmission(1, VINTAGE)).to.equal(2n);
      expect((await verification.getSubmission(1)).status).to.equal(SubmissionStatus.Rejected);
    });

    it("requires a stated reason and VERIFIER_ROLE", async function () {
      const { verification, verifier, outsider, VERIFIER_ROLE } = await submittedFixture();

      await expect(
        verification.connect(verifier).rejectVerification(1, "")
      ).to.be.revertedWithCustomError(verification, "EmptyRejectionReason");

      await expect(verification.connect(outsider).rejectVerification(1, "No standing"))
        .to.be.revertedWithCustomError(verification, "AccessControlUnauthorizedAccount")
        .withArgs(outsider.address, VERIFIER_ROLE);
    });

    it("reverts when rejecting an already approved claim", async function () {
      const { verification, verifier } = await approvedFixture();

      await expect(verification.connect(verifier).rejectVerification(1, "Changed my mind"))
        .to.be.revertedWithCustomError(verification, "SubmissionNotPending")
        .withArgs(1n, SubmissionStatus.Approved);
    });
  });

  describe("consuming an approval", function () {
    it("returns the verifier and data hash, then marks the claim issued", async function () {
      const { verification, issuer, verifier } = await approvedFixture();

      await expect(verification.connect(issuer).consumeApproval(1, VINTAGE, TONNES))
        .to.emit(verification, "ApprovalConsumed")
        .withArgs(1n, 1n, VINTAGE, TONNES, issuer.address);

      const submission = await verification.getSubmission(1);
      expect(submission.status).to.equal(SubmissionStatus.Issued);
      // The approval record survives issuance so the auditor can still see who signed off.
      expect(submission.verifier).to.equal(verifier.address);
      expect(await verification.isReadyToMint(1, VINTAGE)).to.equal(false);
    });

    it("reverts when the caller lacks CREDIT_ISSUER_ROLE", async function () {
      const { verification, outsider, verifier, CREDIT_ISSUER_ROLE } = await approvedFixture();

      await expect(verification.connect(outsider).consumeApproval(1, VINTAGE, TONNES))
        .to.be.revertedWithCustomError(verification, "AccessControlUnauthorizedAccount")
        .withArgs(outsider.address, CREDIT_ISSUER_ROLE);

      // A verifier cannot burn through an approval either.
      await expect(verification.connect(verifier).consumeApproval(1, VINTAGE, TONNES))
        .to.be.revertedWithCustomError(verification, "AccessControlUnauthorizedAccount")
        .withArgs(verifier.address, CREDIT_ISSUER_ROLE);

      expect(await verification.isReadyToMint(1, VINTAGE)).to.equal(true);
    });

    it("reverts when the claim is only pending", async function () {
      const { verification, issuer } = await submittedFixture();

      await expect(verification.connect(issuer).consumeApproval(1, VINTAGE, TONNES))
        .to.be.revertedWithCustomError(verification, "NoApprovedSubmission")
        .withArgs(1n, VINTAGE);
    });

    it("reverts when consuming the same approval twice", async function () {
      const { verification, issuer } = await approvedFixture();

      await verification.connect(issuer).consumeApproval(1, VINTAGE, TONNES);

      await expect(verification.connect(issuer).consumeApproval(1, VINTAGE, TONNES))
        .to.be.revertedWithCustomError(verification, "CreditsAlreadyIssued")
        .withArgs(1n);
    });

    it("reverts when the tonnage does not match what was approved", async function () {
      const { verification, issuer } = await approvedFixture();

      await expect(verification.connect(issuer).consumeApproval(1, VINTAGE, TONNES + 1n))
        .to.be.revertedWithCustomError(verification, "TonnageMismatch")
        .withArgs(TONNES, TONNES + 1n);
    });

    it("blocks a fresh claim for a period whose credits were already issued", async function () {
      const { verification, issuer, implementer } = await approvedFixture();

      await verification.connect(issuer).consumeApproval(1, VINTAGE, TONNES);

      // Without this, a project could be paid twice for the same reporting period.
      await expect(verification.connect(implementer).submitForVerification(1, VINTAGE, 500n, DATA_HASH))
        .to.be.revertedWithCustomError(verification, "CreditsAlreadyIssued")
        .withArgs(1n);
    });
  });
});
