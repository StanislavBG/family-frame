import { UserRound } from "lucide-react";
import { EmptyState } from "@/components/empty-state";

export default function PeoplePage() {
  return (
    <div className="h-full flex flex-col">
      <h1 className="text-3xl font-semibold p-6 pb-0">People</h1>
      <div className="flex-1 min-h-0">
        <EmptyState
          icon={UserRound}
          title="People are coming soon"
          description="Pick a person in your household to see their calendar, inbox, photos and daily sheets."
        />
      </div>
    </div>
  );
}
