import { ReactNode, useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Settings,
  Thermometer,
  Clock,
  Eye,
  Camera,
  Image,
  Check,
  Plus,
  Trash2,
  RefreshCw,
  ExternalLink,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { UserSettings } from "@shared/schema";
import {
  PhotoSource,
  availableStocks,
  BABY_AGE_RANGES,
  TV_CHANNELS,
} from "@shared/schema";

// ── Route → app settings mapping ───────────────────────────────────
// Only routes listed here show the gear icon and have an in-app panel.
export const routeToAppId: Record<string, string> = {
  "/weather": "weather",
  "/photos": "picture-frame",
  "/clock": "clock",
  "/baby-songs": "baby-songs",
  "/tv": "tv",
  "/stocks": "stocks",
};

const appMeta: Record<string, { title: string; description: string }> = {
  weather: { title: "Weather Settings", description: "Configure how weather is displayed" },
  clock: { title: "Clock Settings", description: "Configure how the clock is displayed" },
  "picture-frame": { title: "Picture Frame", description: "Photo source and slideshow settings" },
  "baby-songs": { title: "Baby Songs", description: "Set age-appropriate content" },
  tv: { title: "TV Settings", description: "Configure your TV experience" },
  stocks: { title: "Stock Tracker", description: "Select stocks to track" },
};

// ── Reusable building blocks ───────────────────────────────────────

export function SettingsSection({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div className="space-y-4">
      {title && (
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          {title}
        </h3>
      )}
      <div className="space-y-4">{children}</div>
    </div>
  );
}

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
        {description && <div className="text-xs text-muted-foreground">{description}</div>}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
}

// ── Main Sheet component ───────────────────────────────────────────

interface AppSettingsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AppSettingsSheet({ open, onOpenChange }: AppSettingsSheetProps) {
  const [location, setLocation] = useLocation();
  const appId = routeToAppId[location] || null;
  const meta = appId ? appMeta[appId] : null;

  const { data: settings } = useQuery<UserSettings>({
    queryKey: ["/api/settings"],
    enabled: open,
  });

  const { toast } = useToast();
  const updateSettings = useMutation({
    mutationFn: (data: Partial<UserSettings>) =>
      apiRequest("PATCH", "/api/settings", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to save", description: error.message, variant: "destructive" });
    },
  });

  const update = (patch: Partial<UserSettings>) => updateSettings.mutate(patch);

  if (!appId || !meta) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{meta.title}</SheetTitle>
          <SheetDescription>{meta.description}</SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {appId === "weather" && <WeatherPanel settings={settings} update={update} />}
          {appId === "clock" && <ClockPanel settings={settings} update={update} />}
          {appId === "picture-frame" && (
            <PictureFramePanel settings={settings} update={update} onNavigate={(path) => { onOpenChange(false); setLocation(path); }} />
          )}
          {appId === "baby-songs" && <BabySongsPanel settings={settings} update={update} />}
          {appId === "tv" && <TVPanel settings={settings} update={update} />}
          {appId === "stocks" && <StocksPanel settings={settings} update={update} />}
        </div>

