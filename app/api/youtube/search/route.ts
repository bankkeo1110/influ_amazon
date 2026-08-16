import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { abOpen, abEval } from "@/lib/agentBrowser";

const AFFILIATE_PATTERNS = [
  "amazon.com",
  "amzn.to",
  "amzn.com",
  "affiliate",
  "commission",
  "i get paid",
  "paid link",
  "paid partnership",
  "sponsored",
  "sponsorship",
  "discount code",
  "promo code",
  "coupon code",
  "use code",
  "buy here",
  "shop here",
  "shop now",
  "bit.ly",
  "geni.us",
  "go.magik",
  "shareasale",
  "clickbank",
  "rakuten",
  "skimlinks",
  "referral link",
  "purchase through",
  "purchases made through",
  "text deals",
  "deals to 1",
];

const FACELESS_BOOST_KEYWORDS = [
  "unboxing",
  "unbox",
  "hands on",
  "hands-on",
  "review",
  "best ",
  "vs ",
  "comparison",
  "top ",
];

const FACECAM_PENALTY_KEYWORDS = [
  "my experience",
  "i bought",
  "i tried",
  "storytime",
  "vlog",
  "with me",
];

// Matches any http/https URL in text
const URL_REGEX = /https?:\/\/[^\s)>\]]+/gi;

// Domains allowed in descriptions (social/youtube own links are fine)
const ALLOWED_DOMAINS = [
  "youtube.com",
  "youtu.be",
  "instagram.com",
  "twitter.com",
  "x.com",
  "facebook.com",
  "tiktok.com",
  "patreon.com",
  "linktr.ee",
  "linktree.com",
];

function hasAffiliate(text: string): boolean {
  const lower = text.toLowerCase();
  return AFFILIATE_PATTERNS.some((kw) => lower.includes(kw));
}

/** Returns true if the description contains ANY link to a commercial/external website */
function hasCommercialLinks(text: string): boolean {
  const urls = text.match(URL_REGEX) ?? [];
  return urls.some((url) => {
    const lower = url.toLowerCase();
    return !ALLOWED_DOMAINS.some((domain) => lower.includes(domain));
  });
}

function facelessScore(title: string): number {
  const lower = title.toLowerCase();
  let score = 0;
  if (FACELESS_BOOST_KEYWORDS.some((kw) => lower.includes(kw))) score += 2;
  if (FACECAM_PENALTY_KEYWORDS.some((kw) => lower.includes(kw))) score -= 3;
  return score;
}

type Run = { text: string };

type InnertubeVideoRenderer = {
  videoId?: string;
  title?: { runs?: Run[] };
  descriptionSnippet?: { runs?: Run[] };
  thumbnail?: { thumbnails?: { url: string; width: number; height: number }[] };
  ownerText?: { runs?: Run[] };
  publishedTimeText?: { simpleText?: string };
  viewCountText?: { simpleText?: string };
};

type InnertubeItem = {
  videoRenderer?: InnertubeVideoRenderer;
  itemSectionRenderer?: { contents?: InnertubeItem[] };
};

type InnertubeSearchResponse = {
  contents?: {
    twoColumnSearchResultsRenderer?: {
      primaryContents?: {
        sectionListRenderer?: {
          contents?: InnertubeItem[];
        };
      };
    };
  };
};

// Fetches a watch page for real in a headless Chrome tab (via agent-browser) and reads
// window.ytInitialData off it, instead of POSTing to the InnerTube /next endpoint from
// the server — YouTube increasingly blocks/empties out that raw datacenter-IP traffic.
async function fetchFullDescription(videoId: string): Promise<string> {
  try {
    await abOpen(`https://www.youtube.com/watch?v=${videoId}&hl=en`);
    const description = await abEval<string>(`
      (function() {
        var contents = window.ytInitialData?.contents?.twoColumnWatchNextResults
          ?.results?.results?.contents ?? [];
        for (var i = 0; i < contents.length; i++) {
          var vsir = contents[i]?.videoSecondaryInfoRenderer;
          var content = vsir?.attributedDescription?.content;
          if (content) return content;
          var runs = vsir?.description?.runs;
          if (runs && runs.length) return runs.map(function(r) { return r.text; }).join("");
        }
        return "";
      })();
    `);
    return description ?? "";
  } catch (err) {
    console.error(`[youtube-search] failed to fetch description for ${videoId}:`, err);
    return "";
  }
}

