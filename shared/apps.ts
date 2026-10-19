// Framework-level registry of Family Frame apps. Pure data + helpers, no React,
// and no imports from schema.ts (schema.ts derives its app list from here).

export const APP_IDS = [
  "home",
  "settings",
  "clock",
  "weather",
  "photos",
  "calendar",
  "events",
  "people",
  "chores",
  "recipes",
  "notepad",
  "messages",
  "radio",
  "baby-songs",
  "tv",
  "shopping",
  "stocks",
  "utilities",
  "screensaver",
] as const;

export type AppId = typeof APP_IDS[number];

export type AppCategory = "everyday" | "family" | "media" | "money";

export const APP_CATEGORIES: readonly { id: AppCategory; title: string }[] = [
  { id: "everyday", title: "Everyday" },
  { id: "family", title: "Family & home" },
  { id: "media", title: "Listen & watch" },
  { id: "money", title: "Money & bills" },
];

export type AppNeed = "location" | "people" | "connections" | "agent" | "address";

export const APP_NEED_COPY: Record<AppNeed, { label: string; howTo: string; href: string }> = {
  location: { label: "Your home's city", howTo: "Set the city and country of this home.", href: "/settings?section=location" },
  people: { label: "The people in your home", howTo: "Add each member of the household.", href: "/settings?section=people" },
  connections: { label: "A connected home", howTo: "Connect with another family's home to send messages.", href: "/settings?section=connections" },
  agent: { label: "An agent that sends data", howTo: "Create an access key for your agent so it can send your data.", href: "/settings?section=agents" },
  address: { label: "Your street address and permission", howTo: "Open the app and follow its first step to share your address for local suggestions.", href: "/events" },
};

export interface AppNeedFacts {
  hasLocation: boolean;
  peopleCount: number;
  connectionCount: number;
  tokenCount: number;
}

// "in-app" = the app checks this need itself, so Settings cannot tell.
export function appNeedStatus(need: AppNeed, facts: AppNeedFacts | null): "done" | "todo" | "in-app" {
  if (need === "address") return "in-app";
  if (!facts) return "todo";
  switch (need) {
    case "location": return facts.hasLocation ? "done" : "todo";
    case "people": return facts.peopleCount > 0 ? "done" : "todo";
    case "connections": return facts.connectionCount > 0 ? "done" : "todo";
    case "agent": return facts.tokenCount > 0 ? "done" : "todo";
  }
}

export interface AppManifest {
  id: AppId;
  category: AppCategory;
  needs: AppNeed[];
  title: string;
  url: string;
  fixed?: boolean;
  nested?: boolean;
  defaultEnabled: boolean;
  summary: string;
  description: string;
  features: string[];
}

