import Hls from "hls.js";

export interface RadioStation {
  name: string;
  url: string;
  fallbackUrls?: string[];
  logo?: string;
}

export interface PlaylistTrack {
  title: string;
  url: string;
}

export interface StreamMetadata {
  stationName: string | null;
  description: string | null;
  genre: string | null;
  bitrate: number | null;
  stationUrl: string | null;
  contentType: string | null;
  nowPlaying: string | null;
  artist: string | null;
  title: string | null;
}

export const RADIO_STATIONS: RadioStation[] = [
  { 
    name: "BG Radio", 
    url: "https://playerservices.streamtheworld.com/api/livestream-redirect/BG_RADIOAAC_H.aac",
    fallbackUrls: [
      "https://playerservices.streamtheworld.com/api/livestream-redirect/BG_RADIOAAC_L.aac",
      "http://play.global.audio/bgradio.ogg",
      "http://stream.radioreklama.bg/bgradio128",
    ],
    logo: "https://i.imgur.com/J2Vv9Lz.png" 
  },
  { name: "Radio Energy", url: "http://play.global.audio/nrj128", logo: "https://i.imgur.com/Fg0QKWM.png" },
  { name: "Magic FM", url: "https://bss1.neterra.tv/magicfm/magicfm.m3u8", logo: "https://i.imgur.com/n7bcrrp.png" },
  { name: "Avto Radio", url: "https://playerservices.streamtheworld.com/api/livestream-redirect/AVTORADIOAAC_L.aac", logo: "https://i.imgur.com/VNHL0Lt.png" },
  { name: "BNR Horizont", url: "http://stream.bnr.bg:8000/horizont.mp3", logo: "https://i.imgur.com/HJSkXaS.png" },
  { name: "BNR Hristo Botev", url: "http://stream.bnr.bg:8012/hristo-botev.aac", logo: "https://i.imgur.com/fmypTHa.png" },
  { name: "1 Rock Bulgaria", url: "http://31.13.223.148:8000/1_rock.mp3", logo: "https://i.imgur.com/1TxGNtW.png" },
  { name: "bTV Radio", url: "https://cdn.bweb.bg/radio/btv-radio.mp3", logo: "https://i.imgur.com/OoJSmoj.png" },
];

export type AudioMode = "stream" | "playlist";

type RadioEventType = "stateChange" | "volumeChange" | "stationChange" | "trackChange" | "error" | "metadataChange";
type RadioEventCallback = (data: any) => void;

class RadioService {
  private static instance: RadioService;
  private audio: HTMLAudioElement | null = null;
  private hls: Hls | null = null;
  private currentStation: string = "";
  private isPlaying: boolean = false;
  private isBuffering: boolean = false;
  private volume: number = 50;
  private listeners: Map<RadioEventType, Set<RadioEventCallback>> = new Map();
  
  private mode: AudioMode = "stream";
  private playlist: PlaylistTrack[] = [];
  private currentTrackIndex: number = 0;
  private playlistName: string = "";
  
  private currentStationData: RadioStation | null = null;
  private fallbackIndex: number = 0;
  
  private metadata: StreamMetadata | null = null;
  private metadataPollingInterval: number | null = null;

  private constructor() {
    this.listeners.set("stateChange", new Set());
    this.listeners.set("volumeChange", new Set());
    this.listeners.set("stationChange", new Set());
    this.listeners.set("trackChange", new Set());
    this.listeners.set("error", new Set());
    this.listeners.set("metadataChange", new Set());
  }

  static getInstance(): RadioService {
    if (!RadioService.instance) {
      RadioService.instance = new RadioService();
    }
    return RadioService.instance;
  }

