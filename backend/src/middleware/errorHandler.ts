import type { ErrorRequestHandler } from "express";

/** Extracts a human-readable message from an ethers.js error, falling back to err.message. */
function describeError(err: unknown): string {
  if (err && typeof err === "object") {
    const anyErr = err as Record<string, unknown>;
    if (typeof anyErr.shortMessage === "string") return anyErr.shortMessage;
    if (typeof anyErr.reason === "string") return anyErr.reason;
    if (typeof anyErr.message === "string") return anyErr.message;
  }
  return "Internal server error";
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  console.error(err);
  const anyErr = err as Record<string, unknown>;
  // A reverted or simulated-and-rejected contract call is a client-correctable input problem
  // (unauthorized signer, failed invariant, bad argument), not a server fault.
  const isContractRejection = anyErr?.code === "CALL_EXCEPTION" || anyErr?.code === "INVALID_ARGUMENT";
  res.status(isContractRejection ? 400 : 500).json({ error: describeError(err) });
};
