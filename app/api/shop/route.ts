import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/app/generated/prisma";

export const dynamic = "force-dynamic";

const PAGE_SIZES = [5, 10, 20, 50, 100];
const SORTABLE = ["name", "handle", "videoCount", "lastCrawledAt"] as const;
type SortField = (typeof SORTABLE)[number];

function isSortField(v: string): v is SortField {
  return (SORTABLE as readonly string[]).includes(v);
}

export async function GET(req: NextRequest) {
  try {
    const params = req.nextUrl.searchParams;

    const q = (params.get("q") ?? "").trim();
    const requestedSize = Number(params.get("pageSize"));
    const pageSize = PAGE_SIZES.includes(requestedSize) ? requestedSize : 10;
    const page = Math.max(1, Number(params.get("page")) || 1);

    const sortParam = params.get("sort") ?? "videoCount";
    const sort: SortField = isSortField(sortParam) ? sortParam : "videoCount";
    const dir: Prisma.SortOrder = params.get("dir") === "asc" ? "asc" : "desc";

    const where: Prisma.AmazonShopWhereInput = q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { handle: { contains: q, mode: "insensitive" } },
            { url: { contains: q, mode: "insensitive" } },
          ],
        }
      : {};

    const total = await prisma.amazonShop.count({ where });
    const pageCount = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(page, pageCount);

    const rows = await prisma.amazonShop.findMany({
      where,
      orderBy: [{ [sort]: dir }, { handle: "asc" }],
      skip: (safePage - 1) * pageSize,
      take: pageSize,
    });

    return NextResponse.json({ rows, total, page: safePage, pageSize, pageCount, sort, dir });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (id) {
      await prisma.amazonShop.delete({ where: { id } });
    } else {
      await prisma.amazonShop.deleteMany();
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
