import { CopyableCode } from "@/components/CopyableCode";
import type { PurchaseSplit } from "@/lib/api";
import { formatDateTime, formatNKR, formatNumber } from "@/lib/format";

export interface LifecycleEvent {
  kind: "mint" | "transfer" | "retirement" | "purchase";
  tokenId: string;
  vintage: number;
  from: string;
  to: string;
  amount: string;
  txHash: string;
  occurredAt: string;
  reason?: string;
  purchase?: PurchaseSplit | null;
}

const KIND_LABEL: Record<LifecycleEvent["kind"], string> = {
  mint: "Minted",
  transfer: "Transferred",
  retirement: "Retired",
  purchase: "Purchased",
};

function KindBadge({ kind }: { kind: LifecycleEvent["kind"] }) {
  if (kind === "retirement") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded bg-ink-900 px-2 py-1 text-xs font-semibold text-mudflat-50">
        Retired
      </span>
    );
  }
  const dotColor = kind === "mint" ? "bg-sand-500" : kind === "purchase" ? "bg-water-700" : "bg-teal-500";
  return (
    <span className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-900">
      <span className={`h-1.5 w-1.5 rounded-full ${dotColor}`} />
      {KIND_LABEL[kind]}
    </span>
  );
}

/** Compact one-line split breakdown, used wherever a purchase event needs to show its price. */
export function PurchaseSplitLine({ split }: { split: PurchaseSplit }) {
  return (
    <span className="font-data text-xs text-ink-500">
      {formatNKR(split.totalPrice)} paid · {formatNKR(split.ngoAmount)} NGO / {formatNKR(split.platformAmount)} platform / {formatNKR(split.communityAmount)} community
    </span>
  );
}

/** Shows a project's credit history across possibly several vintages, or one token's on /verify. */
export function CreditLifecycleTable({ events, showVintage = true }: { events: LifecycleEvent[]; showVintage?: boolean }) {
  if (events.length === 0) {
    return <p className="py-8 text-center text-sm text-ink-500">No on-chain activity recorded yet.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-mudflat-200 text-left text-xs tracking-wide text-ink-500 uppercase">
            <th className="py-2 pr-4 font-medium">Event</th>
            {showVintage ? <th className="py-2 pr-4 font-medium">Vintage</th> : null}
            <th className="py-2 pr-4 font-medium">Amount</th>
            <th className="py-2 pr-4 font-medium">From</th>
            <th className="py-2 pr-4 font-medium">To</th>
            <th className="py-2 pr-4 font-medium">Date</th>
            <th className="py-2 pr-4 font-medium">Transaction</th>
          </tr>
        </thead>
        <tbody>
          {events.map((event, index) => (
            <tr key={`${event.txHash}-${index}`} className="border-b border-mudflat-100 last:border-0">
              <td className="py-3 pr-4">
                <KindBadge kind={event.kind} />
                {event.reason ? <p className="mt-1 max-w-[220px] text-xs text-ink-500">{event.reason}</p> : null}
                {event.purchase ? (
                  <p className="mt-1 max-w-[240px]">
                    <PurchaseSplitLine split={event.purchase} />
                  </p>
                ) : null}
              </td>
              {showVintage ? <td className="py-3 pr-4 font-data text-ink-700">{event.vintage}</td> : null}
              <td className="py-3 pr-4 font-data font-medium text-ink-900">{formatNumber(event.amount)} tCO2e</td>
              <td className="py-3 pr-4">
                <CopyableCode value={event.from} className="border-transparent text-ink-500 hover:border-ink-500/30" />
              </td>
              <td className="py-3 pr-4">
                <CopyableCode value={event.to} className="border-transparent text-ink-500 hover:border-ink-500/30" />
              </td>
              <td className="py-3 pr-4 text-ink-500">{formatDateTime(event.occurredAt)}</td>
              <td className="py-3 pr-4">
                <CopyableCode value={event.txHash} className="border-transparent text-teal-600 hover:border-teal-600/30" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
