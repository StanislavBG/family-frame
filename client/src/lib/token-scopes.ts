export type TokenScope =
  | "calendar:read"
  | "calendar:write"
  | "mail:read"
  | "mail:write"
  | "data:read"
  | "data:write"
  | "media:read"
  | "media:write"
  | "metrics:read"
  | "metrics:write";

export type AccessLevel = "none" | "read" | "write";

export interface TokenAccess {
  calendarWrite: boolean;
  mail: AccessLevel;
  data: AccessLevel;
  media: AccessLevel;
  metrics: AccessLevel;
}

type LeveledResource = "mail" | "data" | "media" | "metrics";
const LEVELED_RESOURCES: LeveledResource[] = ["mail", "data", "media", "metrics"];

/** Build the scope list for an access selection. calendar:read is always granted; write implies read. */
export function scopesFromAccess(access: TokenAccess): TokenScope[] {
  const scopes: TokenScope[] = ["calendar:read"];
  if (access.calendarWrite) scopes.push("calendar:write");
  for (const resource of LEVELED_RESOURCES) {
    const level = access[resource];
    if (level !== "none") scopes.push(`${resource}:read` as TokenScope);
    if (level === "write") scopes.push(`${resource}:write` as TokenScope);
  }
  return scopes;
}

/** Derive the access selection from a token's scopes: a write scope means write, else a read scope means read. */
export function accessFromScopes(scopes: readonly string[]): TokenAccess {
  const level = (resource: LeveledResource): AccessLevel => {
    if (scopes.includes(`${resource}:write`)) return "write";
    if (scopes.includes(`${resource}:read`)) return "read";
    return "none";
  };
  return {
    calendarWrite: scopes.includes("calendar:write"),
    mail: level("mail"),
    data: level("data"),
    media: level("media"),
    metrics: level("metrics"),
  };
}
