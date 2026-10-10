import { useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { Layers } from "lucide-react";
import type { Person } from "@shared/schema";
import type { DataSchema } from "@shared/agent-data";
import { RESERVED_SCHEMA_PREFIX } from "@shared/person-views";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { buildDataRecordsUrl, useDataSchemas, type DataRecordsResponse } from "@/lib/agent-data";
import { queryKeys } from "@/lib/api";
import { apiRequest } from "@/lib/queryClient";

const RECORD_LIMIT = 20;
const STRING_TRUNCATE = 300;

type RecordItem = DataRecordsResponse["records"][number];

function humanize(key: string): string {
  const spaced = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function isScalar(v: unknown): v is string | number | boolean | null {
  return v === null || ["string", "number", "boolean"].includes(typeof v);
}

function prettyJson(v: unknown): string {
  try {
    return JSON.stringify(v, null, 2) ?? String(v);
  } catch {
    return String(v);
  }
}

function ScalarValue({ value }: { value: string | number | boolean | null }) {
  const [expanded, setExpanded] = useState(false);
  if (typeof value !== "string") {
    return <span>{value === null ? "—" : String(value)}</span>;
  }
  const long = value.length > STRING_TRUNCATE;
  const shown = long && !expanded ? `${value.slice(0, STRING_TRUNCATE)}…` : value;
  return (
    <span className="whitespace-pre-wrap break-words">
      {shown}
      {long && (
        <button
          type="button"
          className="ml-2 text-primary underline underline-offset-2"
          onClick={() => setExpanded((e) => !e)}
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </span>
  );
}

function FieldRow({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[10rem_1fr] gap-x-4 gap-y-1 py-1.5">
      <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
      <dd className="text-sm text-foreground min-w-0">
        {isScalar(value) ? (
          <ScalarValue value={value} />
        ) : (
          <details>
            <summary className="cursor-pointer text-muted-foreground">
              {Array.isArray(value) ? `${value.length} items` : "Details"}
            </summary>
            <pre className="mt-2 max-h-72 overflow-auto rounded-md bg-muted p-3 text-xs whitespace-pre-wrap break-words">
              {prettyJson(value)}
            </pre>
          </details>
        )}
      </dd>
    </div>
  );
}

function RecordCard({ record }: { record: RecordItem }) {
  const data = record.data;
  const entries =
    data !== null && typeof data === "object" && !Array.isArray(data)
      ? Object.entries(data as Record<string, unknown>)
      : [["Value", data] as [string, unknown]];
  return (
    <article
      className="rounded-lg border bg-card text-card-foreground p-4"
      data-testid={`person-more-record-${record.id}`}
    >
      <dl className="divide-y divide-border">
        {entries.map(([key, value]) => (
          <FieldRow key={key} label={humanize(key)} value={value} />
        ))}
      </dl>
      <p className="mt-2 text-xs text-muted-foreground">
        {new Date(record.updatedAt || record.createdAt).toLocaleString()}
      </p>
    </article>
  );
}

function newestFirst(records: RecordItem[]): RecordItem[] {
  const ts = (r: RecordItem) => Date.parse(r.updatedAt || r.createdAt) || 0;
  return [...records].sort((a, b) => ts(b) - ts(a)).slice(0, RECORD_LIMIT);
}

export default function PersonMore({ person }: { person: Person }) {
  const schemasQuery = useDataSchemas();
  const schemas: DataSchema[] = (schemasQuery.data ?? []).filter(
    (s) => !s.id.startsWith(RESERVED_SCHEMA_PREFIX),
  );

  const recordQueries = useQueries({
    queries: schemas.map((s) => {
      const params = { personId: person.id, limit: RECORD_LIMIT };
      return {
        queryKey: queryKeys.data.records(s.id, params),
        queryFn: () => apiRequest<DataRecordsResponse>("GET", buildDataRecordsUrl(s.id, params)),
      };
    }),
  });

  if (schemasQuery.isLoading || (schemas.length > 0 && recordQueries.every((q) => q.isLoading))) {
    return (
      <div className="p-6 space-y-4" data-testid="person-more-loading">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  const sections = schemas
    .map((schema, i) => ({ schema, records: newestFirst(recordQueries[i]?.data?.records ?? []) }))
    .filter((s) => s.records.length > 0);

  if (sections.length === 0) {
    return (
      <EmptyState
        icon={Layers}
        title={`Nothing more for ${person.name}`}
        description="Datasets published for this person will appear here."
      />
    );
  }

  return (
    <div className="p-6 space-y-8" data-testid="person-more-content">
      {sections.map(({ schema, records }) => (
        <section key={schema.id} data-testid={`person-more-section-${schema.id}`}>
          <h2 className="text-xl font-semibold text-foreground">{schema.title}</h2>
          {schema.description && (
            <p className="mt-1 text-sm text-muted-foreground">{schema.description}</p>
          )}
          <div className="mt-3 space-y-3">
            {records.map((r) => (
              <RecordCard key={r.id} record={r} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
