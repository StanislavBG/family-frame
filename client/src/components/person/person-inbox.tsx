import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ExternalLink, Inbox } from "lucide-react";
import type { Person } from "@shared/schema";
import type { EmailSummary } from "@shared/agent-data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/empty-state";
import { cn } from "@/lib/utils";
import { LINE, SERIF, SURFACE } from "./satchel";
import { formatRelativeTime } from "@/lib/format";
import { mediaUrl, useMailMessage, useMailMessages, useMarkMailRead } from "@/lib/agent-data";

const PAGE_SIZE = 50;
// markEmailsReadSchema accepts at most 200 ids per request.
const MARK_CHUNK = 200;

function senderLabel(from: EmailSummary["from"]): string {
  return from.name?.trim() || from.email;
}

function MailRow({
  email,
  selected,
  onSelect,
}: {
  email: EmailSummary;
  selected: boolean;
  onSelect: () => void;
}) {
  const unread = !email.readAt;
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-current={selected}
        data-testid={`mail-row-${email.id}`}
        className={cn(
          "flex w-full gap-3 rounded-[18px] border-2 px-4 py-3 text-left",
          selected ? cn(SURFACE, "border-[#a83818] dark:border-[#e07a52]") : "border-transparent hover:bg-[#fffaf0] dark:hover:bg-card",
        )}
      >
        <span
          className={cn("mt-2 h-2.5 w-2.5 shrink-0 rounded-full", unread ? "bg-[#2e5a3e] dark:bg-[#8fc49d]" : "bg-transparent")}
          aria-hidden
        />
        {unread && <span className="sr-only">Unread</span>}
        <span className="min-w-0 flex-1">
          <span className={cn("block line-clamp-2 text-base leading-snug", unread ? "font-bold" : "font-medium")}>
            {email.subject}
          </span>
          <span className="block truncate text-sm text-muted-foreground">
            {senderLabel(email.from)} · {formatRelativeTime(email.receivedAt)}
          </span>
        </span>
      </button>
    </li>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-3 p-4" data-testid="mail-list-loading">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-16 w-full" />
      ))}
    </div>
  );
}

interface MailPageProps {
  personId: string;
  q: string;
  unreadOnly: boolean;
  before: string | undefined;
  isLast: boolean;
  selectedId: string;
  onSelect: (id: string) => void;
  onLoaded: (key: string, emails: EmailSummary[]) => void;
  onLoadMore: (before: string) => void;
}

// One page of the list per `before` cursor; hooks cannot be called in a loop.
function MailPage({
  personId,
  q,
  unreadOnly,
  before,
  isLast,
  selectedId,
  onSelect,
  onLoaded,
  onLoadMore,
}: MailPageProps) {
  const { data, isLoading, isError } = useMailMessages({
    personId,
    limit: PAGE_SIZE,
    before,
    q: q || undefined,
    unreadOnly,
  });
  const key = before ?? "";
  const emails = data?.emails;

  useEffect(() => {
    if (emails) onLoaded(key, emails);
  }, [emails, key, onLoaded]);

  if (isLoading) return <ListSkeleton />;
  if (isError) {
    return <p className="p-4 text-sm text-destructive">Could not load messages.</p>;
  }
  if (!emails) return null;

  if (emails.length === 0 && !before) {
    return (
      <EmptyState
        icon={Inbox}
        title="No messages"
        description={
          q || unreadOnly ? "No messages match your filters." : "Nothing in this inbox yet."
        }
      />
    );
  }

  return (
    <>
      <ul>
        {emails.map((email) => (
          <MailRow
            key={email.id}
            email={email}
            selected={email.id === selectedId}
            onSelect={() => onSelect(email.id)}
          />
        ))}
      </ul>
      {isLast && data?.nextBefore && (
        <div className="p-3 text-center">
          <Button variant="outline" onClick={() => onLoadMore(data.nextBefore!)} data-testid="mail-load-more">
            Load more
          </Button>
        </div>
      )}
    </>
  );
}

function MailDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const { data: email, isLoading, isError } = useMailMessage(id);
  const markRead = useMarkMailRead();
  const marked = useRef(new Set<string>());

  // Mark an unread email read once, when it is first opened.
  useEffect(() => {
    if (email && !email.readAt && !marked.current.has(email.id)) {
      marked.current.add(email.id);
      markRead.mutate({ ids: [email.id] });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email]);

  return (
    <div className="flex h-full flex-col" data-testid="mail-detail">
      <div className="border-b p-2 lg:hidden">
        <Button variant="ghost" size="sm" onClick={onBack} data-testid="mail-back">
          <ArrowLeft className="mr-1 h-4 w-4" /> Back
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto p-5">
        {isLoading && (
          <div className="space-y-3">
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-40 w-full" />
          </div>
        )}
        {isError && <p className="text-sm text-destructive">Could not load this message.</p>}
        {email && (
          <article className="space-y-4">
            <header className="space-y-1">
              <h2 className={cn(SERIF, "break-words text-3xl font-bold leading-tight")}>{email.subject}</h2>
              <p className="text-sm text-muted-foreground">
                From {senderLabel(email.from)}
                {email.from.name ? ` <${email.from.email}>` : ""}
              </p>
              <p className="text-sm text-muted-foreground">
                {new Date(email.receivedAt).toLocaleString()}
              </p>
              {email.sourceUrl && (
                <a
                  href={email.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-primary underline"
                >
                  Open source <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
            </header>
            {/* Untrusted content: rendered as a React text node only. */}
            <div className="whitespace-pre-wrap break-words leading-relaxed" data-testid="mail-text">
              {email.text}
            </div>
            {email.mediaIds.length > 0 && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {email.mediaIds.map((mid) => (
                  <img
                    key={mid}
                    src={mediaUrl(mid)}
                    alt=""
                    loading="lazy"
                    className="w-full rounded-md border object-contain"
                  />
                ))}
              </div>
            )}
          </article>
        )}
      </div>
    </div>
  );
}

export default function PersonInbox({ person }: { person: Person }) {
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [cursors, setCursors] = useState<string[]>([]);
  const [loaded, setLoaded] = useState<Record<string, EmailSummary[]>>({});
  const markAll = useMarkMailRead();

  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Any change of person or filter restarts paging.
  useEffect(() => {
    setCursors([]);
    setLoaded({});
    setSelectedId("");
  }, [person.id, q, unreadOnly]);

  const onLoaded = (key: string, emails: EmailSummary[]) =>
    setLoaded((prev) => (prev[key] === emails ? prev : { ...prev, [key]: emails }));

  // Only the listed (this person's) unread ids; never "all".
  const unreadIds = Object.values(loaded)
    .flat()
    .filter((e) => !e.readAt)
    .map((e) => e.id);

  const handleMarkAll = () => {
    for (let i = 0; i < unreadIds.length; i += MARK_CHUNK) {
      markAll.mutate({ ids: unreadIds.slice(i, i + MARK_CHUNK) });
    }
  };

  const pages: Array<string | undefined> = [undefined, ...cursors];

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 px-8 pb-6 pt-6" data-testid="person-inbox-content">
      <header>
        <div className="text-sm font-semibold text-[#3d6a8f] dark:text-[#8fb4d4]">
          {unreadIds.length > 0 ? `${unreadIds.length} to check` : "All checked"}
        </div>
        <h1 className={cn(SERIF, "mt-1 text-4xl font-bold leading-tight")}>Inbox</h1>
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row">
        <section
          className={cn(
            "min-h-0 flex-col lg:flex lg:w-[24rem] lg:shrink-0",
            selectedId ? "hidden" : "flex",
          )}
        >
          <div className="space-y-3 pb-3">
            <Input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search mail"
              aria-label="Search mail"
              data-testid="mail-search"
            />
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Switch id="mail-unread-only" checked={unreadOnly} onCheckedChange={setUnreadOnly} />
                <Label htmlFor="mail-unread-only">Unread only</Label>
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={unreadIds.length === 0 || markAll.isPending}
                onClick={handleMarkAll}
                data-testid="mail-mark-all-read"
              >
                Mark all read
              </Button>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-1">
            {pages.map((before, i) => (
              <MailPage
                key={before ?? "first"}
                personId={person.id}
                q={q}
                unreadOnly={unreadOnly}
                before={before}
                isLast={i === pages.length - 1}
                selectedId={selectedId}
                onSelect={setSelectedId}
                onLoaded={onLoaded}
                onLoadMore={(b) => setCursors((c) => (c.includes(b) ? c : [...c, b]))}
              />
            ))}
          </div>
        </section>
        <section
          className={cn(
            "min-h-0 min-w-0 flex-1 overflow-hidden rounded-3xl border lg:block",
            SURFACE,
            LINE,
            selectedId ? "block" : "hidden",
          )}
        >
          {selectedId ? (
            <MailDetail key={selectedId} id={selectedId} onBack={() => setSelectedId("")} />
          ) : (
            <div className="flex h-full items-center justify-center p-8 text-muted-foreground">
              Select a message to read it.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
