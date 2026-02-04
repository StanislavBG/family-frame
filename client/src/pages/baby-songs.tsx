import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { radioService } from "@/lib/radio-service";
import { useAppControls } from "@/components/app-controls";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useSleepTimer } from "@/hooks/use-sleep-timer";
import { useWakeLock } from "@/hooks/use-wake-lock";
import {
  BABY_RADIO_STATIONS,
  BABY_RADIO_LIBRARY,
  BABY_AGE_RANGES,
  KPOPDH_PLAYLIST,
  BUILT_IN_MOOD_STATIONS,
  moodStationToTracks,
  getTracksForStation,
  type BabyRadioStation,
  type MoodStation,
  type BabyRadioTrack,
  type UserSettings
} from "@shared/schema";
import { YouTubeAudioPlayer } from "@/components/youtube-audio-player";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Sun,
  Moon,
  Leaf,
  Baby,
  Utensils,
  Sparkles,
  Square,
  Music,
  Droplet,
  Car,
  BookOpen,
  Cloud,
  TreePine,
  PartyPopper,
  Video,
  Timer,
  TimerOff,
  Shuffle,
  Heart,
  Monitor,
} from "lucide-react";

function getStationIcon(iconHint: string) {
  switch (iconHint) {
    case "sun":
      return Sun;
    case "bee":
      return Sparkles;
    case "leaf":
      return Leaf;
    case "moon":
      return Moon;
    case "utensils":
      return Utensils;
    case "droplet":
      return Droplet;
    case "car":
      return Car;
    case "book":
      return BookOpen;
    case "cloud":
      return Cloud;
    case "tree":
      return TreePine;
    case "party":
      return PartyPopper;
    case "music":
      return Music;
    case "video":
      return Video;
    default:
      return Baby;
  }
}

type StationSelection = BabyRadioStation | MoodStation | null;

// Shuffle array using Fisher-Yates algorithm
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// Sleep timer preset options (in minutes)
const SLEEP_TIMER_PRESETS = [15, 30, 45, 60];

