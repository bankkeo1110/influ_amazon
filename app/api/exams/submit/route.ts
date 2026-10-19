import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { gradeAttempt } from "@/lib/examGrading";

export async function POST(req: NextRequest) {
  try {
    const { attemptId, answers }: { attemptId?: string; answers?: Record<string, string> } =
      await req.json();

    if (!attemptId || !answers) {
      return NextResponse.json({ error: "Missing attemptId or answers" }, { status: 400 });
    }

    const attempt = await prisma.examAttempt.findUnique({
      where: { id: attemptId },
      include: { examSet: { include: { questions: { orderBy: { order: "asc" } } } } },
    });

    if (!attempt) {
      return NextResponse.json({ error: "Attempt not found" }, { status: 404 });
    }
    if (attempt.submittedAt) {
      return NextResponse.json({ error: "This attempt was already submitted" }, { status: 409 });
    }

    const { score, maxScore, perQuestion } = gradeAttempt(attempt.examSet.questions, answers);

    await prisma.examAttempt.update({
      where: { id: attemptId },
      data: { answers, score, submittedAt: new Date() },
    });

    const review = attempt.examSet.questions.map((q) => ({
      id: q.id,
      groupLabel: q.groupLabel,
      prompt: q.prompt,
      points: q.points,
      correctAnswer: q.correctAnswer,
      submitted: answers[q.id] ?? null,
      isCorrect: perQuestion[q.id],
    }));

    return NextResponse.json({
      score,
      maxScore,
      examSetTitle: attempt.examSet.title,
      review,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[exams/submit] failed:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
