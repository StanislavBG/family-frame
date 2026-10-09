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

function validateDates(input: InsertCalendarEvent): void {
  if (!isRealDate(input.startDate) || !isRealDate(input.endDate)) {
    throw new CalendarError("Dates must be valid and formatted YYYY-MM-DD", 400);
  }
  if (input.endDate < input.startDate) {
    throw new CalendarError("End date cannot be before start date", 400);
  }
}

// Normalize old event schema to current schema
function normalizeEvent(event: any, defaultCreatorId?: string, defaultCreatorName?: string): CalendarEvent {
  return {
    id: event.id,
    title: event.title || "",
    startDate: event.startDate || event.start || "",
    endDate: event.endDate || event.end || "",
    type: event.type || EventType.SHARED,
    people: Array.isArray(event.people) ? event.people : [],
    creatorId: event.creatorId || defaultCreatorId,
    creatorName: event.creatorName || defaultCreatorName,
  };
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

    async createEvent(userId: string, username: string, input: InsertCalendarEvent): Promise<CalendarEvent> {
      validateDates(input);
      const userData = await deps.getOrCreateUser(userId, username);
      const newEvent: CalendarEvent = {
        id: randomUUID(),
        ...input,
        creatorId: userId,
        creatorName: userData.settings?.homeName || username,
      };
      await deps.updateUserData(userId, { events: [...(userData.events || []), newEvent] });
      return newEvent;
    },

    async updateEvent(userId: string, username: string, eventId: string, input: InsertCalendarEvent): Promise<CalendarEvent> {
      validateDates(input);
      const userData = await deps.getOrCreateUser(userId, username);
      const events = [...(userData.events || [])];

      const eventIndex = events.findIndex((e) => e.id === eventId);
      if (eventIndex === -1) {
        throw new CalendarError("You can only edit your own events", 403);
      }

      const existingEvent = events[eventIndex];
      const updatedEvent: CalendarEvent = {
        id: eventId,
        ...input,
        creatorId: existingEvent.creatorId || userId,
        creatorName: existingEvent.creatorName || userData.settings?.homeName || username,
      };

      events[eventIndex] = updatedEvent;
      await deps.updateUserData(userId, { events });
      return updatedEvent;
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
