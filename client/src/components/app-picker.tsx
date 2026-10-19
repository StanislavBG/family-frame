import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronUp, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { APP_ICONS, useAppLayout } from "@/lib/app-registry";
import { AppPage } from "@/components/app-page";
import { APP_CATEGORIES, type AppManifest } from "@shared/apps";

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

function GroupLabel({ children }: { children: ReactNode }) {
  return <h3 className="text-sm text-muted-foreground uppercase tracking-wide">{children}</h3>;
}

export function AppPicker({ initialAppId }: { initialAppId?: string | null }) {
  const { layout, setEnabled, move } = useAppLayout();
  const isLg = useIsLg();

  const onScreen = layout.movable.filter((e) => e.enabled).map((e) => e.app);
  const available = layout.movable.filter((e) => !e.enabled).map((e) => e.app);
  const allApps: AppManifest[] = [...layout.fixed, ...layout.movable.map((e) => e.app)];
  const validInitial = initialAppId && allApps.some((a) => a.id === initialAppId) ? initialAppId : null;

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

  const effectiveId = selectedId ?? (isLg ? onScreen[0]?.id ?? available[0]?.id ?? null : null);
  const selected = allApps.find((a) => a.id === effectiveId) ?? null;

  const inlineDetails = (id: string): ReactNode =>
    !isLg && selectedId === id && selected ? (
      <div className="mt-2">
        <AppPage id={selected.id} variant="full" />
      </div>
    ) : null;

  const rowClass = (isSelected: boolean, extra?: string) =>
    cn("flex items-center justify-between gap-3 p-3 rounded-lg border cursor-pointer", extra, isSelected && SELECTED_STYLE);

  const icon = (app: AppManifest) => {
    const IconComponent = APP_ICONS[app.id];
    return (
      <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
        <IconComponent className="h-4 w-4 text-primary" />
      </div>
    );
  };

  const categories = APP_CATEGORIES.map((c) => ({
    ...c,
    apps: available.filter((a) => a.category === c.id),
  })).filter((c) => c.apps.length > 0);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-1">Apps</h2>
        <p className="text-muted-foreground">Add the apps you want on this screen and set each one up.</p>
      </div>
      <div className="lg:grid lg:grid-cols-2 lg:gap-6 lg:items-start">
        <Card>
          <CardContent className="pt-6 space-y-6">
            <div className="space-y-2" data-testid="shelf-on-screen">
              <GroupLabel>On your screen</GroupLabel>
              {onScreen.length === 0 && (
                <p className="text-sm text-muted-foreground">Nothing added yet. Add apps below.</p>
              )}
              {onScreen.map((app, index) => {
                const isSelected = effectiveId === app.id;
                return (
                  <div key={app.id}>
                    <div
                      className={rowClass(isSelected, "bg-card")}
                      data-testid={`app-picker-${app.id}`}
                      {...selectableProps(isSelected, () => setSelectedId(app.id))}
                    >
                      <div className="flex items-center gap-3 min-w-0">
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
                            disabled={index === onScreen.length - 1}
                            data-testid={`button-move-down-${app.id}`}
                          >
                            <ChevronDown className="h-4 w-4" />
                          </Button>
                        </div>
                        {icon(app)}
                        <span className="font-medium">{app.title}</span>
                      </div>
                    </div>
                    {inlineDetails(app.id)}
                  </div>
                );
              })}
            </div>

            <div className="space-y-4 pt-4 border-t" data-testid="shelf-add-more">
              <GroupLabel>Add more apps</GroupLabel>
              {categories.length === 0 && (
                <p className="text-sm text-muted-foreground">You have added every app.</p>
              )}
              {categories.map((category) => (
                <div key={category.id} className="space-y-2">
                  <div className="text-sm font-medium">{category.title}</div>
                  {category.apps.map((app) => {
                    const isSelected = effectiveId === app.id;
                    return (
                      <div key={app.id}>
                        <div
                          className={rowClass(isSelected, "bg-muted/20")}
                          data-testid={`app-picker-${app.id}`}
                          {...selectableProps(isSelected, () => setSelectedId(app.id))}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            {icon(app)}
                            <div className="min-w-0">
                              <div className="font-medium">{app.title}</div>
                              <div className="text-sm text-muted-foreground">{app.summary}</div>
                            </div>
                          </div>
                          <Button
                            type="button"
                            className="min-h-11 shrink-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEnabled(app.id, true);
                              setSelectedId(app.id);
                            }}
                            onKeyDown={(e) => e.stopPropagation()}
                            data-testid={`shelf-add-${app.id}`}
                          >
                            Add
                          </Button>
                        </div>
                        {inlineDetails(app.id)}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>

            <div className="space-y-2 pt-4 border-t" data-testid="shelf-always-on">
              <GroupLabel>Always on</GroupLabel>
              {layout.fixed.map((app) => {
                const isSelected = effectiveId === app.id;
                return (
                  <div key={app.id}>
                    <div
                      className={rowClass(isSelected, "bg-muted/30")}
                      data-testid={`app-picker-${app.id}`}
                      {...selectableProps(isSelected, () => setSelectedId(app.id))}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {icon(app)}
                        <span className="font-medium">{app.title}</span>
                      </div>
                      <Badge variant="secondary">Always on</Badge>
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
            <AppPage id={selected.id} variant="full" />
          </div>
        )}
      </div>
    </div>
  );
}
