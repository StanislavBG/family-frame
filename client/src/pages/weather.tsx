import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import type { DailyForecast } from "@shared/schema";
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

// --- Light mode advisory components (compact, secondary role) ---

function OutdoorAdvisoryCompact({ advice }: { advice: OutdoorAdvice }) {
  const styles = {
    yes: { icon: <CheckCircle2 className="h-8 w-8 md:h-10 md:w-10 text-emerald-500" />, text: "text-emerald-700 dark:text-emerald-300" },
    maybe: { icon: <AlertTriangle className="h-8 w-8 md:h-10 md:w-10 text-amber-500" />, text: "text-amber-700 dark:text-amber-300" },
    no: { icon: <XCircle className="h-8 w-8 md:h-10 md:w-10 text-red-500" />, text: "text-red-700 dark:text-red-300" },
  };
  const s = styles[advice.rating];

  return (
    <div className="flex items-center gap-3" data-testid="card-outdoor-advisory">
      {s.icon}
      <div className="min-w-0">
        <div className={cn("text-lg md:text-xl font-semibold leading-tight", s.text)}>
          {advice.headline}
        </div>
        <div className="text-sm md:text-base text-muted-foreground truncate">
          {advice.reasons[0]}
        </div>
      </div>
    </div>
  );
}

function TrailAdvisoryCompact({ advice }: { advice: TrailAdvice }) {
  const styles = {
    dry: { icon: <TreePine className="h-8 w-8 md:h-10 md:w-10 text-emerald-500" />, text: "text-emerald-700 dark:text-emerald-300" },
    damp: { icon: <Footprints className="h-8 w-8 md:h-10 md:w-10 text-amber-500" />, text: "text-amber-700 dark:text-amber-300" },
    wet: { icon: <Layers className="h-8 w-8 md:h-10 md:w-10 text-blue-500" />, text: "text-blue-700 dark:text-blue-300" },
  };
  const s = styles[advice.condition];

  return (
    <div className="flex items-center gap-3" data-testid="card-trail-advisory">
      {s.icon}
      <div className="min-w-0">
        <div className={cn("text-lg md:text-xl font-semibold leading-tight", s.text)}>
          {advice.headline}
        </div>
        <div className="text-sm md:text-base text-muted-foreground truncate">
          {advice.detail}
        </div>
      </div>
    </div>
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

  // Advisories
  const outdoorAdvice = getOutdoorAdvice(
    isAfterDark && focusDay ? focusDay.weatherCode : current.weatherCode,
    isAfterDark && focusDay
      ? (focusDay.tempMax + focusDay.tempMin) / 2
      : current.temperature,
    current.windSpeed,
    focusDay?.precipitationProbability ?? 0
  );

  const trailAdvice = getTrailAdvice(
    hourly,
    today?.precipitationSum ?? 0,
    focusDay?.precipitationProbability ?? 0
  );

  return (
    <div className="flex-1 flex flex-col gap-3 md:gap-4 p-4 md:p-0 overflow-y-auto md:overflow-hidden">
      {/* Hero: Today's weather - maximize the space */}
      <Card className="flex-1 min-h-0" data-testid="widget-light-current">
        <CardContent className="h-full flex flex-col items-center justify-center p-4 md:p-6">
          <div className="text-base md:text-lg text-muted-foreground font-medium tracking-wide uppercase">
            {focusLabel} in {location.city}
          </div>

          <div className="flex items-center justify-center gap-4 md:gap-8 mt-2">
            <WeatherIcon
              code={isAfterDark && focusDay ? focusDay.weatherCode : current.weatherCode}
              isDay={!isAfterDark}
              className="h-24 w-24 md:h-32 md:w-32 lg:h-40 lg:w-40 flex-shrink-0"
            />
            <div className="text-[22vw] md:text-[16vw] lg:text-[14vw] font-bold leading-[0.85] tracking-tight">
              {isAfterDark && focusDay
                ? formatTemperature(
                    Math.round((focusDay.tempMax + focusDay.tempMin) / 2),
                    unit
                  )
                : formatTemperature(current.temperature, unit)}
            </div>
          </div>

          <div className="text-3xl md:text-4xl lg:text-5xl text-muted-foreground mt-2">
            {focusDayInfo.description}
          </div>

          {focusDay && (
            <div className="flex items-center gap-6 md:gap-8 mt-3 text-2xl md:text-3xl">
              <span className="flex items-center gap-1">
                <ArrowUp className="h-6 w-6 md:h-7 md:w-7 text-orange-500" />
                {formatTemperature(focusDay.tempMax, unit)}
              </span>
              <span className="flex items-center gap-1">
                <ArrowDown className="h-6 w-6 md:h-7 md:w-7 text-blue-500" />
                {formatTemperature(focusDay.tempMin, unit)}
              </span>
              {focusDay.precipitationProbability > 0 && (
                <span className="flex items-center gap-1">
                  <Droplets className="h-6 w-6 md:h-7 md:w-7 text-blue-400" />
                  {focusDay.precipitationProbability}%
                </span>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Bottom bar: Advisories (compact) + Tomorrow peek */}
      <Card className="flex-shrink-0">
        <CardContent className="p-4 md:p-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 items-start">
            {/* Outdoor advisory */}
            <div>
              <div className="text-[11px] md:text-xs font-medium text-muted-foreground uppercase tracking-widest mb-2 border-b pb-1">
                Can I go outside?
              </div>
              <OutdoorAdvisoryCompact advice={outdoorAdvice} />
            </div>

            {/* Trail advisory */}
            <div>
              <div className="text-[11px] md:text-xs font-medium text-muted-foreground uppercase tracking-widest mb-2 border-b pb-1">
                How are the trails?
              </div>
              <TrailAdvisoryCompact advice={trailAdvice} />
            </div>

            {/* Tomorrow / Now peek */}
            <div>
              <div className="text-[11px] md:text-xs font-medium text-muted-foreground uppercase tracking-widest mb-2 border-b pb-1">
                {isAfterDark ? "What's it like now?" : "What about tomorrow?"}
              </div>
              <div className="flex items-center gap-3" data-testid="widget-light-peek">
                <WeatherIcon
                  code={
                    isAfterDark
                      ? current.weatherCode
                      : (tomorrow?.weatherCode ?? current.weatherCode)
                  }
                  isDay={isAfterDark ? false : true}
                  className="h-8 w-8 md:h-10 md:w-10 flex-shrink-0"
                />
                <div className="min-w-0">
                  <div className="text-lg md:text-xl font-semibold leading-tight">
                    {isAfterDark
                      ? formatTemperature(current.temperature, unit)
                      : tomorrow
                        ? `${formatTemperature(tomorrow.tempMax, unit)} / ${formatTemperature(tomorrow.tempMin, unit)}`
                        : "---"}
                  </div>
                  <div className="text-sm md:text-base text-muted-foreground">
                    {isAfterDark ? "Right now" : "Tomorrow"}
                    {!isAfterDark && tomorrow && tomorrow.precipitationProbability > 0
                      ? ` \u00b7 ${tomorrow.precipitationProbability}% rain`
                      : ""}
                  </div>
                </div>
              </div>
            </div>
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

  if (isLoading) {
    return (
      <div className="h-full bg-background">
        <WeatherSkeleton />
      </div>
    );
  }

  if (!hasLocation) {
    return (
      <div className="h-full flex items-center justify-center p-8 bg-background">
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
        <WeatherSkeleton />
      </div>
    );
  }

  return (
    <div className="h-full bg-background overflow-y-auto md:overflow-hidden md:flex md:flex-col md:p-6 md:gap-4 snap-y snap-mandatory md:snap-none">

      {displayMode === "light" ? (
        <WeatherLightMode weather={weather} unit={unit} />
      ) : (
        <WeatherDenseMode weather={weather} unit={unit} />
      )}
    </div>
  );
}
