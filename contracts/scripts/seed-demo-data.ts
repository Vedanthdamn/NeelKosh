import * as fs from "fs";
import * as path from "path";
import { ethers, network } from "hardhat";
import type { ContractTransactionReceipt, Log } from "ethers";

const Ecosystem = { Mangrove: 0, Seagrass: 1, Saltmarsh: 2 } as const;

const ADDRESSES_FILE = path.join(__dirname, "..", "..", "shared", "contract-addresses.json");

/**
 * Demo restoration sites at real Indian mangrove coastlines, so the dashboard has recognisable
 * places to point at instead of "Project #1". Boundaries are small rectangles (~2km) around
 * each site's approximate public coordinates — illustrative for the demo, not a surveyed
 * project boundary.
 *
 * dataHash values below are keccak256 hashes of placeholder strings, not of any real MRV
 * report — there is no off-chain verification pipeline behind this demo data. That is called
 * out again at the point they're hashed.
 */
const DEMO_PROJECTS = [
  {
    name: "Sundarbans Mangrove Restoration, West Bengal",
    ecosystem: Ecosystem.Mangrove,
    center: { lat: 21.9497, lng: 88.9468 },
    implementerIndex: 4,
    submissions: [
      { vintage: 2023, tonnesCO2: 1850 },
      { vintage: 2024, tonnesCO2: 2100 },
    ],
  },
  {
    name: "Pichavaram Mangrove Restoration, Tamil Nadu",
    ecosystem: Ecosystem.Mangrove,
    center: { lat: 11.4306, lng: 79.7728 },
    implementerIndex: 5,
    submissions: [
      { vintage: 2023, tonnesCO2: 620 },
      { vintage: 2024, tonnesCO2: 780 },
    ],
  },
  {
    name: "Bhitarkanika Mangrove Restoration, Odisha",
    ecosystem: Ecosystem.Mangrove,
    center: { lat: 20.7191, lng: 86.899 },
    implementerIndex: 6,
    submissions: [{ vintage: 2023, tonnesCO2: 1340 }],
  },
  {
    name: "Gulf of Kutch Mangrove Restoration, Gujarat",
    ecosystem: Ecosystem.Mangrove,
    center: { lat: 22.4707, lng: 69.1082 },
    implementerIndex: 7,
    submissions: [{ vintage: 2023, tonnesCO2: 410 }],
  },
];

const DEGREE_TO_E6 = 1_000_000;
const HALF_EXTENT_DEG = 0.02;

function squareBoundary(center: { lat: number; lng: number }): [number, number][] {
  const latE6 = Math.round(center.lat * DEGREE_TO_E6);
  const lngE6 = Math.round(center.lng * DEGREE_TO_E6);
  const halfE6 = Math.round(HALF_EXTENT_DEG * DEGREE_TO_E6);

  return [
    [latE6 + halfE6, lngE6 - halfE6],
    [latE6 + halfE6, lngE6 + halfE6],
    [latE6 - halfE6, lngE6 + halfE6],
    [latE6 - halfE6, lngE6 - halfE6],
  ];
}

function logEvents(receipt: ContractTransactionReceipt | null, contracts: { address: string; iface: any; label: string }[]) {
  if (!receipt) return;
  for (const log of receipt.logs as Log[]) {
    const contract = contracts.find((c) => c.address.toLowerCase() === log.address.toLowerCase());
    if (!contract) continue;
    try {
      const parsed = contract.iface.parseLog(log);
      if (parsed) console.log(`    event ${contract.label}.${parsed.name}`);
    } catch {
      // Log from an interface we're not tracking; skip.
    }
  }
}

