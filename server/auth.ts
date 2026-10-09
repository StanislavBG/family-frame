import { Request, Response, NextFunction } from "express";
import { clerkClient } from "@clerk/clerk-sdk-node";

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
}

/**
 * Global middleware: strips client-supplied identity headers, then sets them
 * only from a verified Clerk session cookie. Routes trust these headers, so
 * they must never pass through from the client.
 */
export function createSessionHeaderMiddleware(deps: SessionHeaderDeps) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    delete req.headers["x-clerk-user-id"];
    delete req.headers["x-clerk-username"];

    try {
      const sessionToken = req.cookies?.__session || req.cookies?.__clerk_db_jwt;
      if (sessionToken) {
        const claims = await deps.verifyToken(sessionToken);
        if (claims && claims.sub) {
          const username = await deps.getUsername(claims.sub);
          req.headers["x-clerk-user-id"] = claims.sub;
          req.headers["x-clerk-username"] = username;
        }
      }
    } catch {
      // Token verification failed - continue unauthenticated
    }
    next();
  };
}

export async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const sessionToken = req.cookies?.__session || req.headers.authorization?.replace("Bearer ", "");
    
    if (!sessionToken) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    try {
      const session = await clerkClient.sessions.verifySession(sessionToken, sessionToken);
      
      if (!session || !session.userId) {
        res.status(401).json({ error: "Invalid session" });
        return;
      }

      const user = await clerkClient.users.getUser(session.userId);
      
      req.auth = {
        userId: session.userId,
        sessionId: session.id,
      };
      
      req.user = {
        id: session.userId,
        username: user.username || user.emailAddresses[0]?.emailAddress?.split("@")[0] || "user",
        email: user.emailAddresses[0]?.emailAddress,
      };

      next();
    } catch (verifyError) {
      res.status(401).json({ error: "Session verification failed" });
      return;
    }
  } catch (error) {
    console.error("Auth error:", error);
    res.status(500).json({ error: "Authentication error" });
  }
}

export function optionalAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const sessionToken = req.cookies?.__session || req.headers.authorization?.replace("Bearer ", "");
  
  if (!sessionToken) {
    next();
    return;
  }

  requireAuth(req, res, next);
}
