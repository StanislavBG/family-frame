import { ClockWidget } from "@/components/clock-widget";
import { AppSettings, SettingsSection, SettingsRow } from "@/components/app-settings";
import { Switch } from "@/components/ui/switch";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { UserSettings } from "@shared/schema";

export default function ClockPage() {
  const { data: settings } = useQuery<UserSettings>({
    queryKey: ["/api/settings"],
  });

  const clockStyle = settings?.clockStyle || "analog";
  const timeFormat = settings?.timeFormat || "24h";

  const updateSettingsMutation = useMutation({
    mutationFn: async (data: Partial<UserSettings>) => {
      return apiRequest("PATCH", "/api/settings", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
    },
  });

  return (
    <div className="h-full w-full bg-background flex flex-col" data-testid="clock-page">
      {/* Clock display area - fills available space */}
      <div className="flex-1 flex items-center justify-center p-4 md:p-8 min-h-0">
        <ClockWidget variant="full" />
      </div>

      {/* In-App Settings */}
      <AppSettings title="Clock Settings" description="Configure how the clock is displayed">
        <SettingsSection title="Display">
          <SettingsRow
            label="Clock Style"
            description="Choose analog or digital display"
          >
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Analog</span>
              <Switch
                checked={clockStyle === "digital"}
                onCheckedChange={(checked) =>
                  updateSettingsMutation.mutate({
                    clockStyle: checked ? "digital" : "analog",
                  })
                }
                data-testid="switch-clock-style"
              />
              <span className="text-xs text-muted-foreground">Digital</span>
            </div>
          </SettingsRow>

          <SettingsRow
            label="Time Format"
            description="12-hour or 24-hour display"
          >
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">12h</span>
              <Switch
                checked={timeFormat === "24h"}
                onCheckedChange={(checked) =>
                  updateSettingsMutation.mutate({
                    timeFormat: checked ? "24h" : "12h",
                  })
                }
                data-testid="switch-time-format"
              />
              <span className="text-xs text-muted-foreground">24h</span>
            </div>
          </SettingsRow>
        </SettingsSection>
      </AppSettings>
    </div>
  );
}
