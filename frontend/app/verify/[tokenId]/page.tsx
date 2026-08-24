import Link from "next/link";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";
import { EcosystemBadge } from "@/components/Badge";
import { CopyableCode } from "@/components/CopyableCode";
import { TokenSearchBar } from "@/components/TokenSearchBar";
import { CustodyTimeline } from "@/components/CustodyTimeline";
import { RootMark } from "@/components/RootMotif";
import type { LifecycleEvent } from "@/components/CreditLifecycleTable";
import { fetchCreditHistory } from "@/lib/api";
import { formatDate, formatDateTime, formatNumber } from "@/lib/format";

export async function generateMetadata(props: PageProps<"/verify/[tokenId]">) {
  const { tokenId } = await props.params;
  return { title: `Token ${tokenId} · NeelKosh` };
}

export default async function VerifyResultPage(props: PageProps<"/verify/[tokenId]">) {
  const { tokenId } = await props.params;
  const history = await fetchCreditHistory(tokenId);

  if (!history) {
    return (
      <div className="flex min-h-screen flex-col bg-water-950 text-foam-100">
        <SiteNav register="water" />
        <div className="mx-auto flex flex-1 max-w-xl flex-col items-center justify-center gap-5 px-6 text-center">
          <RootMark className="h-10 w-10 text-sand-300" />
          <h1 className="font-display text-2xl font-medium">No credit exists with token ID {tokenId}</h1>
          <p className="text-foam-300">Check the number and try again. Token IDs are exact.</p>
          <div className="mt-2 w-full">
            <TokenSearchBar />
          </div>
        </div>
        <SiteFooter register="water" />
      </div>
    );
  }

  const retirementByTx = new Map(history.retirements.map((r) => [r.txHash, r]));
  const events: LifecycleEvent[] = history.transfers.map((transfer) => ({
    kind: transfer.kind,
    tokenId: history.tokenId,
    vintage: history.batch.vintage,
    from: transfer.from,
    to: transfer.to,
    amount: transfer.amount,
    txHash: transfer.txHash,
    occurredAt: transfer.occurredAt,
    reason: transfer.kind === "retirement" ? retirementByTx.get(transfer.txHash)?.reason : undefined,
    purchase: transfer.purchase,
  }));

  return (
    <div className="min-h-screen bg-water-950 text-foam-100">
      <SiteNav register="water" />

      <section className="mx-auto max-w-4xl px-6 pt-14 pb-6">
        <TokenSearchBar initialValue={tokenId} />

        <div className="mt-10 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="font-data text-xs uppercase tracking-[0.2em] text-sand-300">Verified credit</p>
            <h1 className="mt-2 font-data text-3xl font-medium break-all sm:text-4xl">#{history.tokenId}</h1>
            {history.project ? (
              <p className="mt-2 text-foam-200">
                <EcosystemBadge ecosystem={history.project.ecosystem} />{" "}
                <Link href={`/projects/${history.project.projectId}`} className="ml-1 underline underline-offset-2 hover:text-sand-200">
                  {history.project.name}
                </Link>{" "}
                &middot; vintage {history.batch.vintage}
              </p>
            ) : (
              <p className="mt-2 text-foam-400">vintage {history.batch.vintage}</p>
            )}
          </div>
        </div>
      </section>

      {/* The trust payoff: the report fingerprint, prominently. */}
      <section className="mx-auto max-w-4xl px-6 pb-10">
        <div className="rounded-xl border border-sand-500/30 bg-water-900 p-6 sm:p-8">
          <p className="font-data text-xs uppercase tracking-[0.2em] text-sand-300">Report fingerprint</p>
          <p className="font-data mt-3 text-lg break-all text-sand-200 sm:text-xl">{history.batch.dataHash}</p>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-foam-300">
            This is the keccak256 hash of the MRV report this credit was minted against. Anyone can
            recompute it from the archived report and confirm it matches exactly. Change a single
            number in that report and this hash would come out completely different.
          </p>

          <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-water-700 pt-6 sm:grid-cols-4">
            <div>
              <dt className="font-data text-[11px] tracking-wide text-foam-400 uppercase">Verified by</dt>
              <dd className="mt-1">
                <CopyableCode value={history.batch.verifierAddress} className="border-water-700 text-foam-100" />
              </dd>
            </div>
            <div>
              <dt className="font-data text-[11px] tracking-wide text-foam-400 uppercase">Issued</dt>
              <dd className="mt-1 font-data text-sm">{formatDate(history.batch.issuedAt)}</dd>
            </div>
            <div>
              <dt className="font-data text-[11px] tracking-wide text-foam-400 uppercase">Issuance tx</dt>
              <dd className="mt-1">
                <CopyableCode value={history.batch.mintTxHash} className="border-water-700 text-teal-400" />
              </dd>
            </div>
            {history.origin ? (
              <div>
                <dt className="font-data text-[11px] tracking-wide text-foam-400 uppercase">Methodology</dt>
                <dd className="mt-1 text-sm text-foam-100">{history.origin.methodology}</dd>
              </div>
            ) : null}
          </dl>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-6 pb-10">
        <div className="grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-water-800 bg-water-800">
          {[
            { label: "Minted", value: history.batch.totalMinted },
            { label: "Retired", value: history.batch.totalRetired },
            { label: "Circulating", value: history.batch.circulatingSupply },
          ].map((row) => (
            <div key={row.label} className="bg-water-950 px-5 py-5">
              <p className="font-data text-[11px] tracking-wide text-foam-400 uppercase">{row.label}</p>
              <p className="font-data mt-1 text-xl font-medium text-foam-100">{formatNumber(row.value)}</p>
              <p className="font-data text-xs text-foam-400">tCO2e</p>
            </div>
          ))}
        </div>
      </section>

      {history.origin ? (
        <section className="mx-auto max-w-4xl px-6 pb-10">
          <h2 className="font-data text-xs uppercase tracking-[0.2em] text-sand-300">MRV submission</h2>
          <dl className="mt-4 grid gap-x-6 gap-y-4 sm:grid-cols-2">
            <div>
              <dt className="font-data text-[11px] tracking-wide text-foam-400 uppercase">Submitted by</dt>
              <dd className="mt-1">
                <CopyableCode value={history.origin.submittedByAddress} className="border-water-700 text-foam-100" />
              </dd>
            </div>
            <div>
              <dt className="font-data text-[11px] tracking-wide text-foam-400 uppercase">Submitted</dt>
              <dd className="mt-1 font-data text-sm">{formatDateTime(history.origin.submittedAt)}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="font-data text-[11px] tracking-wide text-foam-400 uppercase">Supporting data</dt>
              <dd className="mt-1 text-sm break-all text-foam-200">{history.origin.supportingDataRef}</dd>
            </div>
          </dl>
        </section>
      ) : null}

      <section className="mx-auto max-w-4xl px-6 pb-24">
        <h2 className="font-data text-xs uppercase tracking-[0.2em] text-sand-300">Chain of custody</h2>
        <div className="mt-6 rounded-xl border border-water-800 bg-water-900 p-6 sm:p-8">
          <CustodyTimeline events={events} />
        </div>
      </section>

      <SiteFooter register="water" />
    </div>
  );
}
