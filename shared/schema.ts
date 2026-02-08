import { z } from "zod";

// Event type enum
export const EventType = {
  SHARED: "Shared",
  PRIVATE: "Private",
} as const;

export type EventTypeValue = (typeof EventType)[keyof typeof EventType];

// Location schema
export const locationSchema = z.object({
  city: z.string(),
  country: z.string(),
});

export type Location = z.infer<typeof locationSchema>;

// Person schema (household members)
export const personSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  birthday: z.string().optional(),
  location: locationSchema.optional(),
});

export const insertPersonSchema = personSchema.omit({ id: true });

export type Person = z.infer<typeof personSchema>;
export type InsertPerson = z.infer<typeof insertPersonSchema>;

// Calendar event schema
export const calendarEventSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  startDate: z.string(),
  endDate: z.string(),
  type: z.enum([EventType.SHARED, EventType.PRIVATE]),
  people: z.array(z.string()).default([]), // Array of person IDs
  creatorId: z.string().optional(), // Clerk user ID of creator
  creatorName: z.string().optional(), // Display name of creator household
});

export const insertCalendarEventSchema = calendarEventSchema.omit({ id: true, creatorId: true, creatorName: true });

export type CalendarEvent = z.infer<typeof calendarEventSchema>;
export type InsertCalendarEvent = z.infer<typeof insertCalendarEventSchema>;

// Photo source type
export const PhotoSource = {
  GOOGLE_PHOTOS: "google_photos",
  PIXABAY: "pixabay",
} as const;

export type PhotoSourceValue = (typeof PhotoSource)[keyof typeof PhotoSource];

// Google Photos Picker session schema
export const pickerSessionSchema = z.object({
  id: z.string(),
  pickerUri: z.string().optional(),
  mediaItemsSet: z.boolean().default(false),
  createdAt: z.number(),
});

export type PickerSession = z.infer<typeof pickerSessionSchema>;

// Stored photo metadata (for persistent selection across sessions)
export const storedPhotoSchema = z.object({
  id: z.string(),
  filename: z.string(),
  mimeType: z.string(),
  creationTime: z.string().optional(),
  addedAt: z.number(), // When this photo was added to the collection
});

export type StoredPhoto = z.infer<typeof storedPhotoSchema>;

// Radio station schema (leaf node)
export const radioStationSchema = z.object({
  name: z.string(),
  url: z.string(),
});

export type RadioStation = z.infer<typeof radioStationSchema>;

// Radio tree node - can be a category (folder) or a station (leaf)
export interface RadioTreeNode {
  id: string;
  name: string;
  url?: string; // Only present for leaf nodes (stations)
  children?: RadioTreeNode[]; // Only present for category nodes
}

// Helper to check if a node is a playable station
export function isRadioStation(node: RadioTreeNode): boolean {
  return !!node.url && !node.children;
}

// Default radio tree - Bulgarian radios (using StreamTheWorld AAC streams - most reliable)
// StreamTheWorld provides CDN-backed streams with good browser compatibility
export const defaultRadioTree: RadioTreeNode = {
  id: "root",
  name: "Bulgarian Radios",
  children: [
    // BG Radio - #1 Bulgarian music radio
    { id: "bg-radio", name: "BG Radio", url: "https://playerservices.streamtheworld.com/api/livestream-redirect/BG_RADIOAAC_H.aac" },
    // Radio Veronika - Pop/Folk hits
    { id: "radio-veronika", name: "Radio Veronika", url: "https://playerservices.streamtheworld.com/api/livestream-redirect/RADIO_VERONIKAAAC_L.aac" },
    // Radio Energy - Hit music
    { id: "radio-energy", name: "Radio Energy", url: "https://playerservices.streamtheworld.com/api/livestream-redirect/RADIO_ENERGYAAC_H.aac" },
    // Radio FM+ - News and talk
    { id: "radio-fmplus", name: "Radio FM+", url: "https://playerservices.streamtheworld.com/api/livestream-redirect/RADIO_FMPLUSAAC_L.aac" },
    // Darik Radio - News
    { id: "darik-radio", name: "Darik Radio", url: "https://playerservices.streamtheworld.com/api/livestream-redirect/DARIK_RADIOAAC_H.aac" },
    // N-Joy Radio - Young hits
    { id: "njoy-radio", name: "N-Joy Radio", url: "https://playerservices.streamtheworld.com/api/livestream-redirect/N_JOY_RADIOAAC_H.aac" },
    // Classic FM Radio - Classical music
    { id: "classic-fm", name: "Classic FM", url: "https://playerservices.streamtheworld.com/api/livestream-redirect/CLASSIC_FMAAC_H.aac" },
    // Jazz FM Radio - Jazz
    { id: "jazz-fm", name: "Jazz FM", url: "https://playerservices.streamtheworld.com/api/livestream-redirect/JAZZ_FMAAC_H.aac" },
    // The Voice Radio - Pop hits
    { id: "the-voice-radio", name: "The Voice Radio", url: "https://playerservices.streamtheworld.com/api/livestream-redirect/THE_VOICE_RADIOAAC_H.aac" },
    // Star FM Radio - Rock/Pop
    { id: "star-fm", name: "Star FM", url: "https://playerservices.streamtheworld.com/api/livestream-redirect/STAR_FM_RADIOAAC_H.aac" },
  ],
};

// Flatten tree to get all stations (for backward compatibility)
export function flattenRadioTree(node: RadioTreeNode): RadioStation[] {
  const stations: RadioStation[] = [];
  
  if (node.url) {
    stations.push({ name: node.name, url: node.url });
  }
  
  if (node.children) {
    for (const child of node.children) {
      stations.push(...flattenRadioTree(child));
    }
  }
  
  return stations;
}

// Default radio stations (flattened for backward compatibility)
export const defaultRadioStations: RadioStation[] = flattenRadioTree(defaultRadioTree);

// Available stocks for tracking
export const availableStocks = [
  { symbol: "DJI", name: "Dow Jones", yahooSymbol: "^DJI" },
  { symbol: "SPX", name: "S&P 500", yahooSymbol: "^GSPC" },
  { symbol: "VNQ", name: "Real Estate", yahooSymbol: "VNQ" },
  { symbol: "BTC", name: "Bitcoin", isCrypto: true },
  { symbol: "GOLD", name: "Gold", yahooSymbol: "GC=F" },
  { symbol: "MSFT", name: "Microsoft", yahooSymbol: "MSFT" },
  { symbol: "CRM", name: "Salesforce", yahooSymbol: "CRM" },
  { symbol: "ISRG", name: "Intuitive Surgical", yahooSymbol: "ISRG" },
] as const;

export type StockSymbol = typeof availableStocks[number]["symbol"];

// App item interface for app picker
export interface AppItem {
  id: string;
  title: string;
  url: string;
  fixed?: boolean;
}

