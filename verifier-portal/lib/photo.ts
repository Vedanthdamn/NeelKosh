// Mirrors mrv-engine's anti-fraud photo-check result shape (mrv_engine/photo/routes.py's
// VerifySubmissionResponse) and the severity thresholds mrv_engine/photo/verification.py and
// plausibility.py use, so the queue's indicators classify a result exactly the way the backend
// that produced it would — not a second, drifting opinion about what counts as a problem.

export interface PhotoVerificationResult {
  locationValid: boolean;
  distanceFromBoundary: number | null;
  hasLocationData: boolean;
  isDuplicate: boolean;
  similarityScore: number;
  photoHash: string;
  plausibilityScore: number;
  overallFlag: "clear" | "review" | "reject";
  reasons: string[];
}

export type SignalLevel = "green" | "amber" | "red" | "none";

/** No GPS at all is a real, distinct condition from "GPS present but wrong" — flagged amber
 *  (worth a verifier's attention) rather than green (nothing to check) or red (confirmed bad). */
export function locationSignal(result: PhotoVerificationResult | null): SignalLevel {
  if (!result) return "none";
  if (!result.hasLocationData) return "amber";
  return result.locationValid ? "green" : "red";
}

export function duplicateSignal(result: PhotoVerificationResult | null): SignalLevel {
  if (!result) return "none";
  return result.isDuplicate ? "red" : "green";
}

// mrv-engine's plausibility.py: PLAUSIBILITY_THRESHOLD = 0.10 (the "is this plausible at all"
// line). verification.py's PLAUSIBILITY_HARD_REJECT_THRESHOLD = 0.02 is the hard-reject floor
// below that. Between the two is worth a look, not an automatic pass or fail.
const PLAUSIBILITY_HARD_REJECT_THRESHOLD = 0.02;
const PLAUSIBILITY_THRESHOLD = 0.1;

export function plausibilitySignal(result: PhotoVerificationResult | null): SignalLevel {
  if (!result) return "none";
  if (result.plausibilityScore < PLAUSIBILITY_HARD_REJECT_THRESHOLD) return "red";
  if (result.plausibilityScore < PLAUSIBILITY_THRESHOLD) return "amber";
  return "green";
}

export function overallSignal(result: PhotoVerificationResult | null): SignalLevel {
  if (!result) return "none";
  if (result.overallFlag === "clear") return "green";
  if (result.overallFlag === "review") return "amber";
  return "red";
}
