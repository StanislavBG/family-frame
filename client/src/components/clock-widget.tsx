import { useClock } from "@/hooks/use-clock";
import { useQuery } from "@tanstack/react-query";
import { useRef, useState, useEffect } from "react";
import { ScaleCell } from "@/components/scale-cell";
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

  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 400, height: 300 });

  // Measure container and update dimensions
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setDimensions({
          width: Math.max(rect.width, 100),
          height: Math.max(rect.height, 100),
        });
      }
    };

    updateDimensions();
    const resizeObserver = new ResizeObserver(updateDimensions);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => resizeObserver.disconnect();
  }, [variant]);

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

  // Digital clock display - ScaleCell zones fill container
  if (clockStyle === "digital") {
    if (variant === "compact") {
      return (
        <div ref={containerRef} className={`flex flex-col items-center justify-center h-full w-full ${className}`} data-testid="clock-widget">
          <div className="flex items-baseline justify-center gap-2">
            <span
              className="text-6xl md:text-7xl lg:text-8xl font-bold tabular-nums tracking-tight leading-none"
              style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}
            >
              {digitalTime.time}
            </span>
            <div className="flex flex-col items-start">
              <span className="text-2xl md:text-3xl font-medium tabular-nums text-muted-foreground">
                {digitalTime.seconds}
              </span>
              {digitalTime.ampm && (
                <span className="text-lg md:text-xl font-semibold text-primary">
                  {digitalTime.ampm}
                </span>
              )}
            </div>
          </div>
          <div className="text-lg md:text-xl lg:text-2xl text-muted-foreground text-center font-medium mt-2" data-testid="text-date">
            {date}
          </div>
        </div>
      );
    }

    return (
      <div ref={containerRef} className={`h-full w-full grid grid-rows-[3fr_1fr] gap-0 min-h-0 ${className}`} data-testid="clock-widget">
        {/* Main zone: Time display (dominant) */}
        <ScaleCell padding={0.9}>
          <div className="inline-flex items-baseline gap-[0.1em] whitespace-nowrap">
            <span
              className="text-[140px] font-bold tabular-nums tracking-tight leading-[0.85]"
              style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}
            >
              {digitalTime.time}
            </span>
            <div className="flex flex-col items-start">
              <span className="text-[40px] font-medium tabular-nums text-muted-foreground">
                {digitalTime.seconds}
              </span>
              {digitalTime.ampm && (
                <span className="text-[32px] font-semibold text-primary">
                  {digitalTime.ampm}
                </span>
              )}
            </div>
          </div>
        </ScaleCell>

        {/* Bottom zone: Date */}
        <ScaleCell padding={0.85}>
          <div className="text-[28px] text-muted-foreground whitespace-nowrap" data-testid="text-date">
            {date}, {year}
          </div>
        </ScaleCell>
      </div>
    );
  }

  // Rectangular analog clock - fills entire container
  const { width, height } = dimensions;
  const padding = 8;
  const frameWidth = 12;

  // Inner dimensions (clock face)
  const innerWidth = width - (padding + frameWidth) * 2;
  const innerHeight = height - (padding + frameWidth) * 2;
  const cx = width / 2;
  const cy = height / 2;

  // Scale factor for elements
  const scale = Math.min(innerWidth, innerHeight) / 200;

  // Helper to get point on rectangular perimeter at angle
  // Returns the point where a ray from center at given angle intersects the rectangle
  const getRectPoint = (angle: number, inset: number = 0) => {
    const rad = (angle - 90) * (Math.PI / 180);
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    // Half dimensions with inset
    const hw = (innerWidth / 2) - inset;
    const hh = (innerHeight / 2) - inset;

    // Find intersection with rectangle edges
    let t = Infinity;

    // Right edge (x = hw)
    if (cos > 0.001) t = Math.min(t, hw / cos);
    // Left edge (x = -hw)
    if (cos < -0.001) t = Math.min(t, -hw / cos);
    // Bottom edge (y = hh)
    if (sin > 0.001) t = Math.min(t, hh / sin);
    // Top edge (y = -hh)
    if (sin < -0.001) t = Math.min(t, -hh / sin);

    return {
      x: cx + cos * t,
      y: cy + sin * t,
    };
  };

  // Helper to get hand end point (scaled from center)
  const getHandEnd = (angle: number, lengthRatio: number) => {
    const rad = (angle - 90) * (Math.PI / 180);
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    // Calculate max length to edge
    const hw = innerWidth / 2;
    const hh = innerHeight / 2;
    let maxT = Infinity;
    if (cos > 0.001) maxT = Math.min(maxT, hw / cos);
    if (cos < -0.001) maxT = Math.min(maxT, -hw / cos);
    if (sin > 0.001) maxT = Math.min(maxT, hh / sin);
    if (sin < -0.001) maxT = Math.min(maxT, -hh / sin);

    const t = maxT * lengthRatio;
    return {
      x: cx + cos * t,
      y: cy + sin * t,
    };
  };

  // Corner radius for rounded rectangle
  const cornerRadius = Math.min(innerWidth, innerHeight) * 0.05;

  return (
    <div ref={containerRef} className={`h-full w-full ${className}`} data-testid="clock-widget">
      {/* Rectangular Clock SVG - fills entire container */}
      <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          className="drop-shadow-lg"
        >
          {/* Clock frame - dark outer rectangle */}
          <rect
            x={padding}
            y={padding}
            width={width - padding * 2}
            height={height - padding * 2}
            rx={cornerRadius + frameWidth}
            ry={cornerRadius + frameWidth}
            fill="#2c2c2c"
          />

          {/* Clock face - cream/off-white */}
          <rect
            x={padding + frameWidth}
            y={padding + frameWidth}
            width={innerWidth}
            height={innerHeight}
            rx={cornerRadius}
            ry={cornerRadius}
            fill="#f5f5dc"
          />

          {/* Hour markers - bold ticks at 12, 3, 6, 9 */}
          {[0, 3, 6, 9].map((hour) => {
            const angle = hour * 30;
            const outer = getRectPoint(angle, 0);
            const inner = getRectPoint(angle, scale * 20);
            return (
              <line
                key={hour}
                x1={inner.x}
                y1={inner.y}
                x2={outer.x}
                y2={outer.y}
                stroke="#1a1a1a"
                strokeWidth={scale * 5}
                strokeLinecap="round"
              />
            );
          })}

          {/* Hour markers - regular ticks */}
          {[1, 2, 4, 5, 7, 8, 10, 11].map((hour) => {
            const angle = hour * 30;
            const outer = getRectPoint(angle, 0);
            const inner = getRectPoint(angle, scale * 14);
            return (
              <line
                key={hour}
                x1={inner.x}
                y1={inner.y}
                x2={outer.x}
                y2={outer.y}
                stroke="#1a1a1a"
                strokeWidth={scale * 3}
                strokeLinecap="round"
              />
            );
          })}

          {/* Hour numbers */}
          {[12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((hour) => {
            const angle = hour * 30;
            const pos = getRectPoint(angle, scale * 35);
            return (
              <text
                key={hour}
                x={pos.x}
                y={pos.y}
                textAnchor="middle"
                dominantBaseline="central"
                fill="#1a1a1a"
                fontSize={scale * 18}
                fontWeight="600"
                fontFamily="system-ui, -apple-system, sans-serif"
              >
                {hour}
              </text>
            );
          })}

          {/* Minute ticks */}
          {Array.from({ length: 60 }, (_, i) => {
            if (i % 5 === 0) return null; // Skip hour positions
            const angle = i * 6;
            const outer = getRectPoint(angle, 0);
            const inner = getRectPoint(angle, scale * 8);
            return (
              <line
                key={i}
                x1={inner.x}
                y1={inner.y}
                x2={outer.x}
                y2={outer.y}
                stroke="#888"
                strokeWidth={scale * 1.5}
              />
            );
          })}

          {/* Hour hand - short and thick */}
          {(() => {
            const end = getHandEnd(hourAngle, 0.45);
            return (
              <line
                x1={cx}
                y1={cy}
                x2={end.x}
                y2={end.y}
                stroke="#1a1a1a"
                strokeWidth={scale * 8}
                strokeLinecap="round"
              />
            );
          })()}

          {/* Minute hand - long and medium thickness */}
          {(() => {
            const end = getHandEnd(minuteAngle, 0.7);
            return (
              <line
                x1={cx}
                y1={cy}
                x2={end.x}
                y2={end.y}
                stroke="#1a1a1a"
                strokeWidth={scale * 5}
                strokeLinecap="round"
              />
            );
          })()}

          {/* Second hand - thin and red with tail */}
          {(() => {
            const end = getHandEnd(secondAngle, 0.8);
            const tail = getHandEnd(secondAngle + 180, 0.15);
            return (
              <line
                x1={tail.x}
                y1={tail.y}
                x2={end.x}
                y2={end.y}
                stroke="#c05746"
                strokeWidth={scale * 2.5}
                strokeLinecap="round"
              />
            );
          })()}

          {/* Center cap */}
          <circle cx={cx} cy={cy} r={scale * 8} fill="#1a1a1a" />
          <circle cx={cx} cy={cy} r={scale * 4} fill="#c05746" />
        </svg>
    </div>
  );
}
