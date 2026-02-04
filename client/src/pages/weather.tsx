import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { WeatherIcon } from "@/components/weather-icon";
import { formatTemperature, formatDay, getWeatherInfo } from "@/lib/weather-utils";
import { MapPin, Settings, Droplets, Wind, ThermometerSun, ArrowUp, ArrowDown } from "lucide-react";
import { Link } from "wouter";
import { useWeatherData } from "@/hooks/use-weather-data";
import { queryClient } from "@/lib/queryClient";

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

export default function WeatherPage() {
  const { weather, isLoading, temperatureUnit, hasLocation, requestLocation } = useWeatherData();

  const unit = temperatureUnit;

  const TemperatureToggle = () => (
    <div className="fixed top-4 right-4 z-50">
      <div className="flex items-center gap-2 bg-black/40 backdrop-blur rounded-lg px-4 py-2">
        <Label htmlFor="unit-toggle" className="text-sm font-semibold text-white/80">°C</Label>
        <Switch
          id="unit-toggle"
          checked={unit === "fahrenheit"}
          onCheckedChange={async (checked) => {
            const newUnit = checked ? "fahrenheit" : "celsius";
            await fetch("/api/settings", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ temperatureUnit: newUnit })
            });
            queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
          }}
          data-testid="switch-temperature-unit"
        />
        <Label htmlFor="unit-toggle" className="text-sm font-semibold text-white/80">°F</Label>
      </div>
    </div>
  );

  if (isLoading) {
    return (
      <div className="h-full bg-background">
        <TemperatureToggle />
        <WeatherSkeleton />
      </div>
    );
  }

  if (!hasLocation) {
    return (
      <div className="h-full flex items-center justify-center p-8 bg-background">
        <TemperatureToggle />
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
              <Button onClick={requestLocation} size="lg" className="text-xl py-6" data-testid="button-use-my-location">
                <MapPin className="h-6 w-6 mr-3" />
                Use My Location
              </Button>
              <Button variant="outline" size="lg" asChild className="text-xl py-6" data-testid="button-go-to-settings">
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
        <TemperatureToggle />
        <WeatherSkeleton />
      </div>
    );
  }

  const { current, daily, location } = weather;
  const today = daily[0];
  const weatherInfo = getWeatherInfo(current.weatherCode);

  return (
    <div 
            className="h-full bg-background overflow-y-auto md:overflow-hidden md:flex md:flex-col md:p-6 md:gap-4 snap-y snap-mandatory md:snap-none"
    >
      <TemperatureToggle />
      
      {/* Row 1: Current Weather Hero + Today's Details */}
      <div className="md:flex-1 md:grid md:grid-cols-2 md:gap-4 md:min-h-0">
        
        {/* Hero Widget: Current Weather - optimized for distance viewing */}
        <Card className="min-h-[100dvh] md:min-h-0 md:h-full snap-start md:snap-align-none" data-testid="widget-current-weather">
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

        {/* Today's Details Widget - key metrics for the day */}
        <Card className="min-h-[100dvh] md:min-h-0 md:h-full snap-start md:snap-align-none" data-testid="widget-today-details">
          <CardContent className="h-full flex flex-col justify-center p-6 md:p-8">
            {/* High / Low */}
            <div className="flex items-center justify-center gap-8 md:gap-12 mb-8">
              <div className="flex flex-col items-center">
                <div className="flex items-center gap-2 text-muted-foreground mb-2">
                  <ArrowUp className="h-6 w-6 md:h-8 md:w-8 text-orange-500" />
                  <span className="text-xl md:text-2xl uppercase tracking-wide">High</span>
                </div>
                <span className="text-6xl md:text-7xl lg:text-8xl font-bold" data-testid="text-high-temp">
                  {formatTemperature(today?.tempMax ?? current.temperature, unit)}
                </span>
              </div>
              <div className="w-px h-24 md:h-32 bg-border" />
              <div className="flex flex-col items-center">
                <div className="flex items-center gap-2 text-muted-foreground mb-2">
                  <ArrowDown className="h-6 w-6 md:h-8 md:w-8 text-blue-500" />
                  <span className="text-xl md:text-2xl uppercase tracking-wide">Low</span>
                </div>
                <span className="text-6xl md:text-7xl lg:text-8xl font-bold" data-testid="text-low-temp">
                  {formatTemperature(today?.tempMin ?? current.temperature, unit)}
                </span>
              </div>
            </div>

            {/* Feels Like */}
            <div className="flex items-center justify-center gap-4 mb-8">
              <ThermometerSun className="h-8 w-8 md:h-10 md:w-10 text-amber-500" />
              <span className="text-2xl md:text-3xl text-muted-foreground">Feels like</span>
              <span className="text-4xl md:text-5xl font-bold" data-testid="text-feels-like">
                {formatTemperature(current.feelsLike ?? current.temperature, unit)}
              </span>
            </div>

            {/* Humidity and Wind */}
            <div className="flex items-center justify-center gap-12 md:gap-16">
              <div className="flex flex-col items-center">
                <Droplets className="h-10 w-10 md:h-12 md:w-12 text-blue-400 mb-2" />
                <span className="text-4xl md:text-5xl font-bold" data-testid="text-humidity">
                  {current.humidity}%
                </span>
                <span className="text-lg md:text-xl text-muted-foreground mt-1">Humidity</span>
              </div>
              <div className="flex flex-col items-center">
                <Wind className="h-10 w-10 md:h-12 md:w-12 text-sky-400 mb-2" />
                <span className="text-4xl md:text-5xl font-bold" data-testid="text-wind">
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

      {/* Row 2: 7-Day Forecast - large cards for distance viewing */}
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
    </div>
  );
}
