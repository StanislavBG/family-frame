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
