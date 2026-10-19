import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST() {
  try {
    const examSets = await prisma.examSet.findMany({ select: { id: true } });
    if (examSets.length === 0) {
      return NextResponse.json(
        { error: "No exam sets yet — seed them first via POST /api/exams/seed." },
        { status: 404 }
      );
    }

    const chosenId = examSets[Math.floor(Math.random() * examSets.length)].id;
    const examSet = await prisma.examSet.findUniqueOrThrow({
      where: { id: chosenId },
      include: { questions: { orderBy: { order: "asc" } } },
    });

    const attempt = await prisma.examAttempt.create({
      data: { examSetId: examSet.id, maxScore: examSet.totalPoints },
    });

    // Never send correctAnswer to the client before grading.
    const questions = examSet.questions.map(({ correctAnswer: _correctAnswer, ...q }) => q);

    return NextResponse.json({
      attemptId: attempt.id,
      examSet: { id: examSet.id, title: examSet.title, totalPoints: examSet.totalPoints },
      questions,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[exams/start] failed:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
