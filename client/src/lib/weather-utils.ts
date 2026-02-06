// Re-export weather code descriptions from shared module (single source of truth)
export { weatherCodeDescriptions, getWeatherInfo } from "@shared/weather-codes";

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
