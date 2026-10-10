import { randomUUID } from "crypto";
import { getOrCreateUser, type UserData } from "./middleware";
import { getUserData, updateUserData } from "./firebase";
import type { CalendarEvent, InsertCalendarEvent, Person } from "@shared/schema";
import { EventType } from "@shared/schema";

export class CalendarError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = "CalendarError";
  }
}

export interface CalendarDeps {
  getOrCreateUser(id: string, username: string): Promise<UserData>;
  getUserData(id: string): Promise<any>;
  updateUserData(id: string, updates: any): Promise<void>;
}

function isRealDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const DETAIL_KEYS = ["startTime", "endTime", "location", "notes"] as const;

function validateDates(input: Pick<InsertCalendarEvent, "startDate" | "endDate">): void {
  if (!isRealDate(input.startDate) || !isRealDate(input.endDate)) {
    throw new CalendarError("Dates must be valid and formatted YYYY-MM-DD", 400);
  }
  if (input.endDate < input.startDate) {
    throw new CalendarError("End date cannot be before start date", 400);
  }
}

function validateTimes(input: { startTime?: string; endTime?: string }): void {
  for (const t of [input.startTime, input.endTime]) {
    if (t && !TIME_PATTERN.test(t)) throw new CalendarError("Times must be formatted HH:MM (24h)", 400);
  }
}

// Normalize old event schema to current schema
function normalizeEvent(event: any, defaultCreatorId?: string, defaultCreatorName?: string): CalendarEvent {
  const optional: Partial<CalendarEvent> = {};
  for (const key of ["startTime", "endTime", "location", "notes", "source", "cancelled"] as const) {
    if (event[key] !== undefined && event[key] !== null) (optional as any)[key] = event[key];
  }
  return {
    id: event.id,
    title: event.title || "",
    startDate: event.startDate || event.start || "",
    endDate: event.endDate || event.end || "",
    type: event.type || EventType.SHARED,
    people: Array.isArray(event.people) ? event.people : [],
    creatorId: event.creatorId || defaultCreatorId,
    creatorName: event.creatorName || defaultCreatorName,
    ...optional,
  };
}

export type LinkedFieldsPatch = Partial<
  Pick<CalendarEvent, "startDate" | "endDate" | "startTime" | "endTime" | "location" | "title" | "cancelled" | "type" | "people" | "notes">
> & { source?: CalendarEvent["source"] };

// Drop undefined/empty detail values so nothing undefined reaches Firebase.
function stripEmpty<T extends object>(input: T): T {
  const out: any = { ...input };
  for (const key of DETAIL_KEYS) {
    if (out[key] === undefined || out[key] === null || out[key] === "") delete out[key];
  }
  return out;
}

