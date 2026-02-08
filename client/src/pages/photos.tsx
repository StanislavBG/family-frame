import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Image, Settings, Play, Pause, SkipForward, Camera, Sparkles, Maximize, Minimize } from "lucide-react";
import { useState, useEffect, useCallback, useRef } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useFullscreen } from "@/hooks/use-fullscreen";
import { useToast } from "@/hooks/use-toast";
import { EmptyState } from "@/components/empty-state";
import type { GooglePhotoItem, UserSettings, PixabayPhoto } from "@shared/schema";
import { PhotoSource } from "@shared/schema";

const URL_EXPIRY_MS = 50 * 60 * 1000;

// Fisher-Yates shuffle (returns a new array)
function shuffleArray<T>(arr: T[]): T[] {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function PhotosSkeleton() {
  return (
    <div className="h-full flex items-center justify-center">
      <Skeleton className="w-full h-full max-w-4xl max-h-[70vh] rounded-lg" />
    </div>
  );
}

interface GooglePhotoDisplayProps {
  photos: GooglePhotoItem[];
  interval: number;
}

// Helper to create proxied URL for Google Photos
function getProxiedPhotoUrl(baseUrl: string): string {
  const fullUrl = `${baseUrl}=w1920-h1080`;
  return `/api/photos/proxy?url=${encodeURIComponent(fullUrl)}`;
}

function GooglePhotoDisplay({ photos: initialPhotos, interval }: GooglePhotoDisplayProps) {
  const [, setLocation] = useLocation();
  const [photos, setPhotos] = useState(() => shuffleArray(initialPhotos));
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [currentUrl, setCurrentUrl] = useState<string>(() => {
    const shuffled = photos;
    return shuffled[0]?.baseUrl ? getProxiedPhotoUrl(shuffled[0].baseUrl) : "";
  });
  const refreshingPhotosRef = useRef<Set<string>>(new Set());
  const { isFullscreen, toggleFullscreen, containerRef } = useFullscreen({
    autoEnter: true,
    onExit: () => setLocation("/"),
  });

  useEffect(() => {
    const shuffled = shuffleArray(initialPhotos);
    setPhotos(shuffled);
    setCurrentIndex(0);
    if (shuffled[0]?.baseUrl) {
      setCurrentUrl(getProxiedPhotoUrl(shuffled[0].baseUrl));
    }
  }, [initialPhotos]);

  const isUrlExpired = useCallback((photo: GooglePhotoItem) => {
    if (!photo.fetchedAt) return true;
    return Date.now() - photo.fetchedAt > URL_EXPIRY_MS;
  }, []);

  const refreshPhotoUrlIfNeeded = useCallback(async (photo: GooglePhotoItem): Promise<string | null> => {
    if (!isUrlExpired(photo)) {
      return getProxiedPhotoUrl(photo.baseUrl);
    }

    if (refreshingPhotosRef.current.has(photo.id)) {
      // Already refreshing, return current URL if available
      return photo.baseUrl ? getProxiedPhotoUrl(photo.baseUrl) : null;
    }

    refreshingPhotosRef.current.add(photo.id);

    try {
      const result = await apiRequest("GET", `/api/photos/${photo.id}/refresh`) as { baseUrl: string; fetchedAt: number };

      if (!result.baseUrl) {
        console.warn("Photo refresh returned empty URL for:", photo.id);
        return null;
      }

      setPhotos(prev => prev.map(p =>
        p.id === photo.id
          ? { ...p, baseUrl: result.baseUrl, fetchedAt: result.fetchedAt }
          : p
      ));

      return getProxiedPhotoUrl(result.baseUrl);
    } catch (error) {
      console.error("Failed to refresh photo URL:", error);
      // Return existing URL if still valid, null otherwise
      if (photo.baseUrl && !isUrlExpired(photo)) {
        return getProxiedPhotoUrl(photo.baseUrl);
      }
      return null;
    } finally {
      refreshingPhotosRef.current.delete(photo.id);
    }
  }, [isUrlExpired]);

  useEffect(() => {
    const photo = photos[currentIndex];
    if (!photo) return;

    // Set initial URL if available
    if (photo.baseUrl) {
      setCurrentUrl(getProxiedPhotoUrl(photo.baseUrl));
    }

    // Refresh if expired
    if (isUrlExpired(photo)) {
      refreshPhotoUrlIfNeeded(photo).then(url => {
        if (url) {
          setCurrentUrl(url);
        } else {
          // URL refresh failed, skip to next photo if available
          console.warn("Photo URL expired and refresh failed, skipping:", photo.id);
          if (photos.length > 1) {
            setCurrentIndex((prev) => (prev + 1) % photos.length);
          }
        }
      });
    }
  }, [currentIndex, photos, refreshPhotoUrlIfNeeded, isUrlExpired]);

  const nextPhoto = useCallback(() => {
    setIsTransitioning(true);
    setTimeout(() => {
      setCurrentIndex((prev) => {
        const next = (prev + 1) % photos.length;
        // Re-shuffle when wrapping around for a fresh order each cycle
        if (next === 0) {
          setPhotos(p => shuffleArray(p));
        }
        return next;
      });
      setIsTransitioning(false);
    }, 500);
  }, [photos.length]);

  useEffect(() => {
    if (!isPlaying) return;

    const intervalMs = interval * 1000;
    const timer = setInterval(() => {
      nextPhoto();
    }, intervalMs);

    return () => clearInterval(timer);
  }, [isPlaying, nextPhoto, interval]);

  const currentPhoto = photos[currentIndex];

  if (!currentPhoto) {
    return (
      <EmptyState
        icon={Camera}
        title="No Photos Available"
        description="No photos to display. Connect Google Photos and select albums in Settings."
        actionLabel="Go to Settings"
        onAction={() => window.location.href = "/settings?tab=photos"}
      />
    );
  }

  return (
    <div ref={containerRef} className="h-full relative overflow-hidden bg-black">
      <div
        className={`absolute inset-0 flex items-center justify-center transition-opacity duration-1000 ${
          isTransitioning ? "opacity-0" : "opacity-100"
        }`}
      >
        <img
          src={currentUrl}
          alt={currentPhoto.filename}
          className="max-w-full max-h-full object-contain"
          data-testid="img-current-photo"
        />
      </div>

      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none" />

      <div className="absolute bottom-0 left-0 right-0 p-8">
        <div className="flex items-end justify-between">
          <div className="text-white/90">
            {currentPhoto.creationTime && (
              <p className="text-sm opacity-80" data-testid="text-photo-date">
                {new Date(currentPhoto.creationTime).toLocaleDateString(undefined, {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </p>
            )}
            <p className="text-xs opacity-60 mt-1" data-testid="text-photo-index">
              {currentIndex + 1} of {photos.length}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleFullscreen}
              className="text-white hover:bg-white/20"
              data-testid="button-fullscreen"
            >
              {isFullscreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsPlaying(!isPlaying)}
              className="text-white hover:bg-white/20"
              data-testid="button-play-pause"
            >
              {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={nextPhoto}
              className="text-white hover:bg-white/20"
              data-testid="button-next-photo"
            >
              <SkipForward className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface PixabayPhotoDisplayProps {
  interval: number;
}

function PixabayPhotoDisplay({ interval }: PixabayPhotoDisplayProps) {
  const [, setLocation] = useLocation();
  const [photos, setPhotos] = useState<PixabayPhoto[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [currentTag, setCurrentTag] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const { isFullscreen, toggleFullscreen, containerRef } = useFullscreen({
    autoEnter: true,
    onExit: () => setLocation("/"),
  });

  const fetchPhotos = useCallback(async () => {
    try {
      const result = await apiRequest("GET", "/api/pixabay/photos?per_page=50") as {
        photos: PixabayPhoto[];
        tag: string;
      };
      setPhotos(shuffleArray(result.photos));
      setCurrentTag(result.tag);
      setCurrentIndex(0);
      setIsLoading(false);
    } catch (error) {
      console.error("Failed to fetch Pixabay photos:", error);
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPhotos();
  }, [fetchPhotos]);

  const nextPhoto = useCallback(() => {
    setIsTransitioning(true);
    setTimeout(() => {
      setCurrentIndex((prev) => {
        const next = (prev + 1) % photos.length;
        if (next === 0) {
          fetchPhotos();
        }
        return next;
      });
      setIsTransitioning(false);
    }, 500);
  }, [photos.length, fetchPhotos]);

  useEffect(() => {
    if (!isPlaying || photos.length === 0) return;

    const intervalMs = interval * 1000;
    const timer = setInterval(() => {
      nextPhoto();
    }, intervalMs);

    return () => clearInterval(timer);
  }, [isPlaying, nextPhoto, interval, photos.length]);

  if (isLoading) {
    return <PhotosSkeleton />;
  }

  if (photos.length === 0) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <Card className="max-w-lg">
          <CardContent className="p-12 text-center">
            <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mx-auto mb-6">
              <Image className="h-10 w-10 text-muted-foreground" />
            </div>
            <h2 className="text-2xl font-semibold mb-3">No Photos Available</h2>
            <p className="text-muted-foreground mb-6">
              Unable to load ambient photos. Please try again later.
            </p>
            <Button onClick={fetchPhotos} data-testid="button-retry-pixabay">
              Try Again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const currentPhoto = photos[currentIndex];

  return (
    <div ref={containerRef} className="h-full relative overflow-hidden bg-black">
      <div
        className={`absolute inset-0 flex items-center justify-center transition-opacity duration-1000 ${
          isTransitioning ? "opacity-0" : "opacity-100"
        }`}
      >
        <img
          src={currentPhoto.largeImageURL}
          alt={currentPhoto.tags}
          className="max-w-full max-h-full object-contain"
          data-testid="img-current-photo"
        />
      </div>

      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none" />

      <div className="absolute bottom-0 left-0 right-0 p-8">
        <div className="flex items-end justify-between">
          <div className="text-white/90">
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="h-4 w-4 opacity-60" />
              <span className="text-sm opacity-80 capitalize" data-testid="text-photo-tag">
                {currentTag}
              </span>
            </div>
            <p className="text-xs opacity-60" data-testid="text-photo-credit">
              Photo by {currentPhoto.user} on Pixabay
            </p>
            <p className="text-xs opacity-40 mt-1" data-testid="text-photo-index">
              {currentIndex + 1} of {photos.length}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleFullscreen}
              className="text-white hover:bg-white/20"
              data-testid="button-fullscreen"
            >
              {isFullscreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsPlaying(!isPlaying)}
              className="text-white hover:bg-white/20"
              data-testid="button-play-pause"
            >
              {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={nextPhoto}
              className="text-white hover:bg-white/20"
              data-testid="button-next-photo"
            >
              <SkipForward className="h-5 w-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={fetchPhotos}
              className="text-white hover:bg-white/20"
              data-testid="button-refresh-photos"
              title="Load new photos"
            >
              <Sparkles className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface PickerSessionStatus {
  hasSession: boolean;
  photoCount?: number;
  session?: {
    id: string;
    mediaItemsSet?: boolean;
  };
}

// Consistent response shape from /api/photos
interface PhotosResponse {
  photos: GooglePhotoItem[];
  storedCount: number;
  sessionActive: boolean;
  needsSessionRefresh: boolean;
  sessionError?: string;
  error?: string;
}

export default function PhotosPage() {
  const { toast } = useToast();
  const searchString = useSearch();

  const { data: settings, isLoading: settingsLoading } = useQuery<UserSettings>({
    queryKey: ["/api/settings"],
  });

  // Handle Google OAuth callback redirect
  useEffect(() => {
    const urlParams = new URLSearchParams(searchString);
    const success = urlParams.get("success");
    const error = urlParams.get("error");

    if (success === "google_connected") {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({ title: "Google Photos connected successfully!" });
      window.history.replaceState({}, "", "/photos");
    }

    if (error) {
      toast({
        title: "Failed to connect Google Photos",
        description: error === "token_exchange_failed" ? "Could not complete authorization" : "Please try again",
        variant: "destructive",
      });
      window.history.replaceState({}, "", "/photos");
    }
  }, []);

  const photoSource = settings?.photoSource || PhotoSource.PIXABAY;
  const photoInterval = settings?.photoInterval || 10;

  // Check if user has a completed picker session
  const { data: pickerStatus } = useQuery<PickerSessionStatus>({
    queryKey: ["/api/google/picker/current"],
    enabled: photoSource === PhotoSource.GOOGLE_PHOTOS && settings?.googlePhotosConnected === true,
  });

  const hasPhotosSelected = pickerStatus?.hasSession;

  const { data: photosData, isLoading: photosLoading, error: photosError } = useQuery<PhotosResponse>({
    queryKey: ["/api/photos"],
    enabled: photoSource === PhotoSource.GOOGLE_PHOTOS &&
             settings?.googlePhotosConnected === true &&
             hasPhotosSelected === true,
    staleTime: 0,
    retry: 2, // Retry failed requests
  });

  // Extract data from consistent response shape
  const photos = photosData?.photos || [];
  const storedPhotoCount = photosData?.storedCount || pickerStatus?.photoCount || 0;
  const needsSessionRefresh = photosData?.needsSessionRefresh || false;
  const sessionError = photosData?.sessionError;

  if (settingsLoading) {
    return <PhotosSkeleton />;
  }

  if (photoSource === PhotoSource.PIXABAY) {
    return <PixabayPhotoDisplay interval={photoInterval} />;
  }

  if (!settings?.googlePhotosConnected) {
    return (
      <EmptyState
        icon={Camera}
        title="Connect Google Photos"
        description="Transform your screen into a beautiful digital photo frame. Connect your Google Photos account and select albums to display your cherished memories."
        actionLabel="Go to Settings"
        onAction={() => window.location.href = "/settings?tab=photos"}
      />
    );
  }

  if (!hasPhotosSelected) {
    return (
      <EmptyState
        icon={Image}
        title="Select Photos to Display"
        description="Your Google Photos is connected! Now select which photos you'd like to display in your picture frame slideshow."
        actionLabel="Select Photos"
        onAction={() => window.location.href = "/settings?tab=photos"}
      />
    );
  }

  if (photosLoading) {
    return <PhotosSkeleton />;
  }

  // Handle API errors
  if (photosError) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <Card className="max-w-lg">
          <CardContent className="p-12 text-center">
            <div className="w-20 h-20 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-6">
              <Image className="h-10 w-10 text-destructive" />
            </div>
            <h2 className="text-2xl font-semibold mb-3">Unable to Load Photos</h2>
            <p className="text-muted-foreground mb-6 leading-relaxed">
              There was a problem connecting to Google Photos. This may be a temporary issue.
            </p>
            <div className="flex gap-3 justify-center">
              <Button onClick={() => window.location.reload()} variant="outline" data-testid="button-retry">
                Try Again
              </Button>
              <Button asChild data-testid="button-settings">
                <Link href="/settings?tab=photos">
                  <Settings className="h-5 w-5 mr-2" />
                  Settings
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!photos || photos.length === 0) {
    const getErrorMessage = () => {
      if (needsSessionRefresh && storedPhotoCount > 0) {
        return `You have ${storedPhotoCount} photo${storedPhotoCount === 1 ? "" : "s"} saved. Open the photo picker to refresh access to them.`;
      }
      if (sessionError) {
        return `Unable to access your photos: ${sessionError}. Please re-select your photos.`;
      }
      return "No photos were retrieved from your selection. Try selecting different photos.";
    };

    return (
      <div className="h-full flex items-center justify-center p-8">
        <Card className="max-w-lg">
          <CardContent className="p-12 text-center">
            <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mx-auto mb-6">
              <Image className="h-10 w-10 text-muted-foreground" />
            </div>
            <h2 className="text-2xl font-semibold mb-3">
              {needsSessionRefresh && storedPhotoCount > 0 ? "Session Expired" : "No Photos Found"}
            </h2>
            <p className="text-muted-foreground mb-6 leading-relaxed">
              {getErrorMessage()}
            </p>
            <Button asChild variant="outline" data-testid="button-change-photos">
              <Link href="/settings?tab=photos">
                <Settings className="h-5 w-5 mr-2" />
                {needsSessionRefresh ? "Refresh Photos" : "Change Photos"}
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <GooglePhotoDisplay photos={photos} interval={photoInterval} />;
}
