import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Radio, Volume2, VolumeX, Play, Pause, Check, Loader2, Music2, Disc3, Signal } from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { UserSettings } from "@shared/schema";
import { radioService, type RadioStation, type StreamMetadata } from "@/lib/radio-service";
import { useAppControls } from "@/components/app-controls";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { RadioStationValidator } from "@/components/radio-station-validator";

type StationsByCountry = Record<string, RadioStation[]>;

const COUNTRY_ORDER = ["Bulgaria", "Serbia", "Greece", "Russia"];

const COUNTRY_CODES: Record<string, string> = {
  "Bulgaria": "BG",
  "Serbia": "RS",
  "Greece": "GR",
  "Russia": "RU",
};

export default function RadioPage() {
  const { data: settings, isLoading: settingsLoading } = useQuery<UserSettings>({
    queryKey: ["/api/settings"],
  });

  const { data: stationsByCountry = {}, isLoading: stationsLoading } = useQuery<StationsByCountry>({
    queryKey: ["/api/radio/stations"],
    staleTime: 60000,
  });

  const isLoading = settingsLoading || stationsLoading;
  const { addDebugLog } = useAppControls();

  const countries = useMemo(() => {
    const available = Object.keys(stationsByCountry);
    return COUNTRY_ORDER.filter(c => available.includes(c));
  }, [stationsByCountry]);

  const [selectedCountry, setSelectedCountry] = useState<string>("");
  const [radioState, setRadioState] = useState(radioService.getState());
  const [localVolume, setLocalVolume] = useState(50);
  const [selectedStation, setSelectedStation] = useState("");
  const [metadata, setMetadata] = useState<StreamMetadata | null>(null);

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
    });
    const unsubscribeError = radioService.subscribe("error", (data) => {
      addDebugLog("error", "Radio error", data.message);
    });
    const unsubscribeMetadata = radioService.subscribe("metadataChange", (data: StreamMetadata) => {
      setMetadata(data);
    });
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

  useEffect(() => {
    if (countries.length > 0 && !selectedCountry) {
      setSelectedCountry(countries[0]);
    }
  }, [countries, selectedCountry]);

  const currentStations = selectedCountry ? (stationsByCountry[selectedCountry] || []) : [];

  const handleVolumeChange = (value: number[]) => {
    const newVolume = value[0];
    setLocalVolume(newVolume);
    radioService.setVolume(newVolume);
  };

  const handleVolumeCommit = (value: number[]) => {
    updateSettingsMutation.mutate({ radioVolume: value[0] });
  };

  const handleStationSelect = (stationUrl: string) => {
    setSelectedStation(stationUrl);
    addDebugLog("info", "Station selected", stationUrl);

    updateSettingsMutation.mutate({
      radioStation: stationUrl,
      radioEnabled: true
    });

    radioService.play(stationUrl);
  };

  const togglePlayPause = () => {
    if (radioState.isPlaying) {
      radioService.pause();
    } else if (selectedStation) {
      radioService.play(selectedStation);
    }
  };

  const toggleRadioEnabled = () => {
    const newEnabled = !radioEnabled;
    updateSettingsMutation.mutate({ radioEnabled: newEnabled });

    if (!newEnabled) {
      radioService.stop();
    } else if (selectedStation) {
      radioService.play(selectedStation);
    }
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <div className="text-2xl text-muted-foreground">Loading radio...</div>
        </div>
      </div>
    );
  }

  const currentStation = radioService.getStationByUrl(selectedStation);

  return (
    <div className="h-full flex flex-col bg-background overflow-hidden">
      <div className="flex-1 flex px-8 py-6 gap-8 overflow-hidden">
        {/* Now Playing Area */}
        <div className="flex-1 flex flex-col items-center justify-center gap-6">
          <p className="text-2xl md:text-4xl lg:text-5xl text-muted-foreground uppercase tracking-[0.2em]">
            Radio
          </p>

          {/* Station Display */}
          <div className="w-full max-w-md aspect-square bg-gradient-to-br from-primary/20 to-primary/5 rounded-3xl flex flex-col items-center justify-center p-8 border">
            {currentStation?.logo ? (
              <img
                src={currentStation.logo}
                alt={currentStation.name}
                className="w-28 h-28 rounded-2xl object-cover mb-4"
              />
            ) : (
              <Radio className="w-28 h-28 text-primary mb-4" />
            )}

            <p className="text-3xl md:text-4xl font-bold text-center" data-testid="text-station-name">
              {currentStation?.name || "Select a Station"}
            </p>

            {selectedStation && radioState.isPlaying && (metadata?.nowPlaying || metadata?.title) ? (
              <div className="mt-4 text-center max-w-full px-2">
                <div className="flex items-center justify-center gap-2 text-primary mb-1">
                  <Music2 className="h-4 w-4 animate-pulse" />
                  <span className="text-sm font-medium uppercase tracking-wide">Now Playing</span>
                </div>
                {metadata.artist && (
                  <p className="text-xl font-semibold truncate" data-testid="text-artist">
                    {metadata.artist}
                  </p>
                )}
                <p className="text-lg text-muted-foreground truncate" data-testid="text-song-title">
                  {metadata.title || metadata.nowPlaying}
                </p>
              </div>
            ) : (
              <p className="text-xl text-muted-foreground mt-3">
                {radioState.isBuffering ? "Buffering..." :
                 radioState.isPlaying ? "Now Playing" :
                 selectedStation ? "Paused" : "Choose a station"}
              </p>
            )}

            {selectedStation && (metadata?.genre || metadata?.bitrate) && (
              <div className="flex items-center gap-2 mt-4 flex-wrap justify-center">
                {metadata.genre && (
                  <Badge variant="secondary" className="gap-1">
                    <Disc3 className="h-3 w-3" />
                    {metadata.genre}
                  </Badge>
                )}
                {metadata.bitrate && (
                  <Badge variant="outline" className="gap-1">
                    <Signal className="h-3 w-3" />
                    {metadata.bitrate} kbps
                  </Badge>
                )}
              </div>
            )}
          </div>

          {/* Controls */}
          <Card className="w-full max-w-lg p-6">
            <div className="flex items-center gap-4">
              <Button
                size="icon"
                onClick={togglePlayPause}
                disabled={!selectedStation || radioState.isBuffering}
                className="h-14 w-14"
                data-testid="button-play-pause"
              >
                {radioState.isBuffering ? (
                  <div className="h-6 w-6 border-2 border-current border-t-transparent rounded-full animate-spin" />
                ) : radioState.isPlaying ? (
                  <Pause className="h-7 w-7" />
                ) : (
                  <Play className="h-7 w-7" />
                )}
              </Button>

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
                className="flex-1 [&>span:first-child]:h-3 [&_[role=slider]]:h-6 [&_[role=slider]]:w-6"
                data-testid="slider-volume"
              />

              <span className="text-lg text-muted-foreground w-12 text-right">
                {localVolume}%
              </span>
            </div>

            <div className="mt-4 flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                Global radio (plays across pages)
              </span>
              <Button
                variant={radioEnabled ? "default" : "outline"}
                size="sm"
                onClick={toggleRadioEnabled}
                data-testid="button-toggle-global"
              >
                {radioEnabled ? "Enabled" : "Disabled"}
              </Button>
            </div>
          </Card>
        </div>

        {/* Station List */}
        <div className="w-80 flex flex-col gap-2 overflow-hidden">
          {/* Country Tabs */}
          <div className="flex flex-wrap gap-1 pb-2 border-b">
            {countries.map((country) => (
              <Button
                key={country}
                variant={selectedCountry === country ? "default" : "ghost"}
                size="sm"
                onClick={() => setSelectedCountry(country)}
                className="gap-1"
                data-testid={`tab-country-${country.toLowerCase()}`}
              >
                <span className="text-xs font-bold">{COUNTRY_CODES[country] || ""}</span>
                <span>{country}</span>
              </Button>
            ))}
          </div>

          <div className="text-sm text-muted-foreground">
            {currentStations.length} stations available
          </div>

          {/* Stream Health Check */}
          <RadioStationValidator />

          <ScrollArea className="flex-1">
            <div className="space-y-2 pr-2">
              {currentStations.map((station) => {
                const isSelected = selectedStation === station.url;
                const isCurrentlyPlaying = radioState.currentStation === station.url && radioState.isPlaying;

                return (
                  <Card
                    key={station.url}
                    className={cn(
                      "p-3 cursor-pointer transition-colors hover-elevate",
                      isSelected && "ring-2 ring-primary"
                    )}
                    onClick={() => handleStationSelect(station.url)}
                    data-testid={`station-${station.name.toLowerCase().replace(/\s/g, "-")}`}
                  >
                    <div className="flex items-center gap-3">
                      {station.logo ? (
                        <img
                          src={station.logo}
                          alt={station.name}
                          className="w-10 h-10 rounded-lg object-cover"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
                          <Radio className="w-5 h-5 text-primary" />
                        </div>
                      )}
                      <span className="flex-1 font-medium">{station.name}</span>
                      {isCurrentlyPlaying && (
                        <div className="flex items-center gap-1">
                          <div className="w-1 h-3 bg-primary rounded-full animate-pulse" />
                          <div className="w-1 h-4 bg-primary rounded-full animate-pulse delay-75" />
                          <div className="w-1 h-2 bg-primary rounded-full animate-pulse delay-150" />
                        </div>
                      )}
                      {isSelected && !isCurrentlyPlaying && (
                        <Check className="w-5 h-5 text-primary" />
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}
