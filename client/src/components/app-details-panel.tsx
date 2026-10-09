import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { APP_ICONS } from "@/lib/app-registry";
import type { AppManifest } from "@shared/apps";

interface AppDetailsPanelProps {
  app: AppManifest;
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
}

export function AppDetailsPanel({ app, enabled, onToggle }: AppDetailsPanelProps) {
  const IconComponent = APP_ICONS[app.id];
  const fixed = !!app.fixed;

  return (
    <Card data-testid={`app-details-${app.id}`}>
      <CardContent className="pt-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <IconComponent className="h-6 w-6 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold">{app.title}</h3>
          </div>
          {fixed ? (
            <Badge variant="secondary">Always visible</Badge>
          ) : (
            <Badge variant={enabled ? "default" : "secondary"}>{enabled ? "On" : "Off"}</Badge>
          )}
        </div>

        <p className="font-medium">{app.summary}</p>
        <p className="text-muted-foreground">{app.description}</p>

        {app.features.length > 0 && (
          <div className="space-y-2">
            <Label className="text-sm text-muted-foreground uppercase tracking-wide">Features</Label>
            <ul className="list-disc pl-5 space-y-1 text-sm">
              {app.features.map((feature) => (
                <li key={feature}>{feature}</li>
              ))}
            </ul>
          </div>
        )}

        {!fixed && (
          <div className="flex items-center justify-between pt-4 border-t">
            <Label htmlFor={`details-switch-${app.id}`}>Show in menu</Label>
            <Switch
              id={`details-switch-${app.id}`}
              checked={enabled}
              onCheckedChange={onToggle}
              data-testid={`details-switch-${app.id}`}
            />
          </div>
        )}

        {enabled && (
          <Button asChild className="w-full" data-testid={`button-open-${app.id}`}>
            <Link href={app.url}>Open {app.title}</Link>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