  private ensureAudio(): HTMLAudioElement {
    if (!this.audio) {
      this.audio = new Audio();
      // Don't set crossOrigin - it causes CORS issues with Archive.org redirects
      // crossOrigin is only needed if we want to analyze audio data (e.g. visualizations)
      
      this.audio.addEventListener("waiting", () => {
        this.isBuffering = true;
        this.emit("stateChange", this.getState());
      });
      
      this.audio.addEventListener("playing", () => {
        this.isBuffering = false;
        this.isPlaying = true;
        this.emit("stateChange", this.getState());
      });
      
      this.audio.addEventListener("pause", () => {
        this.isPlaying = false;
        this.emit("stateChange", this.getState());
      });
      
      this.audio.addEventListener("error", (e) => {
        const audio = e.target as HTMLAudioElement;
        const error = audio.error;
        console.error("[RadioService] Audio error:", error?.code, error?.message);
        console.error("[RadioService] Failed URL:", audio.src);
        
        // Try fallback URL in stream mode
        if (this.mode === "stream" && this.currentStationData?.fallbackUrls) {
          const fallbacks = this.currentStationData.fallbackUrls;
          if (this.fallbackIndex < fallbacks.length) {
            const nextUrl = fallbacks[this.fallbackIndex];
            console.log(`[RadioService] Trying fallback ${this.fallbackIndex + 1}/${fallbacks.length}: ${nextUrl}`);
            this.fallbackIndex++;
            this.playStreamUrl(nextUrl);
            return;
          } else {
            console.error("[RadioService] All stream sources failed for station:", this.currentStationData?.name);
          }
        }
        
        this.isPlaying = false;
        this.isBuffering = false;
        this.emit("stateChange", this.getState());
        
        // Emit user-friendly error message
        const stationName = this.currentStationData?.name;
        if (stationName && this.mode === "stream") {
          this.emit("error", { 
            message: `Unable to play ${stationName}. All sources unavailable.` 
          });
        } else {
          this.emit("error", { message: `Stream error: ${error?.message || 'Unknown'}` });
        }
        
        // Auto-skip to next track on error in playlist mode
        if (this.mode === "playlist" && this.playlist.length > 1) {
          setTimeout(() => this.nextTrack(), 500);
        }
      });
      
      this.audio.addEventListener("canplay", () => {
        this.isBuffering = false;
        this.emit("stateChange", this.getState());
      });
      
      this.audio.addEventListener("ended", () => {
        console.log("[RadioService] Track ended, mode:", this.mode, "playlist length:", this.playlist.length);
        if (this.mode === "playlist" && this.playlist.length > 0) {
          console.log("[RadioService] Auto-advancing to next track");
          this.nextTrack();
        } else {
          this.isPlaying = false;
          this.emit("stateChange", this.getState());
        }
      });
    }
    return this.audio;
  }

  private isHlsStream(url: string): boolean {
    return url.includes(".m3u8");
  }

  subscribe(event: RadioEventType, callback: RadioEventCallback): () => void {
    this.listeners.get(event)?.add(callback);
    return () => {
      this.listeners.get(event)?.delete(callback);
    };
  }

  private emit(event: RadioEventType, data: any): void {
    this.listeners.get(event)?.forEach(cb => cb(data));
  }

  getState() {
    return {
      isPlaying: this.isPlaying,
      isBuffering: this.isBuffering,
      currentStation: this.currentStationData?.url || this.currentStation,
      activeStreamUrl: this.currentStation,
      stationName: this.currentStationData?.name || null,
      volume: this.volume,
      mode: this.mode,
      playlistName: this.playlistName,
      currentTrack: this.mode === "playlist" && this.playlist.length > 0 
        ? this.playlist[this.currentTrackIndex] 
        : null,
      currentTrackIndex: this.currentTrackIndex,
      playlistLength: this.playlist.length,
      metadata: this.metadata,
    };
  }

  private async fetchMetadata(): Promise<void> {
    if (!this.currentStation || this.mode !== "stream") return;
    
    try {
      const response = await fetch(`/api/radio/metadata?url=${encodeURIComponent(this.currentStation)}`);
      if (response.ok) {
        const data = await response.json() as StreamMetadata;
        this.metadata = data;
        this.emit("metadataChange", data);
      }
    } catch (error) {
      console.log("[RadioService] Metadata fetch failed:", error);
    }
  }

  private startMetadataPolling(): void {
    this.stopMetadataPolling();
    // Fetch immediately
    this.fetchMetadata();
    // Then poll every 20 seconds
    this.metadataPollingInterval = window.setInterval(() => {
      this.fetchMetadata();
    }, 20000);
  }