// Order is identical to the historical defaultAppList so legacy menus don't reorder.
export const APP_MANIFESTS: readonly AppManifest[] = [
  {
    id: "home",
    category: "everyday",
    needs: [],
    title: "Home",
    url: "/",
    fixed: true,
    defaultEnabled: true,
    summary: "Your dashboard: tiles for your apps and the homes you're connected to.",
    description: "Home is your starting point. It shows a tile for each app you use and the homes you are connected to, so you can see what is going on at a glance.",
    features: ["Tiles for the apps you turn on", "Connected homes with their local time and weather", "Unread message count"],
  },
  {
    id: "settings",
    category: "everyday",
    needs: [],
    title: "Global Config",
    url: "/settings",
    fixed: true,
    defaultEnabled: true,
    summary: "Household name, location, people, connections and which apps you use.",
    description: "Global Config is where you set up your household. Come back here any time to change your details or choose which apps you want.",
    features: ["Set your home name and location", "Add family members and birthdays", "Connect with other households", "Choose and order your apps"],
  },
  {
    id: "clock",
    category: "everyday",
    needs: [],
    title: "Clock",
    url: "/clock",
    defaultEnabled: true,
    summary: "A big, easy-to-read clock.",
    description: "A large clock that is easy to read from across the room. Pick the face and time format that suit you best.",
    features: ["Analog or digital face", "12-hour or 24-hour time", "Full screen for wall-mounted displays"],
  },
  {
    id: "weather",
    category: "everyday",
    needs: ["location"],
    title: "Weather",
    url: "/weather",
    defaultEnabled: true,
    summary: "Current conditions and the forecast for your home.",
    description: "See what the weather is like at home right now and what is coming in the next few days.",
    features: ["Live conditions and multi-day forecast", "Celsius or Fahrenheit", "Dense or light display", "Weather tile on the Home screen"],
  },
  {
    id: "photos",
    category: "everyday",
    needs: [],
    title: "Picture Frame",
    url: "/photos",
    defaultEnabled: false,
    summary: "Turns the screen into a digital photo frame.",
    description: "Show your favourite pictures as a slideshow, just like a photo frame on the wall. Choose your own photos or enjoy ambient pictures.",
    features: ["Your Google Photos or ambient Pixabay pictures", "Adjustable slideshow speed", "Full-screen slideshow"],
  },
  {
    id: "calendar",
    category: "everyday",
    needs: [],
    title: "Calendar",
    url: "/calendar",
    nested: true,
    defaultEnabled: false,
    summary: "Shared family calendar with birthday tracking.",
    description: "One calendar for the whole household, so everyone knows what is coming up. Birthdays are never forgotten.",
    features: ["Events everyone in the home can see", "Birthdays of household members appear automatically", "Upcoming events on the Home screen"],
  },
  {
    id: "events",
    category: "family",
    needs: ["location", "address"],
    title: "Events",
    url: "/events",
    nested: true,
    defaultEnabled: false,
    summary: "Local events picked for your household.",
    description: "Find things to do near home that suit your family. Add the ones you like to your calendar, and tell it what you enjoy so the suggestions get better over time.",
    features: ["Local events picked for your household", "Add the ones you like to your calendar", "Tell it what you like so suggestions improve"],
  },
  {
    id: "people",
    category: "family",
    needs: ["people"],
    title: "People",
    url: "/people",
    nested: true,
    defaultEnabled: false,
    summary: "A private view for each member of this household.",
    description: "Pick a person in your household and see their own calendar, inbox, photos and daily sheets in one place. Only members of this household can see it.",
    features: ["Per-person calendar and inbox", "Photos and daily sheets for each person", "Private to members of this household"],
  },
  {
    id: "chores",
    category: "family",
    needs: [],
    title: "Chores",
    url: "/chores",
    defaultEnabled: false,
    summary: "Share household chores and tick them off.",
    description: "Keep track of who needs to do what around the house. Tick a chore off when it is done.",
    features: ["Shared chore list", "Due dates", "Tick off when done"],
  },
  {
    id: "recipes",
    category: "family",
    needs: [],
    title: "Recipes",
    url: "/recipes",
    defaultEnabled: false,
    summary: "Keep family recipes in one shared place.",
    description: "Collect the recipes your family loves in one place. Open one in cooking view and follow along step by step.",
    features: ["Save and share recipes", "Step-by-step cooking view with timers"],
  },
  {
    id: "notepad",
    category: "family",
    needs: [],
    title: "Notepad",
    url: "/notepad",
    defaultEnabled: false,
    summary: "Shared notes for the household.",
    description: "A simple place to jot things down so nothing gets forgotten. Notes can be shared with the homes you are connected to.",
    features: ["Write and keep notes", "Share notes with connected homes"],
  },
  {
    id: "messages",
    category: "family",
    needs: ["connections"],
    title: "Messages",
    url: "/messages",
    defaultEnabled: false,
    summary: "Send messages between your home and connected homes.",
    description: "Stay in touch with the family. Send a note to a connected home and see new messages as soon as they arrive.",
    features: ["Messages with connected households", "Unread count in the menu and on Home"],
  },
  {
    id: "radio",
    category: "media",
    needs: [],
    title: "BG Radio",
    url: "/radio",
    defaultEnabled: false,
    summary: "Stream Bulgarian radio stations.",
    description: "Listen to your favourite Bulgarian radio stations live. The music keeps going while you look at other things.",
    features: ["Browse and play live stations", "Shows what's playing now", "Keeps playing while you use other apps"],
  },
  {
    id: "baby-songs",
    category: "media",
    needs: [],
    title: "Baby Songs",
    url: "/baby-songs",
    defaultEnabled: false,
    summary: "Nursery rhymes and songs for children 0-6.",
    description: "Gentle songs and nursery rhymes chosen for your little one's age. You can also add your own playlists.",
    features: ["Songs picked for your child's age", "Your own YouTube playlists", "Favorites and shuffle"],
  },
  {
    id: "tv",
    category: "media",
    needs: [],
    title: "World TV",
    url: "/tv",
    defaultEnabled: false,
    summary: "Watch live TV channels.",
    description: "Watch live television from around the world. The app remembers the last channel you watched.",
    features: ["Live channels by country", "Remembers your last channel", "Default volume setting"],
  },
  {
    id: "shopping",
    category: "family",
    needs: [],
    title: "Shopping",
    url: "/shopping",
    defaultEnabled: false,
    summary: "A shared shopping list.",
    description: "One shopping list for the whole home. Anyone can add what is needed and tick it off at the shop.",
    features: ["Add items anyone in the home can see", "Tick items off as you shop"],
  },
  {
    id: "stocks",
    category: "money",
    needs: [],
    title: "Stocks",
    url: "/stocks",
    defaultEnabled: false,
    summary: "Follow the markets at a glance.",
    description: "Keep an eye on the markets you care about without any fuss. Choose which ones to show.",
    features: ["Dow Jones, S&P 500, Bitcoin, Gold and more", "Pick which markets to track", "Ticker on the Home screen"],
  },
  {
    id: "utilities",
    category: "money",
    needs: ["agent"],
    title: "Utilities",
    url: "/utilities",
    nested: true,
    defaultEnabled: false,
    summary: "Household bills and usage over time.",
    description: "See your electricity, gas, water, internet and other bills in one place. Your agent publishes them, tagged \"utilities\", and each one gets its own tile.",
    features: ["Average month and month-by-month chart", "What to pay or check, and what pays itself", "A page for every bill"],
  },
  {
    id: "screensaver",
    category: "everyday",
    needs: [],
    title: "Screensaver",
    url: "/screensaver",
    defaultEnabled: false,
    summary: "An ambient full-screen display for mounted screens.",
    description: "Turn a mounted screen into a calm ambient display. Touch the screen at any time to go back Home.",
    features: ["Shows photos, the clock or the weather", "Or cycles between them", "Tap anywhere to return Home"],
  },
];

