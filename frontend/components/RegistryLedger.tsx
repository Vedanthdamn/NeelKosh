import type { RegistryStats } from "@/lib/api";
import { formatNumber } from "@/lib/format";

const ROWS: { key: keyof RegistryStats; label: string; suffix?: string }[] = [
  { key: "totalProjects", label: "Restoration projects registered" },
  { key: "totalTonnesVerified", label: "Tonnes CO2e verified", suffix: "tCO2e" },
  { key: "totalCreditsRetired", label: "Credits retired", suffix: "tCO2e" },
];

/**
 * The live counter — styled as a field-log readout rather than a generic stat-card row, so it
 * reads as "this is the registry's actual current state" rather than a marketing highlight.
 */
export function RegistryLedger({ stats }: { stats: RegistryStats }) {
  return (
    <div className="w-full max-w-md rounded-lg border border-water-700/70 bg-water-900/60 backdrop-blur-sm">
      <div className="flex items-center justify-between border-b border-water-700/70 px-5 py-3">
        <span className="font-data text-[11px] uppercase tracking-[0.15em] text-foam-400">Registry log</span>
        <span className="flex items-center gap-1.5 font-data text-[11px] text-foam-400">
          <span className="h-1.5 w-1.5 rounded-full bg-teal-400" aria-hidden="true" />
          live
        </span>
      </div>
      <dl>
        {ROWS.map((row, index) => (
          <div
            key={row.key}
            className={`flex items-baseline justify-between px-5 py-4 ${
              index !== ROWS.length - 1 ? "border-b border-water-800" : ""
            }`}
          >
            <dt className="text-sm text-foam-200">{row.label}</dt>
            <dd className="font-data text-xl font-medium text-sand-300">
              {formatNumber(stats[row.key])}
              {row.suffix ? <span className="ml-1 text-xs text-foam-400">{row.suffix}</span> : null}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
