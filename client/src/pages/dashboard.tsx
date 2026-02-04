import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  Clock,
  Cloud,
  Calendar,
  MessageSquare,
  ShoppingCart,
  CheckSquare,
  Bell,
  ChefHat,
  Cake,
  AlertTriangle,
  Sun,
  Moon,
  Droplets,
  Wind,
} from "lucide-react";
import type { UserSettings, WeatherData, CalendarEvent, Chore } from "@shared/schema";
import { formatTemperature } from "@/lib/format";

// Weather emoji helper
function getWeatherEmoji(code: number, isDay: boolean): string {
  if (code === 0) return isDay ? "\u2600\ufe0f" : "\ud83c\udf19";
  if (code <= 3) return isDay ? "\u26c5" : "\ud83c\udf19";
  if (code <= 49) return "\ud83c\udf2b\ufe0f";
  if (code <= 69) return "\ud83c\udf27\ufe0f";
  if (code <= 79) return "\u2744\ufe0f";
  if (code <= 99) return "\u26a1";
  return "\u2601\ufe0f";
}

// Clock Widget
function ClockWidget({ timeFormat }: { timeFormat: "12h" | "24h" }) {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const formatTime = () => {
    if (timeFormat === "12h") {
      return time.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true });
    }
    return time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
  };

  return (
    <Card className="p-6 bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
      <div className="flex items-center gap-3 mb-2">
        <Clock className="h-5 w-5 text-primary" />
        <span className="text-sm font-medium text-muted-foreground">
          {time.toLocaleDateString([], { weekday: "long" })}
        </span>
      </div>
      <div className="text-5xl font-light tracking-tight tabular-nums">
        {formatTime()}
      </div>
      <div className="text-sm text-muted-foreground mt-1">
        {time.toLocaleDateString([], { month: "long", day: "numeric", year: "numeric" })}
      </div>
    </Card>
  );
}

// Weather Widget
function WeatherWidget({
  weather,
  temperatureUnit,
  location
}: {
  weather?: WeatherData;
  temperatureUnit: "celsius" | "fahrenheit";
  location?: { city?: string; country?: string };
}) {
  if (!weather) {
    return (
      <Card className="p-6 bg-gradient-to-br from-blue-500/10 to-blue-500/5 border-blue-500/20">
        <div className="flex items-center gap-3 mb-2">
          <Cloud className="h-5 w-5 text-blue-500" />
          <span className="text-sm font-medium text-muted-foreground">Weather</span>
        </div>
        <div className="text-muted-foreground">Set location in settings</div>
      </Card>
    );
  }

  return (
    <Card className="p-6 bg-gradient-to-br from-blue-500/10 to-blue-500/5 border-blue-500/20">
      <div className="flex items-center gap-3 mb-2">
        <Cloud className="h-5 w-5 text-blue-500" />
        <span className="text-sm font-medium text-muted-foreground">
          {location?.city || "Weather"}
        </span>
      </div>
      <div className="flex items-center gap-4">
        <span className="text-4xl">
          {getWeatherEmoji(weather.weatherCode, weather.isDay)}
        </span>
        <div>
          <div className="text-4xl font-light">
            {formatTemperature(weather.temperature, temperatureUnit)}
          </div>
          <div className="text-sm text-muted-foreground">{weather.description}</div>
        </div>
      </div>
      <div className="flex gap-4 mt-3 text-sm text-muted-foreground">
        <span className="flex items-center gap-1">
          <Droplets className="h-4 w-4" /> {weather.humidity}%
        </span>
        <span className="flex items-center gap-1">
          <Wind className="h-4 w-4" /> {Math.round(weather.windSpeed)} km/h
        </span>
      </div>
    </Card>
  );
}

