import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MessageSquare, Radio, Calendar, Home as HomeIcon, BarChart3, Music2 } from "lucide-react";
import { Link } from "wouter";
import { WeatherIcon } from "@/components/weather-icon";
import { ClockWidget } from "@/components/clock-widget";
import { WeatherWidget } from "@/components/weather-widget";
import { StockWidget } from "@/components/stock-widget";
import { radioService, type StreamMetadata } from "@/lib/radio-service";
import type { UserSettings, CalendarEvent, WeatherData } from "@shared/schema";
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
}

export default function HomePage() {
  const { data: settings } = useQuery<UserSettings>({
    queryKey: ["/api/settings"],
  });

  const { data: connections } = useQuery<ConnectionWithWeather[]>({
    queryKey: ["/api/connections/weather"],
    staleTime: 5 * 60 * 1000,
  });

  const { data: unreadData } = useQuery<{ count: number }>({
    queryKey: ["/api/messages/unread-count"],
  });

  const { data: events } = useQuery<CalendarEvent[]>({
    queryKey: ["/api/calendar/events"],
    staleTime: 60 * 1000,
  });

  const trackedStocks = settings?.trackedStocks || ["DJI", "VNQ", "BTC"];
  
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
  
  const upcomingEvents = events?.filter(e => {
    const eventDate = new Date(e.startDate);
    const now = new Date();
    const nextWeek = new Date(now);
    nextWeek.setDate(nextWeek.getDate() + 7);
    return eventDate >= now && eventDate <= nextWeek;
  }).slice(0, 3) || [];

  const formatTemperature = (temp: number) => {
    if (temperatureUnit === "fahrenheit") {
      return `${Math.round(temp * 9/5 + 32)}°`;
    }
    return `${Math.round(temp)}°`;
  };

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
      {/* 
        HOME PAGE LAYOUT (per App-Specific Rules):
        - Row 1: 3 Large Widgets (Clock, Weather, Connected Households OR Stock Index fallback)
        - Row 2: 1 Horizontal Widget (mixed secondary info)
        - Mobile: Each large widget is a snap-scroll section (100dvh)
      */}
      
      {/* Row 1: 3 Large Widgets */}
      <div className="md:flex-1 md:grid md:grid-cols-3 md:gap-4 md:min-h-0">
        
        {/* Large Widget 1: Clock - self-contained ClockWidget */}
        <Link href="/clock" className="block min-h-[100dvh] md:min-h-0 md:col-span-1 snap-start md:snap-align-none p-4 md:p-0">
          <Card className="h-full hover-elevate cursor-pointer" data-testid="widget-clock">
            <CardContent className="h-full flex flex-col items-center justify-center p-6">
              <ClockWidget variant="compact" style="analog" />
            </CardContent>
          </Card>
        </Link>

        {/* Large Widget 2: Weather - self-contained WeatherWidget */}
        <Link href="/weather" className="block min-h-[100dvh] md:min-h-0 md:col-span-1 snap-start md:snap-align-none p-4 md:p-0">
          <Card className="h-full hover-elevate cursor-pointer" data-testid="widget-weather">
            <CardContent className="h-full flex flex-col items-center justify-center p-6">
              <WeatherWidget 
                selfContained={true}
                variant="compact"
              />
            </CardContent>
          </Card>
        </Link>

        {/* Large Widget 3: Connected Households OR Stock Index Fallback */}
        {hasConnections ? (
          <div className="min-h-[100dvh] md:min-h-0 md:col-span-1 snap-start md:snap-align-none p-4 md:p-0">
            <Card className="h-full" data-testid="widget-connected-households">
              <CardContent className="h-full flex flex-col p-6">
                <div className="flex items-center gap-2 text-lg text-muted-foreground mb-4">
                  <HomeIcon className="h-5 w-5" />
                  <span>Connected Households</span>
                </div>
                <div className="flex-1 grid grid-cols-1 gap-4 overflow-y-auto content-start">
                  {connections.map((conn) => (
                    <Card 
                      key={conn.id} 
                      className="bg-gradient-to-br from-muted/40 to-muted/20 border-muted/50 hover-elevate"
                      data-testid={`home-tile-${conn.id}`}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-4">
                          {/* Left side: Name and Time */}
                          <div className="flex flex-col min-w-0 flex-1">
                            <span className="text-sm uppercase tracking-wider text-muted-foreground truncate">
                              {conn.recipientHomeName || conn.recipientName}
                            </span>
                            {conn.timezone && (
                              <span className="text-4xl lg:text-5xl font-bold tracking-tight mt-1" data-testid={`home-time-${conn.id}`}>
                                {formatHomeTime(conn.timezone)}
                              </span>
                            )}
                          </div>
                          {/* Right side: Weather */}
                          {conn.weather?.current && (
                            <div className="flex flex-col items-center flex-shrink-0">
                              <WeatherIcon 
                                code={conn.weather.current.weatherCode} 
                                isDay={conn.weather.current.isDay} 
                                className="h-12 w-12 lg:h-14 lg:w-14" 
                              />
                              <span className="text-2xl lg:text-3xl font-bold mt-1" data-testid={`home-temp-${conn.id}`}>
                                {formatTemperature(conn.weather.current.temperature)}
                              </span>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        ) : (
          /* Stock Index Fallback - manifests StockWidget */
          <Link href="/stocks" className="block min-h-[100dvh] md:min-h-0 md:col-span-1 snap-start md:snap-align-none p-4 md:p-0">
            <Card className="h-full hover-elevate cursor-pointer" data-testid="widget-stock-index">
              <CardContent className="h-full flex flex-col p-6">
                <div className="flex items-center gap-2 text-lg text-muted-foreground mb-4">
                  <BarChart3 className="h-5 w-5" />
                  <span>Market Overview</span>
                </div>
                <div className="flex-1 flex flex-col justify-center gap-4">
                  {trackedStocks.map((symbol) => {
                    const stockInfo = availableStocks.find(s => s.symbol === symbol);
                    const data = marketData?.[symbol.toLowerCase()] || null;
                    
                    return (
                      <StockWidget
                        key={symbol}
                        symbol={symbol}
                        name={stockInfo?.name || symbol}
                        data={data}
                        variant="compact"
                      />
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </Link>
        )}
      </div>

      {/* Row 2: Horizontal Widget - Mixed Secondary Info */}
      <div className="min-h-[100dvh] md:min-h-0 md:h-28 snap-start md:snap-align-none p-4 md:p-0">
        <div className="h-full flex gap-3 overflow-x-auto overflow-y-hidden pb-2 md:pb-0">
          
          {/* Stock Tickers (only if we showed Connected Households above) */}
          {hasConnections && (
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
          )}

          {/* Radio Status */}
          {radioEnabled && (
            <Link href="/radio" className="flex-shrink-0">
              <Card className="h-full hover-elevate cursor-pointer bg-primary/10" data-testid="widget-radio-status">
                <CardContent className="h-full flex flex-col items-center justify-center p-3 min-w-36">
                  <Radio className="h-7 w-7 text-primary animate-pulse" />
                  <div className="text-sm font-medium mt-1" data-testid="text-radio-station">
                    {radioState.stationName || "Radio Playing"}
                  </div>
                  {/* Show now playing info if available */}
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

          {/* Upcoming Events */}
          {upcomingEvents.map((event) => (
            <Link href="/calendar" key={event.id} className="flex-shrink-0">
              <Card className="h-full w-44 hover-elevate cursor-pointer" data-testid={`widget-event-${event.id}`}>
                <CardContent className="h-full flex flex-col items-center justify-center p-3">
                  <Calendar className="h-6 w-6 text-blue-500 mb-1" />
                  <div className="text-sm font-medium text-center line-clamp-1">{event.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(event.startDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}

          {/* Empty state hint when nothing to show */}
          {!radioEnabled && unreadCount === 0 && upcomingEvents.length === 0 && !hasConnections && (
            <div className="flex items-center justify-center w-full text-muted-foreground">
              <span className="text-lg">Your activity will appear here</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
