import { Router } from "express";
import { ethers } from "ethers";
import { z } from "zod";
import { prisma } from "../db";
import { carbonCreditToken } from "../blockchain/contracts";
import { allServerWallets } from "../blockchain/wallets";
import { validateBody } from "../middleware/validate";
import { asyncHandler } from "../utils/asyncHandler";
import { logStage } from "../utils/logger";

export const creditsRouter = Router();

const retireSchema = z.object({
  amount: z.number().int().positive(),
  retirementReason: z.string().min(1),
  /// Which holder is retiring. Optional: with one server-held holder of this token, it's inferred.
  holderAddress: z
    .string()
    .refine((value) => ethers.isAddress(value), "holderAddress must be a valid Ethereum address")
    .optional(),
});

function parseTokenId(raw: string): bigint | null {
  try {
    const tokenId = BigInt(raw);
    return tokenId > 0n ? tokenId : null;
  } catch {
    return null;
  }
}

/**
 * What an address currently holds. Nothing in the cache stores a running balance directly —
 * TransferEvent only records individual movements — so this first narrows to every tokenId this
 * address has ever been a party to (a cheap indexed lookup), then asks CarbonCreditToken itself
 * for the authoritative current balanceOf each candidate rather than summing deltas here and
 * risking drift from the chain's own accounting. Only positive balances are returned.
 */
creditsRouter.get(
  "/holdings/:address",
  asyncHandler(async (req, res) => {
    if (!ethers.isAddress(req.params.address)) {
      res.status(400).json({ error: "address must be a valid Ethereum address" });
      return;
    }
    const address = ethers.getAddress(req.params.address);

    const touched = await prisma.transferEvent.findMany({
      where: { OR: [{ fromAddress: address }, { toAddress: address }] },
      select: { tokenId: true },
      distinct: ["tokenId"],
    });

    const holdings = await Promise.all(
      touched.map(async ({ tokenId }) => {
        const balance = (await carbonCreditToken.balanceOf(address, tokenId)) as bigint;
        return { tokenId, balance };
      })
    );
    const held = holdings.filter((h) => h.balance > 0n);

    const batches = await prisma.creditBatch.findMany({ where: { tokenId: { in: held.map((h) => h.tokenId) } } });
    const batchesByTokenId = new Map(batches.map((b) => [b.tokenId, b]));
    const projects = await prisma.onChainProject.findMany({
      where: { projectId: { in: batches.map((b) => b.projectId) } },
    });
    const projectsById = new Map(projects.map((p) => [p.projectId, p]));

    res.json({
      holdings: held.map(({ tokenId, balance }) => {
        const batch = batchesByTokenId.get(tokenId);
        const project = batch ? projectsById.get(batch.projectId) : undefined;
        return {
          tokenId,
          balance: balance.toString(),
          vintage: batch?.vintage ?? null,
          verifierAddress: batch?.verifierAddress ?? null,
          issuedAt: batch?.issuedAt ?? null,
          project: project ? { projectId: project.projectId, name: project.name, ecosystem: project.ecosystem } : null,
        };
      }),
    });
  })
);

/**
 * Retires credits on chain. retireCredits burns from msg.sender, so this must be signed by the
 * wallet that actually holds the balance — there is no "retire on behalf of" path, by design.
 * This resolves which server-held wallet that is (or takes holderAddress explicitly), which is
 * a demo affordance: in production the holder signs from their own wallet client-side.
 */