// Default app list for app picker (id must match url path)
export const defaultAppList: AppItem[] = [
  { id: "home", title: "Home", url: "/", fixed: true },
  { id: "settings", title: "Global Config", url: "/settings", fixed: true },
  { id: "clock", title: "Clock", url: "/clock" },
  { id: "weather", title: "Weather", url: "/weather" },
  { id: "photos", title: "Picture Frame", url: "/photos" },
  { id: "calendar", title: "Calendar", url: "/calendar" },
  { id: "chores", title: "Chores", url: "/chores" },
  { id: "recipes", title: "Recipes", url: "/recipes" },
  { id: "notepad", title: "Notepad", url: "/notepad" },
  { id: "messages", title: "Messages", url: "/messages" },
  { id: "radio", title: "BG Radio", url: "/radio" },
  { id: "baby-songs", title: "Baby Songs", url: "/baby-songs" },
  { id: "tv", title: "World TV", url: "/tv" },
  { id: "shopping", title: "Shopping", url: "/shopping" },
  { id: "stocks", title: "Stocks", url: "/stocks" },
  { id: "screensaver", title: "Screensaver", url: "/screensaver" },
];

export type AppId = string;

// Custom YouTube Playlist schema - user-defined playlists (moved here for reference in userSettingsSchema)
export const customPlaylistSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  iconHint: z.string().default("music"),
  colorTheme: z.string().default("#E91E63"),
  videoIds: z.array(z.string()), // YouTube video IDs
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type CustomPlaylist = z.infer<typeof customPlaylistSchema>;

// User settings schema
export const userSettingsSchema = z.object({
  homeName: z.string().optional(),
  location: locationSchema.optional(),
  temperatureUnit: z.enum(["celsius", "fahrenheit"]).default("celsius"),
  timeFormat: z.enum(["12h", "24h"]).default("24h"), // 24h is military time (default)
  clockStyle: z.enum(["analog", "digital"]).default("analog"), // Clock display style
  googlePhotosConnected: z.boolean().default(false),
  selectedAlbums: z.array(z.string()).default([]), // Legacy - kept for compatibility
  pickerSessionId: z.string().optional(), // Current picker session ID
  selectedPhotos: z.array(storedPhotoSchema).default([]), // Persistent photo collection
  photoSource: z.enum([PhotoSource.GOOGLE_PHOTOS, PhotoSource.PIXABAY]).default(PhotoSource.PIXABAY),
  photoInterval: z.number().min(5).max(60).default(10),
  radioEnabled: z.boolean().default(false),
  radioVolume: z.number().min(0).max(100).default(50),
  radioStation: z.string().default("https://playerservices.streamtheworld.com/api/livestream-redirect/BG_RADIOAAC_H.aac"),
  trackedStocks: z.array(z.string()).default(["DJI", "SPX", "VNQ", "BTC", "GOLD"]), // Default market trackers
  // App picker settings
  visibleApps: z.array(z.string()).optional(), // If undefined, all apps visible
  appOrder: z.array(z.string()).optional(), // Custom app order (excludes fixed apps)
  // Baby Radio settings
  babyAgeMonths: z.number().min(0).max(72).default(12), // Baby age in months (0-72 = 0-6 years)
  // Custom playlists for Baby Songs (user-defined YouTube playlists)
  customPlaylists: z.array(customPlaylistSchema).default([]),
  // TV settings
  tvVolume: z.number().min(0).max(100).default(50),
  lastTvChannel: z.string().optional(), // URL of last played channel
  // Ambient/Screensaver settings
  screensaverEnabled: z.boolean().default(true),
  screensaverDelay: z.number().min(1).max(60).default(5), // Minutes of inactivity
  screensaverMode: z.enum(["photos", "clock", "weather", "cycle"]).default("cycle"),
  // Schedule/Sleep mode settings
  sleepModeEnabled: z.boolean().default(false),
  sleepStartTime: z.string().default("22:00"), // 24h format
  sleepEndTime: z.string().default("07:00"),
  sleepDimLevel: z.number().min(10).max(50).default(20), // Percentage brightness
  // Calendar settings
  weekStartsMonday: z.boolean().default(true),
  // Weather display mode
  weatherDisplayMode: z.enum(["dense", "light"]).default("dense"),
  // Weather alerts
  weatherAlertsEnabled: z.boolean().default(true),
  // Dashboard settings
  dashboardLayout: z.enum(["default", "minimal", "detailed"]).default("default"),
  // Baby Songs settings
  babySongsFavorites: z.array(z.string()).default([]), // Track IDs or YouTube video IDs
  babySongsShuffleEnabled: z.boolean().default(false),
});

export type UserSettings = z.infer<typeof userSettingsSchema>;

// TV Channel schema
export interface TVChannel {
  name: string;
  url: string;
  logo?: string;
  group?: string;
}

