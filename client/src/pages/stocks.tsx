import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { BarChart3 } from "lucide-react";
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
}

export default function StocksPage() {
  const { data: settings } = useQuery<UserSettings>({
    queryKey: ["/api/settings"],
  });

  const trackedStocks = settings?.trackedStocks || ["DJI", "VNQ", "BTC"];
  
  const { data: marketData, isLoading } = useQuery<Record<string, MarketData | null>>({
    queryKey: ["/api/market", trackedStocks.join(",")],
    queryFn: async () => {
      const res = await fetch(`/api/market?symbols=${trackedStocks.join(",")}`);
      return res.json();
    },
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,
    retry: false,
  });

  return (
    <div className="h-full bg-background overflow-y-auto md:overflow-hidden md:flex md:flex-col md:p-6 md:gap-4 snap-y snap-mandatory md:snap-none">
      <div className="md:flex-1 md:grid md:grid-cols-3 md:gap-4 md:min-h-0">
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
      
      <div className="min-h-[100dvh] md:min-h-0 md:h-24 snap-start md:snap-align-none p-4 md:p-0">
        <Card className="h-full">
          <CardContent className="h-full flex items-center justify-center gap-6 p-4">
            <BarChart3 className="h-8 w-8 text-muted-foreground" />
            <div className="text-center">
              <div className="text-lg font-medium">Market Overview</div>
              <div className="text-sm text-muted-foreground">
                Tracking {trackedStocks.length} {trackedStocks.length === 1 ? 'symbol' : 'symbols'}
              </div>
            </div>
            {isLoading && (
              <div className="text-sm text-muted-foreground animate-pulse">
                Updating...
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