async function main() {
  if (!fs.existsSync(ADDRESSES_FILE)) {
    throw new Error(
      `${ADDRESSES_FILE} not found. Run deploy-local.ts (or deploy-amoy.ts) first.`
    );
  }
  const addressBook = JSON.parse(fs.readFileSync(ADDRESSES_FILE, "utf8"));
  const deployment = addressBook[network.name];
  if (!deployment) {
    throw new Error(
      `No deployment recorded for network "${network.name}" in ${ADDRESSES_FILE}. Deploy to this network first.`
    );
  }

  const signers = await ethers.getSigners();
  const registrar = signers[1];
  const verifier = signers[2];
  const oracle = signers[3];

  const projectRegistry = await ethers.getContractAt(
    "ProjectRegistry",
    deployment.contracts.ProjectRegistry
  );
  const verificationRegistry = await ethers.getContractAt(
    "VerificationRegistry",
    deployment.contracts.VerificationRegistry
  );
  const carbonCreditToken = await ethers.getContractAt(
    "CarbonCreditToken",
    deployment.contracts.CarbonCreditToken
  );

  const trackedContracts = [
    { address: deployment.contracts.ProjectRegistry, iface: projectRegistry.interface, label: "ProjectRegistry" },
    {
      address: deployment.contracts.VerificationRegistry,
      iface: verificationRegistry.interface,
      label: "VerificationRegistry",
    },
    { address: deployment.contracts.CarbonCreditToken, iface: carbonCreditToken.interface, label: "CarbonCreditToken" },
  ];

  console.log(`Seeding demo data on ${network.name}`);
  console.log(`  registrar  ${registrar.address}`);
  console.log(`  verifier   ${verifier.address}`);
  console.log(`  oracle     ${oracle.address}\n`);

  for (const project of DEMO_PROJECTS) {
    const implementer = signers[project.implementerIndex];
    const boundary = squareBoundary(project.center);

    const projectId: bigint = await projectRegistry
      .connect(registrar)
      .registerProject.staticCall(project.name, project.ecosystem, implementer.address, boundary);
    const registerTx = await projectRegistry
      .connect(registrar)
      .registerProject(project.name, project.ecosystem, implementer.address, boundary);
    const registerReceipt = await registerTx.wait();

    console.log(`Project ${projectId}: ${project.name}`);
    console.log(`  implementer ${implementer.address}`);
    logEvents(registerReceipt, trackedContracts);

    for (const submission of project.submissions) {
      // Placeholder for a real off-chain MRV report: this demo has no satellite or field
      // verification pipeline behind it, so the hash is over a descriptive label, not evidence.
      const dataHash = ethers.keccak256(
        ethers.toUtf8Bytes(
          `SIMULATED DEMO DATA - no real MRV report - ${project.name} - vintage ${submission.vintage}`
        )
      );

      const submissionId: bigint = await verificationRegistry
        .connect(implementer)
        .submitForVerification.staticCall(
          projectId,
          submission.vintage,
          submission.tonnesCO2,
          dataHash
        );
      const submitTx = await verificationRegistry
        .connect(implementer)
        .submitForVerification(projectId, submission.vintage, submission.tonnesCO2, dataHash);
      const submitReceipt = await submitTx.wait();
      console.log(`  submission ${submissionId}: vintage ${submission.vintage}, ${submission.tonnesCO2} tCO2e`);
      logEvents(submitReceipt, trackedContracts);

      const approveTx = await verificationRegistry.connect(verifier).approveVerification(submissionId);
      const approveReceipt = await approveTx.wait();
      console.log(`  approved by ${verifier.address}`);
      logEvents(approveReceipt, trackedContracts);

      const mintTx = await carbonCreditToken
        .connect(oracle)
        .mintCredits(projectId, submission.vintage, submission.tonnesCO2, verifier.address);
      const mintReceipt = await mintTx.wait();
      const tokenId = await carbonCreditToken.encodeTokenId(projectId, submission.vintage);
      console.log(`  minted token ${tokenId} -> ${implementer.address}`);
      logEvents(mintReceipt, trackedContracts);
    }

    console.log("");
  }

  console.log("Demo data seeded.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
