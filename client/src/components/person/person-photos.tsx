import type { Person } from "@shared/schema";

export default function PersonPhotos({ person }: { person: Person }) {
  return (
    <div className="p-6 text-muted-foreground" data-testid="person-photos-content">
      Photos for {person.name} is coming soon.
    </div>
  );
}
