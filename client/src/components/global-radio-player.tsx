import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Radio, Volume2, VolumeX, Pause, Play, X } from "lucide-react";
import type { UserSettings } from "@shared/schema";
import { radioService } from "@/lib/radio-service";

export function GlobalRadioPlayer() {
  const [location] = useLocation();
  const [radioState, setRadioState] = useState(radioService.getState());
  const [showMiniPlayer, setShowMiniPlayer] = useState(true);
  const [localVolume, setLocalVolume] = useState(radioState.volume);

  const { data: settings } = useQuery<UserSettings>({
    queryKey: ["/api/settings"],
  });

  const radioEnabled = settings?.radioEnabled ?? false;
  const radioVolume = settings?.radioVolume ?? 50;
  const radioStation = settings?.radioStation ?? "";

  const isOnTVPage = location === "/tv";
  const isOnRadioPage = location === "/radio";
  const shouldPlay = radioEnabled && !isOnTVPage && radioStation;

  useEffect(() => {
    const unsubscribe = radioService.subscribe("stateChange", (state) => {
      setRadioState(state);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    setLocalVolume(radioVolume);
    radioService.setVolume(radioVolume);
  }, [radioVolume]);

  useEffect(() => {
    if (shouldPlay) {
      if (radioStation !== radioService.getCurrentStation()) {
        radioService.play(radioStation);
      } else if (!radioService.isCurrentlyPlaying()) {
        radioService.resume();
      }
    } else {
      if (radioService.isCurrentlyPlaying()) {
        radioService.stop();
      }
    }
  }, [shouldPlay, radioStation]);

  const handleVolumeChange = (value: number[]) => {
    const newVolume = value[0];
    setLocalVolume(newVolume);
    radioService.setVolume(newVolume);
  };

  const togglePlayPause = () => {
    if (radioState.isPlaying) {
      radioService.pause();
    } else {
      radioService.resume();
    }
  };

  if (!radioEnabled || isOnTVPage || isOnRadioPage || !radioStation) {
    return null;
  }

  if (!showMiniPlayer) {
    return (
      <Button
        variant="secondary"
        size="icon"
        onClick={() => setShowMiniPlayer(true)}
        className="fixed bottom-4 right-4 z-40 h-12 w-12 rounded-full shadow-lg"
        data-testid="button-show-radio"
      >
        <Radio className="h-6 w-6" />
      </Button>
    );
  }

  const currentStation = radioService.getStationByUrl(radioStation);

  return (
    <div className="fixed bottom-4 right-4 z-40 bg-card border rounded-xl shadow-lg p-4 w-72">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Radio className="h-5 w-5 text-primary" />
          <span className="font-medium text-sm truncate max-w-32">
            {currentStation?.name || "Radio"}
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setShowMiniPlayer(false)}
          className="h-8 w-8"
          data-testid="button-hide-radio"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={togglePlayPause}
          disabled={radioState.isBuffering}
          className="h-10 w-10"
          data-testid="button-radio-playpause"
        >
          {radioState.isBuffering ? (
            <div className="h-5 w-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
          ) : radioState.isPlaying ? (
            <Pause className="h-5 w-5" />
          ) : (
            <Play className="h-5 w-5" />
          )}
        </Button>

        <Button
          variant="ghost"
          size="icon"
          onClick={() => radioService.setVolume(localVolume === 0 ? 50 : 0)}
          className="h-8 w-8"
          data-testid="button-radio-mute"
        >
          {localVolume === 0 ? (
            <VolumeX className="h-4 w-4" />
          ) : (
            <Volume2 className="h-4 w-4" />
          )}
        </Button>

        <Slider
          value={[localVolume]}
          onValueChange={handleVolumeChange}
          max={100}
          step={5}
          className="flex-1"
          data-testid="slider-radio-volume"
        />
      </div>

      {radioState.isBuffering && (
        <p className="text-xs text-muted-foreground mt-2">Buffering...</p>
      )}
    </div>
  );
}
