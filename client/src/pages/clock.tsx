import { ClockWidget } from "@/components/clock-widget";

export default function ClockPage() {
  return (
    <div className="h-full w-full bg-background flex flex-col" data-testid="clock-page">
      {/* Clock display area - fills available space */}
      <div className="flex-1 flex items-center justify-center p-4 md:p-8 min-h-0">
        <ClockWidget variant="full" />
      </div>
    </div>
  );
}