        {/* Footer link to global settings */}
        <div className="mt-8 pt-4 border-t">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-between text-muted-foreground"
            onClick={() => {
              onOpenChange(false);
              setLocation("/settings");
            }}
          >
            <span className="flex items-center gap-2">
              <Settings className="h-3.5 w-3.5" />
              All Settings
            </span>
            <ExternalLink className="h-3 w-3" />
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ── Per-app panels ─────────────────────────────────────────────────

interface PanelProps {
  settings: UserSettings | undefined;
  update: (patch: Partial<UserSettings>) => void;
}

function WeatherPanel({ settings, update }: PanelProps) {
  const unit = settings?.temperatureUnit || "celsius";
  const displayMode = settings?.weatherDisplayMode || "dense";
  const timeFormat = settings?.timeFormat || "24h";

  return (
    <>
      <SettingsSection title="Display">
        <SettingsRow label="Temperature Unit" description="Choose your preferred unit">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">°C</span>
            <Switch
              checked={unit === "fahrenheit"}
              onCheckedChange={(checked) =>
                update({ temperatureUnit: checked ? "fahrenheit" : "celsius" })
              }
              data-testid="switch-temp-unit"
            />
            <span className="text-xs text-muted-foreground">°F</span>
          </div>
        </SettingsRow>

        <SettingsRow label="Display Mode" description="Dense shows more data, Light is cleaner">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Dense</span>
            <Switch
              checked={displayMode === "light"}
              onCheckedChange={(checked) =>
                update({ weatherDisplayMode: checked ? "light" : "dense" })
              }
              data-testid="switch-weather-display-mode"
            />
            <span className="text-xs text-muted-foreground">Light</span>
          </div>
        </SettingsRow>

        <SettingsRow label="Time Format" description="12-hour or 24-hour display">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">12h</span>
            <Switch
              checked={timeFormat === "24h"}
              onCheckedChange={(checked) =>
                update({ timeFormat: checked ? "24h" : "12h" })
              }
              data-testid="switch-time-format"
            />
            <span className="text-xs text-muted-foreground">24h</span>
          </div>
        </SettingsRow>
      </SettingsSection>
    </>
  );
}

function ClockPanel({ settings, update }: PanelProps) {
  const clockStyle = settings?.clockStyle || "analog";
  const timeFormat = settings?.timeFormat || "24h";

  return (
    <>
      <SettingsSection title="Display">
        <SettingsRow label="Clock Style" description="Choose analog or digital display">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Analog</span>
            <Switch
              checked={clockStyle === "digital"}
              onCheckedChange={(checked) =>
                update({ clockStyle: checked ? "digital" : "analog" })
              }
              data-testid="switch-clock-style"
            />
            <span className="text-xs text-muted-foreground">Digital</span>
          </div>
        </SettingsRow>

        <SettingsRow label="Time Format" description="12-hour or 24-hour display">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">12h</span>
            <Switch
              checked={timeFormat === "24h"}
              onCheckedChange={(checked) =>
                update({ timeFormat: checked ? "24h" : "12h" })
              }
              data-testid="switch-time-format"
            />
            <span className="text-xs text-muted-foreground">24h</span>
          </div>
        </SettingsRow>
      </SettingsSection>
    </>
  );
}

// ── Picture Frame panel ────────────────────────────────────────────

interface PickerSession {
  id: string;
  pickerUri?: string;
  mediaItemsSet?: boolean;
}

function PictureFramePanel({
  settings,
  update,
  onNavigate,
}: PanelProps & { onNavigate: (path: string) => void }) {
  const { toast } = useToast();

  // Slideshow interval local state
  const [localInterval, setLocalInterval] = useState(settings?.photoInterval || 10);
  useEffect(() => {
    if (settings?.photoInterval) setLocalInterval(settings.photoInterval);
  }, [settings?.photoInterval]);

  // Google Photos picker state
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [pollingSession, setPollingSession] = useState<string | null>(null);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  const { data: pickerSessionData } = useQuery<{
    hasSession: boolean;
    photoCount: number;
    session?: PickerSession;
  }>({
    queryKey: ["/api/google/picker/current"],
    enabled: settings?.googlePhotosConnected === true,
    staleTime: 0,
  });

  const connectGoogleMutation = useMutation({
    mutationFn: async () => apiRequest("GET", "/api/google/auth-url") as Promise<{ url: string }>,
    onSuccess: (data) => { window.location.href = data.url; },
    onError: (error: Error) => {
      toast({ title: "Failed to connect Google Photos", description: error.message, variant: "destructive" });
    },
  });

  const disconnectGoogleMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", "/api/google/disconnect"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({ title: "Google Photos disconnected" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to disconnect", description: error.message, variant: "destructive" });
    },
  });

  const createPickerMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/google/picker/session") as Promise<PickerSession>,
    onSuccess: (session) => {
      if (session.pickerUri) {
        window.open(session.pickerUri, "_blank", "width=800,height=600");
        setIsPickerOpen(true);
        setPollingSession(session.id);
        toast({ title: "Photo Picker opened", description: "Select your photos in the new window." });
      }
    },
    onError: (error: Error) => {
      toast({ title: "Failed to open picker", description: error.message, variant: "destructive" });
    },
  });

  const clearPhotosMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", "/api/photos/all") as Promise<{ success: boolean }>,
    onSuccess: () => {
      toast({ title: "Photos cleared" });
      queryClient.invalidateQueries({ queryKey: ["/api/google/picker/current"] });
      queryClient.invalidateQueries({ queryKey: ["/api/photos"] });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to clear photos", description: error.message, variant: "destructive" });
    },
  });

  // Poll picker session
  useEffect(() => {
    if (!pollingSession) return;
    const poll = async () => {
      try {
        const resp = await apiRequest("GET", `/api/google/picker/session/${pollingSession}`) as PickerSession;
        if (resp.mediaItemsSet) {
          setIsPickerOpen(false);
          setPollingSession(null);
          if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
          queryClient.invalidateQueries({ queryKey: ["/api/google/picker/current"] });
          queryClient.invalidateQueries({ queryKey: ["/api/photos"] });
          toast({ title: "Photos selected!", description: "Your photos are ready for the Picture Frame." });
        }
      } catch { /* polling error, retry */ }
    };
    pollingRef.current = setInterval(poll, 3000);
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, [pollingSession]);

  useEffect(() => {
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, []);

  return (
    <>
      {/* Google Photos connection */}
      <SettingsSection title="Google Photos">
        {settings?.googlePhotosConnected ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
              <div className="flex items-center gap-2">
                <Check className="h-4 w-4 text-green-600 dark:text-green-400" />
                <span className="text-sm font-medium text-green-700 dark:text-green-300">Connected</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => disconnectGoogleMutation.mutate()}
                disabled={disconnectGoogleMutation.isPending}
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5 mr-1" />
                Disconnect
              </Button>
            </div>

            {/* Picker */}
            {isPickerOpen ? (
              <div className="p-4 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20">
                <div className="flex items-center gap-2 mb-2">
                  <RefreshCw className="h-4 w-4 text-amber-600 dark:text-amber-400 animate-spin" />
                  <span className="text-sm font-medium text-amber-700 dark:text-amber-300">
                    Waiting for selection...
                  </span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setIsPickerOpen(false);
                    setPollingSession(null);
                    if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
                  }}
                >
                  Cancel
                </Button>
              </div>
            ) : pickerSessionData?.hasSession && pickerSessionData.photoCount > 0 ? (
              <div className="flex items-center justify-between p-3 rounded-lg border bg-card">
                <div className="flex items-center gap-2">
                  <Image className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">
                    {pickerSessionData.photoCount} {pickerSessionData.photoCount === 1 ? "photo" : "photos"} selected
                  </span>
                </div>
                <div className="flex gap-1">
                  <Button variant="outline" size="sm" onClick={() => createPickerMutation.mutate()} disabled={createPickerMutation.isPending}>
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Add
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => clearPhotosMutation.mutate()} disabled={clearPhotosMutation.isPending}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                variant="outline"
                className="w-full"
                onClick={() => createPickerMutation.mutate()}
                disabled={createPickerMutation.isPending}
              >
                <Camera className="h-4 w-4 mr-2" />
                {createPickerMutation.isPending ? "Opening..." : "Select Photos"}
              </Button>
            )}
          </div>
        ) : (
          <Button
            className="w-full"
            onClick={() => connectGoogleMutation.mutate()}
            disabled={connectGoogleMutation.isPending}
          >
            <Camera className="h-4 w-4 mr-2" />
            {connectGoogleMutation.isPending ? "Connecting..." : "Connect Google Photos"}
          </Button>
        )}
      </SettingsSection>

      {/* Display settings */}
      <SettingsSection title="Display">
        <SettingsRow label="Photo Source">
          <Select
            value={settings?.photoSource || PhotoSource.PIXABAY}
            onValueChange={(value) =>
              update({ photoSource: value as typeof PhotoSource.GOOGLE_PHOTOS | typeof PhotoSource.PIXABAY })
            }
          >
            <SelectTrigger className="w-[160px]" data-testid="select-photo-source-trigger">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={PhotoSource.GOOGLE_PHOTOS}>Google Photos</SelectItem>
              <SelectItem value={PhotoSource.PIXABAY}>Pixabay Ambient</SelectItem>
            </SelectContent>
          </Select>
        </SettingsRow>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">Slideshow Interval</Label>
            <span className="text-sm text-muted-foreground">{localInterval}s</span>
          </div>
          <Slider
            value={[localInterval]}
            onValueChange={(vals) => setLocalInterval(vals[0])}
            onValueCommit={(vals) => update({ photoInterval: vals[0] })}
            min={5}
            max={60}
            step={5}
            className="w-full"
            data-testid="slider-photo-interval"
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>5s</span>
            <span>30s</span>
            <span>60s</span>
          </div>
        </div>
      </SettingsSection>
    </>
  );
}

