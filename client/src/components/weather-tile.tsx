import { Skeleton } from "@/components/ui/skeleton";
import { WeatherIcon } from "@/components/weather-icon";
import { Cloud } from "lucide-react";
import { getWeatherInfo } from "@/lib/weather-utils";
import { useWeatherData, type WeatherResponse } from "@/hooks/use-weather-data";
import type { HourlyForecast } from "@shared/schema";

interface WeatherTileProps {
  className?: string;
}

function formatTemp(temp: number, unit: "celsius" | "fahrenheit"): string {
  if (unit === "fahrenheit") {
    return `${Math.round(temp * 9 / 5 + 32)}°`;
  }
  return `${Math.round(temp)}°`;
}

function getUpcomingHours(hourly: HourlyForecast[]): HourlyForecast[] {
  const now = new Date();
  const currentHour = now.getTime();
  return hourly
    .filter((h) => new Date(h.time).getTime() >= currentHour - 30 * 60 * 1000)
    .slice(0, 6);
}

function formatHour(timeStr: string): string {
  const date = new Date(timeStr);
  const now = new Date();
  // If within the same hour, show "Now"
  if (
    date.getHours() === now.getHours() &&
    date.getDate() === now.getDate()
  ) {
    return "Now";
  }
  const h = date.getHours();
  if (h === 0) return "12AM";
  if (h === 12) return "12PM";
  if (h > 12) return `${h - 12}PM`;
  return `${h}AM`;
}

function isHourDaytime(timeStr: string, sunrise?: string, sunset?: string): boolean {
  if (!sunrise || !sunset) {
    const h = new Date(timeStr).getHours();
    return h >= 6 && h < 20;
  }
  const time = new Date(timeStr).getTime();
  const rise = new Date(sunrise).getTime();
  const set = new Date(sunset).getTime();
  return time >= rise && time < set;
}

function WeatherTileContent({
  weather,
  isLoading,
  temperatureUnit,
}: {
  weather: WeatherResponse | undefined;
  isLoading: boolean;
  temperatureUnit: "celsius" | "fahrenheit";
}) {
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 p-4">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-16 w-20" />
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }

  if (!weather?.current) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-4">
        <Cloud className="h-16 w-16 text-muted-foreground" />
        <div className="text-lg text-muted-foreground mt-2">Weather</div>
      </div>
    );
  }

  const weatherInfo = getWeatherInfo(weather.current.weatherCode);
  const upcomingHours = getUpcomingHours(weather.hourly || []);
  const todayForecast = weather.daily?.[0];
  const sunrise = todayForecast?.sunrise;
  const sunset = todayForecast?.sunset;

  return (
    <div className="flex flex-col h-full w-full p-4 md:p-5" data-testid="weather-tile">
      {/* Large temperature + icon row */}
      <div className="flex items-center gap-3">
        <div className="text-5xl md:text-6xl lg:text-7xl font-light leading-none tracking-tight">
          {formatTemp(weather.current.temperature, temperatureUnit)}
        </div>
        <WeatherIcon
          code={weather.current.weatherCode}
          isDay={weather.current.isDay}
          className="h-10 w-10 md:h-12 md:w-12 flex-shrink-0"
        />
      </div>

      {/* Condition description */}
      <div className="text-sm md:text-base text-muted-foreground mt-1">
        {weatherInfo.description}
      </div>

      {/* High / Low */}
      {todayForecast && (
        <div className="text-sm text-muted-foreground">
          H:{formatTemp(todayForecast.tempMax, temperatureUnit)}{" "}
          L:{formatTemp(todayForecast.tempMin, temperatureUnit)}
        </div>
      )}

      {/* Spacer */}
      <div className="flex-1 min-h-2" />

      {/* Hourly forecast strip */}
      {upcomingHours.length > 0 && (
        <div className="border-t border-border/40 pt-2 mt-1">
          <div className="flex justify-between gap-1">
            {upcomingHours.map((hour, i) => (
              <div
                key={hour.time}
                className="flex flex-col items-center gap-0.5 flex-1 min-w-0"
              >
                <span className="text-[10px] md:text-xs text-muted-foreground font-medium">
                  {formatHour(hour.time)}
                </span>
                <WeatherIcon
                  code={hour.weatherCode}
                  isDay={isHourDaytime(hour.time, sunrise, sunset)}
                  className="h-4 w-4 md:h-5 md:w-5"
                />
                <span className="text-[10px] md:text-xs font-medium">
                  {formatTemp(hour.temperature, temperatureUnit)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function WeatherTile({ className = "" }: WeatherTileProps) {
  const { weather, isLoading, temperatureUnit } = useWeatherData();

  return (
    <div className={className}>
      <WeatherTileContent
        weather={weather}
        isLoading={isLoading}
        temperatureUnit={temperatureUnit}
      />
    </div>
  );
}
