import { useRef, useState, useLayoutEffect } from "react";

/**
 * Hook that computes a CSS scale factor to make content fill its container.
 *
 * Uses ResizeObserver to watch the container. On each resize it temporarily
 * resets the inner wrapper to scale(1) to measure natural dimensions, then
 * computes the scale that fits the container.
 *
 * The consumer must:
 * - Attach `containerRef` to the outer element with resolved dimensions (e.g. flex-1)
 * - Attach `contentRef` to an inner wrapper with `display: inline-flex` or
 *   `width: max-content` so its measured size reflects actual content, not container
 * - Apply styles via the hook (it writes directly to `content.style.transform`)
 * - Optionally hide content until `ready` is true to avoid a flash of unscaled content
 */
export function useScaleToFill(options: { maxScale?: number; padding?: number } = {}) {
  const { maxScale = 5, padding = 0.88 } = options;
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  // Use refs for mutable state that shouldn't trigger re-renders / dep changes
  const scaleRef = useRef(1);
  const readyRef = useRef(false);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const content = contentRef.current;
    if (!container || !content) return;

    function recalc() {
      const ct = containerRef.current;
      const cn = contentRef.current;
      if (!ct || !cn) return;

      // Reset to natural size for measurement
      cn.style.transform = "scale(1)";

      // Force a synchronous layout read
      const containerW = ct.clientWidth;
      const containerH = ct.clientHeight;
      const contentW = cn.scrollWidth;
      const contentH = cn.scrollHeight;

      if (contentW === 0 || contentH === 0 || containerW === 0 || containerH === 0) {
        cn.style.transform = `scale(${scaleRef.current})`;
        return;
      }

      const scaleX = containerW / contentW;
      const scaleY = containerH / contentH;
      const newScale = Math.min(scaleX, scaleY, maxScale) * padding;

      scaleRef.current = newScale;
      cn.style.transform = `scale(${newScale})`;

      if (!readyRef.current) {
        readyRef.current = true;
        setReady(true);
      }
    }

    const observer = new ResizeObserver(() => {
      recalc();
    });

    observer.observe(container);

    // Initial measurement after layout
    recalc();

    return () => observer.disconnect();
  }, [maxScale, padding]);

  return { containerRef, contentRef, scale: scaleRef.current, ready };
}
