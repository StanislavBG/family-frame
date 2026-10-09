import type { AppId } from "@shared/apps";
import { radioService } from "./radio-service";

// Stops audio owned by an app that was just turned off, so nothing keeps
// playing with no page left to control it.
export function runAppDisableHook(id: AppId): void {
  const mode = radioService.getState().mode;
  if (id === "radio" && mode === "stream") radioService.stop();
  else if (id === "baby-songs" && mode === "playlist") radioService.stop();
}
