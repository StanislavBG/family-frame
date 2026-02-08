import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ScaleCell } from "@/components/scale-cell";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface MarketData {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  changeLabel?: string;
  change1Y?: number;
  change3Y?: number;
  change5Y?: number;
  change10Y?: number;
  historicalPrices?: Array<{ t: number; p: number }>;
}

interface StockWidgetProps {
  symbol: string;
  name: string;
  data: MarketData | null;
  variant?: "full" | "compact" | "ticker";
  className?: string;
}

function TrendIcon({ change, size = "normal" }: { change: number; size?: "normal" | "small" }) {
  const sizeClass = size === "small" ? "h-4 w-4" : "h-6 w-6";
  if (change > 0) return <TrendingUp className={`${sizeClass} text-green-500`} />;
  if (change < 0) return <TrendingDown className={`${sizeClass} text-red-500`} />;
  return <Minus className={`${sizeClass} text-muted-foreground`} />;
}

function formatPrice(price: number) {
  if (price >= 1000) {
    return price.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }
  return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatPercent(value: number | undefined) {
  if (value === undefined || value === null) return "—";
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

/** SVG area chart for historical price data with period callouts */
function PriceChart({
  data,
  symbol,
  change1Y,
  change3Y,
  change5Y,
  change10Y,
}: {
  data: Array<{ t: number; p: number }>;
  symbol: string;
  change1Y?: number;
  change3Y?: number;
  change5Y?: number;
  change10Y?: number;
}) {
  const chart = useMemo(() => {
    if (!data || data.length < 2) return null;

    const W = 500;
    const H = 220;
    const pad = { top: 8, right: 12, bottom: 42, left: 12 };
    const cw = W - pad.left - pad.right;
    const ch = H - pad.top - pad.bottom;

    const prices = data.map(d => d.p);
    const minP = Math.min(...prices);
    const maxP = Math.max(...prices);
    const range = maxP - minP || 1;
    const minT = data[0].t;
    const maxT = data[data.length - 1].t;
    const tRange = maxT - minT || 1;

    const x = (t: number) => pad.left + ((t - minT) / tRange) * cw;
    const y = (p: number) => pad.top + (1 - (p - minP) / range) * ch;

    // Build SVG path
    const points = data.map(d => `${x(d.t).toFixed(1)},${y(d.p).toFixed(1)}`);
    const linePath = `M${points.join("L")}`;
    const areaPath = `${linePath}L${x(maxT).toFixed(1)},${(pad.top + ch).toFixed(1)}L${x(minT).toFixed(1)},${(pad.top + ch).toFixed(1)}Z`;

    // Period callouts
    const now = maxT;
    const periods = [
      { label: "10Y", ago: 10 * 365.25 * 86400000, change: change10Y },
      { label: "5Y", ago: 5 * 365.25 * 86400000, change: change5Y },
      { label: "3Y", ago: 3 * 365.25 * 86400000, change: change3Y },
      { label: "1Y", ago: 1 * 365.25 * 86400000, change: change1Y },
    ];

    const annotations = periods
      .filter(p => p.change !== undefined && p.change !== null)
      .map(p => {
        const targetT = now - p.ago;
        if (targetT < minT) return null;
        // Find closest data point
        let closest = data[0];
        for (const d of data) {
          if (Math.abs(d.t - targetT) < Math.abs(closest.t - targetT)) {
            closest = d;
          }
        }
        return {
          label: p.label,
          change: p.change!,
          x: x(closest.t),
          y: y(closest.p),
          price: closest.p,
        };
      })
      .filter((a): a is NonNullable<typeof a> => a !== null);

    // Current price point (rightmost)
    const lastPoint = data[data.length - 1];
    const currentDot = { x: x(lastPoint.t), y: y(lastPoint.p) };

    return { W, H, pad, ch, linePath, areaPath, annotations, currentDot };
  }, [data, change1Y, change3Y, change5Y, change10Y]);

  if (!chart) return null;
  const gradId = `grad-${symbol}`;
  const isPositiveOverall = (data[data.length - 1]?.p ?? 0) >= (data[0]?.p ?? 0);
  const trendColor = isPositiveOverall ? "rgb(34,197,94)" : "rgb(239,68,68)";

  return (
    <svg
      viewBox={`0 0 ${chart.W} ${chart.H}`}
      preserveAspectRatio="none"
      className="w-full h-full"
      style={{ display: "block" }}
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={trendColor} stopOpacity="0.25" />
          <stop offset="100%" stopColor={trendColor} stopOpacity="0.02" />
        </linearGradient>
      </defs>

      {/* Area fill */}
      <path d={chart.areaPath} fill={`url(#${gradId})`} />

      {/* Line */}
      <path
        d={chart.linePath}
        fill="none"
        stroke={trendColor}
        strokeWidth="2"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />

      {/* Annotation lines and labels */}
      {chart.annotations.map(a => (
        <g key={a.label}>
          {/* Vertical dashed line */}
          <line
            x1={a.x}
            y1={chart.pad.top}
            x2={a.x}
            y2={chart.pad.top + chart.ch}
            stroke="hsl(var(--muted-foreground))"
            strokeWidth="0.5"
            strokeDasharray="3,3"
            opacity="0.3"
          />
          {/* Dot on the line */}
          <circle
            cx={a.x}
            cy={a.y}
            r="3"
            fill={trendColor}
            stroke="hsl(var(--card))"
            strokeWidth="1.5"
          />
          {/* Period label below chart */}
          <text
            x={a.x}
            y={chart.pad.top + chart.ch + 14}
            textAnchor="middle"
            fill="hsl(var(--muted-foreground))"
            fontSize="10"
          >
            {a.label}
          </text>
          {/* Change value */}
          <text
            x={a.x}
            y={chart.pad.top + chart.ch + 28}
            textAnchor="middle"
            fill={a.change >= 0 ? "rgb(34,197,94)" : "rgb(239,68,68)"}
            fontSize="11"
            fontWeight="600"
          >
            {formatPercent(a.change)}
          </text>
        </g>
      ))}

      {/* Current price dot */}
      <circle
        cx={chart.currentDot.x}
        cy={chart.currentDot.y}
        r="3.5"
        fill={trendColor}
        stroke="hsl(var(--card))"
        strokeWidth="1.5"
      />
    </svg>
  );
}

export function StockWidget({ symbol, name, data, variant = "full", className = "" }: StockWidgetProps) {
  const showDollarSign = symbol === "BTC" || symbol === "GOLD";

  if (variant === "ticker") {
    return (
      <Card className={`h-full hover-elevate cursor-pointer ${className}`} data-testid={`ticker-${symbol.toLowerCase()}`}>
        <CardContent className="h-full flex flex-col items-center justify-center p-3">
          <div className="text-xs text-muted-foreground uppercase tracking-wide">
            {name}
          </div>
          {data ? (
            <>
              <div className="text-lg font-bold flex items-center gap-1">
                {showDollarSign ? '$' : ''}{formatPrice(data.price)}
                <TrendIcon change={data.change} size="small" />
              </div>
              <div className={`text-sm ${data.change >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                {data.change >= 0 ? '+' : ''}{data.changePercent.toFixed(2)}%
              </div>
            </>
          ) : (
            <div className="text-lg text-muted-foreground">--</div>
          )}
        </CardContent>
      </Card>
    );
  }

  if (variant === "compact") {
    return (
      <div
        className={`flex items-center justify-between p-4 rounded-lg bg-muted/30 ${className}`}
        data-testid={`stock-tile-${symbol.toLowerCase()}`}
      >
        <div className="flex flex-col">
          <span className="text-sm text-muted-foreground uppercase tracking-wide">
            {name}
          </span>
          {data ? (
            <span className="text-2xl font-bold flex items-center gap-2">
              {showDollarSign ? '$' : ''}{formatPrice(data.price)}
              <TrendIcon change={data.change} size="small" />
            </span>
          ) : (
            <span className="text-2xl text-muted-foreground">--</span>
          )}
        </div>
        {data && (
          <div className={`text-lg font-semibold ${data.change >= 0 ? 'text-green-500' : 'text-red-500'}`}>
            {data.change >= 0 ? '+' : ''}{data.changePercent.toFixed(2)}%
          </div>
        )}
      </div>
    );
  }

  // Full variant - name/price header, chart filling middle, annotations in chart
  const hasChart = data?.historicalPrices && data.historicalPrices.length >= 2;

  return (
    <Card className={`h-full ${className}`} data-testid={`stock-widget-${symbol.toLowerCase()}`}>
      <CardContent className="h-full p-4 md:p-6">
        {data ? (
          <div className="h-full flex flex-col min-h-0">
            {/* Header: name + price + change */}
            <ScaleCell padding={0.85} className="shrink-0 basis-[15%]">
              <div className="flex flex-col items-center gap-[0.1em] whitespace-nowrap">
                <div className="text-[12px] text-muted-foreground uppercase tracking-widest">
                  {name}
                </div>
                <div className="inline-flex items-center gap-[0.2em]">
                  <span className="text-[40px] font-bold text-primary leading-none">
                    {showDollarSign ? '$' : ''}{formatPrice(data.price)}
                  </span>
                  <TrendIcon change={data.change} size="small" />
                  <span className={`text-[18px] font-semibold ${data.change >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                    {data.change >= 0 ? '+' : ''}{data.changePercent.toFixed(2)}%
                  </span>
                </div>
              </div>
            </ScaleCell>

            {/* Chart area - fills remaining space */}
            {hasChart ? (
              <div className="flex-1 min-h-0 pt-2">
                <PriceChart
                  data={data.historicalPrices!}
                  symbol={symbol}
                  change1Y={data.change1Y}
                  change3Y={data.change3Y}
                  change5Y={data.change5Y}
                  change10Y={data.change10Y}
                />
              </div>
            ) : (
              <div className="flex-1 min-h-0 flex items-center justify-center">
                <ScaleCell padding={0.85}>
                  <div className="inline-flex items-center gap-6 whitespace-nowrap">
                    <PercentBadge value={data.change1Y} label="1Y" />
                    <PercentBadge value={data.change3Y} label="3Y" />
                    <PercentBadge value={data.change5Y} label="5Y" />
                    <PercentBadge value={data.change10Y} label="10Y" />
                  </div>
                </ScaleCell>
              </div>
            )}
          </div>
        ) : (
          <div className="h-full flex items-center justify-center">
            <Skeleton className="h-16 w-32" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PercentBadge({ value, label }: { value: number | undefined; label: string }) {
  if (value === undefined || value === null) {
    return (
      <div className="text-center">
        <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
        <div className="text-sm text-muted-foreground">—</div>
      </div>
    );
  }
  const color = value >= 0 ? "text-green-500" : "text-red-500";
  return (
    <div className="text-center">
      <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className={`text-sm font-medium ${color}`}>{formatPercent(value)}</div>
    </div>
  );
}
