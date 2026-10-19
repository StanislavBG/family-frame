import { useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { STARTER_PACKS } from "@shared/apps";

export function WelcomeCard({ kind }: { kind: "new" | "legacy" }) {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [pending, setPending] = useState(false);

  const submit = async (packId: string | null, after?: () => void) => {
    setPending(true);
    try {
      await apiRequest("POST", "/api/settings/apps/setup", {
        packId,
        mode: kind === "new" ? "add" : "replace",
      });
      await queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      after?.();
    } catch {
      toast({
        title: "Could not save your choice",
        description: "Please try again.",
        variant: "destructive",
      });
    } finally {
      setPending(false);
    }
  };

  return (
    <Card className="border-primary/30 bg-primary/5 dark:bg-primary/10" data-testid="welcome-card">
      <CardContent className="p-4 md:p-6 space-y-4">
        <div className="space-y-1">
          <h2 className="text-xl md:text-2xl font-semibold text-foreground">What is this screen for?</h2>
          <p className="text-sm md:text-base text-muted-foreground">
            {kind === "new"
              ? "Pick one and we will add the apps it needs. You can change this any time in Settings > Apps."
              : "All apps are on now. Pick one to show just those apps, or keep everything. Any app can be added back in Settings > Apps."}
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {STARTER_PACKS.map((pack) => (
            <Button
              key={pack.id}
              variant="outline"
              disabled={pending}
              onClick={() => submit(pack.id)}
              className="h-auto min-h-[44px] w-full flex-col items-start gap-1 whitespace-normal p-4 text-left bg-card dark:bg-card"
              data-testid={`welcome-pack-${pack.id}`}
            >
              <span className="text-base font-semibold text-foreground">{pack.title}</span>
              <span className="text-sm font-normal text-muted-foreground">{pack.description}</span>
            </Button>
          ))}
        </div>
        <Button
          variant="ghost"
          disabled={pending}
          className="min-h-[44px]"
          onClick={() =>
            submit(null, kind === "new" ? () => setLocation("/settings?section=apps") : undefined)
          }
          data-testid="welcome-skip"
        >
          {kind === "new" ? "I'll choose myself" : "Keep all my apps"}
        </Button>
      </CardContent>
    </Card>
  );
}
