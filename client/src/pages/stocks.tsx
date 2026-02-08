import { useQuery } from "@tanstack/react-query";
import { StockWidget } from "@/components/stock-widget";
import type { UserSettings } from "@shared/schema";
import { availableStocks } from "@shared/schema";

interface MarketData {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  change1Y?: number;
  change3Y?: number;
  change5Y?: number;
  change10Y?: number;
}

export default function StocksPage() {
  const { data: settings } = useQuery<UserSettings>({
    queryKey: ["/api/settings"],
  });

  const trackedStocks = settings?.trackedStocks || ["DJI", "SPX", "VNQ", "BTC", "GOLD"];
  
  const { data: marketData } = useQuery<Record<string, MarketData | null>>({
    queryKey: ["/api/market", trackedStocks.join(",")],
    queryFn: async () => {
      const res = await fetch(`/api/market?symbols=${trackedStocks.join(",")}`);
      return res.json();
    },
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,
    retry: false,
  });

  // Dynamic grid columns based on number of tracked stocks
  const gridColsClass = trackedStocks.length <= 3
    ? "md:grid-cols-3"
    : trackedStocks.length === 4
      ? "md:grid-cols-4"
      : "md:grid-cols-5";

  return (
    <div className="h-full bg-background overflow-y-auto md:overflow-hidden md:flex md:flex-col md:p-6 snap-y snap-mandatory md:snap-none">
      <div className={`md:flex-1 md:grid ${gridColsClass} md:gap-4 md:min-h-0`}>
        {trackedStocks.map((symbol) => {
          const stockInfo = availableStocks.find(s => s.symbol === symbol);
          const data = marketData?.[symbol.toLowerCase()] || null;

          return (
            <div
              key={symbol}
              className="min-h-[100dvh] md:min-h-0 md:col-span-1 snap-start md:snap-align-none p-4 md:p-0"
            >
              <StockWidget
                symbol={symbol}
                name={stockInfo?.name || symbol}
                data={data}
                variant="full"
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
