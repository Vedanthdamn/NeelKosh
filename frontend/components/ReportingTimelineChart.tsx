"use client";

import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ReportingPeriod } from "@/lib/api";
import { formatNumber } from "@/lib/format";

interface ChartPoint {
  vintage: string;
  ndvi: number | null;
  tonnesCO2: number;
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number; dataKey: string }[]; label?: string }) {
  if (!active || !payload || payload.length === 0) return null;
  const ndvi = payload.find((entry) => entry.dataKey === "ndvi");
  const carbon = payload.find((entry) => entry.dataKey === "tonnesCO2");

  return (
    <div className="rounded-lg border border-mudflat-200 bg-white px-4 py-3 shadow-lg">
      <p className="font-data text-xs text-ink-500">Vintage {label}</p>
      {carbon ? (
        <p className="mt-1 text-sm">
          <span className="font-data font-medium text-sand-700">{formatNumber(carbon.value)}</span>{" "}
          <span className="text-ink-500">tCO2e verified</span>
        </p>
      ) : null}
      {ndvi && ndvi.value != null ? (
        <p className="text-sm">
          <span className="font-data font-medium text-teal-600">{ndvi.value.toFixed(3)}</span>{" "}
          <span className="text-ink-500">NDVI</span>
        </p>
      ) : null}
    </div>
  );
}

export function ReportingTimelineChart({ periods }: { periods: ReportingPeriod[] }) {
  const data: ChartPoint[] = [...periods]
    .sort((a, b) => a.vintage - b.vintage)
    .map((period) => ({
      vintage: String(period.vintage),
      ndvi: period.ndvi,
      tonnesCO2: period.tonnesCO2,
    }));

  const hasNdvi = data.some((point) => point.ndvi != null);

  return (
    <div>
      <ResponsiveContainer width="100%" height={320}>
        <ComposedChart data={data} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="#e4d3ab" vertical={false} />
          <XAxis
            dataKey="vintage"
            tick={{ fontSize: 12, fill: "#56675f" }}
            axisLine={{ stroke: "#e4d3ab" }}
            tickLine={false}
          />
          <YAxis
            yAxisId="carbon"
            tick={{ fontSize: 12, fill: "#a97a34" }}
            axisLine={false}
            tickLine={false}
            width={54}
          />
          {hasNdvi ? (
            <YAxis
              yAxisId="ndvi"
              orientation="right"
              domain={[0, 1]}
              tick={{ fontSize: 12, fill: "#2f9884" }}
              axisLine={false}
              tickLine={false}
              width={40}
            />
          ) : null}
          <Tooltip content={<CustomTooltip />} cursor={{ fill: "#e4d3ab", opacity: 0.3 }} />
          <Bar yAxisId="carbon" dataKey="tonnesCO2" name="Tonnes CO2e verified" fill="#d9a756" radius={[4, 4, 0, 0]} barSize={32} />
          {hasNdvi ? (
            <Line
              yAxisId="ndvi"
              dataKey="ndvi"
              name="NDVI"
              stroke="#227b6b"
              strokeWidth={2.5}
              dot={{ r: 4, fill: "#227b6b" }}
              connectNulls={false}
            />
          ) : null}
        </ComposedChart>
      </ResponsiveContainer>
      <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-xs text-ink-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-sand-500" /> Tonnes CO2e verified
        </span>
        {hasNdvi ? (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-teal-600" /> NDVI (satellite vegetation index)
          </span>
        ) : null}
      </div>
    </div>
  );
}
