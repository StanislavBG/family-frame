import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { Tv, Volume2, VolumeX, Maximize, Minimize, Play, Pause, Loader2, ChevronRight, ChevronLeft } from "lucide-react";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import Hls from "hls.js";
import { useAppControls } from "@/components/app-controls";
import type { TVChannel, UserSettings } from "@shared/schema";

type ChannelsByCountry = Record<string, TVChannel[]>;

const COUNTRY_FLAGS: Record<string, string> = {
  "Bulgaria": "BG",
  "Serbia": "RS",
  "Greece": "GR",
  "Russia": "RU",
};

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

  const { data: settings, isLoading: settingsLoading } = useQuery<UserSettings>({
    queryKey: ["/api/settings"],
  });

  // Fetch channels grouped by country
  const { data: channelsByCountry = {}, isLoading: channelsLoading } = useQuery<ChannelsByCountry>({
    queryKey: ["/api/tv/channels"],
    staleTime: 60000, // Cache for 1 minute
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

  const updateSettingsMutation = useMutation({
    mutationFn: async (data: Partial<UserSettings>) => {
      return apiRequest("PATCH", "/api/settings", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
    },
  });

  const loadChannel = useCallback((channel: TVChannel) => {
    const video = videoRef.current;
    if (!video) return;

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    setVideoError(null);
    setIsBuffering(true);
    
    addDebugLog("info", `Loading channel: ${channel.name}`, channel.url);

    const isHls = channel.url.includes(".m3u8") || channel.url.includes(".m3u");

    if (isHls && Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        debug: false,
      });
      
      hls.loadSource(channel.url);
      hls.attachMedia(video);
      
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setIsBuffering(false);
        video.play().then(() => {
          setIsPlaying(true);
        }).catch(err => {
          addDebugLog("error", "Play failed", err.message);
        });
      });
      
      hls.on(Hls.Events.ERROR, (event, data) => {
        addDebugLog("error", `HLS Error: ${data.details}`);
        if (data.fatal) {
          setVideoError(`Stream error: ${data.details}`);
          setIsPlaying(false);
          setIsBuffering(false);
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
  }, [addDebugLog]);

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

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleWaiting = () => setIsBuffering(true);
    const handlePlaying = () => { 
      setIsBuffering(false); 
      setVideoError(null);
    };
    const handleError = (e: Event) => {
      const videoEl = e.target as HTMLVideoElement;
      const error = videoEl?.error;
      setIsPlaying(false);
      setIsBuffering(false);
      setVideoError(`Stream error: Code ${error?.code || "Unknown"}`);
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
  }, []);

  useEffect(() => {
    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
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

        {!selectedChannel && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-white/60">
            <Tv className="h-24 w-24 mb-4" />
            <p className="text-2xl">Select a channel</p>
          </div>
        )}

        {isBuffering && selectedChannel && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/30">
            <Loader2 className="h-16 w-16 animate-spin text-white" />
          </div>
        )}

        {videoError && selectedChannel && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80">
            <p className="text-red-400 text-lg">{videoError}</p>
          </div>
        )}

        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-4">
          <div className="flex items-center gap-4">
            <Button
              size="icon"
              variant="ghost"
              onClick={togglePlayPause}
              className="h-12 w-12 text-white hover:bg-white/20"
              disabled={!selectedChannel}
              data-testid="button-play-pause"
            >
              {isPlaying ? (
                <Pause className="h-6 w-6" />
              ) : (
                <Play className="h-6 w-6 ml-0.5" />
              )}
            </Button>

            <Button
              size="icon"
              variant="ghost"
              onClick={toggleMute}
              className="h-10 w-10 text-white hover:bg-white/20"
              data-testid="button-mute"
            >
              {isMuted || localVolume === 0 ? (
                <VolumeX className="h-5 w-5" />
              ) : (
                <Volume2 className="h-5 w-5" />
              )}
            </Button>
            
            <Slider
              value={[isMuted ? 0 : localVolume]}
              onValueChange={handleVolumeChange}
              onValueCommit={handleVolumeCommit}
              max={100}
              step={5}
              className="w-28 [&>span:first-child]:h-2 [&_[role=slider]]:h-5 [&_[role=slider]]:w-5 [&>span:first-child]:bg-white/30 [&_[role=slider]]:bg-white [&_[role=slider]]:border-0"
              data-testid="slider-volume"
            />

            <div className="flex-1 flex items-center gap-3 min-w-0">
              {selectedChannel?.logo && (
                <img 
                  src={selectedChannel.logo} 
                  alt={selectedChannel.name}
                  className="w-8 h-8 object-contain rounded"
                />
              )}
              <span className="text-white text-lg font-medium truncate" data-testid="text-channel-name">
                {selectedChannel?.name || "No channel"}
              </span>
            </div>

            <Button
              size="icon"
              variant="ghost"
              onClick={toggleFullscreen}
              className="h-10 w-10 text-white hover:bg-white/20"
              data-testid="button-fullscreen"
            >
              {isFullscreen ? (
                <Minimize className="h-5 w-5" />
              ) : (
                <Maximize className="h-5 w-5" />
              )}
            </Button>

            <Button
              size="icon"
              variant="ghost"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="h-10 w-10 text-white hover:bg-white/20"
              data-testid="button-toggle-channels"
            >
              {sidebarOpen ? (
                <ChevronRight className="h-5 w-5" />
              ) : (
                <ChevronLeft className="h-5 w-5" />
              )}
            </Button>
          </div>
        </div>
      </div>

      <div 
        className={cn(
          "w-72 bg-black/80 border-l border-white/10 flex flex-col transition-all duration-300",
          sidebarOpen ? "translate-x-0" : "translate-x-full"
        )}
        style={{ marginRight: sidebarOpen ? 0 : "-18rem" }}
      >
        {/* Country Tabs */}
        <div className="p-2 border-b border-white/10">
          <div className="flex flex-wrap gap-1">
            {countries.map((country) => (
              <button
                key={country}
                onClick={() => setSelectedCountry(country)}
                className={cn(
                  "px-2 py-1 rounded text-xs font-medium transition-colors",
                  selectedCountry === country
                    ? "bg-white/20 text-white"
                    : "text-white/60 hover:text-white hover:bg-white/10"
                )}
                data-testid={`tab-tv-country-${country.toLowerCase()}`}
              >
                {COUNTRY_FLAGS[country] || country}
              </button>
            ))}
          </div>
        </div>
        
        <div className="px-3 py-2 border-b border-white/10 flex items-center justify-between">
          <span className="text-white/70 text-sm font-medium">{selectedCountry}</span>
          <span className="text-white/50 text-xs">{currentChannels.length} channels</span>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {currentChannels.map((channel, index) => {
              const isSelected = selectedChannel?.url === channel.url;
              const isCurrentlyPlaying = isSelected && isPlaying;
              
              return (
                <button
                  key={`${channel.url}-${index}`}
                  onClick={() => handleChannelSelect(channel)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-3 rounded-lg transition-colors text-left",
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
                      className="w-10 h-10 object-contain rounded bg-white/5 p-1"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  ) : (
                    <div className="w-10 h-10 rounded bg-white/10 flex items-center justify-center">
                      <Tv className="h-5 w-5" />
                    </div>
                  )}
                  <span className="flex-1 text-sm truncate">{channel.name}</span>
                  {isCurrentlyPlaying && (
                    <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse shrink-0" />
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