// Verified Bulgarian TV channels (expanded list with 22 channels)
export const TV_CHANNELS: TVChannel[] = [
  // Music Channels
  { name: "The Voice TV", url: "https://bss1.neterra.tv/thevoice/thevoice.m3u8", group: "Music", logo: "https://i.imgur.com/OoJSmoj.png" },
  { name: "Magic TV", url: "https://bss1.neterra.tv/magictv/magictv.m3u8", group: "Music", logo: "https://i.imgur.com/n7bcrrp.png" },
  { name: "Tiankov Folk", url: "https://streamer103.neterra.tv/tiankov-folk/live.m3u8", group: "Music", logo: "https://i.imgur.com/VKY4q64.png" },
  { name: "Tiankov Orient Folk", url: "https://streamer103.neterra.tv/tiankov-orient/live.m3u8", group: "Music", logo: "https://i.postimg.cc/KYNvL1ML/tiankovorientfolk.png" },
  { name: "City TV", url: "https://tv.city.bg/play/tshls/citytv/index.m3u8", group: "Music", logo: "https://i.imgur.com/qJvMbNH.png" },
  // Entertainment & Culture
  { name: "This is Bulgaria HD", url: "https://streamer103.neterra.tv/thisisbulgaria/live.m3u8", group: "Entertainment", logo: "https://i.imgur.com/062jkXw.png" },
  { name: "Travel TV", url: "https://streamer103.neterra.tv/travel/live.m3u8", group: "Travel", logo: "https://i.imgur.com/5xllfed.png" },
  { name: "TV1", url: "https://tv1.cloudcdn.bg/tv1/livestream.m3u8", group: "Entertainment", logo: "https://i.imgur.com/LVHK1mW.png" },
  { name: "Evrokom", url: "https://live.ecomservice.bg/hls/stream.m3u8", group: "Entertainment", logo: "https://i.imgur.com/8JvT9Yw.png" },
  // News & Information
  { name: "Bulgaria ON AIR", url: "https://edge1.cdn.bg:2006/fls/bonair.stream/playlist.m3u8", group: "News", logo: "https://i.imgur.com/YFZYJFN.png" },
  { name: "Kanal 0", url: "https://old.rn-tv.com/k0/stream.m3u8", group: "News", logo: "https://i.imgur.com/0kqJhHz.png" },
  // Regional
  { name: "TV Zagora", url: "http://zagoratv.ddns.net:8080/tvzagora.m3u8", group: "Regional", logo: "https://i.imgur.com/JxLHvfM.png" },
  { name: "DSTV", url: "http://46.249.95.140:8081/hls/data.m3u8", group: "Regional", logo: "https://i.imgur.com/bHWJZcY.png" },
  // Religious & Educational
  { name: "Hope Channel Bulgaria", url: "https://hc1.hopetv.bg/live/hopetv_all.smil/playlist.m3u8", group: "Religious", logo: "https://i.imgur.com/wvJ5PeX.png" },
  { name: "Plovdivska Pravoslavna TV", url: "http://78.130.149.196:1935/live/pptv.stream/playlist.m3u8", group: "Religious", logo: "https://i.imgur.com/TCqMqpM.png" },
  { name: "Light Channel", url: "https://streamer1.streamhost.org/salive/GMIlcbgM/playlist.m3u8", group: "Religious", logo: "https://i.imgur.com/pQlBXJc.png" },
  // International (Bulgarian)
  { name: "BNT 4 (World)", url: "https://viamotionhsi.netplus.ch/live/eds/bntworld/browser-HLS8/bntworld.m3u8", group: "International", logo: "https://i.imgur.com/LkXLDfm.png" },
  // Specialty
  { name: "Agro TV", url: "https://restr2.bgtv.bg/agro/hls/agro.m3u8", group: "Specialty", logo: "https://i.imgur.com/HVKjGjz.png" },
  { name: "100% Auto Moto TV", url: "http://100automoto.tv:1935/bgtv1/autotv/playlist.m3u8", group: "Specialty", logo: "https://i.imgur.com/GfDvKHv.png" },
  { name: "MM TV", url: "https://streamer103.neterra.tv/mmtv/mmtv.smil/playlist.m3u8", group: "Entertainment", logo: "https://i.imgur.com/QjYmVJf.png" },
  { name: "RMTV", url: "https://transcoder1.bitcare.eu/streaming/rimextv/rmtv.m3u8", group: "Entertainment", logo: "https://i.imgur.com/yqKKMnf.png" },
  { name: "Wness TV", url: "https://wness103.neterra.tv/wness/wness.smil/playlist.m3u8", group: "Lifestyle", logo: "https://i.imgur.com/kF5JNXN.png" },
];

// Connection status enum
export const ConnectionStatus = {
  PENDING: "pending",
  ACCEPTED: "accepted",
  REJECTED: "rejected",
} as const;

// Connection request schema
export const connectionRequestSchema = z.object({
  id: z.string(),
  fromUserId: z.string(),
  fromUsername: z.string(),
  toUserId: z.string(),
  toUsername: z.string(),
  status: z.enum([ConnectionStatus.PENDING, ConnectionStatus.ACCEPTED, ConnectionStatus.REJECTED]),
  createdAt: z.string(),
  respondedAt: z.string().optional(),
});

export type ConnectionRequest = z.infer<typeof connectionRequestSchema>;

// Connected user schema (for accepted connections only)
export const connectedUserSchema = z.object({
  id: z.string(),
  username: z.string(),
  homeName: z.string().optional(),
  location: locationSchema.optional(),
  connectedAt: z.string(),
});

export type ConnectedUser = z.infer<typeof connectedUserSchema>;

// Weather data schema (from Open-Meteo)
export const weatherDataSchema = z.object({
  temperature: z.number(),
  feelsLike: z.number(),
  humidity: z.number(),
  windSpeed: z.number(),
  uvIndex: z.number(),
  weatherCode: z.number(),
  description: z.string(),
  isDay: z.boolean(),
});

export const dailyForecastSchema = z.object({
  date: z.string(),
  tempMax: z.number(),
  tempMin: z.number(),
  weatherCode: z.number(),
  precipitationProbability: z.number(),
  precipitationSum: z.number().optional(),
  sunrise: z.string().optional(),
  sunset: z.string().optional(),
});

export const hourlyForecastSchema = z.object({
  time: z.string(),
  temperature: z.number(),
  weatherCode: z.number(),
  precipitationProbability: z.number().optional(),
  precipitation: z.number().optional(),
});

export type WeatherData = z.infer<typeof weatherDataSchema>;
export type DailyForecast = z.infer<typeof dailyForecastSchema>;
export type HourlyForecast = z.infer<typeof hourlyForecastSchema>;

// Notepad note schema
export const noteSchema = z.object({
  id: z.string(),
  title: z.string().default("Untitled Note"),
  content: z.string().default(""),
  createdAt: z.string(),
  updatedAt: z.string(),
  isPinned: z.boolean().default(false),
  isShared: z.boolean().default(false),
  authorId: z.string().optional(),
  authorName: z.string().optional(),
  mentions: z.array(z.string()).default([]), // Array of user IDs to notify
});

export const insertNoteSchema = noteSchema.omit({ id: true, createdAt: true, updatedAt: true, authorId: true, authorName: true });

export type Note = z.infer<typeof noteSchema>;
export type InsertNote = z.infer<typeof insertNoteSchema>;

// Chore schema (for family task management)
export const choreSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  assignedTo: z.string().optional(), // Person name or ID
  dueDate: z.string().optional(),
  recurring: z.enum(["none", "daily", "weekly", "monthly"]).default("none"),
  completed: z.boolean().default(false),
  completedAt: z.string().optional(),
  completedBy: z.string().optional(),
  createdAt: z.string(),
  priority: z.enum(["low", "medium", "high"]).default("medium"),
  category: z.string().optional(), // e.g., "cleaning", "kitchen", "yard"
});

export const insertChoreSchema = choreSchema.omit({ id: true, createdAt: true, completedAt: true, completedBy: true });

export type Chore = z.infer<typeof choreSchema>;
export type InsertChore = z.infer<typeof insertChoreSchema>;

// Recipe schema (for cooking mode)
export const recipeIngredientSchema = z.object({
  name: z.string(),
  amount: z.string(),
  unit: z.string().optional(),
});

export const recipeStepSchema = z.object({
  order: z.number(),
  instruction: z.string(),
  duration: z.number().optional(), // Minutes
  timerLabel: z.string().optional(),
});

export const recipeSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  imageUrl: z.string().optional(),
  servings: z.number().default(4),
  prepTime: z.number().optional(), // Minutes
  cookTime: z.number().optional(), // Minutes
  ingredients: z.array(recipeIngredientSchema).default([]),
  steps: z.array(recipeStepSchema).default([]),
  tags: z.array(z.string()).default([]),
  isFavorite: z.boolean().default(false),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const insertRecipeSchema = recipeSchema.omit({ id: true, createdAt: true, updatedAt: true });

