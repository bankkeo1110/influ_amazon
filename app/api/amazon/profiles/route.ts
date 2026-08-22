import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const VALID_STATUSES = [
  "Step 1",
  "Submitted L1",
  "Submitted L2",
  "Submitted L3",
  "Rejected",
  "Approved",
] as const;

type Status = (typeof VALID_STATUSES)[number];

function isStatus(v: unknown): v is Status {
  return typeof v === "string" && (VALID_STATUSES as readonly string[]).includes(v);
}

// GET /api/amazon/profiles
export async function GET() {
  try {
    const rows = await prisma.amazonProfile.findMany({
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json({ rows });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST /api/amazon/profiles  — create one row
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const mail = typeof body.mail === "string" ? body.mail.trim() : "";
    if (!mail) return NextResponse.json({ error: "mail is required" }, { status: 400 });

    const row = await prisma.amazonProfile.create({
      data: {
        mail,
        ip: typeof body.ip === "string" ? body.ip.trim() : "",
        shopUrl: typeof body.shopUrl === "string" ? body.shopUrl.trim() : "",
        status: isStatus(body.status) ? body.status : "Step 1",
      },
    });
    return NextResponse.json({ row }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// PUT /api/amazon/profiles  — update one or many rows
// Body: { updates: Array<{ id, mail?, ip?, shopUrl?, status? }> }
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const updates: { id: string; mail?: string; ip?: string; shopUrl?: string; status?: string }[] =
      Array.isArray(body.updates) ? body.updates : [];

    if (updates.length === 0)
      return NextResponse.json({ error: "No updates provided" }, { status: 400 });

    const results = await Promise.all(
      updates.map(({ id, mail, ip, shopUrl, status }) =>
        prisma.amazonProfile.update({
          where: { id },
          data: {
            ...(mail !== undefined && { mail: mail.trim() }),
            ...(ip !== undefined && { ip: ip.trim() }),
            ...(shopUrl !== undefined && { shopUrl: shopUrl.trim() }),
            ...(status !== undefined && isStatus(status) && { status }),
          },
        })
      )
    );
    return NextResponse.json({ rows: results });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE /api/amazon/profiles?id=<id>  — delete one row
export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
    await prisma.amazonProfile.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
