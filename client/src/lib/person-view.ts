// Pure logic behind custom People sections (`ff-person-view` records): parsing, ordering and
// turning fetched dataset records into display models. Keep logic here, not in components.
import { getFieldPath, type PersonView, type PersonViewBlock } from "@shared/person-views";
import type { TimePoint } from "@shared/time-series";
import { TILE_CYCLE, type SatchelTone } from "@/components/person/satchel";

export type ViewRecord = { id: string; data: unknown };
export type ParsedView = PersonView & { id: string };

const DEFAULT_ORDER = 50;
const DEFAULT_LIST_LIMIT = 10;
const DEFAULT_CHART_LIMIT = 90;

export function parseViewRecord(record: ViewRecord): ParsedView | null {
  try {
    const data = record?.data;
    if (data === null || typeof data !== "object" || Array.isArray(data)) return null;
    const { title, blocks } = data as Record<string, unknown>;
    if (typeof title !== "string" || title === "" || !Array.isArray(blocks)) return null;
    return { ...(data as PersonView), id: record.id };
  } catch {
    return null;
  }
}

export function viewTabId(recordId: string): string {
  return `v-${recordId}`;
}

export function sortViews<T extends { title: string; order?: number }>(views: T[]): T[] {
  return [...views].sort(
    (a, b) => (a.order ?? DEFAULT_ORDER) - (b.order ?? DEFAULT_ORDER) || a.title.localeCompare(b.title),
  );
}

function scalarText(value: unknown): string | undefined {
  if (typeof value === "string") return value === "" ? undefined : value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return undefined;
}

export function buildMetricsModel(
  block: Extract<PersonViewBlock, { type: "metrics" }>,
  records: ViewRecord[],
): { label: string; value: string; tone: SatchelTone }[] {
  const newest = records[0];
  if (!newest) return [];
  const out: { label: string; value: string; tone: SatchelTone }[] = [];
  block.fields.forEach((f, i) => {
    const raw = getFieldPath(newest.data, f.field);
    if (raw === undefined || raw === null) return;
    let value: string;
    if (typeof raw === "number") value = raw.toLocaleString();
    else if (typeof raw === "string" || typeof raw === "boolean") value = String(raw);
    else return;
    if (f.unit) value = `${value} ${f.unit}`;
    out.push({ label: f.label, value, tone: f.tone ?? TILE_CYCLE[i % TILE_CYCLE.length] });
  });
  return out;
}

const URL_MAX = 2048;

export function httpsUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > URL_MAX) return undefined;
  try {
    const u = new URL(value);
    if (u.protocol !== "https:" || u.username !== "" || u.password !== "") return undefined;
    return u.href;
  } catch {
    return undefined;
  }
}

export type ListRow = { id: string; title: string; subtitle?: string; date?: string; url?: string };

export function buildListModel(
  block: Extract<PersonViewBlock, { type: "list" }>,
  records: ViewRecord[],
): ListRow[] {
  const out: ListRow[] = [];
  const limit = block.limit ?? DEFAULT_LIST_LIMIT;
  for (const r of records) {
    if (out.length >= limit) break;
    const title = scalarText(getFieldPath(r.data, block.titleField));
    if (!title) continue;
    const item: ListRow = { id: r.id, title };
    const subtitle = block.subtitleField ? scalarText(getFieldPath(r.data, block.subtitleField)) : undefined;
    const date = block.dateField ? scalarText(getFieldPath(r.data, block.dateField)) : undefined;
    if (subtitle) item.subtitle = subtitle;
    if (date) item.date = date;
    const url = block.urlField ? httpsUrl(getFieldPath(r.data, block.urlField)) : undefined;
    if (url) item.url = url;
    out.push(item);
  }
  return out;
}

export function buildChartPoints(
  block: Extract<PersonViewBlock, { type: "chart" }>,
  records: ViewRecord[],
): TimePoint[] {
  const src = block.source;
  if (!("xField" in src)) return [];
  const points: TimePoint[] = [];
  for (const r of records) {
    const x = getFieldPath(r.data, src.xField);
    const y = getFieldPath(r.data, src.yField);
    if (typeof x !== "string" || typeof y !== "number" || !Number.isFinite(y)) continue;
    points.push({ t: x, value: y });
  }
  points.sort((a, b) => (a.t < b.t ? -1 : a.t > b.t ? 1 : 0));
  const limit = block.limit ?? DEFAULT_CHART_LIMIT;
  return points.length > limit ? points.slice(points.length - limit) : points;
}
