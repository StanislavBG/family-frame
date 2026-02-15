import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MessageSquare, Home as HomeIcon } from "lucide-react";
import { Link } from "wouter";
import { WeatherIcon } from "@/components/weather-icon";
import { ClockWidget } from "@/components/clock-widget";
import { WeatherTile } from "@/components/weather-tile";
import { CalendarTile } from "@/components/calendar-tile";
import { StockTicker } from "@/components/stock-ticker";
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
  const hasConnections = connections && connections.length > 0;
  const temperatureUnit = settings?.temperatureUnit || "celsius";
  const timeFormat = settings?.timeFormat || "24h";

  const [currentTime, setCurrentTime] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formatHomeTime = (timezone: string) => {
    return currentTime.toLocaleTimeString("en-US", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: timeFormat === "12h",
    });
  };

  return (
    <div className="h-full bg-background flex flex-col overflow-hidden">
      {/*
        LAYOUT (Option B):
        ┌──────────────────┬───────────────────────┐
        │  Digital Clock   │                       │
        │──────────────────│  Connected Homes       │
        │  Weather Tile    │  (+ unread badge)      │
        ├──────────────────┴───────────────────────┤
        │  Calendar (horizontal: grid | events)    │
        ├──────────────────────────────────────────┤
        │  DJI ▲0.5%  ·  SPX ▲1.2%  ·  BTC ▼2.1% │
        └──────────────────────────────────────────┘
      */}

      {/* Main area: 2 columns */}
      <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4 p-4 md:p-6 min-h-0 overflow-y-auto md:overflow-hidden">

        {/* Left column: Clock stacked above Weather */}
        <div className="flex flex-col gap-4 min-h-0">
          {/* Digital Clock */}
          <Link href="/clock" className="block flex-shrink-0">
            <Card className="hover-elevate cursor-pointer overflow-hidden" data-testid="widget-clock">
              <CardContent className="p-4 md:p-6">
                <ClockWidget variant="compact" style="digital" />
              </CardContent>
            </Card>
          </Link>

          {/* Weather Tile */}
          <Link href="/weather" className="block flex-1 min-h-0">
            <Card className="h-full hover-elevate cursor-pointer" data-testid="widget-weather">
              <CardContent className="h-full p-0">
                <WeatherTile />
              </CardContent>
            </Card>
          </Link>
        </div>

        {/* Right column: Connected Homes */}
        <div className="min-h-0">
          <Card className="h-full" data-testid="widget-connected-households">
            <CardContent className="h-full flex flex-col p-4 md:p-6">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <HomeIcon className="h-4 w-4" />
                  <span className="font-medium">Connected Homes</span>
                </div>
                {unreadCount > 0 && (
                  <Link href="/messages">
                    <Badge variant="destructive" className="cursor-pointer" data-testid="widget-unread-messages">
                      <MessageSquare className="h-3 w-3 mr-1" />
                      {unreadCount}
                    </Badge>
                  </Link>
                )}
              </div>

              {hasConnections ? (
                <div className="flex-1 grid grid-cols-1 gap-3 overflow-y-auto content-start">
                  {connections.map((conn) => (
                    <Card
                      key={conn.id}
                      className="bg-gradient-to-br from-muted/40 to-muted/20 border-muted/50"
                      data-testid={`home-tile-${conn.id}`}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex flex-col min-w-0 flex-1">
                            <span className="text-xs uppercase tracking-wider text-muted-foreground truncate">
                              {conn.recipientHomeName || conn.recipientName}
                            </span>
                            {conn.timezone && (
                              <span
                                className="text-3xl lg:text-4xl font-bold tracking-tight mt-0.5"
                                data-testid={`home-time-${conn.id}`}
                              >
                                {formatHomeTime(conn.timezone)}
                              </span>
                            )}
                          </div>
                          {conn.weather?.current && (
                            <div className="flex flex-col items-center flex-shrink-0">
                              <WeatherIcon
                                code={conn.weather.current.weatherCode}
                                isDay={conn.weather.current.isDay}
                                className="h-10 w-10 lg:h-12 lg:w-12"
                              />
                              <span
                                className="text-lg lg:text-xl font-bold mt-0.5"
                                data-testid={`home-temp-${conn.id}`}
                              >
                                {formatTemperature(conn.weather.current.temperature, temperatureUnit)}
                              </span>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="flex-1 flex items-center justify-center text-muted-foreground">
                  <div className="text-center">
                    <HomeIcon className="h-10 w-10 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">Connect with family homes in Settings</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Calendar row - full width, horizontal layout */}
      <div className="flex-shrink-0 px-4 md:px-6 pb-2">
        <Link href="/calendar" className="block">
          <Card className="hover-elevate cursor-pointer" data-testid="widget-calendar">
            <CardContent className="p-0">
              <CalendarTile layout="horizontal" />
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Stock ticker tape - thin bottom strip */}
      <div className="flex-shrink-0">
        <Link href="/stocks">
          <StockTicker stocks={trackedStocks} marketData={marketData} />
        </Link>
      </div>
    </div>
  );
}
