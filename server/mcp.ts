import type { Express, Request, Response } from "express";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { calendarService, CalendarError, type CalendarService } from "./calendar-service";
import { EventType, type EventTypeValue, type InsertCalendarEvent } from "@shared/schema";

export interface McpContext {
  userId: string;
  username: string;
  scopes: string[];
}

const dateField = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD");
const typeField = z.enum([EventType.SHARED, EventType.PRIVATE]);
const peopleField = z.array(z.string());

function ok(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}

function fail(message: string) {
  return { isError: true, content: [{ type: "text" as const, text: message }] };
}

interface CreateArgs {
  title: string;
  startDate: string;
  endDate?: string;
  type?: EventTypeValue;
  people?: string[];
}
type UpdateArgs = Partial<CreateArgs> & { eventId: string };

class ToolError extends Error {}

export function buildFamilyFrameMcpServer(ctx: McpContext, service: CalendarService = calendarService): McpServer {
  const mcpServer = new McpServer({ name: "family-frame", version: "1.0.0" });
  // The SDK's registerTool generics blow up tsc with zod 3 shapes; register through a loose signature
  // and type each handler's args explicitly with z.infer.
  const server = mcpServer as unknown as {
    registerTool(name: string, config: { description: string; inputSchema?: Record<string, z.ZodTypeAny> }, cb: (args: any) => Promise<unknown>): void;
  };
  const canWrite = ctx.scopes.includes("calendar:write");

  // Wraps a handler so scope errors, unknown names and CalendarErrors become isError results.
  const run = (write: boolean, fn: () => Promise<unknown>) => async () => {
    if (write && !canWrite) return fail("This token lacks the calendar:write scope; write operations are not permitted.");
    try {
      return ok(await fn());
    } catch (err) {
      if (err instanceof ToolError || err instanceof CalendarError) return fail(err.message);
      console.error("MCP tool error:", err);
      return fail("Internal error while processing the request.");
    }
  };

  async function resolvePeople(refs: string[]): Promise<string[]> {
    const people = await service.listPeople(ctx.userId, ctx.username);
    return refs.map((ref) => {
      const needle = ref.trim().toLowerCase();
      const match =
        people.find((p) => p.id === ref) ?? people.find((p) => p.name.toLowerCase() === needle);
      if (!match) {
        const known = people.map((p) => p.name).join(", ") || "none";
        throw new ToolError(`Unknown person "${ref}". Known people: ${known}`);
      }
      return match.id;
    });
  }

  server.registerTool(
    "list_people",
    { description: "List the household members (id and name) that can be attached to calendar events." },
    run(false, () => service.listPeople(ctx.userId, ctx.username)),
  );

  server.registerTool(
    "list_events",
    {
      description:
        "List calendar events (own events plus Shared events from connected homes). Optionally filter to events overlapping the range from..to (inclusive, YYYY-MM-DD).",
      inputSchema: { from: dateField.optional(), to: dateField.optional() },
    },
    async ({ from, to }: { from?: string; to?: string }) =>
      run(false, async () => {
        const events = await service.listEvents(ctx.userId, ctx.username);
        return events.filter((e) => (!to || e.startDate <= to) && (!from || e.endDate >= from));
      })(),
  );

  server.registerTool(
    "create_event",
    {
      description:
        'Create a calendar event. startDate/endDate are YYYY-MM-DD (endDate defaults to startDate). type is "Shared" (visible to connected homes) or "Private" (default). people is a list of person ids or names (case-insensitive); see list_people.',
      inputSchema: {
        title: z.string().min(1),
        startDate: dateField,
        endDate: dateField.optional(),
        type: typeField.optional(),
        people: peopleField.optional(),
      },
    },
    async (args: CreateArgs) =>
      run(true, async () => {
        const input: InsertCalendarEvent = {
          title: args.title,
          startDate: args.startDate,
          endDate: args.endDate ?? args.startDate,
          type: args.type ?? EventType.PRIVATE,
          people: await resolvePeople(args.people ?? []),
        };
        return service.createEvent(ctx.userId, ctx.username, input);
      })(),
  );

  server.registerTool(
    "update_event",
    {
      description:
        'Update one of your own events by eventId; any provided field (title, startDate, endDate, type "Shared"|"Private", people as ids or names) is merged onto the existing event.',
      inputSchema: {
        eventId: z.string().min(1),
        title: z.string().min(1).optional(),
        startDate: dateField.optional(),
        endDate: dateField.optional(),
        type: typeField.optional(),
        people: peopleField.optional(),
      },
    },
    async (args: UpdateArgs) =>
      run(true, async () => {
        const events = await service.listEvents(ctx.userId, ctx.username);
        const existing = events.find((e) => e.id === args.eventId && (!e.creatorId || e.creatorId === ctx.userId));
        if (!existing) throw new ToolError(`Event "${args.eventId}" not found among your own events.`);
        const input: InsertCalendarEvent = {
          title: args.title ?? existing.title,
          startDate: args.startDate ?? existing.startDate,
          endDate: args.endDate ?? (args.startDate && args.startDate > existing.endDate ? args.startDate : existing.endDate),
          type: args.type ?? existing.type,
          people: args.people ? await resolvePeople(args.people) : existing.people,
        };
        return service.updateEvent(ctx.userId, ctx.username, args.eventId, input);
      })(),
  );

  server.registerTool(
    "delete_event",
    {
      description: "Delete one of your own calendar events by eventId (see list_events).",
      inputSchema: { eventId: z.string().min(1) },
    },
    async ({ eventId }: { eventId: string }) =>
      run(true, async () => {
        await service.deleteEvent(ctx.userId, ctx.username, eventId);
        return { deleted: eventId };
      })(),
  );

  return mcpServer;
}

function headerValue(req: Request, name: string): string | undefined {
  const v = req.headers[name];
  return Array.isArray(v) ? v[0] : v;
}

export function registerMcpRoutes(app: Express): void {
  app.post("/mcp", async (req: Request, res: Response) => {
    const userId = headerValue(req, "x-clerk-user-id");
    if (!userId) {
      res.setHeader("WWW-Authenticate", "Bearer");
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const username = headerValue(req, "x-clerk-username") || "user";
    const scopes =
      headerValue(req, "x-ff-auth") === "pat"
        ? (headerValue(req, "x-ff-scopes") || "").split(",").filter(Boolean)
        : ["calendar:read", "calendar:write"];

    const server = buildFamilyFrameMcpServer({ userId, username, scopes });
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      console.error("MCP request error:", err);
      if (!res.headersSent) {
        res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal server error" }, id: null });
      }
    }
  });

  const methodNotAllowed = (_req: Request, res: Response) => {
    res.setHeader("Allow", "POST");
    res.status(405).json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed." }, id: null });
  };
  app.get("/mcp", methodNotAllowed);
  app.delete("/mcp", methodNotAllowed);
}
