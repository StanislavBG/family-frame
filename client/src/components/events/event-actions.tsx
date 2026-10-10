import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarPlus, Check, Pencil } from "lucide-react";
import type { FeedbackSignal, HouseholdResponse } from "@shared/events";
import { EVENTS_LIMITS } from "@shared/events";
import type { Person } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { SATCHEL_TONES, SectionLabel, LINE, MUTED, SURFACE } from "@/components/person/satchel";
import { cn } from "@/lib/utils";
import { formatWhen, useRespond, useSendFeedback, useUpdatePlan, type EventItem } from "@/lib/events";

type Visibility = "Shared" | "Private";
type ChoiceResponse = "going" | "interested";

const RESPONSE_BUTTONS: { value: "going" | "interested" | "not-interested"; label: string; tone: keyof typeof SATCHEL_TONES }[] = [
  { value: "going", label: "Going", tone: "leaf" },
  { value: "interested", label: "Interested", tone: "sun" },
  { value: "not-interested", label: "Not for us", tone: "stone" },
];

const FEEDBACK_AXES: {
  key: "relevance" | "sentiment" | "steer";
  options: { signal: FeedbackSignal; value: string; label: string }[];
}[] = [
  {
    key: "relevance",
    options: [
      { signal: "relevant", value: "relevant", label: "Relevant" },
      { signal: "not-relevant", value: "not-relevant", label: "Not relevant" },
    ],
  },
  {
    key: "sentiment",
    options: [
      { signal: "liked", value: "liked", label: "Liked" },
      { signal: "disliked", value: "disliked", label: "Didn't like" },
    ],
  },
  {
    key: "steer",
    options: [
      { signal: "more-like-this", value: "more-like-this", label: "More like this" },
      { signal: "less-like-this", value: "less-like-this", label: "Less like this" },
    ],
  },
];

const BIG_BUTTON = "min-h-12 text-base font-semibold";

function isPast(item: EventItem): boolean {
  const { schedule } = item.event;
  const stamps = [schedule.start, schedule.end, ...schedule.occurrences.flatMap((o) => [o.start, o.end])]
    .filter((s): s is string => !!s)
    .map((s) => Date.parse(s))
    .filter((n) => !Number.isNaN(n));
  return stamps.length > 0 && Math.max(...stamps) < Date.now();
}

function VisibilityChoice({
  value,
  onChange,
  idPrefix,
}: {
  value: Visibility;
  onChange: (v: Visibility) => void;
  idPrefix: string;
}) {
  const options: { v: Visibility; label: string }[] = [
    { v: "Private", label: "Private (just us)" },
    { v: "Shared", label: "Shared (connected homes see it)" },
  ];
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Add to calendar visibility">
      {options.map((o) => (
        <Button
          key={o.v}
          type="button"
          role="radio"
          aria-checked={value === o.v}
          aria-label={o.label}
          variant={value === o.v ? "default" : "outline"}
          className={BIG_BUTTON}
          onClick={() => onChange(o.v)}
          data-testid={`${idPrefix}-${o.v.toLowerCase()}`}
        >
          {value === o.v && <Check className="mr-1 h-4 w-4" aria-hidden />}
          {o.label}
        </Button>
      ))}
    </div>
  );
}