export type RecipeIngredient = z.infer<typeof recipeIngredientSchema>;
export type RecipeStep = z.infer<typeof recipeStepSchema>;
export type Recipe = z.infer<typeof recipeSchema>;
export type InsertRecipe = z.infer<typeof insertRecipeSchema>;

// Message schema (for household messaging)
export const messageSchema = z.object({
  id: z.string(),
  fromUserId: z.string(),
  fromUsername: z.string(),
  toUserId: z.string(),
  toUsername: z.string(),
  content: z.string().min(1),
  createdAt: z.string(),
  isRead: z.boolean().default(false),
  linkedNoteId: z.string().optional(),
  linkedEventId: z.string().optional(),
});

export const insertMessageSchema = messageSchema.omit({ id: true, createdAt: true, isRead: true, fromUserId: true, fromUsername: true });

export type Message = z.infer<typeof messageSchema>;
export type InsertMessage = z.infer<typeof insertMessageSchema>;

// Full user data schema (stored in Firebase)
export const userDataSchema = z.object({
  clerkId: z.string(),
  username: z.string(),
  settings: userSettingsSchema.default({}),
  people: z.array(personSchema).default([]),
  events: z.array(calendarEventSchema).default([]),
  connections: z.array(z.string()).default([]), // Array of ACCEPTED connected user IDs
  connectionRequests: z.array(connectionRequestSchema).default([]), // Pending/handled requests
  googleTokens: z.object({
    accessToken: z.string(),
    refreshToken: z.string(),
    expiresAt: z.number(),
  }).optional(),
  notes: z.array(noteSchema).default([]),
  messages: z.array(messageSchema).default([]), // Inbox messages
});

export type UserData = z.infer<typeof userDataSchema>;

// Google Photos album schema
export const googlePhotoAlbumSchema = z.object({
  id: z.string(),
  title: z.string(),
  coverPhotoUrl: z.string().optional(),
  mediaItemsCount: z.number().optional(),
});

export type GooglePhotoAlbum = z.infer<typeof googlePhotoAlbumSchema>;

// Google Photos media item schema
export const googlePhotoItemSchema = z.object({
  id: z.string(),
  baseUrl: z.string(),
  filename: z.string(),
  mimeType: z.string(),
  creationTime: z.string().optional(),
  fetchedAt: z.number(), // Timestamp when baseUrl was fetched (expires after 60 min)
});

export type GooglePhotoItem = z.infer<typeof googlePhotoItemSchema>;

// Pixabay photo item schema
export const pixabayPhotoSchema = z.object({
  id: z.number(),
  webformatURL: z.string(),
  largeImageURL: z.string(),
  fullHDURL: z.string().optional(),
  imageWidth: z.number(),
  imageHeight: z.number(),
  tags: z.string(),
  user: z.string(),
});

export type PixabayPhoto = z.infer<typeof pixabayPhotoSchema>;

// API response schemas
export const apiResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    success: z.boolean(),
    data: dataSchema.optional(),
    error: z.string().optional(),
  });

// Legacy user schema for compatibility
export const users = {
  id: "varchar",
  username: "text",
  password: "text",
};

export type User = {
  id: string;
  username: string;
  password: string;
};

export type InsertUser = Omit<User, "id">;

// Baby Radio Age Groups
export const BabyAgeGroup = {
  NEWBORN: "newborn",     // 0-6 months
  INFANT: "infant",       // 6-12 months
  TODDLER: "toddler",     // 12-24 months
  PRESCHOOL: "preschool", // 24-48 months (2-4 years)
  KIDS: "kids",           // 48-72 months (4-6 years)
} as const;

export type BabyAgeGroupValue = (typeof BabyAgeGroup)[keyof typeof BabyAgeGroup];

export const BABY_AGE_RANGES = [
  { id: BabyAgeGroup.NEWBORN, label: "Newborn", description: "0-6 months", minMonths: 0, maxMonths: 6, defaultAge: 3 },
  { id: BabyAgeGroup.INFANT, label: "Infant", description: "6-12 months", minMonths: 6, maxMonths: 12, defaultAge: 9 },
  { id: BabyAgeGroup.TODDLER, label: "Toddler", description: "1-2 years", minMonths: 12, maxMonths: 24, defaultAge: 18 },
  { id: BabyAgeGroup.PRESCHOOL, label: "Preschool", description: "2-4 years", minMonths: 24, maxMonths: 48, defaultAge: 36 },
  { id: BabyAgeGroup.KIDS, label: "Kids", description: "4-6 years", minMonths: 48, maxMonths: 72, defaultAge: 60 },
] as const;

// Get age group from months
export function getAgeGroupFromMonths(months: number): BabyAgeGroupValue {
  if (months < 6) return BabyAgeGroup.NEWBORN;
  if (months < 12) return BabyAgeGroup.INFANT;
  if (months < 24) return BabyAgeGroup.TODDLER;
  if (months < 48) return BabyAgeGroup.PRESCHOOL;
  return BabyAgeGroup.KIDS;
}

// Baby Radio Content Types
export const ContentType = {
  NURSERY_RHYME: "nursery_rhyme",
  LULLABY: "lullaby",
  CLASSICAL: "classical",
  NATURE_SOUNDS: "nature_sounds",
  WHITE_NOISE: "white_noise",
  STORY: "story",
  EDUCATIONAL: "educational",
  ACTION_SONG: "action_song",
  ANIMAL_SOUNDS: "animal_sounds",
} as const;

export type ContentTypeValue = (typeof ContentType)[keyof typeof ContentType];

export const CONTENT_TYPE_LABELS: Record<ContentTypeValue, string> = {
  [ContentType.NURSERY_RHYME]: "Nursery Rhymes",
  [ContentType.LULLABY]: "Lullabies",
  [ContentType.CLASSICAL]: "Classical Music",
  [ContentType.NATURE_SOUNDS]: "Nature Sounds",
  [ContentType.WHITE_NOISE]: "White Noise",
  [ContentType.STORY]: "Stories",
  [ContentType.EDUCATIONAL]: "Educational",
  [ContentType.ACTION_SONG]: "Action Songs",
  [ContentType.ANIMAL_SOUNDS]: "Animal Sounds",
};

// Baby Radio Situations (multi-tag support) - Expanded for more occasions
export const Situation = {
  MORNING: "morning",
  PLAYTIME: "playtime",
  QUIET: "quiet",
  MEALTIME: "mealtime",
  BEDTIME: "bedtime",
  ANYTIME: "anytime",
  // New occasions
  BATHTIME: "bathtime",
  CARRIDE: "carride",
  LEARNING: "learning",
  NAPTIME: "naptime",
  OUTDOOR: "outdoor",
  CELEBRATION: "celebration",
} as const;

