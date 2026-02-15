import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface MarketData {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
}

interface StockTickerProps {
  stocks: string[];
  marketData: Record<string, MarketData | null> | undefined;
  className?: string;
}

function formatPrice(price: number) {
  if (price >= 1000) {
    return price.toLocaleString("en-US", { maximumFractionDigits: 0 });
  }
  return price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function TickerItem({ symbol, data }: { symbol: string; data: MarketData | null }) {
  const showDollar = symbol === "BTC" || symbol === "GOLD";

  if (!data) {
    return (
      <span className="text-muted-foreground/50">{symbol} --</span>
    );
  }

  const isUp = data.change >= 0;
  const Icon = data.change > 0 ? TrendingUp : data.change < 0 ? TrendingDown : Minus;

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="font-medium text-muted-foreground">{data.name}</span>
      <span className="font-semibold">
        {showDollar ? "$" : ""}{formatPrice(data.price)}
      </span>
      <Icon className={`h-3 w-3 ${isUp ? "text-green-500" : "text-red-500"}`} />
      <span className={`text-xs font-medium ${isUp ? "text-green-500" : "text-red-500"}`}>
        {isUp ? "+" : ""}{data.changePercent.toFixed(1)}%
      </span>
    </span>
  );
}

export function StockTicker({ stocks, marketData, className = "" }: StockTickerProps) {
  return (
    <div
      className={`flex items-center gap-4 overflow-x-auto text-xs whitespace-nowrap px-4 py-1.5 bg-muted/30 border-t ${className}`}
      data-testid="stock-ticker"
    >
      {stocks.map((symbol) => (
        <TickerItem
          key={symbol}
          symbol={symbol}
          data={marketData?.[symbol.toLowerCase()] || null}
        />
      ))}
    </div>
  );
}
