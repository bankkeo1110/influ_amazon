import { NextRequest, NextResponse } from "next/server";
import { abOpen, abEval } from "@/lib/agentBrowser";

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

type TimedTextEvent = {
  tStartMs: number;
  segs?: Array<{ utf8: string }>;
};

type TranscriptResult =
  | { ok: true; events: TimedTextEvent[] }
  | { ok: false; reason: "no_captions" | "upstream_error" | "blocked"; status?: number };

// "0:00" / "12:34" / "1:02:03" → milliseconds
function parseTimestampToMs(ts: string): number {
  const seconds = ts
    .split(":")
    .map((p) => parseInt(p, 10))
    .reduce((acc, n) => acc * 60 + (Number.isNaN(n) ? 0 : n), 0);
  return seconds * 1000;
}

type RawTranscriptSegment = { time: string; text: string };

// The transcript button lives inside the (collapsed-by-default) description panel and
// is duplicated elsewhere in the DOM at zero size — clicking blindly by aria-label hits
// an inert copy. This scopes to the real one, expands the description if needed (the
// standard "…more" text-match grabs a sidebar recommendation's expander instead, so we
// scope to ytd-watch-metadata specifically), then clicks it for real and reads the
// rendered panel — the same thing a human would do. It all runs as one atomic script so
// the click and the read happen in the same tick, no round trips for the page to drift.
const TRANSCRIPT_SCRIPT = `
(async function() {
  function sleep(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }
  function isVisible(el) {
    var r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }
  function fireClick(el) {
    el.scrollIntoView({ block: 'center' });
    ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(function(type) {
      el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
    });
  }

  var meta = document.querySelector('ytd-watch-metadata');
  var expander = meta ? meta.querySelector('ytd-text-inline-expander') : null;
  if (expander && expander.isTruncated) {
    var moreCandidates = Array.from(expander.querySelectorAll('*')).filter(function(el) {
      return (el.textContent || '').trim().toLowerCase().replace(/\\s+/g, ' ') === '...more';
    });
    var moreBtn = moreCandidates[moreCandidates.length - 1];
    if (moreBtn) {
      fireClick(moreBtn);
      await sleep(500);
    }
  }

  var transcriptBtns = Array.from(
    document.querySelectorAll('button[aria-label="Show transcript"]')
  ).filter(isVisible);
  if (transcriptBtns.length === 0) return { clicked: false, segments: [] };
  fireClick(transcriptBtns[0]);

  function read() {
    var els = document.querySelectorAll(
      'transcript-segment-view-model, ytd-transcript-segment-renderer'
    );
    var out = [];
    els.forEach(function(el) {
      var timeEl = el.querySelector('.ytwTranscriptSegmentViewModelTimestamp, .segment-timestamp');
      var textEl = el.querySelector('.ytAttributedStringHost, yt-formatted-string.segment-text, .segment-text');
      var time = timeEl ? timeEl.textContent.trim() : '';
      var text = textEl ? textEl.textContent.trim() : '';
      if (text) out.push({ time: time, text: text });
    });
    return out;
  }
  for (var i = 0; i < 16; i++) {
    var out = read();
    if (out.length > 0) return { clicked: true, segments: out };
    await sleep(500);
  }
  return { clicked: true, segments: [] };
})();
`;

// Drives a real headless Chrome tab (via agent-browser) instead of hitting YouTube's
// InnerTube endpoints from the server. Those endpoints now require a live session/POT
// token that a bare server-side fetch can't produce — this reads the same "Show
// transcript" panel a human would open, which needs no such token.
async function fetchTranscript(videoId: string): Promise<TranscriptResult> {
  try {
    await abOpen(`https://www.youtube.com/watch?v=${videoId}&hl=en`);
  } catch (err) {
    console.error(`[transcript] failed to open watch page for ${videoId}:`, err);
    return { ok: false, reason: "upstream_error" };
  }

  const state = await abEval<{ playability: string | null; trackCount: number }>(`
    (function() {
      var pr = window.ytInitialPlayerResponse;
      var tracks = pr?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
      return {
        playability: pr?.playabilityStatus?.status ?? null,
        trackCount: tracks.length,
      };
    })();
  `).catch(() => ({ playability: null, trackCount: 0 }));

  if (state.playability && state.playability !== "OK") {
    console.error(`[transcript] playabilityStatus=${state.playability} for ${videoId}`);
    return { ok: false, reason: "blocked" };
  }

  if (state.trackCount === 0) {
    return { ok: false, reason: "no_captions" };
  }

  const result = await abEval<{ clicked: boolean; segments: RawTranscriptSegment[] }>(
    TRANSCRIPT_SCRIPT,
    30000
  ).catch((err) => {
    console.error(`[transcript] failed to read transcript panel for ${videoId}:`, err);
    return { clicked: false, segments: [] as RawTranscriptSegment[] };
  });

  if (result.segments.length === 0) {
    console.error(
      `[transcript] captions exist but panel yielded no segments for ${videoId} (clicked=${result.clicked})`
    );
    return { ok: false, reason: "upstream_error" };
  }

  const events: TimedTextEvent[] = result.segments.map((seg) => ({
    tStartMs: parseTimestampToMs(seg.time),
    segs: [{ utf8: seg.text }],
  }));

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
