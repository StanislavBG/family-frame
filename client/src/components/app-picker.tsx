import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { ChevronUp, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { APP_ICONS, useAppLayout } from "@/lib/app-registry";
import { AppDetailsPanel } from "@/components/app-details-panel";
import type { AppManifest } from "@shared/apps";

const LG_QUERY = "(min-width: 1024px)";

function useIsLg(): boolean {
  const [isLg, setIsLg] = useState(() =>
    typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia(LG_QUERY).matches : false,
  );
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mql = window.matchMedia(LG_QUERY);
    const onChange = () => setIsLg(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);
  return isLg;
}

function selectableProps(selected: boolean, onSelect: () => void) {
  return {
    role: "button" as const,
    tabIndex: 0,
    "aria-pressed": selected,
    onClick: onSelect,
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
      if (e.target !== e.currentTarget) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onSelect();
      }
    },
  };
}

const SELECTED_STYLE = "ring-2 ring-primary border-primary";

export function AppPicker({ initialAppId }: { initialAppId?: string | null }) {
  const { layout, setEnabled, move } = useAppLayout();
  const isLg = useIsLg();

  const allApps: { app: AppManifest; enabled: boolean }[] = [
    ...layout.fixed.map((app) => ({ app, enabled: true })),
    ...layout.movable,
  ];
  const validInitial = initialAppId && allApps.some((a) => a.app.id === initialAppId) ? initialAppId : null;

  const [selectedId, setSelectedId] = useState<string | null>(validInitial);
  const scrolledRef = useRef(false);

  // The initial id may only become valid once the layout has resolved.
  useEffect(() => {
    if (validInitial && !scrolledRef.current) {
      scrolledRef.current = true;
      setSelectedId(validInitial);
      document
        .querySelector(`[data-testid="app-picker-${validInitial}"]`)
        ?.scrollIntoView?.({ block: "center", behavior: "smooth" });
    }
  }, [validInitial]);

  const effectiveId = selectedId ?? (isLg ? layout.movable[0]?.app.id ?? null : null);
  const selected = allApps.find((a) => a.app.id === effectiveId) ?? null;

  const details = (entry: { app: AppManifest; enabled: boolean }) => (
    <AppDetailsPanel
      app={entry.app}
      enabled={entry.enabled}
      onToggle={(checked) => setEnabled(entry.app.id, checked)}
    />
  );

  const inlineDetails = (id: string): ReactNode =>
    !isLg && selectedId === id && selected ? <div className="mt-2">{details(selected)}</div> : null;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-1">App Picker</h2>
        <p className="text-muted-foreground">Choose which apps appear in your menu and arrange their order</p>
      </div>
      <div className="lg:grid lg:grid-cols-2 lg:gap-6 lg:items-start">
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground uppercase tracking-wide">Fixed Apps</Label>
              {layout.fixed.map((app) => {
                const IconComponent = APP_ICONS[app.id];
                const isSelected = effectiveId === app.id;
                return (
                  <div key={app.id}>
                    <div
                      className={cn(
                        "flex items-center justify-between p-3 rounded-lg border bg-muted/30 cursor-pointer",
                        isSelected && SELECTED_STYLE,
                      )}
                      data-testid={`app-picker-${app.id}`}
                      {...selectableProps(isSelected, () => setSelectedId(app.id))}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center">
                          <IconComponent className="h-4 w-4 text-primary" />
                        </div>
                        <span className="font-medium">{app.title}</span>
                      </div>
                      <Badge variant="secondary">Always visible</Badge>
                    </div>
                    {inlineDetails(app.id)}
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
                const isSelected = effectiveId === app.id;
                return (
                  <div key={app.id}>
                    <div
                      className={cn(
                        "flex items-center justify-between p-3 rounded-lg border cursor-pointer",
                        enabled ? "bg-card" : "bg-muted/20 opacity-60",
                        isSelected && SELECTED_STYLE,
                      )}
                      data-testid={`app-picker-${app.id}`}
                      {...selectableProps(isSelected, () => setSelectedId(app.id))}
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex flex-col gap-0.5">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={(e) => {
                              e.stopPropagation();
                              move(app.id, "up");
                            }}
                            disabled={index === 0}
                            data-testid={`button-move-up-${app.id}`}
                          >
                            <ChevronUp className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={(e) => {
                              e.stopPropagation();
                              move(app.id, "down");
                            }}
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
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                        onCheckedChange={(checked) => setEnabled(app.id, checked)}
                        data-testid={`switch-app-${app.id}`}
                      />
                    </div>
                    {inlineDetails(app.id)}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {isLg && selected && (
          <div className="sticky top-0" data-testid="app-details-column">
            {details(selected)}
          </div>
        )}
      </div>
    </div>
  );
}
