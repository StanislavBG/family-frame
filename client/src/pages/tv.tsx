import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { Tv, Volume2, VolumeX, Maximize, Minimize, Play, Pause, Loader2, ChevronRight, ChevronLeft, Settings2, Clock, RefreshCw } from "lucide-react";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import Hls from "hls.js";
import { useAppControls } from "@/components/app-controls";
import type { TVChannel, UserSettings } from "@shared/schema";

type ChannelsByCountry = Record<string, TVChannel[]>;

interface QualityLevel {
  index: number;
  height: number;
  bitrate: number;
  label: string;
}

const COUNTRY_FLAGS: Record<string, string> = {
  "Bulgaria": "🇧🇬",
  "Serbia": "🇷🇸",
  "Greece": "🇬🇷",
  "Russia": "🇷🇺",
};

const AUTO_HIDE_DELAY = 4000; // 4 seconds
const RECONNECT_DELAYS = [2000, 4000, 8000, 16000]; // Exponential backoff

function useVideoFullscreen() {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const videoContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    if (!videoContainerRef.current) return;

    try {
      if (!document.fullscreenElement) {
        await videoContainerRef.current.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (error) {
      console.error("Fullscreen error:", error);
    }
  }, []);

  return { isFullscreen, toggleFullscreen, videoContainerRef };
}

// Wake Lock hook to keep screen on during playback
function useWakeLock(enabled: boolean) {
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    const requestWakeLock = async () => {
      if (!enabled || !("wakeLock" in navigator)) return;

      try {
        wakeLockRef.current = await navigator.wakeLock.request("screen");
      } catch (err) {
        console.log("Wake Lock request failed:", err);
      }
    };

    const releaseWakeLock = async () => {
      if (wakeLockRef.current) {
        await wakeLockRef.current.release();
        wakeLockRef.current = null;
      }
    };

    if (enabled) {
      requestWakeLock();
    } else {
      releaseWakeLock();
    }

    // Re-acquire wake lock when page becomes visible again
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && enabled) {
        requestWakeLock();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      releaseWakeLock();
    };
  }, [enabled]);
}

// Clock component for overlay
function ClockOverlay({ visible }: { visible: boolean }) {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    if (!visible) return;

    const interval = setInterval(() => {
      setTime(new Date());
    }, 1000);

    return () => clearInterval(interval);
  }, [visible]);

  if (!visible) return null;

  return (
    <div className="absolute top-4 right-4 bg-black/60 px-4 py-2 rounded-lg backdrop-blur-sm">
      <span className="text-white text-2xl font-mono tabular-nums">
        {time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
      </span>
    </div>
  );
}

