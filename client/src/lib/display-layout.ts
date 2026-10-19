import { resolveAppLayout, type AppId } from "@shared/apps";
import type { UserSettings } from "@shared/schema";

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

export function shouldShowWelcome(
  settings: Pick<UserSettings, "appSetupDone" | "visibleApps"> | undefined,
): "new" | "legacy" | null {
  if (!settings || settings.appSetupDone) return null;
  if (settings.visibleApps == null) return "legacy";
  const { movable } = resolveAppLayout(settings);
  const onlyBasics = movable.every((m) => !m.enabled || m.app.id === "clock" || m.app.id === "weather");
  return onlyBasics ? "new" : null;
}
