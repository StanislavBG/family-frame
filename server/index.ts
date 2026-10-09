import express, { type Request, Response, NextFunction } from "express";
import cookieParser from "cookie-parser";
import fs from "fs";
import path from "path";
import { registerRoutes } from "./routes";
import { registerAppVisibilityRoutes } from "./app-visibility";
import { serveStatic } from "./static";
import { createServer } from "http";
import { createClerkClient, verifyToken } from "@clerk/express";
import { createSessionHeaderMiddleware } from "./auth";
import { verifyApiToken, firebaseTokenStore } from "./api-tokens";
import { getUserData } from "./firebase";

// Use __dirname for CJS compatibility in production build
const currentDir = typeof __dirname !== 'undefined' 
  ? __dirname 
  : path.dirname(new URL(import.meta.url).pathname);

const app = express();
const httpServer = createServer(app);

// Health check endpoint - must be first for fast health checks
app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

const clerkClient = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY,
  publishableKey:
    process.env.VITE_CLERK_PUBLISHABLE_KEY ||
    process.env.PUBLISHABLE_KEY_PROD ||
    process.env.PUBLISHABLE_KEY_DEV ||
    "",
});

app.use(cookieParser());

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

app.use(
  createSessionHeaderMiddleware({
    verifyToken: (t) => verifyToken(t, { secretKey: process.env.CLERK_SECRET_KEY }),
    getUsername: async (id) => {
      const u = await clerkClient.users.getUser(id);
      return u.username || u.emailAddresses[0]?.emailAddress?.split("@")[0] || "user";
    },
    verifyApiToken: async (t) => {
      const v = await verifyApiToken(firebaseTokenStore, t);
      if (!v) return null;
      const data = await getUserData(v.userId);
      return { userId: v.userId, username: data?.username || "user", scopes: v.scopes };
    },
  }),
);

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      log(`${req.method} ${path} ${res.statusCode} in ${duration}ms`);
    }
  });

  next();
});

// Serve static HTML pages for SEO (privacy and terms only)
const staticPagesPath = path.resolve(currentDir, "static-pages");
app.get(["/privacy", "/terms"], (req, res, next) => {
  const fileName = req.path === "/privacy" ? "privacy.html" : "terms.html";
  const staticFilePath = path.resolve(staticPagesPath, fileName);
  if (fs.existsSync(staticFilePath)) {
    res.sendFile(staticFilePath);
    return;
  }
  next();
});

(async () => {
  registerAppVisibilityRoutes(app);
  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    if (res.headersSent) return;
    res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    },
  );
})();
