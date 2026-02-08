import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Calendar as CalendarIcon, Plus, Users, Clock, ChevronLeft, ChevronRight, User, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { CalendarEvent, Person, InsertCalendarEvent, EventTypeValue, UserSettings } from "@shared/schema";
import { Link } from "wouter";
import { EventType } from "@shared/schema";
import { useUser } from "@clerk/clerk-react";
import { Home } from "lucide-react";

// Parse date string as local date (not UTC) to avoid timezone offset issues
function parseLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day);
}

const eventFormSchema = z.object({
  title: z.string().min(1, "Title is required"),
  startDate: z.string().min(1, "Start date is required"),
  endDate: z.string().min(1, "End date is required"),
  type: z.enum([EventType.SHARED, EventType.PRIVATE]),
  people: z.array(z.string()).default([]),
});

type EventFormValues = z.infer<typeof eventFormSchema>;

function CalendarSkeleton() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-full p-4 md:p-8">
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-32" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-40" />
        </CardHeader>
        <CardContent className="space-y-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

interface CalendarGridProps {
  currentDate: Date;
  events: CalendarEvent[];
  onDateClick: (date: Date) => void;
  selectedDate: Date | null;
  people?: Person[];
  weekStartsMonday?: boolean;
}

function CalendarGrid({ currentDate, events, onDateClick, selectedDate, people = [], weekStartsMonday = true }: CalendarGridProps) {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  
  const firstDayOfMonth = new Date(year, month, 1);
  const lastDayOfMonth = new Date(year, month + 1, 0);
  const daysInMonth = lastDayOfMonth.getDate();
  
  // Get the day of week (0 = Sunday, 1 = Monday, etc.)
  const firstDayIndex = firstDayOfMonth.getDay();
  
  // Adjust for week start preference
  // If Monday start: Sunday (0) becomes 6, Monday (1) becomes 0, etc.
  // If Sunday start: keep as is
  const startingDayOfWeek = weekStartsMonday 
    ? (firstDayIndex === 0 ? 6 : firstDayIndex - 1)
    : firstDayIndex;

  const days = [];
  const weekDays = weekStartsMonday 
    ? ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  for (let i = 0; i < startingDayOfWeek; i++) {
    days.push(null);
  }

  for (let i = 1; i <= daysInMonth; i++) {
    days.push(new Date(year, month, i));
  }

  const getEventsForDate = (date: Date) => {
    return events.filter((event) => {
      const start = parseLocalDate(event.startDate);
      const end = parseLocalDate(event.endDate);
      return date >= start && date <= end;
    });
  };

  const getBirthdaysForDate = (date: Date) => {
    return people.filter((person) => {
      if (!person.birthday) return false;
      const bday = parseLocalDate(person.birthday);
      return bday.getMonth() === date.getMonth() && bday.getDate() === date.getDate();
    });
  };

  const isToday = (date: Date) => {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  const isSelected = (date: Date) => {
    return selectedDate?.toDateString() === date.toDateString();
  };

  const totalRows = Math.ceil(days.length / 7);

  return (
    <div className="h-full flex flex-col">
      <div className="grid grid-cols-7 gap-1 relative flex-shrink-0">
        {weekStartsMonday && (
          <div 
            className="absolute top-0 bottom-0 w-px bg-muted-foreground/20 pointer-events-none" 
            style={{ left: 'calc(5 * (100% - 6 * 0.25rem) / 7 + 4.75 * 0.25rem)' }}
            aria-hidden="true"
          />
        )}
        {weekDays.map((day) => (
          <div 
            key={day} 
            className="text-center text-xs md:text-sm font-medium text-muted-foreground py-1"
          >
            {day}
          </div>
        ))}
      </div>
      <div 
        className="flex-1 grid grid-cols-7 gap-1 relative"
        style={{ gridTemplateRows: `repeat(${totalRows}, 1fr)` }}
      >
        {weekStartsMonday && (
          <div 
            className="absolute top-0 bottom-0 w-px bg-muted-foreground/20 pointer-events-none" 
            style={{ left: 'calc(5 * (100% - 6 * 0.25rem) / 7 + 4.75 * 0.25rem)' }}
            aria-hidden="true"
          />
        )}
        {days.map((date, index) => {
          if (!date) {
            return <div key={`empty-${index}`} />;
          }

          const dateEvents = getEventsForDate(date);
          const hasSharedEvent = dateEvents.some((e) => e.type === EventType.SHARED);
          const hasPrivateEvent = dateEvents.some((e) => e.type === EventType.PRIVATE);
          const birthdays = getBirthdaysForDate(date);
          const hasBirthday = birthdays.length > 0;

          const allEntries: { label: string; color: string }[] = [];
          if (hasBirthday) {
            birthdays.forEach((p) => allEntries.push({ label: p.name, color: "text-fuchsia-500" }));
          }
          dateEvents.forEach((e) =>
            allEntries.push({
              label: e.title,
              color: e.type === EventType.SHARED ? "text-cyan-500" : "text-violet-500",
            })
          );

          return (
            <button
              key={date.toISOString()}
              onClick={() => onDateClick(date)}
              className={cn(
                "flex flex-col items-center justify-start pt-1 rounded-lg text-lg md:text-2xl lg:text-3xl font-medium transition-all duration-200 hover-elevate relative overflow-hidden",
                isToday(date) && "ring-2 ring-primary ring-offset-2 ring-offset-background",
                isSelected(date) && "bg-primary text-primary-foreground",
                hasBirthday && !isSelected(date) && "bg-fuchsia-100 dark:bg-fuchsia-900/40",
                !isSelected(date) && !hasBirthday && "hover:bg-muted"
              )}
              data-testid={`calendar-day-${date.getDate()}`}
              title={hasBirthday ? `Birthday: ${birthdays.map(p => p.name).join(", ")}` : undefined}
            >
              <span>{date.getDate()}</span>
              {allEntries.length > 0 && (
                <div className="flex flex-col items-center gap-0 mt-0.5 w-full px-0.5 overflow-hidden">
                  {allEntries.slice(0, 3).map((entry, i) => (
                    <span
                      key={i}
                      className={cn(
                        "text-[9px] md:text-[10px] leading-tight truncate w-full text-center font-normal",
                        isSelected(date) ? "text-primary-foreground/80" : entry.color
                      )}
                    >
                      {entry.label}
                    </span>
                  ))}
                  {allEntries.length > 3 && (
                    <span className={cn(
                      "text-[8px] leading-tight font-normal",
                      isSelected(date) ? "text-primary-foreground/60" : "text-muted-foreground"
                    )}>
                      +{allEntries.length - 3} more
                    </span>
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Helper to format date as yyyy/mm/dd
function formatDateDisplay(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}/${month}/${day}`;
}

interface EventCardProps {
  event: CalendarEvent;
  people: Person[];
  currentUserId?: string;
  onEdit: (event: CalendarEvent) => void;
  onDelete: (eventId: string) => void;
}

function EventCard({ event, people, currentUserId, onEdit, onDelete }: EventCardProps) {
  const eventPeople = people.filter((p) => (event.people || []).includes(p.id));
  const startDate = parseLocalDate(event.startDate);
  const endDate = parseLocalDate(event.endDate);
  const isMultiDay = startDate.toDateString() !== endDate.toDateString();
  
  // Check if current user owns this event
  const isOwner = !event.creatorId || event.creatorId === currentUserId;

  return (
    <div
      className={cn(
        "p-4 rounded-lg border-l-4 bg-card transition-all duration-200 hover-elevate group",
        event.type === EventType.SHARED ? "border-l-cyan-500" : "border-l-violet-500"
      )}
      data-testid={`event-card-${event.id}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-lg truncate" data-testid="text-event-title">{event.title}</h4>
          <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
            <Clock className="h-4 w-4" />
            <span>
              {formatDateDisplay(startDate)}
              {isMultiDay && ` - ${formatDateDisplay(endDate)}`}
            </span>
          </div>
          {event.creatorName && (
            <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
              <Home className="h-4 w-4" />
              <span>{event.creatorName}</span>
            </div>
          )}
          {eventPeople.length > 0 && (
            <div className="flex items-center gap-2 mt-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <div className="flex flex-wrap gap-1">
                {eventPeople.map((person) => (
                  <Badge key={person.id} variant="secondary" className="text-xs">
                    {person.name}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Badge 
            className={cn(
              event.type === EventType.SHARED 
                ? "bg-cyan-500 hover:bg-cyan-600 text-white" 
                : "bg-violet-500 hover:bg-violet-600 text-white"
            )}
          >
            {event.type}
          </Badge>
          {isOwner && (
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => onEdit(event)}
                data-testid={`button-edit-event-${event.id}`}
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-destructive hover:text-destructive"
                onClick={() => onDelete(event.id)}
                data-testid={`button-delete-event-${event.id}`}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function CalendarPage() {
  const { toast } = useToast();
  const { user } = useUser();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [createEventOpen, setCreateEventOpen] = useState(false);
  const [editEventOpen, setEditEventOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);

  const { data: settings } = useQuery<UserSettings>({
    queryKey: ["/api/settings"],
  });

  const weekStartsMonday = settings?.weekStartsMonday ?? true;

  const { data: events, isLoading: eventsLoading } = useQuery<CalendarEvent[]>({
    queryKey: ["/api/calendar/events"],
  });

  const { data: people, isLoading: peopleLoading } = useQuery<Person[]>({
    queryKey: ["/api/people/list"],
  });

  const form = useForm<EventFormValues>({
    resolver: zodResolver(eventFormSchema),
    defaultValues: {
      title: "",
      startDate: "",
      endDate: "",
      type: EventType.SHARED,
      people: [],
    },
  });

  const editForm = useForm<EventFormValues>({
    resolver: zodResolver(eventFormSchema),
    defaultValues: {
      title: "",
      startDate: "",
      endDate: "",
      type: EventType.SHARED,
      people: [],
    },
  });

  const createEventMutation = useMutation({
    mutationFn: async (data: InsertCalendarEvent) => {
      const response = await apiRequest("POST", "/api/calendar/new-event", data);
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/calendar/events"] });
      toast({ title: "Event created successfully" });
      form.reset();
      setCreateEventOpen(false);
    },
    onError: (error: Error) => {
      toast({ title: "Failed to create event", description: error.message, variant: "destructive" });
    },
  });

  const updateEventMutation = useMutation({
    mutationFn: async ({ eventId, data }: { eventId: string; data: InsertCalendarEvent }) => {
      const response = await apiRequest("PUT", `/api/calendar/events/${eventId}`, data);
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/calendar/events"] });
      toast({ title: "Event updated successfully" });
      editForm.reset();
      setEditEventOpen(false);
      setEditingEvent(null);
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update event", description: error.message, variant: "destructive" });
    },
  });

  const deleteEventMutation = useMutation({
    mutationFn: async (eventId: string) => {
      const response = await apiRequest("DELETE", `/api/calendar/events/${eventId}`);
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/calendar/events"] });
      toast({ title: "Event deleted successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to delete event", description: error.message, variant: "destructive" });
    },
  });

  const onSubmit = (data: EventFormValues) => {
    createEventMutation.mutate({
      title: data.title,
      startDate: data.startDate,
      endDate: data.endDate,
      type: data.type as EventTypeValue,
      people: data.people,
    });
  };

  const onEditSubmit = (data: EventFormValues) => {
    if (!editingEvent) return;
    updateEventMutation.mutate({
      eventId: editingEvent.id,
      data: {
        title: data.title,
        startDate: data.startDate,
        endDate: data.endDate,
        type: data.type as EventTypeValue,
        people: data.people,
      },
    });
  };

  const onFormError = (_errors: unknown) => {
    // Form validation errors handled by react-hook-form
  };

  const handleEditEvent = (event: CalendarEvent) => {
    setEditingEvent(event);
    editForm.reset({
      title: event.title,
      startDate: event.startDate,
      endDate: event.endDate,
      type: event.type as EventTypeValue,
      people: event.people || [],
    });
    setEditEventOpen(true);
  };

  const handleDeleteEvent = (eventId: string) => {
    deleteEventMutation.mutate(eventId);
  };

  const previousMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const handleDateClick = (date: Date) => {
    setSelectedDate(date);
    form.setValue("startDate", date.toISOString().split("T")[0]);
    form.setValue("endDate", date.toISOString().split("T")[0]);
  };

  if (eventsLoading || peopleLoading) {
    return (
      <div className="h-full bg-background">
        <CalendarSkeleton />
      </div>
    );
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const upcomingEvents = (events || [])
    .filter((event) => parseLocalDate(event.endDate) >= today)
    .sort((a, b) => parseLocalDate(a.startDate).getTime() - parseLocalDate(b.startDate).getTime())
    .slice(0, 7);

  const hasPeople = people && people.length > 0;

  return (
    <div className="h-full p-4 md:p-6 flex flex-col bg-background overflow-hidden">
      <div className="flex-1 flex flex-col gap-3 min-h-0">
        <Card className="flex-1 flex flex-col min-h-0">
          <CardHeader className="flex-row items-center justify-between py-2 px-4 flex-shrink-0">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={previousMonth} data-testid="button-prev-month">
                <ChevronLeft className="h-5 w-5" />
              </Button>
              <h2 className="text-xl font-semibold" data-testid="text-current-month">
                {currentDate.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
              </h2>
              <Button variant="ghost" size="icon" onClick={nextMonth} data-testid="button-next-month">
                <ChevronRight className="h-5 w-5" />
              </Button>
            </div>
            <Dialog open={createEventOpen} onOpenChange={setCreateEventOpen}>
              <DialogTrigger asChild>
                <Button data-testid="button-create-event">
                  <Plus className="h-4 w-4 mr-2" />
                  New Event
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Create Event</DialogTitle>
                  <DialogDescription>
                    Add a new event to your family calendar.
                  </DialogDescription>
                </DialogHeader>
                {!hasPeople ? (
                  <div className="py-8 text-center">
                    <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                      <User className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <h3 className="font-medium mb-2">No People Added Yet</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      Add household members in Global Config before creating events.
                    </p>
                    <Button asChild onClick={() => setCreateEventOpen(false)} data-testid="button-add-person-first">
                      <Link href="/settings">
                        <Users className="h-4 w-4 mr-2" />
                        Go to Global Config
                      </Link>
                    </Button>
                  </div>
                ) : (
                  <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit, onFormError)} className="space-y-4">
                      <FormField
                        control={form.control}
                        name="title"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Title</FormLabel>
                            <FormControl>
                              <Input placeholder="Event title" {...field} data-testid="input-event-title" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <div className="grid grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="startDate"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Start Date</FormLabel>
                              <FormControl>
                                <Input type="date" {...field} data-testid="input-event-start" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="endDate"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>End Date</FormLabel>
                              <FormControl>
                                <Input type="date" {...field} data-testid="input-event-end" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      <FormField
                        control={form.control}
                        name="type"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Type</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <FormControl>
                                <SelectTrigger data-testid="select-event-type">
                                  <SelectValue placeholder="Select type" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value={EventType.SHARED}>Shared</SelectItem>
                                <SelectItem value={EventType.PRIVATE}>Private</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="people"
                        render={({ field }) => {
                          const selectedPeople = field.value || [];
                          return (
                            <FormItem>
                              <FormLabel>People</FormLabel>
                              <div className="flex flex-wrap gap-2">
                                {people?.map((person) => (
                                  <Button
                                    key={person.id}
                                    type="button"
                                    variant={selectedPeople.includes(person.id) ? "default" : "outline"}
                                    size="sm"
                                    onClick={() => {
                                      const newValue = selectedPeople.includes(person.id)
                                        ? selectedPeople.filter((id) => id !== person.id)
                                        : [...selectedPeople, person.id];
                                      field.onChange(newValue);
                                    }}
                                    data-testid={`button-person-${person.id}`}
                                  >
                                    {person.name}
                                  </Button>
                                ))}
                              </div>
                              <FormMessage />
                            </FormItem>
                          );
                        }}
                      />
                      <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setCreateEventOpen(false)}>
                          Cancel
                        </Button>
                        <Button type="submit" disabled={createEventMutation.isPending} data-testid="button-submit-event">
                          {createEventMutation.isPending ? "Creating..." : "Create Event"}
                        </Button>
                      </DialogFooter>
                    </form>
                  </Form>
                )}
              </DialogContent>
            </Dialog>
            <Dialog open={editEventOpen} onOpenChange={(open) => {
              setEditEventOpen(open);
              if (!open) setEditingEvent(null);
            }}>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Edit Event</DialogTitle>
                  <DialogDescription>
                    Update the event details.
                  </DialogDescription>
                </DialogHeader>
                <Form {...editForm}>
                  <form onSubmit={editForm.handleSubmit(onEditSubmit, onFormError)} className="space-y-4">
                    <FormField
                      control={editForm.control}
                      name="title"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Title</FormLabel>
                          <FormControl>
                            <Input placeholder="Event title" {...field} data-testid="input-edit-event-title" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={editForm.control}
                        name="startDate"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Start Date</FormLabel>
                            <FormControl>
                              <Input type="date" {...field} data-testid="input-edit-event-start" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={editForm.control}
                        name="endDate"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>End Date</FormLabel>
                            <FormControl>
                              <Input type="date" {...field} data-testid="input-edit-event-end" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    <FormField
                      control={editForm.control}
                      name="type"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Type</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-edit-event-type">
                                <SelectValue placeholder="Select type" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value={EventType.SHARED}>Shared</SelectItem>
                              <SelectItem value={EventType.PRIVATE}>Private</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={editForm.control}
                      name="people"
                      render={({ field }) => {
                        const selectedPeople = field.value || [];
                        return (
                          <FormItem>
                            <FormLabel>People</FormLabel>
                            <div className="flex flex-wrap gap-2">
                              {people?.map((person) => (
                                <Button
                                  key={person.id}
                                  type="button"
                                  variant={selectedPeople.includes(person.id) ? "default" : "outline"}
                                  size="sm"
                                  onClick={() => {
                                    const newValue = selectedPeople.includes(person.id)
                                      ? selectedPeople.filter((id) => id !== person.id)
                                      : [...selectedPeople, person.id];
                                    field.onChange(newValue);
                                  }}
                                  data-testid={`button-edit-person-${person.id}`}
                                >
                                  {person.name}
                                </Button>
                              ))}
                            </div>
                            <FormMessage />
                          </FormItem>
                        );
                      }}
                    />
                    <DialogFooter>
                      <Button type="button" variant="outline" onClick={() => {
                        setEditEventOpen(false);
                        setEditingEvent(null);
                      }}>
                        Cancel
                      </Button>
                      <Button type="submit" disabled={updateEventMutation.isPending} data-testid="button-update-event">
                        {updateEventMutation.isPending ? "Updating..." : "Update Event"}
                      </Button>
                    </DialogFooter>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col p-2 md:p-4 min-h-0">
            <div className="flex-1 min-h-0">
              <CalendarGrid
                currentDate={currentDate}
                events={events || []}
                onDateClick={handleDateClick}
                selectedDate={selectedDate}
                people={people || []}
                weekStartsMonday={weekStartsMonday}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="flex-shrink-0">
          <CardContent className="py-3 px-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Upcoming</span>
              </div>
              <Button variant="outline" size="sm" asChild data-testid="button-manage-people">
                <Link href="/settings?section=people">
                  <Users className="h-4 w-4 mr-1" />
                  People
                </Link>
              </Button>
            </div>
            {upcomingEvents.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {upcomingEvents.map((event) => {
                  const startDate = parseLocalDate(event.startDate);
                  const endDate = parseLocalDate(event.endDate);
                  const isMultiDay = startDate.toDateString() !== endDate.toDateString();
                  const todayRef = new Date();
                  todayRef.setHours(0, 0, 0, 0);
                  const diffDays = Math.ceil((startDate.getTime() - todayRef.getTime()) / (1000 * 60 * 60 * 24));
                  const dateLabel = diffDays === 0 ? "Today" : diffDays === 1 ? "Tomorrow" : startDate.toLocaleDateString(undefined, { month: "short", day: "numeric" });
                  const eventPeople = (people || []).filter((p) => (event.people || []).includes(p.id));

                  return (
                    <div
                      key={event.id}
                      className={cn(
                        "flex flex-col gap-0.5 px-3 py-2 rounded-md bg-muted/50 cursor-pointer hover-elevate min-w-[180px] flex-1 max-w-[300px]",
                        event.type === EventType.SHARED ? "border-l-2 border-l-cyan-500" : "border-l-2 border-l-violet-500"
                      )}
                      onClick={() => handleEditEvent(event)}
                      data-testid={`upcoming-event-${event.id}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium truncate">{event.title}</span>
                        <Badge
                          variant="secondary"
                          className="text-[10px] px-1.5 py-0 h-4 flex-shrink-0"
                        >
                          {event.type}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        <span>{dateLabel}</span>
                        {isMultiDay && (
                          <span>- {endDate.toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
                        )}
                      </div>
                      {eventPeople.length > 0 && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Users className="h-3 w-3" />
                          <span className="truncate">{eventPeople.map(p => p.name).join(", ")}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <span className="text-sm text-muted-foreground">No upcoming events</span>
            )}
          </CardContent>
        </Card>
      </div>

    </div>
  );
}
