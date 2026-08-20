/**
 * Deep crawl — building a storefront list in the hundreds or thousands.
 *
 * No search engine gets anywhere near a thousand results for this query. Google
 * caps its own UI around 300 and its JSON API at 100 (start<=91), and cannot be
 * scraped at all; Bing has only ~10 amazon.com/shop pages in its index, and
 * answers `site:amazon.com/shop <term>` with a genuine "no results", so query
 * fan-out buys nothing there; DuckDuckGo pages out around 37 and then rate-limits
 * the IP for a long stretch. Measured, not assumed.
 *
 * So search is used only to seed. The volume comes from Amazon itself: a
 * storefront's video feed lists product ASINs, and a product page credits every
 * creator who filmed a video about it (~2.2 new creators per product). Those
 * creators' storefronts yield more ASINs, and the loop feeds itself with no
 * search engine in the path and no rate limit to dodge.
 */

import { prisma } from "@/lib/prisma";
import {
  countShopVideos,
  fetchProductCreators,
  fetchShopName,
  hasGoogleKeys,
  mapWithConcurrency,
  mineStorefrontAsins,
  searchShops,
  shopUrl,
  type ResolvedProvider,
  type ShopHit,
} from "@/lib/amazonShop";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── Query expansion ───────────────────────────────────────────────────────────

/** Buying categories creators build storefronts around. */
const NICHES = [
  "kitchen", "home", "beauty", "skincare", "makeup", "fashion", "shoes", "jewelry",
  "fitness", "gym", "yoga", "running", "outdoors", "camping", "hiking", "fishing",
  "tech", "gadgets", "electronics", "headphones", "laptop", "phone", "camera",
  "gaming", "pc", "desk", "office", "keyboard", "monitor", "chair",
  "baby", "toddler", "kids", "toys", "school", "teacher", "books",
  "pets", "dog", "cat", "garden", "plants", "patio", "grill", "tools", "diy",
  "car", "truck", "travel", "luggage", "vacation", "beach", "pool",
  "cleaning", "organization", "storage", "laundry", "bathroom", "bedroom",
  "decor", "furniture", "lighting", "rug", "curtains", "art", "craft", "sewing",
  "cooking", "baking", "coffee", "tea", "wine", "snacks", "keto", "vegan",
  "wedding", "party", "christmas", "halloween", "birthday", "gifts",
  "plus size", "petite", "maternity", "men", "women", "teen", "senior",
  "budget", "luxury", "small business", "rv", "apartment", "dorm", "farmhouse",
];

/** Phrasing that shows up in storefront titles and descriptions. */
const DESCRIPTORS = [
  "amazon finds", "favorites", "must haves", "essentials", "top picks",
  "gift guide", "deals", "recommendations", "storefront", "influencer",
  "shop my", "my picks", "haul", "review", "unboxing", "best sellers",
  "idea list", "new arrivals", "trending", "under 25", "under 50",
];

const LETTERS = "abcdefghijklmnopqrstuvwxyz0123456789".split("");

/**
 * Query variants ordered highest-yield-first: the bare query, then broad
 * phrasings, then categories, then single letters, then category+phrase pairs.
 * Deterministic, so a re-run walks the same order.
 */
export function expandQueries(base: string): string[] {
  const trimmed = base.trim();
  const out: string[] = [trimmed];

  // The same site: filter written another way — engines resolve them differently.
  const bareHost = trimmed.replace(
    /site:https?:\/\/(www\.)?amazon\.com\/shop/i,
    "site:amazon.com/shop"
  );
  if (bareHost !== trimmed) out.push(bareHost);

  for (const d of DESCRIPTORS) out.push(`${trimmed} ${d}`);
  for (const n of NICHES) out.push(`${trimmed} ${n}`);
  for (const l of LETTERS) out.push(`${trimmed} ${l}`);
  for (const n of NICHES) {
    for (const d of DESCRIPTORS) out.push(`${trimmed} ${n} ${d}`);
  }

  return out;
}

// ── Backend rotation ──────────────────────────────────────────────────────────

/** How long to wait after a successful call before using that backend again. */
const PACE_MS: Record<ResolvedProvider, number> = {
  google: 400,
  bing: 2_000,
  duckduckgo: 6_000,
};

/** How long to bench a backend that rate-limited or errored. */
const COOLDOWN_MS = 150_000;

type Slot = { provider: ResolvedProvider; readyAt: number; failures: number };

function makePool(): Slot[] {
  const providers: ResolvedProvider[] = hasGoogleKeys()
    ? ["google", "bing", "duckduckgo"]
    : ["bing", "duckduckgo"];
  return providers.map((provider) => ({ provider, readyAt: 0, failures: 0 }));
}

// ── Crawl ─────────────────────────────────────────────────────────────────────

const FRESH_FOR_MS = 24 * 60 * 60 * 1000;
const ENRICH_CONCURRENCY = 4;
const PRODUCT_CONCURRENCY = 2;

/**
 * Gap between product batches. Amazon starts serving its bot check somewhere
 * past a few hundred detail pages, so this trades a slower crawl for one that
 * keeps running.
 */
