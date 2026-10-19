import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const attempts = await prisma.examAttempt.findMany({
      where: { submittedAt: { not: null } },
      orderBy: { submittedAt: "desc" },
      include: { examSet: { select: { title: true, totalPoints: true } } },
    });

    return NextResponse.json({
      attempts: attempts.map((a) => ({
        id: a.id,
        examSetTitle: a.examSet.title,
        score: a.score,
        maxScore: a.maxScore,
        startedAt: a.startedAt,
        submittedAt: a.submittedAt,
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