  private stopMetadataPolling(): void {
    if (this.metadataPollingInterval) {
      clearInterval(this.metadataPollingInterval);
      this.metadataPollingInterval = null;
    }
    this.metadata = null;
  }

  getMetadata(): StreamMetadata | null {
    return this.metadata;
  }

  getStationByUrl(url: string): RadioStation | undefined {
    return RADIO_STATIONS.find(s => s.url === url || s.fallbackUrls?.includes(url));
  }

  play(stationUrl: string): void {
    this.mode = "stream";
    this.fallbackIndex = 0;
    
    // Find station data by primary URL or fallback URL for resilience
    this.currentStationData = RADIO_STATIONS.find(
      s => s.url === stationUrl || s.fallbackUrls?.includes(stationUrl)
    ) || null;
    
    // Use primary URL if found via fallback, otherwise use provided URL
    const primaryUrl = this.currentStationData?.url || stationUrl;
    
    this.emit("stationChange", { 
      station: primaryUrl, 
      stationName: this.currentStationData?.name 
    });
    this.playStreamUrl(primaryUrl);
    
    // Start metadata polling for stream mode
    this.startMetadataPolling();
  }

  private playStreamUrl(url: string): void {
    const audio = this.ensureAudio();
    
    // Set crossOrigin for streaming mode (HLS needs it)
    audio.crossOrigin = "anonymous";

    if (this.hls) {
      this.hls.destroy();
      this.hls = null;
    }

    audio.pause();
    audio.src = "";

    this.currentStation = url;
    this.isBuffering = true;
    this.emit("stateChange", this.getState());

    console.log("[RadioService] Playing stream URL:", url);

    if (this.isHlsStream(url) && Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
      });

