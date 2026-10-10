import { useEffect, useRef, useState } from "react";
import { nextFitScale } from "@/lib/fit-scale";

/**
 * Uniformly scales content down so it fits its container's height without scrolling, keeping
 * the layout's proportions (the content is laid out at width / scale, then scaled).
 * Only active at or above `minWidth` (wall displays); smaller screens scroll normally.
 */
export function useFitScale<C extends HTMLElement, I extends HTMLElement>(minWidth = 1024) {
  const containerRef = useRef<C>(null);
  const contentRef = useRef<I>(null);
  const [scale, setScale] = useState(1);
  const [enabled, setEnabled] = useState(() => window.matchMedia(`(min-width: ${minWidth}px)`).matches);

  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${minWidth}px)`);
    const onChange = () => setEnabled(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [minWidth]);

  useEffect(() => {
    if (!enabled) {
      setScale(1);
      return;
    }
    const container = containerRef.current;
    const content = contentRef.current;
    if (!container || !content) return;
    const update = () => setScale((s) => nextFitScale(container.clientHeight, content.offsetHeight, s));
    const ro = new ResizeObserver(update);
    ro.observe(container);
    ro.observe(content);
    update();
    return () => ro.disconnect();
  }, [enabled]);

  const contentStyle: React.CSSProperties | undefined =
    enabled && scale < 1
      ? { width: `${100 / scale}%`, transform: `scale(${scale})`, transformOrigin: "top left" }
      : undefined;
  return { containerRef, contentRef, scale, enabled, contentStyle };
}
