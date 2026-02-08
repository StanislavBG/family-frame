import { useScaleToFill } from "@/hooks/use-scale-to-fill";
import { cn } from "@/lib/utils";

/**
 * A cell that independently scales its content to fill available space.
 * Uses useScaleToFill to compute a CSS scale() transform so content
 * grows to fit the container without overflow.
 */
export function ScaleCell({
  children,
  className,
  padding = 0.88,
}: {
  children: React.ReactNode;
  className?: string;
  padding?: number;
}) {
  const { containerRef, contentRef, ready } = useScaleToFill({ padding });

  return (
    <div
      ref={containerRef}
      className={cn("overflow-hidden flex items-center justify-center", className)}
    >
      <div
        ref={contentRef}
        className="inline-flex flex-col items-center"
        style={{
          transformOrigin: "center center",
          willChange: "transform",
          opacity: ready ? 1 : 0,
          transition: "opacity 150ms ease-out",
        }}
      >
        {children}
      </div>
    </div>
  );
}
