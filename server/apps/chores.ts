import type { Express, Request, Response } from "express";
import { updateUserData } from "../firebase";
import { getOrCreateUser } from "../middleware";
import { saveChoresSchema } from "@shared/schema";

export function registerChoresRoutes(app: Express): void {
  // ===== CHORES ENDPOINTS =====

  // Get all chores for the user
  app.get("/api/chores", async (req: Request, res: Response) => {
    try {
      const userId = req.headers["x-clerk-user-id"] as string;
      const username = req.headers["x-clerk-username"] as string || "user";

      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const userData = await getOrCreateUser(userId, username);

      // Handle chores as either array or object
      let chores: any[] = [];
      if (Array.isArray((userData as any).chores)) {
        chores = (userData as any).chores;
      } else if ((userData as any).chores && typeof (userData as any).chores === 'object') {
        chores = Object.values((userData as any).chores);
      }

      // Filter out any invalid chores
      chores = chores.filter((c: any) => c && c.id);

      res.json(chores);
    } catch (error) {
      console.error("Get chores error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Save chores
  app.post("/api/chores", async (req: Request, res: Response) => {
    try {
      const userId = req.headers["x-clerk-user-id"] as string;
      const username = req.headers["x-clerk-username"] as string || "user";

      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const parsed = saveChoresSchema.safeParse(req.body?.chores);
      if (!parsed.success) {
        res.status(400).json({ error: "Invalid chores", details: parsed.error.errors });
        return;
      }
      await getOrCreateUser(userId, username);
      await updateUserData(userId, { chores: parsed.data });
      res.json({ success: true });
    } catch (error) {
      console.error("Save chores error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
}
