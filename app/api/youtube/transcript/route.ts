import { NextRequest, NextResponse } from "next/server";

const INNERTUBE_API_KEY = "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8";
const INNERTUBE_BASE = "https://www.youtube.com/youtubei/v1";

const INNERTUBE_CONTEXT = {
  client: {
    clientName: "WEB",
    clientVersion: "2.20231219.01.00",
    hl: "en",
    gl: "US",
  },
};

const INNERTUBE_HEADERS = {
  "Content-Type": "application/json",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "X-YouTube-Client-Name": "1",
  "X-YouTube-Client-Version": "2.20231219.01.00",
  Referer: "https://www.youtube.com/",
  Origin: "https://www.youtube.com",
};

const PRICE_PATTERNS = [
  /\$\d+/,
  /\d+\s*dollars?/i,
  /\d+\s*bucks?/i,
  /\bprice[sd]?\b/i,
  /\bcosts?\b/i,
  /\bworth\b/i,
  /\baffordable\b/i,
  /\bexpensive\b/i,
  /\bcheap\b/i,
  /\bon sale\b/i,
  /\bdeals?\b/i,
  /\bmsrp\b/i,
  /\bdiscounted?\b/i,
];

const PERSONAL_PATTERNS = [
  /my name is/i,
  /i('m| am) from/i,
  /i live in/i,
  /my (wife|husband|kids?|children|family|son|daughter|girlfriend|boyfriend)/i,
  /\bpersonally\b/i,
  /in my (personal )?opinion/i,
  /i (work|worked) (as|for|at)/i,
  /\bmy job\b/i,
  /\bmy house\b/i,
  /\bmy home\b/i,
  /my channel/i,
];

const SUBSCRIBE_PATTERNS = [
  /subscri/i,
  /like (this |the )?video/i,
  /hit the like/i,
  /smash (the )?like/i,
  /notification bell/i,
  /bell icon/i,
  /comment below/i,
  /leave a comment/i,
  /share this/i,
  /\bthumbs? up\b/i,
  /click like/i,
  /don't forget to/i,
  /ring the bell/i,
  /click the bell/i,
  /drop a like/i,
  /leave a like/i,
];

function formatTimestamp(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0)
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

type CaptionTrack = {
  baseUrl?: string;
  languageCode?: string;
  kind?: string;
};

type TimedTextEvent = {
  tStartMs: number;
  segs?: Array<{ utf8: string }>;
};

type TranscriptResult =
  | { ok: true; events: TimedTextEvent[] }
  | { ok: false; reason: "no_captions" | "upstream_error" | "blocked"; status?: number };

type PlayerResponseData = {
  playabilityStatus?: { status?: string; reason?: string };
  captions?: { playerCaptionsTracklistRenderer?: { captionTracks?: CaptionTrack[] } };
};

type PlayerResponseResult =
  | { ok: true; data: PlayerResponseData }
  | { ok: false; reason: "upstream_error" | "blocked"; status?: number };

// Pull the same playerResponse JSON the real watch page embeds, by fetching the
// page HTML like a browser would. This is what the major transcript libraries do —
// it's far less bot-detected than POSTing straight to youtubei/v1/player from a
// server IP, which YouTube increasingly blocks/empties out for datacenter traffic.
async function fetchPlayerResponseFromWatchPage(videoId: string): Promise<PlayerResponseResult> {
  const res = await fetch(`https://www.youtube.com/watch?v=${videoId}&hl=en&persist_hl=1`, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept-Language": "en-US,en;q=0.9",
      Cookie: "CONSENT=YES+1",
    },
  });

  if (!res.ok) {
    console.error(`[transcript] watch page fetch failed for ${videoId}: ${res.status}`);
    return { ok: false, reason: "upstream_error", status: res.status };
  }

  const html = await res.text();
  const startMarker = "var ytInitialPlayerResponse = ";
  const start = html.indexOf(startMarker);
  if (start === -1) {
    console.error(`[transcript] ytInitialPlayerResponse not found for ${videoId} (likely consent/bot-check page)`);
    return { ok: false, reason: "blocked" };
  }

  const jsonStart = start + startMarker.length;
  const endMarkers = [";var meta", ";</script>", ";\nvar ", ";window["];
  let end = -1;
  for (const marker of endMarkers) {
    const idx = html.indexOf(marker, jsonStart);
    if (idx !== -1 && (end === -1 || idx < end)) end = idx;
  }
  if (end === -1) {
    console.error(`[transcript] could not delimit ytInitialPlayerResponse for ${videoId}`);
    return { ok: false, reason: "upstream_error" };
  }

  try {
    const data = JSON.parse(html.slice(jsonStart, end));
    return { ok: true, data };
  } catch {
    console.error(`[transcript] failed to parse ytInitialPlayerResponse JSON for ${videoId}`);
    return { ok: false, reason: "upstream_error" };
  }
}