export type SituationValue = (typeof Situation)[keyof typeof Situation];

export const SITUATION_LABELS: Record<SituationValue, string> = {
  [Situation.MORNING]: "Morning Wake-Up",
  [Situation.PLAYTIME]: "Active Play",
  [Situation.QUIET]: "Quiet Time",
  [Situation.MEALTIME]: "Mealtime",
  [Situation.BEDTIME]: "Bedtime",
  [Situation.ANYTIME]: "Anytime",
  [Situation.BATHTIME]: "Bath Time",
  [Situation.CARRIDE]: "Car Ride",
  [Situation.LEARNING]: "Learning Time",
  [Situation.NAPTIME]: "Nap Time",
  [Situation.OUTDOOR]: "Outdoor Play",
  [Situation.CELEBRATION]: "Party & Celebration",
};

// Baby Radio Track schema with multi-tag support
export const babyRadioTrackSchema = z.object({
  id: z.string(),
  title: z.string(),
  url: z.string(),
  contentType: z.string(), // ContentTypeValue
  situations: z.array(z.string()), // Array of SituationValue
  minAgeMonths: z.number().default(0),
  maxAgeMonths: z.number().default(72),
  duration: z.number().optional(), // Duration in seconds (if known)
  source: z.string().optional(), // Attribution source
});

export type BabyRadioTrack = z.infer<typeof babyRadioTrackSchema>;

// Baby Radio Station (dynamically pulls from track library)
export const babyRadioStationSchema = z.object({
  id: z.string(),
  name: z.string(),
  iconHint: z.string(),
  colorTheme: z.string(),
  situation: z.string(), // Primary situation this station serves
  description: z.string().optional(),
});

export type BabyRadioStation = z.infer<typeof babyRadioStationSchema>;

// Baby Radio Stations - Archive.org library (ad-free, offline-capable)
// All stations available - UI shows track count and disables empty ones for current age
export const BABY_RADIO_STATIONS: BabyRadioStation[] = [
  // Core stations with reliable content
  { id: "morning", name: "Sunshine Wake-Up", iconHint: "sun", colorTheme: "#FFEB3B", situation: Situation.MORNING, description: "Cheerful songs to start the day" },
  { id: "playtime", name: "Active Play & Dance", iconHint: "bee", colorTheme: "#FF9800", situation: Situation.PLAYTIME, description: "Energetic music for movement" },
  { id: "quiet", name: "Quiet Time", iconHint: "leaf", colorTheme: "#4CAF50", situation: Situation.QUIET, description: "Calming music for focus" },
  { id: "mealtime", name: "Mealtime Music", iconHint: "utensils", colorTheme: "#8BC34A", situation: Situation.MEALTIME, description: "Pleasant background for meals" },
  { id: "bedtime", name: "Bedtime Lullabies", iconHint: "moon", colorTheme: "#3F51B5", situation: Situation.BEDTIME, description: "Soothing sounds for sleep" },
  // Extended occasions
  { id: "learning", name: "ABC & 123", iconHint: "book", colorTheme: "#E91E63", situation: Situation.LEARNING, description: "Educational songs" },
  { id: "carride", name: "Road Trip Tunes", iconHint: "car", colorTheme: "#9C27B0", situation: Situation.CARRIDE, description: "Songs for car journeys" },
  { id: "bathtime", name: "Splish Splash", iconHint: "droplet", colorTheme: "#00BCD4", situation: Situation.BATHTIME, description: "Fun bath time tunes" },
  { id: "naptime", name: "Dreamy Naps", iconHint: "cloud", colorTheme: "#607D8B", situation: Situation.NAPTIME, description: "Gentle nap time music" },
  { id: "outdoor", name: "Nature Explorer", iconHint: "tree", colorTheme: "#795548", situation: Situation.OUTDOOR, description: "Outdoor adventure songs" },
  { id: "celebration", name: "Party Time", iconHint: "party", colorTheme: "#F44336", situation: Situation.CELEBRATION, description: "Celebration & party music" },
];

// YouTube-based track for mood stations
export interface YouTubeTrack {
  id: string;
  title: string;
  videoId: string; // YouTube video ID
  thumbnail?: string;
  duration?: number;
}

// Legacy alias for backward compatibility
export type KpopdhTrack = YouTubeTrack;

// Mood station types
export const MoodStationType = {
  YOUTUBE: "youtube",
  CUSTOM: "custom",
} as const;

export type MoodStationTypeValue = (typeof MoodStationType)[keyof typeof MoodStationType];

// Mood station schema - supports both built-in and custom playlists
export const moodStationSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  iconHint: z.string(),
  colorTheme: z.string(),
  type: z.enum([MoodStationType.YOUTUBE, MoodStationType.CUSTOM]),
  videoIds: z.array(z.string()), // YouTube video IDs
  isBuiltIn: z.boolean().default(false),
});

export type MoodStation = z.infer<typeof moodStationSchema>;

// KPOPDH Mood Station - Built-in YouTube playlist with curated children's songs
// These are popular kids' music videos that work well for family entertainment
export const KPOPDH_PLAYLIST: YouTubeTrack[] = [
  { id: "kpop1", title: "Baby Shark Dance", videoId: "XqZsoesa55w" },
  { id: "kpop2", title: "Wheels on the Bus", videoId: "e_04ZrNroTo" },
  { id: "kpop3", title: "Johny Johny Yes Papa", videoId: "F4tHL8reNCs" },
  { id: "kpop4", title: "Five Little Ducks", videoId: "pZw9veQ76fo" },
  { id: "kpop5", title: "Old MacDonald Had A Farm", videoId: "5oYKonYBujg" },
  { id: "kpop6", title: "Head Shoulders Knees & Toes", videoId: "h4eueDYPTIg" },
  { id: "kpop7", title: "If You're Happy and You Know It", videoId: "l4WNrvVjiTw" },
  { id: "kpop8", title: "Twinkle Twinkle Little Star", videoId: "yCjJyiqpAuU" },
  { id: "kpop9", title: "The Itsy Bitsy Spider", videoId: "w_lCi8U49mY" },
  { id: "kpop10", title: "Rain Rain Go Away", videoId: "LFrKYjrIDs8" },
];

