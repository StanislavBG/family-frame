import express, { type Request, Response, NextFunction } from "express";
import cookieParser from "cookie-parser";
import fs from "fs";
import path from "path";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { clerkClient } from "@clerk/clerk-sdk-node";

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

app.use(cookieParser());

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

app.use(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sessionToken = req.cookies?.__session || req.cookies?.__clerk_db_jwt;
    
    if (sessionToken) {
      try {
        const claims = await clerkClient.verifyToken(sessionToken);
        if (claims && claims.sub) {
          req.headers["x-clerk-user-id"] = claims.sub;
          
          const user = await clerkClient.users.getUser(claims.sub);
          req.headers["x-clerk-username"] = user.username || user.emailAddresses[0]?.emailAddress?.split("@")[0] || "user";
        }
      } catch {
        // Token verification failed - continue without auth
      }
    }
  } catch (error) {
    console.error("Auth middleware error:", error);
  }
  next();
});

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
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
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
  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
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
