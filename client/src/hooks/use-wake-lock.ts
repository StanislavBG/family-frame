import { useEffect, useRef, useCallback } from "react";
import NoSleep from "nosleep.js";

export function useWakeLock() {
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const noSleepRef = useRef<NoSleep | null>(null);
  const usingFallbackRef = useRef(false);

  const requestWakeLock = useCallback(async () => {
    if ("wakeLock" in navigator) {
      try {
        wakeLockRef.current = await navigator.wakeLock.request("screen");
        wakeLockRef.current.addEventListener("release", () => {
          wakeLockRef.current = null;
        });
        return;
      } catch {
        // Wake Lock failed, try fallback
      }
    }

    if (!noSleepRef.current) {
      noSleepRef.current = new NoSleep();
    }

    try {
      await noSleepRef.current.enable();
      usingFallbackRef.current = true;
    } catch {
      // NoSleep fallback also failed
    }
  }, []);

  const releaseWakeLock = useCallback(() => {
    if (wakeLockRef.current) {
      wakeLockRef.current.release();
      wakeLockRef.current = null;
    }
    if (noSleepRef.current && usingFallbackRef.current) {
      noSleepRef.current.disable();
      usingFallbackRef.current = false;
    }
  }, []);

  useEffect(() => {
    const enableOnInteraction = () => {
      requestWakeLock();
      document.removeEventListener("click", enableOnInteraction);
      document.removeEventListener("touchstart", enableOnInteraction);
    };

    if ("wakeLock" in navigator) {
      requestWakeLock();
    } else {
      document.addEventListener("click", enableOnInteraction, { once: true });
      document.addEventListener("touchstart", enableOnInteraction, { once: true });
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        if (!wakeLockRef.current && !usingFallbackRef.current) {
          requestWakeLock();
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      document.removeEventListener("click", enableOnInteraction);
      document.removeEventListener("touchstart", enableOnInteraction);
      releaseWakeLock();
    };
  }, [requestWakeLock, releaseWakeLock]);

  return { requestWakeLock, releaseWakeLock };
}
