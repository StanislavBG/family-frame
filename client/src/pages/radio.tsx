import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Radio, Volume2, VolumeX, Play, Pause, Loader2, Music2, Disc3, Signal, AlertCircle } from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { UserSettings } from "@shared/schema";
import { radioService, type RadioStation, type StreamMetadata } from "@/lib/radio-service";
import { useAppControls } from "@/components/app-controls";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// API response structure with categories
interface CategoryData {
  icon: string;
  stations: RadioStation[];
}

type StationsByCategory = Record<string, CategoryData>;

// Category display order - countries first, then genres
const CATEGORY_ORDER = [
  // Countries
  "Bulgaria", "Serbia", "Greece", "Russia",
  // Genres
  "Jazz", "Classical", "Metal", "Ambient", "Electronic",
];

export default function RadioPage() {
  const { data: settings, isLoading: settingsLoading } = useQuery<UserSettings>({
    queryKey: ["/api/settings"],
  });

  // Fetch stations grouped by category
  const { data: stationsByCategory = {}, isLoading: stationsLoading } = useQuery<StationsByCategory>({
    queryKey: ["/api/radio/stations"],
    staleTime: 60000,
  });

  const isLoading = settingsLoading || stationsLoading;
  const { addDebugLog } = useAppControls();

  // Sort categories in predefined order
  const categories = useMemo(() => {
    const available = Object.keys(stationsByCategory);
    return CATEGORY_ORDER.filter(c => available.includes(c));
  }, [stationsByCategory]);

  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [radioState, setRadioState] = useState(radioService.getState());
  const [localVolume, setLocalVolume] = useState(50);
  const [selectedStation, setSelectedStation] = useState("");
  const [metadata, setMetadata] = useState<StreamMetadata | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);

  const radioEnabled = settings?.radioEnabled ?? false;
  const radioVolume = settings?.radioVolume ?? 50;
  const radioStation = settings?.radioStation ?? "";

  const updateSettingsMutation = useMutation({
    mutationFn: async (data: Partial<UserSettings>) => {
      return apiRequest("PATCH", "/api/settings", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
    },
  });

  useEffect(() => {
    const unsubscribeState = radioService.subscribe("stateChange", (state) => {
      setRadioState(state);
      if (state.metadata) {
        setMetadata(state.metadata);
      }
      // Clear error when playing successfully
      if (state.isPlaying) {
        setErrorMessage(null);
        setIsRetrying(false);
      }
    });
    const unsubscribeError = radioService.subscribe("error", (data) => {
      addDebugLog("error", "Radio error", data.message);
      setErrorMessage(data.message);
      setIsRetrying(data.isRetrying || false);
    });
    const unsubscribeMetadata = radioService.subscribe("metadataChange", (data: StreamMetadata) => {
      setMetadata(data);
    });
    // Initialize metadata from current state
    const initialState = radioService.getState();
    if (initialState.metadata) {
      setMetadata(initialState.metadata);
    }
    return () => {
      unsubscribeState();
      unsubscribeError();
      unsubscribeMetadata();
    };
  }, [addDebugLog]);

  useEffect(() => {
    setLocalVolume(radioVolume);
    radioService.setVolume(radioVolume);
  }, [radioVolume]);

  useEffect(() => {
    setSelectedStation(radioStation);
  }, [radioStation]);

  // Set default category when data loads
  useEffect(() => {
    if (categories.length > 0 && !selectedCategory) {
      setSelectedCategory(categories[0]);
    }
  }, [categories, selectedCategory]);

  const currentCategoryData = selectedCategory ? stationsByCategory[selectedCategory] : null;
  const currentStations = currentCategoryData?.stations || [];

  // Find the current station data from the fetched stations
  const currentStation = useMemo(() => {
    for (const categoryData of Object.values(stationsByCategory)) {
      const found = categoryData.stations.find(s => s.url === selectedStation);
      if (found) return found;
    }
    return radioService.getStationByUrl(selectedStation);
  }, [stationsByCategory, selectedStation]);

  const handleVolumeChange = (value: number[]) => {
    const newVolume = value[0];
    setLocalVolume(newVolume);
    radioService.setVolume(newVolume);
  };

  const handleVolumeCommit = (value: number[]) => {
    updateSettingsMutation.mutate({ radioVolume: value[0] });
  };

  const handleStationSelect = (station: RadioStation) => {
    setSelectedStation(station.url);
    setErrorMessage(null);
    addDebugLog("info", "Station selected", station.name);

    updateSettingsMutation.mutate({
      radioStation: station.url,
      radioEnabled: true
    });

    // Pass station data with fallback URLs to the radio service
    radioService.play(station.url, station);
  };

  const togglePlayPause = () => {
    if (radioState.isPlaying) {
      radioService.pause();
    } else if (selectedStation && currentStation) {
      radioService.play(selectedStation, currentStation);
    }
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-16 w-16 animate-spin text-primary" />
          <p className="text-xl text-muted-foreground">Loading stations...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex bg-background">
      {/* Main Content - Station Info & Controls */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Station Display Area */}
        <div className="flex-1 flex flex-col items-center justify-center p-8">
          {/* Station Logo/Icon */}
          <div className="relative mb-6">
            {currentStation?.logo ? (
              <img
                src={currentStation.logo}
                alt={currentStation.name}
                className="w-40 h-40 lg:w-48 lg:h-48 rounded-3xl object-cover shadow-lg"
              />
            ) : (
              <div className="w-40 h-40 lg:w-48 lg:h-48 rounded-3xl bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center shadow-lg">
                <Radio className="w-20 h-20 lg:w-24 lg:h-24 text-primary" />
              </div>
            )}
            {/* Playing indicator */}
            {radioState.isPlaying && (
              <div className="absolute -bottom-2 -right-2 bg-primary rounded-full p-2 shadow-lg">
                <div className="flex items-center gap-0.5">
                  <div className="w-1 h-3 bg-white rounded-full animate-pulse" />
                  <div className="w-1 h-5 bg-white rounded-full animate-pulse delay-75" />
                  <div className="w-1 h-4 bg-white rounded-full animate-pulse delay-150" />
                </div>
              </div>
            )}
          </div>

          {/* Station Name */}
          <h1 className="text-4xl lg:text-5xl xl:text-6xl font-bold text-center mb-4" data-testid="text-station-name">
            {currentStation?.name || "Select a Station"}
          </h1>

          {/* Status/Now Playing */}
          {radioState.isBuffering ? (
            <div className="flex items-center gap-3 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-xl">Connecting...</span>
            </div>
          ) : radioState.isPlaying && (metadata?.nowPlaying || metadata?.title) ? (
            <div className="text-center max-w-xl">
              <div className="flex items-center justify-center gap-2 text-primary mb-2">
                <Music2 className="h-5 w-5 animate-pulse" />
                <span className="text-sm font-semibold uppercase tracking-wider">Now Playing</span>
              </div>
              {metadata.artist && (
                <p className="text-2xl lg:text-3xl font-semibold mb-1" data-testid="text-artist">
                  {metadata.artist}
                </p>
              )}
              <p className="text-xl lg:text-2xl text-muted-foreground" data-testid="text-song-title">
                {metadata.title || metadata.nowPlaying}
              </p>
            </div>
          ) : errorMessage ? (
            <div className="flex items-center gap-2 text-destructive">
              {isRetrying ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <AlertCircle className="h-5 w-5" />
              )}
              <span className="text-lg">{errorMessage}</span>
            </div>
          ) : (
            <p className="text-xl text-muted-foreground">
              {selectedStation ? (radioState.isPlaying ? "Now Playing" : "Paused") : "Choose a station from the list"}
            </p>
          )}

          {/* Stream Info Badges */}
          {selectedStation && radioState.isPlaying && (metadata?.genre || metadata?.bitrate) && (
            <div className="flex items-center gap-3 mt-6">
              {metadata.genre && (
                <Badge variant="secondary" className="gap-1.5 text-sm px-3 py-1">
                  <Disc3 className="h-4 w-4" />
                  {metadata.genre}
                </Badge>
              )}
              {metadata.bitrate && (
                <Badge variant="outline" className="gap-1.5 text-sm px-3 py-1">
                  <Signal className="h-4 w-4" />
                  {metadata.bitrate} kbps
                </Badge>
              )}
            </div>
          )}
        </div>

        {/* Control Panel - Fixed at bottom */}
        <div className="border-t bg-card/50 backdrop-blur-sm p-6">
          <div className="max-w-2xl mx-auto">
            <div className="flex items-center gap-6">
              {/* Play/Pause Button */}
              <Button
                size="icon"
                onClick={togglePlayPause}
                disabled={!selectedStation || radioState.isBuffering}
                className="h-16 w-16 rounded-full shadow-lg"
                data-testid="button-play-pause"
              >
                {radioState.isBuffering ? (
                  <Loader2 className="h-8 w-8 animate-spin" />
                ) : radioState.isPlaying ? (
                  <Pause className="h-8 w-8" />
                ) : (
                  <Play className="h-8 w-8 ml-1" />
                )}
              </Button>

              {/* Volume Controls */}
              <div className="flex-1 flex items-center gap-4">
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => {
                    const newVol = localVolume === 0 ? 50 : 0;
                    setLocalVolume(newVol);
                    radioService.setVolume(newVol);
                    updateSettingsMutation.mutate({ radioVolume: newVol });
                  }}
                  className="h-12 w-12"
                  data-testid="button-mute"
                >
                  {localVolume === 0 ? (
                    <VolumeX className="h-6 w-6" />
                  ) : (
                    <Volume2 className="h-6 w-6" />
                  )}
                </Button>

                <Slider
                  value={[localVolume]}
                  onValueChange={handleVolumeChange}
                  onValueCommit={handleVolumeCommit}
                  max={100}
                  step={5}
                  className="flex-1 [&>span:first-child]:h-2 [&_[role=slider]]:h-5 [&_[role=slider]]:w-5"
                  data-testid="slider-volume"
                />

                <span className="text-lg font-medium text-muted-foreground w-14 text-right">
                  {localVolume}%
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Station Sidebar - Right */}
      <div className="w-80 lg:w-96 border-l bg-card/30 flex flex-col">
        {/* Category List */}
        <ScrollArea className="border-b" style={{ maxHeight: "200px" }}>
          <div className="p-2 space-y-0.5">
            {categories.map((category) => {
              const categoryData = stationsByCategory[category];
              const isSelected = selectedCategory === category;

              return (
                <button
                  key={category}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-left",
                    "hover:bg-accent/50",
                    isSelected && "bg-primary/15 text-primary font-medium"
                  )}
                  onClick={() => setSelectedCategory(category)}
                  data-testid={`category-${category.toLowerCase()}`}
                >
                  <span className="text-xl">{categoryData?.icon}</span>
                  <span className="flex-1">{category}</span>
                  <span className="text-xs text-muted-foreground">
                    {categoryData?.stations.length || 0}
                  </span>
                </button>
              );
            })}
          </div>
        </ScrollArea>

        {/* Station Count */}
        <div className="px-4 py-2 text-sm text-muted-foreground border-b flex items-center gap-2">
          {currentCategoryData?.icon && (
            <span>{currentCategoryData.icon}</span>
          )}
          <span>
            {currentStations.length} station{currentStations.length !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Station List */}
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {currentStations.map((station) => {
              const isSelected = selectedStation === station.url;
              const isCurrentlyPlaying = radioState.currentStation === station.url && radioState.isPlaying;

              return (
                <button
                  key={station.url}
                  className={cn(
                    "w-full flex items-center gap-3 p-3 rounded-xl transition-all text-left",
                    "hover:bg-accent/50",
                    isSelected && "bg-primary/10 ring-1 ring-primary/50",
                    isCurrentlyPlaying && "bg-primary/20"
                  )}
                  onClick={() => handleStationSelect(station)}
                  data-testid={`station-${station.name.toLowerCase().replace(/\s/g, "-")}`}
                >
                  {/* Station Logo */}
                  {station.logo ? (
                    <img
                      src={station.logo}
                      alt={station.name}
                      className="w-12 h-12 rounded-lg object-cover flex-shrink-0"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-lg bg-primary/20 flex items-center justify-center flex-shrink-0">
                      <Radio className="w-6 h-6 text-primary" />
                    </div>
                  )}

                  {/* Station Name */}
                  <span className="flex-1 font-medium truncate">
                    {station.name}
                  </span>

                  {/* Playing Indicator */}
                  {isCurrentlyPlaying && (
                    <div className="flex items-center gap-0.5 text-primary">
                      <div className="w-1 h-2 bg-current rounded-full animate-pulse" />
                      <div className="w-1 h-3 bg-current rounded-full animate-pulse delay-75" />
                      <div className="w-1 h-2.5 bg-current rounded-full animate-pulse delay-150" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </ScrollArea>

        {/* Global Radio Toggle */}
        <div className="p-4 border-t bg-card/50">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              Background playback
            </span>
            <Button
              variant={radioEnabled ? "default" : "outline"}
              size="sm"
              onClick={() => {
                const newEnabled = !radioEnabled;
                updateSettingsMutation.mutate({ radioEnabled: newEnabled });
                if (!newEnabled) {
                  radioService.stop();
                } else if (selectedStation && currentStation) {
                  radioService.play(selectedStation, currentStation);
                }
              }}
              data-testid="button-toggle-global"
            >
              {radioEnabled ? "On" : "Off"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
