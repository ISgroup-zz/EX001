"use client";

import { useState } from "react";
import { formatMoney, formatMoneyCompact } from "@/lib/money";

/**
 * Planned vs. actual, month by month — grouped columns, because the job is telling
 * two distinct series apart over time.
 *
 * Palette: categorical slots 1 and 2 (blue / orange), validated for CVD separation
 * against a white surface (worst adjacent ΔE 24.7 protan, 33.6 normal vision).
 * Identity never rests on colour alone: a legend is always present and every value is
 * repeated in the table beneath the chart.
 */

export type ChartBucket = { key: string; label: string; plannedMinor: number; actualMinor: number };

const SERIES = [
  { id: "planned", label: "Planned", color: "#2a78d6" },
  { id: "actual", label: "Actual", color: "#eb6834" },
] as const;

const VB = { width: 840, height: 280 };
const PAD = { top: 16, right: 12, bottom: 34, left: 64 };
const PLOT = {
  width: VB.width - PAD.left - PAD.right,
  height: VB.height - PAD.top - PAD.bottom,
};
const MAX_BAR = 24;
const GAP = 2; // the surface gap that separates touching marks
const RADIUS = 4; // rounded data-end; square at the baseline

/** Bar path: rounded at the top (the data end), square where it meets the baseline. */
function barPath(x: number, y: number, width: number, height: number): string {
  if (height <= 0) return "";
  const r = Math.min(RADIUS, height, width / 2);
  const bottom = y + height;
  return `M${x},${bottom} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + width - r},${y} Q${x + width},${y} ${x + width},${y + r} L${x + width},${bottom} Z`;
}

/**
 * Ticks on clean numbers — 0 / 100K / 200K / 300K, never 0 / 62.5K / 188K.
 * The step is snapped to 1, 2, 5 × a power of ten, then the axis top is the first
 * multiple of that step at or above the tallest bar.
 */
function niceScale(peak: number, targetTicks = 4): { top: number; ticks: number[] } {
  if (peak <= 0) return { top: 1, ticks: [0, 1] };

  const rawStep = peak / targetTicks;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalised = rawStep / magnitude;
  const step = (normalised <= 1 ? 1 : normalised <= 2 ? 2 : normalised <= 5 ? 5 : 10) * magnitude;

  const top = Math.ceil(peak / step) * step;
  const ticks: number[] = [];
  for (let value = 0; value <= top + step / 2; value += step) ticks.push(Math.round(value));
  return { top, ticks };
}

export function ForecastChart({
  buckets,
  currency = "USD",
  emptyMessage = "Nothing planned in this period.",
}: {
  buckets: ChartBucket[];
  currency?: string;
  emptyMessage?: string;
}) {
  const [hovered, setHovered] = useState<{ index: number; series: string } | null>(null);

  const peak = Math.max(0, ...buckets.flatMap((bucket) => [bucket.plannedMinor, bucket.actualMinor]));
  if (buckets.length === 0 || peak === 0) {
    return (
      <div className="flex h-56 items-center justify-center text-sm text-slate-500">{emptyMessage}</div>
    );
  }

  const { top: max, ticks } = niceScale(peak);
  const band = PLOT.width / buckets.length;
  const barWidth = Math.min(MAX_BAR, (band - GAP * 3) / 2);
  const groupWidth = barWidth * 2 + GAP;

  const yFor = (minor: number) => PAD.top + PLOT.height - (minor / max) * PLOT.height;
  const active = hovered ? buckets[hovered.index] : null;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${VB.width} ${VB.height}`} className="w-full" role="img" aria-label="Planned versus actual by month">
        {/* Gridlines: hairline, solid, one step off the surface. */}
        {ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={PAD.left}
              x2={VB.width - PAD.right}
              y1={yFor(tick)}
              y2={yFor(tick)}
              stroke={tick === 0 ? "#c3c2b7" : "#e1e0d9"}
              strokeWidth="1"
            />
            <text x={PAD.left - 10} y={yFor(tick) + 4} textAnchor="end" fontSize="11" fill="#898781" className="tabular">
              {tick === 0 ? "0" : formatMoneyCompact(tick, currency)}
            </text>
          </g>
        ))}

        {buckets.map((bucket, index) => {
          const groupX = PAD.left + index * band + (band - groupWidth) / 2;
          return (
            <g key={bucket.key}>
              {SERIES.map((series, seriesIndex) => {
                const value = series.id === "planned" ? bucket.plannedMinor : bucket.actualMinor;
                const x = groupX + seriesIndex * (barWidth + GAP);
                const y = yFor(value);
                const height = PAD.top + PLOT.height - y;
                const isHovered = hovered?.index === index && hovered.series === series.id;

                return (
                  <g key={series.id}>
                    {value > 0 && (
                      <path d={barPath(x, y, barWidth, height)} fill={series.color} opacity={isHovered ? 0.82 : 1} />
                    )}
                    {/* Hit target is the full band height and wider than the mark. */}
                    <rect
                      x={x - GAP}
                      y={PAD.top}
                      width={barWidth + GAP * 2}
                      height={PLOT.height}
                      fill="transparent"
                      tabIndex={0}
                      role="button"
                      aria-label={`${bucket.label} ${series.label} ${formatMoney(value, currency)}`}
                      onMouseEnter={() => setHovered({ index, series: series.id })}
                      onMouseLeave={() => setHovered(null)}
                      onFocus={() => setHovered({ index, series: series.id })}
                      onBlur={() => setHovered(null)}
                    />
                  </g>
                );
              })}

              <text
                x={PAD.left + index * band + band / 2}
                y={VB.height - 12}
                textAnchor="middle"
                fontSize="11"
                fill="#898781"
              >
                {bucket.label.replace(" ", " ")}
              </text>
            </g>
          );
        })}
      </svg>

      {active && hovered && (
        <div
          className="pointer-events-none absolute z-10 min-w-[150px] -translate-x-1/2 rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-lg"
          style={{
            left: `${((PAD.left + hovered.index * band + band / 2) / VB.width) * 100}%`,
            top: 0,
          }}
        >
          <p className="mb-1.5 text-xs font-medium text-slate-500">{active.label}</p>
          {SERIES.map((series) => {
            const value = series.id === "planned" ? active.plannedMinor : active.actualMinor;
            return (
              <p key={series.id} className="flex items-center gap-2 text-sm">
                <span className="h-0.5 w-3 shrink-0 rounded-full" style={{ backgroundColor: series.color }} aria-hidden />
                <span className="font-semibold text-slate-900 tabular">{formatMoney(value, currency)}</span>
                <span className="text-xs text-slate-500">{series.label}</span>
              </p>
            );
          })}
        </div>
      )}

      <div className="mt-2 flex flex-wrap items-center justify-center gap-4">
        {SERIES.map((series) => (
          <span key={series.id} className="flex items-center gap-1.5 text-xs text-slate-600">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: series.color }} aria-hidden />
            {series.label}
          </span>
        ))}
      </div>
    </div>
  );
}