type Candidate = {
  videoId: string;
  title: string;
  snippetDescription: string;
  thumbnailUrl: string;
  channelTitle: string;
  publishedAt: string;
  viewCount: string | null;
};

async function searchYoutube(query: string) {
  // sp=EgIQAQ%3D%3D restricts results to the "Video" filter, same as the old POST params.
  const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(
    `${query} unboxing review`
  )}&sp=EgIQAQ%3D%3D`;

  await abOpen(searchUrl);
  const data = await abEval<InnertubeSearchResponse>(`
    (function() { return window.ytInitialData || null; })();
  `);

  const candidates: Candidate[] = [];
  const contents =
    data?.contents?.twoColumnSearchResultsRenderer?.primaryContents
      ?.sectionListRenderer?.contents ?? [];

  for (const section of contents) {
    const items: InnertubeItem[] = section?.itemSectionRenderer?.contents ?? [];
    for (const item of items) {
      const v = item?.videoRenderer;
      if (!v?.videoId) continue;

      const title = v.title?.runs?.map((r) => r.text).join("") ?? "";
      const snippetDescription =
        v.descriptionSnippet?.runs?.map((r) => r.text).join("") ?? "";
      const thumbnails = v.thumbnail?.thumbnails ?? [];
      const thumbnailUrl =
        thumbnails[thumbnails.length - 1]?.url ?? thumbnails[0]?.url ?? "";
      const channelTitle = v.ownerText?.runs?.map((r) => r.text).join("") ?? "";
      const publishedAt = v.publishedTimeText?.simpleText ?? "";
      const viewCount =
        v.viewCountText?.simpleText?.replace(/[^0-9]/g, "") ?? null;

      // Quick reject on title or snippet
      if (hasAffiliate(title) || hasAffiliate(snippetDescription)) continue;

      candidates.push({
        videoId: v.videoId,
        title,
        snippetDescription,
        thumbnailUrl,
        channelTitle,
        publishedAt,
        viewCount,
      });

      if (candidates.length >= 15) break;
    }
    if (candidates.length >= 15) break;
  }

  // Fetch full descriptions one at a time — agent-browser drives a single real Chrome
  // tab per session, so these can't run in parallel like the old raw-fetch version did.
  const fullDescriptions: string[] = [];
  for (const c of candidates) {
    fullDescriptions.push(await fetchFullDescription(c.videoId));
  }

  const clean: (Candidate & { description: string; score: number; noLinks: boolean })[] = [];
  for (let i = 0; i < candidates.length; i++) {
    const fullDesc = fullDescriptions[i];
    if (hasAffiliate(fullDesc)) continue;
    const noLinks = !hasCommercialLinks(fullDesc);
    clean.push({
      ...candidates[i],
      description: fullDesc || candidates[i].snippetDescription,
      // Boost score heavily if no commercial links — this video goes first
      score: facelessScore(candidates[i].title) + (noLinks ? 10 : 0),
      noLinks,
    });
  }

  clean.sort((a, b) => b.score - a.score);
  return clean.slice(0, 5);
}

export async function POST(req: NextRequest) {
  try {
    const { products }: { products: string[] } = await req.json();

    if (!products || products.length === 0) {
      return NextResponse.json({ error: "No products provided" }, { status: 400 });
    }

    const results = [];

    for (const productName of products) {
      const trimmed = productName.trim();
      if (!trimmed) continue;

      const existing = await prisma.productSearch.findFirst({
        where: {
          productName: trimmed,
          createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
        include: { videos: true },
      });

      if (existing) {
        results.push(existing);
        continue;
      }

      const videos = await searchYoutube(trimmed);

      const productSearch = await prisma.productSearch.create({
        data: {
          productName: trimmed,
          videos: {
            create: videos.map((v) => ({
              videoId: v.videoId,
              title: v.title,
              description: v.description.slice(0, 2000),
              thumbnailUrl: v.thumbnailUrl,
              channelTitle: v.channelTitle,
              publishedAt: v.publishedAt,
              viewCount: v.viewCount,
              hasAffiliate: false,
            })),
          },
        },
        include: { videos: true },
      });

      results.push(productSearch);

      await new Promise((r) => setTimeout(r, 400));
    }

    return NextResponse.json({ results });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