function ChangePlanDialog({ item, open, onOpenChange }: { item: EventItem; open: boolean; onOpenChange: (o: boolean) => void }) {
  const updatePlan = useUpdatePlan(item.eventId);
  const { data: people = [] } = useQuery<Person[]>({ queryKey: ["/api/people/list"], enabled: open });
  const { schedule } = item.event;
  const dates = Array.from(new Set([schedule.start, ...schedule.occurrences.map((o) => o.start)]));
  const [occurrence, setOccurrence] = useState(item.plan?.occurrenceStart ?? schedule.start);
  const [who, setWho] = useState<string[]>(item.plan?.people ?? []);
  const [notes, setNotes] = useState(item.plan?.notes ?? "");
  const [visibility, setVisibility] = useState<Visibility>(item.calendar?.visibility ?? "Private");

  const toggle = (id: string) => setWho((cur) => (cur.includes(id) ? cur.filter((p) => p !== id) : [...cur, id]));

  const save = () =>
    updatePlan.mutate(
      { occurrenceStart: occurrence, people: who, notes, visibility },
      { onSuccess: () => onOpenChange(false) },
    );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="dialog-change-plan">
        <DialogHeader>
          <DialogTitle>Change plan</DialogTitle>
          <DialogDescription>Pick the date, who is going and how it shows on the calendar.</DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] space-y-4 overflow-y-auto">
          <div className="space-y-2">
            <SectionLabel>Which date</SectionLabel>
            <div className="flex flex-col gap-2" role="radiogroup" aria-label="Which date">
              {dates.map((d) => {
                const label = formatWhen({ ...schedule, start: d, end: undefined, occurrences: [] });
                return (
                  <Button
                    key={d}
                    type="button"
                    role="radio"
                    aria-checked={occurrence === d}
                    aria-label={`Date ${label}`}
                    variant={occurrence === d ? "default" : "outline"}
                    className={cn(BIG_BUTTON, "justify-start")}
                    onClick={() => setOccurrence(d)}
                    data-testid={`button-plan-date-${d}`}
                  >
                    {label}
                  </Button>
                );
              })}
            </div>
          </div>
          {people.length > 0 && (
            <div className="space-y-2">
              <SectionLabel>Who is going</SectionLabel>
              <div className="flex flex-wrap gap-2">
                {people.map((p) => {
                  const on = who.includes(p.id);
                  return (
                    <Button
                      key={p.id}
                      type="button"
                      aria-pressed={on}
                      aria-label={`${p.name} is ${on ? "" : "not "}going`}
                      variant={on ? "default" : "outline"}
                      className={BIG_BUTTON}
                      onClick={() => toggle(p.id)}
                      data-testid={`button-plan-person-${p.id}`}
                    >
                      {on && <Check className="mr-1 h-4 w-4" aria-hidden />}
                      {p.name}
                    </Button>
                  );
                })}
              </div>
            </div>
          )}
          <div className="space-y-2">
            <SectionLabel>Notes</SectionLabel>
            <Textarea
              value={notes}
              maxLength={500}
              onChange={(e) => setNotes(e.target.value)}
              aria-label="Plan notes"
              placeholder="Meeting point, what to bring…"
              data-testid="input-plan-notes"
            />
          </div>
          <div className="space-y-2">
            <SectionLabel>On the calendar</SectionLabel>
            <VisibilityChoice value={visibility} onChange={setVisibility} idPrefix="button-plan-visibility" />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" className={BIG_BUTTON} onClick={() => onOpenChange(false)} aria-label="Cancel" data-testid="button-plan-cancel">
            Cancel
          </Button>
          <Button type="button" className={BIG_BUTTON} onClick={save} disabled={updatePlan.isPending} aria-label="Save plan" data-testid="button-plan-save">
            Save plan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function EventActions({ item }: { item: EventItem }) {
  const respond = useRespond(item.eventId);
  const feedback = useSendFeedback(item.eventId);
  const [choosing, setChoosing] = useState<ChoiceResponse | null>(null);
  const [calendarVisibility, setCalendarVisibility] = useState<Visibility>("Private");
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");
  const [planOpen, setPlanOpen] = useState(false);
  const past = isPast(item);
  const current: HouseholdResponse = item.response;

  const onResponseTap = (value: (typeof RESPONSE_BUTTONS)[number]["value"]) => {
    if (value === "not-interested") {
      setChoosing(null);
      setDeclining((d) => !d);
      return;
    }
    setDeclining(false);
    setCalendarVisibility(item.calendar?.visibility ?? "Private");
    setChoosing((c) => (c === value ? null : value));
  };

  const confirmCalendar = (addToCalendar: boolean) => {
    if (!choosing) return;
    respond.mutate(
      addToCalendar
        ? { response: choosing, addToCalendar: true, visibility: calendarVisibility }
        : { response: choosing, addToCalendar: false },
      { onSuccess: () => setChoosing(null) },
    );
  };

  const confirmDecline = () => {
    const trimmed = reason.trim();
    respond.mutate(
      { response: "not-interested", ...(trimmed ? { reason: trimmed } : {}) },
      {
        onSuccess: () => {
          setDeclining(false);
          setReason("");
        },
      },
    );
  };

  const sendSignal = (signal: FeedbackSignal) => feedback.mutate({ signal });

  return (
    <div className="space-y-4" data-testid={`event-actions-${item.eventId}`}>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3" role="group" aria-label="Respond to this event">
        {RESPONSE_BUTTONS.map(({ value, label, tone }) => {
          const selected = current === value;
          const t = SATCHEL_TONES[tone];
          return (
            <Button
              key={value}
              type="button"
              variant="outline"
              aria-pressed={selected}
              aria-label={selected ? `${label} (selected)` : label}
              disabled={respond.isPending}
              className={cn(BIG_BUTTON, "min-h-12", selected && cn(t.bg, t.fg, "border-current"))}
              onClick={() => onResponseTap(value)}
              data-testid={`button-event-${value}`}
            >
              {selected && <Check className="mr-1 h-4 w-4" aria-hidden />}
              {label}
            </Button>
          );
        })}
      </div>

      {choosing && (
        <div className={cn("space-y-3 rounded-xl border p-3", SURFACE, LINE)} data-testid="panel-add-to-calendar">
          <SectionLabel>Add to calendar</SectionLabel>
          <VisibilityChoice value={calendarVisibility} onChange={setCalendarVisibility} idPrefix="button-calendar" />
          <div className="flex flex-wrap gap-2">
            <Button type="button" className={BIG_BUTTON} disabled={respond.isPending} onClick={() => confirmCalendar(true)} aria-label={`Add to calendar as ${calendarVisibility}`} data-testid="button-calendar-confirm">
              <CalendarPlus className="mr-1 h-4 w-4" aria-hidden />
              Add to calendar
            </Button>
            <Button type="button" variant="outline" className={BIG_BUTTON} disabled={respond.isPending} onClick={() => confirmCalendar(false)} aria-label="Save without adding to calendar" data-testid="button-calendar-skip">
              Not on calendar
            </Button>
          </div>
        </div>
      )}

      {declining && (
        <div className={cn("space-y-3 rounded-xl border p-3", SURFACE, LINE)} data-testid="panel-decline-reason">
          <SectionLabel>Why not? (optional)</SectionLabel>
          <Textarea
            value={reason}
            maxLength={EVENTS_LIMITS.maxFeedbackReason}
            onChange={(e) => setReason(e.target.value)}
            aria-label="Reason this event is not for us"
            placeholder="Too far, too expensive, not our thing…"
            data-testid="input-decline-reason"
          />
          <div className={cn("text-xs", MUTED)}>
            {reason.length}/{EVENTS_LIMITS.maxFeedbackReason}
          </div>
          <Button type="button" className={BIG_BUTTON} disabled={respond.isPending} onClick={confirmDecline} aria-label="Confirm not for us" data-testid="button-decline-confirm">
            Not for us
          </Button>
        </div>
      )}

      {item.calendar && (
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn("text-sm font-semibold", SATCHEL_TONES.sky.fg)} data-testid="text-calendar-visibility">
            On calendar · {item.calendar.visibility}
          </span>
          <Button type="button" variant="outline" className={BIG_BUTTON} onClick={() => setPlanOpen(true)} aria-label="Change plan" data-testid="button-change-plan">
            <Pencil className="mr-1 h-4 w-4" aria-hidden />
            Change plan
          </Button>
          {planOpen && <ChangePlanDialog item={item} open={planOpen} onOpenChange={setPlanOpen} />}
        </div>
      )}

      <div className={cn("space-y-3 rounded-xl border p-3", SURFACE, LINE)} data-testid="block-event-feedback">
        <SectionLabel>{past ? "Did you go? How was it?" : "How does this fit us?"}</SectionLabel>
        <div className="space-y-2">
          {FEEDBACK_AXES.map((axis) => (
            <div key={axis.key} className="grid grid-cols-2 gap-2" role="group" aria-label={axis.options.map((o) => o.label).join(" or ")}>
              {axis.options.map((o, i) => {
                const selected = item.feedback?.[axis.key] === o.value;
                const t = SATCHEL_TONES[i === 0 ? "leaf" : "clay"];
                return (
                  <Button
                    key={o.signal}
                    type="button"
                    variant="outline"
                    aria-pressed={selected}
                    aria-label={selected ? `${o.label} (selected)` : o.label}
                    disabled={feedback.isPending}
                    className={cn(BIG_BUTTON, selected && cn(t.bg, t.fg, "border-current"))}
                    onClick={() => sendSignal(o.signal)}
                    data-testid={`button-feedback-${o.signal}`}
                  >
                    {selected && <Check className="mr-1 h-4 w-4" aria-hidden />}
                    {o.label}
                  </Button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
