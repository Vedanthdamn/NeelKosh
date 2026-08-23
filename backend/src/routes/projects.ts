import { Router } from "express";
import { ethers } from "ethers";
import { z } from "zod";
import { prisma } from "../db";
import { projectRegistryAsRegistrar } from "../blockchain/contracts";
import { validateBody } from "../middleware/validate";
import { asyncHandler } from "../utils/asyncHandler";
import { parseJsonField } from "../utils/serialize";
import { ecosystemToInt, ECOSYSTEM_NAMES } from "../utils/ecosystem";
import { toMicrodegreeTuple, type LatLng } from "../utils/geo";

export const projectsRouter = Router();

const latLngSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

const createProjectSchema = z.object({
  name: z.string().min(1),
  ecosystem: z.enum(ECOSYSTEM_NAMES),
  implementerAddress: z
    .string()
    .refine((value) => ethers.isAddress(value), "implementerAddress must be a valid Ethereum address"),
  boundary: z.array(latLngSchema).min(3, "boundary needs at least 3 points to enclose an area"),
  description: z.string().optional(),
  story: z.string().optional(),
  photos: z.array(z.string()).optional(),
});

function serializeProject(
  project: { projectId: number; name: string; ecosystem: string; status: string; implementerAddress: string; registeredAt: Date; boundary: string; registrationTxHash: string },
  metadata: { description: string | null; story: string | null; photos: string | null } | null
) {
  return {
    projectId: project.projectId,
    name: project.name,
    ecosystem: project.ecosystem,
    status: project.status,
    implementerAddress: project.implementerAddress,
    registeredAt: project.registeredAt,
    boundary: parseJsonField<LatLng[]>(project.boundary, []),
    registrationTxHash: project.registrationTxHash,
    metadata: metadata
      ? {
          description: metadata.description,
          story: metadata.story,
          photos: parseJsonField<string[]>(metadata.photos, []),
        }
      : null,
  };
}

/**
 * Registers a new restoration site. Signs with the registrar wallet — the only server-held key
 * authorised to call registerProject. staticCall runs the same call first to recover the
 * projectId the real transaction will be assigned, without which we'd have to guess or re-derive
 * it from logs.
 *
 * After the on-chain write succeeds, this also writes straight through to the local cache
 * tables so the project shows up in GET /api/projects immediately, rather than waiting for the
 * event-sync service's next pass. That sync service (see services/eventSync.ts) later upserts
 * the same row from the chain's own event log — idempotent by projectId — so this write-through
 * is a responsiveness optimisation, not a second source of truth.
 */
projectsRouter.post(
  "/",
  validateBody(createProjectSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof createProjectSchema>;
    const ecosystemInt = ecosystemToInt(body.ecosystem);
    const boundaryTuples = body.boundary.map(toMicrodegreeTuple);

    const projectId: bigint = await projectRegistryAsRegistrar.registerProject.staticCall(
      body.name,
      ecosystemInt,
      body.implementerAddress,
      boundaryTuples
    );
    const tx = await projectRegistryAsRegistrar.registerProject(
      body.name,
      ecosystemInt,
      body.implementerAddress,
      boundaryTuples
    );
    const receipt = await tx.wait();

    const numericProjectId = Number(projectId);
    const registeredAt = new Date();
    const boundaryJson = JSON.stringify(body.boundary);

    await prisma.onChainProject.upsert({
      where: { projectId: numericProjectId },
      create: {
        projectId: numericProjectId,
        name: body.name,
        ecosystem: body.ecosystem,
        implementerAddress: body.implementerAddress,
        status: "Active",
        registeredAt,
        boundary: boundaryJson,
        registrationTxHash: receipt.hash,
      },
      // Registration is immutable on chain — never overwrite a record that already exists.
      update: {},
    });

    let metadata = null;
    if (body.description || body.story || body.photos) {
      metadata = await prisma.projectMetadata.upsert({
        where: { projectId: numericProjectId },
        create: {
          projectId: numericProjectId,
          description: body.description,
          story: body.story,
          photos: body.photos ? JSON.stringify(body.photos) : undefined,
        },
        update: {
          description: body.description,
          story: body.story,
          photos: body.photos ? JSON.stringify(body.photos) : undefined,
        },
      });
    }

    res.status(201).json(
      serializeProject(
        {
          projectId: numericProjectId,
          name: body.name,
          ecosystem: body.ecosystem,
          status: "Active",
          implementerAddress: body.implementerAddress,
          registeredAt,
          boundary: boundaryJson,
          registrationTxHash: receipt.hash,
        },
        metadata
      )
    );
  })
);

