import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { useWeatherData } from "@/hooks/use-weather-data";
import { formatTemperature } from "@/lib/weather-utils";
import type { UserSettings, GooglePhotoItem } from "@shared/schema";
import { PhotoSource } from "@shared/schema";

// Screensaver modes cycle through these displays
type ScreensaverDisplay = "photos" | "clock" | "weather";

const CYCLE_INTERVAL = 30000; // 30 seconds per mode when cycling
const PHOTO_INTERVAL = 10000; // 10 seconds per photo

function getWeatherEmoji(code: number, isDay: boolean): string {
  if (code === 0) return isDay ? "\u2600\ufe0f" : "\ud83c\udf19";
  if (code <= 3) return isDay ? "\u26c5" : "\ud83c\udf19";
  if (code <= 49) return "\ud83c\udf2b\ufe0f";
  if (code <= 69) return "\ud83c\udf27\ufe0f";
  if (code <= 79) return "\u2744\ufe0f";
  if (code <= 99) return "\u26a1";
  return "\u2601\ufe0f";
}

// Ambient clock display
function AmbientClock({ timeFormat }: { timeFormat: "12h" | "24h" }) {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const formatTime = () => {
    if (timeFormat === "12h") {
      return time.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true });
    }
    return time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
  };

  const formatDate = () => {
    return time.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
  };

  return (
    <div className="flex flex-col items-center justify-center text-white animate-fade-in">
      <div className="text-[12vw] font-light tracking-tight tabular-nums leading-none">
        {formatTime()}
      </div>
      <div className="text-[3vw] font-light text-white/70 mt-4">
        {formatDate()}
      </div>
    </div>
  );
}

// Ambient weather display
function AmbientWeather({
  temperature,
  weatherCode,
  isDay,
  description,
  temperatureUnit,
  location
}: {
  temperature: number;
  weatherCode: number;
  isDay: boolean;
  description: string;
  temperatureUnit: "celsius" | "fahrenheit";
  location?: { city?: string; country?: string };
}) {
  return (
    <div className="flex flex-col items-center justify-center text-white animate-fade-in">
      <div className="text-[8vw] mb-4">
        {getWeatherEmoji(weatherCode, isDay)}
      </div>
      <div className="text-[10vw] font-light tracking-tight leading-none">
        {formatTemperature(temperature, temperatureUnit)}
      </div>
      <div className="text-[2.5vw] font-light text-white/70 mt-4">
        {description}
      </div>
      {location?.city && (
        <div className="text-[2vw] font-light text-white/50 mt-2">
          {location.city}{location.country ? `, ${location.country}` : ""}
        </div>
      )}
    </div>
  );
}

// Helper to create proxied URL for Google Photos
function getProxiedPhotoUrl(baseUrl: string): string {
  const fullUrl = `${baseUrl}=w1920-h1080`;
  return `/api/photos/proxy?url=${encodeURIComponent(fullUrl)}`;
}

// Ambient photo display with Ken Burns effect
function AmbientPhoto({ photo, index }: { photo: GooglePhotoItem; index: number }) {
  // Alternate between different pan/zoom animations
  const animations = [
    "animate-ken-burns-1",
    "animate-ken-burns-2",
    "animate-ken-burns-3",
  ];
  const animation = animations[index % animations.length];

  return (
    <div className="absolute inset-0 overflow-hidden">
      <img
        src={getProxiedPhotoUrl(photo.baseUrl)}
        alt=""
        className={cn(
          "absolute inset-0 w-full h-full object-cover",
          animation
        )}
      />
      {/* Subtle vignette overlay */}
      <div className="absolute inset-0 bg-gradient-radial from-transparent via-transparent to-black/40" />
    </div>
  );
}

// Type for photos API response
interface PhotosResponse {
  photos?: GooglePhotoItem[];
  storedCount?: number;
  needsSessionRefresh?: boolean;
}

