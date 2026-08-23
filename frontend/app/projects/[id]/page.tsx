import Link from "next/link";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";
import { EcosystemBadge, StatusBadge } from "@/components/Badge";
import { CopyableCode } from "@/components/CopyableCode";
import { ProjectMap } from "@/components/ProjectMap";
import { ReportingTimelineChart } from "@/components/ReportingTimelineChart";
import { CreditLifecycleTable, type LifecycleEvent } from "@/components/CreditLifecycleTable";
import { RootMark } from "@/components/RootMotif";
import { fetchProject, fetchCreditHistory } from "@/lib/api";
import { polygonAreaHectares } from "@/lib/geo";
import { formatDate, formatNumber } from "@/lib/format";

export async function generateMetadata(props: PageProps<"/projects/[id]">) {
  const { id } = await props.params;
  const detail = await fetchProject(id);
  return { title: detail ? `${detail.project.name} — NeelKosh` : `Project ${id} — NeelKosh` };
}

export default async function ProjectDetailPage(props: PageProps<"/projects/[id]">) {
  const { id } = await props.params;
  const detail = await fetchProject(id);

  if (!detail) {
    return (
      <div className="flex min-h-screen flex-col bg-mudflat-50 text-ink-900">
        <SiteNav register="mudflat" />
        <div className="mx-auto flex flex-1 max-w-2xl flex-col items-center justify-center gap-4 px-6 text-center">
          <RootMark className="h-10 w-10 text-teal-500" />
          <h1 className="font-display text-2xl font-medium">No project with id {id}</h1>
          <p className="text-ink-500">Check the number, or browse the full registry.</p>
          <Link href="/projects" className="mt-2 rounded-full bg-water-900 px-6 py-3 text-sm font-semibold text-mudflat-50">
            Back to projects
          </Link>
        </div>
        <SiteFooter register="mudflat" />
      </div>
    );
  }

  const { project, reportingPeriods, credits } = detail;
  const areaHectares = polygonAreaHectares(project.boundary);

  const historyResults = await Promise.all(credits.batches.map((batch) => fetchCreditHistory(batch.tokenId)));

  const lifecycleEvents: LifecycleEvent[] = [];
  historyResults.forEach((history, index) => {
    if (!history) return;
    const batch = credits.batches[index];
    const retirementByTx = new Map(history.retirements.map((r) => [r.txHash, r]));
    for (const transfer of history.transfers) {
      lifecycleEvents.push({
        kind: transfer.kind,
        tokenId: batch.tokenId,
        vintage: batch.vintage,
        from: transfer.from,
        to: transfer.to,
        amount: transfer.amount,
        txHash: transfer.txHash,
        occurredAt: transfer.occurredAt,
        reason: transfer.kind === "retirement" ? retirementByTx.get(transfer.txHash)?.reason : undefined,
      });
    }
  });
  lifecycleEvents.sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime());

  return (
    <div className="min-h-screen bg-mudflat-50 text-ink-900">
      <SiteNav register="mudflat" />

      <section className="mx-auto max-w-6xl px-6 pt-12 pb-8">
        <Link href="/projects" className="text-sm text-ink-500 hover:text-teal-600">
          ← All projects
        </Link>

        <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap gap-2">
              <EcosystemBadge ecosystem={project.ecosystem} />
              <StatusBadge status={project.status} />
            </div>
            <h1 className="mt-3 font-display text-3xl font-medium sm:text-4xl">{project.name}</h1>
          </div>
        </div>

        <dl className="mt-6 grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-4">
          <div>
            <dt className="font-data text-[11px] tracking-wide text-ink-500 uppercase">Area</dt>
            <dd className="font-data text-sm font-medium">{formatNumber(Math.round(areaHectares))} ha</dd>
          </div>
          <div>
            <dt className="font-data text-[11px] tracking-wide text-ink-500 uppercase">Registered</dt>
            <dd className="font-data text-sm font-medium">{formatDate(project.registeredAt)}</dd>
          </div>
          <div>
            <dt className="font-data text-[11px] tracking-wide text-ink-500 uppercase">Implementer</dt>
            <dd className="mt-0.5">
              <CopyableCode value={project.implementerAddress} className="border-mudflat-200 text-ink-700" />
            </dd>
          </div>
          <div>
            <dt className="font-data text-[11px] tracking-wide text-ink-500 uppercase">Registration tx</dt>
            <dd className="mt-0.5">
              <CopyableCode value={project.registrationTxHash} className="border-mudflat-200 text-ink-700" />
            </dd>
          </div>
        </dl>

        {project.metadata?.description ? (
          <p className="mt-6 max-w-3xl text-lg leading-relaxed text-ink-700">{project.metadata.description}</p>
        ) : null}
        {project.metadata?.story ? (
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-ink-500">{project.metadata.story}</p>
        ) : null}
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-12">
        <h2 className="font-data text-xs uppercase tracking-[0.2em] text-teal-600">Boundary</h2>
        <div className="mt-3 h-[380px] overflow-hidden rounded-xl border border-mudflat-200">
          <ProjectMap boundary={project.boundary} />
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-12">
        <h2 className="font-data text-xs uppercase tracking-[0.2em] text-teal-600">Growth &amp; verification</h2>
        <p className="mt-2 max-w-2xl text-sm text-ink-500">
          Vegetation health (NDVI) and verified carbon per reporting period. NDVI is only shown for
          submissions that included it as supporting evidence.
        </p>
        <div className="mt-6 rounded-xl border border-mudflat-200 bg-white p-4 sm:p-6">
          {reportingPeriods.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-500">No reporting periods submitted yet.</p>
          ) : (
            <ReportingTimelineChart periods={reportingPeriods} />
          )}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-24">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-data text-xs uppercase tracking-[0.2em] text-teal-600">Credit lifecycle</h2>
          <p className="font-data text-xs text-ink-500">
            {formatNumber(credits.totals.totalMinted)} minted · {formatNumber(credits.totals.totalRetired)} retired ·{" "}
            {formatNumber(credits.totals.circulatingSupply)} circulating
          </p>
        </div>
        <div className="mt-6 rounded-xl border border-mudflat-200 bg-white p-4 sm:p-6">
          <CreditLifecycleTable events={lifecycleEvents} />
        </div>
      </section>

      <SiteFooter register="mudflat" />
    </div>
  );
}
