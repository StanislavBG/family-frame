import type { Express, Request, Response } from "express";
import { asyncHandler } from "./middleware";
import { timeSeriesService, TimeSeriesError, type TimeSeriesService } from "./time-series-service";

type MetricsHandler = (req: Request, res: Response, userId: string) => Promise<void>;

// Auth header check + TimeSeriesError mapping; unexpected errors fall through to asyncHandler (500).
function metricsHandler(fn: MetricsHandler) {
  return asyncHandler(async (req, res) => {
    const userId = req.headers["x-clerk-user-id"] as string;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    try {
      await fn(req, res, userId);
    } catch (error) {
      if (error instanceof TimeSeriesError) {
        res.status(error.status).json({ error: error.message });
        return;
      }
      throw error;
    }
  });
}

function queryNumber(value: unknown): number | undefined {
  return typeof value === "string" && value !== "" ? Number(value) : undefined;
}

function queryString(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

export function registerMetricsRoutes(app: Express, service: TimeSeriesService = timeSeriesService): void {
  app.get("/api/metrics/tags", metricsHandler(async (_req, res, userId) => {
    res.json(await service.listTags(userId));
  }));

  app.get("/api/metrics/series", metricsHandler(async (req, res, userId) => {
    res.json(await service.listSeries(userId, { tag: queryString(req.query.tag) }));
  }));

  app.put("/api/metrics/series/:seriesId", metricsHandler(async (req, res, userId) => {
    res.json(await service.putSeries(userId, req.params.seriesId, req.body));
  }));

  app.get("/api/metrics/series/:seriesId", metricsHandler(async (req, res, userId) => {
    res.json(await service.getSeries(userId, req.params.seriesId));
  }));

  app.delete("/api/metrics/series/:seriesId", metricsHandler(async (req, res, userId) => {
    await service.deleteSeries(userId, req.params.seriesId);
    res.status(204).end();
  }));

  app.post("/api/metrics/series/:seriesId/points", metricsHandler(async (req, res, userId) => {
    res.json(await service.putPoints(userId, req.params.seriesId, req.body));
  }));

  app.get("/api/metrics/series/:seriesId/points", metricsHandler(async (req, res, userId) => {
    res.json(await service.listPoints(userId, req.params.seriesId, {
      from: queryString(req.query.from),
      to: queryString(req.query.to),
      limit: queryNumber(req.query.limit),
    }));
  }));

  app.delete("/api/metrics/series/:seriesId/points", metricsHandler(async (req, res, userId) => {
    await service.deletePoint(userId, req.params.seriesId, queryString(req.query.t) as string);
    res.status(204).end();
  }));
}
