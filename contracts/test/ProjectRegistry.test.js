const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");

const Ecosystem = { Mangrove: 0, Seagrass: 1, Saltmarsh: 2 };
const Status = { Active: 0, Suspended: 1 };

// A small polygon over the Sundarbans, in microdegrees.
const SUNDARBANS_BOUNDARY = [
  { latitudeE6: 21_949_000, longitudeE6: 88_900_000 },
  { latitudeE6: 21_949_000, longitudeE6: 88_950_000 },
  { latitudeE6: 21_900_000, longitudeE6: 88_950_000 },
  { latitudeE6: 21_900_000, longitudeE6: 88_900_000 },
];

const toTuples = (points) => points.map((p) => [p.latitudeE6, p.longitudeE6]);

describe("ProjectRegistry", function () {
  async function deployFixture() {
    const [admin, registrar, implementer, outsider] = await ethers.getSigners();

    const ProjectRegistry = await ethers.getContractFactory("ProjectRegistry");
    const registry = await ProjectRegistry.deploy(admin.address);
    await registry.waitForDeployment();

    const REGISTRAR_ROLE = await registry.REGISTRAR_ROLE();
    await registry.connect(admin).grantRole(REGISTRAR_ROLE, registrar.address);

    return { registry, admin, registrar, implementer, outsider, REGISTRAR_ROLE };
  }

  describe("registration", function () {
    it("registers a project and returns a sequential id", async function () {
      const { registry, registrar, implementer } = await loadFixture(deployFixture);

      await expect(
        registry
          .connect(registrar)
          .registerProject(
            "Sundarbans Mangrove Restoration",
            Ecosystem.Mangrove,
            implementer.address,
            toTuples(SUNDARBANS_BOUNDARY)
          )
      )
        .to.emit(registry, "ProjectRegistered")
        .withArgs(
          1n,
          implementer.address,
          Ecosystem.Mangrove,
          "Sundarbans Mangrove Restoration",
          4n,
          anyValue // block.timestamp is not predictable from the test
        );

      expect(await registry.totalProjects()).to.equal(1n);

      const project = await registry.getProject(1);
      expect(project.name).to.equal("Sundarbans Mangrove Restoration");
      expect(project.ecosystem).to.equal(Ecosystem.Mangrove);
      expect(project.implementer).to.equal(implementer.address);
      expect(project.status).to.equal(Status.Active);
      expect(await registry.isProjectActive(1)).to.equal(true);
    });

    it("stores the boundary polygon verbatim", async function () {
      const { registry, registrar, implementer } = await loadFixture(deployFixture);

      await registry
        .connect(registrar)
        .registerProject(
          "Sundarbans Mangrove Restoration",
          Ecosystem.Mangrove,
          implementer.address,
          toTuples(SUNDARBANS_BOUNDARY)
        );

      expect(await registry.getBoundaryPointCount(1)).to.equal(4n);

      const boundary = await registry.getProjectBoundary(1);
      expect(boundary.length).to.equal(4);
      boundary.forEach((point, i) => {
        expect(point.latitudeE6).to.equal(SUNDARBANS_BOUNDARY[i].latitudeE6);
        expect(point.longitudeE6).to.equal(SUNDARBANS_BOUNDARY[i].longitudeE6);
      });
    });

    it("issues distinct ids to successive projects", async function () {
      const { registry, registrar, implementer } = await loadFixture(deployFixture);

      await registry
        .connect(registrar)
        .registerProject("Site A", Ecosystem.Mangrove, implementer.address, toTuples(SUNDARBANS_BOUNDARY));
      await registry
        .connect(registrar)
        .registerProject("Site B", Ecosystem.Seagrass, implementer.address, toTuples(SUNDARBANS_BOUNDARY));

      expect(await registry.totalProjects()).to.equal(2n);
      expect((await registry.getProject(2)).name).to.equal("Site B");
      expect((await registry.getProject(2)).ecosystem).to.equal(Ecosystem.Seagrass);
    });
  });

  describe("registration access control", function () {
    it("reverts when a non-registrar tries to register a project", async function () {
      const { registry, outsider, implementer, REGISTRAR_ROLE } = await loadFixture(deployFixture);

      await expect(
        registry
          .connect(outsider)
          .registerProject(
            "Unauthorized Site",
            Ecosystem.Mangrove,
            implementer.address,
            toTuples(SUNDARBANS_BOUNDARY)
          )
      )
        .to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount")
        .withArgs(outsider.address, REGISTRAR_ROLE);

      expect(await registry.totalProjects()).to.equal(0n);
    });

    it("reverts when the implementing organisation tries to self-register", async function () {
      const { registry, implementer, REGISTRAR_ROLE } = await loadFixture(deployFixture);

      await expect(
        registry
          .connect(implementer)
          .registerProject(
            "Self Registered",
            Ecosystem.Mangrove,
            implementer.address,
            toTuples(SUNDARBANS_BOUNDARY)
          )
      )
        .to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount")
        .withArgs(implementer.address, REGISTRAR_ROLE);
    });
  });

  describe("input validation", function () {
    it("rejects a polygon with fewer than three vertices", async function () {
      const { registry, registrar, implementer } = await loadFixture(deployFixture);

      await expect(
        registry
          .connect(registrar)
          .registerProject(
            "Line Not Area",
            Ecosystem.Mangrove,
            implementer.address,
            toTuples(SUNDARBANS_BOUNDARY.slice(0, 2))
          )
      )
        .to.be.revertedWithCustomError(registry, "PolygonTooSmall")
        .withArgs(2n, 3n);
    });

    it("rejects coordinates outside the valid WGS84 range", async function () {
      const { registry, registrar, implementer } = await loadFixture(deployFixture);

      const badBoundary = [...SUNDARBANS_BOUNDARY];
      badBoundary[2] = { latitudeE6: 95_000_000, longitudeE6: 88_950_000 };

      await expect(
        registry
          .connect(registrar)
          .registerProject("Off Planet", Ecosystem.Mangrove, implementer.address, toTuples(badBoundary))
      )
        .to.be.revertedWithCustomError(registry, "CoordinateOutOfRange")
        .withArgs(95_000_000, 88_950_000);
    });

    it("rejects an empty name and a zero-address implementer", async function () {
      const { registry, registrar, implementer } = await loadFixture(deployFixture);

      await expect(
        registry
          .connect(registrar)
          .registerProject("", Ecosystem.Mangrove, implementer.address, toTuples(SUNDARBANS_BOUNDARY))
      ).to.be.revertedWithCustomError(registry, "EmptyProjectName");

      await expect(
        registry
          .connect(registrar)
          .registerProject("No Owner", Ecosystem.Mangrove, ethers.ZeroAddress, toTuples(SUNDARBANS_BOUNDARY))
      ).to.be.revertedWithCustomError(registry, "InvalidImplementer");
    });

    it("reverts when reading a project that was never registered", async function () {
      const { registry } = await loadFixture(deployFixture);

      await expect(registry.getProject(99))
        .to.be.revertedWithCustomError(registry, "ProjectDoesNotExist")
        .withArgs(99n);

      expect(await registry.isProjectActive(99)).to.equal(false);
    });
  });

  describe("status changes", function () {
    async function registeredFixture() {
      const base = await loadFixture(deployFixture);
      await base.registry
        .connect(base.registrar)
        .registerProject(
          "Sundarbans Mangrove Restoration",
          Ecosystem.Mangrove,
          base.implementer.address,
          toTuples(SUNDARBANS_BOUNDARY)
        );
      return base;
    }

    it("suspends and reinstates a project", async function () {
      const { registry, registrar } = await registeredFixture();

      await expect(registry.connect(registrar).setProjectStatus(1, Status.Suspended, "Audit failed"))
        .to.emit(registry, "ProjectStatusChanged")
        .withArgs(1n, Status.Active, Status.Suspended, registrar.address, "Audit failed");

      expect(await registry.isProjectActive(1)).to.equal(false);

      await registry.connect(registrar).setProjectStatus(1, Status.Active, "Remediation accepted");
      expect(await registry.isProjectActive(1)).to.equal(true);
    });

    it("reverts when a non-registrar tries to change status", async function () {
      const { registry, outsider, implementer, REGISTRAR_ROLE } = await registeredFixture();

      await expect(registry.connect(outsider).setProjectStatus(1, Status.Suspended, "Sabotage"))
        .to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount")
        .withArgs(outsider.address, REGISTRAR_ROLE);

      // The implementer must not be able to lift its own suspension.
      await expect(registry.connect(implementer).setProjectStatus(1, Status.Suspended, "Self serve"))
        .to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount")
        .withArgs(implementer.address, REGISTRAR_ROLE);
    });

    it("reverts on a no-op status change", async function () {
      const { registry, registrar } = await registeredFixture();

      await expect(registry.connect(registrar).setProjectStatus(1, Status.Active, "Already active"))
        .to.be.revertedWithCustomError(registry, "StatusUnchanged")
        .withArgs(Status.Active);
    });
  });
});
