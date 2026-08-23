/**
 * Client for mrv-engine's anti-fraud photo checks (POST /photo/verify-submission — see
 * mrv-engine/mrv_engine/photo/verification.py for what it actually does and why).
 *
 * This is advisory, never a gate. It never decides whether a submission is accepted: it produces
 * information a human verifier reads before approving or rejecting the underlying MRV claim.
 * Nothing in routes/mrv.ts's submit handler branches on overallFlag — a "reject" result gets
 * stored and shown exactly like a "clear" one, on the same submission, which still goes on chain
 * exactly the same way. Photo verification failing outright (mrv-engine unreachable, a corrupt
 * upload) is handled the same way: log it, store nothing, let the real submission proceed. A
 * photo-check outage must never block an NGO's actual MRV submission.
 */

import { config } from "../config";
import type { LatLng } from "../utils/geo";
import { logStage } from "../utils/logger";

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

interface VerifyPhotoParams {
  photoBuffer: Buffer;
  photoFilename: string;
  photoMimeType: string;
  projectId: number;
  boundary: LatLng[];
  knownHashes: string[];
}

/**
 * Calls mrv-engine's combined photo check. Returns null (never throws) on any failure — a
 * malformed photo, mrv-engine being down, a network hiccup — since the caller's job (recording
 * an MRV submission) must succeed independently of this succeeding. The failure is logged, not
 * silently swallowed: an operator watching the console sees exactly what happened.
 */
export async function verifyPhotoSubmission(params: VerifyPhotoParams): Promise<PhotoVerificationResult | null> {
  const formData = new FormData();
  formData.append("file", new Blob([params.photoBuffer], { type: params.photoMimeType }), params.photoFilename);
  formData.append("project_id", String(params.projectId));
  formData.append("boundary", JSON.stringify(params.boundary));
  formData.append("known_hashes", JSON.stringify(params.knownHashes));

  try {
    const response = await fetch(`${config.mrvEngineUrl}/photo/verify-submission`, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      logStage("PHOTO-CHECK", "mrv-engine rejected the verification request", {
        status: response.status,
        detail: JSON.stringify(body),
      });
      return null;
    }

    const result = (await response.json()) as PhotoVerificationResult;
    logStage("PHOTO-CHECK", `Result: ${result.overallFlag}`, {
      locationValid: result.locationValid,
      isDuplicate: result.isDuplicate,
      plausibilityScore: result.plausibilityScore,
    });
    return result;
  } catch (error) {
    logStage("PHOTO-CHECK", "Could not reach mrv-engine — continuing without a photo verification result", {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}
