// Typed client for the NeelKosh backend — same backend the public frontend talks to. Every
// function here mirrors one backend endpoint; see backend/src/routes/*.ts for the source of
// truth these types are kept in sync with.

export type RoleName = "NGO" | "VERIFIER" | "BUYER" | "ADMIN";

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
