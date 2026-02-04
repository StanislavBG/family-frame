import { Button } from "@/components/ui/button";
import { Maximize, Minimize } from "lucide-react";

interface FullscreenButtonProps {
  isFullscreen: boolean;
  onToggle: () => void;
  className?: string;
}

/**
 * Reusable fullscreen toggle button.
 * Positioned fixed in top-right corner by default.
 */
export function FullscreenButton({
  isFullscreen,
  onToggle,
  className = "fixed top-4 right-4 z-50",
}: FullscreenButtonProps) {
  return (
    <div className={className}>
      <Button
        variant="secondary"
        size="icon"
        onClick={onToggle}
        className="h-10 w-10"
        data-testid="button-fullscreen"
      >
        {isFullscreen ? (
          <Minimize className="h-5 w-5" />
        ) : (
          <Maximize className="h-5 w-5" />
        )}
      </Button>
    </div>
  );
}
