import { Router } from "express";
import { ethers } from "ethers";
import { z } from "zod";
import { prisma } from "../db";
import { verificationRegistry } from "../blockchain/contracts";
import { findImplementerWallet } from "../blockchain/wallets";
import { validateBody } from "../middleware/validate";
import { asyncHandler } from "../utils/asyncHandler";
import { logStage } from "../utils/logger";
import { runOracleVerification } from "../services/oracleBridge";

export const mrvRouter = Router();

const submitMrvSchema = z.object({
  projectId: z.number().int().positive(),
  vintage: z.number().int().min(2000).max(2100),
  tonnesCO2: z.number().int().positive(),
  methodology: z.string().min(1),
  supportingDataRef: z.string().min(1),
  // Whatever the methodology requires — sensor readings, survey notes, imagery references — is
  // caller-defined. The whole thing is stored verbatim; only its hash goes on chain.
  reportData: z.record(z.unknown()).default({}),
});

/**
 * Files an MRV claim: hashes the full report, stores it verbatim, and calls
 * VerificationRegistry.submitForVerification with the hash. Signs with whichever server-held
 * "implementer" wallet matches the project's on-chain implementer address (see
 * blockchain/wallets.ts). A project whose implementer isn't in that fixed demo pool can't submit
 * through this API — by design: in production this transaction is signed by the implementing
 * organisation's own wallet, never by this backend.
 */
mrvRouter.post(
  "/submit",
  validateBody(submitMrvSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof submitMrvSchema>;

    const project = await prisma.onChainProject.findUnique({ where: { projectId: body.projectId } });
    if (!project) {
      res.status(404).json({ error: `No project with id ${body.projectId}` });
      return;
    }

    const implementerWallet = findImplementerWallet(project.implementerAddress);
    if (!implementerWallet) {
      res.status(400).json({
        error: `This backend does not hold a key for implementer ${project.implementerAddress}. Submit this transaction from that wallet directly.`,
      });
      return;
    }

    const reportPayload = {
      projectId: body.projectId,
      vintage: body.vintage,
      tonnesCO2: body.tonnesCO2,
      methodology: body.methodology,
      supportingDataRef: body.supportingDataRef,
      data: body.reportData,
    };
    const reportJson = JSON.stringify(reportPayload);
    const dataHash = ethers.keccak256(ethers.toUtf8Bytes(reportJson));

    logStage("SUBMIT", `Implementer ${implementerWallet.address} filing MRV claim`, {
      projectId: body.projectId,
      vintage: body.vintage,
      tonnesCO2: body.tonnesCO2,
      methodology: body.methodology,
      dataHash,
    });

    const verificationRegistryAsImplementer = verificationRegistry.connect(implementerWallet) as ethers.Contract;

    const submissionId: bigint = await verificationRegistryAsImplementer.submitForVerification.staticCall(
      body.projectId,
      body.vintage,
      body.tonnesCO2,
      dataHash
    );
    const tx = await verificationRegistryAsImplementer.submitForVerification(
      body.projectId,
      body.vintage,
      body.tonnesCO2,
      dataHash
    );
    const receipt = await tx.wait();

    logStage("SUBMIT", "Claim recorded on chain", { submissionId: submissionId.toString(), txHash: receipt.hash });

    await prisma.mrvReport.create({
      data: {
        submissionId: Number(submissionId),
        projectId: body.projectId,
        vintage: body.vintage,
        tonnesCO2: body.tonnesCO2,
        methodology: body.methodology,
        supportingDataRef: body.supportingDataRef,
        reportPayload: reportJson,
        dataHash,
        submittedByAddress: implementerWallet.address,
        submitTxHash: receipt.hash,
        status: "Pending",
      },
    });

    res.status(201).json({
      submissionId: Number(submissionId),
      projectId: body.projectId,
      vintage: body.vintage,
      tonnesCO2: body.tonnesCO2,
      dataHash,
      txHash: receipt.hash,
      status: "Pending",
    });
  })
);

/**
 * The "oracle" step. Approves the submission as the verifier, then immediately mints the
 * credits it unlocks as the oracle — see services/oracleBridge.ts for why this two-transaction
 * sequence, not a single privileged call, is the actual answer to "how do you know these
 * credits are backed by something real."
 */
mrvRouter.post(
  "/:submissionId/verify",
  asyncHandler(async (req, res) => {
    const submissionId = Number(req.params.submissionId);
    if (!Number.isInteger(submissionId) || submissionId <= 0) {
      res.status(400).json({ error: "submissionId must be a positive integer" });
      return;
    }

    const report = await prisma.mrvReport.findUnique({ where: { submissionId } });
    if (!report) {
      res.status(404).json({ error: `No MRV submission ${submissionId}` });
      return;
    }
    if (report.status !== "Pending") {
      res.status(400).json({ error: `Submission ${submissionId} is already ${report.status}, not Pending` });
      return;
    }

    const result = await runOracleVerification(submissionId);
    res.json(result);
  })
);
