import { abOpen, abEval } from "@/lib/agentBrowser";

export type TimedTextEvent = {
  tStartMs: number;
  segs?: Array<{ utf8: string }>;
};

export type TranscriptResult =
  | { ok: true; events: TimedTextEvent[]; languageCodes: string[] }
  | {
      ok: false;
      reason: "no_captions" | "upstream_error" | "blocked";
      status?: number;
      languageCodes: string[];
    };

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
export async function fetchTranscriptEvents(videoId: string): Promise<TranscriptResult> {
  try {
    await abOpen(`https://www.youtube.com/watch?v=${videoId}&hl=en`);
  } catch (err) {
    console.error(`[transcript] failed to open watch page for ${videoId}:`, err);
    return { ok: false, reason: "upstream_error", languageCodes: [] };
  }

  const state = await abEval<{
    playability: string | null;
    trackCount: number;
    languageCodes: string[];
  }>(`
    (function() {
      var pr = window.ytInitialPlayerResponse;
      var tracks = pr?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
      return {
        playability: pr?.playabilityStatus?.status ?? null,
        trackCount: tracks.length,
        languageCodes: tracks.map(function(t) { return t.languageCode || ''; }).filter(Boolean),
      };
    })();
  `).catch(() => ({ playability: null, trackCount: 0, languageCodes: [] as string[] }));

  if (state.playability && state.playability !== "OK") {
    console.error(`[transcript] playabilityStatus=${state.playability} for ${videoId}`);
    return { ok: false, reason: "blocked", languageCodes: state.languageCodes };
  }

  if (state.trackCount === 0) {
    return { ok: false, reason: "no_captions", languageCodes: state.languageCodes };
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
    return { ok: false, reason: "upstream_error", languageCodes: state.languageCodes };
  }

  const events: TimedTextEvent[] = result.segments.map((seg) => ({
    tStartMs: parseTimestampToMs(seg.time),
    segs: [{ utf8: seg.text }],
  }));

  return { ok: true, events, languageCodes: state.languageCodes };
}
