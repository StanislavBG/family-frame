import { useState, useEffect, useCallback, useRef } from "react";

export interface UseFullscreenOptions {
  /**
   * Callback when exiting fullscreen (after auto-enter).
   * Useful for navigating away from a page when user exits fullscreen.
   */
  onExit?: () => void;
  /**
   * Automatically enter fullscreen on mount.
   */
  autoEnter?: boolean;
}

/**
 * Hook to manage fullscreen state for a container element.
 *
 * @param options - Configuration options
 * @returns Object with isFullscreen state, toggleFullscreen function, and containerRef
 *
 * @example
 * // Basic usage
 * const { isFullscreen, toggleFullscreen, containerRef } = useFullscreen();
 *
 * @example
 * // Auto-enter fullscreen and navigate home on exit
 * const { isFullscreen, toggleFullscreen, containerRef } = useFullscreen({
 *   autoEnter: true,
 *   onExit: () => navigate("/"),
 * });
 */
export function useFullscreen(options: UseFullscreenOptions = {}) {
  const { onExit, autoEnter = false } = options;
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const hasAutoEntered = useRef(false);
  const onExitRef = useRef(onExit);

  // Keep onExit ref updated to avoid stale closures
  useEffect(() => {
    onExitRef.current = onExit;
  }, [onExit]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      const nowFullscreen = !!document.fullscreenElement;
      const wasFullscreen = isFullscreen;
      setIsFullscreen(nowFullscreen);

      // Call onExit when exiting fullscreen after auto-enter
      if (wasFullscreen && !nowFullscreen && hasAutoEntered.current) {
        onExitRef.current?.();
      }
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, [isFullscreen]);

  // Auto-enter fullscreen on mount if requested
  useEffect(() => {
    if (autoEnter && containerRef.current && !hasAutoEntered.current && !document.fullscreenElement) {
      hasAutoEntered.current = true;
      containerRef.current.requestFullscreen().catch((error) => {
        console.log("Auto-fullscreen not allowed:", error);
      });
    }
  }, [autoEnter]);

  const toggleFullscreen = useCallback(async () => {
    if (!containerRef.current) return;

    try {
      if (!document.fullscreenElement) {
        await containerRef.current.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (error) {
      console.error("Fullscreen error:", error);
    }
  }, []);

  return { isFullscreen, toggleFullscreen, containerRef };
}