// Built-in mood stations (shown by default)
// These YouTube stations provide unlimited content for various occasions
export const BUILT_IN_MOOD_STATIONS: MoodStation[] = [
  {
    id: "kids-hits",
    name: "Kids Hits",
    description: "Popular children's music videos",
    iconHint: "music",
    colorTheme: "#E91E63",
    type: MoodStationType.YOUTUBE,
    videoIds: KPOPDH_PLAYLIST.map(t => t.videoId),
    isBuiltIn: true,
  },
  {
    id: "lullabies-yt",
    name: "Lullaby Dreams",
    description: "Soothing lullabies for sleep & naps",
    iconHint: "moon",
    colorTheme: "#5C6BC0",
    type: MoodStationType.YOUTUBE,
    videoIds: [
      "VKsMfubWBHM", // Baby Sleep Music
      "TfHLp0tz1hY", // Lullaby for Babies
      "1ZYbU82GVz4", // Mozart for Babies
      "AF_nfazQaek", // Brahms Lullaby
      "sEhMdyj6nqA", // Baby Sleep Lullaby
    ],
    isBuiltIn: true,
  },
  {
    id: "cocomelon",
    name: "Cocomelon Fun",
    description: "Educational songs from Cocomelon",
    iconHint: "video",
    colorTheme: "#4CAF50",
    type: MoodStationType.YOUTUBE,
    videoIds: [
      "75NQK-Sm1YY", // Yes Yes Vegetables
      "gRaznYdw8_0", // Bath Song
      "IoKfQsos-zY", // ABC Song
      "xIm2ydB8PVo", // The Wheels on the Bus
    ],
    isBuiltIn: true,
  },
  {
    id: "bathtime-yt",
    name: "Bath Time Fun",
    description: "Splashy songs for bath time",
    iconHint: "droplet",
    colorTheme: "#00BCD4",
    type: MoodStationType.YOUTUBE,
    videoIds: [
      "gRaznYdw8_0", // Cocomelon Bath Song
      "WRVsOCh907o", // Baby Shark Bath
      "frN3nvhIHUk", // Bubble Bath Song
      "eTtmJVE5tQc", // Splish Splash
    ],
    isBuiltIn: true,
  },
  {
    id: "party-yt",
    name: "Party Time",
    description: "Fun songs for celebrations",
    iconHint: "party",
    colorTheme: "#F44336",
    type: MoodStationType.YOUTUBE,
    videoIds: [
      "l4WNrvVjiTw", // If You're Happy
      "h4eueDYPTIg", // Head Shoulders Knees
      "0wSllz_hmzs", // Freeze Dance
      "CE8UiMo2mJg", // Happy Birthday
      "tVlcKp3bWH8", // Cha Cha Slide Kids
    ],
    isBuiltIn: true,
  },
  {
    id: "nature-yt",
    name: "Nature Sounds",
    description: "Relaxing outdoor & animal sounds",
    iconHint: "tree",
    colorTheme: "#795548",
    type: MoodStationType.YOUTUBE,
    videoIds: [
      "d0tU18Ybcvk", // Nature Sounds for Baby
      "JYwm7CQIJKU", // Forest Sounds
      "L9Bf8M6KUfk", // Bird Sounds for Kids
      "1ZYbU82GVz4", // Mozart Nature
    ],
    isBuiltIn: true,
  },
];

// Helper function to convert mood station to playlist tracks
export function moodStationToTracks(station: MoodStation): YouTubeTrack[] {
  return station.videoIds.map((videoId, index) => ({
    id: `${station.id}-${index}`,
    title: `Track ${index + 1}`, // Will be fetched dynamically
    videoId,
  }));
}

