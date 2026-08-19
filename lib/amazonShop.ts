/**
 * Amazon influencer storefront crawler.
 *
 * Discovery — runs the `site:https://www.amazon.com/shop` query against a search
 * engine and pulls the vanity handles out of the result URLs.
 *   - Google Programmable Search JSON API when GOOGLE_API_KEY + GOOGLE_CSE_ID are
 *     set. google.com itself refuses server-side scraping: it hard-requires JS.
 *   - DuckDuckGo's HTML endpoint otherwise, which needs no key but rate-limits
 *     aggressively (HTTP 202 with an empty result list).
 *
 * Enrichment — per handle:
 *   - name  from the og:title of the storefront page (read aborted after ~120 KB)
 *   - count from /shop/<handle>/getItems?viewScope=Video, the lightweight AJAX
 *           endpoint the storefront's Videos tab pages through, 20 per page.
 */

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const BROWSER_HEADERS = {
  "User-Agent": UA,
  "Accept-Language": "en-US,en;q=0.9",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
};

export const DEFAULT_QUERY = "site:https://www.amazon.com/shop";

/** Segments after /shop/ that are Amazon's own pages, not creator handles. */
const RESERVED_HANDLES = new Set([
  "info",
  "profile",
  "create",
  "search",
  "getitems",
  "unifiedsearch",
  "curation",
  "list",
  "media",
  "photo",
  "video",
  "vdp",
]);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

export type ShopHit = { handle: string; url: string; title: string };

/** Pulls the creator handle out of any amazon.com/shop/<handle> URL. */
export function handleFromUrl(raw: string): string | null {
  try {
    const url = new URL(decodeEntities(raw));
    if (!/(^|\.)amazon\.com$/i.test(url.hostname)) return null;
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts[0]?.toLowerCase() !== "shop") return null;
    const handle = parts[1];
    if (!handle) return null;
    if (RESERVED_HANDLES.has(handle.toLowerCase())) return null;
    if (!/^[A-Za-z0-9._-]+$/.test(handle)) return null;
    return handle;
  } catch {
    return null;
  }
}

export function shopUrl(handle: string): string {
  return `https://www.amazon.com/shop/${handle}`;
}

// ── Discovery: Google Programmable Search JSON API ────────────────────────────

type GoogleItem = { link?: string; title?: string };
type GoogleResponse = { items?: GoogleItem[]; error?: { message?: string } };

async function searchGoogle(query: string, maxResults: number): Promise<ShopHit[]> {
  const key = process.env.GOOGLE_API_KEY;
  const cx = process.env.GOOGLE_CSE_ID;
  if (!key || !cx) throw new Error("GOOGLE_API_KEY and GOOGLE_CSE_ID are not set");

  const hits = new Map<string, ShopHit>();

  // The JSON API caps out at 100 results: start=1..91, 10 per page.
  for (let start = 1; start <= 91 && hits.size < maxResults; start += 10) {
    const url =
      `https://www.googleapis.com/customsearch/v1?key=${encodeURIComponent(key)}` +
      `&cx=${encodeURIComponent(cx)}&q=${encodeURIComponent(query)}&num=10&start=${start}`;

    const res = await fetch(url);
    const data: GoogleResponse = await res.json();

    if (!res.ok) {
      const detail = data?.error?.message ?? `HTTP ${res.status}`;
      if (start === 1) throw new Error(`Google search failed: ${detail}`);
      break; // keep whatever earlier pages returned
    }

    const items = data.items ?? [];
    if (items.length === 0) break;

    for (const item of items) {
      const handle = handleFromUrl(item.link ?? "");
      if (!handle) continue;
      const keyed = handle.toLowerCase();
      if (!hits.has(keyed)) {
        hits.set(keyed, { handle, url: shopUrl(handle), title: item.title ?? "" });
      }
    }
  }

  return Array.from(hits.values()).slice(0, maxResults);
}

// ── Discovery: DuckDuckGo HTML ────────────────────────────────────────────────

/** DuckDuckGo wraps every result in /l/?uddg=<encoded target>. */
function unwrapDuckDuckGoLink(href: string): string {
  const match = href.match(/[?&]uddg=([^&]+)/);
  if (match) {
    try {
      return decodeURIComponent(match[1]);
    } catch {
      return href;
    }
  }
  return href.startsWith("//") ? `https:${href}` : href;
}

/** The Next button is a POST form carrying the vqd token — replay it verbatim. */
function nextPageForm(html: string): Record<string, string> | null {
  const forms = Array.from(html.matchAll(/<form[\s\S]*?<\/form>/g), (m) => m[0]);
  const form = forms.find((f) => /value="Next/.test(f));
  if (!form) return null;

  const fields: Record<string, string> = {};
  for (const m of Array.from(form.matchAll(/<input\b[^>]*>/g))) {
    const tag = m[0];
    if (/type="submit"/.test(tag)) continue;
    const name = tag.match(/\bname="([^"]+)"/)?.[1];
    const value = tag.match(/\bvalue="([^"]*)"/)?.[1] ?? "";
    if (name) fields[name] = decodeEntities(value);
  }
  return Object.keys(fields).length > 0 ? fields : null;
}