creditsRouter.post(
  "/:tokenId/retire",
  validateBody(retireSchema),
  asyncHandler(async (req, res) => {
    const tokenId = parseTokenId(req.params.tokenId);
    if (tokenId === null) {
      res.status(400).json({ error: "tokenId must be a positive integer" });
      return;
    }
    const body = req.body as z.infer<typeof retireSchema>;

    const candidates = allServerWallets();
    let holderWallet;

    if (body.holderAddress) {
      holderWallet = candidates.find(
        (wallet) => wallet.address.toLowerCase() === body.holderAddress!.toLowerCase()
      );
      if (!holderWallet) {
        res.status(400).json({
          error: `This backend does not hold a key for ${body.holderAddress}. Sign this retirement from that wallet directly.`,
        });
        return;
      }
    } else {
      // Find the single server-held wallet with a sufficient balance. Ambiguity is an error
      // rather than a guess: retiring from the wrong holder is not something to silently pick.
      const balances = await Promise.all(
        candidates.map(async (wallet) => ({
          wallet,
          balance: (await carbonCreditToken.balanceOf(wallet.address, tokenId)) as bigint,
        }))
      );
      const holders = balances.filter((entry) => entry.balance >= BigInt(body.amount));
      if (holders.length === 0) {
        res.status(400).json({
          error: `No server-held wallet holds ${body.amount} of token ${tokenId}. Pass holderAddress explicitly.`,
        });
        return;
      }
      if (holders.length > 1) {
        res.status(400).json({
          error: `Multiple server-held wallets hold enough of token ${tokenId}. Pass holderAddress to disambiguate.`,
          candidates: holders.map((entry) => entry.wallet.address),
        });
        return;
      }
      holderWallet = holders[0].wallet;
    }

    logStage("RETIRE", `Holder ${holderWallet.address} retiring credits`, {
      tokenId: tokenId.toString(),
      amount: body.amount,
      reason: body.retirementReason,
    });

    const tokenAsHolder = carbonCreditToken.connect(holderWallet) as ethers.Contract;
    const retirementId: bigint = await tokenAsHolder.retireCredits.staticCall(
      tokenId,
      body.amount,
      body.retirementReason
    );
    const tx = await tokenAsHolder.retireCredits(tokenId, body.amount, body.retirementReason);
    const receipt = await tx.wait();

    logStage("RETIRE", "Retired on chain — credits permanently burned", {
      retirementId: retirementId.toString(),
      txHash: receipt.hash,
    });

    const retiredAt = new Date();
    await prisma.retirementRecord.upsert({
      where: { onChainRetirementId: Number(retirementId) },
      create: {
        onChainRetirementId: Number(retirementId),
        tokenId: tokenId.toString(),
        amount: String(body.amount),
        retiredByAddress: holderWallet.address,
        reason: body.retirementReason,
        retiredAt,
        txHash: receipt.hash,
      },
      update: {},
    });

    const totalRetired = (await carbonCreditToken.totalRetired(tokenId)) as bigint;
    await prisma.creditBatch.updateMany({
      where: { tokenId: tokenId.toString() },
      data: { totalRetired: totalRetired.toString() },
    });

    res.json({
      retirementId: Number(retirementId),
      tokenId: tokenId.toString(),
      amount: String(body.amount),
      retiredByAddress: holderWallet.address,
      reason: body.retirementReason,
      txHash: receipt.hash,
      totalRetired: totalRetired.toString(),
    });
  })
);

/**
 * Full provenance for one credit batch — the "prove this credit is real" view. Serves the
 * cached batch, its originating MRV report, every transfer, and every retirement, so the
 * frontend can render an unbroken chain from field report to permanent retirement without
 * walking chain logs itself.
 */
creditsRouter.get(
  "/:tokenId/history",
  asyncHandler(async (req, res) => {
    const tokenId = parseTokenId(req.params.tokenId);
    if (tokenId === null) {
      res.status(400).json({ error: "tokenId must be a positive integer" });
      return;
    }
    const tokenIdStr = tokenId.toString();

    const [batch, report, transfers, retirements] = await Promise.all([
      prisma.creditBatch.findUnique({ where: { tokenId: tokenIdStr } }),
      prisma.mrvReport.findFirst({ where: { tokenId: tokenIdStr } }),
      prisma.transferEvent.findMany({
        where: { tokenId: tokenIdStr },
        orderBy: [{ blockNumber: "asc" }, { logIndex: "asc" }],
      }),
      prisma.retirementRecord.findMany({ where: { tokenId: tokenIdStr }, orderBy: { retiredAt: "asc" } }),
    ]);

    if (!batch) {
      res.status(404).json({ error: `No credit batch with token id ${tokenIdStr}` });
      return;
    }

    const project = await prisma.onChainProject.findUnique({ where: { projectId: batch.projectId } });

    res.json({
      tokenId: tokenIdStr,
      project: project
        ? { projectId: project.projectId, name: project.name, ecosystem: project.ecosystem }
        : null,
      batch: {
        vintage: batch.vintage,
        verifierAddress: batch.verifierAddress,
        dataHash: batch.dataHash,
        totalMinted: batch.totalMinted,
        totalRetired: batch.totalRetired,
        circulatingSupply: (BigInt(batch.totalMinted) - BigInt(batch.totalRetired)).toString(),
        issuedAt: batch.issuedAt,
        mintTxHash: batch.mintTxHash,
      },
      // The origin of the batch: which report, under which methodology, backed by which evidence.
      origin: report
        ? {
            submissionId: report.submissionId,
            methodology: report.methodology,
            supportingDataRef: report.supportingDataRef,
            dataHash: report.dataHash,
            submittedByAddress: report.submittedByAddress,
            submittedAt: report.submittedAt,
            submitTxHash: report.submitTxHash,
            verifierAddress: report.verifierAddress,
            verifiedAt: report.verifiedAt,
            verifyTxHash: report.verifyTxHash,
          }
        : null,
      transfers: transfers.map((transfer) => ({
        // A mint is a transfer from the zero address; a retirement is a burn to it.
        kind:
          transfer.fromAddress === ethers.ZeroAddress
            ? "mint"
            : transfer.toAddress === ethers.ZeroAddress
              ? "retirement"
              : "transfer",
        from: transfer.fromAddress,
        to: transfer.toAddress,
        amount: transfer.amount,
        txHash: transfer.txHash,
        blockNumber: transfer.blockNumber,
        occurredAt: transfer.occurredAt,
      })),
      retirements: retirements.map((retirement) => ({
        retirementId: retirement.onChainRetirementId,
        amount: retirement.amount,
        retiredByAddress: retirement.retiredByAddress,
        reason: retirement.reason,
        retiredAt: retirement.retiredAt,
        txHash: retirement.txHash,
      })),
    });
  })
);
