"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { RequireVerifier } from "@/components/RequireVerifier";
import { TopBar } from "@/components/TopBar";
import { FraudIndicatorRow, OverallFlagPill } from "@/components/FraudIndicators";
import { useSession } from "@/lib/auth";
import { fetchPendingSubmissions, ApiError, type SubmissionDetail } from "@/lib/api";
import { formatDateTime, formatTonnes, truncateAddress } from "@/lib/format";

export default function QueuePage() {
  return (
    <RequireVerifier>
      <TopBar />
      <QueueList />
    </RequireVerifier>
  );
}

function QueueList() {
  const { session } = useSession();
  const [submissions, setSubmissions] = useState<SubmissionDetail[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    fetchPendingSubmissions(session.token)
      .then((data) => {
        if (!cancelled) setSubmissions(data);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : "Could not load the queue.");
      });
    return () => {
      cancelled = true;
    };
  }, [session]);

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <div className="mb-5 flex items-baseline justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-100">Pending submissions</h1>
          <p className="mt-0.5 text-sm text-slate-500">MRV claims awaiting your review, oldest first.</p>
        </div>
        {submissions ? (
          <span className="font-data text-sm text-slate-400">{submissions.length} pending</span>
        ) : null}
      </div>

      {error ? (
        <p className="rounded border border-signal-red-500/30 bg-signal-red-500/10 px-4 py-3 text-sm text-signal-red-400">
          {error}
        </p>
      ) : null}

      {!submissions && !error ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded border border-slate-800 bg-slate-900" />
          ))}
        </div>
      ) : null}

      {submissions && submissions.length === 0 ? (
        <div className="rounded border border-slate-800 bg-slate-900 px-6 py-16 text-center">
          <p className="text-sm text-slate-400">Nothing waiting on review right now.</p>
        </div>
      ) : null}

      {submissions && submissions.length > 0 ? (
        <div className="overflow-x-auto rounded border border-slate-800">
          <table className="w-full min-w-[880px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900 text-left text-[11px] tracking-wide text-slate-500 uppercase">
                <th className="px-4 py-2.5 font-medium">Submitted</th>
                <th className="px-4 py-2.5 font-medium">Project</th>
                <th className="px-4 py-2.5 font-medium">Vintage</th>
                <th className="px-4 py-2.5 font-medium">Tonnes claimed</th>
                <th className="px-4 py-2.5 font-medium">Fraud checks</th>
                <th className="px-4 py-2.5 font-medium">Flag</th>
                <th className="px-4 py-2.5 font-medium">Submitted by</th>
              </tr>
            </thead>
            <tbody>
              {submissions.map((submission) => (
                <tr key={submission.submissionId} className="border-b border-slate-800 bg-slate-950 last:border-0 hover:bg-slate-900">
                  <td className="px-4 py-3">
                    <Link
                      href={`/queue/${submission.submissionId}`}
                      className="font-data text-accent-400 hover:underline"
                    >
                      #{submission.submissionId}
                    </Link>
                    <p className="mt-0.5 text-xs text-slate-500">{formatDateTime(submission.submittedAt)}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-200">
                    {submission.project?.name ?? `Project #${submission.projectId}`}
                  </td>
                  <td className="px-4 py-3 font-data text-slate-300">{submission.vintage}</td>
                  <td className="px-4 py-3 font-data text-slate-300">{formatTonnes(submission.tonnesCO2)}</td>
                  <td className="px-4 py-3">
                    <FraudIndicatorRow result={submission.photoVerification} />
                  </td>
                  <td className="px-4 py-3">
                    <OverallFlagPill result={submission.photoVerification} />
                  </td>
                  <td className="px-4 py-3 font-data text-xs text-slate-500">
                    {truncateAddress(submission.submittedByAddress)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </main>
  );
}
