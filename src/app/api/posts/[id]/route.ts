import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const body = await req.json();

  try {
    const post = await prisma.post.update({
      where: { id: params.id },
      data: {
        ...(body.status && { status: body.status }),
        ...(body.playersCurrent !== undefined && {
          playersCurrent: Number(body.playersCurrent),
        }),
      },
    });
    return NextResponse.json(post);
  } catch (err: any) {
    const notFound = err?.code === "P2025";
    return NextResponse.json(
      { error: notFound ? "Không tìm thấy bài đăng." : "Lỗi máy chủ." },
      { status: notFound ? 404 : 500 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await prisma.post.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    const notFound = err?.code === "P2025";
    return NextResponse.json(
      { error: notFound ? "Không tìm thấy bài đăng." : "Lỗi máy chủ." },
      { status: notFound ? 404 : 500 }
    );
  }
}
