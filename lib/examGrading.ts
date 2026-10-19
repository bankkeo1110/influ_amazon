// Shared grading logic between /api/exams/submit (scores a real attempt) and nothing
// else yet, but kept separate from the route so it's easy to unit-test in isolation.

export type GradableQuestion = {
  id: string;
  answerType: string; // "mcq" | "number" | "symbol" | "text" | "list"
  correctAnswer: string;
  points: number;
};

function normalizeNumber(raw: string): number | null {
  const cleaned = raw.trim().replace(/\s+/g, "").replace(",", ".");
  if (cleaned === "") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function normalizeText(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, " ");
}

export function isAnswerCorrect(question: GradableQuestion, submitted: string | undefined): boolean {
  if (submitted == null) return false;
  const expected = question.correctAnswer;

  switch (question.answerType) {
    case "mcq":
      return normalizeText(submitted) === normalizeText(expected);

    case "symbol": {
      const map: Record<string, string> = { "<": "<", ">": ">", "=": "=" };
      const s = map[submitted.trim()] ?? submitted.trim();
      return s === expected.trim();
    }

    case "number": {
      const a = normalizeNumber(submitted);
      const b = normalizeNumber(expected);
      if (a === null || b === null) return false;
      return Math.abs(a - b) < 0.005;
    }

    case "list": {
      const a = submitted.split(",").map((s) => normalizeText(s)).filter(Boolean);
      const b = expected.split(",").map((s) => normalizeText(s)).filter(Boolean);
      if (a.length !== b.length) return false;
      return a.every((v, i) => v === b[i]);
    }

    case "text":
    default:
      return normalizeText(submitted) === normalizeText(expected);
  }
}

export function gradeAttempt(
  questions: GradableQuestion[],
  answers: Record<string, string>
): { score: number; maxScore: number; perQuestion: Record<string, boolean> } {
  let score = 0;
  let maxScore = 0;
  const perQuestion: Record<string, boolean> = {};

  for (const q of questions) {
    maxScore += q.points;
    const correct = isAnswerCorrect(q, answers[q.id]);
    perQuestion[q.id] = correct;
    if (correct) score += q.points;
  }

  return {
    score: Math.round(score * 100) / 100,
    maxScore: Math.round(maxScore * 100) / 100,
    perQuestion,
  };
}
