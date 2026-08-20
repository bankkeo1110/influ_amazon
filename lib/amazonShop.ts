/**
 * Amazon influencer storefront crawler.
 *
 * Discovery — runs the `site:https://www.amazon.com/shop` query against a search
 * engine and pulls the vanity handles out of the result URLs. Backends are tried
 * in order until one returns results, so a throttled engine does not sink a crawl:
 *   - Google Programmable Search JSON API when GOOGLE_API_KEY + GOOGLE_CSE_ID are
 *     set. Scraping google.com directly is not an option — it hard-requires JS,
 *     and a real headless browser gets bounced to the /sorry CAPTCHA.
 *   - Bing's HTML results, which need no key and tolerate repeated queries.
 *   - DuckDuckGo's HTML endpoint, keyless but quick to rate-limit an IP for
 *     minutes at a time (HTTP 202 with an empty result list).
 *
 * Enrichment — per handle:
 *   - name  from the og:title of the storefront page (read aborted after ~120 KB)
 *   - count from /shop/<handle>/getItems?viewScope=Video, the lightweight AJAX
 *           endpoint the storefront's Videos tab pages through, 20 per page.
 */

import https from "node:https";
import zlib from "node:zlib";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent": UA,
  "Accept-Language": "en-US,en;q=0.9",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
};

// ── HTTP ──────────────────────────────────────────────────────────────────────

type HttpResponse = { status: number; body: string; url: string };

type HttpOptions = {
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  /** Form-encoded request body; sets Content-Type when present. */
  form?: URLSearchParams;
  /** Stop reading and drop the connection once this many bytes have arrived. */
  maxBytes?: number;
  timeoutMs?: number;
};

/**
 * Plain node:https instead of fetch.
 *
 * Node's fetch (undici) always attaches `accept-encoding: gzip, deflate`, and
 * Amazon's storefront AJAX endpoints answer any compressed request with HTTP 400
 * — the identical request without that header returns 200, and fetch gives no way
 * to drop it. Doing our own request also lets us destroy a response mid-stream
 * (see maxBytes) without leaving a half-read body pinning a pooled connection.
 */
function httpRequest(rawUrl: string, options: HttpOptions = {}): Promise<HttpResponse> {
  const {
    method = "GET",
    headers = BROWSER_HEADERS,
    form,
    maxBytes = Infinity,
    timeoutMs = 30_000,
  } = options;

  return new Promise((resolve, reject) => {
    const url = new URL(rawUrl);
    const payload = form ? Buffer.from(form.toString()) : null;
    let settled = false;

    const succeed = (value: HttpResponse) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      reject(err);
    };

    const req = https.request(
      {
        protocol: url.protocol,
        host: url.hostname,
        path: url.pathname + url.search,
        method,
        headers: {
          // No Accept-Encoding on purpose: Amazon's getItems endpoint answers any
          // compressed request with HTTP 400, and undici's fetch always sends one.
          // Responses still get decompressed below if a server compresses anyway.
          ...headers,
          ...(payload
            ? {
                "Content-Type": "application/x-www-form-urlencoded",
                "Content-Length": String(payload.length),
              }
            : {}),
        },
      },
      (res) => {
        const status = res.statusCode ?? 0;
        const location = res.headers.location;

        if (status >= 300 && status < 400 && location) {
          res.resume(); // drain so the socket can be reused
          const next = new URL(location, url).toString();
          httpRequest(next, options).then(succeed, fail);
          return;
        }

        const encoding = String(res.headers["content-encoding"] ?? "");
        const stream =
          encoding === "gzip"
            ? res.pipe(zlib.createGunzip())
            : encoding === "deflate"
              ? res.pipe(zlib.createInflate())
              : res;

        let body = "";
        const finish = () => succeed({ status, body, url: url.toString() });

        stream.on("data", (chunk: Buffer | string) => {
          body += chunk.toString();
          if (body.length >= maxBytes) {
            // Enough read — drop the connection rather than pulling the rest.
            req.destroy();
            finish();
          }
        });
        stream.on("end", finish);
        stream.on("error", fail);
      }
    );

    req.setTimeout(timeoutMs, () => req.destroy(new Error(`Timed out after ${timeoutMs}ms`)));
    // A destroy() we triggered after maxBytes lands here too; `settled` filters it out.
    req.on("error", fail);

    if (payload) req.write(payload);
    req.end();
  });
}

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
    const res = await httpRequest(
      `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`
    );
    html = res.body;
    blocked = res.status === 202 || parseDuckDuckGoResults(html).length === 0;
  }

  if (blocked) {
    throw new Error("rate-limited this IP (HTTP 202)");
  }

  collect(html);

  // Bounded: DuckDuckGo keeps serving Next forms long after the results dry up.
  for (let page = 1; page < 15 && hits.size < maxResults; page++) {
    const form = nextPageForm(html);
    if (!form) break;
    await sleep(1800);

    const res = await httpRequest("https://html.duckduckgo.com/html/", {
      method: "POST",
      headers: {
        ...BROWSER_HEADERS,
        Referer: "https://html.duckduckgo.com/",
        Origin: "https://html.duckduckgo.com",
      },
      form: new URLSearchParams(form),
    });
    if (res.status === 202) break;

    html = res.body;
    if (parseDuckDuckGoResults(html).length === 0) break;
    collect(html);
  }

  return Array.from(hits.values()).slice(0, maxResults);
}

