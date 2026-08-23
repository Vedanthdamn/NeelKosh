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

  describe("buyCredits", function () {
    // Kept low enough that a single 10,000 NKR faucet claim can buy out the whole 500t listing.
    const BUY_PRICE_PER_TONNE = ethers.parseUnits("10", 18); // 10 NKR/tonne

    async function listedFixture() {
      const base = await loadFixture(deployFixture);
      await base.marketplace.connect(base.ngo).listCredits(base.tokenId, 500n, BUY_PRICE_PER_TONNE);
      await base.stablecoin.connect(base.buyer).claimFaucet();
      return { ...base, listingId: 1n };
    }

    it("splits payment 3 ways, transfers credits, and emits the full breakdown", async function () {
      const { marketplace, creditToken, stablecoin, tokenId, listingId, buyer, ngo, platformTreasury, communityFund } =
        await listedFixture();

      const amount = 50n;
      const totalPrice = amount * BUY_PRICE_PER_TONNE;
      const ngoAmount = (totalPrice * NGO_BPS) / 10_000n;
      const platformAmount = (totalPrice * PLATFORM_BPS) / 10_000n;
      const communityAmount = totalPrice - ngoAmount - platformAmount;

      await stablecoin.connect(buyer).approve(await marketplace.getAddress(), totalPrice);

      await expect(marketplace.connect(buyer).buyCredits(listingId, amount))
        .to.emit(marketplace, "CreditsPurchased")
        .withArgs(
          listingId,
          tokenId,
          buyer.address,
          ngo.address,
          amount,
          totalPrice,
          ngoAmount,
          platformAmount,
          communityAmount
        );

      // The 3-way balance split is the load-bearing assertion here.
      expect(await stablecoin.balanceOf(ngo.address)).to.equal(ngoAmount);
      expect(await stablecoin.balanceOf(platformTreasury.address)).to.equal(platformAmount);
      expect(await stablecoin.balanceOf(communityFund.address)).to.equal(communityAmount);
      // No dust left behind: every wei of the payment landed with one of the three recipients.
      expect(ngoAmount + platformAmount + communityAmount).to.equal(totalPrice);

      expect(await creditToken.balanceOf(buyer.address, tokenId)).to.equal(amount);
      expect((await marketplace.getListing(listingId)).amount).to.equal(500n - amount);
    });

    it("reverts when the buyer has not approved the marketplace", async function () {
      const { marketplace, stablecoin, listingId, buyer } = await listedFixture();

      // No approve() call — the buyer holds faucet funds but never authorised the pull.
      await expect(marketplace.connect(buyer).buyCredits(listingId, 50n)).to.be.revertedWithCustomError(
        stablecoin,
        "ERC20InsufficientAllowance"
      );
    });

    it("reverts when the approval is smaller than the total price", async function () {
      const { marketplace, stablecoin, listingId, buyer } = await listedFixture();

      const amount = 50n;
      const totalPrice = amount * BUY_PRICE_PER_TONNE;
      await stablecoin.connect(buyer).approve(await marketplace.getAddress(), totalPrice - 1n);

      await expect(
        marketplace.connect(buyer).buyCredits(listingId, amount)
      ).to.be.revertedWithCustomError(stablecoin, "ERC20InsufficientAllowance");
    });

    it("allows buying the same listing across multiple purchases until it is exhausted", async function () {
      const { marketplace, creditToken, stablecoin, tokenId, listingId, buyer } = await listedFixture();

      await stablecoin.connect(buyer).approve(await marketplace.getAddress(), ethers.MaxUint256);

      await marketplace.connect(buyer).buyCredits(listingId, 200n);
      await marketplace.connect(buyer).buyCredits(listingId, 300n);

      expect((await marketplace.getListing(listingId)).amount).to.equal(0n);
      expect(await creditToken.balanceOf(buyer.address, tokenId)).to.equal(500n);
    });

    it("reverts buying more than remains in the listing", async function () {
      const { marketplace, stablecoin, listingId, buyer } = await listedFixture();

      await stablecoin.connect(buyer).approve(await marketplace.getAddress(), ethers.MaxUint256);

      await expect(marketplace.connect(buyer).buyCredits(listingId, 501n))
        .to.be.revertedWithCustomError(marketplace, "InsufficientListedAmount")
        .withArgs(listingId, 500n, 501n);
    });

    it("reverts buying a zero amount", async function () {
      const { marketplace, stablecoin, listingId, buyer } = await listedFixture();

      await stablecoin.connect(buyer).approve(await marketplace.getAddress(), ethers.MaxUint256);

      await expect(
        marketplace.connect(buyer).buyCredits(listingId, 0n)
      ).to.be.revertedWithCustomError(marketplace, "ZeroAmount");
    });

    it("reverts buying an unknown listing", async function () {
      const { marketplace, buyer } = await listedFixture();

      await expect(marketplace.connect(buyer).buyCredits(999, 1n))
        .to.be.revertedWithCustomError(marketplace, "ListingDoesNotExist")
        .withArgs(999n);
    });
  });
});