// Fallback: POST directly to the InnerTube /player endpoint (same JSON shape).
async function fetchPlayerResponseFromInnertube(videoId: string): Promise<PlayerResponseResult> {
  const res = await fetch(`${INNERTUBE_BASE}/player?key=${INNERTUBE_API_KEY}`, {
    method: "POST",
    headers: INNERTUBE_HEADERS,
    body: JSON.stringify({ context: INNERTUBE_CONTEXT, videoId }),
  });

  if (!res.ok) {
    console.error(`[transcript] /player request failed for ${videoId}: ${res.status}`);
    return { ok: false, reason: "upstream_error", status: res.status };
  }
  return { ok: true, data: await res.json() };
}

async function fetchTranscript(videoId: string): Promise<TranscriptResult> {
  let playerResult = await fetchPlayerResponseFromWatchPage(videoId);
  if (!playerResult.ok) {
    playerResult = await fetchPlayerResponseFromInnertube(videoId);
  }
  if (!playerResult.ok) {
    return { ok: false, reason: playerResult.reason, status: playerResult.status };
  }

  const playerData = playerResult.data;
  const playability = playerData?.playabilityStatus?.status;
  if (playability && playability !== "OK") {
    console.error(
      `[transcript] playabilityStatus=${playability} reason=${playerData?.playabilityStatus?.reason ?? "n/a"} for ${videoId}`
    );
  }

  const tracks: CaptionTrack[] =
    playerData?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];

  if (tracks.length === 0) {
    return { ok: false, reason: "no_captions" };
  }

  // Prefer English ASR → English manual → first available
  const track =
    tracks.find((t) => t.languageCode === "en" && t.kind === "asr") ??
    tracks.find((t) => t.languageCode === "en") ??
    tracks[0];

  if (!track?.baseUrl) {
    console.error(`[transcript] caption track missing baseUrl for ${videoId}`);
    return { ok: false, reason: "no_captions" };
  }

  const tRes = await fetch(`${track.baseUrl}&fmt=json3`, {
    headers: { Referer: "https://www.youtube.com/" },
  });

  if (!tRes.ok) {
    console.error(`[transcript] timedtext fetch failed for ${videoId}: ${tRes.status}`);
    return { ok: false, reason: "upstream_error", status: tRes.status };
  }
  const tData = await tRes.json();
  const events = (tData?.events as TimedTextEvent[]) ?? [];
  if (events.length === 0) {
    return { ok: false, reason: "no_captions" };
  }
  return { ok: true, events };
}

export async function GET(req: NextRequest) {
  const videoId = req.nextUrl.searchParams.get("videoId");
  if (!videoId) {
    return NextResponse.json({ error: "Missing videoId" }, { status: 400 });
  }

  try {
    const result = await fetchTranscript(videoId);

    if (!result.ok) {
      if (result.reason === "no_captions") {
        return NextResponse.json({ error: "No transcript available" }, { status: 404 });
      }
      if (result.reason === "blocked") {
        return NextResponse.json(
          { error: "YouTube is blocking automated requests right now, try again later" },
          { status: 502 }
        );
      }
      console.error(`[transcript] upstream_error for ${videoId}, status=${result.status}`);
      return NextResponse.json(
        { error: "Transcript temporarily unavailable, try again" },
        { status: 502 }
      );
    }

    const events = result.events;

    const segments = events
      .filter((e) => e.segs && e.segs.length > 0)
      .map((e) => {
        const text = e
          .segs!.map((s) => s.utf8)
          .join("")
          .replace(/\n/g, " ")
          .trim();

        const categories: string[] = [];
        if (PRICE_PATTERNS.some((p) => p.test(text))) categories.push("price");
        if (PERSONAL_PATTERNS.some((p) => p.test(text))) categories.push("personal");
        if (SUBSCRIBE_PATTERNS.some((p) => p.test(text))) categories.push("subscribe");

        return { text, startMs: e.tStartMs, startFormatted: formatTimestamp(e.tStartMs), categories };
      })
      .filter((s) => s.text);

    const priceSegs = segments.filter((s) => s.categories.includes("price"));
    const personalSegs = segments.filter((s) => s.categories.includes("personal"));
    const subscribeSegs = segments.filter((s) => s.categories.includes("subscribe"));

    const summary = {
      price: priceSegs.length ? { count: priceSegs.length, firstAt: priceSegs[0].startFormatted } : null,
      personal: personalSegs.length ? { count: personalSegs.length, firstAt: personalSegs[0].startFormatted } : null,
      subscribe: subscribeSegs.length ? { count: subscribeSegs.length, firstAt: subscribeSegs[0].startFormatted } : null,
    };

    return NextResponse.json({ segments, summary });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`[transcript] unhandled error for ${videoId}: ${message}`);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
