const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

const Ecosystem = { Mangrove: 0, Seagrass: 1, Saltmarsh: 2 };

const BOUNDARY = [
  [21_949_000, 88_900_000],
  [21_949_000, 88_950_000],
  [21_900_000, 88_950_000],
];

const VINTAGE = 2024;
const TONNES = 1_000n;
const PRICE_PER_TONNE = ethers.parseUnits("500", 18); // 500 NKR/tonne
const DATA_HASH = ethers.keccak256(ethers.toUtf8Bytes("mrv-report-marketplace-test"));
const URI = "https://registry.neelkosh.in/credits/{id}.json";

// Default revenue split: 85% NGO, 10% platform, 5% community.
const NGO_BPS = 8_500n;
const PLATFORM_BPS = 1_000n;
const COMMUNITY_BPS = 500n;

describe("Marketplace", function () {
  async function deployFixture() {
    const [admin, registrar, ngo, oracle, verifier, buyer, platformTreasury, communityFund, outsider] =
      await ethers.getSigners();

    const registry = await (await ethers.getContractFactory("ProjectRegistry")).deploy(admin.address);
    await registry.waitForDeployment();
    await registry.connect(admin).grantRole(await registry.REGISTRAR_ROLE(), registrar.address);
    await registry
      .connect(registrar)
      .registerProject("Sundarbans Mangrove Restoration", Ecosystem.Mangrove, ngo.address, BOUNDARY);

    const verification = await (await ethers.getContractFactory("MockVerificationRegistry")).deploy();
    await verification.waitForDeployment();
    await verification.setApproval(1, VINTAGE, TONNES, verifier.address, DATA_HASH);

    const creditToken = await (
      await ethers.getContractFactory("CarbonCreditToken")
    ).deploy(URI, admin.address, await registry.getAddress(), await verification.getAddress());
    await creditToken.waitForDeployment();
    await creditToken.connect(admin).grantRole(await creditToken.MINTER_ROLE(), oracle.address);
    await creditToken.connect(oracle).mintCredits(1, VINTAGE, TONNES, verifier.address);
    const tokenId = await creditToken.encodeTokenId(1, VINTAGE);

    const stablecoin = await (await ethers.getContractFactory("SimStablecoin")).deploy();
    await stablecoin.waitForDeployment();

    const marketplace = await (
      await ethers.getContractFactory("Marketplace")
    ).deploy(
      admin.address,
      await creditToken.getAddress(),
      await stablecoin.getAddress(),
      await registry.getAddress(),
      platformTreasury.address,
      communityFund.address,
      NGO_BPS,
      PLATFORM_BPS,
      COMMUNITY_BPS
    );
    await marketplace.waitForDeployment();

    await creditToken.connect(ngo).setApprovalForAll(await marketplace.getAddress(), true);

    return {
      registry,
      creditToken,
      stablecoin,
      marketplace,
      tokenId,
      admin,
      registrar,
      ngo,
      oracle,
      verifier,
      buyer,
      platformTreasury,
      communityFund,
      outsider,
    };
  }

  describe("deployment", function () {
    it("rejects a split that does not sum to 10,000 bps", async function () {
      const { creditToken, stablecoin, registry, admin, platformTreasury, communityFund } =
        await loadFixture(deployFixture);
      const Marketplace = await ethers.getContractFactory("Marketplace");

      await expect(
        Marketplace.deploy(
          admin.address,
          await creditToken.getAddress(),
          await stablecoin.getAddress(),
          await registry.getAddress(),
          platformTreasury.address,
          communityFund.address,
          9_000n,
          1_000n,
          500n // sums to 10,500
        )
      )
        .to.be.revertedWithCustomError(Marketplace, "InvalidSplit")
        .withArgs(10_500n);
    });

    it("rejects a zero address for any constructor role", async function () {
      const { creditToken, stablecoin, registry, admin, platformTreasury, communityFund } =
        await loadFixture(deployFixture);
      const Marketplace = await ethers.getContractFactory("Marketplace");

      await expect(
        Marketplace.deploy(
          admin.address,
          await creditToken.getAddress(),
          await stablecoin.getAddress(),
          await registry.getAddress(),
          ethers.ZeroAddress,
          communityFund.address,
          NGO_BPS,
          PLATFORM_BPS,
          COMMUNITY_BPS
        )
      ).to.be.revertedWithCustomError(Marketplace, "InvalidAddress");
    });
  });

  describe("listCredits", function () {
    it("escrows the credits and records a listing", async function () {
      const { marketplace, creditToken, tokenId, ngo } = await loadFixture(deployFixture);

      await expect(marketplace.connect(ngo).listCredits(tokenId, 400n, PRICE_PER_TONNE))
        .to.emit(marketplace, "CreditsListed")
        .withArgs(1n, tokenId, ngo.address, 400n, PRICE_PER_TONNE);

      expect(await creditToken.balanceOf(ngo.address, tokenId)).to.equal(TONNES - 400n);
      expect(await creditToken.balanceOf(await marketplace.getAddress(), tokenId)).to.equal(400n);

      const listing = await marketplace.getListing(1);
      expect(listing.tokenId).to.equal(tokenId);
      expect(listing.seller).to.equal(ngo.address);
      expect(listing.amount).to.equal(400n);
      expect(listing.pricePerTonne).to.equal(PRICE_PER_TONNE);
      expect(listing.active).to.equal(true);

      expect(await marketplace.totalListings()).to.equal(1n);
    });

    it("assigns sequential listing ids across multiple listings", async function () {
      const { marketplace, tokenId, ngo } = await loadFixture(deployFixture);

      await marketplace.connect(ngo).listCredits(tokenId, 100n, PRICE_PER_TONNE);
      await marketplace.connect(ngo).listCredits(tokenId, 200n, PRICE_PER_TONNE);

      expect(await marketplace.totalListings()).to.equal(2n);
      expect((await marketplace.getListing(2)).amount).to.equal(200n);
    });

    it("reverts when the caller is not the project's implementer", async function () {
      const { marketplace, tokenId, outsider, ngo } = await loadFixture(deployFixture);

      await expect(marketplace.connect(outsider).listCredits(tokenId, 100n, PRICE_PER_TONNE))
        .to.be.revertedWithCustomError(marketplace, "NotProjectImplementer")
        .withArgs(outsider.address, ngo.address);
    });

    it("reverts on a zero amount or zero price", async function () {
      const { marketplace, tokenId, ngo } = await loadFixture(deployFixture);

      await expect(
        marketplace.connect(ngo).listCredits(tokenId, 0n, PRICE_PER_TONNE)
      ).to.be.revertedWithCustomError(marketplace, "ZeroAmount");

      await expect(
        marketplace.connect(ngo).listCredits(tokenId, 100n, 0n)
      ).to.be.revertedWithCustomError(marketplace, "ZeroPrice");
    });

    it("reverts listing more than the seller holds", async function () {
      const { marketplace, creditToken, tokenId, ngo } = await loadFixture(deployFixture);

      await expect(
        marketplace.connect(ngo).listCredits(tokenId, TONNES + 1n, PRICE_PER_TONNE)
      ).to.be.revertedWithCustomError(creditToken, "ERC1155InsufficientBalance");
    });

    it("reverts querying an unknown listing", async function () {
      const { marketplace } = await loadFixture(deployFixture);

      await expect(marketplace.getListing(999))
        .to.be.revertedWithCustomError(marketplace, "ListingDoesNotExist")
        .withArgs(999n);
    });
  });
});