export function createCalendarService(deps: CalendarDeps) {
  return {
    async listEvents(userId: string, username: string): Promise<CalendarEvent[]> {
      const userData = await deps.getOrCreateUser(userId, username);
      const rawEvents: any[] = userData.events || [];
      const defaultCreatorName = userData.settings?.homeName || username;

      const normalizedEvents = rawEvents.map((e) => normalizeEvent(e, userId, defaultCreatorName));

      const needsMigration = rawEvents.some((e) => e.start || e.end || !Array.isArray(e.people) || !e.creatorId);
      if (needsMigration) {
        await deps.updateUserData(userId, { events: normalizedEvents });
      }

      const allEvents = [...normalizedEvents];

      for (const connectedUserId of userData.connections || []) {
        const connectedUserData = await deps.getUserData(connectedUserId);
        if (connectedUserData?.events) {
          const connectedCreatorName = connectedUserData.settings?.homeName || connectedUserData.username || "Connected Home";
          const sharedEvents = connectedUserData.events
            .map((e: any) => normalizeEvent(e, connectedUserId, connectedCreatorName))
            .filter((e: CalendarEvent) => e.type === EventType.SHARED);
          allEvents.push(...sharedEvents);
        }
      }

      return allEvents;
    },

    async listPeople(userId: string, username: string): Promise<Person[]> {
      const userData = await deps.getOrCreateUser(userId, username);
      return userData.people || [];
    },

    async createEvent(
      userId: string,
      username: string,
      input: InsertCalendarEvent,
      opts?: { source?: CalendarEvent["source"] },
    ): Promise<CalendarEvent> {
      validateDates(input);
      validateTimes(input);
      const userData = await deps.getOrCreateUser(userId, username);
      const newEvent: CalendarEvent = {
        id: randomUUID(),
        ...stripEmpty(input),
        creatorId: userId,
        creatorName: userData.settings?.homeName || username,
        ...(opts?.source ? { source: opts.source } : {}),
      };
      await deps.updateUserData(userId, { events: [...(userData.events || []), newEvent] });
      return newEvent;
    },

    async updateEvent(userId: string, username: string, eventId: string, input: InsertCalendarEvent): Promise<CalendarEvent> {
      validateDates(input);
      validateTimes(input);
      const userData = await deps.getOrCreateUser(userId, username);
      const events = [...(userData.events || [])];

      const eventIndex = events.findIndex((e) => e.id === eventId);
      if (eventIndex === -1) {
        throw new CalendarError("You can only edit your own events", 403);
      }

      const existingEvent = events[eventIndex];
      const { startTime, endTime, location, notes, ...classic } = input;
      const updatedEvent: CalendarEvent = {
        id: eventId,
        ...classic,
        creatorId: existingEvent.creatorId || userId,
        creatorName: existingEvent.creatorName || userData.settings?.homeName || username,
      };
      const incoming = { startTime, endTime, location, notes };
      for (const key of DETAIL_KEYS) {
        const value = incoming[key] === undefined ? existingEvent[key] : incoming[key];
        if (value !== undefined && value !== null && value !== "") updatedEvent[key] = value;
      }
      if (existingEvent.source) updatedEvent.source = existingEvent.source;
      if (existingEvent.cancelled !== undefined && existingEvent.cancelled !== null) updatedEvent.cancelled = existingEvent.cancelled;

      events[eventIndex] = updatedEvent;
      await deps.updateUserData(userId, { events });
      return updatedEvent;
    },

    // Server-side patch for linked events (e.g. from the Events app); owner-only like updateEvent.
    async setLinkedFields(userId: string, username: string, eventId: string, patch: LinkedFieldsPatch): Promise<CalendarEvent> {
      const userData = await deps.getOrCreateUser(userId, username);
      const events = [...(userData.events || [])];
      const eventIndex = events.findIndex((e) => e.id === eventId);
      if (eventIndex === -1) {
        throw new CalendarError("You can only edit your own events", 403);
      }

      const merged: CalendarEvent = { ...events[eventIndex] };
      for (const [key, value] of Object.entries(patch)) {
        if (value === undefined) continue;
        if (value === null || value === "") delete (merged as any)[key];
        else (merged as any)[key] = value;
      }
      validateDates(merged);
      validateTimes(merged);

      events[eventIndex] = merged;
      await deps.updateUserData(userId, { events });
      return merged;
    },

    async deleteEvent(userId: string, username: string, eventId: string): Promise<void> {
      const userData = await deps.getOrCreateUser(userId, username);
      const events = userData.events || [];

      if (!events.some((e) => e.id === eventId)) {
        throw new CalendarError("You can only delete your own events", 403);
      }

      await deps.updateUserData(userId, { events: events.filter((e) => e.id !== eventId) });
    },
  };
}

export type CalendarService = ReturnType<typeof createCalendarService>;

export const calendarService: CalendarService = createCalendarService({
  getOrCreateUser: (id, username) => getOrCreateUser(id, username),
  getUserData: (id) => getUserData(id),
  updateUserData: (id, updates) => updateUserData(id, updates),
});
