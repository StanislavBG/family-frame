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
  changeLabel?: string;
  change1Y?: number;
  change3Y?: number;
  change5Y?: number;
  change10Y?: number;
  historicalPrices?: Array<{ t: number; p: number }>;
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
  // 1-5: single row with N columns, 6: 3x2, 7-8: 4x2
  const gridColsMap: Record<number, string> = {
    1: "md:grid-cols-1",
    2: "md:grid-cols-2",
    3: "md:grid-cols-3",
    4: "md:grid-cols-4",
    5: "md:grid-cols-5",
    6: "md:grid-cols-3",
    7: "md:grid-cols-4",
    8: "md:grid-cols-4",
  };
  const gridColsClass = gridColsMap[trackedStocks.length] || "md:grid-cols-4";

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