const MANIFEST_BY_ID = new Map<string, AppManifest>(APP_MANIFESTS.map((a) => [a.id, a]));

export function getAppManifest(id: AppId): AppManifest {
  const manifest = MANIFEST_BY_ID.get(id);
  if (!manifest) throw new Error(`Unknown app id: ${id}`);
  return manifest;
}

const FIXED_IDS: AppId[] = APP_MANIFESTS.filter((a) => a.fixed).map((a) => a.id);
const MOVABLE_IDS: AppId[] = APP_MANIFESTS.filter((a) => !a.fixed).map((a) => a.id);

export const DEFAULT_VISIBLE_APP_IDS: AppId[] = APP_MANIFESTS.filter((a) => a.defaultEnabled).map((a) => a.id);

// Seeds NEW users only: default-ON apps first, then the rest. Not the manifest order.
export const DEFAULT_APP_ORDER: AppId[] = [
  "clock", "weather", "calendar", "messages", "photos", "people",
  "radio", "baby-songs", "tv", "stocks", "chores", "recipes", "notepad", "shopping", "screensaver",
];

export type StarterPackId = "kitchen" | "grandparents" | "organiser" | "frame";

// "What is this screen for?" choices on the welcome screen.
export const STARTER_PACKS: readonly { id: StarterPackId; title: string; description: string; appIds: AppId[] }[] = [
  {
    id: "kitchen",
    title: "Kitchen wall screen",
    description: "The time, weather, family calendar, photos and the shopping list.",
    appIds: ["clock", "weather", "calendar", "photos", "shopping", "screensaver"],
  },
  {
    id: "grandparents",
    title: "A screen for grandparents",
    description: "A big clock, the weather, family photos and messages from the family.",
    appIds: ["clock", "weather", "photos", "messages", "screensaver"],
  },
  {
    id: "organiser",
    title: "Family organiser",
    description: "Calendar, chores, shopping, recipes, notes and a page for each person.",
    appIds: ["calendar", "chores", "shopping", "recipes", "notepad", "people"],
  },
  {
    id: "frame",
    title: "Just a picture frame",
    description: "Photos and a clock, nothing else.",
    appIds: ["photos", "clock", "screensaver"],
  },
];

