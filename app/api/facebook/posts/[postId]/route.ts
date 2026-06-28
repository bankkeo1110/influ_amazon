import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";
import { getSession } from "@/lib/session";

const BASE = "https://graph.facebook.com/v19.0";

// DELETE /api/facebook/posts/[postId] — cancel a scheduled post
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { postId: string } }
) {
  const session = await getSession();
  if (!session.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const post = await prisma.facebookPost.findFirst({
    where: { id: params.postId, page: { userId: session.userId } },
    include: { page: true },
  });

  if (!post) return NextResponse.json({ error: "Post not found" }, { status: 404 });
  if (post.status !== "scheduled") {
    return NextResponse.json({ error: "Only scheduled posts can be cancelled" }, { status: 400 });
  }

  if (post.fbPostId) {
    const pageToken = decrypt(post.page.accessToken);
    // Per Graph API: to delete a scheduled post, DELETE /{post_id}
    const fbRes = await fetch(`${BASE}/${post.fbPostId}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ access_token: pageToken }).toString(),
    });
    const fbData = await fbRes.json();
    if (fbData.error && fbData.error.code !== 100) {
      return NextResponse.json({ error: fbData.error.message }, { status: 400 });
    }
  }

  await prisma.facebookPost.update({
    where: { id: params.postId },
    data: { status: "cancelled", updatedAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}

// PATCH /api/facebook/posts/[postId] — reschedule a scheduled post
export async function PATCH(
  req: NextRequest,
  { params }: { params: { postId: string } }
) {
  const session = await getSession();
  if (!session.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { scheduledTime, message } = await req.json() as {
    scheduledTime?: string;
    message?: string;
  };

  const post = await prisma.facebookPost.findFirst({
    where: { id: params.postId, page: { userId: session.userId } },
    include: { page: true },
  });

  if (!post) return NextResponse.json({ error: "Post not found" }, { status: 404 });
  if (post.status !== "scheduled") {
    return NextResponse.json({ error: "Only scheduled posts can be edited" }, { status: 400 });
  }

  if (post.fbPostId) {
    const pageToken = decrypt(post.page.accessToken);
    const formData: Record<string, string> = { access_token: pageToken };
    if (message) formData.message = message;
    if (scheduledTime) {
      formData.scheduled_publish_time = String(
        Math.floor(new Date(scheduledTime).getTime() / 1000)
      );
    }
    const fbRes = await fetch(`${BASE}/${post.fbPostId}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(formData).toString(),
    });
    const fbData = await fbRes.json();
    if (fbData.error) {
      return NextResponse.json({ error: fbData.error.message }, { status: 400 });
    }
  }

  const updated = await prisma.facebookPost.update({
    where: { id: params.postId },
    data: {
      message: message ?? post.message,
      scheduledTime: scheduledTime ? new Date(scheduledTime) : post.scheduledTime,
      updatedAt: new Date(),
    },
  });

  return NextResponse.json({ ok: true, post: updated });
}
