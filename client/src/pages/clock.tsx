import { ClockWidget } from "@/components/clock-widget";

export default function ClockPage() {
  return (
    <div className="h-full w-full bg-background" data-testid="clock-page">
      <ClockWidget variant="full" />
    </div>
  );
}
