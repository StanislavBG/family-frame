import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { EVENT_CATEGORIES, type EventPreferences, type FeedbackEntry } from "@shared/events";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  CATEGORY_META,
  useDeleteEventData,
  useEventPreferences,
  useFeedbackLog,
  useSaveEventPreferences,
} from "@/lib/events";
import {
  SettingsRow,
  SettingsSection,
  type AppSettingsPanelProps,
} from "@/components/app-settings-panels";

const BUDGETS: { value: EventPreferences["budget"]; label: string }[] = [
  { value: "free", label: "Free" },
  { value: "low", label: "Low" },
  { value: "any", label: "Any" },
];

const DAYS: { value: EventPreferences["preferredDays"][number]; label: string }[] = [
  { value: "weekday", label: "Weekdays" },
  { value: "weekend", label: "Weekends" },
];

const TIMES: { value: EventPreferences["preferredTimes"][number]; label: string }[] = [
  { value: "morning", label: "Morning" },
  { value: "afternoon", label: "Afternoon" },
  { value: "evening", label: "Evening" },
];

const SIGNAL_WORDS: Record<string, string> = {
  relevant: "Marked relevant",
  "not-relevant": "Marked not relevant",
  liked: "Liked it",
  disliked: "Didn't like it",
  "more-like-this": "Wants more like this",
  "less-like-this": "Wants less like this",
  "response:interested": "Said interested",
  "response:going": "Said going",
  "response:maybe": "Said maybe",
  "response:not-interested": "Said not interested",
  "response:dismissed": "Dismissed",
};

const FEEDBACK_SHOWN = 50;

const EMPTY_PREFS: EventPreferences = {
  likedCategories: [],
  avoidedCategories: [],
  maxDistanceKm: 30,
  budget: "any",
  preferredDays: [],
  preferredTimes: [],
  languages: [],
  notes: "",
};

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function ChoiceButton({
  active,
  onClick,
  children,
  testId,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  testId: string;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant={active ? "default" : "outline"}
      aria-pressed={active}
      onClick={onClick}
      data-testid={testId}
    >
      {children}
    </Button>
  );
}

