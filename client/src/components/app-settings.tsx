import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Settings, ExternalLink } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { UserSettings } from "@shared/schema";
import { APP_MANIFESTS, type AppId } from "@shared/apps";
import { APP_SETTINGS_PANELS } from "@/components/app-settings-panels";

export { SettingsSection, SettingsRow } from "@/components/app-settings-panels";

// ── Route → app settings mapping ───────────────────────────────────
// Only apps with a registered settings panel show the gear icon.
export const routeToAppId: Record<string, AppId> = Object.fromEntries(
  APP_MANIFESTS.filter((m) => APP_SETTINGS_PANELS[m.id]).map((m) => [m.url, m.id]),
);

// ── Main Sheet component ───────────────────────────────────────────

interface AppSettingsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AppSettingsSheet({ open, onOpenChange }: AppSettingsSheetProps) {
  const [location, setLocation] = useLocation();
  const appId = routeToAppId[location] || null;
  const entry = appId ? APP_SETTINGS_PANELS[appId] : undefined;

  const { data: settings } = useQuery<UserSettings>({
    queryKey: ["/api/settings"],
    enabled: open,
  });

  const { toast } = useToast();
  const updateSettings = useMutation({
    mutationFn: (data: Partial<UserSettings>) =>
      apiRequest("PATCH", "/api/settings", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to save", description: error.message, variant: "destructive" });
    },
  });

  const update = (patch: Partial<UserSettings>) => updateSettings.mutate(patch);

  if (!appId || !entry) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{entry.title}</SheetTitle>
          <SheetDescription>{entry.description}</SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          <entry.Panel
            settings={settings}
            update={update}
            onNavigate={(path) => { onOpenChange(false); setLocation(path); }}
          />
        </div>

        {/* Footer link to global settings */}
        <div className="mt-8 pt-4 border-t">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-between text-muted-foreground"
            onClick={() => {
              onOpenChange(false);
              setLocation("/settings");
            }}
          >
            <span className="flex items-center gap-2">
              <Settings className="h-3.5 w-3.5" />
              All Settings
            </span>
            <ExternalLink className="h-3 w-3" />
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