// Upcoming Events Widget
function EventsWidget({ events }: { events: CalendarEvent[] }) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const upcomingEvents = events
    .filter(e => new Date(e.startDate) >= today)
    .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
    .slice(0, 5);

  const getDaysUntil = (date: string) => {
    const eventDate = new Date(date);
    eventDate.setHours(0, 0, 0, 0);
    const diff = Math.ceil((eventDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (diff === 0) return "Today";
    if (diff === 1) return "Tomorrow";
    return `${diff} days`;
  };

  return (
    <Card className="p-6 bg-gradient-to-br from-green-500/10 to-green-500/5 border-green-500/20">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Calendar className="h-5 w-5 text-green-500" />
          <span className="text-sm font-medium text-muted-foreground">Upcoming</span>
        </div>
        <Link href="/calendar">
          <Button variant="ghost" size="sm">View all</Button>
        </Link>
      </div>
      {upcomingEvents.length === 0 ? (
        <div className="text-muted-foreground text-sm">No upcoming events</div>
      ) : (
        <div className="space-y-3">
          {upcomingEvents.map(event => (
            <div key={event.id} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {event.title.toLowerCase().includes("birthday") && <Cake className="h-4 w-4 text-pink-500" />}
                <span className="text-sm font-medium truncate max-w-[200px]">{event.title}</span>
              </div>
              <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
                {getDaysUntil(event.startDate)}
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// Messages Widget
function MessagesWidget({ unreadCount }: { unreadCount: number }) {
  return (
    <Link href="/messages">
      <Card className={cn(
        "p-6 cursor-pointer transition-all hover:scale-[1.02]",
        unreadCount > 0
          ? "bg-gradient-to-br from-orange-500/10 to-orange-500/5 border-orange-500/20"
          : "bg-gradient-to-br from-gray-500/10 to-gray-500/5 border-gray-500/20"
      )}>
        <div className="flex items-center gap-3 mb-2">
          <MessageSquare className={cn("h-5 w-5", unreadCount > 0 ? "text-orange-500" : "text-gray-500")} />
          <span className="text-sm font-medium text-muted-foreground">Messages</span>
        </div>
        {unreadCount > 0 ? (
          <div className="text-3xl font-semibold text-orange-500">
            {unreadCount} new
          </div>
        ) : (
          <div className="text-muted-foreground">No new messages</div>
        )}
      </Card>
    </Link>
  );
}

// Chores Widget
function ChoresWidget({ chores }: { chores: Chore[] }) {
  const pendingChores = chores.filter(c => !c.completed);
  const todayChores = pendingChores.filter(c => {
    if (!c.dueDate) return false;
    const today = new Date().toISOString().split("T")[0];
    return c.dueDate === today;
  });

  return (
    <Link href="/chores">
      <Card className={cn(
        "p-6 cursor-pointer transition-all hover:scale-[1.02]",
        todayChores.length > 0
          ? "bg-gradient-to-br from-purple-500/10 to-purple-500/5 border-purple-500/20"
          : "bg-gradient-to-br from-gray-500/10 to-gray-500/5 border-gray-500/20"
      )}>
        <div className="flex items-center gap-3 mb-2">
          <CheckSquare className={cn("h-5 w-5", todayChores.length > 0 ? "text-purple-500" : "text-gray-500")} />
          <span className="text-sm font-medium text-muted-foreground">Chores</span>
        </div>
        {todayChores.length > 0 ? (
          <div>
            <div className="text-3xl font-semibold text-purple-500">
              {todayChores.length} today
            </div>
            <div className="text-sm text-muted-foreground mt-1">
              {pendingChores.length} total pending
            </div>
          </div>
        ) : (
          <div className="text-muted-foreground">
            {pendingChores.length > 0 ? `${pendingChores.length} pending` : "All done!"}
          </div>
        )}
      </Card>
    </Link>
  );
}

// Shopping Widget
function ShoppingWidget() {
  const { data: shoppingItems = [] } = useQuery<Array<{ id: string; name: string; completed: boolean }>>({
    queryKey: ["/api/shopping"],
  });

  const pendingItems = shoppingItems.filter(item => !item.completed);

  return (
    <Link href="/shopping">
      <Card className={cn(
        "p-6 cursor-pointer transition-all hover:scale-[1.02]",
        pendingItems.length > 0
          ? "bg-gradient-to-br from-teal-500/10 to-teal-500/5 border-teal-500/20"
          : "bg-gradient-to-br from-gray-500/10 to-gray-500/5 border-gray-500/20"
      )}>
        <div className="flex items-center gap-3 mb-2">
          <ShoppingCart className={cn("h-5 w-5", pendingItems.length > 0 ? "text-teal-500" : "text-gray-500")} />
          <span className="text-sm font-medium text-muted-foreground">Shopping</span>
        </div>
        {pendingItems.length > 0 ? (
          <div className="text-3xl font-semibold text-teal-500">
            {pendingItems.length} items
          </div>
        ) : (
          <div className="text-muted-foreground">List empty</div>
        )}
      </Card>
    </Link>
  );
}

// Quick Actions Widget
function QuickActionsWidget() {
  return (
    <Card className="p-6 bg-gradient-to-br from-amber-500/10 to-amber-500/5 border-amber-500/20">
      <div className="flex items-center gap-3 mb-4">
        <Bell className="h-5 w-5 text-amber-500" />
        <span className="text-sm font-medium text-muted-foreground">Quick Actions</span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Link href="/messages">
          <Button variant="outline" className="w-full h-16 flex flex-col gap-1">
            <MessageSquare className="h-5 w-5" />
            <span className="text-xs">Message</span>
          </Button>
        </Link>
        <Link href="/shopping">
          <Button variant="outline" className="w-full h-16 flex flex-col gap-1">
            <ShoppingCart className="h-5 w-5" />
            <span className="text-xs">Add Item</span>
          </Button>
        </Link>
        <Link href="/chores">
          <Button variant="outline" className="w-full h-16 flex flex-col gap-1">
            <CheckSquare className="h-5 w-5" />
            <span className="text-xs">Add Chore</span>
          </Button>
        </Link>
        <Link href="/recipes">
          <Button variant="outline" className="w-full h-16 flex flex-col gap-1">
            <ChefHat className="h-5 w-5" />
            <span className="text-xs">Recipes</span>
          </Button>
        </Link>
      </div>
    </Card>
  );
}

export default function DashboardPage() {
  const { data: settings } = useQuery<UserSettings>({
    queryKey: ["/api/settings"],
  });

  const { data: weather } = useQuery<WeatherData>({
    queryKey: ["/api/weather", settings?.location?.city, settings?.location?.country],
    enabled: !!settings?.location?.city,
  });

  const { data: events = [] } = useQuery<CalendarEvent[]>({
    queryKey: ["/api/calendar/events"],
  });

  const { data: unreadData } = useQuery<{ count: number }>({
    queryKey: ["/api/messages/unread-count"],
  });

  const { data: chores = [] } = useQuery<Chore[]>({
    queryKey: ["/api/chores"],
  });

  const timeFormat = settings?.timeFormat || "24h";
  const temperatureUnit = settings?.temperatureUnit || "celsius";
  const unreadCount = unreadData?.count || 0;

  return (
    <div className="min-h-full bg-background p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-semibold">
            {settings?.homeName || "Family Dashboard"}
          </h1>
          <p className="text-muted-foreground">Your home at a glance</p>
        </div>

        {/* Main Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Row 1: Clock, Weather, Events */}
          <ClockWidget timeFormat={timeFormat} />
          <WeatherWidget
            weather={weather}
            temperatureUnit={temperatureUnit}
            location={settings?.location}
          />
          <EventsWidget events={events} />

          {/* Row 2: Messages, Chores, Shopping */}
          <MessagesWidget unreadCount={unreadCount} />
          <ChoresWidget chores={chores} />
          <ShoppingWidget />

          {/* Row 3: Quick Actions */}
          <div className="md:col-span-2 lg:col-span-3">
            <QuickActionsWidget />
          </div>
        </div>
      </div>
    </div>
  );
}