      hls.loadSource(url);
      hls.attachMedia(audio);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        this.isBuffering = false;
        audio.play().then(() => {
          this.isPlaying = true;
          this.emit("stateChange", this.getState());
        }).catch(console.error);
      });

      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) {
          console.error("HLS error:", data);
          
          // Try fallback for HLS errors too
          if (this.currentStationData?.fallbackUrls && this.fallbackIndex < this.currentStationData.fallbackUrls.length) {
            const nextUrl = this.currentStationData.fallbackUrls[this.fallbackIndex];
            console.log(`[RadioService] HLS failed, trying fallback ${this.fallbackIndex + 1}: ${nextUrl}`);
            this.fallbackIndex++;
            this.playStreamUrl(nextUrl);
            return;
          }
          
          console.error("[RadioService] All stream sources failed for station:", this.currentStationData?.name);
          this.isPlaying = false;
          this.isBuffering = false;
          this.emit("stateChange", this.getState());
          this.emit("error", { 
            message: `Unable to play ${this.currentStationData?.name || 'station'}. All sources unavailable.` 
          });
        }
      });

      this.hls = hls;
    } else if (this.isHlsStream(url) && audio.canPlayType("application/vnd.apple.mpegurl")) {
      audio.src = url;
      audio.play().then(() => {
        this.isPlaying = true;
        this.emit("stateChange", this.getState());
      }).catch(console.error);
    } else {
      audio.src = url;
      audio.play().then(() => {
        this.isPlaying = true;
        this.emit("stateChange", this.getState());
      }).catch(console.error);
    }
  }

  stop(): void {
    this.stopMetadataPolling();
    if (this.hls) {
      this.hls.destroy();
      this.hls = null;
    }
    if (this.audio) {
      this.audio.pause();
      this.audio.src = "";
    }
    this.isPlaying = false;
    this.isBuffering = false;
    this.currentStation = "";
    this.mode = "stream";
    this.playlist = [];
    this.currentTrackIndex = 0;
    this.playlistName = "";
    this.currentStationData = null;
    this.fallbackIndex = 0;
    this.emit("stateChange", this.getState());
  }

  pause(): void {
    this.stopMetadataPolling();
    if (this.audio) {
      this.audio.pause();
    }
    this.isPlaying = false;
    this.emit("stateChange", this.getState());
  }

  resume(): void {
    if (this.audio && (this.currentStation || this.mode === "playlist")) {
      this.audio.play().then(() => {
        this.isPlaying = true;
        this.emit("stateChange", this.getState());
        // Resume metadata polling for stream mode
        if (this.mode === "stream") {
          this.startMetadataPolling();
        }
      }).catch(console.error);
    }
  }

  setVolume(volume: number): void {
    this.volume = volume;
    if (this.audio) {
      this.audio.volume = volume / 100;
    }
    this.emit("volumeChange", { volume });
  }

  getCurrentStation(): string {
    return this.currentStation;
  }

  isCurrentlyPlaying(): boolean {
    return this.isPlaying;
  }

  private resetAudio(): void {
    if (this.hls) {
      this.hls.destroy();
      this.hls = null;
    }
    if (this.audio) {
      this.audio.pause();
      this.audio.src = "";
    }
    this.isPlaying = false;
    this.isBuffering = false;
    this.currentStation = "";
  }

  playPlaylist(tracks: PlaylistTrack[], name: string, startIndex: number = 0): void {
    console.log("[RadioService] playPlaylist called with", tracks.length, "tracks, starting at index", startIndex);
    if (tracks.length === 0) return;
    
    this.resetAudio();
    
    this.mode = "playlist";
    this.playlist = tracks;
    this.playlistName = name;
    this.currentTrackIndex = startIndex;
    
    console.log("[RadioService] Mode set to playlist, playing track", startIndex);
    this.playCurrentTrack();
  }

  private playCurrentTrack(): void {
    if (this.playlist.length === 0 || this.currentTrackIndex >= this.playlist.length) return;
    
    const track = this.playlist[this.currentTrackIndex];
    console.log("[RadioService] playCurrentTrack - track:", track.title);
    console.log("[RadioService] playCurrentTrack - URL:", track.url);
    
    if (!track.url) {
      console.error("[RadioService] Track has no URL, skipping");
      if (this.playlist.length > 1) {
        setTimeout(() => this.nextTrack(), 100);
      }
      return;
    }
    
    const audio = this.ensureAudio();
    
    // Remove crossOrigin for playlist mode - Archive.org redirects don't support CORS
    audio.crossOrigin = null;
    
    if (this.hls) {
      this.hls.destroy();
      this.hls = null;
    }
    
    this.currentStation = track.url;
    this.isBuffering = true;
    this.emit("stateChange", this.getState());
    this.emit("trackChange", { track, index: this.currentTrackIndex });
    
    // Set source and wait for canplaythrough before playing
    audio.src = track.url;
    
    const playWhenReady = () => {
      audio.removeEventListener("canplaythrough", playWhenReady);
      audio.play().then(() => {
        console.log("[RadioService] Play started successfully");
        this.isPlaying = true;
        this.emit("stateChange", this.getState());
      }).catch((err) => {
        // Ignore AbortError - it just means we switched tracks
        if (err.name === "AbortError") {
          console.log("[RadioService] Play aborted (track changed)");
          return;
        }
        console.error("[RadioService] Play error:", err.name, err.message);
        // Auto-skip to next track on real play failure
        if (this.mode === "playlist" && this.playlist.length > 1) {
          setTimeout(() => this.nextTrack(), 1000);
        }
      });
    };
    
    audio.addEventListener("canplaythrough", playWhenReady, { once: true });
    audio.load();
  }

  nextTrack(): void {
    console.log("[RadioService] nextTrack called, mode:", this.mode, "playlist length:", this.playlist.length);
    if (this.mode !== "playlist" || this.playlist.length === 0) return;
    
    this.currentTrackIndex = (this.currentTrackIndex + 1) % this.playlist.length;
    console.log("[RadioService] Playing track index:", this.currentTrackIndex);
    this.playCurrentTrack();
  }

  previousTrack(): void {
    if (this.mode !== "playlist" || this.playlist.length === 0) return;
    
    this.currentTrackIndex = this.currentTrackIndex === 0 
      ? this.playlist.length - 1 
      : this.currentTrackIndex - 1;
    this.playCurrentTrack();
  }

  getMode(): AudioMode {
    return this.mode;
  }

  getPlaylistName(): string {
    return this.playlistName;
  }
}

export const radioService = RadioService.getInstance();
