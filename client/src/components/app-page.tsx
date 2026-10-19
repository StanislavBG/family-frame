import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Check, CircleAlert } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { APP_ICONS, useAppLayout, useSettingsPatch } from "@/lib/app-registry";
import { queryKeys } from "@/lib/api";
import { APP_SETTINGS_PANELS, SettingsSection } from "@/components/app-settings-panels";
import {
  APP_NEED_COPY,
  appNeedStatus,
  getAppManifest,
  type AppId,
  type AppNeedFacts,
} from "@shared/apps";
import type { UserSettings } from "@shared/schema";

const countOf = (value: unknown, failed: boolean): number =>
  !failed && Array.isArray(value) ? value.length : 0;

export function useAppNeedFacts(): AppNeedFacts | null {
  const settings = useQuery<UserSettings>({ queryKey: queryKeys.settings() });
  const people = useQuery<unknown[]>({ queryKey: queryKeys.people() });
  const connections = useQuery<unknown[]>({ queryKey: queryKeys.connections.all() });
  const tokens = useQuery<unknown[]>({ queryKey: queryKeys.apiTokens() });

  if (!settings.data || !people.data) return null;
  return {
    hasLocation: !!settings.data.location?.city?.trim(),
    peopleCount: countOf(people.data, people.isError),
    connectionCount: countOf(connections.data, connections.isError),
    tokenCount: countOf(tokens.data, tokens.isError),
  };
}

interface AppPageProps {
  id: AppId;
  variant?: "full" | "sheet";
}

export function AppPage({ id, variant = "full" }: AppPageProps) {
  const app = getAppManifest(id);
  const Icon = APP_ICONS[id];
  const { isEnabled, setEnabled, isSaving } = useAppLayout();
  const facts = useAppNeedFacts();
  const settings = useQuery<UserSettings>({ queryKey: queryKeys.settings() }).data;
  const update = useSettingsPatch();
  const [, setLocation] = useLocation();
  const [justAdded, setJustAdded] = useState(false);

  const fixed = !!app.fixed;
  const enabled = fixed || isEnabled(id);
  const full = variant === "full";
  const panel = APP_SETTINGS_PANELS[id];
  const Panel = panel?.Panel;

  const needRows = app.needs.map((need) => ({
    need,
    status: appNeedStatus(need, facts),
    copy: APP_NEED_COPY[need],
  }));
  const highlight = justAdded && needRows.some((r) => r.status === "todo");

  const onToggle = () => {
    setJustAdded(!enabled);
    setEnabled(id, !enabled);
  };

  return (
    <div className="space-y-4" data-testid={`app-page-${id}`}>
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex items-center gap-3">
            {full && (
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Icon className="h-6 w-6 text-primary" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-semibold">{app.title}</h3>
            </div>
            <Badge variant={enabled ? "default" : "secondary"}>
              {fixed ? "Always on" : enabled ? "On your screen" : "Not added"}
            </Badge>
          </div>

          {!fixed && (
            <Button
              type="button"
              variant={enabled ? "outline" : "default"}
              className="w-full min-h-11"
              onClick={onToggle}
              disabled={isSaving}
              data-testid={`app-page-toggle-${id}`}
            >
              {enabled ? "Remove from my screen" : "Add to my screen"}
            </Button>
          )}
        </CardContent>
      </Card>

      {needRows.length > 0 && (
        <Card
          className={highlight ? "border-2 border-amber-400 dark:border-amber-500" : undefined}
          data-testid={`app-page-needs-${id}`}
        >
          <CardContent className="pt-6 space-y-3">
            <SettingsSection title="Before it works">
              <ul className="space-y-3">
                {needRows.map(({ need, status, copy }) => (
                  <li key={need} className="flex items-start gap-3">
                    <div
                      className={
                        status === "done"
                          ? "mt-0.5 h-6 w-6 shrink-0 rounded-full flex items-center justify-center bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
                          : "mt-0.5 h-6 w-6 shrink-0 rounded-full flex items-center justify-center bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                      }
                    >
                      {status === "done" ? <Check className="h-4 w-4" /> : <CircleAlert className="h-4 w-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium">{copy.label}</div>
                      <div className="text-sm text-muted-foreground">{copy.howTo}</div>
                    </div>
                    {status !== "done" && (
                      <Button asChild variant="outline" className="min-h-11 shrink-0">
                        <Link href={copy.href} data-testid={`app-page-need-${id}-${need}`}>
                          Set up
                        </Link>
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </SettingsSection>
          </CardContent>
        </Card>
      )}

      <Card data-testid={`app-page-settings-${id}`}>
        <CardContent className="pt-6">
          <SettingsSection title="Settings">
            {Panel ? (
              <Panel settings={settings} update={update} onNavigate={setLocation} />
            ) : (
              <p className="text-sm text-muted-foreground">Nothing to set up for this app.</p>
            )}
          </SettingsSection>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6 space-y-4">
          <SettingsSection title="About">
            <p className="font-medium">{app.summary}</p>
            <p className="text-muted-foreground">{app.description}</p>
            {full && app.features.length > 0 && (
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground uppercase tracking-wide">Features</Label>
                <ul className="list-disc pl-5 space-y-1 text-sm">
                  {app.features.map((feature) => (
                    <li key={feature}>{feature}</li>
                  ))}
                </ul>
              </div>
            )}
          </SettingsSection>
        </CardContent>
      </Card>

      {enabled && (
        <Button asChild className="w-full min-h-11" data-testid={`app-page-open-${id}`}>
          <Link href={app.url}>Open {app.title}</Link>
        </Button>
      )}
    </div>
  );
}
