import type { Express, Request, Response } from "express";
import { isAllowedStreamUrl } from "../url-guards";
import { asyncHandler } from "../middleware";
import { FETCH_TIMEOUT_MS, HEALTH_CHECK_TIMEOUT_MS, PUBLIC_CACHE_TTL_MS, memoTTL, discardBody } from "../route-helpers";
import { ALLOWED_STREAM_DOMAINS, DisallowedRedirectError, fetchFollowingAllowed } from "../media-proxy";

export function registerRadioRoutes(app: Express): void {
  // Radio stations organized by category (countries + genres) with icons
    interface StationConfig {
      name: string;
      url: string;
      fallbackUrls?: string[];
      logo?: string;
    }

    interface CategoryConfig {
      icon: string;
      stations: StationConfig[];
    }

    const stationsByCategory: Record<string, CategoryConfig> = {
      // Country categories
      "Bulgaria": {
        icon: "🇧🇬",
        stations: [
          {
            name: "BG Radio",
            url: "https://playerservices.streamtheworld.com/api/livestream-redirect/BG_RADIOAAC_H.aac",
            fallbackUrls: [
              "https://playerservices.streamtheworld.com/api/livestream-redirect/BG_RADIOAAC_L.aac",
            ],
          },
          {
            name: "Radio Energy",
            url: "https://playerservices.streamtheworld.com/api/livestream-redirect/RADIO_ENERGYAAC_H.aac",
            fallbackUrls: [
              "https://playerservices.streamtheworld.com/api/livestream-redirect/RADIO_ENERGYAAC_L.aac",
            ],
          },
          {
            name: "Magic FM",
            url: "https://bss1.neterra.tv/magicfm/magicfm.m3u8",
            fallbackUrls: ["https://bss.neterra.tv/rtplive/magicfmradio_live.stream/playlist.m3u8"],
          },
          {
            name: "Avto Radio",
            url: "https://playerservices.streamtheworld.com/api/livestream-redirect/AVTORADIOAAC_H.aac",
            fallbackUrls: [
              "https://playerservices.streamtheworld.com/api/livestream-redirect/AVTORADIOAAC_L.aac",
            ],
          },
          { name: "The Voice Radio", url: "https://bss.neterra.tv/rtplive/thevoiceradio_live.stream/playlist.m3u8" },
          { name: "bTV Radio", url: "https://cdn.bweb.bg/radio/btv-radio.mp3" },
        ],
      },
      "Serbia": {
        icon: "🇷🇸",
        stations: [
          { name: "Radio 021", url: "https://centova.dukahosting.com/proxy/021kafe/stream" },
        ],
      },
      "Russia": {
        icon: "🇷🇺",
        stations: [
          { name: "Radio Record", url: "https://radiorecord.hostingradio.ru/rr_main96.aacp" },
          { name: "Russian Gold", url: "https://radiorecord.hostingradio.ru/russiangold96.aacp" },
          { name: "Relax FM", url: "https://pub0201.101.ru/stream/trust/mp3/128/24" },
        ],
      },
      // Genre categories - non-commercial free streams (HTTPS only for mixed content safety)
      "Jazz": {
        icon: "🎷",
        stations: [
          { name: "KCSM Jazz", url: "https://ice7.securenetsystems.net/KCSM2" },
          { name: "Jazz24", url: "https://live.amperwave.net/direct/ppm-jazz24mp3-ibc1" },
          { name: "ABC Jazz", url: "https://live-radio01.mediahubaustralia.com/JAZW/mp3/" },
        ],
      },
      "Classical": {
        icon: "🎻",
        stations: [
          { name: "WQXR Classical", url: "https://stream.wqxr.org/wqxr" },
          { name: "ABC Classic", url: "https://live-radio01.mediahubaustralia.com/2FMW/mp3/" },
        ],
      },
      "Metal": {
        icon: "🤘",
        stations: [
          { name: "KNAC Pure Rock", url: "https://stream.knac.com/knac" },
        ],
      },
      "Ambient": {
        icon: "🌙",
        stations: [
          { name: "SomaFM Drone Zone", url: "https://ice1.somafm.com/dronezone-128-mp3" },
          { name: "SomaFM Space Station", url: "https://ice1.somafm.com/spacestation-128-mp3" },
          { name: "SomaFM Deep Space One", url: "https://ice1.somafm.com/deepspaceone-128-mp3" },
          { name: "SomaFM Groove Salad", url: "https://ice1.somafm.com/groovesalad-128-mp3" },
        ],
      },
      "Electronic": {
        icon: "🎧",
        stations: [
          { name: "SomaFM Secret Agent", url: "https://ice1.somafm.com/secretagent-128-mp3" },
          { name: "SomaFM DEF CON", url: "https://ice1.somafm.com/defcon-128-mp3" },
          { name: "SomaFM Beat Blender", url: "https://ice1.somafm.com/beatblender-128-mp3" },
        ],
      },
    };

  const getRadioStations = memoTTL(async () => {
    // Helper to check if a URL is reachable
    async function checkUrl(url: string): Promise<boolean> {
      try {
        // Try HEAD first
        const response = await fetch(url, {
          method: "HEAD",
          signal: AbortSignal.timeout(HEALTH_CHECK_TIMEOUT_MS),
          redirect: "follow",
        });
        await discardBody(response);

        if (response.status === 200 || response.status === 302 || response.status === 405) {
          return true;
        }
      } catch {
        // HEAD failed, continue to GET
      }

      // Try GET for streams that don't support HEAD
      try {
        const response = await fetch(url, {
          method: "GET",
          signal: AbortSignal.timeout(HEALTH_CHECK_TIMEOUT_MS),
          redirect: "follow",
        });
        await discardBody(response);

        return response.status === 200 || response.status === 302;
      } catch {
        return false;
      }
    }

    // Check station and find best working URL (primary or fallback)
    async function checkStation(station: StationConfig): Promise<StationConfig | null> {
      // Try primary URL first
      if (await checkUrl(station.url)) {
        return station;
      }

      // Try fallback URLs
      if (station.fallbackUrls) {
        for (const fallbackUrl of station.fallbackUrls) {
          if (await checkUrl(fallbackUrl)) {
            // Return station with working fallback as primary
            return {
              ...station,
              url: fallbackUrl,
              fallbackUrls: [station.url, ...station.fallbackUrls.filter(u => u !== fallbackUrl)],
            };
          }
        }
      }

      // No working URLs found - still return station so user can try
      // (stream might work even if health check fails)
      return station;
    }

    // Response includes icon for each category
    interface CategoryResponse {
      icon: string;
      stations: StationConfig[];
    }

    // Test all stations in parallel, grouped by category
    const result: Record<string, CategoryResponse> = {};

    await Promise.all(
      Object.entries(stationsByCategory).map(async ([category, config]) => {
        const checkedStations = await Promise.all(
          config.stations.map(async (station) => checkStation(station))
        );
        result[category] = {
          icon: config.icon,
          stations: checkedStations.filter((s): s is StationConfig => s !== null),
        };
      })
    );

    return result;
  }, PUBLIC_CACHE_TTL_MS);

  app.get("/api/radio/stations", asyncHandler(async (_req: Request, res: Response) => {
    res.json(await getRadioStations());
  }));

  // Legacy radio stream proxy (kept for backward compatibility)
  app.get("/api/radio/stream", async (req: Request, res: Response) => {
    // Redirect to the new media proxy
    const streamUrl = req.query.url as string;
    if (streamUrl) {
      res.redirect(`/api/media/proxy?url=${encodeURIComponent(streamUrl)}`);
    } else {
      res.status(400).json({ error: "Missing stream URL" });
    }
  });

  // Radio stream validation endpoint - deep health check for all stations
  const getRadioValidation = memoTTL(async () => {
    interface ValidationResult {
      name: string;
      url: string;
      status: "ok" | "degraded" | "error";
      responseTimeMs: number;
      contentType: string | null;
      httpStatus: number | null;
      bytesReceived: number;
      error: string | null;
      checkedAt: string;
    }

    // All stations to validate (same source as /api/radio/stations Bulgaria category)
    const stationsToValidate = [
      { name: "BG Radio", url: "https://playerservices.streamtheworld.com/api/livestream-redirect/BG_RADIOAAC_H.aac" },
      { name: "BG Radio (Low)", url: "https://playerservices.streamtheworld.com/api/livestream-redirect/BG_RADIOAAC_L.aac" },
      { name: "Radio Energy", url: "https://playerservices.streamtheworld.com/api/livestream-redirect/RADIO_ENERGYAAC_H.aac" },
      { name: "Radio Energy (Low)", url: "https://playerservices.streamtheworld.com/api/livestream-redirect/RADIO_ENERGYAAC_L.aac" },
      { name: "Magic FM", url: "https://bss1.neterra.tv/magicfm/magicfm.m3u8" },
      { name: "Avto Radio", url: "https://playerservices.streamtheworld.com/api/livestream-redirect/AVTORADIOAAC_H.aac" },
      { name: "The Voice Radio", url: "https://bss.neterra.tv/rtplive/thevoiceradio_live.stream/playlist.m3u8" },
      { name: "bTV Radio", url: "https://cdn.bweb.bg/radio/btv-radio.mp3" },
    ];

    async function validateStation(station: { name: string; url: string }): Promise<ValidationResult> {
      const startTime = Date.now();
      const result: ValidationResult = {
        name: station.name,
        url: station.url,
        status: "error",
        responseTimeMs: 0,
        contentType: null,
        httpStatus: null,
        bytesReceived: 0,
        error: null,
        checkedAt: new Date().toISOString(),
      };

      try {
        const response = await fetch(station.url, {
          method: "GET",
          headers: {
            "User-Agent": "FamilyFrame/1.0",
            "Icy-MetaData": "1",
          },
          signal: AbortSignal.timeout(HEALTH_CHECK_TIMEOUT_MS),
          redirect: "follow",
        });

        result.httpStatus = response.status;
        result.contentType = response.headers.get("content-type");
        result.responseTimeMs = Date.now() - startTime;

        if (response.status !== 200) {
          result.error = `HTTP ${response.status}`;
          await discardBody(response);
          return result;
        }

        // Try to read some bytes to verify the stream is actually delivering data
        const reader = response.body?.getReader();
        if (reader) {
          try {
            const { done, value } = await reader.read();
            if (!done && value) {
              result.bytesReceived = value.length;
            }
          } catch {
            // Stream read failed but connection was ok
          } finally {
            await reader.cancel().catch(() => {});
          }
        }

        // Determine status based on results
        const isAudioContent = result.contentType?.includes("audio") ||
          result.contentType?.includes("mpeg") ||
          result.contentType?.includes("aac") ||
          result.contentType?.includes("ogg") ||
          result.contentType?.includes("mpegurl") ||
          result.contentType?.includes("x-mpegurl") ||
          result.contentType?.includes("octet-stream") ||
          result.contentType?.includes("application/vnd.apple");

        if (result.bytesReceived > 0 && isAudioContent) {
          result.status = result.responseTimeMs > 3000 ? "degraded" : "ok";
        } else if (result.bytesReceived > 0) {
          // Got data but content type is unexpected (might still work for HLS playlists)
          result.status = "degraded";
          result.error = `Unexpected content-type: ${result.contentType}`;
        } else {
          result.status = "error";
          result.error = "No audio data received";
        }
      } catch (err: any) {
        result.responseTimeMs = Date.now() - startTime;
        if (err.name === "AbortError" || err.name === "TimeoutError") {
          result.error = "Timeout (>5s)";
        } else {
          result.error = err.message || "Connection failed";
        }
      }

      return result;
    }

    // Run all validations in parallel
    const results = await Promise.all(
      stationsToValidate.map(station => validateStation(station))
    );

    const summary = {
      total: results.length,
      ok: results.filter(r => r.status === "ok").length,
      degraded: results.filter(r => r.status === "degraded").length,
      error: results.filter(r => r.status === "error").length,
    };

    return { summary, stations: results };
  }, PUBLIC_CACHE_TTL_MS);

  app.get("/api/radio/validate", asyncHandler(async (_req: Request, res: Response) => {
    res.json(await getRadioValidation());
  }));

  // Radio metadata endpoint - fetches ICY stream metadata (now playing info)
  app.get("/api/radio/metadata", async (req: Request, res: Response) => {
    const streamUrl = req.query.url as string;
    if (!streamUrl) {
      return res.status(400).json({ error: "Missing stream URL" });
    }

    const radioHosts = [
      ...ALLOWED_STREAM_DOMAINS,
      ...Object.values(stationsByCategory).flatMap((c) =>
        c.stations.flatMap((st) =>
          [st.url, ...(st.fallbackUrls ?? [])].map((u) => new URL(u).hostname),
        ),
      ),
    ];
    if (typeof streamUrl !== "string" || !isAllowedStreamUrl(streamUrl, radioHosts)) {
      return res.status(400).json({ error: "Stream URL not allowed" });
    }

    try {
      // One 5s deadline covers connect, headers and the body read loop
      const signal = AbortSignal.timeout(5000);

      // Request stream with ICY metadata header
      const response = await fetchFollowingAllowed(streamUrl, radioHosts, {
        method: "GET",
        headers: {
          "Icy-MetaData": "1",
          "User-Agent": "FamilyFrame/1.0",
        },
        signal,
      });

      // Extract ICY headers
      const icyName = response.headers.get("icy-name") || null;
      const icyDescription = response.headers.get("icy-description") || null;
      const icyGenre = response.headers.get("icy-genre") || null;
      const icyBitrate = response.headers.get("icy-br") || null;
      const icyUrl = response.headers.get("icy-url") || null;
      const contentType = response.headers.get("content-type") || null;
      const icyMetaInt = response.headers.get("icy-metaint");

      let nowPlaying: string | null = null;
      let artist: string | null = null;
      let title: string | null = null;

      // If stream provides metadata interval, read first chunk to extract now playing
      if (icyMetaInt) {
        const metaInterval = parseInt(icyMetaInt, 10);
        if (metaInterval > 0 && metaInterval < 65536) {
          try {
            const reader = response.body?.getReader();
            if (reader) {
              let bytesRead = 0;
              const maxBytes = Math.min(metaInterval + 4096, 65536); // capped at 64 KB

              while (bytesRead < maxBytes) {
                const { done, value } = await reader.read();
                if (done) break;
                
                bytesRead += value.length;

                // Check if we've passed the metadata interval
                if (bytesRead > metaInterval) {
                  // The metadata is after metaInterval bytes
                  // First byte after interval is length (length * 16 = metadata size)
                  const metaStart = metaInterval - (bytesRead - value.length);
                  if (metaStart >= 0 && metaStart < value.length) {
                    const metaLength = value[metaStart] * 16;
                    if (metaLength > 0 && metaStart + 1 + metaLength <= value.length) {
                      const metaData = new TextDecoder().decode(
                        value.slice(metaStart + 1, metaStart + 1 + metaLength)
                      );
                      // Parse StreamTitle='Artist - Title';
                      const titleMatch = metaData.match(/StreamTitle='([^']*)'/);
                      if (titleMatch && titleMatch[1]) {
                        nowPlaying = titleMatch[1].trim();
                        // Try to split into artist and title
                        const parts = nowPlaying.split(" - ");
                        if (parts.length >= 2) {
                          artist = parts[0].trim();
                          title = parts.slice(1).join(" - ").trim();
                        } else {
                          title = nowPlaying;
                        }
                      }
                    }
                  }
                  break;
                }
              }
              await reader.cancel().catch(() => {});
            }
          } catch {
            // Ignore metadata parsing errors
          }
        }
      }

      // Close the stream (no-op if the reader above already cancelled it)
      if (response.body && !response.body.locked) {
        await response.body.cancel().catch(() => {});
      }

      res.json({
        stationName: icyName,
        description: icyDescription,
        genre: icyGenre,
        bitrate: icyBitrate ? parseInt(icyBitrate, 10) : null,
        stationUrl: icyUrl,
        contentType,
        nowPlaying,
        artist,
        title,
      });
    } catch (error: any) {
      if (error instanceof DisallowedRedirectError) {
        return res.status(502).json({ error: "Stream redirect not allowed" });
      }
      if (error.name === "AbortError" || error.name === "TimeoutError") {
        return res.status(504).json({ error: "Timeout fetching stream metadata" });
      }
      console.error("[Radio Metadata] Error:", error.message);
      res.status(500).json({ error: "Failed to fetch stream metadata" });
    }
  });
}
