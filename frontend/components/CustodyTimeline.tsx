import type { LifecycleEvent } from "@/components/CreditLifecycleTable";
import { CopyableCode } from "@/components/CopyableCode";
import { formatDateTime, formatNKR, formatNumber } from "@/lib/format";

const KIND_LABEL: Record<LifecycleEvent["kind"], string> = {
  mint: "Issued",
  transfer: "Transferred",
  retirement: "Retired",
  purchase: "Purchased",
};

/** Vertical chain-of-custody timeline for the verify page's dark register — the one place this deserves more presence than a flat table. */
export function CustodyTimeline({ events }: { events: LifecycleEvent[] }) {
  if (events.length === 0) {
    return <p className="py-8 text-center text-sm text-foam-400">No on-chain activity recorded yet.</p>;
  }

  return (
    <ol className="relative">
      <div className="absolute top-2 bottom-2 left-[7px] w-px bg-water-700" aria-hidden="true" />
      {events.map((event, index) => {
        const isRetirement = event.kind === "retirement";
        return (
          <li key={`${event.txHash}-${index}`} className="relative flex gap-5 pb-8 last:pb-0">
            <span
              className={`relative z-10 mt-1.5 h-3.5 w-3.5 shrink-0 rounded-full border-2 ${
                isRetirement
                  ? "border-sand-300 bg-water-950"
                  : event.kind === "mint"
                    ? "border-sand-500 bg-sand-500"
                    : "border-teal-500 bg-teal-500"
              }`}
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <p className="font-medium text-foam-100">
                  {KIND_LABEL[event.kind]}
                  <span className="ml-2 font-data text-sm font-normal text-sand-300">
                    {formatNumber(event.amount)} tCO2e
                  </span>
                </p>
                <p className="font-data text-xs text-foam-400">{formatDateTime(event.occurredAt)}</p>
              </div>

              {event.reason ? <p className="mt-1 text-sm text-foam-200">&ldquo;{event.reason}&rdquo;</p> : null}

              {event.purchase ? (
                <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg border border-water-700 bg-water-900 px-3 py-2.5 text-xs sm:grid-cols-4">
                  <div>
                    <p className="text-foam-400">Paid</p>
                    <p className="font-data mt-0.5 text-foam-100">{formatNKR(event.purchase.totalPrice)}</p>
                  </div>
                  <div>
                    <p className="text-foam-400">NGO</p>
                    <p className="font-data mt-0.5 text-foam-100">{formatNKR(event.purchase.ngoAmount)}</p>
                  </div>
                  <div>
                    <p className="text-foam-400">Platform</p>
                    <p className="font-data mt-0.5 text-foam-100">{formatNKR(event.purchase.platformAmount)}</p>
                  </div>
                  <div>
                    <p className="text-foam-400">Community</p>
                    <p className="font-data mt-0.5 text-foam-100">{formatNKR(event.purchase.communityAmount)}</p>
                  </div>
                </div>
              ) : null}

              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-foam-400">
                <span className="flex items-center gap-1.5">
                  from <CopyableCode value={event.from} className="border-water-700 text-foam-200" />
                </span>
                <span className="flex items-center gap-1.5">
                  to <CopyableCode value={event.to} className="border-water-700 text-foam-200" />
                </span>
                <span className="flex items-center gap-1.5">
                  tx <CopyableCode value={event.txHash} className="border-water-700 text-teal-400" />
                </span>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
