import type { Express, Request, Response } from "express";
import { updateUserData } from "../firebase";
import { getOrCreateUser } from "../middleware";
import { saveRecipesSchema } from "@shared/schema";

export function registerRecipesRoutes(app: Express): void {
  // ===== RECIPES ENDPOINTS =====

  // Get all recipes for the user
  app.get("/api/recipes", async (req: Request, res: Response) => {
    try {
      const userId = req.headers["x-clerk-user-id"] as string;
      const username = req.headers["x-clerk-username"] as string || "user";

      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const userData = await getOrCreateUser(userId, username);

      // Handle recipes as either array or object
      let recipes: any[] = [];
      if (Array.isArray((userData as any).recipes)) {
        recipes = (userData as any).recipes;
      } else if ((userData as any).recipes && typeof (userData as any).recipes === 'object') {
        recipes = Object.values((userData as any).recipes);
      }

      // Filter out any invalid recipes
      recipes = recipes.filter((r: any) => r && r.id);

      res.json(recipes);
    } catch (error) {
      console.error("Get recipes error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Save recipes
  app.post("/api/recipes", async (req: Request, res: Response) => {
    try {
      const userId = req.headers["x-clerk-user-id"] as string;
      const username = req.headers["x-clerk-username"] as string || "user";

      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const parsed = saveRecipesSchema.safeParse(req.body?.recipes);
      if (!parsed.success) {
        res.status(400).json({ error: "Invalid recipes", details: parsed.error.errors });
        return;
      }
      await getOrCreateUser(userId, username);
      await updateUserData(userId, { recipes: parsed.data });
      res.json({ success: true });
    } catch (error) {
      console.error("Save recipes error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
}