function parseDuckDuckGoResults(html: string): ShopHit[] {
  const out: ShopHit[] = [];
  const re = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  for (const m of Array.from(html.matchAll(re))) {
    const href = unwrapDuckDuckGoLink(decodeEntities(m[1]));
    const handle = handleFromUrl(href);
    if (!handle) continue;
    const title = decodeEntities(m[2].replace(/<[^>]*>/g, "")).trim();
    out.push({ handle, url: shopUrl(handle), title });
  }
  return out;
}

async function searchDuckDuckGo(query: string, maxResults: number): Promise<ShopHit[]> {
  const hits = new Map<string, ShopHit>();

  const collect = (page: string) => {
    for (const hit of parseDuckDuckGoResults(page)) {
      const keyed = hit.handle.toLowerCase();
      if (!hits.has(keyed)) hits.set(keyed, hit);
    }
  };

  // A throttled request comes back as 202 with no results — back off and retry.
  let html = "";
  let blocked = true;
  for (let attempt = 0; attempt < 3 && blocked; attempt++) {
    if (attempt > 0) await sleep(2000 * attempt);
    const res = await fetch(
      `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
      { headers: BROWSER_HEADERS }
    );
    html = await res.text();
    blocked = res.status === 202 || parseDuckDuckGoResults(html).length === 0;
  }

  if (blocked) {
    throw new Error(
      "DuckDuckGo is rate-limiting this IP (HTTP 202). Wait a few minutes, or set " +
        "GOOGLE_API_KEY and GOOGLE_CSE_ID to crawl through the Google Programmable Search API."
    );
  }

  collect(html);

  // Bounded: DuckDuckGo keeps serving Next forms long after the results dry up.
  for (let page = 1; page < 15 && hits.size < maxResults; page++) {
    const form = nextPageForm(html);
    if (!form) break;
    await sleep(1800);

    const res = await fetch("https://html.duckduckgo.com/html/", {
      method: "POST",
      headers: {
        ...BROWSER_HEADERS,
        "Content-Type": "application/x-www-form-urlencoded",
        Referer: "https://html.duckduckgo.com/",
        Origin: "https://html.duckduckgo.com",
      },
      body: new URLSearchParams(form),
    });
    if (res.status === 202) break;

    html = await res.text();
    if (parseDuckDuckGoResults(html).length === 0) break;
    collect(html);
  }

  return Array.from(hits.values()).slice(0, maxResults);
}

export type SearchProvider = "auto" | "google" | "duckduckgo";

export function resolveProvider(requested: SearchProvider): "google" | "duckduckgo" {
  if (requested === "google") return "google";
  if (requested === "duckduckgo") return "duckduckgo";
  return process.env.GOOGLE_API_KEY && process.env.GOOGLE_CSE_ID ? "google" : "duckduckgo";
}

export async function searchShops(
  query: string,
  maxResults: number,
  provider: "google" | "duckduckgo"
): Promise<ShopHit[]> {
  return provider === "google"
    ? searchGoogle(query, maxResults)
    : searchDuckDuckGo(query, maxResults);
}

// ── Enrichment: storefront name ───────────────────────────────────────────────

/** Reads only the first ~120 KB of the storefront page — the head is all we need. */
async function fetchHead(url: string, limit = 120_000): Promise<string> {
  const res = await fetch(url, { headers: BROWSER_HEADERS, redirect: "follow" });
  if (!res.ok || !res.body) return "";

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  try {
    while (buf.length < limit) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return buf;
}

export async function fetchShopName(handle: string): Promise<string | null> {
  const html = await fetchHead(shopUrl(handle));
  if (!html) return null;

  const raw =
    html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i)?.[1] ??
    html.match(/<title>([\s\S]*?)<\/title>/i)?.[1];
  if (!raw) return null;

  // Amazon renders the title as "<name>'s Amazon Page".
  const name = decodeEntities(raw)
    .replace(/[’']s Amazon Page\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();

  return name || null;
}

// ── Enrichment: video count ───────────────────────────────────────────────────

export type VideoCount = { count: number; capped: boolean };

/**
 * Walks the storefront's Videos tab. Each page carries 20 videos plus the
 * pageToken / shouldLoadMoreFlag pair that drives the next request.
 */
export async function countShopVideos(
  handle: string,
  maxPages: number
): Promise<VideoCount> {
  const ids = new Set<string>();
  let token: string | null = null;

  for (let page = 0; page < maxPages; page++) {
    let url = `https://www.amazon.com/shop/${encodeURIComponent(handle)}/getItems?viewScope=Video`;
    if (token) url += `&pageToken=${encodeURIComponent(token)}`;

    const res = await fetch(url, { headers: BROWSER_HEADERS });
    // A handle without a Videos tab answers 404 — that is a complete count of 0,
    // not a truncated one.
    if (!res.ok) return { count: ids.size, capped: false };
    const html = await res.text();

    const before = ids.size;
    for (const m of Array.from(html.matchAll(/amzn1\.vse\.video\.([a-f0-9]{32})/g))) {
      ids.add(m[1]);
    }

    const more = html.match(/name="shouldLoadMoreFlag" value="([^"]*)"/)?.[1];
    const next = html.match(/name="pageToken" value="([^"]*)"/)?.[1] ?? "";
    if (more !== "true" || !next || next === token || ids.size === before) {
      return { count: ids.size, capped: false };
    }
    token = next;
    await sleep(150);
  }

  return { count: ids.size, capped: true };
}

// ── Small concurrency helper ──────────────────────────────────────────────────

export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;

  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await fn(items[index]);
    }
  });

  await Promise.all(workers);
  return results;
}
