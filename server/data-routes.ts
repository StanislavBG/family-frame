import type { Express, Request, Response } from "express";
import { asyncHandler } from "./middleware";
import { datasetService, DatasetError, type DatasetService } from "./dataset-service";

type DataHandler = (req: Request, res: Response, userId: string) => Promise<void>;

// Auth header check + DatasetError mapping; unexpected errors fall through to asyncHandler (500).
function dataHandler(fn: DataHandler) {
  return asyncHandler(async (req, res) => {
    const userId = req.headers["x-clerk-user-id"] as string;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    try {
      await fn(req, res, userId);
    } catch (error) {
      if (error instanceof DatasetError) {
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

export function registerDataRoutes(app: Express, service: DatasetService = datasetService): void {
  app.get("/api/data/schemas", dataHandler(async (_req, res, userId) => {
    res.json(await service.listSchemas(userId));
  }));

  app.put("/api/data/schemas/:schemaId", dataHandler(async (req, res, userId) => {
    res.json(await service.putSchema(userId, req.params.schemaId, req.body));
  }));

  app.get("/api/data/schemas/:schemaId", dataHandler(async (req, res, userId) => {
    res.json(await service.getSchema(userId, req.params.schemaId));
  }));

  app.delete("/api/data/schemas/:schemaId", dataHandler(async (req, res, userId) => {
    await service.deleteSchema(userId, req.params.schemaId);
    res.status(204).end();
  }));

  app.post("/api/data/records/:schemaId", dataHandler(async (req, res, userId) => {
    res.json(await service.putRecords(userId, req.params.schemaId, req.body));
  }));

  app.get("/api/data/records/:schemaId", dataHandler(async (req, res, userId) => {
    res.json(await service.listRecords(userId, req.params.schemaId, {
      emailId: queryString(req.query.emailId),
      personId: queryString(req.query.personId),
      limit: queryNumber(req.query.limit),
      offset: queryNumber(req.query.offset),
    }));
  }));

  app.get("/api/data/records/:schemaId/:recordId", dataHandler(async (req, res, userId) => {
    res.json(await service.getRecord(userId, req.params.schemaId, req.params.recordId));
  }));

  app.delete("/api/data/records/:schemaId/:recordId", dataHandler(async (req, res, userId) => {
    await service.deleteRecord(userId, req.params.schemaId, req.params.recordId);
    res.status(204).end();
  }));
}
