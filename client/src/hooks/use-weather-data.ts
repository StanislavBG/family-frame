import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import type { WeatherData, DailyForecast, HourlyForecast, UserSettings } from "@shared/schema";

export interface WeatherResponse {
  current: WeatherData;
  daily: DailyForecast[];
  hourly: HourlyForecast[];
  location: {
    city: string;
    country: string;
  };
}

interface UseWeatherDataResult {
  weather: WeatherResponse | undefined;
  isLoading: boolean;
  temperatureUnit: "celsius" | "fahrenheit";
  coords: { lat: number; lon: number } | null;
  hasLocation: boolean;
  requestLocation: () => void;
}

export function useWeatherData(): UseWeatherDataResult {
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(() => {
    const cached = sessionStorage.getItem("weather_coords");
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch {
        return null;
      }
    }
    return null;
  });

  const [geoAttempted, setGeoAttempted] = useState(() => {
    return sessionStorage.getItem("weather_coords") !== null || 
           sessionStorage.getItem("geo_attempted") === "true";
  });

  useEffect(() => {
    if (coords || sessionStorage.getItem("geo_attempted") === "true") {
      setGeoAttempted(true);
      return;
    }

    if ("geolocation" in navigator) {
      const timeoutId = setTimeout(() => {
        sessionStorage.setItem("geo_attempted", "true");
        setGeoAttempted(true);
      }, 2000);
      
      navigator.geolocation.getCurrentPosition(
        (position) => {
          clearTimeout(timeoutId);
          const newCoords = {
            lat: position.coords.latitude,
            lon: position.coords.longitude,
          };
          sessionStorage.setItem("weather_coords", JSON.stringify(newCoords));
          sessionStorage.setItem("geo_attempted", "true");
          setCoords(newCoords);
          setGeoAttempted(true);
        },
        () => {
          clearTimeout(timeoutId);
          sessionStorage.setItem("geo_attempted", "true");
          setGeoAttempted(true);
        },
        { timeout: 2000, enableHighAccuracy: false }
      );
    } else {
      sessionStorage.setItem("geo_attempted", "true");
      setGeoAttempted(true);
    }
  }, [coords]);

  const { data: settings, isLoading: settingsLoading } = useQuery<UserSettings>({
    queryKey: ["/api/settings"],
  });

  const hasSettingsLocation = !!(settings?.location?.city && settings?.location?.country);
  const useSettingsLocation = geoAttempted && !coords && hasSettingsLocation;

  const { data: weatherFromCoords, isLoading: isLoadingCoords } = useQuery<WeatherResponse>({
    queryKey: ["/api/weather/coords", coords?.lat, coords?.lon],
    enabled: !!coords,
    staleTime: 5 * 60 * 1000,
  });

  const { data: weatherFromSettings, isLoading: isLoadingSettings } = useQuery<WeatherResponse>({
    queryKey: ["/api/weather", settings?.location?.city, settings?.location?.country],
    enabled: !!useSettingsLocation,
    staleTime: 5 * 60 * 1000,
  });

  const weather = coords ? weatherFromCoords : weatherFromSettings;
  const isLoading = settingsLoading || !geoAttempted || (coords ? isLoadingCoords : isLoadingSettings);
  const hasLocation = !!(coords || hasSettingsLocation);

  const requestLocation = () => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const newCoords = {
            lat: position.coords.latitude,
            lon: position.coords.longitude,
          };
          sessionStorage.setItem("weather_coords", JSON.stringify(newCoords));
          sessionStorage.setItem("geo_attempted", "true");
          setCoords(newCoords);
        },
        () => {
          // Geolocation failed or denied
        },
        { timeout: 10000, enableHighAccuracy: true }
      );
    }
  };

  return {
    weather,
    isLoading,
    temperatureUnit: settings?.temperatureUnit || "celsius",
    coords,
    hasLocation,
    requestLocation,
  };
}
