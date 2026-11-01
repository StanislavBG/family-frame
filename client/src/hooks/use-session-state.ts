import { useCallback, useSyncExternalStore } from "react";

/** Minimal storage surface so tests can pass a fake. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

interface Entry {
  value: unknown;
  listeners: Set<() => void>;
}

const PREFIX = "ff:session-state:";
const store = new Map<string, Entry>();

function defaultStorage(): StorageLike | undefined {
  try {
    return typeof sessionStorage !== "undefined" ? sessionStorage : undefined;
  } catch {
    return undefined;
  }
}

/** Read a stored value; any failure (no storage, exception, bad JSON, parse reject) gives `initial`. */
export function readStored<T>(
  key: string,
  initial: T,
  parse: (raw: unknown) => T,
  storage: StorageLike | undefined = defaultStorage(),
): T {
  if (!storage) return initial;
  try {
    const raw = storage.getItem(PREFIX + key);
    if (raw === null) return initial;
    return parse(JSON.parse(raw));
  } catch {
    return initial;
  }
}

/** Persist a value; failures are swallowed (the module store still holds it). */
export function writeStored(key: string, value: unknown, storage: StorageLike | undefined = defaultStorage()): void {
  if (!storage) return;
  try {
    storage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // quota, private mode, etc.
  }
}

function getEntry<T>(key: string, initial: T, parse: (raw: unknown) => T): Entry {
  let entry = store.get(key);
  if (!entry) {
    entry = { value: readStored(key, initial, parse), listeners: new Set() };
    store.set(key, entry);
  }
  return entry;
}

/** Imperative access to the shared store (what the hook wraps). */
export function getSessionValue<T>(key: string, initial: T, parse: (raw: unknown) => T): T {
  return getEntry(key, initial, parse).value as T;
}

export function setSessionValue<T>(key: string, next: T, initial: T, parse: (raw: unknown) => T): void {
  const entry = getEntry(key, initial, parse);
  if (Object.is(next, entry.value)) return;
  entry.value = next;
  writeStored(key, next);
  entry.listeners.forEach((l) => l());
}

/** Test helper: drop all in-memory state. */
export function resetSessionStateStore(): void {
  store.clear();
}

/**
 * State shared by key across components, kept in a module store (outlives unmounts)
 * and mirrored to sessionStorage (outlives reloads). `parse` validates anything read back.
 */
export function useSessionState<T>(
  key: string,
  initial: T,
  parse: (raw: unknown) => T,
): [T, (next: T | ((prev: T) => T)) => void] {
  const subscribe = useCallback(
    (cb: () => void) => {
      const entry = getEntry(key, initial, parse);
      entry.listeners.add(cb);
      return () => {
        entry.listeners.delete(cb);
      };
    },
    // initial/parse are only used for first hydration of the key
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  );
  const value = useSyncExternalStore(
    subscribe,
    () => getEntry(key, initial, parse).value as T,
    () => initial,
  );
  const setValue = useCallback(
    (next: T | ((prev: T) => T)) => {
      const prev = getSessionValue(key, initial, parse);
      setSessionValue(key, typeof next === "function" ? (next as (p: T) => T)(prev) : next, initial, parse);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  );
  return [value, setValue];
}
