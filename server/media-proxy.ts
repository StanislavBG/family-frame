import type { Express, Request, Response } from "express";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { isAllowedStreamUrl } from "./url-guards";
import { FETCH_TIMEOUT_MS } from "./route-helpers";

// Media stream proxy - proxies streams through server to bypass geo-restrictions
// Handles both HLS manifests (.m3u8) and direct media streams
// SECURITY: Only allows specific Bulgarian streaming domains
export const ALLOWED_STREAM_DOMAINS = [
  // Bulgarian TV streaming
  "bss.neterra.tv",
  "bss1.neterra.tv",
  "live.ecomservice.bg",
  "live.cdn.bg",
  "cdn.bweb.bg",
  "tv.bnt.bg",
  "tv.nova.bg",
  "stream.btv.bg",
  "hls.btv.bg",
  "live.btv.bg",
  "100automoto.tv",
  "restr2.bgtv.bg",
  "bgtv.bg",
  "viamotionhsi.netplus.ch",
  "cdn.sstv.bg",
  "hls.sstv.bg",
  "stream.city.bg",
  "tv7.bg",
  "kanal3.bg",
  "europaplus.bg",
  // Bulgarian Radio streaming
  "stream80.metacast.eu",
  "stream81.metacast.eu",
  "stream.metacast.eu",
  "metacast.eu",
  "stream.bnr.bg",
  "bnr.bg",
  "streamer.atlantis.bg",
  "live.radiofresh.bg",
  "play.global.audio",
  "streams.radioenergy.bg",
  "stream.bgradio.bg",
  "bgradio.bg",
  // IPTV playlist sources
  "iptv-org.github.io",
  "i.mjh.nz",
];

export const MAX_STREAM_REDIRECTS = 3;

export class DisallowedRedirectError extends Error {}

// Fetch with manual redirects; every hop must pass isAllowedStreamUrl.
export async function fetchFollowingAllowed(
  startUrl: string,
  hosts: readonly string[],
  init: RequestInit,
): Promise<globalThis.Response> {
  let current = startUrl;
  for (let hop = 0; hop <= MAX_STREAM_REDIRECTS; hop++) {
    const response = await fetch(current, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), ...init, redirect: "manual" });
    if (response.status < 300 || response.status >= 400) return response;
    const location = response.headers.get("location");
    await response.body?.cancel().catch(() => {});
    if (!location) return response;
    let next: string;
    try {
      next = new URL(location, current).toString();
    } catch {
      throw new DisallowedRedirectError("Invalid redirect location");
    }
    if (!isAllowedStreamUrl(next, hosts)) {
      throw new DisallowedRedirectError("Redirect target not allowed");
    }
    current = next;
  }
  throw new DisallowedRedirectError("Too many redirects");
}

export function registerMediaProxyRoutes(app: Express): void {
  app.get("/api/media/proxy", async (req: Request, res: Response) => {
    try {
      const streamUrl = req.query.url as string;
      
      if (!streamUrl) {
        res.status(400).json({ error: "Missing stream URL" });
        return;
      }

      // Validate URL format
      let url: URL;
      try {
        url = new URL(streamUrl);
      } catch {
        res.status(400).json({ error: "Invalid URL format" });
        return;
      }

      // Only allow HTTP/HTTPS protocols
      if (!["http:", "https:"].includes(url.protocol)) {
        res.status(400).json({ error: "Only HTTP/HTTPS URLs allowed" });
        return;
      }

      // SECURITY: Only allow specific Bulgarian streaming domains
      const hostname = url.hostname.toLowerCase();
      if (!ALLOWED_STREAM_DOMAINS.some(domain => hostname === domain || hostname.endsWith("." + domain))) {
        console.warn(`Media proxy blocked: ${hostname} not in allowlist`);
        res.status(403).json({ error: "Stream domain not allowed" });
        return;
      }

      // Fetch the stream with headers that mimic a Bulgarian client
      const upstream = new AbortController();
      res.on("close", () => upstream.abort());

      const response = await fetchFollowingAllowed(streamUrl, ALLOWED_STREAM_DOMAINS, {
        signal: upstream.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": req.headers.accept || "*/*",
          "Accept-Language": "bg-BG,bg;q=0.9,en-US;q=0.8,en;q=0.7",
          "Origin": url.origin,
          "Referer": url.origin + "/",
          ...(req.headers.range ? { "Range": req.headers.range as string } : {}),
        },
      });

      if (!response.ok) {
        console.error(`Media proxy error: ${response.status} for ${streamUrl}`);
        res.status(response.status).json({ error: `Upstream error: ${response.status}` });
        return;
      }

      const contentType = response.headers.get("Content-Type") || "";
      const isM3u8 = streamUrl.includes(".m3u8") || streamUrl.includes(".m3u") || contentType.includes("mpegurl");

      // For HLS manifests, rewrite URLs to go through proxy
      if (isM3u8) {
        const content = await response.text();
        const baseUrl = streamUrl.substring(0, streamUrl.lastIndexOf("/") + 1);
        
        // Rewrite relative URLs in the manifest to go through our proxy
        const rewrittenContent = content.split("\n").map(line => {
          const trimmed = line.trim();
          // Skip comments and empty lines
          if (trimmed.startsWith("#") || trimmed === "") {
            // But check for URI= attributes in EXT tags
            if (trimmed.includes("URI=")) {
              return trimmed.replace(/URI="([^"]+)"/g, (match, uri) => {
                const fullUrl = uri.startsWith("http") ? uri : baseUrl + uri;
                return `URI="/api/media/proxy?url=${encodeURIComponent(fullUrl)}"`;
              });
            }
            return line;
          }
          // This is likely a URL
          const fullUrl = trimmed.startsWith("http") ? trimmed : baseUrl + trimmed;
          return `/api/media/proxy?url=${encodeURIComponent(fullUrl)}`;
        }).join("\n");

        res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.send(rewrittenContent);
        return;
      }

      // For regular media streams, pipe through
      if (!response.body) {
        res.status(502).json({ error: "No response body" });
        return;
      }

      // Set appropriate headers
      res.setHeader("Content-Type", contentType || "application/octet-stream");
      if (response.headers.get("Content-Length")) {
        res.setHeader("Content-Length", response.headers.get("Content-Length")!);
      }
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Cache-Control", "no-cache");

      // Pipe with backpressure; aborting upstream on client close cancels the body
      await pipeline(Readable.fromWeb(response.body as any), res).catch(() => {
        // premature close / upstream abort: expected when the client disconnects
      });
    } catch (error) {
      if (error instanceof DisallowedRedirectError) {
        console.warn(`Media proxy blocked redirect: ${error.message}`);
      } else {
        console.error("Media proxy error:", error);
      }
      if (!res.headersSent) {
        res.status(502).json({ error: "Stream error" });
      }
    }
  });
}
