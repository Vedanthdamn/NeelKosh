import { Router } from "express";
import { ethers } from "ethers";
import multer from "multer";
import { z } from "zod";
import { prisma } from "../db";
import { verificationRegistry, verificationRegistryAsVerifier } from "../blockchain/contracts";
import { findImplementerWallet, verifierWallet } from "../blockchain/wallets";
import { validateBody } from "../middleware/validate";
import { requireRole } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";
import { logStage } from "../utils/logger";
import { parseJsonField } from "../utils/serialize";
import type { LatLng } from "../utils/geo";
import { runOracleVerification } from "../services/oracleBridge";
import { verifyPhotoSubmission, type PhotoVerificationResult } from "../services/photoVerification";

export const mrvRouter = Router();

/** Shape shared by every "read one or more MRV submissions" endpoint below — the queue list,
 *  the queue detail page, and a verifier's decision history all want the same merged view. */
interface SubmissionDetail {
  submissionId: number;
  projectId: number;
  vintage: number;
  tonnesCO2: number;
  methodology: string;
  supportingDataRef: string;
  dataHash: string;
  submittedByAddress: string;
  submittedAt: Date;
  submitTxHash: string;
  status: string;
  verifierAddress: string | null;
  verifiedAt: Date | null;
  verifyTxHash: string | null;
  rejectionReason: string | null;
  tokenId: string | null;
  mintTxHash: string | null;
  photoHash: string | null;
  photoVerification: PhotoVerificationResult | null;
  project: { projectId: number; name: string; ecosystem: string; implementerAddress: string; boundary: LatLng[] } | null;
}

function serializeSubmission(
  report: {
    submissionId: number;
    projectId: number;
    vintage: number;
    tonnesCO2: number;
    methodology: string;
    supportingDataRef: string;
    dataHash: string;
    submittedByAddress: string;
    submittedAt: Date;
    submitTxHash: string;
    status: string;
    verifierAddress: string | null;
    verifiedAt: Date | null;
    verifyTxHash: string | null;
    rejectionReason: string | null;
    tokenId: string | null;
    mintTxHash: string | null;
    photoHash: string | null;
    photoVerification: string | null;
  },
  project: { projectId: number; name: string; ecosystem: string; implementerAddress: string; boundary: string } | null
): SubmissionDetail {
  return {
    submissionId: report.submissionId,
    projectId: report.projectId,
    vintage: report.vintage,
    tonnesCO2: report.tonnesCO2,
    methodology: report.methodology,
    supportingDataRef: report.supportingDataRef,
    dataHash: report.dataHash,
    submittedByAddress: report.submittedByAddress,
    submittedAt: report.submittedAt,
    submitTxHash: report.submitTxHash,
    status: report.status,
    verifierAddress: report.verifierAddress,
    verifiedAt: report.verifiedAt,
    verifyTxHash: report.verifyTxHash,
    rejectionReason: report.rejectionReason,
    tokenId: report.tokenId,
    mintTxHash: report.mintTxHash,
    photoHash: report.photoHash,
    photoVerification: parseJsonField<PhotoVerificationResult | null>(report.photoVerification, null),
    project: project
      ? {
          projectId: project.projectId,
          name: project.name,
          ecosystem: project.ecosystem,
          implementerAddress: project.implementerAddress,
          boundary: parseJsonField<LatLng[]>(project.boundary, []),
        }
      : null,
  };
}

/** Merges a batch of MrvReport rows with their projects in one query each, not N+1. */
async function serializeSubmissions(
  reports: Parameters<typeof serializeSubmission>[0][]
): Promise<SubmissionDetail[]> {
  const projects = await prisma.onChainProject.findMany({
    where: { projectId: { in: [...new Set(reports.map((r) => r.projectId))] } },
  });
  const projectsById = new Map(projects.map((p) => [p.projectId, p]));
  return reports.map((report) => serializeSubmission(report, projectsById.get(report.projectId) ?? null));
}

// Memory storage, not disk: the photo only needs to exist long enough to forward to mrv-engine
// (see services/photoVerification.ts) and compute a hash from — this backend doesn't persist
// the photo itself anywhere. That's a real prototype-scope limit, not an oversight: a production
// system would need durable photo storage (S3 or similar) so a verifier can view the actual
// image later, not just the numbers a check produced from it. See backend/README.md.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

