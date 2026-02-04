import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { radioService } from "@/lib/radio-service";
import { useQuery } from "@tanstack/react-query";
import type { KpopdhTrack } from "@shared/schema";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Square,
  Heart,
  Shuffle,
} from "lucide-react";

declare global {
  interface Window {
    YT: {
      Player: new (
        elementId: string,
        options: {
          height?: string;
          width?: string;
          videoId?: string;
          playerVars?: Record<string, number | string>;
          events?: {
            onReady?: (event: { target: YTPlayer }) => void;
            onStateChange?: (event: { data: number; target: YTPlayer }) => void;
            onError?: (event: { data: number }) => void;
          };
        }
      ) => YTPlayer;
      PlayerState: {
        ENDED: number;
        PLAYING: number;
        PAUSED: number;
        BUFFERING: number;
        CUED: number;
      };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

interface YTPlayer {
  playVideo: () => void;
  pauseVideo: () => void;
  stopVideo: () => void;
  loadVideoById: (videoId: string) => void;
  setVolume: (volume: number) => void;
  getVolume: () => number;
  getVideoData: () => { title: string; video_id: string };
  destroy: () => void;
}

interface YouTubeVideoInfo {
  videoId: string;
  title: string;
  thumbnail?: string;
}

interface YouTubeAudioPlayerProps {
  playlist: KpopdhTrack[];
  isActive: boolean;
  onPlayStateChange?: (isPlaying: boolean) => void;
  volume?: number;
  onVolumeRef?: (fn: (volume: number) => void) => void;
  onStopRef?: (fn: () => void) => void;
  shuffleEnabled?: boolean;
}

// Shuffle array using Fisher-Yates algorithm
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function YouTubeAudioPlayer({
  playlist,
  isActive,
  onPlayStateChange,
  volume: externalVolume,
  onVolumeRef,
  onStopRef,
  shuffleEnabled = false,
}: YouTubeAudioPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [internalVolume, setInternalVolume] = useState(externalVolume ?? 50);
  const [isReady, setIsReady] = useState(false);
  const [currentTitle, setCurrentTitle] = useState<string>("");
  const playerRef = useRef<YTPlayer | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Apply shuffle if enabled
  const orderedPlaylist = useMemo(() => {
    return shuffleEnabled ? shuffleArray(playlist) : playlist;
  }, [playlist, shuffleEnabled]);

  const currentTrack = orderedPlaylist[currentIndex];

  // Fetch video titles from API
  const videoIds = useMemo(() => playlist.map(t => t.videoId), [playlist]);
  const { data: videoInfos } = useQuery<YouTubeVideoInfo[]>({
    queryKey: ["/api/youtube/videos", videoIds.join(",")],
    queryFn: async () => {
      const response = await fetch("/api/youtube/videos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoIds }),
        credentials: "include",
      });
      if (!response.ok) return [];
      return response.json();
    },
    enabled: videoIds.length > 0,
    staleTime: 24 * 60 * 60 * 1000, // Cache for 24 hours
  });

  // Map video IDs to titles from API
  const videoTitles = useMemo(() => {
    const titleMap = new Map<string, string>();
    if (videoInfos) {
      videoInfos.forEach(info => {
        titleMap.set(info.videoId, info.title);
      });
    }
    return titleMap;
  }, [videoInfos]);

  // Sync with external volume
  useEffect(() => {
    if (externalVolume !== undefined && externalVolume !== internalVolume) {
      setInternalVolume(externalVolume);
      if (playerRef.current) {
        playerRef.current.setVolume(externalVolume);
      }
    }
  }, [externalVolume]);

  // Expose volume control function to parent
  useEffect(() => {
    if (onVolumeRef) {
      onVolumeRef((newVolume: number) => {
        setInternalVolume(newVolume);
        if (playerRef.current) {
          playerRef.current.setVolume(newVolume);
        }
      });
    }
  }, [onVolumeRef]);

  // Expose stop function to parent
  useEffect(() => {
    if (onStopRef) {
      onStopRef(() => {
        handleStop();
      });
    }
  }, [onStopRef]);

  const loadYouTubeAPI = useCallback(() => {
    if (window.YT && window.YT.Player) {
      initPlayer();
      return;
    }

    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    const firstScriptTag = document.getElementsByTagName("script")[0];
    firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);

    window.onYouTubeIframeAPIReady = () => {
      initPlayer();
    };
  }, []);

  const initPlayer = useCallback(() => {
    if (!containerRef.current || playerRef.current) return;

    const playerId = "kpopdh-player";
    let playerDiv = document.getElementById(playerId);
    if (!playerDiv) {
      playerDiv = document.createElement("div");
      playerDiv.id = playerId;
      containerRef.current.appendChild(playerDiv);
    }

    playerRef.current = new window.YT.Player(playerId, {
      height: "1",
      width: "1",
      videoId: currentTrack?.videoId,
      playerVars: {
        autoplay: 0,
        controls: 0,
        disablekb: 1,
        fs: 0,
        modestbranding: 1,
        playsinline: 1,
      },
      events: {
        onReady: (event) => {
          setIsReady(true);
          event.target.setVolume(internalVolume);
          const videoData = event.target.getVideoData();
          if (videoData?.title) {
            setCurrentTitle(videoData.title);
          }
        },
        onStateChange: (event) => {
          if (event.data === window.YT.PlayerState.ENDED) {
            handleNext();
          } else if (event.data === window.YT.PlayerState.PLAYING) {
            setIsPlaying(true);
            onPlayStateChange?.(true);
            const videoData = event.target.getVideoData();
            if (videoData?.title) {
              setCurrentTitle(videoData.title);
            }
          } else if (event.data === window.YT.PlayerState.PAUSED) {
            setIsPlaying(false);
            onPlayStateChange?.(false);
          }
        },
        onError: (event) => {
          console.error("YouTube player error:", event.data);
          handleNext();
        },
      },
    });
  }, [currentTrack?.videoId, internalVolume, onPlayStateChange]);

  useEffect(() => {
    loadYouTubeAPI();
    return () => {
      if (playerRef.current) {
        playerRef.current.destroy();
        playerRef.current = null;
      }
    };
  }, [loadYouTubeAPI]);

  useEffect(() => {
    if (isActive && isPlaying) {
      radioService.stop();
    }
  }, [isActive, isPlaying]);

  const handlePlayPause = () => {
    if (!playerRef.current || !isReady) return;

    if (isPlaying) {
      playerRef.current.pauseVideo();
    } else {
      radioService.stop();
      playerRef.current.playVideo();
    }
  };

  const handleStop = () => {
    if (!playerRef.current) return;
    playerRef.current.stopVideo();
    setIsPlaying(false);
    onPlayStateChange?.(false);
  };

  const handleNext = () => {
    const nextIndex = (currentIndex + 1) % orderedPlaylist.length;
    setCurrentIndex(nextIndex);
    if (playerRef.current && isReady) {
      playerRef.current.loadVideoById(orderedPlaylist[nextIndex].videoId);
      if (isPlaying) {
        playerRef.current.playVideo();
      }
    }
  };

  const handlePrevious = () => {
    const prevIndex = (currentIndex - 1 + orderedPlaylist.length) % orderedPlaylist.length;
    setCurrentIndex(prevIndex);
    if (playerRef.current && isReady) {
      playerRef.current.loadVideoById(orderedPlaylist[prevIndex].videoId);
      if (isPlaying) {
        playerRef.current.playVideo();
      }
    }
  };

  const handleVolumeChange = (value: number[]) => {
    const newVolume = value[0];
    setInternalVolume(newVolume);
    if (playerRef.current) {
      playerRef.current.setVolume(newVolume);
    }
  };

  const handleTrackSelect = (index: number) => {
    setCurrentIndex(index);
    if (playerRef.current && isReady) {
      playerRef.current.loadVideoById(orderedPlaylist[index].videoId);
      playerRef.current.playVideo();
    }
  };

  // Get display title for a track (prefer API title, fallback to track title or generic)
  const getDisplayTitle = (track: KpopdhTrack, index: number): string => {
    const apiTitle = videoTitles.get(track.videoId);
    if (apiTitle) return apiTitle;
    if (track.title && track.title !== `Track ${index + 1}`) return track.title;
    return `Track ${index + 1}`;
  };

  if (!isActive) return null;

  return (
    <div className="flex flex-col h-full">
      <div ref={containerRef} className="absolute w-0 h-0 overflow-hidden" aria-hidden="true" />
      
      <div className="p-4 border-b bg-muted/30">
        <div className="flex items-center justify-center gap-6">
          <Button
            variant="ghost"
            size="icon"
            onClick={handlePrevious}
            disabled={!isReady}
            data-testid="button-kpopdh-previous"
          >
            <SkipBack className="h-5 w-5" />
          </Button>
          <Button
            size="lg"
            onClick={handlePlayPause}
            disabled={!isReady}
            data-testid="button-kpopdh-play-pause"
          >
            {isPlaying ? (
              <Pause className="h-5 w-5" />
            ) : (
              <Play className="h-5 w-5 ml-0.5" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleNext}
            disabled={!isReady}
            data-testid="button-kpopdh-next"
          >
            <SkipForward className="h-5 w-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleStop}
            disabled={!isReady}
            data-testid="button-kpopdh-stop"
          >
            <Square className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2 ml-4">
            <VolumeX className="h-4 w-4 text-muted-foreground" />
            <Slider
              value={[internalVolume]}
              onValueChange={handleVolumeChange}
              max={100}
              step={5}
              className="w-24"
              data-testid="slider-kpopdh-volume"
            />
            <Volume2 className="h-4 w-4 text-muted-foreground" />
          </div>
        </div>
        {currentTrack && (
          <p className="text-center text-sm text-muted-foreground mt-2">
            Now playing: <span className="font-medium text-foreground">
              {currentTitle || getDisplayTitle(currentTrack, currentIndex)}
            </span>
            {" "}({currentIndex + 1}/{orderedPlaylist.length})
            {shuffleEnabled && <span className="ml-2 text-xs">(Shuffled)</span>}
          </p>
        )}
      </div>

      <div className="flex-1 overflow-auto p-4">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-4">
          Tracks ({orderedPlaylist.length})
          {shuffleEnabled && (
            <Badge variant="outline" className="ml-2">
              <Shuffle className="h-3 w-3 mr-1" />
              Shuffled
            </Badge>
          )}
        </h3>
        <div className="space-y-1">
          {orderedPlaylist.map((track, index) => (
            <div
              key={track.id}
              className={cn(
                "flex items-center gap-3 p-3 rounded-lg transition-colors cursor-pointer hover-elevate",
                index === currentIndex && "bg-primary/10"
              )}
              onClick={() => handleTrackSelect(index)}
              data-testid={`kpopdh-track-${index}`}
            >
              <div className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium shrink-0",
                index === currentIndex
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted/70"
              )}>
                {index === currentIndex && isPlaying ? (
                  <Volume2 className="h-4 w-4" />
                ) : (
                  index + 1
                )}
              </div>
              <div className="flex-1 min-w-0">
                <span className={cn(
                  "block truncate",
                  index === currentIndex && "font-medium text-primary"
                )}>
                  {index === currentIndex && currentTitle
                    ? currentTitle
                    : getDisplayTitle(track, index)}
                </span>
              </div>
              {index === currentIndex && isPlaying && (
                <Badge variant="secondary">Playing</Badge>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
