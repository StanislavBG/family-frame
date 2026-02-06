import type { WeatherData, DailyForecast, HourlyForecast } from "@shared/schema";
import { getWeatherInfo } from "./weather-codes";

interface OpenMeteoResponse {
  timezone: string;
  current: {
    temperature_2m: number;
    apparent_temperature: number;
    relative_humidity_2m: number;
    wind_speed_10m: number;
    weather_code: number;
    is_day: number;
  };
  current_units: Record<string, string>;
  daily: {
    time: string[];
    weather_code: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_probability_max: number[];
    uv_index_max: number[];
  };
  hourly: {
    time: string[];
    temperature_2m: number[];
    weather_code: number[];
  };
}

interface GeocodingResult {
  name: string;
  country: string;
  latitude: number;
  longitude: number;
}

export async function geocodeCity(city: string, country?: string): Promise<GeocodingResult | null> {
  try {
    // Try with city only first (Open-Meteo works better this way)
    const response = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=5&language=en&format=json`
    );
    
    if (!response.ok) {
      throw new Error("Geocoding failed");
    }

    const data = await response.json();
    
    if (!data.results || data.results.length === 0) {
      return null;
    }

    // If country is provided, try to match it
    let result = data.results[0];
    if (country) {
      const countryUpper = country.toUpperCase();
      const matchingResult = data.results.find((r: { country_code?: string; country?: string }) => 
        r.country_code?.toUpperCase() === countryUpper || 
        r.country?.toUpperCase() === countryUpper ||
        r.country?.toUpperCase().includes(countryUpper)
      );
      if (matchingResult) {
        result = matchingResult;
      }
    }

    return {
      name: result.name,
      country: result.country,
      latitude: result.latitude,
      longitude: result.longitude,
    };
  } catch (error) {
    console.error("Geocoding error:", error);
    return null;
  }
}

export async function getWeather(lat: number, lon: number): Promise<{
  current: WeatherData;
  daily: DailyForecast[];
  hourly: HourlyForecast[];
  timezone: string;
} | null> {
  try {
    const response = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code,is_day&hourly=temperature_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,uv_index_max&timezone=auto&forecast_days=7`
    );

    if (!response.ok) {
      throw new Error("Weather API request failed");
    }

    const data: OpenMeteoResponse = await response.json();

    const current: WeatherData = {
      temperature: data.current.temperature_2m,
      feelsLike: data.current.apparent_temperature,
      humidity: data.current.relative_humidity_2m,
      windSpeed: data.current.wind_speed_10m,
      weatherCode: data.current.weather_code,
      description: getWeatherInfo(data.current.weather_code).description,
      isDay: data.current.is_day === 1,
      uvIndex: data.daily.uv_index_max?.[0] || 0,
    };

    const daily: DailyForecast[] = data.daily.time.map((date, index) => ({
      date,
      tempMax: data.daily.temperature_2m_max[index],
      tempMin: data.daily.temperature_2m_min[index],
      weatherCode: data.daily.weather_code[index],
      precipitationProbability: data.daily.precipitation_probability_max[index],
    }));

    const hourly: HourlyForecast[] = data.hourly.time.slice(0, 24).map((time, index) => ({
      time,
      temperature: data.hourly.temperature_2m[index],
      weatherCode: data.hourly.weather_code[index],
    }));

    return { current, daily, hourly, timezone: data.timezone };
  } catch (error) {
    console.error("Weather API error:", error);
    return null;
  }
}

export async function reverseGeocode(lat: number, lon: number): Promise<{ city: string; country: string } | null> {
  try {
    const nominatimResponse = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`,
      {
        headers: {
          "User-Agent": "FamilyFrame/1.0 (https://family-frame.replit.app)",
        },
      }
    );

    if (nominatimResponse.ok) {
      const data = await nominatimResponse.json();
      const city = data.address?.city || data.address?.town || data.address?.village || data.address?.suburb || data.address?.county || "Unknown";
      const country = data.address?.country_code?.toUpperCase() || data.address?.country || "Unknown";
      return { city, country };
    }

    return { city: "Unknown", country: "Unknown" };
  } catch (error) {
    console.error("Reverse geocoding error:", error);
    return { city: "Unknown", country: "Unknown" };
  }
}
