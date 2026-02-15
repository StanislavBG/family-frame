import { useState, useEffect } from "react";
import { Radio, Pause, Play } from "lucide-react";
import { radioService, type StreamMetadata } from "@/lib/radio-service";
import { cn } from "@/lib/utils";

export function RadioFAB() {
  const [radioState, setRadioState] = useState(radioService.getState());
  const [metadata, setMetadata] = useState<StreamMetadata | null>(null);

  useEffect(() => {
    const unsubState = radioService.subscribe("stateChange", (state) => {
      setRadioState(state);
      if (state.metadata) setMetadata(state.metadata);
    });
    const unsubMeta = radioService.subscribe("metadataChange", (data: StreamMetadata) => {
      setMetadata(data);
    });
    const init = radioService.getState();
    setRadioState(init);
    if (init.metadata) setMetadata(init.metadata);
    return () => { unsubState(); unsubMeta(); };
  }, []);

  // Only show when there's an active station (playing or paused with a station loaded)
  if (!radioState.currentStation && !radioState.stationName) return null;

  const isPlaying = radioState.isPlaying;
  const stationName = radioState.stationName || "Radio";
  const nowPlaying = metadata?.artist
    ? `${metadata.artist} - ${metadata.title}`
    : metadata?.title || metadata?.nowPlaying || null;

  const handleToggle = () => {
    if (isPlaying) {
      radioService.pause();
    } else {
      radioService.resume();
    }
  };

  return (
    <button
      onClick={handleToggle}
      className={cn(
        "fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-full shadow-lg transition-all",
        "hover:shadow-xl active:scale-95",
        "bg-primary text-primary-foreground",
        isPlaying ? "pl-3 pr-4 py-2.5" : "p-3"
      )}
      aria-label={isPlaying ? "Pause radio" : "Resume radio"}
      data-testid="radio-fab"
    >
      {isPlaying ? (
        <>
          <Radio className="h-4 w-4 animate-pulse flex-shrink-0" />
          <div className="flex flex-col items-start min-w-0 max-w-40">
            <span className="text-xs font-semibold leading-tight truncate w-full">
              {stationName}
            </span>
            {nowPlaying && (
              <span className="text-[10px] leading-tight opacity-80 truncate w-full">
                {nowPlaying}
              </span>
            )}
          </div>
          <Pause className="h-4 w-4 flex-shrink-0 ml-1" />
        </>
      ) : (
        <>
          <Play className="h-5 w-5" />
        </>
      )}
    </button>
  );
}
