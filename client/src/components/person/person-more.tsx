import type { Person } from "@shared/schema";

export default function PersonMore({ person }: { person: Person }) {
  return (
    <div className="p-6 text-muted-foreground" data-testid="person-more-content">
      More for {person.name} is coming soon.
    </div>
  );
}