// ── Discovery: Bing HTML ──────────────────────────────────────────────────────

/**
 * Bing hides every result behind /ck/a?…&u=a1<base64url of the real URL>.
 * Returns the href unchanged when it is not one of those redirects.
 */
function unwrapBingLink(href: string): string {
  const match = href.match(/[?&]u=a1([A-Za-z0-9_-]+)/);
  if (!match) return href;
  try {
    return Buffer.from(match[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString(
      "utf8"
    );
  } catch {
    return href;
  }
}

function parseBingResults(html: string): ShopHit[] {
  const out: ShopHit[] = [];
  const re = /<h2[^>]*>\s*<a\b[^>]*href="([^"]+)"[\s\S]*?>([\s\S]*?)<\/a>/g;
  for (const m of Array.from(html.matchAll(re))) {
    const href = unwrapBingLink(decodeEntities(m[1]));
    const handle = handleFromUrl(href);
    if (!handle) continue;
    const title = decodeEntities(m[2].replace(/<[^>]*>/g, "")).trim();
    out.push({ handle, url: shopUrl(handle), title });
  }
  return out;
}

/** Bing's own next-page link carries an FPIG token; a bare &first=N is ignored. */
function bingNextUrl(html: string): string | null {
  const href =
    html.match(/<a class="sb_pagN[^"]*"[^>]*href="([^"]+)"/)?.[1] ??
    html.match(/aria-label="Page 2"[^>]*href="([^"]+)"/)?.[1];
  if (!href) return null;
  const path = decodeEntities(href);
  return path.startsWith("http") ? path : `https://www.bing.com${path}`;
}

async function searchBing(query: string, maxResults: number): Promise<ShopHit[]> {
  const hits = new Map<string, ShopHit>();
  let url = `https://www.bing.com/search?q=${encodeURIComponent(query)}&count=30`;

  for (let page = 0; page < 10 && hits.size < maxResults; page++) {
    const res = await httpRequest(url, {
      headers: { ...BROWSER_HEADERS, Referer: "https://www.bing.com/" },
    });
    if (res.status !== 200) break;
    const html = res.body;

    const before = hits.size;
    for (const hit of parseBingResults(html)) {
      const keyed = hit.handle.toLowerCase();
      if (!hits.has(keyed)) hits.set(keyed, hit);
    }

    // Bing keeps serving pages after the result set is exhausted, repeating the
    // last page — stop as soon as one adds nothing new.
    if (hits.size === before) break;

    const next = bingNextUrl(html);
    if (!next) break;
    url = next;
    await sleep(800);
  }

  return Array.from(hits.values()).slice(0, maxResults);
}

// ── Provider selection ────────────────────────────────────────────────────────

export type SearchProvider = "auto" | "google" | "bing" | "duckduckgo";
export type ResolvedProvider = Exclude<SearchProvider, "auto">;

const BACKENDS: Record<
  ResolvedProvider,
  (query: string, maxResults: number) => Promise<ShopHit[]>
> = {
  google: searchGoogle,
  bing: searchBing,
  duckduckgo: searchDuckDuckGo,
};

export function hasGoogleKeys(): boolean {
  return Boolean(process.env.GOOGLE_API_KEY && process.env.GOOGLE_CSE_ID);
}

/**
 * Order to try when the caller said "auto". Google's JSON API is the best source
 * when it is configured; Bing is the most tolerant of the keyless scrapers, and
 * DuckDuckGo backs it up (it rate-limits an IP for minutes at a time).
 */
function providerChain(requested: SearchProvider): ResolvedProvider[] {
  if (requested !== "auto") return [requested];
  return hasGoogleKeys() ? ["google", "bing", "duckduckgo"] : ["bing", "duckduckgo"];
}

export type SearchOutcome = {
  provider: ResolvedProvider;
  hits: ShopHit[];
  /** Backends that were tried first and did not deliver, for surfacing in the UI. */
  attempts: { provider: ResolvedProvider; error: string }[];
};

/**
 * Walks the provider chain and returns the first backend that yields results, so
 * one throttled search engine does not sink the whole crawl.
 */
