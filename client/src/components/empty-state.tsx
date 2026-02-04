import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  actionVariant?: "default" | "outline" | "secondary";
  children?: React.ReactNode;
}

/**
 * Reusable empty state component for pages with no data.
 * Displays an icon, title, description, and optional action button.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  actionVariant = "default",
  children,
}: EmptyStateProps) {
  return (
    <div className="h-full flex items-center justify-center p-8">
      <Card className="max-w-lg">
        <CardContent className="p-12 text-center">
          <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-6">
            <Icon className="h-10 w-10 text-primary" />
          </div>
          <h2 className="text-2xl font-semibold mb-3">{title}</h2>
          <p className="text-muted-foreground mb-6 leading-relaxed">{description}</p>
          {actionLabel && onAction && (
            <Button size="lg" variant={actionVariant} onClick={onAction}>
              {actionLabel}
            </Button>
          )}
          {children}
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Simpler inline empty state for use within cards or sections.
 */
interface InlineEmptyStateProps {
  icon: LucideIcon;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function InlineEmptyState({
  icon: Icon,
  message,
  actionLabel,
  onAction,
}: InlineEmptyStateProps) {
  return (
    <div className="py-12 text-center">
      <Icon className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
      <p className="text-muted-foreground mb-4">{message}</p>
      {actionLabel && onAction && (
        <Button variant="outline" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
