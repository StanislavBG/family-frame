/**
 * YouTube Service
 * Fetches YouTube playlist and video metadata without requiring API key
 * Uses oEmbed and public endpoints for basic metadata
 */

export interface YouTubeVideoInfo {
  videoId: string;
  title: string;
  thumbnail?: string;
  duration?: number;
}

export interface YouTubePlaylistInfo {
  playlistId: string;
  title: string;
  videos: YouTubeVideoInfo[];
}

// Cache for video info to reduce API calls
const videoInfoCache = new Map<string, { info: YouTubeVideoInfo; timestamp: number }>();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Extract video ID from various YouTube URL formats
 */
export function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/, // Direct video ID
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      return match[1];
    }
  }
  return null;
}

/**
 * Extract playlist ID from YouTube playlist URL
 */
export function extractPlaylistId(url: string): string | null {
  const patterns = [
    /[?&]list=([a-zA-Z0-9_-]+)/,
    /^([a-zA-Z0-9_-]{34})$/, // Direct playlist ID (typical length)
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      return match[1];
    }
  }
  return null;
}

/**
 * Fetch video info using oEmbed (no API key required)
 */
export async function getVideoInfo(videoId: string): Promise<YouTubeVideoInfo | null> {
  // Check cache first
  const cached = videoInfoCache.get(videoId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.info;
  }

  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
    const response = await fetch(oembedUrl);

    if (!response.ok) {
      console.error(`[YouTube] Failed to fetch video info for ${videoId}: ${response.status}`);
      return null;
    }

    const data = await response.json();
    const info: YouTubeVideoInfo = {
      videoId,
      title: data.title || `Video ${videoId}`,
      thumbnail: data.thumbnail_url,
    };

    // Cache the result
    videoInfoCache.set(videoId, { info, timestamp: Date.now() });
    return info;
  } catch (error) {
    console.error(`[YouTube] Error fetching video info for ${videoId}:`, error);
    return null;
  }
}

/**
 * Fetch multiple video infos in parallel with rate limiting
 */
export async function getMultipleVideoInfos(videoIds: string[]): Promise<YouTubeVideoInfo[]> {
  const results: YouTubeVideoInfo[] = [];
  const BATCH_SIZE = 5;
  const BATCH_DELAY = 100; // ms between batches

  for (let i = 0; i < videoIds.length; i += BATCH_SIZE) {
    const batch = videoIds.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map(async (id) => {
        const info = await getVideoInfo(id);
        return info || { videoId: id, title: `Track ${videoIds.indexOf(id) + 1}` };
      })
    );
    results.push(...batchResults);

    // Small delay between batches to be respectful
    if (i + BATCH_SIZE < videoIds.length) {
      await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY));
    }
  }

  return results;
}

/**
 * Validate that a video ID exists and is playable
 */
export async function validateVideoId(videoId: string): Promise<boolean> {
  const info = await getVideoInfo(videoId);
  return info !== null;
}

/**
 * Clear the video info cache
 */
export function clearVideoCache(): void {
  videoInfoCache.clear();
}

/**
 * Get cache stats for monitoring
 */
export function getCacheStats(): { size: number; oldestEntry: number | null } {
  let oldestTimestamp: number | null = null;

  videoInfoCache.forEach((value) => {
    if (oldestTimestamp === null || value.timestamp < oldestTimestamp) {
      oldestTimestamp = value.timestamp;
    }
  });

  return {
    size: videoInfoCache.size,
    oldestEntry: oldestTimestamp,
  };
}
