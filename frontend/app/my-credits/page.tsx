"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";
import { EcosystemBadge } from "@/components/Badge";
import { useSession } from "@/lib/auth";
import { connectWallet, signMessage, NoWalletError } from "@/lib/wallet";
import {
  requestNonce,
  verifySignature,
  registerUser,
  fetchHoldings,
  retireCredits,
  fetchCreditHistory,
  ApiError,
  type CreditHolding,
  type CreditHistoryRetirement,
} from "@/lib/api";
import { formatDateTime, formatTonnes, truncateAddress } from "@/lib/format";

interface RetirementRow extends CreditHistoryRetirement {
  tokenId: string;
  projectName: string | null;
}

export default function MyCreditsPage() {
  const { session, setSession } = useSession();
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [holdings, setHoldings] = useState<CreditHolding[] | null>(null);
  const [retirements, setRetirements] = useState<RetirementRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  async function load(address: string) {
    setLoadError(null);
    try {
      const held = await fetchHoldings(address);
      setHoldings(held);

      const histories = await Promise.all(held.map((h) => fetchCreditHistory(h.tokenId)));
      const rows: RetirementRow[] = [];
      histories.forEach((history, i) => {
        if (!history) return;
        for (const r of history.retirements) {
          if (r.retiredByAddress.toLowerCase() === address.toLowerCase()) {
            rows.push({ ...r, tokenId: held[i].tokenId, projectName: history.project?.name ?? null });
          }
        }
      });
      rows.sort((a, b) => new Date(b.retiredAt).getTime() - new Date(a.retiredAt).getTime());
      setRetirements(rows);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "Could not load your credits.");
    }
  }

  useEffect(() => {
    if (session) load(session.user.walletAddress);
  }, [session]);

  async function handleConnect() {
    setConnecting(true);
    setConnectError(null);
    try {
      const walletAddress = await connectWallet();
      const message = await requestNonce(walletAddress);
      const signature = await signMessage(message);
      const verified = await verifySignature(walletAddress, signature);

      if (!verified.registered || !verified.user) {
        const registered = await registerUser("BUYER", verified.token);
        setSession({ token: registered.token, user: registered.user });
        return;
      }
      setSession({ token: verified.token, user: verified.user });
    } catch (err) {
      if (err instanceof NoWalletError) setConnectError(err.message);
      else if (err instanceof ApiError) setConnectError(err.message);
      else if (err instanceof Error && /rejected|denied/i.test(err.message)) setConnectError("Wallet request was rejected.");
      else setConnectError("Could not connect. Check the browser console for details.");
      console.error(err);
    } finally {
      setConnecting(false);
    }
  }

  return (
    <div className="min-h-screen bg-mudflat-50 text-ink-900">
      <SiteNav register="mudflat" />

      <section className="mx-auto max-w-4xl px-6 pt-14 pb-8">
        <p className="font-data text-xs uppercase tracking-[0.2em] text-teal-600">Your holdings</p>
        <h1 className="mt-3 font-display text-4xl font-medium sm:text-5xl">My credits</h1>
        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-ink-700">
          Everything the connected wallet currently holds, and every retirement it&rsquo;s made.
        </p>
      </section>

      <section className="mx-auto max-w-4xl px-6 pb-24">
        {!session ? (
          <div className="rounded-xl border border-mudflat-200 bg-white p-8 text-center">
            <button
              type="button"
              onClick={handleConnect}
              disabled={connecting}
              className="rounded-full bg-water-900 px-6 py-3 text-sm font-semibold text-mudflat-50 hover:bg-water-700 disabled:opacity-60"
            >
              {connecting ? "Connecting…" : "Connect wallet"}
            </button>
            {connectError ? <p className="mt-4 text-sm text-coral-600">{connectError}</p> : null}
          </div>
        ) : (
          <>
            <p className="font-data mb-4 text-xs text-ink-500">
              connected as {truncateAddress(session.user.walletAddress)}
            </p>

            {loadError ? (
              <p className="rounded-lg border border-coral-500/30 bg-coral-500/10 px-4 py-3 text-sm text-coral-600">{loadError}</p>
            ) : null}

            <h2 className="font-display text-xl font-medium">Holdings</h2>
            {holdings === null ? (
              <p className="mt-3 text-sm text-ink-500">Loading…</p>
            ) : holdings.length === 0 ? (
              <p className="mt-3 rounded-xl border border-dashed border-mudflat-200 px-6 py-10 text-center text-sm text-ink-500">
                This wallet doesn&rsquo;t hold any credits yet — buy some from the{" "}
                <Link href="/marketplace" className="text-teal-600 underline underline-offset-2">
                  marketplace
                </Link>
                .
              </p>
            ) : (
              <div className="mt-3 flex flex-col gap-3">
                {holdings.map((holding) => (
                  <HoldingRow key={holding.tokenId} holding={holding} holderAddress={session.user.walletAddress} onRetired={() => load(session.user.walletAddress)} />
                ))}
              </div>
            )}

            <h2 className="mt-10 font-display text-xl font-medium">Retirement history</h2>
            {retirements === null ? (
              <p className="mt-3 text-sm text-ink-500">Loading…</p>
            ) : retirements.length === 0 ? (
              <p className="mt-3 text-sm text-ink-500">No retirements yet.</p>
            ) : (
              <div className="mt-3 overflow-x-auto rounded-xl border border-mudflat-200 bg-white">
                <table className="w-full min-w-[640px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-mudflat-200 text-left text-xs tracking-wide text-ink-500 uppercase">
                      <th className="px-4 py-2.5 font-medium">Project</th>
                      <th className="px-4 py-2.5 font-medium">Amount</th>
                      <th className="px-4 py-2.5 font-medium">Reason</th>
                      <th className="px-4 py-2.5 font-medium">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {retirements.map((r) => (
                      <tr key={`${r.tokenId}-${r.retirementId}`} className="border-b border-mudflat-100 last:border-0">
                        <td className="px-4 py-3">
                          <Link href={`/verify/${r.tokenId}`} className="text-teal-600 underline underline-offset-2">
                            {r.projectName ?? `token ${r.tokenId}`}
                          </Link>
                        </td>
                        <td className="font-data px-4 py-3">{formatTonnes(r.amount)}</td>
                        <td className="px-4 py-3 text-ink-700">{r.reason}</td>
                        <td className="px-4 py-3 text-ink-500">{formatDateTime(r.retiredAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </section>

      <SiteFooter register="mudflat" />
    </div>
  );
}

function HoldingRow({
  holding,
  holderAddress,
  onRetired,
}: {
  holding: CreditHolding;
  holderAddress: string;
  onRetired: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(1);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRetire() {
    if (!reason.trim() || amount < 1) return;
    setBusy(true);
    setError(null);
    try {
      await retireCredits(holding.tokenId, amount, reason.trim(), holderAddress);
      setOpen(false);
      setReason("");
      onRetired();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Retirement failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-mudflat-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          {holding.project ? <EcosystemBadge ecosystem={holding.project.ecosystem} /> : null}
          <p className="mt-2 font-medium text-ink-900">{holding.project?.name ?? `Token ${holding.tokenId}`}</p>
          <p className="font-data mt-0.5 text-xs text-ink-500">
            token {holding.tokenId} · vintage {holding.vintage ?? "—"}
          </p>
        </div>
        <div className="text-right">
          <p className="font-data text-lg font-medium text-ink-900">{formatTonnes(holding.balance)}</p>
          <div className="mt-2 flex justify-end gap-2">
            <Link href={`/verify/${holding.tokenId}`} className="text-xs text-teal-600 underline underline-offset-2">
              Verify
            </Link>
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="rounded-full border border-mudflat-200 px-3 py-1 text-xs font-semibold hover:bg-mudflat-200"
            >
              Retire
            </button>
          </div>
        </div>
      </div>

      {open ? (
        <div className="mt-4 border-t border-mudflat-200 pt-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-ink-700">Tonnes</span>
              <input
                type="number"
                min={1}
                max={Number(holding.balance)}
                value={amount}
                onChange={(e) => setAmount(Math.max(1, Math.min(Number(holding.balance), Number(e.target.value) || 1)))}
                className="font-data w-24 rounded-lg border border-mudflat-200 px-3 py-1.5 text-sm"
              />
            </label>
            <label className="flex flex-1 flex-col gap-1">
              <span className="text-xs font-medium text-ink-700">Reason</span>
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. FY2026 offsetting scope 1 emissions"
                className="w-full rounded-lg border border-mudflat-200 px-3 py-1.5 text-sm"
              />
            </label>
            <button
              type="button"
              onClick={handleRetire}
              disabled={busy || !reason.trim()}
              className="rounded-full bg-sand-500 px-5 py-2 text-sm font-semibold text-water-950 hover:bg-sand-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? "Retiring…" : "Confirm"}
            </button>
          </div>
          {error ? <p className="mt-2 text-sm text-coral-600">{error}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
