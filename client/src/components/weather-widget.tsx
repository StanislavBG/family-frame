import { Skeleton } from "@/components/ui/skeleton";
import { WeatherIcon } from "@/components/weather-icon";
import { Cloud, Droplets, Wind } from "lucide-react";
import { getWeatherInfo } from "@/lib/weather-utils";
import { useWeatherData } from "@/hooks/use-weather-data";
import type { WeatherData } from "@shared/schema";

interface WeatherWidgetBaseProps {
  weather?: {
    current: WeatherData;
    location: { city: string; country: string };
  };
  isLoading?: boolean;
  temperatureUnit?: "celsius" | "fahrenheit";
  variant?: "full" | "compact" | "detailed" | "hero";
  className?: string;
}

interface WeatherWidgetProps extends WeatherWidgetBaseProps {
  selfContained?: boolean;
}

function WeatherWidgetRenderer({ 
  weather, 
  isLoading, 
  temperatureUnit = "celsius",
  variant = "full",
  className = ""
}: WeatherWidgetBaseProps) {
  const formatTemperature = (temp: number) => {
    if (temperatureUnit === "fahrenheit") {
      return `${Math.round(temp * 9/5 + 32)}°`;
    }
    return `${Math.round(temp)}°`;
  };

  if (isLoading) {
    return (
      <div className={`flex flex-col items-center justify-center ${className}`} data-testid="weather-widget">
        <Skeleton className="h-24 w-24 rounded-full" />
      </div>
    );
  }

  if (!weather?.current) {
    return (
      <div className={`flex flex-col items-center justify-center ${className}`} data-testid="weather-widget">
        <Cloud className="h-24 w-24 text-muted-foreground" />
        <div className="text-2xl text-muted-foreground mt-4">Weather</div>
      </div>
    );
  }

  if (variant === "compact") {
    return (
      <div className={`flex flex-col items-center justify-center ${className}`} data-testid="weather-widget">
        <WeatherIcon 
          code={weather.current.weatherCode} 
          isDay={weather.current.isDay} 
          className="h-24 w-24 md:h-32 md:w-32" 
        />
        <div className="text-7xl md:text-8xl lg:text-9xl font-bold mt-4" data-testid="text-weather-temp">
          {formatTemperature(weather.current.temperature)}
        </div>
        <div className="text-2xl md:text-3xl text-muted-foreground mt-2">
          {weather.location.city}
        </div>
      </div>
    );
  }

  if (variant === "detailed") {
    return (
      <div className={`flex flex-col items-center justify-center ${className}`} data-testid="weather-widget">
        <WeatherIcon 
          code={weather.current.weatherCode} 
          isDay={weather.current.isDay} 
          className="h-24 w-24 md:h-32 md:w-32" 
        />
        <div className="text-7xl md:text-8xl lg:text-9xl font-bold mt-4" data-testid="text-temperature">
          {formatTemperature(weather.current.temperature)}
        </div>
        <div className="text-2xl md:text-3xl text-muted-foreground mt-2">
          {weather.location.city}
        </div>
        <div className="flex items-center gap-8 mt-4 text-xl text-muted-foreground">
          <div className="flex items-center gap-2">
            <Droplets className="h-6 w-6 text-blue-400" />
            <span>{weather.current.humidity}%</span>
          </div>
          <div className="flex items-center gap-2">
            <Wind className="h-6 w-6 text-sky-400" />
            <span>{Math.round(weather.current.windSpeed)} km/h</span>
          </div>
        </div>
        <div className="text-xl text-muted-foreground mt-2">
          {getWeatherInfo(weather.current.weatherCode).description}
        </div>
      </div>
    );
  }

  if (variant === "hero") {
    return (
      <div className={`grid grid-cols-3 gap-2 w-full h-full ${className}`} data-testid="weather-widget">
        <div className="flex items-center justify-center">
          <WeatherIcon 
            code={weather.current.weatherCode} 
            isDay={weather.current.isDay} 
            className="w-[min(25vw,35vh)] h-[min(25vw,35vh)]" 
          />
        </div>
        <div className="flex items-center justify-center">
          <div 
            className="font-bold leading-none text-[min(20vw,30vh)]" 
            data-testid="text-weather-temp"
          >
            {formatTemperature(weather.current.temperature)}
          </div>
        </div>
        <div className="flex items-center justify-center">
          <div className="text-[min(6vw,10vh)] text-muted-foreground text-center leading-tight">
            {weather.location.city}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`grid grid-cols-3 gap-2 w-full h-full ${className}`} data-testid="weather-widget">
      <div className="flex items-center justify-center">
        <WeatherIcon 
          code={weather.current.weatherCode} 
          isDay={weather.current.isDay} 
          className="w-[min(25vw,35vh)] h-[min(25vw,35vh)]" 
        />
      </div>
      <div className="flex items-center justify-center">
        <div 
          className="font-bold leading-none text-[min(20vw,30vh)]" 
          data-testid="text-weather-temp"
        >
          {formatTemperature(weather.current.temperature)}
        </div>
      </div>
      <div className="flex items-center justify-center">
        <div className="text-[min(6vw,10vh)] text-muted-foreground text-center leading-tight">
          {weather.location.city}
        </div>
      </div>
    </div>
  );
}

function SelfContainedWeatherWidget({ variant, className }: { variant?: WeatherWidgetBaseProps["variant"]; className?: string }) {
  const { weather, isLoading, temperatureUnit } = useWeatherData();
  
  return (
    <WeatherWidgetRenderer
      weather={weather}
      isLoading={isLoading}
      temperatureUnit={temperatureUnit}
      variant={variant}
      className={className}
    />
  );
}

export function WeatherWidget({ 
  weather, 
  isLoading, 
  temperatureUnit,
  variant = "full",
  className = "",
  selfContained = false
}: WeatherWidgetProps) {
  if (selfContained) {
    return <SelfContainedWeatherWidget variant={variant} className={className} />;
  }
  
  return (
    <WeatherWidgetRenderer
      weather={weather}
      isLoading={isLoading}
      temperatureUnit={temperatureUnit}
      variant={variant}
      className={className}
    />
  );
}
