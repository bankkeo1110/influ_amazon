"use client";

import { useState, useEffect, useCallback } from "react";

const ACCENT = "#10B981";

type Visual =
  | { type: "pie"; parts: number; shaded: number }
  | { type: "order_items"; items: string[] }
  | null
  | undefined;

type Option = { key: string; text: string };

type Question = {
  id: string;
  order: number;
  section: "trac_nghiem" | "tu_luan";
  groupLabel: string;
  prompt: string;
  visual: Visual;
  answerType: "mcq" | "number" | "symbol" | "text" | "list";
  options: Option[] | null;
  points: number;
};

type ExamSetMeta = { id: string; title: string; totalPoints: number };

type ReviewItem = {
  id: string;
  groupLabel: string;
  prompt: string;
  points: number;
  correctAnswer: string;
  submitted: string | null;
  isCorrect: boolean;
};

type HistoryItem = {
  id: string;
  examSetTitle: string;
  score: number | null;
  maxScore: number;
  startedAt: string;
  submittedAt: string | null;
};

type Phase = "idle" | "loading" | "in_progress" | "submitting" | "result";

function PieVisual({ parts, shaded }: { parts: number; shaded: number }) {
  const size = 140;
  const r = 60;
  const cx = size / 2;
  const cy = size / 2;

  const slices = Array.from({ length: parts }, (_, i) => {
    const a0 = (i / parts) * Math.PI * 2 - Math.PI / 2;
    const a1 = ((i + 1) / parts) * Math.PI * 2 - Math.PI / 2;
    const x0 = cx + r * Math.cos(a0);
    const y0 = cy + r * Math.sin(a0);
    const x1 = cx + r * Math.cos(a1);
    const y1 = cy + r * Math.sin(a1);
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const d = `M${cx},${cy} L${x0},${y0} A${r},${r} 0 ${large} 1 ${x1},${y1} Z`;
    return { d, filled: i < shaded };
  });

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="mx-auto">
      {slices.map((s, i) => (
        <path
          key={i}
          d={s.d}
          fill={s.filled ? ACCENT : "white"}
          stroke="#9ca3af"
          strokeWidth={1}
        />
      ))}
    </svg>
  );
}

