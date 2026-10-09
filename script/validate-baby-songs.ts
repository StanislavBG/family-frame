import {
  collectBabySongSources,
  checkAudioUrl,
  checkYouTubeVideo,
  type SourceCheckResult,
} from "../server/baby-songs-check";

const CONCURRENCY = 4;

async function runPool<T, R>(items: T[], worker: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function loop() {
    while (next < items.length) {
      const i = next++;
      results[i] = await worker(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, loop));
  return results;
}

function detail(r: SourceCheckResult): string {
  if (r.ok) return r.status !== undefined ? `HTTP ${r.status}` : "ok";
  return r.reason ?? (r.status !== undefined ? `HTTP ${r.status}` : "unknown");
}

async function main() {
  const json = process.argv.includes("--json");
  const sources = collectBabySongSources();

  const audio = await runPool(sources.audio, async (s) => ({ ...s, result: await checkAudioUrl(s.url) }));
  const youtube = await runPool(sources.youtube, async (s) => ({
    ...s,
    result: await checkYouTubeVideo(s.videoId),
  }));

  const audioOk = audio.filter((a) => a.result.ok).length;
  const youtubeOk = youtube.filter((y) => y.result.ok).length;
  const dead = audio.length - audioOk + (youtube.length - youtubeOk);
  const summary = {
    audio: { ok: audioOk, total: audio.length },
    youtube: { ok: youtubeOk, total: youtube.length },
    dead,
  };

  if (json) {
    console.log(JSON.stringify({ audio, youtube, summary }, null, 2));
  } else {
    for (const a of audio) {
      console.log(`${a.result.ok ? "OK  " : "DEAD"} audio ${a.id} "${a.title}" ${detail(a.result)}`);
    }
    for (const y of youtube) {
      console.log(`${y.result.ok ? "OK  " : "DEAD"} youtube ${y.videoId} [${y.stations.join(", ")}] ${detail(y.result)}`);
    }
    console.log(`audio: ${audioOk}/${audio.length} ok, youtube: ${youtubeOk}/${youtube.length} ok`);
  }

  process.exitCode = dead > 0 ? 1 : 0;
}

main().catch((err) => {
  console.error(`HALT: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