/**
 * A multipart request (photo attached) arrives with every non-file field as a string — multer
 * doesn't know these are meant to be numbers or JSON. z.coerce.number() accepts a real number
 * (the existing JSON-only request shape) or a numeric string (multipart) identically, so this
 * one schema validates both without the route needing to know which kind of request it got.
 */
const submitMrvSchema = z.object({
  projectId: z.coerce.number().int().positive(),
  vintage: z.coerce.number().int().min(2000).max(2100),
  tonnesCO2: z.coerce.number().int().positive(),
  methodology: z.string().min(1),
  supportingDataRef: z.string().min(1),
  // Whatever the methodology requires — sensor readings, survey notes, imagery references — is
  // caller-defined. The whole thing is stored verbatim; only its hash goes on chain. Multipart
  // requests can only send string fields, so a JSON-encoded string here is parsed back into an
  // object; a JSON request can send the object directly and this passes it through unchanged.
  reportData: z.preprocess((value) => {
    if (typeof value !== "string") return value;
    try {
      return JSON.parse(value);
    } catch {
      return value; // let z.record below reject it with a clear "not an object" error
    }
  }, z.record(z.unknown()).default({})),
});

/**
 * The verifier's queue: every submission still awaiting a decision, oldest first. Gated to the
 * VERIFIER role — this is a worklist for accredited verifiers, not a public listing (unlike
 * GET /api/projects, which anyone can browse) — though note it's an API-layer gate only, same
 * caveat as everywhere else in this file: the actual approve/reject transactions are indepen-
 * dently restricted on chain regardless of who reaches this endpoint.
 */
mrvRouter.get(
  "/pending",
  requireRole(["VERIFIER"]),
  asyncHandler(async (_req, res) => {
    const reports = await prisma.mrvReport.findMany({
      where: { status: "Pending" },
      orderBy: { submittedAt: "asc" },
    });
    res.json({ submissions: await serializeSubmissions(reports) });
  })
);

/** One verifier's decision history — everything they've already approved or rejected. */
mrvRouter.get(
  "/decided/:verifierAddress",
  requireRole(["VERIFIER"]),
  asyncHandler(async (req, res) => {
    if (!ethers.isAddress(req.params.verifierAddress)) {
      res.status(400).json({ error: "verifierAddress must be a valid Ethereum address" });
      return;
    }
    const reports = await prisma.mrvReport.findMany({
      where: { verifierAddress: ethers.getAddress(req.params.verifierAddress), status: { not: "Pending" } },
      orderBy: { verifiedAt: "desc" },
    });
    res.json({ submissions: await serializeSubmissions(reports) });
  })
);

/**
 * Files an MRV claim: hashes the full report, stores it verbatim, and calls
 * VerificationRegistry.submitForVerification with the hash. Signs with whichever server-held
 * "implementer" wallet matches the project's on-chain implementer address (see
 * blockchain/wallets.ts). A project whose implementer isn't in that fixed demo pool can't submit
 * through this API — by design: in production this transaction is signed by the implementing
 * organisation's own wallet, never by this backend.
 *
 * An NGO can optionally attach a geotagged site photo (multipart field "photo"). When present,
 * it's run through mrv-engine's anti-fraud checks (geofence, duplicate, plausibility) after the
 * on-chain submission succeeds, and the result is stored alongside this report — purely
 * advisory, visible to the verifier later, never blocking or deciding the submission itself. See
 * services/photoVerification.ts for exactly why, and what happens if mrv-engine is unreachable.
 */
mrvRouter.post(
  "/submit",
  upload.single("photo"),
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
      photoAttached: Boolean(req.file),
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

    // The on-chain submission above is already final at this point — everything from here on is
    // advisory and must never fail the request. See services/photoVerification.ts.
    let photoVerification: PhotoVerificationResult | null = null;
    if (req.file) {
      const boundary = parseJsonField<LatLng[]>(project.boundary, []);
      const priorReports = await prisma.mrvReport.findMany({
        where: { projectId: body.projectId, photoHash: { not: null } },
        select: { photoHash: true },
      });
      const knownHashes = priorReports.map((r) => r.photoHash).filter((hash): hash is string => hash !== null);

      photoVerification = await verifyPhotoSubmission({
        photoBuffer: req.file.buffer,
        photoFilename: req.file.originalname,
        photoMimeType: req.file.mimetype,
        projectId: body.projectId,
        boundary,
        knownHashes,
      });

      if (photoVerification) {
        await prisma.mrvReport.update({
          where: { submissionId: Number(submissionId) },
          data: {
            photoHash: photoVerification.photoHash,
            photoVerification: JSON.stringify(photoVerification),
          },
        });
      }
    }

    res.status(201).json({
      submissionId: Number(submissionId),
      projectId: body.projectId,
      vintage: body.vintage,
      tonnesCO2: body.tonnesCO2,
      dataHash,
      txHash: receipt.hash,
      status: "Pending",
      photoVerification,
    });
  })
);

