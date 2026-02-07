import { useState, useEffect, useRef, useCallback } from "react";
import NoSleep from "nosleep.js";

export interface UseWakeLockReturn {
  isActive: boolean;
  requestWakeLock: () => Promise<void>;
  releaseWakeLock: () => void;
}

export function useWakeLock(): UseWakeLockReturn {
  const [isActive, setIsActive] = useState(false);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const noSleepRef = useRef<NoSleep | null>(null);
  const usingFallbackRef = useRef(false);

  const requestWakeLock = useCallback(async () => {
    // Try native Wake Lock API first (supported on modern browsers, iPad Safari 16.4+)
    if ("wakeLock" in navigator) {
      try {
        // Release stale lock before re-acquiring
        if (wakeLockRef.current) {
          try { await wakeLockRef.current.release(); } catch {}
          wakeLockRef.current = null;
        }
        wakeLockRef.current = await navigator.wakeLock.request("screen");
        setIsActive(true);
        console.log("[WakeLock] Acquired via Wake Lock API");
        wakeLockRef.current.addEventListener("release", () => {
          console.log("[WakeLock] Released by system");
          wakeLockRef.current = null;
          setIsActive(false);
        });
        return;
      } catch (err: any) {
        console.warn("[WakeLock] API failed:", err.message);
        // Fall through to NoSleep
      }
    }

    // Fallback: NoSleep.js (uses a hidden video trick for older devices)
    if (!noSleepRef.current) {
      noSleepRef.current = new NoSleep();
    }

    try {
      await noSleepRef.current.enable();
      usingFallbackRef.current = true;
      setIsActive(true);
      console.log("[WakeLock] Acquired via NoSleep fallback");
    } catch (err: any) {
      console.warn("[WakeLock] NoSleep fallback also failed:", err.message);
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
    setIsActive(false);
  }, []);

  useEffect(() => {
    const enableOnInteraction = () => {
      requestWakeLock();
    };

    if ("wakeLock" in navigator) {
      // Wake Lock API can be called without user gesture
      requestWakeLock();
    } else {
      // NoSleep requires a user gesture to start the hidden video
      document.addEventListener("click", enableOnInteraction, { once: true });
      document.addEventListener("touchstart", enableOnInteraction, { once: true });
    }

    // Re-acquire wake lock whenever tab becomes visible again.
    // Both the native API and NoSleep get released when the page is hidden
    // (e.g. screen off, tab switch). Always re-acquire on visibility change.
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        console.log("[WakeLock] Page visible, re-acquiring wake lock");
        requestWakeLock();
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

  return { isActive, requestWakeLock, releaseWakeLock };
}
