import { abOpen, abEval, abScroll } from "@/lib/agentBrowser";

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

// Visits the channel's Videos tab and reads the duration badges shown on the video grid
// — no need to open individual videos, YouTube already renders "8:23" etc. on the
// thumbnails themselves.
async function measureAverageLength(href: string): Promise<number | null> {
  await abOpen(`https://www.youtube.com${href}/videos`);

  const durations = await abEval<string[]>(`
    (function() {
      var els = document.querySelectorAll('.ytBadgeShapeText');
      var out = [];
      var re = /^\\d{1,2}:\\d{2}(:\\d{2})?$/;
      els.forEach(function(el) {
        var txt = el.textContent.trim();
        if (re.test(txt)) out.push(txt);
      });
      return out.slice(0, 12);
    })();
  `);

  const seconds = durations.map(parseDurationToSeconds).filter((n) => n > 0);
  if (seconds.length === 0) return null;
  return Math.round(seconds.reduce((a, b) => a + b, 0) / seconds.length);
}

/**
 * Searches YouTube for channels matching `query`, then visits each candidate's Videos
 * tab (in relevance order) to measure its average video length, keeping only the ones
 * under MAX_AVG_SECONDS — a proxy for "quick faceless review" content — until we hit
 * TARGET_RESULTS or run out of candidates/attempts.
 */
export async function findChannels(query: string): Promise<FoundChannel[]> {
  const candidates = await searchCandidateChannels(query);

  const results: FoundChannel[] = [];
  let attempts = 0;

  for (const c of candidates) {
    if (results.length >= TARGET_RESULTS || attempts >= MAX_VERIFY_ATTEMPTS) break;
    if (!c.href) continue;
    attempts++;

    const avgLengthSec = await measureAverageLength(c.href).catch((err) => {
      console.error(`[channel-finder] failed to measure ${c.href}:`, err);
      return null;
    });

    if (avgLengthSec === null || avgLengthSec < MIN_AVG_SECONDS || avgLengthSec >= MAX_AVG_SECONDS) {
      continue;
    }

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
