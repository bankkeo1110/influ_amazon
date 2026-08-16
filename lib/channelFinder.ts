import { abOpen, abEval, abScroll } from "@/lib/agentBrowser";
import { fetchTranscriptEvents } from "@/lib/youtubeTranscript";

// How many verified (avg length under the cap) channels we try to collect per query.
const TARGET_RESULTS = 50;
// Upper bound on how many candidate channels we'll actually visit/verify — bounds the
// worst-case runtime, since verification is one real page load per channel.
const MAX_VERIFY_ATTEMPTS = 130;
// "Faceless, quick review" cutoff. A floor excludes Shorts-only channels (a few-second
// average isn't "a quick review", it's a different content format).
const MAX_AVG_SECONDS = 4 * 60;
const MIN_AVG_SECONDS = 45;
// Scrolling the search results is cheap (no network round trip, just more DOM), so we
// scroll generously to build a big enough candidate pool before the expensive part.
const SCROLL_ROUNDS = 15;

// Words describing the *style* the user wants rather than the topic. YouTube's search
// matches literally — "faceless" pulls in "how to start a faceless channel" tutorials
// instead of actual faceless channels, since no channel is tagged "faceless" as topic
// metadata. Stripping style words before hitting YouTube search dramatically improves
// how many genuinely relevant candidates come back (verified: ~33 candidates with
// "faceless" left in vs. ~48 with it stripped, for the same underlying request).
const STYLE_STOPWORDS = new Set([
  "faceless",
  "channel",
  "channels",
  "good",
  "great",
  "quality",
  "best",
]);

function cleanSearchQuery(query: string): string {
  const words = query.split(/\s+/).filter((w) => w);
  const cleaned = words
    .filter((w) => !STYLE_STOPWORDS.has(w.toLowerCase().replace(/[^a-z0-9]/gi, "")))
    .join(" ")
    .trim();
  return cleaned || query;
}

// Cheap, text-only English-language check. Two signals: a channel whose name/description
// is written in a non-Latin script (Bengali, Devanagari, Arabic, CJK, Cyrillic, ...) is
// clearly not English; a channel that's Latin-script but shares no vocabulary with common
// English words (Indonesian, Vietnamese, Portuguese, ...) is also flagged. Returns null
// when there isn't enough text to judge either way — callers should give the benefit of
// the doubt rather than treat "unknown" as "rejected".
const COMMON_ENGLISH_WORDS = new Set([
  "the", "and", "you", "your", "this", "that", "with", "for", "from", "are", "have",
  "review", "reviews", "unboxing", "unbox", "channel", "video", "videos", "best", "new",
  "welcome", "hello", "what", "will", "can", "get", "all", "our", "out", "about", "how",
  "tool", "tools", "power", "product", "products", "today", "here", "watch", "subscribe",
]);

// Plain \uXXXX ranges (no `u` flag / \p{} property escapes needed — this project's tsc
// target doesn't support those) covering the non-Latin scripts most likely to show up:
// Greek, Cyrillic, Armenian, Hebrew, Arabic, the Devanagari-through-Sinhala block (Hindi,
// Bengali, Tamil, Telugu, ...), Thai, Myanmar, Georgian, Hangul, Hiragana/Katakana, CJK.
const NON_LATIN_SCRIPT_RE =
  /[Ͱ-ϿЀ-ӿ԰-֏֐-׿؀-ۿݐ-ݿऀ-෿฀-๿က-႟Ⴀ-ჿᄀ-ᇿ぀-ヿ㐀-䶿一-鿿가-힣]/g;

