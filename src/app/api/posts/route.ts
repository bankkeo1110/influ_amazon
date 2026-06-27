import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type");
  const area = searchParams.get("area");
  const skillLevel = searchParams.get("skillLevel");
  const q = searchParams.get("q");

  const where: Record<string, unknown> = { status: { not: "CLOSED" } };
  if (type && type !== "ALL") where.type = type;
  if (area && area !== "ALL") where.area = area;
  if (skillLevel && skillLevel !== "ALL") where.skillLevel = skillLevel;
  if (q) {
    where.OR = [
      { title: { contains: q } },
      { location: { contains: q } },
      { notes: { contains: q } },
    ];
  }

  const posts = await prisma.post.findMany({
    where,
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(posts);
}

export async function POST(req: NextRequest) {
  const body = await req.json();

  const required = ["type", "title", "location", "date", "time", "contactName", "contactPhone"];
  for (const field of required) {
    if (!body[field] || String(body[field]).trim() === "") {
      return NextResponse.json({ error: `Thiếu thông tin: ${field}` }, { status: 400 });
    }
  }

  try {
    const post = await prisma.post.create({
      data: {
        type: body.type,
        title: body.title,
        area: body.area || null,
        location: body.location,
        date: body.date,
        time: body.time,
        skillLevel: body.skillLevel || "ANY",
        playersNeeded: Number(body.playersNeeded) || 1,
        playersCurrent: Number(body.playersCurrent) || 0,
        pricePerHour: body.pricePerHour ? Number(body.pricePerHour) : null,
        contactName: body.contactName,
        contactPhone: body.contactPhone,
        notes: body.notes || null,
        sourceUrl: body.sourceUrl || null,
      },
    });
    return NextResponse.json(post, { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Không thể tạo bài đăng." }, { status: 500 });
  }
}
