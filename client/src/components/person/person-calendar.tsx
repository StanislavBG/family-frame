import type { Person } from "@shared/schema";

export default function PersonCalendar({ person }: { person: Person }) {
  return (
    <div className="p-6 text-muted-foreground" data-testid="person-calendar-content">
      Calendar for {person.name} is coming soon.
    </div>
  );
}
