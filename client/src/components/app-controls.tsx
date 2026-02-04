import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bug, Maximize, Minimize, X, RotateCw, Volume2, Pause, MessageSquare } from "lucide-react";
import { useState, useEffect, useCallback, createContext, useContext, useRef } from "react";
import { useLocation } from "wouter";
import { radioService } from "@/lib/radio-service";
import { useQuery } from "@tanstack/react-query";

interface AppControlsContextType {
  showDebug: boolean;
  setShowDebug: (show: boolean) => void;
  debugLogs: DebugLog[];
  addDebugLog: (type: DebugLog["type"], message: string, details?: string) => void;
  clearDebugLogs: () => void;
  isFullscreen: boolean;
  toggleFullscreen: () => void;
  fullscreenRef: React.RefObject<HTMLDivElement>;
  isSettingsMode: boolean;
  setIsSettingsMode: (mode: boolean) => void;
}

interface DebugLog {
  timestamp: string;
  type: "info" | "error" | "warning";
  message: string;
  details?: string;
}

const AppControlsContext = createContext<AppControlsContextType | null>(null);

export function useAppControls() {
  const context = useContext(AppControlsContext);
  if (!context) {
    throw new Error("useAppControls must be used within AppControlsProvider");
  }
  return context;
}

export function AppControlsProvider({ children }: { children: React.ReactNode }) {
  const [showDebug, setShowDebug] = useState(false);
  const [debugLogs, setDebugLogs] = useState<DebugLog[]>([]);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isSettingsMode, setIsSettingsMode] = useState(false);
  const fullscreenRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (error) {
      console.error("Fullscreen error:", error);
    }
  }, []);

  const addDebugLog = useCallback((type: DebugLog["type"], message: string, details?: string) => {
    const log: DebugLog = {
      timestamp: new Date().toLocaleTimeString(),
      type,
      message,
      details,
    };
    setDebugLogs(prev => [...prev.slice(-50), log]);
  }, []);

  const clearDebugLogs = useCallback(() => {
    setDebugLogs([]);
  }, []);

  return (
    <AppControlsContext.Provider
      value={{
        showDebug,
        setShowDebug,
        debugLogs,
        addDebugLog,
        clearDebugLogs,
        isFullscreen,
        toggleFullscreen,
        fullscreenRef,
        isSettingsMode,
        setIsSettingsMode,
      }}
    >
      {children}
    </AppControlsContext.Provider>
  );
}

export function AppControlsWidget() {
  const {
    showDebug,
    setShowDebug,
    debugLogs,
    clearDebugLogs,
    isSettingsMode,
  } = useAppControls();

  return (
    <>
      {/* Debug Panel */}
      {showDebug && (
        <div className="fixed bottom-4 left-4 right-4 max-h-64 bg-card border rounded-lg shadow-lg z-50 overflow-hidden">
          <div className="flex items-center justify-between p-3 border-b bg-muted/50">
            <span className="font-semibold text-sm">Debug Console</span>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={clearDebugLogs}>
                Clear
              </Button>
              <Button size="icon" variant="ghost" onClick={() => setShowDebug(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="overflow-y-auto max-h-48 p-2 font-mono text-xs space-y-1">
            {debugLogs.length === 0 ? (
              <p className="text-muted-foreground p-2">No logs yet.</p>
            ) : (
              debugLogs.map((log, i) => (
                <div
                  key={i}
                  className={`p-1 rounded ${
                    log.type === "error"
                      ? "bg-destructive/10 text-destructive"
                      : log.type === "warning"
                      ? "bg-yellow-500/10 text-yellow-600"
                      : "text-muted-foreground"
                  }`}
                >
                  <span className="opacity-60">[{log.timestamp}]</span>{" "}
                  <span className="font-semibold">{log.message}</span>
                  {log.details && (
                    <pre className="mt-1 text-[10px] whitespace-pre-wrap opacity-70">
                      {log.details}
                    </pre>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Settings Mode Indicator */}
      {isSettingsMode && (
        <div className="fixed top-16 right-4 z-50 bg-primary text-primary-foreground px-3 py-1 rounded-full text-sm font-medium shadow-lg">
          Settings Mode
        </div>
      )}
    </>
  );
}

export function HeaderControls() {
  const {
    showDebug,
    setShowDebug,
    isFullscreen,
    toggleFullscreen,
  } = useAppControls();

  const [, setLocation] = useLocation();
  const [radioState, setRadioState] = useState(radioService.getState());

  const { data: unreadData } = useQuery<{ count: number }>({
    queryKey: ["/api/messages/unread-count"],
    refetchInterval: 30000,
  });

  const unreadCount = unreadData?.count || 0;

  useEffect(() => {
    const unsubState = radioService.subscribe("stateChange", setRadioState);
    const unsubTrack = radioService.subscribe("trackChange", () => {
      setRadioState(radioService.getState());
    });
    return () => {
      unsubState();
      unsubTrack();
    };
  }, []);

  const handleNowPlayingClick = () => {
    if (radioState.isPlaying) {
      radioService.pause();
    } else {
      radioService.resume();
    }
  };

  const isPlaying = radioState.isPlaying || radioState.isBuffering;
  const nowPlayingLabel = radioState.mode === "playlist"
    ? radioState.playlistName || "Baby Songs"
    : radioState.currentStation
      ? radioService.getStationByUrl(radioState.currentStation)?.name || "Radio"
      : null;

  return (
    <div className="flex items-center gap-2">
      {isPlaying && nowPlayingLabel && (
        <Button
          variant="ghost"
          size="sm"
          onClick={handleNowPlayingClick}
          className="gap-2 text-sm"
          data-testid="button-now-playing"
        >
          {radioState.isPlaying ? (
            <Volume2 className="h-4 w-4 text-primary animate-pulse" />
          ) : (
            <Pause className="h-4 w-4 text-muted-foreground" />
          )}
          <span className="max-w-32 truncate hidden sm:inline">{nowPlayingLabel}</span>
        </Button>
      )}

      {unreadCount > 0 && (
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setLocation("/messages")}
          className="relative"
          data-testid="button-unread-messages"
        >
          <MessageSquare className="h-4 w-4" />
          <Badge 
            variant="destructive" 
            className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center text-xs"
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </Badge>
        </Button>
      )}

      <Button
        variant="ghost"
        size="icon"
        onClick={() => window.location.reload()}
        data-testid="button-refresh"
        title="Refresh Page"
      >
        <RotateCw className="h-4 w-4" />
      </Button>

      <Button
        variant={showDebug ? "secondary" : "ghost"}
        size="icon"
        onClick={() => setShowDebug(!showDebug)}
        data-testid="button-debug"
        title="Toggle Debug Panel"
      >
        <Bug className="h-4 w-4" />
      </Button>

      <Button
        variant="ghost"
        size="icon"
        onClick={toggleFullscreen}
        data-testid="button-fullscreen"
        title={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
      >
        {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
      </Button>
    </div>
  );
}
