import type { Person } from "@shared/schema";

export default function PersonDashboard({ person }: { person: Person }) {
  return (
    <div className="p-6 text-muted-foreground" data-testid="person-dashboard-content">
      Dashboard for {person.name} is coming soon.
    </div>
  );
}
