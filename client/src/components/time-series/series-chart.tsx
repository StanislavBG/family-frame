import { pointTimeMs } from "@shared/time-series";
import type { TimePoint } from "@shared/time-series";
import { formatSeriesValue, seriesStats, sparklinePath } from "@/lib/time-series";

const DEFAULT_COLOR = "hsl(var(--primary))";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function monthLabel(t: string): string {
  const month = Number(t.slice(5, 7));
  if (!Number.isInteger(month) || month < 1 || month > 12) return t.slice(0, 10);
  return `${MONTHS[month - 1]} ${t.slice(0, 4)}`;
}

interface SparklineProps {
  values: (number | null)[];
  color?: string;
  className?: string;
}

const SPARK_W = 100;
const SPARK_H = 32;

export function Sparkline({ values, color, className }: SparklineProps) {
  const present = values.filter((v): v is number => v !== null);
  const label =
    present.length === 0
      ? "No data"
      : `Trend of ${present.length} values, from ${Math.min(...present)} to ${Math.max(...present)}`;
  const path = sparklinePath(values, SPARK_W, SPARK_H);
  return (
    <svg
      viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={label}
      className={className}
    >
      {path && (
        <path
          d={path}
          fill="none"
          stroke={color ?? DEFAULT_COLOR}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      )}
    </svg>
  );
}

interface SeriesLineChartProps {
  points: TimePoint[];
  unit: string | null;
  color?: string | null;
  height?: number;
}

const CHART_W = 600;
const PAD_X = 16;
const PAD_TOP = 24;
const PAD_BOTTOM = 28;

export function SeriesLineChart({ points, unit, color, height = 220 }: SeriesLineChartProps) {
  const stroke = color || DEFAULT_COLOR;

  if (points.length === 0) {
    return (
      <svg viewBox={`0 0 ${CHART_W} ${height}`} role="img" aria-label="No data yet" className="w-full h-auto">
        <text
          x={CHART_W / 2}
          y={height / 2}
          textAnchor="middle"
          dominantBaseline="middle"
          className="fill-muted-foreground text-sm"
          fontSize={16}
        >
          No data yet
        </text>
      </svg>
    );
  }

  const sorted = [...points].sort((a, b) => pointTimeMs(a.t) - pointTimeMs(b.t));
  const { min, max, avg } = seriesStats(sorted);
  const lo = min ?? 0;
  const hi = max ?? 0;
  const span = hi - lo;
  const innerW = CHART_W - PAD_X * 2;
  const innerH = height - PAD_TOP - PAD_BOTTOM;

  const x = (i: number) => (sorted.length === 1 ? CHART_W / 2 : PAD_X + (i / (sorted.length - 1)) * innerW);
  const y = (v: number) => (span === 0 ? PAD_TOP + innerH / 2 : PAD_TOP + innerH - ((v - lo) / span) * innerH);

  const coords = sorted.map((p, i) => ({ x: x(i), y: y(p.value), p }));
  const line = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");

  const avgY = y(avg ?? 0);
  const avgText = `Avg ${formatSeriesValue(avg ?? 0, unit)}`;
  const latest = sorted[sorted.length - 1];

  const axisIdx = Array.from(new Set([0, Math.floor((sorted.length - 1) / 2), sorted.length - 1]));
  const anchorFor = (i: number) => (i === 0 && sorted.length > 1 ? "start" : i === sorted.length - 1 && sorted.length > 1 ? "end" : "middle");

  return (
    <svg
      viewBox={`0 0 ${CHART_W} ${height}`}
      role="img"
      aria-label={`${sorted.length} points from ${monthLabel(sorted[0].t)} to ${monthLabel(latest.t)}, latest ${formatSeriesValue(latest.value, unit)}, ${avgText}`}
      className="w-full h-auto"
    >
      {sorted.length > 1 && (
        <path d={line} fill="none" stroke={stroke} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      )}
      {sorted.length > 1 && (
        <>
          <line
            x1={PAD_X}
            x2={CHART_W - PAD_X}
            y1={avgY}
            y2={avgY}
            stroke="currentColor"
            className="text-muted-foreground"
            strokeWidth={1}
            strokeDasharray="4 4"
          />
          <text x={CHART_W - PAD_X} y={avgY - 6} textAnchor="end" fontSize={12} className="fill-muted-foreground">
            {avgText}
          </text>
        </>
      )}
      {coords.map((c) => (
        <circle key={`${c.p.t}-${c.x}`} cx={c.x} cy={c.y} r={3.5} fill={stroke} />
      ))}
      {sorted.length === 1 && (
        <text x={CHART_W / 2} y={coords[0].y - 12} textAnchor="middle" fontSize={12} className="fill-muted-foreground">
          {formatSeriesValue(sorted[0].value, unit)}
        </text>
      )}
      {axisIdx.map((i) => (
        <text
          key={i}
          x={x(i)}
          y={height - 8}
          textAnchor={anchorFor(i)}
          fontSize={12}
          className="fill-muted-foreground"
        >
          {monthLabel(sorted[i].t)}
        </text>
      ))}
    </svg>
  );
}
