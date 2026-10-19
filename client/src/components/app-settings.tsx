import { useEffect, useRef } from "react";
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
import { appIdForPath, useAppLayout } from "@/lib/app-registry";
import { getAppManifest } from "@shared/apps";
import { AppPage } from "@/components/app-page";

export { SettingsSection, SettingsRow } from "@/components/app-settings-panels";

interface AppSettingsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AppSettingsSheet({ open, onOpenChange }: AppSettingsSheetProps) {
  const [location, setLocation] = useLocation();
  const appId = appIdForPath(location);
  const { isEnabled } = useAppLayout();
  const enabled = appId ? isEnabled(appId) : false;

  // Removing the app from inside the sheet closes it and leaves the app's pages.
  const wasEnabled = useRef(enabled);
  useEffect(() => {
    if (open && wasEnabled.current && !enabled) {
      onOpenChange(false);
      setLocation("/");
    }
    wasEnabled.current = enabled;
  }, [open, enabled, onOpenChange, setLocation]);

  if (!appId) return null;
  const manifest = getAppManifest(appId);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{manifest.title}</SheetTitle>
          <SheetDescription>{manifest.summary}</SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          <AppPage id={appId} variant="sheet" />
        </div>

        {/* Footer link to this app's settings */}
        <div className="mt-8 pt-4 border-t">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-between text-muted-foreground"
            onClick={() => {
              onOpenChange(false);
              setLocation(`/settings?section=apps&app=${appId}`);
            }}
          >
            <span className="flex items-center gap-2">
              <Settings className="h-3.5 w-3.5" />
              All settings for this app
            </span>
            <ExternalLink className="h-3 w-3" />
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
