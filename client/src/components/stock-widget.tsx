import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
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

  // Full variant - redesigned with historical performance
  return (
    <Card className={`h-full ${className}`} data-testid={`stock-widget-${symbol.toLowerCase()}`}>
      <CardContent className="h-full flex flex-col items-center justify-center p-6">
        {/* Name at top */}
        <div className="text-sm md:text-base text-muted-foreground uppercase tracking-widest mb-2">
          {name}
        </div>

        {data ? (
          <>
            {/* Current price with trend icon and change on same line */}
            <div className="flex items-center gap-3">
              <span className="text-4xl md:text-5xl lg:text-6xl font-bold text-primary">
                {isCrypto ? '$' : ''}{formatPrice(data.price)}
              </span>
              <TrendIcon change={data.change} />
              <span className={`text-xl md:text-2xl font-semibold ${data.change >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                {data.change >= 0 ? '+' : ''}{data.changePercent.toFixed(2)}%
              </span>
            </div>

            {/* Historical performance row */}
            <div className="flex items-center justify-center gap-6 md:gap-8 mt-4 pt-4 border-t w-full max-w-xs">
              <PercentBadge value={data.change1Y} label="1Y" />
              <PercentBadge value={data.change3Y} label="3Y" />
              <PercentBadge value={data.change5Y} label="5Y" />
            </div>
          </>
        ) : (
          <Skeleton className="h-16 w-32" />
        )}
      </CardContent>
    </Card>
  );
}
