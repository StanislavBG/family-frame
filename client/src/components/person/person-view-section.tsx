import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Inbox } from "lucide-react";
import type { Person } from "@shared/schema";
import type { PersonView, PersonViewBlock } from "@shared/person-views";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { SeriesLineChart } from "@/components/time-series/series-chart";
import { mediaUrl, useDataRecords, useMediaList } from "@/lib/agent-data";
import { useSeriesPoints } from "@/lib/time-series";
import { buildChartPoints, buildListModel, buildMetricsModel } from "@/lib/person-view";
import { cn } from "@/lib/utils";
import { LINE, MetricTile, MUTED, SATCHEL_TONES, SectionLabel, SERIF, SURFACE } from "./satchel";

type BlockStatus = "loading" | "empty" | "ready";
type ReportStatus = (status: BlockStatus) => void;

const DEFAULT_PHOTO_LIMIT = 12;
const DEFAULT_CHART_LIMIT = 90;

function useReportStatus(report: ReportStatus, status: BlockStatus) {
  useEffect(() => {
    report(status);
  }, [report, status]);
}

function BlockCard({ title, children, testId }: { title?: string; children: React.ReactNode; testId: string }) {
  return (
    <section className={cn("rounded-2xl border p-5", SURFACE, LINE)} data-testid={testId}>
      {title && <SectionLabel className="mb-3">{title}</SectionLabel>}
      {children}
    </section>
  );
}

function BlockSkeleton() {
  return <Skeleton className="h-24 w-full rounded-2xl" data-testid="person-view-block-loading" />;
}

function statusOf(isLoading: boolean, hasData: boolean): BlockStatus {
  return isLoading ? "loading" : hasData ? "ready" : "empty";
}

function MetricsBlock({
  block,
  person,
  report,
}: {
  block: Extract<PersonViewBlock, { type: "metrics" }>;
  person: Person;
  report: ReportStatus;
}) {
  const { data, isLoading } = useDataRecords(block.source.schemaId, { personId: person.id, limit: 1 });
  const items = useMemo(() => buildMetricsModel(block, data?.records ?? []), [block, data]);
  const status = statusOf(isLoading, items.length > 0);
  useReportStatus(report, status);
  if (status === "loading") return <BlockSkeleton />;
  if (status === "empty") return null;
  return (
    <BlockCard title={block.title} testId="person-view-metrics">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {items.map((m, i) => (
          <MetricTile key={`${m.label}-${i}`} tone={m.tone} label={m.label} value={m.value} />
        ))}
      </div>
    </BlockCard>
  );
}

function ListBlock({
  block,
  person,
  report,
}: {
  block: Extract<PersonViewBlock, { type: "list" }>;
  person: Person;
  report: ReportStatus;
}) {
  const { data, isLoading } = useDataRecords(block.source.schemaId, {
    personId: person.id,
    limit: block.limit ?? 10,
    ...(block.sortField ? { sortField: block.sortField, sortDir: block.sortDir === "asc" ? "asc" : "desc" } : {}),
  });
  const items = useMemo(() => buildListModel(block, data?.records ?? []), [block, data]);
  const status = statusOf(isLoading, items.length > 0);
  useReportStatus(report, status);
  if (status === "loading") return <BlockSkeleton />;
  if (status === "empty") return null;
  return (
    <BlockCard title={block.title} testId="person-view-list">
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {items.map((item) => {
          const rowClass = cn("flex items-baseline justify-between gap-4 rounded-xl px-3 py-2", SATCHEL_TONES.stone.bg);
          const body = (
            <>
              <div className="min-w-0">
                <div className={cn("truncate text-base font-semibold", SATCHEL_TONES.stone.fg)}>{item.title}</div>
                {item.subtitle && <div className={cn("truncate text-sm", MUTED)}>{item.subtitle}</div>}
              </div>
              {item.date && <span className={cn("flex-none text-sm", MUTED)}>{item.date}</span>}
            </>
          );
          if (!item.url) {
            return (
              <li key={item.id} className={rowClass}>
                {body}
              </li>
            );
          }
          return (
            <li key={item.id}>
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="person-view-list-link"
                className={cn(rowClass, "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring")}
              >
                {body}
                <ExternalLink className={cn("h-4 w-4 flex-none self-center", MUTED)} aria-hidden="true" />
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            </li>
          );
        })}
      </ul>
    </BlockCard>
  );
}

function ChartFrame({
  block,
  points,
  isLoading,
  report,
}: {
  block: Extract<PersonViewBlock, { type: "chart" }>;
  points: ReturnType<typeof buildChartPoints>;
  isLoading: boolean;
  report: ReportStatus;
}) {
  const status = statusOf(isLoading, points.length > 0);
  useReportStatus(report, status);
  if (status === "loading") return <BlockSkeleton />;
  if (status === "empty") return null;
  return (
    <BlockCard title={block.title} testId="person-view-chart">
      <SeriesLineChart points={points} unit={block.unit ?? null} color="#a83818" />
    </BlockCard>
  );
}

