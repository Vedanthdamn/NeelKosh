// Typed client for the NeelKosh backend — same backend the public frontend talks to. Every
// function here mirrors one backend endpoint; see backend/src/routes/*.ts for the source of
// truth these types are kept in sync with.

import type { PhotoVerificationResult } from "./photo";

export type RoleName = "NGO" | "VERIFIER" | "BUYER" | "ADMIN";
export type SubmissionStatus = "Pending" | "Approved" | "Rejected" | "Issued";

export interface LatLng {
  lat: number;
  lng: number;
}

export interface SubmissionDetail {
  submissionId: number;
  projectId: number;
  vintage: number;
  tonnesCO2: number;
  methodology: string;
  supportingDataRef: string;
  dataHash: string;
  submittedByAddress: string;
  submittedAt: string;
  submitTxHash: string;
  status: SubmissionStatus;
  verifierAddress: string | null;
  verifiedAt: string | null;
  verifyTxHash: string | null;
  rejectionReason: string | null;
  tokenId: string | null;
  mintTxHash: string | null;
  photoHash: string | null;
  photoVerification: PhotoVerificationResult | null;
  project: { projectId: number; name: string; ecosystem: string; implementerAddress: string; boundary: LatLng[] } | null;
}

export interface SessionUser {
  id: number;
  walletAddress: string;
  role: RoleName;
  organizationName: string | null;
  createdAt: string;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function backendUrl(): string {
  return process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:4000";
}

async function getJson<T>(path: string, token?: string): Promise<T> {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${backendUrl()}${path}`, { cache: "no-store", headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(data.error || `Request to ${path} failed`, response.status);
  return data as T;
}

async function postJson<T>(path: string, body: unknown, token?: string): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${backendUrl()}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(data.error || `Request to ${path} failed`, response.status);
  return data as T;
}

/** Step 1 of Sign-In With Ethereum: request the one-time message this wallet must sign. */
export async function requestNonce(walletAddress: string): Promise<string> {
  const { message } = await postJson<{ message: string }>("/api/auth/nonce", { walletAddress });
  return message;
}

/** Step 2: submit the signature, get back a session token (and the user row, if one exists). */
export async function verifySignature(
  walletAddress: string,
  signature: string
): Promise<{ token: string; registered: boolean; user: SessionUser | null }> {
  return postJson("/api/auth/verify", { walletAddress, signature });
}

/** The verifier's queue: every submission still awaiting a decision, oldest first. */
export async function fetchPendingSubmissions(token: string): Promise<SubmissionDetail[]> {
  const data = await getJson<{ submissions: SubmissionDetail[] }>("/api/mrv/pending", token);
  return data.submissions;
}

/** One submission's full detail, regardless of status — powers the queue detail page. */
export async function fetchSubmission(submissionId: number | string, token: string): Promise<SubmissionDetail | null> {
  try {
    return await getJson<SubmissionDetail>(`/api/mrv/${submissionId}`, token);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

/** A verifier's own decision history — everything they've already approved or rejected. */
export async function fetchDecidedSubmissions(verifierAddress: string, token: string): Promise<SubmissionDetail[]> {
  const data = await getJson<{ submissions: SubmissionDetail[] }>(`/api/mrv/decided/${verifierAddress}`, token);
  return data.submissions;
}

export interface ApproveResult {
  submissionId: number;
  projectId: number;
  vintage: number;
  tonnesCO2: string;
  tokenId: string;
  approveTxHash: string;
  mintTxHash: string;
}

/** Approves a pending submission, which immediately mints the credits it unlocks. */
export async function approveSubmission(submissionId: number, token: string): Promise<ApproveResult> {
  return postJson(`/api/mrv/${submissionId}/verify`, {}, token);
}

/** Rejects a pending submission with a stated reason, freeing the period for resubmission. */
export async function rejectSubmission(submissionId: number, reason: string, token: string): Promise<void> {
  await postJson(`/api/mrv/${submissionId}/reject`, { reason }, token);
}
