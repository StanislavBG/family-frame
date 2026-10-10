import { useCallback } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  Baby,
  Calendar,
  ChefHat,
  Clock,
  Cloud,
  Image,
  LayoutDashboard,
  LayoutGrid,
  ListChecks,
  MessageSquare,
  MonitorPlay,
  Radio,
  Settings,
  ShoppingCart,
  StickyNote,
  Tv,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import {
  moveAppInOrder,
  resolveAppLayout,
  setAppEnabled,
  type AppId,
} from "@shared/apps";
import type { UserSettings } from "@shared/schema";
import { toast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "./queryClient";
import { runAppDisableHook } from "./app-lifecycle";

export type AppLayout = ReturnType<typeof resolveAppLayout>;

export const APP_ICONS: Record<AppId, LucideIcon> = {
  home: LayoutDashboard,
  settings: Settings,
  calendar: Calendar,
  people: UserRound,
  weather: Cloud,
  clock: Clock,
  messages: MessageSquare,
  photos: Image,
  radio: Radio,
  "baby-songs": Baby,
  tv: Tv,
  stocks: BarChart3,
  chores: ListChecks,
  recipes: ChefHat,
  notepad: StickyNote,
  shopping: ShoppingCart,
  screensaver: MonitorPlay,
};

export function getAppIcon(id: string): LucideIcon {
  return (APP_ICONS as Record<string, LucideIcon | undefined>)[id] ?? LayoutGrid;
}

const SETTINGS_KEY = ["/api/settings"];

interface AppsResponse {
  visibleApps: string[];
  appOrder: string[];
}

type Change =
  | { kind: "enable"; id: AppId; enabled: boolean }
  | { kind: "move"; id: AppId; direction: "up" | "down" };

export interface UseAppLayoutResult {
  status: "loading" | "ready" | "error";
  layout: AppLayout;
  isEnabled(id: AppId): boolean;
  setEnabled(id: AppId, enabled: boolean): void;
  move(id: AppId, direction: "up" | "down"): void;
  isSaving: boolean;
}

export function useAppLayout(): UseAppLayoutResult {
  const { data: settings, isError, isPending } = useQuery<UserSettings>({
    queryKey: SETTINGS_KEY,
  });

  const mutation = useMutation<AppsResponse, Error, Change>({
    mutationFn: (change) =>
      change.kind === "enable"
        ? apiRequest<AppsResponse>("PUT", `/api/settings/apps/${change.id}`, { enabled: change.enabled })
        : apiRequest<AppsResponse>("POST", `/api/settings/apps/${change.id}/move`, { direction: change.direction }),
    onMutate: async (change) => {
      await queryClient.cancelQueries({ queryKey: SETTINGS_KEY });
      queryClient.setQueryData<UserSettings | undefined>(SETTINGS_KEY, (old) => {
        if (!old) return old;
        return change.kind === "enable"
          ? { ...old, visibleApps: setAppEnabled(old.visibleApps, change.id, change.enabled) }
          : { ...old, appOrder: moveAppInOrder(old.appOrder, change.id, change.direction) };
      });
    },
    onSuccess: (data, change) => {
      queryClient.setQueryData<UserSettings | undefined>(SETTINGS_KEY, (old) =>
        old ? { ...old, visibleApps: data.visibleApps, appOrder: data.appOrder } : old,
      );
      if (change.kind === "enable" && !change.enabled) runAppDisableHook(change.id);
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: SETTINGS_KEY });
      toast({ title: "Couldn't save your app choice", variant: "destructive" });
    },
  });

  const status: UseAppLayoutResult["status"] = isError ? "error" : isPending ? "loading" : "ready";

  let layout: AppLayout;
  if (status === "loading") {
    // Fixed apps only: an empty visibleApps list resolves to the fixed set.
    layout = resolveAppLayout({ visibleApps: [] });
  } else if (status === "error") {
    layout = resolveAppLayout(undefined);
  } else {
    layout = resolveAppLayout(settings);
  }

  const { mutate } = mutation;
  const isEnabled = useCallback(
    (id: AppId) => layout.enabledIds.includes(id),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [layout.enabledIds.join(",")],
  );
  const setEnabled = useCallback((id: AppId, enabled: boolean) => mutate({ kind: "enable", id, enabled }), [mutate]);
  const move = useCallback((id: AppId, direction: "up" | "down") => mutate({ kind: "move", id, direction }), [mutate]);

  return { status, layout, isEnabled, setEnabled, move, isSaving: mutation.isPending };
}
