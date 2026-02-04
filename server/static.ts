import express, { type Express } from "express";
import fs from "fs";
import path from "path";

// Use __dirname for CJS compatibility in production build
const currentDir = typeof __dirname !== 'undefined' 
  ? __dirname 
  : path.dirname(new URL(import.meta.url).pathname);

export function serveStatic(app: Express) {
  const distPath = path.resolve(currentDir, "public");
  
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  // Note: Static pages for /, /privacy, /terms are served by middleware in index.ts
  // This ensures Google's OAuth verifier sees proper content

  app.use(express.static(distPath));

  // fall through to index.html if the file doesn't exist
  app.use("*", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
