import { Link } from "wouter";
import { getAppManifest, type AppId } from "@shared/apps";
import { APP_ICONS, useAppLayout } from "@/lib/app-registry";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";

interface AppGateProps {
  id: AppId;
  children: React.ReactNode;
}

// Renders the page only when the app is turned on; otherwise offers a one-tap "Turn on".
export function AppGate({ id, children }: AppGateProps) {
  const { status, isEnabled, setEnabled } = useAppLayout();

  if (status === "loading") return null;
  // Fail open: if settings can't be read, don't lock people out of their apps.
  if (status === "error" || isEnabled(id)) return <>{children}</>;

  const manifest = getAppManifest(id);
  return (
    <EmptyState
      icon={APP_ICONS[id]}
      title={`${manifest.title} is turned off`}
      description={`${manifest.summary} Turn it on to add it to your menu.`}
      actionLabel={`Turn on ${manifest.title}`}
      onAction={() => setEnabled(id, true)}
    >
      <div className="mt-4">
        <Button variant="ghost" asChild>
          <Link href={`/settings?section=apps&app=${id}`}>See all apps</Link>
        </Button>
      </div>
    </EmptyState>
  );
}

// Call only at module level so the returned component identity stays stable across renders.
export function withAppGate(id: AppId, Page: React.ComponentType): React.ComponentType {
  return function GatedApp() {
    return (
      <AppGate id={id}>
        <Page />
      </AppGate>
    );
  };
}