function BabySongsPanel({ settings, update }: PanelProps) {
  const ageMonths = settings?.babyAgeMonths ?? 12;
  const currentGroupId =
    BABY_AGE_RANGES.find((r) => ageMonths >= r.minMonths && ageMonths < r.maxMonths)?.id ||
    BABY_AGE_RANGES[BABY_AGE_RANGES.length - 1].id;

  return (
    <SettingsSection title="Content">
      <SettingsRow label="Child's Age Group" description="Filters songs for the selected age">
        <Select
          value={currentGroupId}
          onValueChange={(value) => {
            const range = BABY_AGE_RANGES.find((r) => r.id === value);
            if (range) update({ babyAgeMonths: range.defaultAge });
          }}
        >
          <SelectTrigger className="w-[160px]" data-testid="select-baby-age-panel">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {BABY_AGE_RANGES.map((range) => (
              <SelectItem key={range.id} value={range.id}>
                {range.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </SettingsRow>
    </SettingsSection>
  );
}

function TVPanel({ settings, update }: PanelProps) {
  const [localVolume, setLocalVolume] = useState(settings?.tvVolume ?? 50);
  useEffect(() => {
    if (settings?.tvVolume !== undefined) setLocalVolume(settings.tvVolume);
  }, [settings?.tvVolume]);

  return (
    <>
      <SettingsSection title="Playback">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">Default Volume</Label>
            <span className="text-sm text-muted-foreground">{localVolume}%</span>
          </div>
          <Slider
            value={[localVolume]}
            onValueChange={(vals) => setLocalVolume(vals[0])}
            onValueCommit={(vals) => update({ tvVolume: vals[0] })}
            min={0}
            max={100}
            step={5}
            className="w-full"
            data-testid="slider-tv-volume"
          />
        </div>

        <SettingsRow label="Default Channel" description="Pre-selected when opening TV">
          <Select
            value={settings?.lastTvChannel || ""}
            onValueChange={(value) => update({ lastTvChannel: value })}
          >
            <SelectTrigger className="w-[160px]" data-testid="select-default-channel">
              <SelectValue placeholder="None" />
            </SelectTrigger>
            <SelectContent>
              {TV_CHANNELS.map((ch) => (
                <SelectItem key={ch.url} value={ch.url}>
                  <div className="flex items-center gap-2">
                    {ch.logo && <img src={ch.logo} alt="" className="w-4 h-4 object-contain rounded" />}
                    <span>{ch.name}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingsRow>
      </SettingsSection>
    </>
  );
}

function StocksPanel({ settings, update }: PanelProps) {
  const currentStocks = settings?.trackedStocks || ["DJI", "VNQ", "BTC"];

  return (
    <SettingsSection title="Tracked Stocks">
      <div className="space-y-3">
        {availableStocks.map((stock) => {
          const isTracked = currentStocks.includes(stock.symbol);
          return (
            <div
              key={stock.symbol}
              className="flex items-center justify-between p-3 rounded-lg border bg-card"
            >
              <div>
                <p className="text-sm font-medium">{stock.name}</p>
                <p className="text-xs text-muted-foreground">{stock.symbol}</p>
              </div>
              <Switch
                checked={isTracked}
                onCheckedChange={(checked) => {
                  const newStocks = checked
                    ? [...currentStocks, stock.symbol]
                    : currentStocks.filter((s) => s !== stock.symbol);
                  update({ trackedStocks: newStocks });
                }}
                data-testid={`switch-stock-${stock.symbol.toLowerCase()}`}
              />
            </div>
          );
        })}
      </div>
    </SettingsSection>
  );
}