function DatasetChartBlock({
  block,
  person,
  report,
}: {
  block: Extract<PersonViewBlock, { type: "chart" }>;
  person: Person;
  report: ReportStatus;
}) {
  const schemaId = "schemaId" in block.source ? block.source.schemaId : "";
  const { data, isLoading } = useDataRecords(schemaId, {
    personId: person.id,
    limit: block.limit ?? DEFAULT_CHART_LIMIT,
  });
  const points = useMemo(() => buildChartPoints(block, data?.records ?? []), [block, data]);
  return <ChartFrame block={block} points={points} isLoading={isLoading} report={report} />;
}

function SeriesChartBlock({
  block,
  seriesId,
  report,
}: {
  block: Extract<PersonViewBlock, { type: "chart" }>;
  seriesId: string;
  report: ReportStatus;
}) {
  const { data, isLoading } = useSeriesPoints(seriesId, { limit: block.limit ?? DEFAULT_CHART_LIMIT });
  const points = useMemo(() => data ?? [], [data]);
  return <ChartFrame block={block} points={points} isLoading={isLoading} report={report} />;
}

function ChartBlock({
  block,
  person,
  report,
}: {
  block: Extract<PersonViewBlock, { type: "chart" }>;
  person: Person;
  report: ReportStatus;
}) {
  if ("seriesId" in block.source) {
    return <SeriesChartBlock block={block} seriesId={block.source.seriesId} report={report} />;
  }
  return <DatasetChartBlock block={block} person={person} report={report} />;
}

function PhotosBlock({
  block,
  person,
  report,
}: {
  block: Extract<PersonViewBlock, { type: "photos" }>;
  person: Person;
  report: ReportStatus;
}) {
  const { data, isLoading } = useMediaList({
    personId: person.id,
    kind: "image",
    tag: block.tag,
    limit: block.limit ?? DEFAULT_PHOTO_LIMIT,
  });
  const items = data?.items ?? [];
  const status = statusOf(isLoading, items.length > 0);
  useReportStatus(report, status);
  if (status === "loading") return <BlockSkeleton />;
  if (status === "empty") return null;
  return (
    <BlockCard title={block.title} testId="person-view-photos">
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
        {items.map((item) => (
          <div key={item.id} className="aspect-square overflow-hidden rounded-xl bg-muted">
            <img src={mediaUrl(item.id)} alt={item.filename} loading="lazy" className="h-full w-full object-cover" />
          </div>
        ))}
      </div>
    </BlockCard>
  );
}

function TextBlock({ block }: { block: Extract<PersonViewBlock, { type: "text" }> }) {
  const paragraphs = block.text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  if (paragraphs.length === 0) return null;
  return (
    <BlockCard title={block.title} testId="person-view-text">
      <div className="flex flex-col gap-3">
        {paragraphs.map((p, i) => (
          <p key={i} className="m-0 whitespace-pre-line text-base leading-relaxed">
            {p}
          </p>
        ))}
      </div>
    </BlockCard>
  );
}

export function PersonViewSection({ person, view }: { person: Person; view: PersonView & { id: string } }) {
  const [statuses, setStatuses] = useState<Record<number, BlockStatus>>({});

  const reporters = useMemo(
    () =>
      view.blocks.map(
        (_, i): ReportStatus =>
          (status) =>
            setStatuses((prev) => (prev[i] === status ? prev : { ...prev, [i]: status })),
      ),
    [view.blocks],
  );

  const hasText = view.blocks.some((b) => b.type === "text");
  const dataIndexes = view.blocks.flatMap((b, i) => (b.type === "text" ? [] : [i]));
  const allEmpty = !hasText && dataIndexes.every((i) => statuses[i] === "empty");

  return (
    <div className="flex flex-col gap-5 px-8 pb-8 pt-6" data-testid={`person-view-${view.id}`}>
      <h1 className={cn(SERIF, "m-0 text-4xl font-bold leading-tight")}>{view.title}</h1>
      {view.blocks.map((block, i) => {
        switch (block.type) {
          case "metrics":
            return <MetricsBlock key={i} block={block} person={person} report={reporters[i]} />;
          case "list":
            return <ListBlock key={i} block={block} person={person} report={reporters[i]} />;
          case "chart":
            return <ChartBlock key={i} block={block} person={person} report={reporters[i]} />;
          case "photos":
            return <PhotosBlock key={i} block={block} person={person} report={reporters[i]} />;
          case "text":
            return <TextBlock key={i} block={block} />;
        }
      })}
      {allEmpty && (
        <EmptyState
          icon={Inbox}
          title="Nothing here yet"
          description={`The publisher has not sent data for ${person.name} yet.`}
        />
      )}
    </div>
  );
}
