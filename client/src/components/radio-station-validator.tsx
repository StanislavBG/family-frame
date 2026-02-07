import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  Loader2,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Clock,
  Wifi,
  FileAudio,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ValidationResult {
  name: string;
  url: string;
  status: "ok" | "degraded" | "error";
  responseTimeMs: number;
  contentType: string | null;
  httpStatus: number | null;
  bytesReceived: number;
  error: string | null;
  checkedAt: string;
}

interface ValidationResponse {
  summary: {
    total: number;
    ok: number;
    degraded: number;
    error: number;
  };
  stations: ValidationResult[];
}

const STATUS_CONFIG = {
  ok: {
    icon: ShieldCheck,
    label: "Healthy",
    color: "text-green-600",
    bg: "bg-green-50 border-green-200",
    badge: "bg-green-100 text-green-700",
  },
  degraded: {
    icon: ShieldAlert,
    label: "Degraded",
    color: "text-yellow-600",
    bg: "bg-yellow-50 border-yellow-200",
    badge: "bg-yellow-100 text-yellow-700",
  },
  error: {
    icon: ShieldX,
    label: "Down",
    color: "text-red-600",
    bg: "bg-red-50 border-red-200",
    badge: "bg-red-100 text-red-700",
  },
};

export function RadioStationValidator() {
  const [isOpen, setIsOpen] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [results, setResults] = useState<ValidationResponse | null>(null);
  const [lastChecked, setLastChecked] = useState<string | null>(null);

  const runValidation = async () => {
    setIsValidating(true);
    try {
      const response = await fetch("/api/radio/validate", { credentials: "include" });
      if (response.ok) {
        const data: ValidationResponse = await response.json();
        setResults(data);
        setLastChecked(new Date().toLocaleTimeString());
      }
    } catch (err) {
      console.error("[RadioValidator] Validation failed:", err);
    } finally {
      setIsValidating(false);
    }
  };

  const handleToggle = () => {
    const willOpen = !isOpen;
    setIsOpen(willOpen);
    // Auto-run validation on first open
    if (willOpen && !results && !isValidating) {
      runValidation();
    }
  };

  return (
    <div className="w-full">
      {/* Toggle Button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={handleToggle}
        className="w-full justify-between text-muted-foreground hover:text-foreground"
        data-testid="button-toggle-validator"
      >
        <span className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4" />
          Stream Health Check
        </span>
        <span className="flex items-center gap-2">
          {results && (
            <span className="flex items-center gap-1 text-xs">
              <span className="text-green-600">{results.summary.ok}</span>
              {results.summary.degraded > 0 && (
                <span className="text-yellow-600">/ {results.summary.degraded}</span>
              )}
              {results.summary.error > 0 && (
                <span className="text-red-600">/ {results.summary.error}</span>
              )}
            </span>
          )}
          {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </span>
      </Button>

      {/* Validation Panel */}
      {isOpen && (
        <Card className="mt-2 p-4 border-dashed">
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-sm font-medium">Station Diagnostics</p>
              {lastChecked && (
                <p className="text-xs text-muted-foreground">Last checked: {lastChecked}</p>
              )}
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={runValidation}
              disabled={isValidating}
              data-testid="button-run-validation"
            >
              {isValidating ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-1" />
              )}
              {isValidating ? "Checking..." : "Run Check"}
            </Button>
          </div>

          {/* Summary */}
          {results && (
            <div className="flex gap-2 mb-3">
              <Badge variant="outline" className="gap-1 bg-green-50 text-green-700 border-green-200">
                <ShieldCheck className="h-3 w-3" />
                {results.summary.ok} OK
              </Badge>
              {results.summary.degraded > 0 && (
                <Badge variant="outline" className="gap-1 bg-yellow-50 text-yellow-700 border-yellow-200">
                  <ShieldAlert className="h-3 w-3" />
                  {results.summary.degraded} Degraded
                </Badge>
              )}
              {results.summary.error > 0 && (
                <Badge variant="outline" className="gap-1 bg-red-50 text-red-700 border-red-200">
                  <ShieldX className="h-3 w-3" />
                  {results.summary.error} Down
                </Badge>
              )}
            </div>
          )}

          {/* Station List */}
          {isValidating && !results && (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">Validating streams...</span>
            </div>
          )}

          {results && (
            <ScrollArea className="max-h-64">
              <div className="space-y-2">
                {results.stations.map((station) => {
                  const config = STATUS_CONFIG[station.status];
                  const Icon = config.icon;

                  return (
                    <div
                      key={station.url}
                      className={cn(
                        "flex items-center gap-3 p-2 rounded-lg border text-sm",
                        config.bg
                      )}
                      data-testid={`validator-station-${station.name.toLowerCase().replace(/\s/g, "-")}`}
                    >
                      <Icon className={cn("h-5 w-5 flex-shrink-0", config.color)} />

                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{station.name}</p>
                        {station.error && (
                          <p className="text-xs text-muted-foreground truncate">{station.error}</p>
                        )}
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        {station.status !== "error" && (
                          <>
                            <span className="flex items-center gap-1 text-xs text-muted-foreground" title="Response time">
                              <Clock className="h-3 w-3" />
                              {station.responseTimeMs}ms
                            </span>
                            <span className="flex items-center gap-1 text-xs text-muted-foreground" title="Bytes received">
                              <Wifi className="h-3 w-3" />
                              {station.bytesReceived > 1024
                                ? `${(station.bytesReceived / 1024).toFixed(1)}KB`
                                : `${station.bytesReceived}B`}
                            </span>
                            {station.contentType && (
                              <span className="flex items-center gap-1 text-xs text-muted-foreground" title="Content type">
                                <FileAudio className="h-3 w-3" />
                                {station.contentType.split(";")[0]}
                              </span>
                            )}
                          </>
                        )}
                        <Badge className={cn("text-xs", config.badge)} variant="outline">
                          {config.label}
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </Card>
      )}
    </div>
  );
}
