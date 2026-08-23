"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { RequireVerifier } from "@/components/RequireVerifier";
import { TopBar } from "@/components/TopBar";
import { useSession } from "@/lib/auth";
import { fetchDecidedSubmissions, ApiError, type SubmissionDetail } from "@/lib/api";
import { formatDateTime, formatTonnes } from "@/lib/format";

const STATUS_STYLE: Record<string, string> = {
  Approved: "bg-signal-green-500/15 text-signal-green-400",
  Issued: "bg-signal-green-500/15 text-signal-green-400",
  Rejected: "bg-signal-red-500/15 text-signal-red-400",
};

export default function HistoryPage() {
  return (
    <RequireVerifier>
      <TopBar />
      <History />
    </RequireVerifier>
  );
}

function History() {
  const { session } = useSession();
  const [submissions, setSubmissions] = useState<SubmissionDetail[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    fetchDecidedSubmissions(session.user.walletAddress, session.token)
      .then((data) => {
        if (!cancelled) setSubmissions(data);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : "Could not load your decision history.");
      });
    return () => {
      cancelled = true;
    };
  }, [session]);

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <h1 className="text-lg font-semibold text-slate-100">Your decisions</h1>
      <p className="mt-0.5 text-sm text-slate-500">Every submission you&rsquo;ve approved or rejected, most recent first.</p>

      {error ? (
        <p className="mt-5 rounded border border-signal-red-500/30 bg-signal-red-500/10 px-4 py-3 text-sm text-signal-red-400">
          {error}
        </p>
      ) : null}

      {!submissions && !error ? (
        <div className="mt-5 space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded border border-slate-800 bg-slate-900" />
          ))}
        </div>
      ) : null}

      {submissions && submissions.length === 0 ? (
        <div className="mt-5 rounded border border-slate-800 bg-slate-900 px-6 py-16 text-center">
          <p className="text-sm text-slate-400">No decisions recorded yet.</p>
        </div>
      ) : null}

      {submissions && submissions.length > 0 ? (
        <div className="mt-5 overflow-x-auto rounded border border-slate-800">
          <table className="w-full min-w-[760px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900 text-left text-[11px] tracking-wide text-slate-500 uppercase">
                <th className="px-4 py-2.5 font-medium">Decided</th>
                <th className="px-4 py-2.5 font-medium">Project</th>
                <th className="px-4 py-2.5 font-medium">Vintage</th>
                <th className="px-4 py-2.5 font-medium">Tonnes</th>
                <th className="px-4 py-2.5 font-medium">Outcome</th>
                <th className="px-4 py-2.5 font-medium">Note</th>
              </tr>
            </thead>
            <tbody>
              {submissions.map((submission) => (
                <tr key={submission.submissionId} className="border-b border-slate-800 bg-slate-950 last:border-0 hover:bg-slate-900">
                  <td className="px-4 py-3">
                    <Link href={`/queue/${submission.submissionId}`} className="font-data text-accent-400 hover:underline">
                      #{submission.submissionId}
                    </Link>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {submission.verifiedAt ? formatDateTime(submission.verifiedAt) : "—"}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-slate-200">{submission.project?.name ?? `Project #${submission.projectId}`}</td>
                  <td className="px-4 py-3 font-data text-slate-300">{submission.vintage}</td>
                  <td className="px-4 py-3 font-data text-slate-300">{formatTonnes(submission.tonnesCO2)}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${STATUS_STYLE[submission.status] ?? "bg-slate-700 text-slate-300"}`}>
                      {submission.status}
                    </span>
                  </td>
                  <td className="max-w-[240px] px-4 py-3 text-xs text-slate-400">{submission.rejectionReason ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </main>
  );
}
