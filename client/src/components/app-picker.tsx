import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { ChevronUp, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { APP_ICONS, useAppLayout } from "@/lib/app-registry";

export function AppPicker({ initialAppId: _initialAppId }: { initialAppId?: string | null }) {
  const { layout, setEnabled, move } = useAppLayout();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-1">App Picker</h2>
        <p className="text-muted-foreground">Choose which apps appear in your menu and arrange their order</p>
      </div>
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="space-y-2">
            <Label className="text-sm text-muted-foreground uppercase tracking-wide">Fixed Apps</Label>
            {layout.fixed.map((app) => {
              const IconComponent = APP_ICONS[app.id];
              return (
                <div
                  key={app.id}
                  className="flex items-center justify-between p-3 rounded-lg border bg-muted/30"
                  data-testid={`app-picker-${app.id}`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center">
                      <IconComponent className="h-4 w-4 text-primary" />
                    </div>
                    <span className="font-medium">{app.title}</span>
                  </div>
                  <Badge variant="secondary">Always visible</Badge>
                </div>
              );
            })}
          </div>

          <div className="space-y-2 pt-4 border-t">
            <Label className="text-sm text-muted-foreground uppercase tracking-wide">Customizable Apps</Label>
            <p className="text-sm text-muted-foreground mb-3">
              Toggle visibility and use arrows to reorder
            </p>
            {layout.movable.map(({ app, enabled }, index) => {
              const IconComponent = APP_ICONS[app.id];
              return (
                <div
                  key={app.id}
                  className={cn(
                    "flex items-center justify-between p-3 rounded-lg border",
                    enabled ? "bg-card" : "bg-muted/20 opacity-60"
                  )}
                  data-testid={`app-picker-${app.id}`}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex flex-col gap-0.5">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => move(app.id, "up")}
                        disabled={index === 0}
                        data-testid={`button-move-up-${app.id}`}
                      >
                        <ChevronUp className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => move(app.id, "down")}
                        disabled={index === layout.movable.length - 1}
                        data-testid={`button-move-down-${app.id}`}
                      >
                        <ChevronDown className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center">
                      <IconComponent className="h-4 w-4 text-primary" />
                    </div>
                    <span className="font-medium">{app.title}</span>
                  </div>
                  <Switch
                    checked={enabled}
                    onCheckedChange={(checked) => setEnabled(app.id, checked)}
                    data-testid={`switch-app-${app.id}`}
                  />
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
