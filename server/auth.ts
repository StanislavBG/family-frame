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
  /** Verifies an `ff_svc_` service token; defaults to rejecting everything. */
  verifyServiceToken?: (token: string) => boolean;
}

const USERNAME_CACHE_TTL_MS = 5 * 60 * 1000;

const PAT_BEARER_PREFIX = "Bearer ff_pat_";
const SERVICE_BEARER_PREFIX = "Bearer ff_svc_";

// Express routing is case-insensitive, so compare lowercased paths.
function isServicePath(path: string): boolean {
  const p = path.toLowerCase();
  return p === "/api/service" || p.startsWith("/api/service/");
}

function isServiceTokenPathAllowed(path: string): boolean {
  return path.toLowerCase().startsWith("/api/service/events/");
}

function isPatPathAllowed(path: string): boolean {
  return (
    path.startsWith("/api/calendar/") ||
    path.startsWith("/api/mail/") ||
    path.startsWith("/api/data/") ||
    path === "/api/files" ||
    path.startsWith("/api/files/") ||
    path === "/api/people/list" ||
    path === "/mcp" ||
    path.startsWith("/mcp/")
  );
}

const PAT_SCOPED_AREAS: ReadonlyArray<{
  prefix: string;
  readScope: string | null;
  writeScope: string;
}> = [
  { prefix: "/api/calendar/", readScope: null, writeScope: "calendar:write" },
  { prefix: "/api/mail/", readScope: "mail:read", writeScope: "mail:write" },
  { prefix: "/api/data/", readScope: "data:read", writeScope: "data:write" },
  { prefix: "/api/files/", readScope: "media:read", writeScope: "media:write" },
];

/**
 * Scope check for a PAT request on an already-allowlisted path. Paths with no
 * scoped area (/api/people/list, /mcp) pass; reads need the read or write
 * scope (null read scope = implicit); every other method needs the write scope.
 */
export function patScopeAllows(path: string, method: string, scopes: string[]): boolean {
  const area = PAT_SCOPED_AREAS.find((a) => path === a.prefix.slice(0, -1) || path.startsWith(a.prefix),
  );
  if (!area) return true;
  if (method === "GET" || method === "HEAD") {
    return (
      area.readScope === null ||
      scopes.includes(area.readScope) ||
      scopes.includes(area.writeScope)
    );
  }
  return scopes.includes(area.writeScope);
}

/**
 * Global middleware: strips client-supplied identity headers, then sets them
 * only from a verified Clerk session cookie or a verified personal access
 * token. Routes trust these headers, so they must never pass through from the
 * client. PAT requests are confined to the calendar/people APIs and /mcp.
 * A verified service token (ff_svc_, no user identity) sets only
 * x-ff-auth=service and is confined to /api/service/events/; every other kind
 * of request gets 403 on any /api/service path.
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
    if (typeof authorization === "string" && authorization.startsWith(SERVICE_BEARER_PREFIX)) {
      const token = authorization.slice("Bearer ".length).trim();
      let valid = false;
      try {
        valid = deps.verifyServiceToken?.(token) === true;
      } catch {
        valid = false;
      }
      if (!valid) {
        res.status(401).json({ error: "Invalid service token" });
        return;
      }
      if (!isServiceTokenPathAllowed(req.path)) {
        res.status(403).json({ error: "Service tokens cannot access this endpoint" });
        return;
      }
      req.headers["x-ff-auth"] = "service";
      next();
      return;
    }

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
      if (!patScopeAllows(req.path, req.method, verified.scopes)) {
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

    // Only a verified service token (handled above) may reach service routes.
    if (isServicePath(req.path)) {
      res.status(403).json({ error: "Service endpoint" });
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
