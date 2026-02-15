import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MessageSquare, Radio, Music2 } from "lucide-react";
import { Link } from "wouter";
import { WeatherIcon } from "@/components/weather-icon";
import { ClockWidget } from "@/components/clock-widget";
import { WeatherTile } from "@/components/weather-tile";
import { CalendarTile } from "@/components/calendar-tile";
import { StockWidget } from "@/components/stock-widget";
import { radioService, type StreamMetadata } from "@/lib/radio-service";
import { formatTemperature } from "@/lib/weather-utils";
import type { UserSettings, WeatherData } from "@shared/schema";
import { availableStocks } from "@shared/schema";

interface WeatherResponse {
  current: WeatherData;
  location: { city: string; country: string };
}

interface ConnectionWithWeather {
  id: string;
  recipientId: string;
  recipientName: string;
  recipientHomeName?: string;
  weather?: WeatherResponse;
  timezone?: string;
}

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

export default function HomePage() {
  const { data: settings } = useQuery<UserSettings>({
    queryKey: ["/api/settings"],
  });

  const { data: connections } = useQuery<ConnectionWithWeather[]>({
    queryKey: ["/api/connections/weather"],
    staleTime: 5 * 60 * 1000,
    refetchInterval: 15 * 60 * 1000,
  });

  const { data: unreadData } = useQuery<{ count: number }>({
    queryKey: ["/api/messages/unread-count"],
  });

  const trackedStocks = settings?.trackedStocks || ["DJI", "SPX", "VNQ", "BTC", "GOLD"];

  const { data: marketData } = useQuery<Record<string, MarketData | null>>({
    queryKey: ["/api/market", trackedStocks.join(",")],
    queryFn: async () => {
      const res = await fetch(`/api/market?symbols=${trackedStocks.join(",")}`);
      return res.json();
    },
    staleTime: 60 * 1000,
    retry: false,
  });

  const unreadCount = unreadData?.count || 0;
  const radioEnabled = settings?.radioEnabled ?? false;
  const hasConnections = connections && connections.length > 0;
  const temperatureUnit = settings?.temperatureUnit || "celsius";
  const timeFormat = settings?.timeFormat || "24h";

  // Radio metadata state
  const [radioMetadata, setRadioMetadata] = useState<StreamMetadata | null>(null);
  const [radioState, setRadioState] = useState(radioService.getState());

  useEffect(() => {
    const unsubscribeState = radioService.subscribe("stateChange", (state) => {
      setRadioState(state);
      if (state.metadata) {
        setRadioMetadata(state.metadata);
      }
    });
    const unsubscribeMetadata = radioService.subscribe("metadataChange", (data: StreamMetadata) => {
      setRadioMetadata(data);
    });
    // Initialize from current state
    const initialState = radioService.getState();
    setRadioState(initialState);
    if (initialState.metadata) {
      setRadioMetadata(initialState.metadata);
    }
    return () => {
      unsubscribeState();
      unsubscribeMetadata();
    };
  }, []);

  const [currentTime, setCurrentTime] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formatHomeTime = (timezone: string) => {
    return currentTime.toLocaleTimeString('en-US', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: timeFormat === "12h"
    });
  };

  return (
    <div className="h-full bg-background overflow-y-auto md:overflow-hidden md:flex md:flex-col md:p-6 md:gap-4 snap-y snap-mandatory md:snap-none">
      {/* Row 1: 3 Large Tiles - Clock, Weather, Calendar */}
      <div className="md:flex-1 md:grid md:grid-cols-3 md:gap-4 md:min-h-0">

        {/* Tile 1: Clock */}
        <Link href="/clock" className="block min-h-[100dvh] md:min-h-0 md:col-span-1 snap-start md:snap-align-none p-4 md:p-0">
          <Card className="h-full hover-elevate cursor-pointer overflow-hidden" data-testid="widget-clock">
            <CardContent className="h-full p-0">
              <ClockWidget variant="compact" style="analog" />
            </CardContent>
          </Card>
        </Link>

        {/* Tile 2: Weather - iOS-style tile with hourly forecast */}
        <Link href="/weather" className="block min-h-[100dvh] md:min-h-0 md:col-span-1 snap-start md:snap-align-none p-4 md:p-0">
          <Card className="h-full hover-elevate cursor-pointer" data-testid="widget-weather">
            <CardContent className="h-full p-0">
              <WeatherTile />
            </CardContent>
          </Card>
        </Link>

        {/* Tile 3: Calendar - iOS-style tile with mini grid + upcoming events */}
        <Link href="/calendar" className="block min-h-[100dvh] md:min-h-0 md:col-span-1 snap-start md:snap-align-none p-4 md:p-0">
          <Card className="h-full hover-elevate cursor-pointer" data-testid="widget-calendar">
            <CardContent className="h-full p-0">
              <CalendarTile />
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Row 2: Horizontal Widget Bar - Connections, Stocks, Radio, Messages */}
      <div className="min-h-[100dvh] md:min-h-0 md:h-28 snap-start md:snap-align-none p-4 md:p-0">
        <div className="h-full flex gap-3 overflow-x-auto overflow-y-hidden pb-2 md:pb-0">

          {/* Connected Households */}
          {hasConnections && connections.map((conn) => (
            <Card
              key={conn.id}
              className="h-full flex-shrink-0 hover-elevate bg-gradient-to-br from-muted/40 to-muted/20 border-muted/50"
              data-testid={`home-tile-${conn.id}`}
            >
              <CardContent className="h-full flex items-center gap-3 p-3 min-w-48">
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground truncate">
                    {conn.recipientHomeName || conn.recipientName}
                  </span>
                  {conn.timezone && (
                    <span className="text-2xl font-bold tracking-tight" data-testid={`home-time-${conn.id}`}>
                      {formatHomeTime(conn.timezone)}
                    </span>
                  )}
                </div>
                {conn.weather?.current && (
                  <div className="flex flex-col items-center flex-shrink-0">
                    <WeatherIcon
                      code={conn.weather.current.weatherCode}
                      isDay={conn.weather.current.isDay}
                      className="h-8 w-8"
                    />
                    <span className="text-sm font-bold" data-testid={`home-temp-${conn.id}`}>
                      {formatTemperature(conn.weather.current.temperature, temperatureUnit)}
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}

          {/* Stock Tickers */}
          <Link href="/stocks" className="flex gap-3 flex-shrink-0" data-testid="stock-ticker-group">
            {trackedStocks.slice(0, 3).map((symbol) => {
              const stockInfo = availableStocks.find(s => s.symbol === symbol);
              const data = marketData?.[symbol.toLowerCase()] || null;

              return (
                <StockWidget
                  key={symbol}
                  symbol={symbol}
                  name={stockInfo?.name || symbol}
                  data={data}
                  variant="ticker"
                  className="w-36"
                />
              );
            })}
          </Link>

          {/* Radio Status */}
          {radioEnabled && (
            <Link href="/radio" className="flex-shrink-0">
              <Card className="h-full hover-elevate cursor-pointer bg-primary/10" data-testid="widget-radio-status">
                <CardContent className="h-full flex flex-col items-center justify-center p-3 min-w-36">
                  <Radio className="h-7 w-7 text-primary animate-pulse" />
                  <div className="text-sm font-medium mt-1" data-testid="text-radio-station">
                    {radioState.stationName || "Radio Playing"}
                  </div>
                  {radioState.isPlaying && (radioMetadata?.nowPlaying || radioMetadata?.title) && (
                    <div className="mt-1 text-center max-w-40">
                      <div className="flex items-center justify-center gap-1 text-xs text-primary/80" data-testid="text-radio-now-playing">
                        <Music2 className="h-3 w-3" />
                        <span className="truncate">
                          {radioMetadata.artist
                            ? `${radioMetadata.artist} - ${radioMetadata.title}`
                            : (radioMetadata.title || radioMetadata.nowPlaying)
                          }
                        </span>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </Link>
          )}

          {/* Unread Messages */}
          {unreadCount > 0 && (
            <Link href="/messages" className="flex-shrink-0">
              <Card className="h-full w-36 hover-elevate cursor-pointer" data-testid="widget-unread-messages">
                <CardContent className="h-full flex flex-col items-center justify-center p-3">
                  <MessageSquare className="h-8 w-8 text-violet-500" />
                  <Badge variant="destructive" className="mt-1">
                    {unreadCount} unread
                  </Badge>
                </CardContent>
              </Card>
            </Link>
          )}

          {/* Empty state hint when nothing else to show */}
          {!radioEnabled && unreadCount === 0 && !hasConnections && (
            <div className="flex items-center justify-center w-full text-muted-foreground">
              <span className="text-lg">Your activity will appear here</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
