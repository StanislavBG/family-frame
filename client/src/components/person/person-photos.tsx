import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, ImageOff } from "lucide-react";
import type { Person } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { mediaUrl, useMediaList, type MediaMeta } from "@/lib/agent-data";
import { getRelativeDayLabel } from "@/lib/format";

const PAGE_SIZE = 60;

function dayKey(createdAt: string): string {
  const d = new Date(createdAt);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export default function PersonPhotos({ person }: { person: Person }) {
  const [offset, setOffset] = useState(0);
  const [items, setItems] = useState<MediaMeta[]>([]);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  // A different person starts over from the first page.
  useEffect(() => {
    setOffset(0);
    setItems([]);
    setViewerIndex(null);
  }, [person.id]);

  const { data, isLoading, isFetching, isError } = useMediaList({
    personId: person.id,
    kind: "image",
    limit: PAGE_SIZE,
    offset,
  });

  useEffect(() => {
    if (!data) return;
    setItems((prev) => {
      const seen = new Set(prev.map((m) => m.id));
      const fresh = data.items.filter((m) => !seen.has(m.id));
      return fresh.length ? [...prev, ...fresh] : prev;
    });
  }, [data]);

  const total = data?.total ?? items.length;

  const groups = useMemo(() => {
    const map = new Map<string, { label: string; entries: { item: MediaMeta; index: number }[] }>();
    items.forEach((item, index) => {
      const key = dayKey(item.createdAt);
      let group = map.get(key);
      if (!group) {
        group = { label: getRelativeDayLabel(new Date(item.createdAt)), entries: [] };
        map.set(key, group);
      }
      group.entries.push({ item, index });
    });
    return Array.from(map.entries());
  }, [items]);

  const hasPrev = viewerIndex !== null && viewerIndex > 0;
  const hasNext = viewerIndex !== null && viewerIndex < items.length - 1;
  const goPrev = () => setViewerIndex((i) => (i !== null && i > 0 ? i - 1 : i));
  const goNext = () => setViewerIndex((i) => (i !== null && i < items.length - 1 ? i + 1 : i));

  useEffect(() => {
    if (viewerIndex === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") goPrev();
      else if (e.key === "ArrowRight") goNext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [viewerIndex, items.length]);

  if (isLoading && items.length === 0) {
    return (
      <div className="p-6 grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2" data-testid="person-photos-loading">
        {Array.from({ length: 12 }, (_, i) => (
          <Skeleton key={i} className="aspect-square w-full" />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={ImageOff}
        title="No photos yet"
        description={
          isError
            ? `Could not load photos for ${person.name}.`
            : `Photos published for ${person.name} will appear here.`
        }
      />
    );
  }

  const current = viewerIndex !== null ? items[viewerIndex] : null;

  return (
    <div className="p-6 space-y-6" data-testid="person-photos-content">
      <p className="text-sm text-muted-foreground" data-testid="person-photos-count">
        {total} {total === 1 ? "photo" : "photos"}
      </p>

      {groups.map(([key, group]) => (
        <section key={key} aria-label={group.label}>
          <h3 className="text-base font-semibold text-foreground mb-2">{group.label}</h3>
          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">
            {group.entries.map(({ item, index }) => (
              <button
                key={item.id}
                type="button"
                aria-label={`Open ${item.filename}`}
                onClick={() => setViewerIndex(index)}
                className="aspect-square overflow-hidden rounded-md bg-muted hover-elevate focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                data-testid={`person-photo-${item.id}`}
              >
                <img
                  src={mediaUrl(item.id)}
                  alt={item.filename}
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              </button>
            ))}
          </div>
        </section>
      ))}

      {items.length < total && (
        <div className="flex justify-center">
          <Button
            variant="outline"
            aria-label="Load more photos"
            disabled={isFetching}
            onClick={() => setOffset(items.length)}
            data-testid="person-photos-load-more"
          >
            {isFetching ? "Loading..." : "Load more"}
          </Button>
        </div>
      )}

      <Dialog open={current !== null} onOpenChange={(open) => !open && setViewerIndex(null)}>
        <DialogContent className="max-w-[100vw] w-screen h-screen sm:max-w-[100vw] rounded-none border-0 bg-black/95 p-0 flex items-center justify-center">
          {current && (
            <>
              <DialogTitle className="sr-only">{current.filename}</DialogTitle>
              <DialogDescription className="sr-only">
                Photo {viewerIndex! + 1} of {items.length}
              </DialogDescription>
              <img
                src={mediaUrl(current.id)}
                alt={current.filename}
                className="max-h-full max-w-full object-contain"
                data-testid="person-photo-viewer-image"
              />
              <Button
                variant="secondary"
                size="icon"
                aria-label="Previous photo"
                disabled={!hasPrev}
                onClick={goPrev}
                className="absolute left-4 top-1/2 -translate-y-1/2"
              >
                <ChevronLeft className="h-6 w-6" />
              </Button>
              <Button
                variant="secondary"
                size="icon"
                aria-label="Next photo"
                disabled={!hasNext}
                onClick={goNext}
                className="absolute right-4 top-1/2 -translate-y-1/2"
              >
                <ChevronRight className="h-6 w-6" />
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
