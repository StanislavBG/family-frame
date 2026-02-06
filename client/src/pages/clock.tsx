import { ClockWidget } from "@/components/clock-widget";
import { Button } from "@/components/ui/button";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Clock, Watch } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { UserSettings } from "@shared/schema";

export default function ClockPage() {
  const { data: settings } = useQuery<UserSettings>({
    queryKey: ["/api/settings"],
  });

  const clockStyle = settings?.clockStyle || "analog";

  const updateSettingsMutation = useMutation({
    mutationFn: async (data: Partial<UserSettings>) => {
      return apiRequest("PATCH", "/api/settings", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
    },
  });

  const toggleClockStyle = () => {
    updateSettingsMutation.mutate({
      clockStyle: clockStyle === "analog" ? "digital" : "analog",
    });
  };

  return (
    <div className="h-full w-full bg-background flex flex-col" data-testid="clock-page">
      {/* Clock display area - fills available space */}
      <div className="flex-1 flex items-center justify-center p-4 md:p-8 min-h-0">
        <ClockWidget variant="full" />
      </div>

      {/* Toggle button at bottom */}
      <div className="flex justify-center pb-6 px-4">
        <Button
          variant="outline"
          size="lg"
          onClick={toggleClockStyle}
          className="gap-2"
          data-testid="button-toggle-clock-style"
        >
          {clockStyle === "analog" ? (
            <>
              <Watch className="h-5 w-5" />
              Switch to Digital
            </>
          ) : (
            <>
              <Clock className="h-5 w-5" />
              Switch to Analog
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