// ============================================
// BABY RADIO TRACK LIBRARY (Verified working tracks)
// Sources: Archive.org public domain content
// Updated with expanded occasion tags
// ============================================
export const BABY_RADIO_LIBRARY: BabyRadioTrack[] = [
  // ========== NURSERY RHYMES (from TheBestNurseryRhymes4 - verified working) ==========
  { id: "nr001", title: "Alphabet Song (ABC)", url: "https://archive.org/download/TheBestNurseryRhymes4/1-01%20Alphabet%20Song%20(A%20B%20C).mp3", contentType: ContentType.NURSERY_RHYME, situations: [Situation.MORNING, Situation.LEARNING, Situation.CARRIDE, Situation.ANYTIME], minAgeMonths: 6, maxAgeMonths: 72, source: "Archive.org" },
  { id: "nr002", title: "Alphabet Song (You're Adorable)", url: "https://archive.org/download/TheBestNurseryRhymes4/1-02%20Alphabet%20Song%20(A%20Your%20Adorable).mp3", contentType: ContentType.NURSERY_RHYME, situations: [Situation.MORNING, Situation.PLAYTIME, Situation.LEARNING], minAgeMonths: 6, maxAgeMonths: 48, source: "Archive.org" },
  { id: "nr003", title: "I Have Two Hands", url: "https://archive.org/download/TheBestNurseryRhymes4/1-03%20I%20Have%20Two%20Hands.mp3", contentType: ContentType.ACTION_SONG, situations: [Situation.PLAYTIME, Situation.BATHTIME, Situation.LEARNING, Situation.ANYTIME], minAgeMonths: 6, maxAgeMonths: 48, source: "Archive.org" },
  { id: "nr004", title: "One Two Buckle My Shoe", url: "https://archive.org/download/TheBestNurseryRhymes4/1-04%20One%2C%20Two%2C%20Buckle%20My%20Shoe.mp3", contentType: ContentType.NURSERY_RHYME, situations: [Situation.PLAYTIME, Situation.MORNING, Situation.LEARNING, Situation.CARRIDE], minAgeMonths: 12, maxAgeMonths: 72, source: "Archive.org" },
  { id: "nr005", title: "Ten Little Indians", url: "https://archive.org/download/TheBestNurseryRhymes4/1-05%20Ten%20Little%20Indians.mp3", contentType: ContentType.NURSERY_RHYME, situations: [Situation.PLAYTIME, Situation.LEARNING, Situation.CARRIDE, Situation.ANYTIME], minAgeMonths: 6, maxAgeMonths: 48, source: "Archive.org" },
  { id: "nr006", title: "Ten Little Farmer Boys", url: "https://archive.org/download/TheBestNurseryRhymes4/1-06%20Ten%20Little%20Farmers%20Boys.mp3", contentType: ContentType.NURSERY_RHYME, situations: [Situation.PLAYTIME, Situation.LEARNING, Situation.OUTDOOR, Situation.ANYTIME], minAgeMonths: 12, maxAgeMonths: 60, source: "Archive.org" },
  { id: "nr007", title: "Where Is Thumbkin", url: "https://archive.org/download/TheBestNurseryRhymes4/1-07%20Where%20Is%20Thumbkin.mp3", contentType: ContentType.ACTION_SONG, situations: [Situation.PLAYTIME, Situation.CARRIDE, Situation.ANYTIME], minAgeMonths: 12, maxAgeMonths: 48, source: "Archive.org" },
  { id: "nr008", title: "My Toes My Knees My Shoulders My Head", url: "https://archive.org/download/TheBestNurseryRhymes4/1-08%20My%20Toes%2C%20My%20Knees%2C%20My%20Shoulder%2C%20My%20Head.mp3", contentType: ContentType.ACTION_SONG, situations: [Situation.PLAYTIME, Situation.MORNING, Situation.BATHTIME, Situation.LEARNING], minAgeMonths: 6, maxAgeMonths: 48, source: "Archive.org" },
  { id: "nr009", title: "Little Sunny Water", url: "https://archive.org/download/TheBestNurseryRhymes4/1-09%20Little%20Sunny%20Water.mp3", contentType: ContentType.NURSERY_RHYME, situations: [Situation.MORNING, Situation.QUIET, Situation.BATHTIME], minAgeMonths: 0, maxAgeMonths: 36, source: "Archive.org" },
  { id: "nr010", title: "B-I-N-G-O", url: "https://archive.org/download/TheBestNurseryRhymes4/1-10%20B%20I%20N%20G%20O.mp3", contentType: ContentType.NURSERY_RHYME, situations: [Situation.PLAYTIME, Situation.CARRIDE, Situation.CELEBRATION, Situation.ANYTIME], minAgeMonths: 12, maxAgeMonths: 72, source: "Archive.org" },
  { id: "nr011", title: "Here We Go Around the Mulberry Bush", url: "https://archive.org/download/TheBestNurseryRhymes4/1-11%20Here%20We%20Go%20Around%20the%20Mulberry%20Bush.mp3", contentType: ContentType.ACTION_SONG, situations: [Situation.PLAYTIME, Situation.MORNING, Situation.OUTDOOR, Situation.CELEBRATION], minAgeMonths: 12, maxAgeMonths: 72, source: "Archive.org" },
  { id: "nr012", title: "Ring Around the Rosy", url: "https://archive.org/download/TheBestNurseryRhymes4/1-12%20Ring%20Around%20the%20Rosy.mp3", contentType: ContentType.ACTION_SONG, situations: [Situation.PLAYTIME, Situation.OUTDOOR, Situation.CELEBRATION], minAgeMonths: 12, maxAgeMonths: 48, source: "Archive.org" },
  { id: "nr013", title: "Old MacDonald Had a Farm", url: "https://archive.org/download/TheBestNurseryRhymes4/1-13%20Old%20McDonald%20Had%20a%20Farm.mp3", contentType: ContentType.NURSERY_RHYME, situations: [Situation.PLAYTIME, Situation.MORNING, Situation.CARRIDE, Situation.OUTDOOR, Situation.LEARNING], minAgeMonths: 6, maxAgeMonths: 72, source: "Archive.org" },
  { id: "nr014", title: "The Hokey Pokey", url: "https://archive.org/download/TheBestNurseryRhymes4/1-14%20The%20Hockey%20Pockey.mp3", contentType: ContentType.ACTION_SONG, situations: [Situation.PLAYTIME, Situation.CELEBRATION, Situation.OUTDOOR], minAgeMonths: 18, maxAgeMonths: 72, source: "Archive.org" },
  { id: "nr015", title: "Happy Talk", url: "https://archive.org/download/TheBestNurseryRhymes4/1-15%20Happy%20Talk.mp3", contentType: ContentType.NURSERY_RHYME, situations: [Situation.MORNING, Situation.CELEBRATION, Situation.CARRIDE, Situation.ANYTIME], minAgeMonths: 6, maxAgeMonths: 60, source: "Archive.org" },
  { id: "nr016", title: "Strawberry Jam", url: "https://archive.org/download/TheBestNurseryRhymes4/1-16%20Strawberry%20Jam.mp3", contentType: ContentType.NURSERY_RHYME, situations: [Situation.PLAYTIME, Situation.MEALTIME, Situation.CELEBRATION], minAgeMonths: 6, maxAgeMonths: 60, source: "Archive.org" },

  // ========== CLASSIC SONGS (from TheBestNurseryRhymes4 disc 2) ==========
  { id: "cs001", title: "Dear Mr. Jesus", url: "https://archive.org/download/TheBestNurseryRhymes4/2-01%20Dear%20Mr.%20Jesus.mp3", contentType: ContentType.LULLABY, situations: [Situation.QUIET, Situation.BEDTIME, Situation.NAPTIME], minAgeMonths: 24, maxAgeMonths: 72, source: "Archive.org" },
  { id: "cs002", title: "Mama", url: "https://archive.org/download/TheBestNurseryRhymes4/2-02%20Mama.mp3", contentType: ContentType.LULLABY, situations: [Situation.QUIET, Situation.BEDTIME, Situation.NAPTIME], minAgeMonths: 0, maxAgeMonths: 48, source: "Archive.org" },
  { id: "cs003", title: "Somewhere Over the Rainbow", url: "https://archive.org/download/TheBestNurseryRhymes4/2-03%20Somewhere%20Over%20the%20Rainbow.mp3", contentType: ContentType.LULLABY, situations: [Situation.QUIET, Situation.BEDTIME, Situation.NAPTIME, Situation.CARRIDE], minAgeMonths: 12, maxAgeMonths: 72, source: "Archive.org" },
  { id: "cs004", title: "It's a Small World", url: "https://archive.org/download/TheBestNurseryRhymes4/2-04%20It%27s%20a%20Small%20World.mp3", contentType: ContentType.NURSERY_RHYME, situations: [Situation.PLAYTIME, Situation.CARRIDE, Situation.CELEBRATION, Situation.ANYTIME], minAgeMonths: 12, maxAgeMonths: 72, source: "Archive.org" },
  { id: "cs005", title: "Climb Every Mountain", url: "https://archive.org/download/TheBestNurseryRhymes4/2-05%20Climb%20Every%20Mountain.mp3", contentType: ContentType.LULLABY, situations: [Situation.QUIET, Situation.OUTDOOR, Situation.ANYTIME], minAgeMonths: 24, maxAgeMonths: 72, source: "Archive.org" },
  { id: "cs006", title: "You Didn't Have to Be So Nice", url: "https://archive.org/download/TheBestNurseryRhymes4/2-06%20You%20Didn%27t%20Have%20to%20Be%20So%20Nice.mp3", contentType: ContentType.LULLABY, situations: [Situation.QUIET, Situation.NAPTIME, Situation.ANYTIME], minAgeMonths: 24, maxAgeMonths: 72, source: "Archive.org" },
  { id: "cs007", title: "Que Sera Sera", url: "https://archive.org/download/TheBestNurseryRhymes4/2-07%20Que%20Sera%2C%20Sera.mp3", contentType: ContentType.LULLABY, situations: [Situation.QUIET, Situation.BEDTIME, Situation.NAPTIME, Situation.CARRIDE], minAgeMonths: 12, maxAgeMonths: 72, source: "Archive.org" },

  // ========== ANIMAL SOUNDS (SSE Library - verified working) ==========
  { id: "as001", title: "Lion Roar", url: "https://archive.org/download/SSE_Library_ANIMALS/CAT%20WILD/ANMLWcat_Lion%20roaring%20with%20light%20jungle%20background_CS_USC.mp3", contentType: ContentType.ANIMAL_SOUNDS, situations: [Situation.PLAYTIME, Situation.LEARNING, Situation.OUTDOOR, Situation.ANYTIME], minAgeMonths: 0, maxAgeMonths: 72, source: "Archive.org" },
  { id: "as002", title: "Elephant Sounds", url: "https://archive.org/download/SSE_Library_ANIMALS/WILD/ANMLWild_Elephant%20running%20by%20in%20dirt_CS_USC.mp3", contentType: ContentType.ANIMAL_SOUNDS, situations: [Situation.PLAYTIME, Situation.LEARNING, Situation.OUTDOOR, Situation.ANYTIME], minAgeMonths: 0, maxAgeMonths: 72, source: "Archive.org" },
  { id: "as003", title: "Dog Barking", url: "https://archive.org/download/SSE_Library_ANIMALS/DOG/ANMLDog_Dog%20barking%20medium%20sized_CS_USC.mp3", contentType: ContentType.ANIMAL_SOUNDS, situations: [Situation.PLAYTIME, Situation.LEARNING, Situation.ANYTIME], minAgeMonths: 6, maxAgeMonths: 72, source: "Archive.org" },
  { id: "as004", title: "Cat Meowing", url: "https://archive.org/download/SSE_Library_ANIMALS/CAT%20DOMESTIC/ANMLCat_Cat%20meowing%20several%20times_CS_USC.mp3", contentType: ContentType.ANIMAL_SOUNDS, situations: [Situation.PLAYTIME, Situation.LEARNING, Situation.ANYTIME], minAgeMonths: 6, maxAgeMonths: 72, source: "Archive.org" },
  { id: "as005", title: "Cow Mooing", url: "https://archive.org/download/SSE_Library_ANIMALS/FARM/ANMLFarm_Cow%20mooing%20single_CS_USC.mp3", contentType: ContentType.ANIMAL_SOUNDS, situations: [Situation.PLAYTIME, Situation.LEARNING, Situation.OUTDOOR, Situation.ANYTIME], minAgeMonths: 6, maxAgeMonths: 72, source: "Archive.org" },
  { id: "as006", title: "Rooster Crowing", url: "https://archive.org/download/SSE_Library_ANIMALS/FARM/ANMLFarm_Rooster%20crowing_CS_USC.mp3", contentType: ContentType.ANIMAL_SOUNDS, situations: [Situation.MORNING, Situation.PLAYTIME, Situation.LEARNING, Situation.OUTDOOR], minAgeMonths: 6, maxAgeMonths: 72, source: "Archive.org" },
  { id: "as007", title: "Horse Neighing", url: "https://archive.org/download/SSE_Library_ANIMALS/HORSE/ANMLHorse_Horse%20whinny_CS_USC.mp3", contentType: ContentType.ANIMAL_SOUNDS, situations: [Situation.PLAYTIME, Situation.LEARNING, Situation.OUTDOOR, Situation.ANYTIME], minAgeMonths: 6, maxAgeMonths: 72, source: "Archive.org" },
  { id: "as008", title: "Pig Oinking", url: "https://archive.org/download/SSE_Library_ANIMALS/FARM/ANMLFarm_Pig%20oinking_CS_USC.mp3", contentType: ContentType.ANIMAL_SOUNDS, situations: [Situation.PLAYTIME, Situation.LEARNING, Situation.OUTDOOR, Situation.ANYTIME], minAgeMonths: 6, maxAgeMonths: 72, source: "Archive.org" },
  { id: "as009", title: "Sheep Baaing", url: "https://archive.org/download/SSE_Library_ANIMALS/FARM/ANMLFarm_Sheep%20baaing_CS_USC.mp3", contentType: ContentType.ANIMAL_SOUNDS, situations: [Situation.PLAYTIME, Situation.LEARNING, Situation.OUTDOOR, Situation.ANYTIME], minAgeMonths: 6, maxAgeMonths: 72, source: "Archive.org" },
  { id: "as010", title: "Duck Quacking", url: "https://archive.org/download/SSE_Library_ANIMALS/BIRD/ANMLBird_Ducks%20quacking_CS_USC.mp3", contentType: ContentType.ANIMAL_SOUNDS, situations: [Situation.PLAYTIME, Situation.LEARNING, Situation.BATHTIME, Situation.OUTDOOR, Situation.ANYTIME], minAgeMonths: 6, maxAgeMonths: 72, source: "Archive.org" },
];

