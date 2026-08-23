import {
  duplicateSignal,
  locationSignal,
  overallSignal,
  plausibilitySignal,
  type PhotoVerificationResult,
  type SignalLevel,
} from "@/lib/photo";

const DOT_COLOR: Record<SignalLevel, string> = {
  green: "bg-signal-green-500",
  amber: "bg-signal-amber-500",
  red: "bg-signal-red-500",
  none: "bg-slate-600",
};

const PILL_STYLE: Record<SignalLevel, string> = {
  green: "bg-signal-green-500/15 text-signal-green-400",
  amber: "bg-signal-amber-500/15 text-signal-amber-400",
  red: "bg-signal-red-500/15 text-signal-red-400",
  none: "bg-slate-700 text-slate-400",
};

const OVERALL_LABEL: Record<PhotoVerificationResult["overallFlag"], string> = {
  clear: "Clear",
  review: "Review",
  reject: "Reject",
};

function Dot({ level, label }: { level: SignalLevel; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5" title={label}>
      <span className={`h-2 w-2 shrink-0 rounded-full ${DOT_COLOR[level]}`} aria-hidden="true" />
      <span className="text-[11px] text-slate-400">{label}</span>
    </span>
  );
}

/** The three individual fraud-check signals plus the aggregate flag, compact — one row's worth. */
export function FraudIndicatorRow({ result }: { result: PhotoVerificationResult | null }) {
  if (!result) {
    return <span className="text-xs text-slate-500">No photo attached</span>;
  }
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
      <Dot level={locationSignal(result)} label="Location" />
      <Dot level={duplicateSignal(result)} label="Duplicate" />
      <Dot level={plausibilitySignal(result)} label="Plausibility" />
    </div>
  );
}

export function OverallFlagPill({ result }: { result: PhotoVerificationResult | null }) {
  const level = overallSignal(result);
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${PILL_STYLE[level]}`}>
      {result ? OVERALL_LABEL[result.overallFlag] : "No photo"}
    </span>
  );
}