function looksEnglishFromText(text: string): boolean | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const nonLatinMatches = trimmed.match(NON_LATIN_SCRIPT_RE) ?? [];
  if (nonLatinMatches.length / trimmed.length > 0.1) return false;

  const words = trimmed.toLowerCase().match(/[a-z']+/g) ?? [];
  if (words.length < 4) return null; // not enough Latin-script text to judge vocabulary

  return words.some((w) => COMMON_ENGLISH_WORDS.has(w));
}

type RawChannel = {
  href: string | null;
  name: string | null;
  handle: string | null;
  subscriberText: string | null;
  description: string | null;
  thumbnailUrl: string | null;
};

export type FoundChannel = {
  name: string;
  handle: string | null;
  url: string;
  thumbnailUrl: string | null;
  subscriberText: string | null;
  avgLengthSec: number;
  description: string | null;
};

// "48:31" / "8:23" / "1:02:03" → seconds
function parseDurationToSeconds(text: string): number {
  const parts = text.split(":").map((p) => parseInt(p, 10));
  if (parts.some((n) => Number.isNaN(n))) return 0;
  return parts.reduce((acc, n) => acc * 60 + n, 0);
}

const READ_CHANNEL_RENDERERS_SCRIPT = `
  (function() {
    var els = document.querySelectorAll('ytd-channel-renderer');
    var out = [];
    els.forEach(function(el) {
      var link = el.querySelector('a#main-link');
      var nameEl = el.querySelector('#channel-title #text');
      var handleEl = el.querySelector('#subscribers');
      var subEl = el.querySelector('#video-count');
      var descEl = el.querySelector('#description');
      var imgEl = el.querySelector('#avatar img');
      out.push({
        href: link ? link.getAttribute('href') : null,
        name: nameEl ? nameEl.textContent.trim() : null,
        handle: handleEl ? handleEl.textContent.trim() : null,
        subscriberText: subEl ? subEl.textContent.trim() : null,
        description: descEl ? descEl.textContent.trim() : null,
        thumbnailUrl: imgEl ? imgEl.src : null,
      });
    });
    return out;
  })();
`;

// sp=EgIQAg%3D%3D restricts YouTube search results to the "Channel" filter.
async function searchOnce(searchTerm: string): Promise<RawChannel[]> {
  const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(searchTerm)}&sp=EgIQAg%3D%3D`;
  await abOpen(url);

  for (let i = 0; i < SCROLL_ROUNDS; i++) {
    await abScroll("down", 3000);
  }

  return abEval<RawChannel[]>(READ_CHANNEL_RENDERERS_SCRIPT);
}

function dedupeByHref(channels: RawChannel[]): RawChannel[] {
  const seen = new Set<string>();
  const deduped: RawChannel[] = [];
  for (const c of channels) {
    if (!c.href || seen.has(c.href)) continue;
    seen.add(c.href);
    deduped.push(c);
  }
  return deduped;
}

async function searchCandidateChannels(query: string): Promise<RawChannel[]> {
  const cleaned = cleanSearchQuery(query);
  let candidates = dedupeByHref(await searchOnce(cleaned));

  // Narrow niches can run dry fast — broaden to the first few words and merge in
  // whatever new candidates that surfaces.
  if (candidates.length < 20) {
    const broader = cleaned.split(/\s+/).slice(0, 3).join(" ");
    if (broader && broader !== cleaned) {
      const more = await searchOnce(broader);
      candidates = dedupeByHref([...candidates, ...more]);
    }
  }

  return candidates;
}

type ChannelVideoStats = {
  avgLengthSec: number | null;
  // First video's ID from the grid, used as the sample for the audio-quality check below.
  sampleVideoId: string | null;
};

function extractVideoId(href: string): string | null {
  const m = href.match(/[?&]v=([^&]+)/);
  return m ? m[1] : null;
}

// Visits the channel's Videos tab and reads the duration badges shown on the video grid
// — no need to open individual videos, YouTube already renders "8:23" etc. on the
// thumbnails themselves. Also grabs the first video's ID, to use as the sample for the
// audio-quality check.
async function getChannelVideoStats(href: string): Promise<ChannelVideoStats> {
  await abOpen(`https://www.youtube.com${href}/videos`);

  const raw = await abEval<{ href: string | null; duration: string | null }[]>(`
    (function() {
      var items = document.querySelectorAll('ytd-rich-item-renderer');
      var out = [];
      items.forEach(function(el) {
        var link = el.querySelector('a[href^="/watch?v="]');
        var badge = el.querySelector('.ytBadgeShapeText');
        out.push({
          href: link ? link.getAttribute('href') : null,
          duration: badge ? badge.textContent.trim() : null,
        });
      });
      return out.slice(0, 12);
    })();
  `);

  const durationRe = /^\d{1,2}:\d{2}(:\d{2})?$/;
  const seconds = raw
    .map((r) => r.duration)
    .filter((d): d is string => !!d && durationRe.test(d))
    .map(parseDurationToSeconds)
    .filter((n) => n > 0);

  const avgLengthSec =
    seconds.length > 0 ? Math.round(seconds.reduce((a, b) => a + b, 0) / seconds.length) : null;

  const firstHref = raw.find((r) => r.href)?.href ?? null;
  const sampleVideoId = firstHref ? extractVideoId(firstHref) : null;

  return { avgLengthSec, sampleVideoId };
}

