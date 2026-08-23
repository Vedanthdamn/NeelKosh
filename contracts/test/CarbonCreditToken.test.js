const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");

const Ecosystem = { Mangrove: 0, Seagrass: 1, Saltmarsh: 2 };
const Status = { Active: 0, Suspended: 1 };

const BOUNDARY = [
  [21_949_000, 88_900_000],
  [21_949_000, 88_950_000],
  [21_900_000, 88_950_000],
];

const VINTAGE = 2024;
const TONNES = 1500n;
const DATA_HASH = ethers.keccak256(ethers.toUtf8Bytes("mrv-report-sundarbans-2024"));
const URI = "https://registry.neelkosh.in/credits/{id}.json";

describe("CarbonCreditToken", function () {
  // Uses the real ProjectRegistry but a mock verification gate, so these tests exercise the
  // token's own rules rather than the verification workflow.
  async function deployFixture() {
    const [admin, registrar, implementer, oracle, verifier, buyer, outsider] = await ethers.getSigners();

    const registry = await (await ethers.getContractFactory("ProjectRegistry")).deploy(admin.address);
    await registry.waitForDeployment();
    await registry.connect(admin).grantRole(await registry.REGISTRAR_ROLE(), registrar.address);
    await registry
      .connect(registrar)
      .registerProject("Sundarbans Mangrove Restoration", Ecosystem.Mangrove, implementer.address, BOUNDARY);

    const verification = await (await ethers.getContractFactory("MockVerificationRegistry")).deploy();
    await verification.waitForDeployment();

    const token = await (
      await ethers.getContractFactory("CarbonCreditToken")
    ).deploy(URI, admin.address, await registry.getAddress(), await verification.getAddress());
    await token.waitForDeployment();

    const MINTER_ROLE = await token.MINTER_ROLE();
    await token.connect(admin).grantRole(MINTER_ROLE, oracle.address);

    return {
      token,
      registry,
      verification,
      admin,
      registrar,
      implementer,
      oracle,
      verifier,
      buyer,
      outsider,
      MINTER_ROLE,
    };
  }

  async function approvedFixture() {
    const base = await loadFixture(deployFixture);
    await base.verification.setApproval(1, VINTAGE, TONNES, base.verifier.address, DATA_HASH);
    return base;
  }

  describe("token id packing", function () {
    it("round-trips a project id and vintage", async function () {
      const { token } = await loadFixture(deployFixture);

      const tokenId = await token.encodeTokenId(7, 2025);
      const [projectId, vintage] = await token.decodeTokenId(tokenId);

      expect(projectId).to.equal(7n);
      expect(vintage).to.equal(2025n);
    });

    it("gives the same project different ids across vintages", async function () {
      const { token } = await loadFixture(deployFixture);

      // The core reason for ERC-1155: same site, different year, different instrument.
      expect(await token.encodeTokenId(1, 2024)).to.not.equal(await token.encodeTokenId(1, 2025));
      expect(await token.encodeTokenId(1, 2024)).to.not.equal(await token.encodeTokenId(2, 2024));
    });

    it("rejects a zero vintage", async function () {
      const { token } = await loadFixture(deployFixture);

      await expect(token.encodeTokenId(1, 0))
        .to.be.revertedWithCustomError(token, "VintageOutOfRange")
        .withArgs(0n);
    });
  });

  describe("minting", function () {
    it("mints an approved batch to the implementing organisation", async function () {
      const { token, verification, oracle, verifier, implementer } = await approvedFixture();

      const tokenId = await token.encodeTokenId(1, VINTAGE);

      await expect(token.connect(oracle).mintCredits(1, VINTAGE, TONNES, verifier.address))
        .to.emit(token, "CreditsMinted")
        .withArgs(tokenId, 1n, VINTAGE, implementer.address, TONNES, verifier.address, DATA_HASH);

      // Credits land with the implementer, not the oracle that triggered the mint.
      expect(await token.balanceOf(implementer.address, tokenId)).to.equal(TONNES);
      expect(await token.balanceOf(oracle.address, tokenId)).to.equal(0n);

      expect(await token.totalMinted(tokenId)).to.equal(TONNES);
      expect(await token.totalRetired(tokenId)).to.equal(0n);
      expect(await token.circulatingSupply(tokenId)).to.equal(TONNES);

      const batch = await token.getBatch(tokenId);
      expect(batch.projectId).to.equal(1n);
      expect(batch.vintage).to.equal(VINTAGE);
      expect(batch.verifier).to.equal(verifier.address);
      expect(batch.dataHash).to.equal(DATA_HASH);

      expect(await verification.isReadyToMint(1, VINTAGE)).to.equal(false);
    });

    it("reverts when the caller lacks MINTER_ROLE", async function () {
      const { token, outsider, verifier, MINTER_ROLE } = await approvedFixture();

      await expect(token.connect(outsider).mintCredits(1, VINTAGE, TONNES, verifier.address))
        .to.be.revertedWithCustomError(token, "AccessControlUnauthorizedAccount")
        .withArgs(outsider.address, MINTER_ROLE);

      expect(await token.totalMinted(await token.encodeTokenId(1, VINTAGE))).to.equal(0n);
    });

    it("reverts when the implementer tries to mint its own credits", async function () {
      const { token, implementer, verifier, MINTER_ROLE } = await approvedFixture();

      await expect(token.connect(implementer).mintCredits(1, VINTAGE, TONNES, verifier.address))
        .to.be.revertedWithCustomError(token, "AccessControlUnauthorizedAccount")
        .withArgs(implementer.address, MINTER_ROLE);
    });

    it("reverts when no approval exists for the claim", async function () {
      const { token, verification, oracle, verifier } = await loadFixture(deployFixture);

      await expect(token.connect(oracle).mintCredits(1, VINTAGE, TONNES, verifier.address))
        .to.be.revertedWithCustomError(verification, "NotApproved")
        .withArgs(1n, VINTAGE);
    });

    it("reverts on a second mint against the same approval", async function () {
      const { token, verification, oracle, verifier } = await approvedFixture();

      await token.connect(oracle).mintCredits(1, VINTAGE, TONNES, verifier.address);

      await expect(token.connect(oracle).mintCredits(1, VINTAGE, TONNES, verifier.address))
        .to.be.revertedWithCustomError(verification, "AlreadyMinted")
        .withArgs(1n, VINTAGE);

      expect(await token.totalMinted(await token.encodeTokenId(1, VINTAGE))).to.equal(TONNES);
    });

    it("reverts when the minted tonnage differs from the approved tonnage", async function () {
      const { token, verification, oracle, verifier } = await approvedFixture();

      await expect(token.connect(oracle).mintCredits(1, VINTAGE, TONNES + 500n, verifier.address))
        .to.be.revertedWithCustomError(verification, "TonnageMismatch")
        .withArgs(TONNES, TONNES + 500n);
    });

    it("reverts when the named verifier is not the one that approved", async function () {
      const { token, oracle, outsider, verifier } = await approvedFixture();

      await expect(token.connect(oracle).mintCredits(1, VINTAGE, TONNES, outsider.address))
        .to.be.revertedWithCustomError(token, "VerifierMismatch")
        .withArgs(outsider.address, verifier.address);
    });

    it("reverts when the project was suspended after approval", async function () {
      const { token, registry, registrar, oracle, verifier } = await approvedFixture();

      await registry.connect(registrar).setProjectStatus(1, Status.Suspended, "Dispute raised");

      await expect(token.connect(oracle).mintCredits(1, VINTAGE, TONNES, verifier.address))
        .to.be.revertedWithCustomError(token, "ProjectNotActive")
        .withArgs(1n);
    });

    it("reverts on a zero tonnage mint", async function () {
      const { token, oracle, verifier } = await approvedFixture();

      await expect(
        token.connect(oracle).mintCredits(1, VINTAGE, 0, verifier.address)
      ).to.be.revertedWithCustomError(token, "ZeroAmount");
    });
  });

  describe("transfers", function () {
    it("moves credits between holders", async function () {
      const { token, oracle, verifier, implementer, buyer } = await approvedFixture();
      const tokenId = await token.encodeTokenId(1, VINTAGE);

      await token.connect(oracle).mintCredits(1, VINTAGE, TONNES, verifier.address);
      await token
        .connect(implementer)
        .safeTransferFrom(implementer.address, buyer.address, tokenId, 400n, "0x");

      expect(await token.balanceOf(implementer.address, tokenId)).to.equal(TONNES - 400n);
      expect(await token.balanceOf(buyer.address, tokenId)).to.equal(400n);
      // Trading moves credits but never changes how many exist.
      expect(await token.circulatingSupply(tokenId)).to.equal(TONNES);
    });
  });

  describe("retirement", function () {
    async function mintedFixture() {
      const base = await approvedFixture();
      await base.token.connect(base.oracle).mintCredits(1, VINTAGE, TONNES, base.verifier.address);
      base.tokenId = await base.token.encodeTokenId(1, VINTAGE);
      return base;
    }

    it("burns the credits and writes a permanent certificate", async function () {
      const { token, implementer, tokenId } = await mintedFixture();

      await expect(token.connect(implementer).retireCredits(tokenId, 500n, "Offsetting FY24 scope 1"))
        .to.emit(token, "RetirementRecord")
        .withArgs(0n, tokenId, implementer.address, 500n, "Offsetting FY24 scope 1", anyValue);

      expect(await token.balanceOf(implementer.address, tokenId)).to.equal(TONNES - 500n);
      expect(await token.totalRetired(tokenId)).to.equal(500n);
      expect(await token.circulatingSupply(tokenId)).to.equal(TONNES - 500n);
      // Minted total is history and must not shrink when credits are retired.
      expect(await token.totalMinted(tokenId)).to.equal(TONNES);

      expect(await token.retirementCount()).to.equal(1n);
      const record = await token.getRetirement(0);
      expect(record.tokenId).to.equal(tokenId);
      expect(record.amount).to.equal(500n);
      expect(record.retiredBy).to.equal(implementer.address);
      expect(record.reason).to.equal("Offsetting FY24 scope 1");
    });

    it("reverts when the same credits are retired twice", async function () {
      const { token, implementer, buyer, tokenId } = await mintedFixture();

      await token.connect(implementer).safeTransferFrom(implementer.address, buyer.address, tokenId, 100n, "0x");

      await token.connect(buyer).retireCredits(tokenId, 100n, "Offsetting a flight");

      // The buyer's entire holding is now burned, so retiring it again has nothing to consume.
      await expect(token.connect(buyer).retireCredits(tokenId, 100n, "Double claiming"))
        .to.be.revertedWithCustomError(token, "InsufficientCredits")
        .withArgs(tokenId, 0n, 100n);

      expect(await token.totalRetired(tokenId)).to.equal(100n);
      expect(await token.retirementCount()).to.equal(1n);
    });

    it("reverts when retired credits are transferred afterwards", async function () {
      const { token, implementer, buyer, tokenId } = await mintedFixture();

      await token.connect(implementer).retireCredits(tokenId, TONNES, "Full batch retirement");

      await expect(
        token.connect(implementer).safeTransferFrom(implementer.address, buyer.address, tokenId, 1n, "0x")
      ).to.be.revertedWithCustomError(token, "ERC1155InsufficientBalance");

      expect(await token.circulatingSupply(tokenId)).to.equal(0n);
    });

    it("reverts when retiring more than the caller holds", async function () {
      const { token, buyer, tokenId } = await mintedFixture();

      await expect(token.connect(buyer).retireCredits(tokenId, 1n, "Nothing to retire"))
        .to.be.revertedWithCustomError(token, "InsufficientCredits")
        .withArgs(tokenId, 0n, 1n);
    });

    it("requires a stated reason and a non-zero amount", async function () {
      const { token, implementer, tokenId } = await mintedFixture();

      await expect(
        token.connect(implementer).retireCredits(tokenId, 100n, "")
      ).to.be.revertedWithCustomError(token, "EmptyRetirementReason");

      await expect(
        token.connect(implementer).retireCredits(tokenId, 0n, "No amount")
      ).to.be.revertedWithCustomError(token, "ZeroAmount");
    });

    it("numbers certificates sequentially across holders and batches", async function () {
      const { token, implementer, buyer, tokenId } = await mintedFixture();

      await token.connect(implementer).safeTransferFrom(implementer.address, buyer.address, tokenId, 200n, "0x");
      await token.connect(implementer).retireCredits(tokenId, 300n, "First");
      await token.connect(buyer).retireCredits(tokenId, 200n, "Second");

      expect(await token.retirementCount()).to.equal(2n);
      expect((await token.getRetirement(1)).retiredBy).to.equal(buyer.address);
      expect(await token.totalRetired(tokenId)).to.equal(500n);

      await expect(token.getRetirement(2))
        .to.be.revertedWithCustomError(token, "RetirementDoesNotExist")
        .withArgs(2n);
    });
  });

  describe("metadata", function () {
    it("exposes the URI template and lets an authorised setter change it", async function () {
      const { token, admin, outsider } = await loadFixture(deployFixture);

      expect(await token.uri(1)).to.equal(URI);

      await token.connect(admin).setURI("ipfs://newcid/{id}.json");
      expect(await token.uri(1)).to.equal("ipfs://newcid/{id}.json");

      await expect(
        token.connect(outsider).setURI("ipfs://malicious/{id}.json")
      ).to.be.revertedWithCustomError(token, "AccessControlUnauthorizedAccount");
    });
  });
});