export default function TVPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [selectedChannel, setSelectedChannel] = useState<TVChannel | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [localVolume, setLocalVolume] = useState(50);
  const [isMuted, setIsMuted] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [selectedCountry, setSelectedCountry] = useState<string>("");
  const { isFullscreen, toggleFullscreen, videoContainerRef } = useVideoFullscreen();
  const { addDebugLog } = useAppControls();

  // New state for enhanced features
  const [qualityLevels, setQualityLevels] = useState<QualityLevel[]>([]);
  const [currentQuality, setCurrentQuality] = useState<number>(-1); // -1 = auto
  const [showControls, setShowControls] = useState(true);
  const [showClock, setShowClock] = useState(false);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Wake lock when playing
  useWakeLock(isPlaying);

  const { data: settings, isLoading: settingsLoading } = useQuery<UserSettings>({
    queryKey: ["/api/settings"],
  });

  // Fetch channels grouped by country - extended cache for wall display
  const { data: channelsByCountry = {}, isLoading: channelsLoading } = useQuery<ChannelsByCountry>({
    queryKey: ["/api/tv/channels"],
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes (extended from 1 min)
    gcTime: 10 * 60 * 1000, // Keep in garbage collection for 10 minutes
  });

  const isLoading = settingsLoading || channelsLoading;
  const countries = useMemo(() => Object.keys(channelsByCountry), [channelsByCountry]);
  const currentChannels = selectedCountry ? (channelsByCountry[selectedCountry] || []) : [];

  // Set default country when data loads
  useEffect(() => {
    if (countries.length > 0 && !selectedCountry) {
      setSelectedCountry(countries[0]);
    }
  }, [countries, selectedCountry]);

  // Auto-hide controls after inactivity
  const resetControlsTimeout = useCallback(() => {
    setShowControls(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    if (isPlaying && !sidebarOpen) {
      controlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
      }, AUTO_HIDE_DELAY);
    }
  }, [isPlaying, sidebarOpen]);

  // Reset controls timeout on user interaction
  useEffect(() => {
    const handleActivity = () => resetControlsTimeout();

    const container = videoContainerRef.current;
    if (container) {
      container.addEventListener("mousemove", handleActivity);
      container.addEventListener("touchstart", handleActivity);
      container.addEventListener("click", handleActivity);
    }

    return () => {
      if (container) {
        container.removeEventListener("mousemove", handleActivity);
        container.removeEventListener("touchstart", handleActivity);
        container.removeEventListener("click", handleActivity);
      }
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
    };
  }, [resetControlsTimeout, videoContainerRef]);

  // Show controls when sidebar opens
  useEffect(() => {
    if (sidebarOpen) {
      setShowControls(true);
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
    } else {
      resetControlsTimeout();
    }
  }, [sidebarOpen, resetControlsTimeout]);

  const updateSettingsMutation = useMutation({
    mutationFn: async (data: Partial<UserSettings>) => {
      return apiRequest("PATCH", "/api/settings", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
    },
  });

  // Auto-reconnect function
  const attemptReconnect = useCallback((channel: TVChannel, attempt: number = 0) => {
    if (attempt >= RECONNECT_DELAYS.length) {
      setVideoError("Stream unavailable. Please try another channel.");
      setIsReconnecting(false);
      setReconnectAttempt(0);
      return;
    }

    setIsReconnecting(true);
    setReconnectAttempt(attempt + 1);

    reconnectTimeoutRef.current = setTimeout(() => {
      addDebugLog("info", `Reconnect attempt ${attempt + 1} for ${channel.name}`);
      loadChannel(channel, attempt + 1);
    }, RECONNECT_DELAYS[attempt]);
  }, [addDebugLog]);

  const loadChannel = useCallback((channel: TVChannel, reconnectAttemptNum: number = 0) => {
    const video = videoRef.current;
    if (!video) return;

    // Clear any pending reconnect
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    setVideoError(null);
    setIsBuffering(true);
    setQualityLevels([]);
    setCurrentQuality(-1);

    if (reconnectAttemptNum === 0) {
      setIsReconnecting(false);
      setReconnectAttempt(0);
    }

    addDebugLog("info", `Loading channel: ${channel.name}`, channel.url);

    const isHls = channel.url.includes(".m3u8") || channel.url.includes(".m3u");

    if (isHls && Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        debug: false,
        // Optimize for wall display - prefer higher quality
        startLevel: -1, // Auto-select initially
        capLevelToPlayerSize: false, // Don't limit based on player size
        maxBufferLength: 30, // Buffer 30 seconds
        maxMaxBufferLength: 60, // Max 60 seconds buffer
      });

      hls.loadSource(channel.url);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, (_event, data) => {
        setIsBuffering(false);
        setIsReconnecting(false);
        setReconnectAttempt(0);

        // Extract quality levels
        const levels: QualityLevel[] = data.levels.map((level, index) => ({
          index,
          height: level.height || 0,
          bitrate: level.bitrate || 0,
          label: level.height ? `${level.height}p` : `${Math.round((level.bitrate || 0) / 1000)}kbps`,
        }));
        setQualityLevels(levels);

        video.play().then(() => {
          setIsPlaying(true);
        }).catch(err => {
          addDebugLog("error", "Play failed", err.message);
        });
      });

      hls.on(Hls.Events.LEVEL_SWITCHED, (_event, data) => {
        setCurrentQuality(data.level);
      });

      hls.on(Hls.Events.ERROR, (_event, data) => {
        addDebugLog("error", `HLS Error: ${data.details}`);
        if (data.fatal) {
          setIsPlaying(false);
          setIsBuffering(false);

          // Attempt auto-reconnect
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            attemptReconnect(channel, reconnectAttemptNum);
          } else {
            setVideoError(`Stream error: ${data.details}`);
          }
        }
      });

      hlsRef.current = hls;
    } else if (isHls && video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = channel.url;
      video.play().then(() => setIsPlaying(true)).catch(err => addDebugLog("error", "Play failed", err.message));
    } else {
      video.src = channel.url;
      video.play().then(() => setIsPlaying(true)).catch(err => addDebugLog("error", "Play failed", err.message));
    }
  }, [addDebugLog, attemptReconnect]);

  // Quality change handler
  const handleQualityChange = useCallback((value: string) => {
    if (!hlsRef.current) return;

    const level = parseInt(value);
    hlsRef.current.currentLevel = level; // -1 for auto
    setCurrentQuality(level);
    addDebugLog("info", `Quality changed to: ${level === -1 ? "Auto" : qualityLevels[level]?.label}`);
  }, [addDebugLog, qualityLevels]);

  const initialLoadDone = useRef(false);

  // Flatten all channels for finding last watched
  const allChannels = useMemo(() => {
    return Object.values(channelsByCountry).flat();
  }, [channelsByCountry]);

  useEffect(() => {
    if (settings && allChannels.length > 0 && !initialLoadDone.current) {
      setLocalVolume(settings.tvVolume ?? 50);

      if (settings.lastTvChannel) {
        const lastChannel = allChannels.find(c => c.url === settings.lastTvChannel);
        if (lastChannel) {
          setSelectedChannel(lastChannel);
          loadChannel(lastChannel);
        }
      }
      initialLoadDone.current = true;
    }
  }, [settings, allChannels, loadChannel]);

  const handleChannelSelect = (channel: TVChannel) => {
    setSelectedChannel(channel);
    loadChannel(channel);
    updateSettingsMutation.mutate({ lastTvChannel: channel.url });
  };

  // Manual retry button handler
  const handleRetry = useCallback(() => {
    if (selectedChannel) {
      setVideoError(null);
      loadChannel(selectedChannel);
    }
  }, [selectedChannel, loadChannel]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleWaiting = () => setIsBuffering(true);
    const handlePlaying = () => {
      setIsBuffering(false);
      setVideoError(null);
      setIsReconnecting(false);
      setReconnectAttempt(0);
    };
    const handleError = () => {
      setIsPlaying(false);
      setIsBuffering(false);
      // Attempt auto-reconnect on video error
      if (selectedChannel) {
        attemptReconnect(selectedChannel, 0);
      }
    };
    const handleCanPlay = () => setIsBuffering(false);
    const handlePause = () => setIsPlaying(false);
    const handlePlay = () => setIsPlaying(true);

    video.addEventListener("waiting", handleWaiting);
    video.addEventListener("playing", handlePlaying);
    video.addEventListener("error", handleError);
    video.addEventListener("canplay", handleCanPlay);
    video.addEventListener("pause", handlePause);
    video.addEventListener("play", handlePlay);

    return () => {
      video.removeEventListener("waiting", handleWaiting);
      video.removeEventListener("playing", handlePlaying);
      video.removeEventListener("error", handleError);
      video.removeEventListener("canplay", handleCanPlay);
      video.removeEventListener("pause", handlePause);
      video.removeEventListener("play", handlePlay);
    };
  }, [selectedChannel, attemptReconnect]);

  useEffect(() => {
    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.volume = isMuted ? 0 : localVolume / 100;
    }
  }, [localVolume, isMuted]);

  const handleVolumeChange = (value: number[]) => {
    const newVolume = value[0];
    setLocalVolume(newVolume);
    setIsMuted(false);
  };

  const handleVolumeCommit = (value: number[]) => {
    updateSettingsMutation.mutate({ tvVolume: value[0] });
  };

  const toggleMute = () => {
    setIsMuted(!isMuted);
  };

  const togglePlayPause = () => {
    if (!videoRef.current) return;

    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play().catch(console.error);
    }
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center bg-black">
        <Loader2 className="h-12 w-12 animate-spin text-white" />
      </div>
    );
  }

  return (
    <div
      ref={videoContainerRef}
      className="h-full flex bg-black relative overflow-hidden"
    >
      <div className="flex-1 flex flex-col relative">
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-contain"
          playsInline
          data-testid="video-display"
        />

        {/* Channel logo overlay (top-left, always visible when playing) */}
        {selectedChannel && isPlaying && !showControls && (
          <div className="absolute top-4 left-4 flex items-center gap-3 bg-black/40 px-3 py-2 rounded-lg backdrop-blur-sm transition-opacity duration-300">
            {selectedChannel.logo && (
              <img
                src={selectedChannel.logo}
                alt={selectedChannel.name}
                className="w-8 h-8 object-contain rounded"
              />
            )}
            <span className="text-white text-sm font-medium">{selectedChannel.name}</span>
          </div>
        )}

        {/* Clock overlay */}
        <ClockOverlay visible={showClock && isPlaying && !showControls} />

        {!selectedChannel && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-white/60">
            <Tv className="h-24 w-24 mb-4" />
            <p className="text-2xl">Select a channel</p>
          </div>
        )}

        {isBuffering && selectedChannel && !isReconnecting && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/30">
            <Loader2 className="h-16 w-16 animate-spin text-white" />
          </div>
        )}

        {isReconnecting && selectedChannel && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60">
            <RefreshCw className="h-12 w-12 animate-spin text-white mb-4" />
            <p className="text-white text-lg">Reconnecting... (attempt {reconnectAttempt}/{RECONNECT_DELAYS.length})</p>
          </div>
        )}

        {videoError && selectedChannel && !isReconnecting && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 gap-4">
            <p className="text-red-400 text-lg">{videoError}</p>
            <Button
              onClick={handleRetry}
              variant="outline"
              className="text-white border-white/30 hover:bg-white/10"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          </div>
        )}

        {/* Control bar - auto-hides after inactivity */}
        <div
          className={cn(
            "absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-4 transition-opacity duration-300",
            showControls ? "opacity-100" : "opacity-0 pointer-events-none"
          )}
        >
          <div className="flex items-center gap-3">
            {/* Play/Pause - larger touch target */}
            <Button
              size="icon"
              variant="ghost"
              onClick={togglePlayPause}
              className="h-14 w-14 text-white hover:bg-white/20 touch-manipulation"
              disabled={!selectedChannel}
              data-testid="button-play-pause"
            >
              {isPlaying ? (
                <Pause className="h-7 w-7" />
              ) : (
                <Play className="h-7 w-7 ml-0.5" />
              )}
            </Button>

            {/* Volume - larger touch target */}
            <Button
              size="icon"
              variant="ghost"
              onClick={toggleMute}
              className="h-12 w-12 text-white hover:bg-white/20 touch-manipulation"
              data-testid="button-mute"
            >
              {isMuted || localVolume === 0 ? (
                <VolumeX className="h-6 w-6" />
              ) : (
                <Volume2 className="h-6 w-6" />
              )}
            </Button>

            <Slider
              value={[isMuted ? 0 : localVolume]}
              onValueChange={handleVolumeChange}
              onValueCommit={handleVolumeCommit}
              max={100}
              step={5}
              className="w-32 [&>span:first-child]:h-3 [&_[role=slider]]:h-6 [&_[role=slider]]:w-6 [&>span:first-child]:bg-white/30 [&_[role=slider]]:bg-white [&_[role=slider]]:border-0 touch-manipulation"
              data-testid="slider-volume"
            />

            {/* Channel info */}
            <div className="flex-1 flex items-center gap-3 min-w-0 mx-2">
              {selectedChannel?.logo && (
                <img
                  src={selectedChannel.logo}
                  alt={selectedChannel.name}
                  className="w-10 h-10 object-contain rounded"
                />
              )}
              <div className="flex flex-col min-w-0">
                <span className="text-white text-lg font-medium truncate" data-testid="text-channel-name">
                  {selectedChannel?.name || "No channel"}
                </span>
                {selectedChannel?.group && (
                  <span className="text-white/60 text-xs">{selectedChannel.group}</span>
                )}
              </div>
            </div>

            {/* Quality selector */}
            {qualityLevels.length > 1 && (
              <Select value={currentQuality.toString()} onValueChange={handleQualityChange}>
                <SelectTrigger className="w-24 h-10 bg-transparent border-white/30 text-white text-sm">
                  <SelectValue placeholder="Auto" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="-1">Auto</SelectItem>
                  {qualityLevels.map((level) => (
                    <SelectItem key={level.index} value={level.index.toString()}>
                      {level.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {/* Clock toggle */}
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setShowClock(!showClock)}
              className={cn(
                "h-12 w-12 text-white hover:bg-white/20 touch-manipulation",
                showClock && "bg-white/20"
              )}
              data-testid="button-clock"
            >
              <Clock className="h-5 w-5" />
            </Button>

            {/* Fullscreen - larger touch target */}
            <Button
              size="icon"
              variant="ghost"
              onClick={toggleFullscreen}
              className="h-12 w-12 text-white hover:bg-white/20 touch-manipulation"
              data-testid="button-fullscreen"
            >
              {isFullscreen ? (
                <Minimize className="h-6 w-6" />
              ) : (
                <Maximize className="h-6 w-6" />
              )}
            </Button>

            {/* Sidebar toggle - larger touch target */}
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="h-12 w-12 text-white hover:bg-white/20 touch-manipulation"
              data-testid="button-toggle-channels"
            >
              {sidebarOpen ? (
                <ChevronRight className="h-6 w-6" />
              ) : (
                <ChevronLeft className="h-6 w-6" />
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Channel sidebar */}
      <div
        className={cn(
          "w-80 bg-black/80 border-l border-white/10 flex flex-col transition-all duration-300",
          sidebarOpen ? "translate-x-0" : "translate-x-full"
        )}
        style={{ marginRight: sidebarOpen ? 0 : "-20rem" }}
      >
        {/* Country Tabs */}
        <div className="p-3 border-b border-white/10">
          <div className="flex flex-wrap gap-2">
            {countries.map((country) => (
              <button
                key={country}
                onClick={() => setSelectedCountry(country)}
                className={cn(
                  "px-3 py-2 rounded-lg text-sm font-medium transition-colors touch-manipulation",
                  selectedCountry === country
                    ? "bg-white/20 text-white"
                    : "text-white/60 hover:text-white hover:bg-white/10"
                )}
                data-testid={`tab-tv-country-${country.toLowerCase()}`}
              >
                {COUNTRY_FLAGS[country] || ""} {country}
              </button>
            ))}
          </div>
        </div>

        <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
          <span className="text-white/70 text-sm font-medium">{selectedCountry}</span>
          <span className="text-white/50 text-xs">{currentChannels.length} channels</span>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-3 space-y-2">
            {currentChannels.map((channel, index) => {
              const isSelected = selectedChannel?.url === channel.url;
              const isCurrentlyPlaying = isSelected && isPlaying;

              return (
                <button
                  key={`${channel.url}-${index}`}
                  onClick={() => handleChannelSelect(channel)}
                  className={cn(
                    "w-full flex items-center gap-4 px-4 py-4 rounded-xl transition-colors text-left touch-manipulation",
                    isSelected
                      ? "bg-white/20 text-white"
                      : "text-white/70 hover:bg-white/10 hover:text-white"
                  )}
                  data-testid={`button-channel-${index}`}
                >
                  {channel.logo ? (
                    <img
                      src={channel.logo}
                      alt={channel.name}
                      className="w-12 h-12 object-contain rounded-lg bg-white/5 p-1"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-lg bg-white/10 flex items-center justify-center">
                      <Tv className="h-6 w-6" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <span className="text-base font-medium truncate block">{channel.name}</span>
                    {channel.group && (
                      <span className="text-xs text-white/50">{channel.group}</span>
                    )}
                  </div>
                  {isCurrentlyPlaying && (
                    <div className="h-3 w-3 bg-green-500 rounded-full animate-pulse shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
