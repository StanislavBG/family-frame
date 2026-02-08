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

export function StockWidget({ symbol, name, data, variant = "full", className = "" }: StockWidgetProps) {
  const showDollarSign = symbol === "BTC" || symbol === "GOLD";

  const priceRange = useMemo(() => {
    if (!data?.historicalPrices || data.historicalPrices.length < 2) return null;
    const prices = data.historicalPrices.map(d => d.p);
    const low = Math.min(...prices);
    const high = Math.max(...prices);
    if (high === low) return null;
    const position = ((data.price - low) / (high - low)) * 100;
    return { low, high, position: Math.max(0, Math.min(100, position)) };
  }, [data?.historicalPrices, data?.price]);

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

  // Full variant — numbers only, no chart
  const periods = [
    { label: "1Y", value: data?.change1Y },
    { label: "3Y", value: data?.change3Y },
    { label: "5Y", value: data?.change5Y },
    { label: "10Y", value: data?.change10Y },
  ].filter(p => p.value !== undefined && p.value !== null);

  return (
    <Card className={`h-full ${className}`} data-testid={`stock-widget-${symbol.toLowerCase()}`}>
      <CardContent className="h-full p-4 md:p-6">
        {data ? (
          <div className="h-full flex flex-col min-h-0">
            {/* Top: Name + Price + Daily change */}
            <ScaleCell padding={0.88} className="shrink-0 basis-[35%]">
              <div className="flex flex-col items-center whitespace-nowrap">
                <div className="text-[11px] text-muted-foreground uppercase tracking-[0.2em]">
                  {name}
                </div>
                <div className="text-[56px] font-bold text-primary leading-none mt-[0.05em]">
                  {showDollarSign ? '$' : ''}{formatPrice(data.price)}
                </div>
                <div className="inline-flex items-center gap-[0.25em] mt-[0.15em]">
                  <TrendIcon change={data.change} size="small" />
                  <span className={`text-[20px] font-semibold ${data.change >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                    {data.change >= 0 ? '+' : ''}{data.changePercent.toFixed(2)}%
                  </span>
                </div>
              </div>
            </ScaleCell>

            {/* Middle: Period returns — 2x2 grid */}
            <ScaleCell padding={0.85} className="flex-1 min-h-0">
              <div className="flex flex-col items-center gap-[0.6em] whitespace-nowrap">
                <div className="grid grid-cols-2 gap-x-[2em] gap-y-[0.5em]">
                  {periods.map(p => (
                    <div key={p.label} className="text-center">
                      <div className="text-[11px] text-muted-foreground uppercase tracking-[0.15em]">
                        {p.label}
                      </div>
                      <div className={`text-[32px] font-bold leading-tight ${
                        p.value! >= 0 ? 'text-green-500' : 'text-red-500'
                      }`}>
                        {formatPercent(p.value)}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Range bar */}
                {priceRange && (
                  <div className="w-full max-w-[14em] flex flex-col gap-[0.15em]">
                    <div className="relative h-[4px] w-full rounded-full bg-muted-foreground/20">
                      <div
                        className="absolute top-1/2 -translate-y-1/2 h-[10px] w-[10px] rounded-full bg-primary border-2 border-card"
                        style={{ left: `${priceRange.position}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[9px] text-muted-foreground tabular-nums">
                      <span>{showDollarSign ? '$' : ''}{formatPrice(priceRange.low)}</span>
                      <span>{showDollarSign ? '$' : ''}{formatPrice(priceRange.high)}</span>
                    </div>
                  </div>
                )}
              </div>
            </ScaleCell>
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
