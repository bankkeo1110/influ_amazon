import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateExamSets } from "@/lib/examGenerator";

const EXAM_SET_COUNT = 10;

/**
 * Generates and stores EXAM_SET_COUNT exam sets. Idempotent by default — skips if sets
 * already exist. Pass { force: true } to wipe and regenerate (e.g. after tweaking the
 * generator).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const force = body?.force === true;

    const existingCount = await prisma.examSet.count();
    if (existingCount > 0 && !force) {
      return NextResponse.json({
        skipped: true,
        message: `${existingCount} exam set(s) already exist. Pass { "force": true } to regenerate.`,
      });
    }

    if (force) {
      await prisma.examQuestion.deleteMany();
      await prisma.examAttempt.deleteMany();
      await prisma.examSet.deleteMany();
    }

    const sets = generateExamSets(EXAM_SET_COUNT);

    for (const set of sets) {
      await prisma.examSet.create({
        data: {
          title: set.title,
          subject: set.subject,
          grade: set.grade,
          totalPoints: set.totalPoints,
          questions: {
            create: set.questions.map((q) => ({
              order: q.order,
              section: q.section,
              groupLabel: q.groupLabel,
              prompt: q.prompt,
              visual: q.visual ?? undefined,
              answerType: q.answerType,
              options: q.options ?? undefined,
              correctAnswer: q.correctAnswer,
              points: q.points,
            })),
          },
        },
      });
    }

    return NextResponse.json({ created: sets.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[exams/seed] failed:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
