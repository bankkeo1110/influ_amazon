import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const INNERTUBE_API_KEY = "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8";
const INNERTUBE_BASE = `https://www.youtube.com/youtubei/v1`;

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

type DescriptionSection = {
  videoPrimaryInfoRenderer?: { title?: { runs?: Run[] } };
  videoSecondaryInfoRenderer?: { description?: { runs?: Run[] } };
};

type InnertubeNextResponse = {
  contents?: {
    twoColumnWatchNextResults?: {
      results?: {
        results?: {
          contents?: DescriptionSection[];
        };
      };
    };
  };
};

async function fetchFullDescription(videoId: string): Promise<string> {
  try {
    const res = await fetch(`${INNERTUBE_BASE}/next?key=${INNERTUBE_API_KEY}`, {
      method: "POST",
      headers: INNERTUBE_HEADERS,
      body: JSON.stringify({ context: INNERTUBE_CONTEXT, videoId }),
    });
    if (!res.ok) return "";
    const data: InnertubeNextResponse = await res.json();
    const contents =
      data?.contents?.twoColumnWatchNextResults?.results?.results?.contents ?? [];
    for (const section of contents) {
      const runs = section?.videoSecondaryInfoRenderer?.description?.runs ?? [];
      if (runs.length > 0) return runs.map((r) => r.text).join("");
    }
    return "";
  } catch {
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
  const res = await fetch(`${INNERTUBE_BASE}/search?key=${INNERTUBE_API_KEY}`, {
    method: "POST",
    headers: INNERTUBE_HEADERS,
    body: JSON.stringify({
      context: INNERTUBE_CONTEXT,
      query: `${query} unboxing review`,
      params: "EgIQAQ%3D%3D",
    }),
  });

  if (!res.ok) throw new Error(`YouTube search failed: ${res.status}`);
  const data: InnertubeSearchResponse = await res.json();

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

  // Fetch full descriptions in parallel then deep-filter
  const fullDescriptions = await Promise.all(
    candidates.map((c) => fetchFullDescription(c.videoId))
  );

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
  return clean.slice(0, 3);
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
