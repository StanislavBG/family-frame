import { Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ReactNode } from "react";

interface AppSettingsProps {
  title: string;
  description?: string;
  children: ReactNode;
}

/**
 * In-App Settings button and sheet.
 * Place this in any app page to provide app-specific configuration.
 *
 * Usage:
 * <AppSettings title="Clock Settings" description="Configure the clock display">
 *   <YourSettingsContent />
 * </AppSettings>
 */
export function AppSettings({ title, description, children }: AppSettingsProps) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="fixed top-2 right-48 z-50 h-9 w-9"
          data-testid="button-app-settings"
        >
          <Settings className="h-4 w-4" />
          <span className="sr-only">Open {title}</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          {description && <SheetDescription>{description}</SheetDescription>}
        </SheetHeader>
        <div className="mt-6 space-y-6">
          {children}
        </div>
      </SheetContent>
    </Sheet>
  );
}

/**
 * Settings section within AppSettings
 */
export function SettingsSection({
  title,
  children
}: {
  title?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-4">
      {title && (
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          {title}
        </h3>
      )}
      <div className="space-y-4">
        {children}
      </div>
    </div>
  );
}

/**
 * Individual setting row with label and control
 */
export function SettingsRow({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="space-y-0.5">
        <div className="text-sm font-medium">{label}</div>
        {description && (
          <div className="text-xs text-muted-foreground">{description}</div>
        )}
      </div>
      <div className="flex-shrink-0">
        {children}
      </div>
    </div>
  );
}
