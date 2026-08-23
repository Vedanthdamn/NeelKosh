const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");

const FAUCET_AMOUNT = 10_000n * 10n ** 18n;
const FAUCET_COOLDOWN = 24 * 60 * 60;

describe("SimStablecoin", function () {
  async function deployFixture() {
    const [alice, bob] = await ethers.getSigners();

    const stablecoin = await (await ethers.getContractFactory("SimStablecoin")).deploy();
    await stablecoin.waitForDeployment();

    return { stablecoin, alice, bob };
  }

  it("has the expected name, symbol and starts with no supply", async function () {
    const { stablecoin } = await loadFixture(deployFixture);

    expect(await stablecoin.name()).to.equal("NeelKosh Rupee");
    expect(await stablecoin.symbol()).to.equal("NKR");
    expect(await stablecoin.totalSupply()).to.equal(0n);
  });

  it("mints FAUCET_AMOUNT to the caller on first claim", async function () {
    const { stablecoin, alice } = await loadFixture(deployFixture);

    await expect(stablecoin.connect(alice).claimFaucet())
      .to.emit(stablecoin, "FaucetClaimed")
      .withArgs(alice.address, FAUCET_AMOUNT, anyValue);

    expect(await stablecoin.balanceOf(alice.address)).to.equal(FAUCET_AMOUNT);
    expect(await stablecoin.totalSupply()).to.equal(FAUCET_AMOUNT);
  });

  it("tracks cooldowns independently per address", async function () {
    const { stablecoin, alice, bob } = await loadFixture(deployFixture);

    await stablecoin.connect(alice).claimFaucet();
    await stablecoin.connect(bob).claimFaucet();

    expect(await stablecoin.balanceOf(alice.address)).to.equal(FAUCET_AMOUNT);
    expect(await stablecoin.balanceOf(bob.address)).to.equal(FAUCET_AMOUNT);
  });

  it("reverts a second claim within the cooldown window", async function () {
    const { stablecoin, alice } = await loadFixture(deployFixture);

    await stablecoin.connect(alice).claimFaucet();
    const lastClaim = await stablecoin.lastFaucetClaim(alice.address);

    await expect(stablecoin.connect(alice).claimFaucet())
      .to.be.revertedWithCustomError(stablecoin, "FaucetCooldownActive")
      .withArgs(alice.address, lastClaim + BigInt(FAUCET_COOLDOWN));

    // The reverted claim must not have minted anything.
    expect(await stablecoin.balanceOf(alice.address)).to.equal(FAUCET_AMOUNT);
  });

  it("allows a new claim once the cooldown has elapsed", async function () {
    const { stablecoin, alice } = await loadFixture(deployFixture);

    await stablecoin.connect(alice).claimFaucet();
    await time.increase(FAUCET_COOLDOWN);

    await stablecoin.connect(alice).claimFaucet();

    expect(await stablecoin.balanceOf(alice.address)).to.equal(FAUCET_AMOUNT * 2n);
  });
});
