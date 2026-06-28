import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

// PUT /api/facebook/queue/[id] — update a queue item
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession();
  if (!session.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { message, link, sortOrder } = await req.json() as {
    message?: string;
    link?: string;
    sortOrder?: number;
  };

  const item = await prisma.contentQueueItem.findFirst({
    where: { id: params.id, page: { userId: session.userId } },
  });
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updated = await prisma.contentQueueItem.update({
    where: { id: params.id },
    data: {
      message: message ?? item.message,
      link: link !== undefined ? link : item.link,
      sortOrder: sortOrder ?? item.sortOrder,
      updatedAt: new Date(),
    },
  });

  return NextResponse.json({ ok: true, item: updated });
}

// DELETE /api/facebook/queue/[id] — remove a queue item
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession();
  if (!session.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const item = await prisma.contentQueueItem.findFirst({
    where: { id: params.id, page: { userId: session.userId } },
  });
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.contentQueueItem.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
