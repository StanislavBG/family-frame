import { useClock } from "@/hooks/use-clock";
import { useQuery } from "@tanstack/react-query";
import type { UserSettings } from "@shared/schema";

interface ClockWidgetProps {
  variant?: "full" | "compact";
  style?: "analog" | "digital"; // Override setting (home always uses analog)
  className?: string;
}

export function ClockWidget({ variant = "full", style, className = "" }: ClockWidgetProps) {
  const { data: settings } = useQuery<UserSettings>({
    queryKey: ["/api/settings"],
  });
  const timeFormat = settings?.timeFormat || "24h";
  const clockStyle = style || settings?.clockStyle || "analog";
  const { currentTime, date, year } = useClock(timeFormat);

  // Format time for digital display
  const formatDigitalTime = () => {
    const hours = currentTime.getHours();
    const minutes = currentTime.getMinutes();
    const seconds = currentTime.getSeconds();

    if (timeFormat === "12h") {
      const h = hours % 12 || 12;
      const ampm = hours < 12 ? "AM" : "PM";
      return {
        time: `${h}:${minutes.toString().padStart(2, '0')}`,
        seconds: seconds.toString().padStart(2, '0'),
        ampm
      };
    }
    return {
      time: `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`,
      seconds: seconds.toString().padStart(2, '0'),
      ampm: null
    };
  };

  // Calculate hand angles for analog clock
  const hours = currentTime.getHours() % 12;
  const minutes = currentTime.getMinutes();
  const seconds = currentTime.getSeconds();

  // Hour hand: 30 degrees per hour + 0.5 degrees per minute
  const hourAngle = hours * 30 + minutes * 0.5;
  // Minute hand: 6 degrees per minute + 0.1 degrees per second
  const minuteAngle = minutes * 6 + seconds * 0.1;
  // Second hand: 6 degrees per second
  const secondAngle = seconds * 6;

  const digitalTime = formatDigitalTime();

  // Digital clock display - scales to fill container
  if (clockStyle === "digital") {
    return (
      <div className={`flex flex-col items-center justify-center h-full w-full ${className}`} data-testid="clock-widget">
        <div className="flex flex-col items-center justify-center flex-1 w-full">
          {/* Main time display - scales to fit */}
          <div className="flex items-baseline justify-center gap-2">
            <span
              className={`font-bold tabular-nums tracking-tight leading-none ${
                variant === "compact"
                  ? "text-6xl md:text-7xl lg:text-8xl"
                  : "text-[12vw] md:text-[15vw] lg:text-[18vw]"
              }`}
              style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}
            >
              {digitalTime.time}
            </span>
            <div className="flex flex-col items-start">
              <span
                className={`font-medium tabular-nums text-muted-foreground ${
                  variant === "compact"
                    ? "text-2xl md:text-3xl"
                    : "text-[4vw] md:text-[5vw]"
                }`}
              >
                {digitalTime.seconds}
              </span>
              {digitalTime.ampm && (
                <span
                  className={`font-semibold text-primary ${
                    variant === "compact"
                      ? "text-lg md:text-xl"
                      : "text-[3vw] md:text-[4vw]"
                  }`}
                >
                  {digitalTime.ampm}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Date display below time */}
        {variant === "compact" ? (
          <div className="text-lg md:text-xl lg:text-2xl text-muted-foreground text-center font-medium mt-2" data-testid="text-date">
            {date}
          </div>
        ) : (
          <div className="text-2xl md:text-4xl lg:text-5xl text-muted-foreground text-center mt-4" data-testid="text-date">
            {date}, {year}
          </div>
        )}
      </div>
    );
  }

  // Analog clock display - scales to fill container while maintaining aspect ratio
  return (
    <div className={`flex flex-col items-center justify-center h-full w-full ${className}`} data-testid="clock-widget">
      {/* School Clock SVG - scales to fit container */}
      <div className={`relative flex-1 w-full flex items-center justify-center ${variant === "compact" ? "max-h-48 md:max-h-56 lg:max-h-64" : ""}`}>
        <svg
          viewBox="0 0 200 200"
          className="h-full w-auto max-w-full drop-shadow-lg"
          style={{ aspectRatio: "1" }}
        >
          {/* Clock frame - dark outer ring */}
          <circle cx="100" cy="100" r="98" fill="#2c2c2c" />

          {/* Clock face - cream/off-white like school clocks */}
          <circle cx="100" cy="100" r="90" fill="#f5f5dc" />

          {/* Inner subtle ring */}
          <circle cx="100" cy="100" r="85" fill="none" stroke="#e8e8d0" strokeWidth="1" />

          {/* Hour markers - bold ticks at 12, 3, 6, 9 */}
          {[0, 3, 6, 9].map((hour) => {
            const angle = (hour * 30 - 90) * (Math.PI / 180);
            const x1 = 100 + 70 * Math.cos(angle);
            const y1 = 100 + 70 * Math.sin(angle);
            const x2 = 100 + 82 * Math.cos(angle);
            const y2 = 100 + 82 * Math.sin(angle);
            return (
              <line
                key={hour}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke="#1a1a1a"
                strokeWidth="4"
                strokeLinecap="round"
              />
            );
          })}

          {/* Hour markers - regular ticks */}
          {[1, 2, 4, 5, 7, 8, 10, 11].map((hour) => {
            const angle = (hour * 30 - 90) * (Math.PI / 180);
            const x1 = 100 + 74 * Math.cos(angle);
            const y1 = 100 + 74 * Math.sin(angle);
            const x2 = 100 + 82 * Math.cos(angle);
            const y2 = 100 + 82 * Math.sin(angle);
            return (
              <line
                key={hour}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke="#1a1a1a"
                strokeWidth="2"
                strokeLinecap="round"
              />
            );
          })}

          {/* Hour numbers */}
          {[12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((hour) => {
            const displayHour = hour === 0 ? 12 : hour;
            const angle = (hour * 30 - 90) * (Math.PI / 180);
            const x = 100 + 62 * Math.cos(angle);
            const y = 100 + 62 * Math.sin(angle);
            return (
              <text
                key={hour}
                x={x}
                y={y}
                textAnchor="middle"
                dominantBaseline="central"
                fill="#1a1a1a"
                fontSize="14"
                fontWeight="600"
                fontFamily="system-ui, -apple-system, sans-serif"
              >
                {displayHour}
              </text>
            );
          })}

          {/* Minute ticks */}
          {Array.from({ length: 60 }, (_, i) => {
            if (i % 5 === 0) return null; // Skip hour positions
            const angle = (i * 6 - 90) * (Math.PI / 180);
            const x1 = 100 + 80 * Math.cos(angle);
            const y1 = 100 + 80 * Math.sin(angle);
            const x2 = 100 + 84 * Math.cos(angle);
            const y2 = 100 + 84 * Math.sin(angle);
            return (
              <line
                key={i}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke="#666"
                strokeWidth="1"
              />
            );
          })}

          {/* Hour hand - short and thick */}
          <line
            x1="100"
            y1="100"
            x2="100"
            y2="55"
            stroke="#1a1a1a"
            strokeWidth="6"
            strokeLinecap="round"
            transform={`rotate(${hourAngle}, 100, 100)`}
            className="transition-transform duration-200"
          />

          {/* Minute hand - long and medium thickness */}
          <line
            x1="100"
            y1="100"
            x2="100"
            y2="28"
            stroke="#1a1a1a"
            strokeWidth="4"
            strokeLinecap="round"
            transform={`rotate(${minuteAngle}, 100, 100)`}
            className="transition-transform duration-200"
          />

          {/* Second hand - thin and red */}
          <line
            x1="100"
            y1="115"
            x2="100"
            y2="25"
            stroke="#c05746"
            strokeWidth="2"
            strokeLinecap="round"
            transform={`rotate(${secondAngle}, 100, 100)`}
          />

          {/* Center cap */}
          <circle cx="100" cy="100" r="6" fill="#1a1a1a" />
          <circle cx="100" cy="100" r="3" fill="#c05746" />
        </svg>
      </div>

      {/* Date display below clock */}
      {variant === "compact" ? (
        <div className="text-lg md:text-xl lg:text-2xl text-muted-foreground text-center font-medium mt-2" data-testid="text-date">
          {date}
        </div>
      ) : (
        <div className="text-2xl md:text-3xl text-muted-foreground text-center mt-4" data-testid="text-date">
          {date}, {year}
        </div>
      )}
    </div>
  );
}
