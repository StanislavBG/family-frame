import {
  Sun,
  Cloud,
  CloudSun,
  CloudRain,
  CloudDrizzle,
  CloudSnow,
  CloudLightning,
  CloudFog,
  Snowflake,
  Moon,
  CloudMoon,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface WeatherIconProps {
  code: number;
  isDay?: boolean;
  className?: string;
}

export function WeatherIcon({ code, isDay = true, className }: WeatherIconProps) {
  const iconClass = cn("text-foreground", className);

  if (code === 0 || code === 1) {
    return isDay ? (
      <Sun className={cn(iconClass, "text-amber-500")} />
    ) : (
      <Moon className={cn(iconClass, "text-slate-300")} />
    );
  }

  if (code === 2) {
    return isDay ? (
      <CloudSun className={cn(iconClass, "text-amber-400")} />
    ) : (
      <CloudMoon className={cn(iconClass, "text-slate-400")} />
    );
  }

  if (code === 3) {
    return <Cloud className={cn(iconClass, "text-slate-400")} />;
  }

  if (code === 45 || code === 48) {
    return <CloudFog className={cn(iconClass, "text-slate-400")} />;
  }

  if (code >= 51 && code <= 55) {
    return <CloudDrizzle className={cn(iconClass, "text-blue-400")} />;
  }

  if (code >= 56 && code <= 57) {
    return <Snowflake className={cn(iconClass, "text-blue-300")} />;
  }

  if (code >= 61 && code <= 65) {
    return <CloudRain className={cn(iconClass, "text-blue-500")} />;
  }

  if (code >= 66 && code <= 67) {
    return <Snowflake className={cn(iconClass, "text-blue-300")} />;
  }

  if (code >= 71 && code <= 77) {
    return <CloudSnow className={cn(iconClass, "text-blue-200")} />;
  }

  if (code >= 80 && code <= 82) {
    return <CloudRain className={cn(iconClass, "text-blue-500")} />;
  }

  if (code >= 85 && code <= 86) {
    return <CloudSnow className={cn(iconClass, "text-blue-200")} />;
  }

  if (code >= 95 && code <= 99) {
    return <CloudLightning className={cn(iconClass, "text-yellow-500")} />;
  }

  return <Cloud className={iconClass} />;
}
