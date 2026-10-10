import type { Person } from "@shared/schema";

export default function PersonSheets({ person }: { person: Person }) {
  return (
    <div className="p-6 text-muted-foreground" data-testid="person-sheets-content">
      Sheets for {person.name} is coming soon.
    </div>
  );
}
