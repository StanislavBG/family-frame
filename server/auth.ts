import { Request, Response, NextFunction } from "express";

export interface AuthenticatedRequest extends Request {
  auth?: {
    userId: string;
    sessionId: string;
  };
  user?: {
    id: string;
    username: string;
    email?: string;
  };
}

export interface SessionHeaderDeps {
  verifyToken: (token: string) => Promise<{ sub?: string } | null>;
  getUsername: (userId: string) => Promise<string>;
  verifyApiToken: (
    token: string,
  ) => Promise<{ userId: string; username: string; scopes: string[] } | null>;
}

const USERNAME_CACHE_TTL_MS = 5 * 60 * 1000;

const PAT_BEARER_PREFIX = "Bearer ff_pat_";

function isPatPathAllowed(path: string): boolean {
  return (
    path.startsWith("/api/calendar/") ||
    path === "/api/people/list" ||
    path === "/mcp" ||
    path.startsWith("/mcp/")
  );
}

/**
 * Global middleware: strips client-supplied identity headers, then sets them
 * only from a verified Clerk session cookie or a verified personal access
 * token. Routes trust these headers, so they must never pass through from the
 * client. PAT requests are confined to the calendar/people APIs and /mcp.
 */
export function createSessionHeaderMiddleware(
  deps: SessionHeaderDeps,
  opts: { now?: () => number } = {},
) {
  const now = opts.now ?? Date.now;
  const usernameCache = new Map<string, { username: string; expiresAt: number }>();

  async function lookupUsername(userId: string): Promise<string> {
    const hit = usernameCache.get(userId);
    if (hit && hit.expiresAt > now()) return hit.username;
    const username = await deps.getUsername(userId);
    usernameCache.set(userId, { username, expiresAt: now() + USERNAME_CACHE_TTL_MS });
    return username;
  }

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    delete req.headers["x-clerk-user-id"];
    delete req.headers["x-clerk-username"];
    delete req.headers["x-ff-auth"];
    delete req.headers["x-ff-scopes"];

    const authorization = req.headers.authorization;
    if (typeof authorization === "string" && authorization.startsWith(PAT_BEARER_PREFIX)) {
      const token = authorization.slice("Bearer ".length).trim();
      let verified: Awaited<ReturnType<SessionHeaderDeps["verifyApiToken"]>> = null;
      try {
        verified = await deps.verifyApiToken(token);
      } catch {
        verified = null;
      }
      if (!verified) {
        res.status(401).json({ error: "Invalid API token" });
        return;
      }
      if (!isPatPathAllowed(req.path)) {
        res.status(403).json({ error: "API tokens cannot access this endpoint" });
        return;
      }
      if (
        req.path.startsWith("/api/calendar/") &&
        req.method !== "GET" &&
        !verified.scopes.includes("calendar:write")
      ) {
        res.status(403).json({ error: "API tokens cannot access this endpoint" });
        return;
      }
      req.headers["x-clerk-user-id"] = verified.userId;
      req.headers["x-clerk-username"] = verified.username;
      req.headers["x-ff-auth"] = "pat";
      req.headers["x-ff-scopes"] = verified.scopes.join(",");
      next();
      return;
    }

    if (!req.path.startsWith("/api")) {
      next();
      return;
    }

    try {
      const sessionToken = req.cookies?.__session || req.cookies?.__clerk_db_jwt;
      if (sessionToken) {
        const claims = await deps.verifyToken(sessionToken);
        if (claims && claims.sub) {
          const username = await lookupUsername(claims.sub);
          req.headers["x-clerk-user-id"] = claims.sub;
          req.headers["x-clerk-username"] = username;
          req.headers["x-ff-auth"] = "session";
        }
      }
    } catch {
      // Token verification failed - continue unauthenticated
    }
    next();
  };
}
