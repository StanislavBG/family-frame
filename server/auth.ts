import type { Request, Response, NextFunction } from "express";

export interface ClerkIdentityDeps {
  verifyToken: (token: string) => Promise<{ sub?: string }>;
  getUser: (
    id: string,
  ) => Promise<{ username?: string | null; emailAddresses: { emailAddress: string }[] }>;
}

/**
 * Global middleware: strips client-supplied identity headers, then sets them
 * only from a verified Clerk session cookie. Routes trust these headers, so
 * they must never pass through from the client.
 */
export function createClerkIdentityMiddleware(deps: ClerkIdentityDeps) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    delete req.headers["x-clerk-user-id"];
    delete req.headers["x-clerk-username"];

    try {
      const sessionToken = req.cookies?.__session || req.cookies?.__clerk_db_jwt;
      if (sessionToken) {
        const claims = await deps.verifyToken(sessionToken);
        if (claims && claims.sub) {
          const u = await deps.getUser(claims.sub);
          req.headers["x-clerk-user-id"] = claims.sub;
          req.headers["x-clerk-username"] =
            u.username || u.emailAddresses[0]?.emailAddress?.split("@")[0] || "user";
        }
      }
    } catch {
      // Token verification failed - continue unauthenticated
    }
    next();
  };
}
