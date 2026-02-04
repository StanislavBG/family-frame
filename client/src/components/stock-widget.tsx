import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface MarketData {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
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

  return (
    <Card className={`h-full ${className}`} data-testid={`stock-widget-${symbol.toLowerCase()}`}>
      <CardContent className="h-full flex flex-col items-center justify-center p-6">
        <div className="text-lg text-muted-foreground uppercase tracking-wide mb-2">
          {name}
        </div>
        <div className="text-sm text-muted-foreground mb-4">
          {symbol}
        </div>
        {data ? (
          <>
            <div className="text-5xl md:text-6xl lg:text-7xl font-bold flex items-center gap-2">
              {isCrypto ? '$' : ''}{formatPrice(data.price)}
              <TrendIcon change={data.change} />
            </div>
            <div className={`text-2xl mt-2 ${data.change >= 0 ? 'text-green-500' : 'text-red-500'}`}>
              {data.change >= 0 ? '+' : ''}{data.changePercent.toFixed(2)}%
            </div>
            <div className={`text-lg ${data.change >= 0 ? 'text-green-500/70' : 'text-red-500/70'}`}>
              {data.change >= 0 ? '+' : ''}{data.change.toFixed(2)}
            </div>
          </>
        ) : (
          <Skeleton className="h-16 w-32" />
        )}
      </CardContent>
    </Card>
  );
}
