import { useEffect, useState } from "react";
import { toISODateString } from "@/lib/format";

/**
 * Today's local date as YYYY-MM-DD, re-rendering at local midnight so wall displays
 * (React Query staleTime is Infinity) roll over to the new day on their own.
 */
export function useToday(): string {
  const [today, setToday] = useState(() => toISODateString(new Date()));
  useEffect(() => {
    const now = new Date();
    const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const t = setTimeout(() => setToday(toISODateString(new Date())), nextMidnight.getTime() - now.getTime() + 1000);
    return () => clearTimeout(t);
  }, [today]);
  return today;
}
