import type { AppId } from "@shared/apps";

export type ScreensaverDisplayMode = "photos" | "clock" | "weather";
export type ScreensaverSetting = ScreensaverDisplayMode | "cycle";

const CYCLE_ORDER: ScreensaverDisplayMode[] = ["photos", "clock", "weather"];

export function getHomeLayout(isEnabled: (id: AppId) => boolean) {
  const showClock = isEnabled("clock");
  const showWeather = isEnabled("weather");
  return {
    showClock,
    showWeather,
    showLeftColumn: showClock || showWeather,
    showCalendar: isEnabled("calendar"),
    showStocks: isEnabled("stocks"),
    showUnread: isEnabled("messages"),
  };
}

export function getScreensaverModes(
  mode: ScreensaverSetting,
  isEnabled: (id: AppId) => boolean,
): ScreensaverDisplayMode[] {
  const candidates = mode === "cycle" ? CYCLE_ORDER : [mode];
  const modes = candidates.filter((m) => isEnabled(m));
  return modes.length > 0 ? modes : ["clock"];
}