export default function ScreensaverPage() {
  const [, navigate] = useLocation();
  const [currentDisplay, setCurrentDisplay] = useState<ScreensaverDisplay>("clock");
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const [position, setPosition] = useState({ x: 50, y: 50 }); // For burn-in prevention
  const exitTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const { data: settings } = useQuery<UserSettings>({
    queryKey: ["/api/settings"],
  });

  const { weather, temperatureUnit: weatherTempUnit } = useWeatherData();

  // Fetch photos from API (with fresh URLs)
  const hasPhotosSelected = (settings?.selectedPhotos?.length ?? 0) > 0;
  const { data: photosData } = useQuery<GooglePhotoItem[] | PhotosResponse>({
    queryKey: ["/api/photos"],
    enabled: settings?.photoSource === PhotoSource.GOOGLE_PHOTOS &&
             settings?.googlePhotosConnected === true &&
             hasPhotosSelected,
    staleTime: 0,
  });

  // Extract photos array from response
  const photos: GooglePhotoItem[] = Array.isArray(photosData)
    ? photosData
    : (photosData as PhotosResponse)?.photos || [];
  const screensaverMode = settings?.screensaverMode || "cycle";
  const timeFormat = settings?.timeFormat || "24h";
  const temperatureUnit = weatherTempUnit;

  // Cycle through displays if mode is "cycle"
  useEffect(() => {
    if (screensaverMode !== "cycle") {
      setCurrentDisplay(screensaverMode as ScreensaverDisplay);
      return;
    }

    const displays: ScreensaverDisplay[] = ["clock"];
    if (weather) displays.push("weather");
    if (photos.length > 0) displays.push("photos");

    let index = 0;
    const interval = setInterval(() => {
      index = (index + 1) % displays.length;
      setCurrentDisplay(displays[index]);
    }, CYCLE_INTERVAL);

    return () => clearInterval(interval);
  }, [screensaverMode, weather, photos.length]);

  // Cycle through photos when in photos mode
  useEffect(() => {
    if (currentDisplay !== "photos" || photos.length === 0) return;

    const interval = setInterval(() => {
      setCurrentPhotoIndex(i => (i + 1) % photos.length);
    }, PHOTO_INTERVAL);

    return () => clearInterval(interval);
  }, [currentDisplay, photos.length]);

  // Subtle position shift for burn-in prevention (every 5 minutes)
  useEffect(() => {
    const interval = setInterval(() => {
      setPosition({
        x: 45 + Math.random() * 10, // 45-55%
        y: 45 + Math.random() * 10, // 45-55%
      });
    }, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, []);

  // Exit screensaver on any interaction
  const handleExit = useCallback(() => {
    // Debounce to prevent accidental exits
    if (exitTimeoutRef.current) return;

    exitTimeoutRef.current = setTimeout(() => {
      navigate("/");
      exitTimeoutRef.current = null;
    }, 100);
  }, [navigate]);

  useEffect(() => {
    const handleInteraction = () => handleExit();

    window.addEventListener("click", handleInteraction);
    window.addEventListener("touchstart", handleInteraction);
    window.addEventListener("keydown", handleInteraction);
    window.addEventListener("mousemove", handleInteraction);

    return () => {
      window.removeEventListener("click", handleInteraction);
      window.removeEventListener("touchstart", handleInteraction);
      window.removeEventListener("keydown", handleInteraction);
      window.removeEventListener("mousemove", handleInteraction);
      if (exitTimeoutRef.current) clearTimeout(exitTimeoutRef.current);
    };
  }, [handleExit]);

  return (
    <div className="fixed inset-0 bg-black overflow-hidden cursor-none">
      {/* Photo background (always rendered for smooth transitions) */}
      {photos.length > 0 && currentDisplay === "photos" && (
        <AmbientPhoto
          photo={photos[currentPhotoIndex]}
          index={currentPhotoIndex}
        />
      )}

      {/* Content overlay */}
      <div
        className="absolute inset-0 flex items-center justify-center transition-all duration-1000"
        style={{
          transform: `translate(${position.x - 50}%, ${position.y - 50}%)`,
        }}
      >
        {currentDisplay === "clock" && (
          <AmbientClock timeFormat={timeFormat} />
        )}

        {currentDisplay === "weather" && weather?.current && (
          <AmbientWeather
            temperature={weather.current.temperature}
            weatherCode={weather.current.weatherCode}
            isDay={weather.current.isDay}
            description={weather.current.description}
            temperatureUnit={temperatureUnit}
            location={weather.location}
          />
        )}

        {/* Small clock overlay when showing photos */}
        {currentDisplay === "photos" && (
          <div className="absolute bottom-8 right-8 text-white/80 text-2xl font-light">
            {new Date().toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
              hour12: timeFormat === "12h"
            })}
          </div>
        )}
      </div>

      {/* Touch hint (fades out) */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/30 text-sm animate-fade-out-delayed">
        Touch anywhere to exit
      </div>
    </div>
  );
}
