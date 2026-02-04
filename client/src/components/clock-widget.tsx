import { useClock } from "@/hooks/use-clock";
import { useQuery } from "@tanstack/react-query";
import type { UserSettings } from "@shared/schema";

interface ClockWidgetProps {
  variant?: "full" | "compact";
  className?: string;
}

export function ClockWidget({ variant = "full", className = "" }: ClockWidgetProps) {
  const { data: settings } = useQuery<UserSettings>({
    queryKey: ["/api/settings"],
  });
  const timeFormat = settings?.timeFormat || "24h";
  const { time, period, date, year } = useClock(timeFormat);

  if (variant === "compact") {
    return (
      <div className={`flex flex-col items-center justify-center ${className}`} data-testid="clock-widget">
        <div className="text-8xl md:text-9xl lg:text-[12rem] font-bold tracking-tight leading-none" data-testid="text-time">
          {time}
        </div>
        <div className="text-3xl md:text-4xl text-muted-foreground mt-2" data-testid="text-date">
          {date}
        </div>
      </div>
    );
  }

  return (
    <div className={`h-full w-full flex flex-col items-center justify-center ${className}`} data-testid="clock-widget">
      <div className="text-[min(28vw,40vh)] font-bold tracking-tighter leading-none" data-testid="text-time">
        {time}<span className="text-[min(9vw,13vh)] text-muted-foreground ml-[1vw]">{period}</span>
      </div>
      <div className="text-[min(6vw,9vh)] text-muted-foreground mt-[1vh]" data-testid="text-date">
        {date}, {year}
      </div>
    </div>
  );
}
