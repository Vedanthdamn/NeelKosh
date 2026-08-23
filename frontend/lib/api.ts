// Typed client for the NeelKosh backend. Every function here mirrors one backend endpoint —
// see backend/src/routes/*.ts for the source of truth these types are kept in sync with.

export type Ecosystem = "Mangrove" | "Seagrass" | "Saltmarsh";
export type ProjectStatus = "Active" | "Suspended";
export type SubmissionStatus = "Pending" | "Approved" | "Rejected" | "Issued";

export interface LatLng {
  lat: number;
  lng: number;
}

export interface ProjectMetadata {
  description: string | null;
  story: string | null;
  photos: string[];
}

export interface ProjectSummary {
  projectId: number;
  name: string;
  ecosystem: Ecosystem;
  status: ProjectStatus;
  implementerAddress: string;
  registeredAt: string;
  boundary: LatLng[];
  registrationTxHash: string;
  metadata: ProjectMetadata | null;
}

export interface ReportingPeriod {
  submissionId: number;
  vintage: number;
  tonnesCO2: number;
  methodology: string;
  supportingDataRef: string;
  dataHash: string;
  status: SubmissionStatus;
  submittedByAddress: string;
  submittedAt: string;
  submitTxHash: string;
  verifierAddress: string | null;
  verifiedAt: string | null;
  tokenId: string | null;
  ndvi: number | null;
}

export interface CreditBatchSummary {
  tokenId: string;
  vintage: number;
  verifierAddress: string;
  dataHash: string;
  totalMinted: string;
  totalRetired: string;
  circulatingSupply: string;
  issuedAt: string;
}

export interface ProjectDetail {
  project: ProjectSummary;
  reportingPeriods: ReportingPeriod[];
  credits: {
    batches: CreditBatchSummary[];
    totals: { totalMinted: string; totalRetired: string; circulatingSupply: string };
  };
}

export interface CreditHistoryTransfer {
  kind: "mint" | "transfer" | "retirement";
  from: string;
  to: string;
  amount: string;
  txHash: string;
  blockNumber: number;
  occurredAt: string;
}

export interface CreditHistoryRetirement {
  retirementId: number;
  amount: string;
  retiredByAddress: string;
  reason: string;
  retiredAt: string;
  txHash: string;
}

export interface CreditHistory {
  tokenId: string;
  project: { projectId: number; name: string; ecosystem: Ecosystem } | null;
  batch: {
    vintage: number;
    verifierAddress: string;
    dataHash: string;
    totalMinted: string;
    totalRetired: string;
    circulatingSupply: string;
    issuedAt: string;
    mintTxHash: string;
  };
  origin: {
    submissionId: number;
    methodology: string;
    supportingDataRef: string;
    dataHash: string;
    submittedByAddress: string;
    submittedAt: string;
    submitTxHash: string;
    verifierAddress: string | null;
    verifiedAt: string | null;
    verifyTxHash: string | null;
  } | null;
  transfers: CreditHistoryTransfer[];
  retirements: CreditHistoryRetirement[];
}

export interface RegistryStats {
  totalProjects: number;
  totalTonnesVerified: number;
  totalCreditsRetired: number;
}

export interface RegisterProjectInput {
  name: string;
  ecosystem: Ecosystem;
  implementerAddress: string;
  boundary: LatLng[];
  description?: string;
  story?: string;
  photos?: string[];
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

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${backendUrl()}${path}`, { cache: "no-store" });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new ApiError(body.error || `Request to ${path} failed`, response.status);
  }
  return response.json();
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${backendUrl()}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(data.error || `Request to ${path} failed`, response.status);
  }
  return data as T;
}

export async function fetchProjects(): Promise<ProjectSummary[]> {
  const data = await getJson<{ projects: ProjectSummary[] }>("/api/projects");
  return data.projects;
}

export async function fetchProject(id: number | string): Promise<ProjectDetail | null> {
  try {
    return await getJson<ProjectDetail>(`/api/projects/${id}`);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

export async function fetchCreditHistory(tokenId: string): Promise<CreditHistory | null> {
  try {
    return await getJson<CreditHistory>(`/api/credits/${tokenId}/history`);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

export async function registerProject(input: RegisterProjectInput) {
  return postJson<ProjectSummary & { projectId: number; txHash: string }>("/api/projects", input);
}

/**
 * Aggregates registry-wide totals for the landing page counters. The backend doesn't expose a
 * dedicated aggregate endpoint, so this fans out to each project's detail and sums client-side —
 * fine at demo scale (a handful of projects); a real deployment would want a backend aggregate
 * rather than N+1 requests on every landing page load.
 */
export async function fetchRegistryStats(): Promise<RegistryStats> {
  const projects = await fetchProjects();
  const details = await Promise.all(projects.map((project) => fetchProject(project.projectId)));

  let totalTonnesVerified = 0;
  let totalCreditsRetired = 0;
  for (const detail of details) {
    if (!detail) continue;
    totalTonnesVerified += Number(detail.credits.totals.totalMinted);
    totalCreditsRetired += Number(detail.credits.totals.totalRetired);
  }

  return {
    totalProjects: projects.length,
    totalTonnesVerified,
    totalCreditsRetired,
  };
}
