export const FIT_SCALE_MIN = 0.6;
const EPSILON = 0.005;
// Growing back by less than this is ignored, so text re-wrapping can't make the scale oscillate.
const GROW_HYSTERESIS = 0.02;

/**
 * Next uniform scale that makes content of `naturalHeight` (laid out at the current scale's
 * virtual width) fit `availableHeight`. Never above 1, never below `min` (below it the page scrolls).
 */
export function nextFitScale(availableHeight: number, naturalHeight: number, current: number, min = FIT_SCALE_MIN): number {
  if (availableHeight <= 0 || naturalHeight <= 0) return current;
  const target = Math.min(1, Math.max(min, availableHeight / naturalHeight));
  if (Math.abs(target - current) < EPSILON) return current;
  if (target > current && target - current < GROW_HYSTERESIS && target < 1) return current;
  return Math.round(target * 1000) / 1000;
}
