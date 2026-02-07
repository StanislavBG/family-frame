import { useRef, useState, useEffect, useCallback } from "react";

/**
 * Hook that computes a CSS scale factor to make content fill its container.
 *
 * Uses ResizeObserver to watch the container size. On each resize (or content
 * change), it temporarily resets the inner wrapper to scale(1) to measure
 * natural dimensions, then computes the scale that fits the container.
 *
 * The consumer must:
 * - Attach `containerRef` to the outer element with resolved dimensions (e.g. flex-1)
 * - Attach `contentRef` to an inner wrapper with `display: inline-flex` or
 *   `width: max-content` so its measured size reflects actual content, not container
 * - Apply `transform: scale(scale)` and `transformOrigin: 'center'` to the content wrapper
 * - Optionally hide content until `ready` is true to avoid a flash of unscaled content
 */
export function useScaleToFill(options: { maxScale?: number; padding?: number } = {}) {
  const { maxScale = 5, padding = 0.88 } = options;
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [ready, setReady] = useState(false);

  const recalc = useCallback(() => {
    const container = containerRef.current;
    const content = contentRef.current;
    if (!container || !content) return;

    // Temporarily remove scale to measure natural content size
    content.style.transform = "none";

    const containerW = container.clientWidth;
    const containerH = container.clientHeight;
    const contentW = content.offsetWidth;
    const contentH = content.offsetHeight;

    if (contentW === 0 || contentH === 0 || containerW === 0 || containerH === 0) {
      content.style.transform = `scale(${scale})`;
      return;
    }

    const scaleX = containerW / contentW;
    const scaleY = containerH / contentH;
    const newScale = Math.min(scaleX, scaleY, maxScale) * padding;

    content.style.transform = `scale(${newScale})`;
    setScale(newScale);
    if (!ready) setReady(true);
  }, [maxScale, padding, scale, ready]);

  useEffect(() => {
    const container = containerRef.current;
    const content = contentRef.current;
    if (!container || !content) return;

    const observer = new ResizeObserver(() => {
      recalc();
    });

    observer.observe(container);
    observer.observe(content);

    // Initial measurement after first paint
    requestAnimationFrame(recalc);

    return () => observer.disconnect();
  }, [recalc]);

  return { containerRef, contentRef, scale, ready };
}
