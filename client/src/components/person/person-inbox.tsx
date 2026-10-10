import type { Person } from "@shared/schema";

export default function PersonInbox({ person }: { person: Person }) {
  return (
    <div className="p-6 text-muted-foreground" data-testid="person-inbox-content">
      Inbox for {person.name} is coming soon.
    </div>
  );
}
