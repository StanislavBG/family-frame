// SVG charts of the Utilities 2.0 design: 13-month stacked bars and a single-bill line chart.
import { MONO } from "@/components/person/satchel";
import { monthLabel, niceAxis, type stackMonths } from "@/lib/bills-chart";
import { shortMoney } from "@/lib/bills";

const GRID_STROKE = "stroke-[#e3dcc8] dark:stroke-white/10";
const MUTED_FILL = "fill-[#5d5648] dark:fill-[#c9bfa9]";
const INK_FILL = "fill-[#1a1612] dark:fill-[#f5f0e6]";
const CLAY_STROKE = "stroke-[#a83818] dark:stroke-[#e07a52]";
const CLAY_FILL = "fill-[#a83818] dark:fill-[#e07a52]";

const wholeDollars = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

function lineMoney(v: number): string {
  return v >= 1000 ? `$${(v / 1000).toFixed(2)}k` : `$${v.toFixed(2)}`;
}

export function StackChart({
  columns,
  months,
  average,
  selected,
  onSelect,
}: {
  columns: ReturnType<typeof stackMonths>;
  months: string[];
  average: number;
  selected: number | null;
  onSelect: (i: number | null) => void;
}) {
  const W = 600, H = 390, L = 46, R = 6, T = 26, B = 40;
  const n = Math.max(1, columns.length);
  const { max: hi, step } = niceAxis(Math.max(0, ...columns.map((c) => c.total)));
  const slot = (W - L - R) / n;
  const bw = slot * 0.64;
  const y = (v: number) => T + (1 - v / hi) * (H - T - B);
  const grid: number[] = [];
  for (let v = 0; v <= hi; v += step) grid.push(v);
  const toggle = (i: number) => onSelect(selected === i ? null : i);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full shrink-0">
      {grid.map((v) => (
        <g key={`g${v}`}>
          <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className={GRID_STROKE} />
          <text x={L - 8} y={y(v) + 4} textAnchor="end" fontSize={12} className={`${MUTED_FILL} ${MONO}`}>
            {`$${v}`}
          </text>
        </g>
      ))}
      {columns.map((col, i) => {
        const x = L + i * slot + (slot - bw) / 2;
        const { mon, year } = monthLabel(months[i] ?? col.month);
        const dim = selected !== null && selected !== i;
        let acc = 0;
        return (
          <g
            key={col.month}
            role="button"
            tabIndex={0}
            aria-label={`${mon} ${year}: ${wholeDollars.format(col.total)}`}
            aria-pressed={selected === i}
            opacity={dim ? 0.3 : 1}
            className="cursor-pointer focus:outline-none focus-visible:[&>rect:first-child]:stroke-[#a83818] focus-visible:[&>rect:first-child]:stroke-2"
            onClick={() => toggle(i)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                toggle(i);
              }
            }}
          >
            <rect x={L + i * slot} y={T} width={slot} height={H - T - B} fill="transparent" />
            {col.segments.map((s) => {
              const top = y(acc + s.value);
              const bottom = y(acc);
              acc += s.value;
              return <rect key={s.id} x={x} y={top} width={bw} height={Math.max(0, bottom - top - 1)} fill={s.color} />;
            })}
            <text x={x + bw / 2} y={y(col.total) - 7} textAnchor="middle" fontSize={11} fontWeight={600} className={`${INK_FILL} ${MONO}`}>
              {shortMoney(col.total)}
            </text>
            <text x={x + bw / 2} y={H - 20} textAnchor="middle" fontSize={13} fontWeight={selected === i ? 700 : 400} className={INK_FILL}>
              {mon}
            </text>
            {i === 0 || mon === "Jan" ? (
              <text x={x + bw / 2} y={H - 4} textAnchor="middle" fontSize={11} className={`${MUTED_FILL} ${MONO}`}>
                {year}
              </text>
            ) : null}
          </g>
        );
      })}
      <line
        x1={L}
        x2={W - R}
        y1={y(average)}
        y2={y(average)}
        className={CLAY_STROKE}
        strokeWidth={1.5}
        strokeDasharray="6 4"
        pointerEvents="none"
      />
    </svg>
  );
}

export function BillLineChart({
  values,
  months,
  average,
}: {
  values: Array<number | null>;
  months: string[];
  average: number;
}) {
  const nums = values.filter((v): v is number => v !== null);
  if (nums.length < 1) {
    return <p className="text-base text-[#5d5648] dark:text-muted-foreground">No bills in this period</p>;
  }
  const W = 860, H = 330, L = 60, R = 80, T = 30, B = 40;
  const mn = Math.min(...nums);
  const mx = Math.max(...nums);
  const span = mx - mn || mx * 0.2 || 1;
  const lo = Math.max(0, mn - span * 0.15);
  const hi = mx + span * 0.15;
  const x = (i: number) => L + (i * (W - L - R)) / 13;
  const y = (v: number) => T + ((hi - v) / (hi - lo)) * (H - T - B);
  const pts = values.flatMap((v, i) => (v === null ? [] : [{ x: x(i), y: y(v), v }]));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full shrink-0">
      {[0, 1, 2, 3, 4].map((i) => {
        const v = lo + ((hi - lo) * i) / 4;
        return (
          <g key={`g${i}`}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className={GRID_STROKE} />
            <text x={L - 8} y={y(v) + 4} textAnchor="end" fontSize={12} className={`${MUTED_FILL} ${MONO}`}>
              {lineMoney(v)}
            </text>
          </g>
        );
      })}
      {months.map((m, i) => {
        const { mon, year } = monthLabel(m);
        return (
          <g key={m}>
            <text x={x(i)} y={H - 20} textAnchor="middle" fontSize={13} className={INK_FILL}>
              {mon}
            </text>
            {i === 0 || mon === "Jan" ? (
              <text x={x(i)} y={H - 4} textAnchor="middle" fontSize={11} className={`${MUTED_FILL} ${MONO}`}>
                {year}
              </text>
            ) : null}
          </g>
        );
      })}
      <line x1={L} x2={W - R} y1={y(average)} y2={y(average)} className={CLAY_STROKE} strokeWidth={1.5} strokeDasharray="6 4" />
      <text x={W - R + 6} y={y(average) + 4} fontSize={12} className={`${CLAY_FILL} ${MONO}`}>
        {`avg ${lineMoney(average)}`}
      </text>
      <polyline
        points={pts.map((p) => `${p.x},${p.y}`).join(" ")}
        fill="none"
        className="stroke-[#1a1612] dark:stroke-[#f5f0e6]"
        strokeWidth={2.5}
        strokeLinejoin="round"
      />
      {pts.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r={5} strokeWidth={2} className="fill-[#fffaf0] stroke-[#1a1612] dark:fill-card dark:stroke-[#f5f0e6]" />
          <text x={p.x} y={p.y - 12} textAnchor="middle" fontSize={12} fontWeight={600} className={`${INK_FILL} ${MONO}`}>
            {lineMoney(p.v)}
          </text>
        </g>
      ))}
    </svg>
  );
}