/**
 * The "oracle" step. Approves the submission as the verifier, then immediately mints the
 * credits it unlocks as the oracle — see services/oracleBridge.ts for why this two-transaction
 * sequence, not a single privileged call, is the actual answer to "how do you know these
 * credits are backed by something real."
 *
 * Gated to the VERIFIER role at the API layer. This is independent of, not a replacement for,
 * the on-chain guarantee: the actual approveVerification call is still signed by the single
 * server-held verifier wallet (see blockchain/wallets.ts), which VerificationRegistry's own
 * VERIFIER_ROLE restricts regardless of who reaches this endpoint. What this guard adds is
 * accountability at the API layer — which authenticated human triggered a given approval — on
 * top of an on-chain contract that would refuse the transaction anyway if it didn't come from
 * the right key.
 */
mrvRouter.post(
  "/:submissionId/verify",
  requireRole(["VERIFIER"]),
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

const rejectSchema = z.object({
  reason: z.string().min(1, "A rejection reason is required."),
});

/**
 * Turns a pending claim down. Single transaction, unlike approve+mint — rejecting never touches
 * CarbonCreditToken, so there's no oracle step and nothing to bridge. Signed by the same
 * server-held verifier wallet approve uses; VerificationRegistry's own VERIFIER_ROLE would
 * refuse this call from anyone else regardless of the requireRole gate below, same relationship
 * as everywhere else in this file between the API-layer check and the on-chain one.
 */
mrvRouter.post(
  "/:submissionId/reject",
  requireRole(["VERIFIER"]),
  validateBody(rejectSchema),
  asyncHandler(async (req, res) => {
    const submissionId = Number(req.params.submissionId);
    if (!Number.isInteger(submissionId) || submissionId <= 0) {
      res.status(400).json({ error: "submissionId must be a positive integer" });
      return;
    }
    const { reason } = req.body as z.infer<typeof rejectSchema>;

    const report = await prisma.mrvReport.findUnique({ where: { submissionId } });
    if (!report) {
      res.status(404).json({ error: `No MRV submission ${submissionId}` });
      return;
    }
    if (report.status !== "Pending") {
      res.status(400).json({ error: `Submission ${submissionId} is already ${report.status}, not Pending` });
      return;
    }

    logStage("VERIFY", `Verifier ${verifierWallet.address} rejecting submission ${submissionId}`, { reason });

    const tx = await verificationRegistryAsVerifier.rejectVerification(submissionId, reason);
    const receipt = await tx.wait();

    logStage("VERIFY", "Rejected on chain", { txHash: receipt.hash });

    // Write-through cache; event-sync (services/eventSync.ts) reconciles this same row from the
    // chain's own VerificationRejected event on its next pass.
    const verifiedAt = new Date();
    await prisma.mrvReport.update({
      where: { submissionId },
      data: {
        status: "Rejected",
        verifierAddress: verifierWallet.address,
        verifiedAt,
        verifyTxHash: receipt.hash,
        rejectionReason: reason,
      },
    });

    res.json({
      submissionId,
      status: "Rejected",
      verifierAddress: verifierWallet.address,
      verifiedAt,
      verifyTxHash: receipt.hash,
      rejectionReason: reason,
    });
  })
);

/**
 * One submission's full detail, regardless of status — the queue detail page's data source.
 * Deliberately not restricted to Pending like /pending is: a verifier following a link to a
 * submission they already decided (from /decided, or a stale bookmark) should still see it, not
 * hit a 404 the moment it leaves the queue.
 */
mrvRouter.get(
  "/:submissionId",
  requireRole(["VERIFIER"]),
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

    const project = await prisma.onChainProject.findUnique({ where: { projectId: report.projectId } });
    res.json(serializeSubmission(report, project));
  })
);
