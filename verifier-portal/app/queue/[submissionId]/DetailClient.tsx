"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { RequireVerifier } from "@/components/RequireVerifier";
import { TopBar } from "@/components/TopBar";
import { OverallFlagPill } from "@/components/FraudIndicators";
import { locationSignal, duplicateSignal, plausibilitySignal } from "@/lib/photo";
import { useSession } from "@/lib/auth";
import { fetchSubmission, ApiError, type SubmissionDetail } from "@/lib/api";
import { formatDateTime, formatTonnes, truncateAddress } from "@/lib/format";

const GeofenceMap = dynamic(() => import("@/components/GeofenceMap").then((m) => m.GeofenceMap), { ssr: false });

const STATUS_STYLE: Record<string, string> = {
  Pending: "bg-slate-700 text-slate-300",
  Approved: "bg-signal-green-500/15 text-signal-green-400",
  Issued: "bg-signal-green-500/15 text-signal-green-400",
  Rejected: "bg-signal-red-500/15 text-signal-red-400",
};

export function SubmissionDetailClient({ submissionId }: { submissionId: string }) {
  return (
    <RequireVerifier>
      <TopBar />
      <Detail submissionId={submissionId} />
    </RequireVerifier>
  );
}

function Detail({ submissionId }: { submissionId: string }) {
  const { session } = useSession();
  const [submission, setSubmission] = useState<SubmissionDetail | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    fetchSubmission(submissionId, session.token)
      .then((data) => {
        if (cancelled) return;
        if (!data) setNotFound(true);
        else setSubmission(data);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : "Could not load this submission.");
      });
    return () => {
      cancelled = true;
    };
  }, [submissionId, session]);

  if (error) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        <p className="rounded border border-signal-red-500/30 bg-signal-red-500/10 px-4 py-3 text-sm text-signal-red-400">
          {error}
        </p>
      </main>
    );
  }

  if (notFound) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-16 text-center sm:px-6">
        <p className="text-sm text-slate-400">No submission #{submissionId} exists.</p>
        <Link href="/queue" className="mt-4 inline-block text-sm text-accent-400 hover:underline">
          Back to queue
        </Link>
      </main>
    );
  }

  if (!submission) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        <div className="h-64 animate-pulse rounded border border-slate-800 bg-slate-900" />
      </main>
    );
  }

  const photo = submission.photoVerification;

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      <Link href="/queue" className="text-sm text-slate-500 hover:text-slate-300">
        ← Queue
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-data text-xl font-semibold text-slate-100">Submission #{submission.submissionId}</h1>
            <span className={`inline-flex items-center rounded px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${STATUS_STYLE[submission.status] ?? "bg-slate-700 text-slate-300"}`}>
              {submission.status}
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-400">
            {submission.project?.name ?? `Project #${submission.projectId}`} · vintage {submission.vintage}
          </p>
        </div>
        <OverallFlagPill result={photo} />
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        {/* Photo — honestly, since this demo never persists the uploaded image. */}
        <section className="rounded border border-slate-800 bg-slate-900">
          <h2 className="border-b border-slate-800 px-4 py-2.5 text-xs font-semibold tracking-wide text-slate-400 uppercase">
            Site photo
          </h2>
          <div className="p-4">
            {photo ? (
              <>
                <div className="flex h-40 flex-col items-center justify-center gap-2 rounded border border-dashed border-slate-700 bg-slate-950 px-4 text-center">
                  <p className="text-sm text-slate-400">Photo not stored</p>
                  <p className="max-w-xs text-xs text-slate-600">
                    This demo pipeline never persists a submitted photo — only the verification
                    result below, computed from it at submission time.
                  </p>
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                  <div>
                    <dt className="text-[11px] tracking-wide text-slate-500 uppercase">Perceptual hash</dt>
                    <dd className="font-data mt-0.5 text-xs break-all text-slate-300">{submission.photoHash}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] tracking-wide text-slate-500 uppercase">Duplicate similarity</dt>
                    <dd className="mt-0.5 text-slate-200">{Math.round(photo.similarityScore * 100)}%</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] tracking-wide text-slate-500 uppercase">Plausibility score</dt>
                    <dd className="mt-0.5 text-slate-200">{photo.plausibilityScore.toFixed(2)}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] tracking-wide text-slate-500 uppercase">Distance from boundary</dt>
                    <dd className="mt-0.5 text-slate-200">
                      {photo.distanceFromBoundary !== null ? `${Math.round(photo.distanceFromBoundary).toLocaleString()} m` : "—"}
                    </dd>
                  </div>
                </dl>
                <div className="mt-4 border-t border-slate-800 pt-4">
                  <p className="text-[11px] tracking-wide text-slate-500 uppercase">Why this flag</p>
                  <ul className="mt-2 space-y-1.5">
                    {photo.reasons.map((reason, i) => (
                      <li key={i} className="text-sm text-slate-300">
                        {reason}
                      </li>
                    ))}
                  </ul>
                </div>
              </>
            ) : (
              <p className="py-8 text-center text-sm text-slate-500">No photo was attached to this submission.</p>
            )}
          </div>
        </section>

        {/* Geofence */}
        <section className="rounded border border-slate-800 bg-slate-900">
          <h2 className="border-b border-slate-800 px-4 py-2.5 text-xs font-semibold tracking-wide text-slate-400 uppercase">
            Geofence
          </h2>
          <div className="h-56 p-4">
            {submission.project ? (
              <GeofenceMap
                boundary={submission.project.boundary}
                locationValid={photo?.locationValid ?? false}
                hasLocationData={photo?.hasLocationData ?? false}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-slate-500">No project data.</div>
            )}
          </div>
          <div className="flex items-center gap-4 border-t border-slate-800 px-4 py-3 text-xs text-slate-400">
            <LegendDot signal={locationSignal(photo)} label="Location" />
            <LegendDot signal={duplicateSignal(photo)} label="Duplicate" />
            <LegendDot signal={plausibilitySignal(photo)} label="Plausibility" />
          </div>
        </section>

        {/* MRV data */}
        <section className="rounded border border-slate-800 bg-slate-900 lg:col-span-2">
          <h2 className="border-b border-slate-800 px-4 py-2.5 text-xs font-semibold tracking-wide text-slate-400 uppercase">
            MRV claim
          </h2>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 p-4 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-[11px] tracking-wide text-slate-500 uppercase">Tonnes claimed</dt>
              <dd className="font-data mt-0.5 text-slate-100">{formatTonnes(submission.tonnesCO2)}</dd>
            </div>
            <div>
              <dt className="text-[11px] tracking-wide text-slate-500 uppercase">Submitted</dt>
              <dd className="mt-0.5 text-slate-200">{formatDateTime(submission.submittedAt)}</dd>
            </div>
            <div>
              <dt className="text-[11px] tracking-wide text-slate-500 uppercase">Submitted by</dt>
              <dd className="font-data mt-0.5 text-slate-200">{truncateAddress(submission.submittedByAddress)}</dd>
            </div>
            <div>
              <dt className="text-[11px] tracking-wide text-slate-500 uppercase">Data hash</dt>
              <dd className="font-data mt-0.5 text-xs break-all text-slate-400">{submission.dataHash}</dd>
            </div>
            <div className="col-span-2 sm:col-span-4">
              <dt className="text-[11px] tracking-wide text-slate-500 uppercase">Methodology</dt>
              <dd className="mt-0.5 text-slate-200">{submission.methodology}</dd>
            </div>
            <div className="col-span-2 sm:col-span-4">
              <dt className="text-[11px] tracking-wide text-slate-500 uppercase">Supporting data</dt>
              <dd className="mt-0.5 text-slate-200">{submission.supportingDataRef}</dd>
            </div>
          </dl>
        </section>
      </div>

      <div className="mt-6 flex justify-end gap-3">
        <button
          type="button"
          disabled
          title="Wired up in the next commit"
          className="rounded border border-signal-red-500/40 px-5 py-2.5 text-sm font-semibold text-signal-red-400 opacity-50"
        >
          Reject
        </button>
        <button
          type="button"
          disabled
          title="Wired up in the next commit"
          className="rounded bg-signal-green-500 px-5 py-2.5 text-sm font-semibold text-slate-950 opacity-50"
        >
          Approve
        </button>
      </div>
    </main>
  );
}

function LegendDot({ signal, label }: { signal: string; label: string }) {
  const color =
    signal === "green" ? "bg-signal-green-500" : signal === "amber" ? "bg-signal-amber-500" : signal === "red" ? "bg-signal-red-500" : "bg-slate-600";
  return (
    <span className="flex items-center gap-1.5">
      <span className={`h-2 w-2 rounded-full ${color}`} />
      {label}
    </span>
  );
}
