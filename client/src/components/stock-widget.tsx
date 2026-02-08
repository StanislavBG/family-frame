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
  change1Y?: number;
  change3Y?: number;
  change5Y?: number;
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

export function StockWidget({ symbol, name, data, variant = "full", className = "" }: StockWidgetProps) {
  const isCrypto = symbol === "BTC";

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
                {isCrypto ? '$' : ''}{formatPrice(data.price)}
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
              {isCrypto ? '$' : ''}{formatPrice(data.price)}
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

  // Full variant - vertical ScaleCell zones fill available space
  return (
    <Card className={`h-full ${className}`} data-testid={`stock-widget-${symbol.toLowerCase()}`}>
      <CardContent className="h-full p-4 md:p-6">
        {data ? (
          <div className="h-full grid grid-rows-[1fr_3fr_1.2fr] gap-0 min-h-0">
            {/* Top zone: Stock name */}
            <ScaleCell padding={0.85}>
              <div className="text-[14px] text-muted-foreground uppercase tracking-widest whitespace-nowrap">
                {name}
              </div>
            </ScaleCell>

            {/* Middle zone: Price + trend + change (dominant) */}
            <ScaleCell padding={0.88}>
              <div className="inline-flex items-center gap-[0.15em] whitespace-nowrap">
                <span className="text-[64px] font-bold text-primary leading-[0.9]">
                  {isCrypto ? '$' : ''}{formatPrice(data.price)}
                </span>
                <TrendIcon change={data.change} />
                <span className={`text-[24px] font-semibold ${data.change >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {data.change >= 0 ? '+' : ''}{data.changePercent.toFixed(2)}%
                </span>
              </div>
            </ScaleCell>

            {/* Bottom zone: Historical performance */}
            <ScaleCell padding={0.85}>
              <div className="inline-flex items-center gap-6 whitespace-nowrap">
                <PercentBadge value={data.change1Y} label="1Y" />
                <PercentBadge value={data.change3Y} label="3Y" />
                <PercentBadge value={data.change5Y} label="5Y" />
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