export async function searchShops(
  query: string,
  maxResults: number,
  requested: SearchProvider
): Promise<SearchOutcome> {
  const chain = providerChain(requested);
  const attempts: { provider: ResolvedProvider; error: string }[] = [];

  for (const provider of chain) {
    try {
      const hits = await BACKENDS[provider](query, maxResults);
      if (hits.length > 0) return { provider, hits, attempts };
      attempts.push({ provider, error: "returned no amazon.com/shop results" });
    } catch (err) {
      attempts.push({
        provider,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  // Nothing worked — report every backend's reason rather than just the last one.
  const detail = attempts.map((a) => `${a.provider}: ${a.error}`).join(" | ");
  throw new Error(`No search backend returned results — ${detail}`);
}

// ── Enrichment: storefront name ───────────────────────────────────────────────

/** Reads only the first ~120 KB of the storefront page — the head is all we need. */
async function fetchHead(url: string, limit = 120_000): Promise<string> {
  const res = await httpRequest(url, { maxBytes: limit });
  return res.status === 200 ? res.body : "";
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

export type VideoCount = { count: number; capped: boolean; throttled: boolean };

/**
 * Amazon soft-blocks the storefront AJAX endpoints under load, answering 400 or
 * 503 for handles that resolve perfectly well a minute earlier. That is NOT the
 * same as a storefront with no videos, and must never be recorded as a count of
 * zero — doing so overwrites real numbers with wrong ones.
 */
function isThrottleStatus(status: number): boolean {
  return status === 400 || status === 503 || status === 429;
}

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

    const res = await httpRequest(url);
    // A soft block is not an empty storefront — say so, so the caller can skip
    // the write and retry later rather than saving a bogus zero.
    if (isThrottleStatus(res.status)) {
      return { count: ids.size, capped: false, throttled: true };
    }
    // A handle without a Videos tab answers 404 — that is a complete count of 0,
    // not a truncated one.
    if (res.status !== 200) return { count: ids.size, capped: false, throttled: false };
    const html = res.body;

    const before = ids.size;
    for (const m of Array.from(html.matchAll(/amzn1\.vse\.video\.([a-f0-9]{32})/g))) {
      ids.add(m[1]);
    }

    const more = html.match(/name="shouldLoadMoreFlag" value="([^"]*)"/)?.[1];
    const next = html.match(/name="pageToken" value="([^"]*)"/)?.[1] ?? "";
    if (more !== "true" || !next || next === token || ids.size === before) {
      return { count: ids.size, capped: false, throttled: false };
    }
    token = next;
    await sleep(150);
  }

  return { count: ids.size, capped: true, throttled: false };
}

// ── Discovery inside Amazon itself ────────────────────────────────────────────

/**
 * Product ASINs featured in a storefront's video feed.
 *
 * These are the bridge to other creators: a product page lists every influencer
 * who filmed a video about that product, so one storefront's products lead
 * outward to creators no search engine has indexed.
 */
export async function mineStorefrontAsins(
  handle: string,
  maxPages: number
): Promise<{ asins: string[]; throttled: boolean }> {
  const asins = new Set<string>();
  let token: string | null = null;

  for (let page = 0; page < maxPages; page++) {
    let url = `https://www.amazon.com/shop/${encodeURIComponent(handle)}/getItems?viewScope=Video`;
    if (token) url += `&pageToken=${encodeURIComponent(token)}`;

    const res = await httpRequest(url);
    // Soft block — report it so the caller does not mark this storefront mined.
    if (isThrottleStatus(res.status)) {
      return { asins: Array.from(asins), throttled: true };
    }
    if (res.status !== 200) break;

    // The feed HTML-escapes its JSON, so match the data-asin attribute instead.
    for (const m of Array.from(res.body.matchAll(/amzn1\.asin\.([A-Z0-9]{10})/g))) {
      asins.add(m[1]);
    }

    const more = res.body.match(/name="shouldLoadMoreFlag" value="([^"]*)"/)?.[1];
    const next = res.body.match(/name="pageToken" value="([^"]*)"/)?.[1] ?? "";
    if (more !== "true" || !next || next === token) break;
    token = next;
    await sleep(150);
  }

  return { asins: Array.from(asins), throttled: false };
}

/**
 * Amazon serves its bot check with HTTP 200 and a ~4 KB body, so status alone
 * cannot tell it apart from a real page. Left undetected it reads as "this
 * product simply has no creators", and a crawl happily burns its whole queue
 * finding nothing.
 */
export function isBotCheck(body: string): boolean {
  return (
    body.length < 100_000 &&
    /captcha|Robot Check|automated access|api-services-support@amazon\.com/i.test(body)
  );
}

export type ProductCreators =
  | { blocked: false; handles: string[] }
  | { blocked: true; handles: [] };

/**
 * Creator handles credited on a product's detail page.
 *
 * The influencer-video rail sits roughly 900 KB into a ~2 MB page, and capping
 * the read misses most of it — measured yield drops from ~2.2 creators per
 * product to ~0.2 — so this deliberately reads the page in full.
 */
export async function fetchProductCreators(asin: string): Promise<ProductCreators> {
  const res = await httpRequest(`https://www.amazon.com/dp/${encodeURIComponent(asin)}`, {
    timeoutMs: 45_000,
  });
  if (res.status !== 200) return { blocked: false, handles: [] };
  if (isBotCheck(res.body)) return { blocked: true, handles: [] };

  const handles = new Set<string>();
  for (const m of Array.from(res.body.matchAll(/\/shop\/([A-Za-z0-9._-]+)/g))) {
    const handle = m[1];
    if (RESERVED_HANDLES.has(handle.toLowerCase())) continue;
    handles.add(handle);
  }
  return { blocked: false, handles: Array.from(handles) };
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
