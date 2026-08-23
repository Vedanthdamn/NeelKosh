/**
 * The oracle bridge: where an approved MRV claim becomes on-chain credits.
 *
 * Every carbon registry gets asked the same question: "how do you know the data is real?"
 * Putting a report's hash on a blockchain does not answer it. A hash is a fingerprint — it
 * proves a specific document existed and wasn't altered after the fact. It says nothing about
 * whether the tonnage claimed in that document is true. A blockchain cannot verify a mangrove
 * grew; only a person who went and looked can do that. Nothing in this file, or in the
 * contracts it calls, manufactures trust out of cryptography. What it does instead is make one
 * specific, narrow claim auditable: "verifier V, identified by this wallet, approved exactly
 * this tonnage for this project and vintage, and here is the immutable record of that decision."
 *
 * That is the honest scope of "verified" here — not "true," but "reviewed by an accountable
 * party, under rules anyone can inspect, with a permanent trail of who decided what and when."
 * The two transactions below are that trail. approveVerification is the verifier's decision,
 * signed by their own key. mintCredits can only ever issue the exact tonnage that specific
 * verifier approved — VerificationRegistry enforces that match on chain, so this bridge cannot
 * round up, mint early, or mint twice, even if it wanted to. If a verifier approves bad data,
 * the chain will faithfully preserve their bad decision, attributed to them, forever. That
 * failure mode belongs to the verification process — to picking accountable verifiers and
 * keeping their approvals auditable — not to anything a smart contract can paper over. This file
 * is the messenger that carries a verifier's decision onto the ledger; it is not, and cannot be,
 * the thing that makes the decision correct.
 */

import { prisma } from "../db";
import { verificationRegistry, verificationRegistryAsVerifier, carbonCreditTokenAsOracle } from "../blockchain/contracts";
import { verifierWallet, oracleWallet } from "../blockchain/wallets";
import { logStage } from "../utils/logger";

export interface OracleVerificationResult {
  submissionId: number;
  projectId: number;
  vintage: number;
  tonnesCO2: string;
  tokenId: string;
  approveTxHash: string;
  mintTxHash: string;
}

/**
 * Approves a pending MRV submission as the verifier, then immediately mints the credits it
 * unlocks as the oracle. Two separate signed transactions, run back to back, because that is
 * what the contracts actually require: VerificationRegistry.mintCredits's caller (the token
 * contract) can't issue against a submission until VerificationRegistry itself has recorded an
 * approval from VERIFIER_ROLE.
 */
export async function runOracleVerification(submissionId: number): Promise<OracleVerificationResult> {
  logStage("VERIFY", `Verifier ${verifierWallet.address} reviewing submission ${submissionId}`);

  const submission = await verificationRegistry.getSubmission(submissionId);
  const projectId = Number(submission.projectId);
  const vintage = Number(submission.vintage);
  const claimedTonnes = submission.claimedTonnes as bigint;

  logStage("VERIFY", "Claim under review", {
    projectId,
    vintage,
    claimedTonnes: claimedTonnes.toString(),
    dataHash: submission.dataHash,
    submitter: submission.submitter,
  });

  const approveTx = await verificationRegistryAsVerifier.approveVerification(submissionId);
  const approveReceipt = await approveTx.wait();

  logStage("VERIFY", "Approved on chain", { txHash: approveReceipt.hash });

  await prisma.mrvReport.update({
    where: { submissionId },
    data: {
      status: "Approved",
      verifierAddress: verifierWallet.address,
      verifiedAt: new Date(),
      verifyTxHash: approveReceipt.hash,
    },
  });

  logStage("MINT", `Oracle ${oracleWallet.address} issuing credits against the approved claim`);

  const mintTx = await carbonCreditTokenAsOracle.mintCredits(projectId, vintage, claimedTonnes, verifierWallet.address);
  const mintReceipt = await mintTx.wait();

  const tokenId: bigint = await carbonCreditTokenAsOracle.encodeTokenId(projectId, vintage);

  logStage("MINT", "Credits minted", { tokenId: tokenId.toString(), tonnesCO2: claimedTonnes.toString(), txHash: mintReceipt.hash });

  await prisma.mrvReport.update({
    where: { submissionId },
    data: { status: "Issued", tokenId: tokenId.toString(), mintTxHash: mintReceipt.hash },
  });

  // Write-through cache of the new batch; event-sync (services/eventSync.ts) reconciles this
  // same row from the chain's own CreditsMinted event, idempotently, on its next pass.
  await prisma.creditBatch.upsert({
    where: { tokenId: tokenId.toString() },
    create: {
      tokenId: tokenId.toString(),
      projectId,
      vintage,
      verifierAddress: verifierWallet.address,
      dataHash: submission.dataHash,
      totalMinted: claimedTonnes.toString(),
      totalRetired: "0",
      issuedAt: new Date(),
      mintTxHash: mintReceipt.hash,
    },
    update: {
      totalMinted: claimedTonnes.toString(),
      mintTxHash: mintReceipt.hash,
    },
  });

  return {
    submissionId,
    projectId,
    vintage,
    tonnesCO2: claimedTonnes.toString(),
    tokenId: tokenId.toString(),
    approveTxHash: approveReceipt.hash,
    mintTxHash: mintReceipt.hash,
  };
}
