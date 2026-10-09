import type { Express, Request, Response } from "express";
import { updateUserData } from "../firebase";
import { getOrCreateUser } from "../middleware";
import { saveShoppingListSchema } from "@shared/schema";

export function registerShoppingRoutes(app: Express): void {
  // ===== SHOPPING LIST ENDPOINTS =====

  // Get shopping list
  app.get("/api/shopping", async (req: Request, res: Response) => {
    try {
      const userId = req.headers["x-clerk-user-id"] as string;
      const username = req.headers["x-clerk-username"] as string || "user";

      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const userData = await getOrCreateUser(userId, username);
      const shoppingList = (userData as any).shoppingList || { items: [] };
      res.json(shoppingList);
    } catch (error) {
      console.error("Get shopping list error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Save shopping list
  app.post("/api/shopping", async (req: Request, res: Response) => {
    try {
      const userId = req.headers["x-clerk-user-id"] as string;
      const username = req.headers["x-clerk-username"] as string || "user";

      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const parsed = saveShoppingListSchema.safeParse(req.body?.items);
      if (!parsed.success) {
        res.status(400).json({ error: "Invalid shopping list", details: parsed.error.errors });
        return;
      }
      await getOrCreateUser(userId, username);
      await updateUserData(userId, { shoppingList: { items: parsed.data } });
      res.json({ success: true });
    } catch (error) {
      console.error("Save shopping list error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
}
