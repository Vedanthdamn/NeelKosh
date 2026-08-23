// Mirrors ProjectRegistry.sol's Ecosystem enum. Order matters — it's the enum's integer encoding.
export const ECOSYSTEM_NAMES = ["Mangrove", "Seagrass", "Saltmarsh"] as const;
export type EcosystemName = (typeof ECOSYSTEM_NAMES)[number];

export function ecosystemToInt(name: EcosystemName): number {
  return ECOSYSTEM_NAMES.indexOf(name);
}

export function ecosystemFromInt(value: number | bigint): EcosystemName {
  const index = Number(value);
  const name = ECOSYSTEM_NAMES[index];
  if (!name) throw new Error(`Unknown ecosystem index ${index}`);
  return name;
}

// Mirrors ProjectRegistry.sol's Status enum.
export const PROJECT_STATUS_NAMES = ["Active", "Suspended"] as const;
export type ProjectStatusName = (typeof PROJECT_STATUS_NAMES)[number];

export function projectStatusFromInt(value: number | bigint): ProjectStatusName {
  const index = Number(value);
  const name = PROJECT_STATUS_NAMES[index];
  if (!name) throw new Error(`Unknown project status index ${index}`);
  return name;
}

// Mirrors VerificationRegistry.sol's SubmissionStatus enum.
export const SUBMISSION_STATUS_NAMES = ["None", "Pending", "Approved", "Rejected", "Issued"] as const;
export type SubmissionStatusName = (typeof SUBMISSION_STATUS_NAMES)[number];

export function submissionStatusFromInt(value: number | bigint): SubmissionStatusName {
  const index = Number(value);
  const name = SUBMISSION_STATUS_NAMES[index];
  if (!name) throw new Error(`Unknown submission status index ${index}`);
  return name;
}