function McqQuestion({
  q,
  value,
  onChange,
}: {
  q: Question;
  value: string | undefined;
  onChange: (v: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 mt-3">
      {(q.options ?? []).map((opt) => (
        <button
          key={opt.key}
          onClick={() => onChange(opt.key)}
          className={`text-left px-3 py-2 rounded-lg border text-sm transition-colors ${
            value === opt.key
              ? "border-transparent text-white"
              : "border-gray-200 text-gray-700 hover:bg-gray-50"
          }`}
          style={value === opt.key ? { background: ACCENT } : undefined}
        >
          <span className="font-semibold mr-1.5">{opt.key}.</span>
          {opt.text}
        </button>
      ))}
    </div>
  );
}

function SymbolQuestion({
  value,
  onChange,
}: {
  value: string | undefined;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex gap-2 mt-2">
      {["<", ">", "="].map((sym) => (
        <button
          key={sym}
          onClick={() => onChange(sym)}
          className={`w-10 h-10 rounded-lg border text-base font-semibold transition-colors ${
            value === sym ? "border-transparent text-white" : "border-gray-200 text-gray-600 hover:bg-gray-50"
          }`}
          style={value === sym ? { background: ACCENT } : undefined}
        >
          {sym}
        </button>
      ))}
    </div>
  );
}

function OrderQuestion({
  items,
  value,
  onChange,
}: {
  items: string[];
  value: string | undefined;
  onChange: (v: string) => void;
}) {
  const picks = (value ?? "").split(", ").filter(Boolean);

  function setPick(pos: number, name: string) {
    const next = [...picks];
    next[pos] = name;
    onChange(next.filter(Boolean).join(", "));
  }

  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {[0, 1, 2].map((pos) => (
        <select
          key={pos}
          value={picks[pos] ?? ""}
          onChange={(e) => setPick(pos, e.target.value)}
          className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm"
        >
          <option value="">{`Thứ ${pos + 1} (nhỏ nhất → lớn nhất)`}</option>
          {items.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      ))}
    </div>
  );
}

function QuestionCard({
  q,
  index,
  value,
  onChange,
}: {
  q: Question;
  index?: number;
  value: string | undefined;
  onChange: (v: string) => void;
}) {
  return (
    <div className="py-3">
      <p className="text-sm text-gray-800 whitespace-pre-line">
        {index != null && <span className="font-semibold">Câu {index}. </span>}
        {q.prompt}
      </p>
      {q.visual?.type === "pie" && <PieVisual parts={q.visual.parts} shaded={q.visual.shaded} />}
      {q.answerType === "mcq" && <McqQuestion q={q} value={value} onChange={onChange} />}
      {q.answerType === "symbol" && <SymbolQuestion value={value} onChange={onChange} />}
      {q.answerType === "list" && q.visual?.type === "order_items" && (
        <OrderQuestion items={q.visual.items} value={value} onChange={onChange} />
      )}
      {(q.answerType === "number" || q.answerType === "text") && (
        <input
          type="text"
          inputMode="decimal"
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Nhập đáp án…"
          className="mt-2 w-40 border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2"
          style={{ "--tw-ring-color": ACCENT } as React.CSSProperties}
        />
      )}
    </div>
  );
}

export default function ExamPage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState("");
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [examSet, setExamSet] = useState<ExamSetMeta | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<{ score: number; maxScore: number; review: ReviewItem[] } | null>(
    null
  );
  const [history, setHistory] = useState<HistoryItem[]>([]);

  const loadHistory = useCallback(async () => {
    const res = await fetch("/api/exams/history");
    const data = await res.json();
    if (data.attempts) setHistory(data.attempts);
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  async function handleStart() {
    setPhase("loading");
    setError("");
    const res = await fetch("/api/exams/start", { method: "POST" });
    const data = await res.json();
    if (data.error) {
      setError(data.error);
      setPhase("idle");
      return;
    }
    setAttemptId(data.attemptId);
    setExamSet(data.examSet);
    setQuestions(data.questions);
    setAnswers({});
    setResult(null);
    setPhase("in_progress");
  }

  async function handleSubmit() {
    if (!attemptId) return;
    setPhase("submitting");
    const res = await fetch("/api/exams/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ attemptId, answers }),
    });
    const data = await res.json();
    if (data.error) {
      setError(data.error);
      setPhase("in_progress");
      return;
    }
    setResult({ score: data.score, maxScore: data.maxScore, review: data.review });
    setPhase("result");
    await loadHistory();
  }

  const mcQuestions = questions.filter((q) => q.section === "trac_nghiem");
  const tuLuanQuestions = questions.filter((q) => q.section === "tu_luan");
  const tuLuanGroups: { label: string; items: Question[] }[] = [];
  for (const q of tuLuanQuestions) {
    const last = tuLuanGroups[tuLuanGroups.length - 1];
    if (last && last.label === q.groupLabel) last.items.push(q);
    else tuLuanGroups.push({ label: q.groupLabel, items: [q] });
  }

  const answeredCount = questions.filter((q) => (answers[q.id] ?? "").trim() !== "").length;

  return (
    <div className="min-h-screen px-6 py-8 max-w-[900px] mx-auto">
      <div className="mb-7">
        <h1 className="text-[26px] font-bold text-gray-900 tracking-tight">Thi giữa kì — Toán lớp 5</h1>
        <p className="text-gray-400 text-sm mt-1">
          Mỗi lượt thi sẽ chọn ngẫu nhiên 1 trong 10 bộ đề. Làm xong bấm Nộp bài để chấm điểm ngay.
        </p>
      </div>

      {phase === "idle" && (
        <>
          <div className="bg-white rounded-2xl p-6 mb-5 shadow-sm border border-black/5 text-center">
            <button
              onClick={handleStart}
              className="text-white px-6 py-3 rounded-xl text-sm font-semibold transition-opacity"
              style={{ background: ACCENT }}
            >
              Bắt đầu thi
            </button>
            {error && <p className="text-sm text-red-500 mt-3">{error}</p>}
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-black/5 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-800 text-sm">
                Lịch sử làm bài <span className="text-gray-400 font-normal">{history.length}</span>
              </h2>
            </div>
            {history.length === 0 ? (
              <div className="p-10 text-center text-gray-300 text-sm">Chưa có lượt thi nào.</div>
            ) : (
              <table className="w-full text-sm">
                <tbody>
                  {history.map((h) => (
                    <tr key={h.id} className="border-b border-gray-50 last:border-b-0">
                      <td className="px-6 py-3 text-gray-700">{h.examSetTitle}</td>
                      <td className="px-4 py-3 text-gray-400 text-xs">
                        {h.submittedAt ? new Date(h.submittedAt).toLocaleString() : "—"}
                      </td>
                      <td className="px-6 py-3 text-right font-semibold" style={{ color: ACCENT }}>
                        {h.score != null ? `${h.score} / ${h.maxScore}` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {phase === "loading" && (
        <div className="bg-white rounded-2xl p-10 text-center text-gray-400 text-sm shadow-sm border border-black/5">
          Đang tải đề…
        </div>
      )}

      {(phase === "in_progress" || phase === "submitting") && examSet && (
        <div className="bg-white rounded-2xl shadow-sm border border-black/5 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-10">
            <h2 className="font-semibold text-gray-800 text-sm">{examSet.title}</h2>
            <span className="text-xs text-gray-400">
              Đã trả lời {answeredCount}/{questions.length}
            </span>
          </div>

          <div className="px-6 py-4">
            <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-1">
              I. Phần trắc nghiệm (4 điểm)
            </h3>
            <div className="divide-y divide-gray-50">
              {mcQuestions.map((q, i) => (
                <QuestionCard
                  key={q.id}
                  q={q}
                  index={i + 1}
                  value={answers[q.id]}
                  onChange={(v) => setAnswers((a) => ({ ...a, [q.id]: v }))}
                />
              ))}
            </div>

            <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400 mt-6 mb-1">
              II. Phần tự luận (6 điểm)
            </h3>
            <div className="space-y-4">
              {tuLuanGroups.map((group) => (
                <div key={group.label} className="border border-gray-100 rounded-xl px-4">
                  <p className="text-xs font-bold text-gray-500 pt-3">{group.label}</p>
                  <div className="divide-y divide-gray-50">
                    {group.items.map((q) => (
                      <QuestionCard
                        key={q.id}
                        q={q}
                        value={answers[q.id]}
                        onChange={(v) => setAnswers((a) => ({ ...a, [q.id]: v }))}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="px-6 py-4 border-t border-gray-100 flex items-center gap-3">
            <button
              onClick={handleSubmit}
              disabled={phase === "submitting"}
              className="text-white px-6 py-2.5 rounded-xl text-sm font-semibold transition-opacity disabled:opacity-50"
              style={{ background: ACCENT }}
            >
              {phase === "submitting" ? "Đang chấm…" : "Nộp bài"}
            </button>
            {error && <span className="text-sm text-red-500">{error}</span>}
          </div>
        </div>
      )}

      {phase === "result" && result && (
        <div className="bg-white rounded-2xl shadow-sm border border-black/5 overflow-hidden">
          <div className="px-6 py-6 border-b border-gray-100 text-center">
            <p className="text-sm text-gray-400">Điểm của bạn</p>
            <p className="text-4xl font-bold mt-1" style={{ color: ACCENT }}>
              {result.score} <span className="text-gray-300 text-xl">/ {result.maxScore}</span>
            </p>
          </div>
          <div className="divide-y divide-gray-50">
            {result.review.map((r) => (
              <div key={r.id} className="px-6 py-3">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm text-gray-700 whitespace-pre-line">{r.prompt}</p>
                  <span
                    className={`shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full ${
                      r.isCorrect ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-500"
                    }`}
                  >
                    {r.isCorrect ? "Đúng" : "Sai"} · {r.points}đ
                  </span>
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  Bạn trả lời: <span className="font-medium text-gray-600">{r.submitted || "(bỏ trống)"}</span>
                  {!r.isCorrect && (
                    <>
                      {" "}
                      — Đáp án đúng: <span className="font-medium text-gray-600">{r.correctAnswer}</span>
                    </>
                  )}
                </p>
              </div>
            ))}
          </div>
          <div className="px-6 py-4 border-t border-gray-100">
            <button
              onClick={() => setPhase("idle")}
              className="text-white px-6 py-2.5 rounded-xl text-sm font-semibold"
              style={{ background: ACCENT }}
            >
              Về trang chính
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
