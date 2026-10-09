import type { Express, Request, Response } from "express";
import { getWeather, reverseGeocode, geocodeCity } from "../weather";

export function registerWeatherRoutes(app: Express): void {
  // Weather by coordinates in path (used by geolocation-based queries)
  app.get("/api/weather/coords/:lat/:lon", async (req: Request, res: Response) => {
    try {
      const lat = parseFloat(req.params.lat);
      const lon = parseFloat(req.params.lon);

      if (isNaN(lat) || isNaN(lon)) {
        res.status(400).json({ error: "Invalid coordinates" });
        return;
      }

      const [weatherData, location] = await Promise.all([
        getWeather(lat, lon),
        reverseGeocode(lat, lon),
      ]);

      if (!weatherData) {
        res.status(500).json({ error: "Failed to fetch weather data" });
        return;
      }

      res.json({
        ...weatherData,
        location: location || { city: "Unknown", country: "Unknown" },
      });
    } catch (error) {
      console.error("Weather API error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/weather/:city/:country", async (req: Request, res: Response) => {
    try {
      const { city, country } = req.params;

      const geoResult = await geocodeCity(city, country);
      if (!geoResult) {
        res.status(404).json({ error: "Location not found" });
        return;
      }

      const weatherData = await getWeather(geoResult.latitude, geoResult.longitude);
      if (!weatherData) {
        res.status(500).json({ error: "Failed to fetch weather data" });
        return;
      }

      res.json({
        ...weatherData,
        location: { city: geoResult.name, country: geoResult.country },
      });
    } catch (error) {
      console.error("Weather API error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
}
