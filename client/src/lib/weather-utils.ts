// Re-export weather code descriptions from shared module (single source of truth)
import { weatherCodeDescriptions, getWeatherInfo } from "@shared/weather-codes";
export { weatherCodeDescriptions, getWeatherInfo };

function celsiusToFahrenheit(celsius: number): number {
  return Math.round((celsius * 9) / 5 + 32);
}

export function formatTemperature(temp: number, unit: "celsius" | "fahrenheit"): string {
  if (unit === "fahrenheit") {
    return `${celsiusToFahrenheit(temp)}°F`;
  }
  return `${Math.round(temp)}°C`;
}

export function formatDay(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleDateString([], { weekday: "short" });
}

// --- Outdoor advisory logic ---

export type OutdoorRating = "yes" | "maybe" | "no";

export interface OutdoorAdvice {
  rating: OutdoorRating;
  headline: string;
  reasons: string[];
}

// WMO weather codes that indicate precipitation
const RAIN_CODES = new Set([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82]);
const SNOW_CODES = new Set([71, 73, 75, 77, 85, 86]);
const STORM_CODES = new Set([95, 96, 99]);
const FOG_CODES = new Set([45, 48]);

function isPrecipCode(code: number): boolean {
  return RAIN_CODES.has(code) || SNOW_CODES.has(code) || STORM_CODES.has(code);
}

/**
 * "Can I Go Out?" advisory based on current conditions and forecast.
 */
export function getOutdoorAdvice(
  weatherCode: number,
  temperature: number,
  windSpeed: number,
  precipProbability: number,
): OutdoorAdvice {
  const reasons: string[] = [];
  let rating: OutdoorRating = "yes";

  // Storms → definite no
  if (STORM_CODES.has(weatherCode)) {
    return { rating: "no", headline: "Stay inside", reasons: ["Thunderstorm activity"] };
  }

  // Heavy rain/snow → no
  if ([65, 67, 82, 75, 86].includes(weatherCode)) {
    return { rating: "no", headline: "Stay inside", reasons: [getWeatherInfo(weatherCode).description] };
  }

  // Moderate/light precipitation → maybe
  if (RAIN_CODES.has(weatherCode) || SNOW_CODES.has(weatherCode)) {
    rating = "maybe";
    reasons.push(getWeatherInfo(weatherCode).description);
  }

  // Fog → maybe
  if (FOG_CODES.has(weatherCode)) {
    rating = "maybe";
    reasons.push("Low visibility - foggy conditions");
  }

  // High wind
  if (windSpeed > 50) {
    rating = "no";
    reasons.push(`Strong wind (${Math.round(windSpeed)} km/h)`);
  } else if (windSpeed > 35) {
    if (rating === "yes") rating = "maybe";
    reasons.push(`Gusty wind (${Math.round(windSpeed)} km/h)`);
  }

  // Temperature extremes
  if (temperature < -10) {
    if (rating === "yes") rating = "maybe";
    reasons.push("Very cold conditions");
  } else if (temperature > 38) {
    if (rating === "yes") rating = "maybe";
    reasons.push("Extreme heat");
  }

  // High precipitation probability upcoming
  if (precipProbability > 70 && rating === "yes") {
    rating = "maybe";
    reasons.push(`${precipProbability}% chance of rain`);
  }

  if (rating === "yes") {
    return { rating: "yes", headline: "Great to go out!", reasons: ["Conditions look good"] };
  }
  return { rating, headline: rating === "maybe" ? "Use caution" : "Stay inside", reasons };
}

export type TrailCondition = "dry" | "damp" | "wet";

export interface TrailAdvice {
  condition: TrailCondition;
  headline: string;
  detail: string;
}

/**
 * "Are the trails wet?" advisory.
 * Checks recent precipitation (past 24h hourly data) and today's forecast.
 */
export function getTrailAdvice(
  hourlyData: Array<{ time: string; weatherCode: number; precipitation?: number }>,
  todayPrecipSum: number,
  todayPrecipProbability: number,
): TrailAdvice {
  const now = new Date();
  const past24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  // Sum precipitation in the past 24 hours
  let recentPrecipMm = 0;
  let recentRainHours = 0;
  for (const h of hourlyData) {
    const t = new Date(h.time);
    if (t >= past24h && t <= now) {
      if (h.precipitation && h.precipitation > 0) {
        recentPrecipMm += h.precipitation;
      }
      if (isPrecipCode(h.weatherCode)) {
        recentRainHours++;
      }
    }
  }

  // Heavy recent rain → wet
  if (recentPrecipMm > 5 || recentRainHours >= 4) {
    return {
      condition: "wet",
      headline: "Stick to paved paths",
      detail: `${recentPrecipMm.toFixed(1)}mm rain in the past 24h`,
    };
  }

  // Light recent rain or high probability today → damp
  if (recentPrecipMm > 0.5 || todayPrecipSum > 2 || todayPrecipProbability > 60) {
    return {
      condition: "damp",
      headline: "Trails may be muddy",
      detail: recentPrecipMm > 0
        ? `Light rain recently (${recentPrecipMm.toFixed(1)}mm)`
        : `${todayPrecipProbability}% rain chance today`,
    };
  }

  return {
    condition: "dry",
    headline: "Trails should be dry",
    detail: "No recent rain - enjoy the hike!",
  };
}