export function EventsPreferencesPanel(_props: AppSettingsPanelProps) {
  const { toast } = useToast();
  const prefsQuery = useEventPreferences();
  const feedbackQuery = useFeedbackLog();
  const save = useSaveEventPreferences();
  const deleteData = useDeleteEventData();

  const [prefs, setPrefs] = useState<EventPreferences>(EMPTY_PREFS);
  const [languagesText, setLanguagesText] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (prefsQuery.data) {
      setPrefs({ ...EMPTY_PREFS, ...prefsQuery.data });
      setLanguagesText((prefsQuery.data.languages ?? []).join(", "));
    }
  }, [prefsQuery.data]);

  // The service may attach its learned summary lines to the preferences response.
  const learnedRaw = (prefsQuery.data as { learned?: unknown } | undefined)?.learned;
  const learned = Array.isArray(learnedRaw)
    ? learnedRaw.filter((l): l is string => typeof l === "string")
    : undefined;

  const cycleCategory = (cat: (typeof EVENT_CATEGORIES)[number]) => {
    setPrefs((p) => {
      if (p.likedCategories.includes(cat)) {
        return {
          ...p,
          likedCategories: toggle(p.likedCategories, cat),
          avoidedCategories: [...p.avoidedCategories, cat],
        };
      }
      if (p.avoidedCategories.includes(cat)) {
        return { ...p, avoidedCategories: toggle(p.avoidedCategories, cat) };
      }
      return { ...p, likedCategories: [...p.likedCategories, cat] };
    });
  };

  const onSave = () => {
    const languages = languagesText
      .split(",")
      .map((l) => l.trim())
      .filter(Boolean);
    save.mutate(
      { ...prefs, languages },
      {
        onSuccess: () => toast({ title: "Event preferences saved" }),
        onError: () =>
          toast({ title: "Could not save preferences", variant: "destructive" }),
      },
    );
  };

  const onDelete = () => {
    deleteData.mutate(undefined, {
      onSuccess: () => {
        setConfirmOpen(false);
        toast({ title: "Event data deleted" });
      },
      onError: () => toast({ title: "Could not delete event data", variant: "destructive" }),
    });
  };

  const feedback: FeedbackEntry[] = [...(feedbackQuery.data ?? [])]
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, FEEDBACK_SHOWN);

  return (
    <>
      <SettingsSection title="Kinds of events">
        <p className="text-xs text-muted-foreground">
          Tap once to like a category, twice to avoid it, a third time to clear it.
        </p>
        <div className="flex flex-wrap gap-2">
          {EVENT_CATEGORIES.map((cat) => {
            const liked = prefs.likedCategories.includes(cat);
            const avoided = prefs.avoidedCategories.includes(cat);
            return (
              <Button
                key={cat}
                type="button"
                size="sm"
                variant={liked ? "default" : "outline"}
                aria-pressed={liked || avoided}
                onClick={() => cycleCategory(cat)}
                className={cn(avoided && "line-through text-muted-foreground")}
                data-testid={`chip-category-${cat}`}
              >
                {CATEGORY_META[cat].label}
                {liked && <span className="sr-only"> (liked)</span>}
                {avoided && <span className="sr-only"> (avoided)</span>}
              </Button>
            );
          })}
        </div>
      </SettingsSection>

      <SettingsSection title="Distance and budget">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">Max distance</Label>
            <span className="text-sm text-muted-foreground" data-testid="text-max-distance">
              {Math.min(prefs.maxDistanceKm, 100)} km
            </span>
          </div>
          <Slider
            min={1}
            max={100}
            step={1}
            value={[Math.min(prefs.maxDistanceKm, 100)]}
            onValueChange={([v]) => setPrefs((p) => ({ ...p, maxDistanceKm: v }))}
            aria-label="Max distance in kilometres"
            data-testid="slider-max-distance"
          />
        </div>
        <SettingsRow label="Budget" description="Most you want to spend per event">
          <div className="flex gap-1">
            {BUDGETS.map((b) => (
              <ChoiceButton
                key={b.value}
                active={prefs.budget === b.value}
                onClick={() => setPrefs((p) => ({ ...p, budget: b.value }))}
                testId={`button-budget-${b.value}`}
              >
                {b.label}
              </ChoiceButton>
            ))}
          </div>
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title="Days and times">
        <div className="flex flex-wrap gap-2">
          {DAYS.map((d) => (
            <ChoiceButton
              key={d.value}
              active={prefs.preferredDays.includes(d.value)}
              onClick={() => setPrefs((p) => ({ ...p, preferredDays: toggle(p.preferredDays, d.value) }))}
              testId={`button-day-${d.value}`}
            >
              {d.label}
            </ChoiceButton>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {TIMES.map((t) => (
            <ChoiceButton
              key={t.value}
              active={prefs.preferredTimes.includes(t.value)}
              onClick={() => setPrefs((p) => ({ ...p, preferredTimes: toggle(p.preferredTimes, t.value) }))}
              testId={`button-time-${t.value}`}
            >
              {t.label}
            </ChoiceButton>
          ))}
        </div>
      </SettingsSection>

      <SettingsSection title="Languages and notes">
        <div className="space-y-2">
          <Label htmlFor="events-languages" className="text-sm font-medium">
            Languages
          </Label>
          <Input
            id="events-languages"
            value={languagesText}
            onChange={(e) => setLanguagesText(e.target.value)}
            placeholder="en, bg"
            data-testid="input-event-languages"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="events-notes" className="text-sm font-medium">
            Notes for the event finder
          </Label>
          <Textarea
            id="events-notes"
            value={prefs.notes}
            maxLength={1000}
            rows={4}
            onChange={(e) => setPrefs((p) => ({ ...p, notes: e.target.value }))}
            placeholder="Anything else we should know, e.g. stroller friendly, quiet places"
            data-testid="textarea-event-notes"
          />
          <div className="text-right text-xs text-muted-foreground">{prefs.notes.length}/1000</div>
        </div>
        <Button
          onClick={onSave}
          disabled={save.isPending || prefsQuery.isLoading}
          data-testid="button-save-event-preferences"
        >
          {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save preferences
        </Button>
      </SettingsSection>

      {learned !== undefined && (
        <SettingsSection title="What we've learned">
          {learned.length === 0 ? (
            <p className="text-sm text-muted-foreground" data-testid="text-learned-empty">
              Rate a few events and we will learn what you like
            </p>
          ) : (
            <ul className="list-disc space-y-1 pl-5 text-sm" data-testid="list-learned">
              {learned.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          )}
        </SettingsSection>
      )}

      <SettingsSection title="Feedback history">
        {feedback.length === 0 ? (
          <p className="text-sm text-muted-foreground" data-testid="text-feedback-empty">
            No feedback yet
          </p>
        ) : (
          <ul className="divide-y rounded-md border" data-testid="list-feedback">
            {feedback.map((f) => (
              <li key={f.id} className="flex items-start justify-between gap-3 p-3 text-sm">
                <div className="min-w-0">
                  <div className="truncate font-medium">{f.snapshot.title}</div>
                  <div className="text-xs text-muted-foreground">{formatDate(f.at)}</div>
                </div>
                <div className="flex-shrink-0 text-right text-xs">{SIGNAL_WORDS[f.signal] ?? f.signal}</div>
              </li>
            ))}
          </ul>
        )}
      </SettingsSection>

      <SettingsSection title="Your data">
        <p className="text-xs text-muted-foreground">
          Deletes your event recommendations, preferences and feedback. Calendar entries stay, and
          sharing stays as set in Settings.
        </p>
        <Button
          variant="destructive"
          onClick={() => setConfirmOpen(true)}
          data-testid="button-delete-event-data"
        >
          Delete my event data
        </Button>
      </SettingsSection>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete all your event data?</AlertDialogTitle>
            <AlertDialogDescription>
              This erases your event recommendations, preferences and feedback history. Events
              already on your calendar stay there, and sharing stays as set in Settings.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-event-data">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                onDelete();
              }}
              disabled={deleteData.isPending}
              data-testid="button-confirm-delete-event-data"
            >
              {deleteData.isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
