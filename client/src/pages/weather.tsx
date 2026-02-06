import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { WeatherIcon } from "@/components/weather-icon";
import {
  formatTemperature,
  formatDay,
  getWeatherInfo,
  getOutdoorAdvice,
  getTrailAdvice,
  type OutdoorAdvice,
  type TrailAdvice,
} from "@/lib/weather-utils";
import {
  MapPin,
  Settings,
  Droplets,
  Wind,
  ThermometerSun,
  ArrowUp,
  ArrowDown,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  TreePine,
  Footprints,
  Layers,
} from "lucide-react";
import { Link } from "wouter";
import { useWeatherData, type WeatherResponse } from "@/hooks/use-weather-data";
import { queryClient } from "@/lib/queryClient";
import type { DailyForecast, HourlyForecast } from "@shared/schema";
import { cn } from "@/lib/utils";

function WeatherSkeleton() {
  return (
    <div className="h-full flex items-center justify-center">
      <div className="text-center">
        <Skeleton className="h-40 w-40 rounded-full mx-auto mb-8" />
        <Skeleton className="h-32 w-64 mx-auto" />
      </div>
    </div>
  );
}

// --- Dense mode (existing layout, renamed) ---

function WeatherDenseMode({
  weather,
  unit,
}: {
  weather: WeatherResponse;
  unit: "celsius" | "fahrenheit";
}) {
  const { current, daily, location } = weather;
  const today = daily[0];
  const weatherInfo = getWeatherInfo(current.weatherCode);

  return (
    <>
      {/* Row 1: Current Weather Hero + Today's Details */}
      <div className="md:flex-1 md:grid md:grid-cols-2 md:gap-4 md:min-h-0">
        {/* Hero Widget */}
        <Card
          className="min-h-[100dvh] md:min-h-0 md:h-full snap-start md:snap-align-none"
          data-testid="widget-current-weather"
        >
          <CardContent className="h-full flex flex-col items-center justify-center p-6">
            <WeatherIcon
              code={current.weatherCode}
              isDay={current.isDay}
              className="h-32 w-32 md:h-40 md:w-40 lg:h-48 lg:w-48"
            />
            <div
              className="text-[20vw] md:text-[12vw] lg:text-[10vw] font-bold leading-none mt-4"
              data-testid="text-current-temp"
            >
              {formatTemperature(current.temperature, unit)}
            </div>
            <div className="text-3xl md:text-4xl lg:text-5xl text-muted-foreground mt-2">
              {location.city}
            </div>
            <div className="text-xl md:text-2xl lg:text-3xl text-muted-foreground mt-2">
              {weatherInfo.description}
            </div>
          </CardContent>
        </Card>

        {/* Today's Details Widget */}
        <Card
          className="min-h-[100dvh] md:min-h-0 md:h-full snap-start md:snap-align-none"
          data-testid="widget-today-details"
        >
          <CardContent className="h-full flex flex-col justify-center p-6 md:p-8">
            <div className="flex items-center justify-center gap-8 md:gap-12 mb-8">
              <div className="flex flex-col items-center">
                <div className="flex items-center gap-2 text-muted-foreground mb-2">
                  <ArrowUp className="h-6 w-6 md:h-8 md:w-8 text-orange-500" />
                  <span className="text-xl md:text-2xl uppercase tracking-wide">
                    High
                  </span>
                </div>
                <span
                  className="text-6xl md:text-7xl lg:text-8xl font-bold"
                  data-testid="text-high-temp"
                >
                  {formatTemperature(
                    today?.tempMax ?? current.temperature,
                    unit
                  )}
                </span>
              </div>
              <div className="w-px h-24 md:h-32 bg-border" />
              <div className="flex flex-col items-center">
                <div className="flex items-center gap-2 text-muted-foreground mb-2">
                  <ArrowDown className="h-6 w-6 md:h-8 md:w-8 text-blue-500" />
                  <span className="text-xl md:text-2xl uppercase tracking-wide">
                    Low
                  </span>
                </div>
                <span
                  className="text-6xl md:text-7xl lg:text-8xl font-bold"
                  data-testid="text-low-temp"
                >
                  {formatTemperature(
                    today?.tempMin ?? current.temperature,
                    unit
                  )}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-center gap-4 mb-8">
              <ThermometerSun className="h-8 w-8 md:h-10 md:w-10 text-amber-500" />
              <span className="text-2xl md:text-3xl text-muted-foreground">
                Feels like
              </span>
              <span
                className="text-4xl md:text-5xl font-bold"
                data-testid="text-feels-like"
              >
                {formatTemperature(
                  current.feelsLike ?? current.temperature,
                  unit
                )}
              </span>
            </div>

            <div className="flex items-center justify-center gap-12 md:gap-16">
              <div className="flex flex-col items-center">
                <Droplets className="h-10 w-10 md:h-12 md:w-12 text-blue-400 mb-2" />
                <span
                  className="text-4xl md:text-5xl font-bold"
                  data-testid="text-humidity"
                >
                  {current.humidity}%
                </span>
                <span className="text-lg md:text-xl text-muted-foreground mt-1">
                  Humidity
                </span>
              </div>
              <div className="flex flex-col items-center">
                <Wind className="h-10 w-10 md:h-12 md:w-12 text-sky-400 mb-2" />
                <span
                  className="text-4xl md:text-5xl font-bold"
                  data-testid="text-wind"
                >
                  {Math.round(current.windSpeed)}
                </span>
                <span className="text-lg md:text-xl text-muted-foreground mt-1">
                  {unit === "fahrenheit" ? "mph" : "km/h"}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Row 2: 7-Day Forecast */}
      <div className="min-h-[100dvh] md:min-h-0 md:h-36 snap-start md:snap-align-none p-4 md:p-0">
        <div className="h-full flex flex-col md:flex-row flex-wrap gap-3 overflow-x-auto">
          {daily.slice(0, 7).map((day, index) => (
            <Card
              key={index}
              className="flex-shrink-0 w-full md:flex-1 md:min-w-0"
              data-testid={`forecast-day-${index}`}
            >
              <CardContent className="h-full flex md:flex-col items-center justify-between md:justify-center p-4 gap-3">
                <div className="text-lg md:text-xl font-medium text-muted-foreground w-20 md:w-auto md:text-center">
                  {index === 0 ? "Today" : formatDay(day.date)}
                </div>
                <WeatherIcon
                  code={day.weatherCode}
                  isDay={true}
                  className="h-12 w-12 md:h-10 md:w-10 flex-shrink-0"
                />
                <div className="flex md:flex-col items-center gap-3 md:gap-1">
                  <span className="text-2xl md:text-3xl font-bold">
                    {formatTemperature(day.tempMax, unit)}
                  </span>
                  <span className="text-xl md:text-2xl text-muted-foreground">
                    {formatTemperature(day.tempMin, unit)}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </>
  );
}

// --- Light mode (new: focused today/tomorrow view with advisories) ---

function OutdoorAdvisoryCard({ advice }: { advice: OutdoorAdvice }) {
  const colorMap = {
    yes: {
      bg: "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800",
      icon: <CheckCircle2 className="h-16 w-16 md:h-20 md:w-20 text-emerald-500" />,
      text: "text-emerald-700 dark:text-emerald-300",
    },
    maybe: {
      bg: "bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800",
      icon: <AlertTriangle className="h-16 w-16 md:h-20 md:w-20 text-amber-500" />,
      text: "text-amber-700 dark:text-amber-300",
    },
    no: {
      bg: "bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800",
      icon: <XCircle className="h-16 w-16 md:h-20 md:w-20 text-red-500" />,
      text: "text-red-700 dark:text-red-300",
    },
  };

  const style = colorMap[advice.rating];

  return (
    <Card className={cn("border-2", style.bg)} data-testid="card-outdoor-advisory">
      <CardContent className="flex flex-col items-center justify-center p-6 md:p-8 text-center">
        {style.icon}
        <h3
          className={cn(
            "text-3xl md:text-4xl lg:text-5xl font-bold mt-4",
            style.text
          )}
        >
          {advice.headline}
        </h3>
        <div className="mt-3 space-y-1">
          {advice.reasons.map((reason, i) => (
            <p
              key={i}
              className="text-lg md:text-xl lg:text-2xl text-muted-foreground"
            >
              {reason}
            </p>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function TrailAdvisoryCard({ advice }: { advice: TrailAdvice }) {
  const styleMap = {
    dry: {
      bg: "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800",
      icon: <TreePine className="h-14 w-14 md:h-16 md:w-16 text-emerald-500" />,
      text: "text-emerald-700 dark:text-emerald-300",
    },
    damp: {
      bg: "bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800",
      icon: <Footprints className="h-14 w-14 md:h-16 md:w-16 text-amber-500" />,
      text: "text-amber-700 dark:text-amber-300",
    },
    wet: {
      bg: "bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800",
      icon: <Layers className="h-14 w-14 md:h-16 md:w-16 text-blue-500" />,
      text: "text-blue-700 dark:text-blue-300",
    },
  };

  const style = styleMap[advice.condition];

  return (
    <Card className={cn("border-2", style.bg)} data-testid="card-trail-advisory">
      <CardContent className="flex flex-col items-center justify-center p-6 md:p-8 text-center">
        {style.icon}
        <h3
          className={cn(
            "text-2xl md:text-3xl lg:text-4xl font-bold mt-3",
            style.text
          )}
        >
          {advice.headline}
        </h3>
        <p className="text-lg md:text-xl text-muted-foreground mt-2">
          {advice.detail}
        </p>
      </CardContent>
    </Card>
  );
}

function WeatherLightMode({
  weather,
  unit,
}: {
  weather: WeatherResponse;
  unit: "celsius" | "fahrenheit";
}) {
  const { current, daily, hourly, location } = weather;
  const isAfterDark = !current.isDay;

  // Time-aware: show today or tomorrow
  const today = daily[0];
  const tomorrow = daily[1];
  const focusDay: DailyForecast | undefined = isAfterDark ? tomorrow : today;
  const focusLabel = isAfterDark ? "Tomorrow" : "Today";
  const focusDayInfo = focusDay
    ? getWeatherInfo(focusDay.weatherCode)
    : getWeatherInfo(current.weatherCode);

  // For "Can I Go Out?" use the focus day's data
  const outdoorAdvice = getOutdoorAdvice(
    isAfterDark && focusDay ? focusDay.weatherCode : current.weatherCode,
    isAfterDark && focusDay
      ? (focusDay.tempMax + focusDay.tempMin) / 2
      : current.temperature,
    current.windSpeed,
    focusDay?.precipitationProbability ?? 0
  );

  // For "Trail Conditions" use hourly precipitation history
  const trailAdvice = getTrailAdvice(
    hourly,
    today?.precipitationSum ?? 0,
    focusDay?.precipitationProbability ?? 0
  );

  return (
    <div className="flex-1 flex flex-col gap-4 md:gap-6 p-4 md:p-0 overflow-y-auto md:overflow-hidden">
      {/* Top: Current conditions + focus day summary */}
      <Card className="flex-shrink-0" data-testid="widget-light-current">
        <CardContent className="flex items-center gap-6 md:gap-8 p-6 md:p-8">
          <WeatherIcon
            code={isAfterDark && focusDay ? focusDay.weatherCode : current.weatherCode}
            isDay={!isAfterDark}
            className="h-24 w-24 md:h-32 md:w-32 flex-shrink-0"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-3 flex-wrap">
              <span className="text-5xl md:text-7xl lg:text-8xl font-bold leading-none">
                {isAfterDark && focusDay
                  ? formatTemperature(
                      Math.round((focusDay.tempMax + focusDay.tempMin) / 2),
                      unit
                    )
                  : formatTemperature(current.temperature, unit)}
              </span>
              <span className="text-2xl md:text-3xl text-muted-foreground font-medium">
                {focusLabel}
              </span>
            </div>
            <div className="text-xl md:text-2xl text-muted-foreground mt-1">
              {focusDayInfo.description} in {location.city}
            </div>
            {focusDay && (
              <div className="flex items-center gap-4 mt-2 text-lg md:text-xl">
                <span className="flex items-center gap-1">
                  <ArrowUp className="h-5 w-5 text-orange-500" />
                  {formatTemperature(focusDay.tempMax, unit)}
                </span>
                <span className="flex items-center gap-1">
                  <ArrowDown className="h-5 w-5 text-blue-500" />
                  {formatTemperature(focusDay.tempMin, unit)}
                </span>
                {focusDay.precipitationProbability > 0 && (
                  <span className="flex items-center gap-1">
                    <Droplets className="h-5 w-5 text-blue-400" />
                    {focusDay.precipitationProbability}%
                  </span>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Middle: Advisory panels side-by-side */}
      <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 min-h-0">
        <div className="flex flex-col justify-center">
          <div className="text-lg md:text-xl font-medium text-muted-foreground mb-2 px-1">
            Can I go out?
          </div>
          <OutdoorAdvisoryCard advice={outdoorAdvice} />
        </div>
        <div className="flex flex-col justify-center">
          <div className="text-lg md:text-xl font-medium text-muted-foreground mb-2 px-1">
            Trail conditions
          </div>
          <TrailAdvisoryCard advice={trailAdvice} />
        </div>
      </div>

      {/* Bottom: Quick peek at the other day */}
      <Card className="flex-shrink-0" data-testid="widget-light-peek">
        <CardContent className="flex items-center justify-between p-4 md:p-6">
          <span className="text-lg md:text-xl text-muted-foreground">
            {isAfterDark ? "Right now" : "Tomorrow"}
          </span>
          <div className="flex items-center gap-4">
            <WeatherIcon
              code={
                isAfterDark
                  ? current.weatherCode
                  : (tomorrow?.weatherCode ?? current.weatherCode)
              }
              isDay={isAfterDark ? false : true}
              className="h-8 w-8 md:h-10 md:w-10"
            />
            <span className="text-2xl md:text-3xl font-bold">
              {isAfterDark
                ? formatTemperature(current.temperature, unit)
                : tomorrow
                  ? `${formatTemperature(tomorrow.tempMax, unit)} / ${formatTemperature(tomorrow.tempMin, unit)}`
                  : "---"}
            </span>
            {!isAfterDark && tomorrow && tomorrow.precipitationProbability > 0 && (
              <span className="flex items-center gap-1 text-lg text-muted-foreground">
                <Droplets className="h-4 w-4 text-blue-400" />
                {tomorrow.precipitationProbability}%
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// --- Main page component ---

export default function WeatherPage() {
  const {
    weather,
    isLoading,
    temperatureUnit,
    weatherDisplayMode,
    hasLocation,
    requestLocation,
  } = useWeatherData();

  const unit = temperatureUnit;
  const displayMode = weatherDisplayMode;

  const TopControls = () => (
    <div className="fixed top-4 right-4 z-50 flex items-center gap-3">
      {/* Display mode toggle */}
      <div className="flex items-center gap-2 bg-black/40 backdrop-blur rounded-lg px-4 py-2">
        <Label htmlFor="mode-toggle" className="text-sm font-semibold text-white/80">
          Dense
        </Label>
        <Switch
          id="mode-toggle"
          checked={displayMode === "light"}
          onCheckedChange={async (checked) => {
            const newMode = checked ? "light" : "dense";
            await fetch("/api/settings", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ weatherDisplayMode: newMode }),
            });
            queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
          }}
          data-testid="switch-weather-display-mode"
        />
        <Label htmlFor="mode-toggle" className="text-sm font-semibold text-white/80">
          Light
        </Label>
      </div>

      {/* Temperature unit toggle */}
      <div className="flex items-center gap-2 bg-black/40 backdrop-blur rounded-lg px-4 py-2">
        <Label htmlFor="unit-toggle" className="text-sm font-semibold text-white/80">
          °C
        </Label>
        <Switch
          id="unit-toggle"
          checked={unit === "fahrenheit"}
          onCheckedChange={async (checked) => {
            const newUnit = checked ? "fahrenheit" : "celsius";
            await fetch("/api/settings", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ temperatureUnit: newUnit }),
            });
            queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
          }}
          data-testid="switch-temperature-unit"
        />
        <Label htmlFor="unit-toggle" className="text-sm font-semibold text-white/80">
          °F
        </Label>
      </div>
    </div>
  );

  if (isLoading) {
    return (
      <div className="h-full bg-background">
        <TopControls />
        <WeatherSkeleton />
      </div>
    );
  }

  if (!hasLocation) {
    return (
      <div className="h-full flex items-center justify-center p-8 bg-background">
        <TopControls />
        <Card className="max-w-lg">
          <CardContent className="p-12 text-center">
            <div className="w-24 h-24 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mx-auto mb-6">
              <MapPin className="h-12 w-12 text-amber-600 dark:text-amber-400" />
            </div>
            <h2 className="text-3xl font-semibold mb-4">Location Required</h2>
            <p className="text-xl text-muted-foreground mb-8">
              Share your location to see weather
            </p>
            <div className="flex flex-col gap-4">
              <Button
                onClick={requestLocation}
                size="lg"
                className="text-xl py-6"
                data-testid="button-use-my-location"
              >
                <MapPin className="h-6 w-6 mr-3" />
                Use My Location
              </Button>
              <Button
                variant="outline"
                size="lg"
                asChild
                className="text-xl py-6"
                data-testid="button-go-to-settings"
              >
                <Link href="/settings">
                  <Settings className="h-6 w-6 mr-3" />
                  Set Location Manually
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!weather) {
    return (
      <div className="h-full bg-background">
        <TopControls />
        <WeatherSkeleton />
      </div>
    );
  }

  return (
    <div className="h-full bg-background overflow-y-auto md:overflow-hidden md:flex md:flex-col md:p-6 md:gap-4 snap-y snap-mandatory md:snap-none">
      <TopControls />

      {displayMode === "light" ? (
        <WeatherLightMode weather={weather} unit={unit} />
      ) : (
        <WeatherDenseMode weather={weather} unit={unit} />
      )}
    </div>
  );
}
