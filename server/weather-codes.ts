export const weatherCodeDescriptions: Record<number, { description: string; icon: string }> = {
  0: { description: "Clear sky", icon: "sun" },
  1: { description: "Mainly clear", icon: "sun" },
  2: { description: "Partly cloudy", icon: "cloud-sun" },
  3: { description: "Overcast", icon: "cloud" },
  45: { description: "Foggy", icon: "cloud-fog" },
  48: { description: "Depositing rime fog", icon: "cloud-fog" },
  51: { description: "Light drizzle", icon: "cloud-drizzle" },
  53: { description: "Moderate drizzle", icon: "cloud-drizzle" },
  55: { description: "Dense drizzle", icon: "cloud-drizzle" },
  56: { description: "Freezing drizzle", icon: "snowflake" },
  57: { description: "Dense freezing drizzle", icon: "snowflake" },
  61: { description: "Slight rain", icon: "cloud-rain" },
  63: { description: "Moderate rain", icon: "cloud-rain" },
  65: { description: "Heavy rain", icon: "cloud-rain" },
  66: { description: "Freezing rain", icon: "snowflake" },
  67: { description: "Heavy freezing rain", icon: "snowflake" },
  71: { description: "Slight snow", icon: "snowflake" },
  73: { description: "Moderate snow", icon: "snowflake" },
  75: { description: "Heavy snow", icon: "snowflake" },
  77: { description: "Snow grains", icon: "snowflake" },
  80: { description: "Slight rain showers", icon: "cloud-rain" },
  81: { description: "Moderate rain showers", icon: "cloud-rain" },
  82: { description: "Violent rain showers", icon: "cloud-rain" },
  85: { description: "Slight snow showers", icon: "snowflake" },
  86: { description: "Heavy snow showers", icon: "snowflake" },
  95: { description: "Thunderstorm", icon: "cloud-lightning" },
  96: { description: "Thunderstorm with hail", icon: "cloud-lightning" },
  99: { description: "Thunderstorm with heavy hail", icon: "cloud-lightning" },
};

export function getWeatherInfo(code: number): { description: string; icon: string } {
  return weatherCodeDescriptions[code] || { description: "Unknown", icon: "cloud" };
}