/** Lists every project from the local cache, merged with off-chain metadata. Never touches the chain. */
projectsRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const [projects, metadataRows] = await Promise.all([
      prisma.onChainProject.findMany({ orderBy: { projectId: "asc" } }),
      prisma.projectMetadata.findMany(),
    ]);
    const metadataByProjectId = new Map(metadataRows.map((row) => [row.projectId, row]));

    res.json({
      projects: projects.map((project) => serializeProject(project, metadataByProjectId.get(project.projectId) ?? null)),
    });
  })
);

/** Full detail for one project: registration, every MRV reporting period, and credit batches minted against it. */
projectsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const projectId = Number(req.params.id);
    if (!Number.isInteger(projectId) || projectId <= 0) {
      res.status(400).json({ error: "id must be a positive integer" });
      return;
    }

    const [project, metadata, reports, batches] = await Promise.all([
      prisma.onChainProject.findUnique({ where: { projectId } }),
      prisma.projectMetadata.findUnique({ where: { projectId } }),
      prisma.mrvReport.findMany({ where: { projectId }, orderBy: { vintage: "asc" } }),
      prisma.creditBatch.findMany({ where: { projectId }, orderBy: { vintage: "asc" } }),
    ]);

    if (!project) {
      res.status(404).json({ error: `No project with id ${projectId}` });
      return;
    }

    let totalMinted = 0n;
    let totalRetired = 0n;
    const creditBatches = batches.map((batch) => {
      totalMinted += BigInt(batch.totalMinted);
      totalRetired += BigInt(batch.totalRetired);
      return {
        tokenId: batch.tokenId,
        vintage: batch.vintage,
        verifierAddress: batch.verifierAddress,
        dataHash: batch.dataHash,
        totalMinted: batch.totalMinted,
        totalRetired: batch.totalRetired,
        circulatingSupply: (BigInt(batch.totalMinted) - BigInt(batch.totalRetired)).toString(),
        issuedAt: batch.issuedAt,
      };
    });

    res.json({
      project: serializeProject(project, metadata),
      // ndvi is pulled from the submitter's raw reportPayload rather than stored as its own
      // column: it's only present when whoever submitted included it under reportData (e.g. via
      // the mrv-engine simulator), so it's optional here by nature, not by omission.
      reportingPeriods: reports.map((report) => ({
        submissionId: report.submissionId,
        vintage: report.vintage,
        tonnesCO2: report.tonnesCO2,
        methodology: report.methodology,
        supportingDataRef: report.supportingDataRef,
        dataHash: report.dataHash,
        status: report.status,
        submittedByAddress: report.submittedByAddress,
        submittedAt: report.submittedAt,
        submitTxHash: report.submitTxHash,
        verifierAddress: report.verifierAddress,
        verifiedAt: report.verifiedAt,
        tokenId: report.tokenId,
        ndvi: parseJsonField<{ data?: { ndvi?: number } }>(report.reportPayload, {}).data?.ndvi ?? null,
      })),
      credits: {
        batches: creditBatches,
        totals: {
          totalMinted: totalMinted.toString(),
          totalRetired: totalRetired.toString(),
          circulatingSupply: (totalMinted - totalRetired).toString(),
        },
      },
    });
  })
);