// Helper functions
export function filterTracksByAge(tracks: BabyRadioTrack[], ageMonths: number): BabyRadioTrack[] {
  return tracks.filter(track => ageMonths >= track.minAgeMonths && ageMonths <= track.maxAgeMonths);
}

export function filterTracksBySituation(tracks: BabyRadioTrack[], situation: SituationValue): BabyRadioTrack[] {
  return tracks.filter(track => track.situations.includes(situation) || track.situations.includes(Situation.ANYTIME));
}

export function filterTracksByContentType(tracks: BabyRadioTrack[], contentType: ContentTypeValue): BabyRadioTrack[] {
  return tracks.filter(track => track.contentType === contentType);
}

// Shuffle tracks by interleaving from different sources for variety
function shuffleBySource(tracks: BabyRadioTrack[]): BabyRadioTrack[] {
  if (tracks.length <= 1) return tracks;
  
  // Group tracks by their source/collection (extract from URL)
  const bySource: Map<string, BabyRadioTrack[]> = new Map();
  
  for (const track of tracks) {
    // Extract collection name from Archive.org URL
    const match = track.url.match(/archive\.org\/download\/([^/]+)/);
    const source = match ? match[1] : (track.source || 'unknown');
    
    if (!bySource.has(source)) {
      bySource.set(source, []);
    }
    bySource.get(source)!.push(track);
  }
  
  // Shuffle each source group
  const sources = Array.from(bySource.values());
  for (const group of sources) {
    for (let i = group.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [group[i], group[j]] = [group[j], group[i]];
    }
  }
  
  // Interleave tracks from different sources
  const result: BabyRadioTrack[] = [];
  let sourceIndex = 0;
  
  while (result.length < tracks.length) {
    let added = false;
    for (let i = 0; i < sources.length; i++) {
      const idx = (sourceIndex + i) % sources.length;
      if (sources[idx].length > 0) {
        result.push(sources[idx].shift()!);
        added = true;
        break;
      }
    }
    if (!added) break;
    sourceIndex = (sourceIndex + 1) % sources.length;
  }
  
  return result;
}

export function getTracksForStation(stationId: string, ageMonths: number): BabyRadioTrack[] {
  const station = BABY_RADIO_STATIONS.find(s => s.id === stationId);
  if (!station) return [];
  
  let tracks = filterTracksBySituation(BABY_RADIO_LIBRARY, station.situation as SituationValue);
  tracks = filterTracksByAge(tracks, ageMonths);
  
  // Shuffle by source for variety and to avoid hitting same server repeatedly
  return shuffleBySource(tracks);
}
