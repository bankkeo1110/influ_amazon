import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const INNERTUBE_API_KEY = "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8";
const INNERTUBE_URL = `https://www.youtube.com/youtubei/v1/search?key=${INNERTUBE_API_KEY}`;

const INNERTUBE_CONTEXT = {
  client: {
    clientName: "WEB",
    clientVersion: "2.20231219.01.00",
    hl: "en",
    gl: "US",
  },
};

const AFFILIATE_KEYWORDS = [
  "amazon.com",
  "amzn.to",
  "amzn.com",
  "affiliate",
  "referral",
  "commission",
  "sponsored",
  "paid link",
  "discount code",
  "promo code",
  "buy here",
  "shop here",
  "bit.ly",
  "geni.us",
  "go.magik",
  "shareasale",
  "clickbank",
];

function hasAffiliateContent(description: string): boolean {
  const lower = description.toLowerCase();
  return AFFILIATE_KEYWORDS.some((kw) => lower.includes(kw));
}

type InnertubeVideoRenderer = {
  videoId?: string;
  title?: { runs?: { text: string }[] };
  descriptionSnippet?: { runs?: { text: string }[] };
  thumbnail?: { thumbnails?: { url: string; width: number; height: number }[] };
  ownerText?: { runs?: { text: string }[] };
  publishedTimeText?: { simpleText?: string };
  viewCountText?: { simpleText?: string };
};

type InnertubeItem = {
  videoRenderer?: InnertubeVideoRenderer;
  itemSectionRenderer?: { contents?: InnertubeItem[] };
};

type InnertubeResponse = {
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

function parseInnertubeResults(data: InnertubeResponse) {
  const items: {
    videoId: string;
    title: string;
    description: string;
    thumbnailUrl: string;
    channelTitle: string;
    publishedAt: string;
    viewCount: string | null;
  }[] = [];

  const contents =
    data?.contents?.twoColumnSearchResultsRenderer?.primaryContents
      ?.sectionListRenderer?.contents ?? [];

  for (const section of contents) {
    const sectionItems: InnertubeItem[] =
      section?.itemSectionRenderer?.contents ?? [];
    for (const item of sectionItems) {
      const v = item?.videoRenderer;
      if (!v?.videoId) continue;

      const title = v.title?.runs?.map((r) => r.text).join("") ?? "";
      const description =
        v.descriptionSnippet?.runs?.map((r) => r.text).join("") ?? "";
      const thumbnails = v.thumbnail?.thumbnails ?? [];
      const thumbnailUrl =
        thumbnails[thumbnails.length - 1]?.url ?? thumbnails[0]?.url ?? "";
      const channelTitle =
        v.ownerText?.runs?.map((r) => r.text).join("") ?? "";
      const publishedAt = v.publishedTimeText?.simpleText ?? "";
      const viewCount =
        v.viewCountText?.simpleText?.replace(/[^0-9]/g, "") ?? null;

      items.push({
        videoId: v.videoId,
        title,
        description,
        thumbnailUrl,
        channelTitle,
        publishedAt,
        viewCount,
      });
    }
  }

  return items;
}

async function searchYoutube(query: string) {
  const res = await fetch(INNERTUBE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "X-YouTube-Client-Name": "1",
      "X-YouTube-Client-Version": "2.20231219.01.00",
      Referer: "https://www.youtube.com/",
      Origin: "https://www.youtube.com",
    },
    body: JSON.stringify({
      context: INNERTUBE_CONTEXT,
      query: `${query} review`,
      params: "EgIQAQ%3D%3D",
    }),
  });

  if (!res.ok) throw new Error(`YouTube search failed: ${res.status}`);
  const data = await res.json();
  return parseInnertubeResults(data);
}

export async function POST(req: NextRequest) {
  try {
    const { products }: { products: string[] } = await req.json();

    if (!products || products.length === 0) {
      return NextResponse.json(
        { error: "No products provided" },
        { status: 400 }
      );
    }

    const results = [];

    for (const productName of products) {
      const trimmed = productName.trim();
      if (!trimmed) continue;

      // Return cached result if searched in last 24h
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

      const cleanVideos = videos
        .filter((v) => !hasAffiliateContent(v.description))
        .slice(0, 2);

      const productSearch = await prisma.productSearch.create({
        data: {
          productName: trimmed,
          videos: {
            create: cleanVideos.map((v) => ({
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