const PRODUCT_PACE_MS = 1_200;

/** First pause after a bot check; doubles per consecutive hit. */
const BLOCK_BACKOFF_MS = 60_000;
const MAX_BACKOFF_MS = 15 * 60_000;

/** Give up (leaving the job resumable) rather than hammer a wall forever. */
const MAX_BLOCK_STREAK = 6;

/** Search variants tried up front to seed the frontier when the table is thin. */
const SEED_QUERIES = 6;

/** Storefront video-feed pages mined for ASINs per storefront. */
const ASIN_PAGES_PER_SHOP = 3;

export type DeepCrawlOptions = {
  jobId: string;
  baseQuery: string;
  target: number;
  maxVideoPages: number;
};

type Ctx = {
  jobId: string;
  seen: Set<string>;
  saved: number;
  queriesRun: number;
  productsRead: number;
  note: string;
  maxVideoPages: number;
};

/**
 * Stores newly found handles, fetching each one's name and video count first.
 *
 * Returns true if Amazon soft-blocked any of the count requests. A throttled
 * response carries no video count, and writing it as zero would overwrite a real
 * number with a wrong one, so those rows are left for a later run instead.
 */
async function saveHandles(
  ctx: Ctx,
  hits: ShopHit[],
  sourceQuery: string
): Promise<boolean> {
  if (hits.length === 0) return false;
  let throttled = false;

  const existing = await prisma.amazonShop.findMany({
    where: { handle: { in: hits.map((h) => h.handle) } },
  });
  const byHandle = new Map(existing.map((row) => [row.handle, row]));

  await mapWithConcurrency(hits, ENRICH_CONCURRENCY, async (hit) => {
    const prior = byHandle.get(hit.handle);
    if (prior && Date.now() - prior.lastCrawledAt.getTime() < FRESH_FOR_MS) return;

    try {
      const [name, videos] = await Promise.all([
        fetchShopName(hit.handle),
        countShopVideos(hit.handle, ctx.maxVideoPages),
      ]);

      if (videos.throttled) {
        // Drop it from `seen` too, so a later run rediscovers and stores it.
        throttled = true;
        ctx.seen.delete(hit.handle.toLowerCase());
        return;
      }

      const fromTitle = hit.title.replace(/[’']s Amazon Page\s*$/i, "").trim();

      const data = {
        url: shopUrl(hit.handle),
        name: name || fromTitle || hit.handle,
        videoCount: videos.count,
        countCapped: videos.capped,
        sourceQuery,
        lastCrawledAt: new Date(),
      };
      await prisma.amazonShop.upsert({
        where: { handle: hit.handle },
        create: { handle: hit.handle, ...data },
        update: data,
      });
      ctx.saved++;
    } catch {
      // A storefront that will not load must not stop a crawl that runs for hours.
    }
  });

  return throttled;
}

/**
 * Runs until the target number of distinct storefronts is stored, the work runs
 * out, or the job row is flipped out of "running".
 *
 * Two discovery sources feed one set of handles:
 *   1. Search fan-out — fast, but bounded by what the engines have indexed
 *      (Bing carries ~10 of these pages, DuckDuckGo ~37).
 *   2. The Amazon frontier — storefront video feeds give product ASINs, and each
 *      product page credits every creator who filmed it. That loop is
 *      self-feeding and is the only route to a list in the hundreds or
 *      thousands without a Google API key.
 */
export async function runDeepCrawl(options: DeepCrawlOptions): Promise<void> {
  const { jobId, baseQuery, target, maxVideoPages } = options;

  const ctx: Ctx = {
    jobId,
    seen: new Set<string>(),
    saved: 0,
    queriesRun: 0,
    productsRead: 0,
    note: "",
    maxVideoPages,
  };

  // Handles already stored count toward the target — a re-run tops up.
  for (const row of await prisma.amazonShop.findMany({ select: { handle: true } })) {
    ctx.seen.add(row.handle.toLowerCase());
  }

  const stillRunning = async () => {
    const job = await prisma.shopCrawlJob.findUnique({
      where: { id: jobId },
      select: { status: true },
    });
    return job?.status === "running";
  };

  const report = async (currentQuery: string | null) => {
    await prisma.shopCrawlJob
      .update({
        where: { id: jobId },
        data: {
          discovered: ctx.seen.size,
          saved: ctx.saved,
          queriesRun: ctx.queriesRun,
          currentQuery,
          note: ctx.note,
        },
      })
      .catch(() => {});
  };

  // ── 1. Seed from search ────────────────────────────────────────────────────
  const pool = makePool();
  const takeSlot = async (): Promise<Slot> => {
    const soonest = pool.reduce((a, b) => (a.readyAt <= b.readyAt ? a : b));
    const wait = soonest.readyAt - Date.now();
    if (wait > 0) await sleep(Math.min(wait, 15_000));
    return soonest;
  };

  const variants = expandQueries(baseQuery);
  for (const query of variants.slice(0, SEED_QUERIES)) {
    if (ctx.seen.size >= target) break;
    if (!(await stillRunning())) return;

    const slot = await takeSlot();
    ctx.queriesRun++;
    try {
      const outcome = await searchShops(query, 200, slot.provider);
      slot.readyAt = Date.now() + PACE_MS[slot.provider];
      ctx.note = `${slot.provider}: ${outcome.hits.length} result(s)`;

      const fresh = outcome.hits.filter((h) => !ctx.seen.has(h.handle.toLowerCase()));
      outcome.hits.forEach((h) => ctx.seen.add(h.handle.toLowerCase()));
      await saveHandles(ctx, fresh, query);
    } catch (err) {
      slot.readyAt = Date.now() + COOLDOWN_MS;
      ctx.note = `${slot.provider} paused (${
        err instanceof Error ? err.message.slice(0, 100) : "error"
      })`;
    }
    await report(query);
  }

  // ── 2. Walk the Amazon frontier ────────────────────────────────────────────
  const visitedAsins = new Set<string>();
  const asinQueue: string[] = [];
  let blockStreak = 0;

  /** Pulls ASINs from storefronts that have not been mined yet. */
  const refillAsins = async (): Promise<boolean | "throttled"> => {
    const shops = await prisma.amazonShop.findMany({
      where: { asinsMined: false },
      orderBy: { videoCount: "desc" }, // creators with videos carry the most products
      take: 5,
    });
    if (shops.length === 0) return false;

    for (const shop of shops) {
      ctx.note = `mining products from ${shop.handle}`;
      await report(null);
      try {
        const { asins, throttled } = await mineStorefrontAsins(
          shop.handle,
          ASIN_PAGES_PER_SHOP
        );
        for (const asin of asins) {
          if (!visitedAsins.has(asin)) asinQueue.push(asin);
        }
        // Leave the storefront unmined so a later run comes back to it.
        if (throttled) return "throttled";
      } catch {
        // Skip a storefront whose feed will not load.
      }
      await prisma.amazonShop
        .update({ where: { id: shop.id }, data: { asinsMined: true } })
        .catch(() => {});
    }
    return true;
  };

  /** Waits out a soft block, doubling each time; returns false once it gives up. */
  const backOff = async (reason: string): Promise<boolean> => {
    blockStreak++;
    if (blockStreak > MAX_BLOCK_STREAK) {
      ctx.note = `Amazon kept throttling (${reason}) — stopping so it can cool off`;
      await report(null);
      return false;
    }
    const pause = Math.min(BLOCK_BACKOFF_MS * 2 ** (blockStreak - 1), MAX_BACKOFF_MS);
    ctx.note = `Amazon throttled (${reason}) — pausing ${Math.round(
      pause / 1000
    )}s (attempt ${blockStreak})`;
    await report(null);
    await sleep(pause);
    return true;
  };

  while (ctx.seen.size < target) {
    if (!(await stillRunning())) return;

    if (asinQueue.length === 0) {
      const refilled = await refillAsins();
      if (refilled === "throttled") {
        if (!(await backOff("storefront feeds"))) break;
        continue;
      }
      if (!refilled) {
        ctx.note = "frontier exhausted — every known storefront has been mined";
        break;
      }
      continue;
    }

    const concurrency = blockStreak > 0 ? 1 : PRODUCT_CONCURRENCY;
    const batch = asinQueue.splice(0, concurrency);

    const found = await mapWithConcurrency(batch, concurrency, async (asin) => {
      try {
        return await fetchProductCreators(asin);
      } catch {
        return { blocked: false as const, handles: [] };
      }
    });

    // Amazon answers its bot check with HTTP 200, so a blocked page looks like a
    // product with no creators. Re-queue those ASINs and wait it out, doubling
    // the pause each time, instead of burning the queue against a wall.
    if (found.some((r) => r.blocked)) {
      asinQueue.unshift(...batch);
      if (!(await backOff("product bot check"))) break;
      continue;
    }

    blockStreak = 0;
    batch.forEach((a) => visitedAsins.add(a));
    ctx.productsRead += batch.length;

    const fresh: ShopHit[] = [];
    for (const handle of found.flatMap((r) => r.handles)) {
      const keyed = handle.toLowerCase();
      if (ctx.seen.has(keyed)) continue;
      ctx.seen.add(keyed);
      fresh.push({ handle, url: shopUrl(handle), title: "" });
    }

    if (fresh.length > 0) {
      const wasThrottled = await saveHandles(ctx, fresh, "amazon-frontier");
      if (wasThrottled && !(await backOff("video counts"))) break;
    }

    ctx.note = `${ctx.productsRead} products read · ${asinQueue.length} queued`;
    await report(null);
    await sleep(PRODUCT_PACE_MS);
  }

  const finalStatus = (await stillRunning()) ? "done" : "stopped";
  await prisma.shopCrawlJob
    .update({
      where: { id: jobId },
      data: {
        status: finalStatus,
        discovered: ctx.seen.size,
        saved: ctx.saved,
        queriesRun: ctx.queriesRun,
        currentQuery: null,
        note: ctx.note,
        finishedAt: new Date(),
      },
    })
    .catch(() => {});
}