// "add" keeps the current apps (all apps when visibleApps is unset); "replace" starts from the fixed apps.
export function applyStarterPack(
  visibleApps: readonly string[] | null | undefined,
  packId: string,
  mode: "add" | "replace",
): AppId[] | null {
  const pack = STARTER_PACKS.find((p) => p.id === packId);
  if (!pack) return null;
  const next = new Set<string>(mode === "add" ? (visibleApps ?? APP_IDS) : []);
  for (const id of pack.appIds) next.add(id);
  for (const f of FIXED_IDS) next.add(f);
  return APP_IDS.filter((id) => next.has(id));
}

export type AppVisibilitySettings =
  | { visibleApps?: readonly string[] | null; appOrder?: readonly string[] | null }
  | null
  | undefined;

function isMovableId(id: string): id is AppId {
  const m = MANIFEST_BY_ID.get(id);
  return !!m && !m.fixed;
}

export function normalizeAppOrder(order?: readonly string[] | null): AppId[] {
  const result: AppId[] = [];
  const seen = new Set<string>();
  for (const id of order ?? []) {
    if (isMovableId(id) && !seen.has(id)) {
      seen.add(id);
      result.push(id);
    }
  }
  for (const id of MOVABLE_IDS) {
    if (!seen.has(id)) result.push(id);
  }
  return result;
}

export function resolveAppLayout(s: AppVisibilitySettings): {
  fixed: AppManifest[];
  movable: { app: AppManifest; enabled: boolean }[];
  menu: AppManifest[];
  order: AppId[];
  enabledIds: AppId[];
} {
  const order = normalizeAppOrder(s?.appOrder);
  const visible = s?.visibleApps ?? null;
  const visibleSet = visible ? new Set<string>(visible) : null;
  const fixed = APP_MANIFESTS.filter((a) => a.fixed);
  const movable = order.map((id) => ({
    app: getAppManifest(id),
    enabled: visibleSet ? visibleSet.has(id) : true,
  }));
  const menu = [...fixed, ...movable.filter((m) => m.enabled).map((m) => m.app)];
  const enabledIdSet = new Set<AppId>(menu.map((a) => a.id));
  const enabledIds = APP_IDS.filter((id) => enabledIdSet.has(id));
  return { fixed, movable, menu, order, enabledIds };
}

export function isAppEnabled(s: AppVisibilitySettings, id: AppId): boolean {
  return resolveAppLayout(s).enabledIds.includes(id);
}

export function setAppEnabled(
  visibleApps: readonly string[] | null | undefined,
  id: AppId,
  enabled: boolean,
): AppId[] {
  const next = new Set<string>(visibleApps ?? APP_IDS);
  if (MANIFEST_BY_ID.has(id) && !MANIFEST_BY_ID.get(id)!.fixed) {
    if (enabled) next.add(id);
    else next.delete(id);
  }
  // Fixed ids always stay: Firebase drops empty arrays, which would read back as "all apps on".
  for (const f of FIXED_IDS) next.add(f);
  return APP_IDS.filter((a) => next.has(a));
}

export function moveAppInOrder(
  order: readonly string[] | null | undefined,
  id: AppId,
  direction: "up" | "down",
): AppId[] {
  const result = normalizeAppOrder(order);
  const i = result.indexOf(id);
  if (i === -1) return result;
  const j = direction === "up" ? i - 1 : i + 1;
  if (j < 0 || j >= result.length) return result;
  [result[i], result[j]] = [result[j], result[i]];
  return result;
}