export default function BabySongsPage() {
  const { addDebugLog } = useAppControls();
  const [selectedStation, setSelectedStation] = useState<StationSelection>(BABY_RADIO_STATIONS[0] || null);
  const [radioState, setRadioState] = useState(radioService.getState());
  const [localVolume, setLocalVolume] = useState(50);
  const [moodStationPlaying, setMoodStationPlaying] = useState<string | null>(null);
  const [showSleepTimerPanel, setShowSleepTimerPanel] = useState(false);
  const youtubeVolumeRef = useRef<((volume: number) => void) | null>(null);
  const youtubeStopRef = useRef<(() => void) | null>(null);

  // Check if selected station is a mood station (has videoIds)
  const isMoodStation = (station: StationSelection): station is MoodStation => {
    return station !== null && "videoIds" in station;
  };

  const { data: settings } = useQuery<UserSettings>({
    queryKey: ["/api/settings"],
  });

  const babyAgeMonths = settings?.babyAgeMonths ?? 12;
  const radioVolume = settings?.radioVolume ?? 50;
  const shuffleEnabled = settings?.babySongsShuffleEnabled ?? false;
  const favorites = settings?.babySongsFavorites ?? [];
  const initialVolumeSet = useRef(false);

  // Determine if any player is active
  const isAnyPlayerActive = radioState.isPlaying || moodStationPlaying !== null;

  // Sleep timer hook - stops all playback when timer ends
  const handleTimerEnd = useCallback(() => {
    radioService.stop();
    // Stop YouTube player via ref
    if (youtubeStopRef.current) {
      youtubeStopRef.current();
    }
    setMoodStationPlaying(null);
    addDebugLog("info", "Sleep timer ended", "Stopping playback");
  }, [addDebugLog]);

  const sleepTimer = useSleepTimer({ onTimerEnd: handleTimerEnd });

  // Wake lock - keeps screen on during playback
  const { isActive: isWakeLockActive, requestWakeLock, releaseWakeLock } = useWakeLock();

  // Request wake lock when playback starts
  useEffect(() => {
    if (isAnyPlayerActive && !isWakeLockActive) {
      requestWakeLock();
    }
  }, [isAnyPlayerActive, isWakeLockActive, requestWakeLock]);

  useEffect(() => {
    if (!initialVolumeSet.current && settings) {
      setLocalVolume(radioVolume);
      initialVolumeSet.current = true;
    }
  }, [radioVolume, settings]);

  useEffect(() => {
    const unsubVolume = radioService.subscribe("stateChange", (state) => {
      setLocalVolume(state.volume);
    });
    return () => unsubVolume();
  }, []);

  const updateSettingsMutation = useMutation({
    mutationFn: (data: Partial<UserSettings>) =>
      apiRequest("PATCH", "/api/settings", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
    },
  });

  // Unified volume change - syncs between both players
  const handleVolumeChange = (value: number[]) => {
    const newVolume = value[0];
    setLocalVolume(newVolume);
    radioService.setVolume(newVolume);
    // Sync to YouTube player if volume ref is available
    if (youtubeVolumeRef.current) {
      youtubeVolumeRef.current(newVolume);
    }
  };

  const handleVolumeCommit = (value: number[]) => {
    updateSettingsMutation.mutate({ radioVolume: value[0] });
  };

  // Shuffle toggle
  const handleShuffleToggle = () => {
    updateSettingsMutation.mutate({ babySongsShuffleEnabled: !shuffleEnabled });
    addDebugLog("info", "Shuffle mode", !shuffleEnabled ? "enabled" : "disabled");
  };

  // Favorites toggle
  const toggleFavorite = (trackId: string) => {
    const newFavorites = favorites.includes(trackId)
      ? favorites.filter(id => id !== trackId)
      : [...favorites, trackId];
    updateSettingsMutation.mutate({ babySongsFavorites: newFavorites });
  };

  const isFavorite = (trackId: string) => favorites.includes(trackId);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle shortcuts if user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      switch (e.key.toLowerCase()) {
        case " ": // Space - Play/Pause
          e.preventDefault();
          if (radioState.isPlaying) {
            radioService.pause();
          } else if (radioState.mode === "playlist") {
            radioService.resume();
          }
          break;
        case "arrowleft": // Previous track
          if (radioState.mode === "playlist") {
            radioService.previousTrack();
          }
          break;
        case "arrowright": // Next track
          if (radioState.mode === "playlist") {
            radioService.nextTrack();
          }
          break;
        case "arrowup": // Volume up
          e.preventDefault();
          handleVolumeChange([Math.min(100, localVolume + 10)]);
          break;
        case "arrowdown": // Volume down
          e.preventDefault();
          handleVolumeChange([Math.max(0, localVolume - 10)]);
          break;
        case "s": // Toggle shuffle
          handleShuffleToggle();
          break;
        case "t": // Toggle sleep timer panel
          setShowSleepTimerPanel(prev => !prev);
          break;
        case "escape": // Stop playback or close timer panel
          if (showSleepTimerPanel) {
            setShowSleepTimerPanel(false);
          } else {
            radioService.stop();
          }
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [radioState.isPlaying, radioState.mode, localVolume, showSleepTimerPanel, shuffleEnabled]);

  const currentAgeGroup = useMemo(() => {
    const group = BABY_AGE_RANGES.find(
      (range) => babyAgeMonths >= range.minMonths && babyAgeMonths < range.maxMonths
    );
    return group || BABY_AGE_RANGES[BABY_AGE_RANGES.length - 1];
  }, [babyAgeMonths]);

  useEffect(() => {
    const unsubState = radioService.subscribe("stateChange", setRadioState);
    const unsubTrack = radioService.subscribe("trackChange", () => {
      setRadioState(radioService.getState());
    });
    const unsubError = radioService.subscribe("error", (data) => {
      addDebugLog("error", "Baby Songs error", data.message);
    });
    
    return () => {
      unsubState();
      unsubTrack();
      unsubError();
    };
  }, [addDebugLog]);

  const handleSelectStation = (station: StationSelection) => {
    if (station) {
      addDebugLog("info", "Station selected", station.name);
    }
    setSelectedStation(station);
  };

  const handleAgeChange = (ageGroupId: string) => {
    const range = BABY_AGE_RANGES.find((r) => r.id === ageGroupId);
    if (range) {
      updateSettingsMutation.mutate({ babyAgeMonths: range.defaultAge });
    }
  };

  const currentTracks = useMemo(() => {
    if (!selectedStation || isMoodStation(selectedStation)) return [];
    const tracks = getTracksForStation(selectedStation.id, babyAgeMonths);
    return shuffleEnabled ? shuffleArray(tracks) : tracks;
  }, [selectedStation, babyAgeMonths, shuffleEnabled]);

  const stationTrackCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    BABY_RADIO_STATIONS.forEach(station => {
      counts[station.id] = getTracksForStation(station.id, babyAgeMonths).length;
    });
    return counts;
  }, [babyAgeMonths]);

  const handlePlayTracks = () => {
    if (!selectedStation || isMoodStation(selectedStation) || currentTracks.length === 0) return;

    const playlistName = selectedStation.name;

    addDebugLog("info", `Playing playlist: ${playlistName}`, `${currentTracks.length} tracks`);
    radioService.playPlaylist(currentTracks, playlistName);
  };

  const handlePlayPause = () => {
    if (radioState.isPlaying) {
      radioService.pause();
    } else {
      radioService.resume();
    }
  };

  const handleStop = () => {
    radioService.stop();
  };

  const isPlayingFromStation = (station: BabyRadioStation) => {
    return radioState.mode === "playlist" &&
           radioState.playlistName?.includes(station.name);
  };

  const isCurrentlyPlaying = selectedStation &&
    !isMoodStation(selectedStation) &&
    radioState.mode === "playlist" &&
    radioState.playlistName?.includes(selectedStation.name);

  const selectedMoodStation = isMoodStation(selectedStation) ? selectedStation : null;

  return (
    <div className="flex h-full">
      <aside className="w-64 border-r bg-muted/30 flex flex-col shrink-0">
        <div className="p-4 border-b">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-pink-100 dark:bg-pink-900/30 flex items-center justify-center">
              <Baby className="h-5 w-5 text-pink-500" />
            </div>
            <div>
              <h1 className="text-lg font-bold">Baby Songs</h1>
              <p className="text-xs text-muted-foreground">{BABY_RADIO_LIBRARY.length} tracks</p>
            </div>
          </div>
          <Select
            value={currentAgeGroup.id}
            onValueChange={handleAgeChange}
          >
            <SelectTrigger className="w-full" data-testid="select-age-group">
              <SelectValue placeholder="Select age" />
            </SelectTrigger>
            <SelectContent>
              {BABY_AGE_RANGES.map((range) => (
                <SelectItem key={range.id} value={range.id}>
                  {range.label} ({range.description})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            <p className="px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Situations
            </p>
            {BABY_RADIO_STATIONS.map((station) => {
              const Icon = getStationIcon(station.iconHint);
              const trackCount = stationTrackCounts[station.id] || 0;
              const isActive = !isMoodStation(selectedStation) && selectedStation?.id === station.id;
              const isPlaying = isPlayingFromStation(station);
              
              return (
                <button
                  key={station.id}
                  onClick={() => handleSelectStation(station)}
                  disabled={trackCount === 0}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-3 rounded-lg text-left transition-colors",
                    isActive ? "bg-primary/10" : "hover:bg-muted",
                    trackCount === 0 && "opacity-50 cursor-not-allowed"
                  )}
                  data-testid={`station-button-${station.id}`}
                >
                  <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                    style={{ backgroundColor: station.colorTheme + "25" }}
                  >
                    <Icon
                      className="h-5 w-5"
                      style={{ color: station.colorTheme }}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        "font-medium truncate",
                        isActive && "text-primary"
                      )}>
                        {station.name}
                      </span>
                      {isPlaying && (
                        <span className="w-2 h-2 rounded-full bg-primary animate-pulse shrink-0" />
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {trackCount} tracks
                    </span>
                  </div>
                </button>
              );
            })}
            
            <div className="pt-4 pb-2">
              <p className="px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Mood Stations (YouTube)
              </p>
            </div>

            {BUILT_IN_MOOD_STATIONS.map((moodStation) => {
              const Icon = getStationIcon(moodStation.iconHint);
              const isActive = selectedMoodStation?.id === moodStation.id;
              const isPlaying = moodStationPlaying === moodStation.id;

              return (
                <button
                  key={moodStation.id}
                  onClick={() => handleSelectStation(moodStation)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-3 rounded-lg text-left transition-colors",
                    isActive ? "bg-primary/10" : "hover:bg-muted"
                  )}
                  data-testid={`station-button-${moodStation.id}`}
                >
                  <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                    style={{ backgroundColor: moodStation.colorTheme + "25" }}
                  >
                    <Icon
                      className="h-5 w-5"
                      style={{ color: moodStation.colorTheme }}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        "font-medium truncate",
                        isActive && "text-primary"
                      )}>
                        {moodStation.name}
                      </span>
                      {isPlaying && (
                        <span className="w-2 h-2 rounded-full bg-primary animate-pulse shrink-0" />
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {moodStation.videoIds.length} videos
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </ScrollArea>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Global Controls Bar - Sleep Timer, Shuffle, Wake Lock status */}
        <div className="p-3 border-b bg-muted/20 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            {/* Sleep Timer */}
            <div className="flex items-center gap-2">
              <Button
                variant={sleepTimer.isActive ? "default" : "outline"}
                size="sm"
                className="h-10 px-4 text-base"
                onClick={() => setShowSleepTimerPanel(!showSleepTimerPanel)}
                data-testid="button-sleep-timer"
              >
                {sleepTimer.isActive ? (
                  <>
                    <TimerOff className="h-4 w-4 mr-2" />
                    {sleepTimer.formatTime(sleepTimer.remainingSeconds)}
                  </>
                ) : (
                  <>
                    <Timer className="h-4 w-4 mr-2" />
                    Sleep Timer
                  </>
                )}
              </Button>
              {sleepTimer.isActive && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-10 px-3"
                  onClick={() => sleepTimer.stopTimer()}
                  data-testid="button-cancel-timer"
                >
                  Cancel
                </Button>
              )}
            </div>

            {/* Shuffle Toggle */}
            <Button
              variant={shuffleEnabled ? "default" : "outline"}
              size="sm"
              className="h-10 px-4"
              onClick={handleShuffleToggle}
              data-testid="button-shuffle"
            >
              <Shuffle className="h-4 w-4 mr-2" />
              Shuffle {shuffleEnabled ? "On" : "Off"}
            </Button>
          </div>

          {/* Status Indicators */}
          <div className="flex items-center gap-3">
            {isWakeLockActive && (
              <Badge variant="secondary" className="h-8 px-3">
                <Monitor className="h-3 w-3 mr-1" />
                Screen On
              </Badge>
            )}
            {isAnyPlayerActive && (
              <Badge variant="default" className="h-8 px-3 animate-pulse">
                <Volume2 className="h-3 w-3 mr-1" />
                Playing
              </Badge>
            )}
          </div>
        </div>

        {/* Sleep Timer Panel - Large touch-friendly buttons */}
        {showSleepTimerPanel && (
          <div className="p-6 border-b bg-muted/30">
            <h3 className="text-lg font-medium mb-4 text-center">Set Sleep Timer</h3>
            <div className="flex items-center justify-center gap-4 flex-wrap">
              {SLEEP_TIMER_PRESETS.map((minutes) => (
                <Button
                  key={minutes}
                  variant={sleepTimer.selectedMinutes === minutes ? "default" : "outline"}
                  size="lg"
                  className="h-16 w-24 text-xl font-bold"
                  onClick={() => {
                    sleepTimer.startTimer(minutes);
                    setShowSleepTimerPanel(false);
                    addDebugLog("info", "Sleep timer started", `${minutes} minutes`);
                  }}
                  data-testid={`button-timer-${minutes}`}
                >
                  {minutes}m
                </Button>
              ))}
              {sleepTimer.isActive && (
                <Button
                  variant="outline"
                  size="lg"
                  className="h-16 w-24 text-lg"
                  onClick={() => {
                    sleepTimer.addTime(15);
                    addDebugLog("info", "Sleep timer extended", "+15 minutes");
                  }}
                  data-testid="button-timer-add"
                >
                  +15m
                </Button>
              )}
            </div>
            <p className="text-sm text-muted-foreground text-center mt-4">
              Music will stop automatically when timer ends
            </p>
          </div>
        )}

        {selectedMoodStation ? (
          <>
            <div className="p-4 border-b bg-background/95 flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: selectedMoodStation.colorTheme + "25" }}
                >
                  {(() => {
                    const Icon = getStationIcon(selectedMoodStation.iconHint);
                    return <Icon className="h-5 w-5" style={{ color: selectedMoodStation.colorTheme }} />;
                  })()}
                </div>
                <div>
                  <h2 className="text-xl font-semibold">{selectedMoodStation.name}</h2>
                  <p className="text-sm text-muted-foreground">
                    {selectedMoodStation.description || "YouTube music videos"}
                  </p>
                </div>
              </div>
            </div>
            <YouTubeAudioPlayer
              playlist={moodStationToTracks(selectedMoodStation)}
              isActive={!!selectedMoodStation}
              onPlayStateChange={(playing) => setMoodStationPlaying(playing ? selectedMoodStation.id : null)}
              volume={localVolume}
              onVolumeRef={(fn) => { youtubeVolumeRef.current = fn; }}
              onStopRef={(fn) => { youtubeStopRef.current = fn; }}
              shuffleEnabled={shuffleEnabled}
            />
          </>
        ) : selectedStation ? (
          <>
            <div className="p-4 border-b bg-background/95 flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: selectedStation.colorTheme + "25" }}
                >
                  {(() => {
                    const Icon = getStationIcon(selectedStation.iconHint);
                    return <Icon className="h-5 w-5" style={{ color: selectedStation.colorTheme }} />;
                  })()}
                </div>
                <div>
                  <h2 className="text-xl font-semibold">{selectedStation.name}</h2>
                  <p className="text-sm text-muted-foreground">
                    {selectedStation.description}
                  </p>
                </div>
              </div>

              </div>

            {isCurrentlyPlaying && (
              <div className="p-4 border-b bg-muted/30">
                <div className="flex items-center justify-center gap-6">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => radioService.previousTrack()}
                    data-testid="button-previous-track"
                  >
                    <SkipBack className="h-5 w-5" />
                  </Button>
                  <Button
                    size="lg"
                    className="h-12 w-12 rounded-full"
                    onClick={handlePlayPause}
                    data-testid="button-play-pause"
                  >
                    {radioState.isPlaying ? (
                      <Pause className="h-5 w-5" />
                    ) : (
                      <Play className="h-5 w-5 ml-0.5" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => radioService.nextTrack()}
                    data-testid="button-next-track"
                  >
                    <SkipForward className="h-5 w-5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleStop}
                    data-testid="button-stop"
                  >
                    <Square className="h-4 w-4" />
                  </Button>
                  <div className="flex items-center gap-2 ml-4">
                    <VolumeX className="h-4 w-4 text-muted-foreground" />
                    <Slider
                      value={[localVolume]}
                      onValueChange={handleVolumeChange}
                      onValueCommit={handleVolumeCommit}
                      max={100}
                      step={5}
                      className="w-24"
                      data-testid="slider-volume"
                    />
                    <Volume2 className="h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
                {radioState.currentTrack && (
                  <p className="text-center text-sm text-muted-foreground mt-2">
                    Now playing: <span className="font-medium text-foreground">{radioState.currentTrack.title}</span>
                    {" "}({radioState.currentTrackIndex + 1}/{radioState.playlistLength})
                  </p>
                )}
              </div>
            )}

            <ScrollArea className="flex-1">
              <div className="p-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                    Tracks ({currentTracks.length})
                  </h3>
                  <Button
                    onClick={handlePlayTracks}
                    disabled={currentTracks.length === 0}
                    data-testid="button-play-tracks"
                  >
                    <Play className="h-4 w-4 mr-2" />
                    Play All
                  </Button>
                </div>

                <div className="space-y-1">
                  {currentTracks.map((track, index) => (
                    <div
                      key={track.id}
                      className={cn(
                        "flex items-center gap-3 p-3 rounded-lg transition-colors cursor-pointer",
                        radioState.currentTrack?.url === track.url
                          ? "bg-primary/10"
                          : "hover:bg-muted/50"
                      )}
                      onClick={() => {
                        if (selectedStation) {
                          radioService.playPlaylist(currentTracks, `${selectedStation.name}`, index);
                        }
                      }}
                      data-testid={`track-${index}`}
                    >
                      <div className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium shrink-0",
                        radioState.currentTrack?.url === track.url
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted"
                      )}>
                        {radioState.currentTrack?.url === track.url && radioState.isPlaying ? (
                          <Volume2 className="h-4 w-4" />
                        ) : (
                          index + 1
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className={cn(
                          "block truncate",
                          radioState.currentTrack?.url === track.url && "font-medium text-primary"
                        )}>
                          {track.title}
                        </span>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleFavorite(track.id);
                        }}
                        data-testid={`button-favorite-${track.id}`}
                      >
                        <Heart
                          className={cn(
                            "h-4 w-4",
                            isFavorite(track.id) ? "fill-red-500 text-red-500" : "text-muted-foreground"
                          )}
                        />
                      </Button>
                      {radioState.currentTrack?.url === track.url && radioState.isPlaying && (
                        <Badge variant="secondary">Playing</Badge>
                      )}
                    </div>
                  ))}
                </div>

                {currentTracks.length === 0 && (
                  <div className="text-center py-12 text-muted-foreground">
                    <Baby className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No tracks available for this age group</p>
                    <p className="text-sm">Try selecting a different age or situation</p>
                  </div>
                )}
              </div>
            </ScrollArea>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <Baby className="h-16 w-16 mx-auto mb-4 opacity-50" />
              <p className="text-lg">Select a situation to see tracks</p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