// Segments that are pure non-speech markers ("[Music]", "(Music)") or contain musical
// note symbols — auto-captions insert these where background music is playing instead
// of (or over) narration. A transcript dominated by these is a proxy for "not clear
// sound" / "has background music". This can't detect visual quality ("clear
// background") — there's no text signal for that; it would need an actual vision check.
const MUSIC_MARKER_RE = /^[[(]?\s*(music|instrumental|background music|sound effects?)\s*[\])]?$/i;
const NOTE_SYMBOL_RE = /[♪♫]/; // ♪ ♫
const MAX_MUSIC_SEGMENT_RATIO = 0.15;

type ContentQuality = { clearAudio: boolean; isEnglish: boolean | null };

async function checkContentQuality(
  videoId: string,
  fallbackText: string
): Promise<ContentQuality> {
  const result = await fetchTranscriptEvents(videoId).catch((err) => {
    console.error(`[channel-finder] transcript check failed for ${videoId}:`, err);
    return null;
  });

  if (!result) {
    // Total failure to even load the page — no signal either way, don't penalize.
    return { clearAudio: true, isEnglish: looksEnglishFromText(fallbackText) };
  }

  // Caption language code is a much stronger signal than text heuristics when it's
  // available — YouTube auto-detects the actual spoken language for ASR tracks.
  const isEnglish =
    result.languageCodes.length > 0
      ? result.languageCodes.some((code) => code.toLowerCase().startsWith("en"))
      : looksEnglishFromText(fallbackText);

  // Most small/niche channels never get auto-captions processed at all — that's not
  // evidence of bad audio, just absence of a signal. Don't punish what we can't check;
  // only reject when captions exist and actually show music dominating the track.
  if (!result.ok) return { clearAudio: true, isEnglish };

  const texts = result.events
    .flatMap((e) => e.segs?.map((s) => s.utf8.trim()) ?? [])
    .filter(Boolean);

  if (texts.length === 0) return { clearAudio: true, isEnglish };

  const musicSegments = texts.filter((t) => MUSIC_MARKER_RE.test(t) || NOTE_SYMBOL_RE.test(t));
  const clearAudio = musicSegments.length / texts.length <= MAX_MUSIC_SEGMENT_RATIO;

  return { clearAudio, isEnglish };
}

/**
 * Searches YouTube for channels matching `query`, then visits each candidate's Videos
 * tab (in relevance order) to measure its average video length, keeping only the ones
 * under MAX_AVG_SECONDS — a proxy for "quick faceless review" content. Survivors then
 * get a second, heavier check: a sample video's transcript/caption language is read to
 * reject non-English channels and background-music-dominated audio. Candidates that are
 * obviously non-English by name/description alone are dropped before any of that, to
 * avoid wasting page loads on them. Keeps going until TARGET_RESULTS or the
 * candidate/attempt budget runs out.
 */
export async function findChannels(query: string): Promise<FoundChannel[]> {
  const allCandidates = await searchCandidateChannels(query);

  // Cheap pre-filter: drop candidates that are unambiguously non-English by name/
  // description before spending a page load on them. Anything ambiguous (null) stays in
  // the pool for the more reliable per-video caption-language check below.
  const candidates = allCandidates.filter(
    (c) => looksEnglishFromText(`${c.name ?? ""} ${c.description ?? ""}`) !== false
  );

  const results: FoundChannel[] = [];
  let attempts = 0;

  for (const c of candidates) {
    if (results.length >= TARGET_RESULTS || attempts >= MAX_VERIFY_ATTEMPTS) break;
    if (!c.href) continue;
    attempts++;

    const stats = await getChannelVideoStats(c.href).catch((err) => {
      console.error(`[channel-finder] failed to measure ${c.href}:`, err);
      return { avgLengthSec: null, sampleVideoId: null } as ChannelVideoStats;
    });

    const { avgLengthSec, sampleVideoId } = stats;
    if (avgLengthSec === null || avgLengthSec < MIN_AVG_SECONDS || avgLengthSec >= MAX_AVG_SECONDS) {
      continue;
    }

    if (!sampleVideoId) continue;

    const quality = await checkContentQuality(sampleVideoId, `${c.name ?? ""} ${c.description ?? ""}`);
    if (!quality.clearAudio || quality.isEnglish === false) continue;

    results.push({
      name: c.name ?? c.handle ?? c.href,
      handle: c.handle,
      url: `https://www.youtube.com${c.href}`,
      thumbnailUrl: c.thumbnailUrl,
      subscriberText: c.subscriberText,
      avgLengthSec,
      description: c.description,
    });
  }

  return results;
}
