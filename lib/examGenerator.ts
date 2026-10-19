// Generates grade-5 "midterm" math exam sets matching the structure of the reference
// exam: 8 multiple-choice questions (0.5đ each = 4đ) + a tự luận section (6đ) split
// into Câu 1 (tính toán, 2đ), Câu 2 (đổi/so sánh đơn vị đo, 1đ), Câu 3 (bảng thống kê,
// 1đ), Câu 4 (bài toán diện tích, 2đ).
//
// Every correct answer here is *computed*, never hand-typed, specifically so a wrong
// value can't slip in from an arithmetic slip while authoring content for a kid's exam.

export type ExamQuestionInput = {
  order: number;
  section: "trac_nghiem" | "tu_luan";
  groupLabel: string;
  prompt: string;
  visual?:
    | { type: "pie"; parts: number; shaded: number }
    | { type: "order_items"; items: string[] }
    | null;
  answerType: "mcq" | "number" | "symbol" | "text" | "list";
  options?: { key: string; text: string }[] | null;
  correctAnswer: string;
  points: number;
};

export type GeneratedExamSet = {
  title: string;
  subject: string;
  grade: number;
  totalPoints: number;
  questions: ExamQuestionInput[];
};

// ── Small helpers ───────────────────────────────────────────────────────────────

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick<T>(arr: T[]): T {
  return arr[randInt(0, arr.length - 1)];
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randInt(0, i);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Vietnamese-style decimal formatting: fixed decimal places, comma separator. */
function vn(n: number, decimals: number): string {
  return n.toFixed(decimals).replace(".", ",");
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

function simplifyFraction(num: number, den: number): [number, number] {
  const g = gcd(num, den) || 1;
  return [num / g, den / g];
}

function cmpSymbol(a: number, b: number): "<" | ">" | "=" {
  if (a < b) return "<";
  if (a > b) return ">";
  return "=";
}

const MC_KEYS = ["A", "B", "C", "D"];

/** Builds a 4-option MCQ from a correct value plus candidate distractors (deduped). */
function buildMcq(
  correctText: string,
  distractorPool: string[]
): { options: { key: string; text: string }[]; correctAnswer: string } {
  const unique: string[] = [];
  for (const d of distractorPool) {
    if (d !== correctText && !unique.includes(d) && unique.length < 3) unique.push(d);
  }
  // Fallback filler in the (rare) case the pool didn't yield 3 distinct distractors.
  let filler = 1;
  while (unique.length < 3) {
    const candidate = `${correctText}_${filler}`; // never collides, never shown normally
    unique.push(candidate);
    filler++;
  }
  const shuffled = shuffle([correctText, ...unique]);
  const options = shuffled.map((text, i) => ({ key: MC_KEYS[i], text }));
  const correctAnswer = options.find((o) => o.text === correctText)!.key;
  return { options, correctAnswer };
}

// ── Part I — Trắc nghiệm (8 câu × 0.5đ) ──────────────────────────────────────────

function genMC1(order: number): ExamQuestionInput {
  const parts = pick([6, 8, 10, 12]);
  const shaded = randInt(2, parts - 2);
  const correctText = `${shaded}/${parts}`;
  const { options, correctAnswer } = buildMcq(correctText, [
    `${parts - shaded}/${parts}`,
    `${shaded}/${parts + pick([1, 2, 3])}`,
    `${parts}/${shaded}`,
    `${shaded + 1}/${parts}`,
  ]);
  return {
    order,
    section: "trac_nghiem",
    groupLabel: "Câu 1",
    prompt: "Phân số chỉ số phần đã tô màu trong hình vẽ dưới đây là.",
    visual: { type: "pie", parts, shaded },
    answerType: "mcq",
    options,
    correctAnswer,
    points: 0.5,
  };
}

function genMC2(order: number): ExamQuestionInput {
  const vals = new Set<number>();
  while (vals.size < 4) vals.add(Number((Math.random() * 9 + 0.1).toFixed(2)));
  const arr = Array.from(vals);
  const max = Math.max(...arr);
  const options = shuffle(arr).map((v, i) => ({ key: MC_KEYS[i], text: vn(v, 2) }));
  const correctAnswer = options.find((o) => Number(o.text.replace(",", ".")) === max)!.key;
  return {
    order,
    section: "trac_nghiem",
    groupLabel: "Câu 2",
    prompt: "Trong các số thập phân sau, số thập phân nào lớn nhất?",
    answerType: "mcq",
    options,
    correctAnswer,
    points: 0.5,
  };
}

function genMC3(order: number): ExamQuestionInput {
  const tens = randInt(1, 9);
  const hundredths = randInt(1, 99);
  const value = tens * 10 + hundredths / 100;
  const correctText = vn(value, 2);
  const { options, correctAnswer } = buildMcq(correctText, [
    vn(value / 10, 2), // misreads "chục" as units
    vn(tens * 10 + hundredths / 10, 2), // confuses phần trăm with phần mười
    vn(value * 10, 1), // shifts a whole place value
  ]);
  return {
    order,
    section: "trac_nghiem",
    groupLabel: "Câu 3",
    prompt: `Số thập phân gồm ${tens} chục, ${hundredths} phần trăm là.`,
    answerType: "mcq",
    options,
    correctAnswer,
    points: 0.5,
  };
}

function genMC4(order: number): ExamQuestionInput {
  const km2 = randInt(10, 99);
  const ha = randInt(1, 99);
  const correctValue = km2 * 100 + ha;
  const correctText = String(correctValue);
  const { options, correctAnswer } = buildMcq(correctText, [
    vn(km2 + ha / 10, 1),
    String(Number(`${km2}${String(ha).padStart(2, "0")}0`)),
    vn(km2 + ha / 1000, 3),
  ]);
  return {
    order,
    section: "trac_nghiem",
    groupLabel: "Câu 4",
    prompt: `Số thích hợp điền vào chỗ chấm là.\n${km2} km² ${ha} ha = .......... ha.`,
    answerType: "mcq",
    options,
    correctAnswer,
    points: 0.5,
  };
}

function genMC5(order: number): ExamQuestionInput {
  const decimalDenoms = [10, 100, 1000];
  const decFracs = decimalDenoms.map((d) => `${randInt(1, d - 1)}/${d}`);
  const nonDecimalDenom = pick([3, 6, 7, 9, 11, 13]);
  const correctText = `${randInt(1, nonDecimalDenom - 1)}/${nonDecimalDenom}`;
  const { options, correctAnswer } = buildMcq(correctText, decFracs);
  return {
    order,
    section: "trac_nghiem",
    groupLabel: "Câu 5",
    prompt: "Phân số nào dưới đây không phải phân số thập phân?",
    answerType: "mcq",
    options,
    correctAnswer,
    points: 0.5,
  };
}

function genMC6(order: number): ExamQuestionInput {
  const proper = () => {
    const den = randInt(3, 9);
    const num = randInt(1, den - 1);
    return `${num}/${den}`;
  };
  const impDen = randInt(2, 6);
  const impNum = impDen + randInt(1, 4);
  const correctText = `${impNum}/${impDen}`;
  const { options, correctAnswer } = buildMcq(correctText, [proper(), proper(), proper()]);
  return {
    order,
    section: "trac_nghiem",
    groupLabel: "Câu 6",
    prompt: "Phân số nào dưới đây lớn hơn 1?",
    answerType: "mcq",
    options,
    correctAnswer,
    points: 0.5,
  };
}

function genMC7(order: number): ExamQuestionInput {
  const tenThousands = randInt(1, 9);
  const thousands = randInt(0, 9);
  const hundreds = randInt(1, 9);
  const correctValue = tenThousands * 10000 + thousands * 1000 + hundreds * 100;
  const correctText = String(correctValue);
  const { options, correctAnswer } = buildMcq(correctText, [
    String(correctValue / 10),
    String(correctValue * 10),
    String(tenThousands * 10000 + hundreds * 1000 + thousands * 100),
  ]);
  return {
    order,
    section: "trac_nghiem",
    groupLabel: "Câu 7",
    prompt: `Số gồm ${tenThousands} chục nghìn, ${thousands} nghìn, ${hundreds} trăm được viết là.`,
    answerType: "mcq",
    options,
    correctAnswer,
    points: 0.5,
  };
}

/** A proper fraction (num ≠ den) for a length/width measurement — num === den would
 * print as something like "3/3 m", a technically-valid but odd way to say "1 m". */
function properFraction(): { num: number; den: number } {
  const den = randInt(2, 9);
  let num = randInt(2, 9);
  if (num === den) num = num === 9 ? num - 1 : num + 1;
  return { num, den };
}

function genMC8(order: number): ExamQuestionInput {
  const len = properFraction();
  const wid = properFraction();
  const [cNum, cDen] = simplifyFraction(len.num * wid.num, len.den * wid.den * 3);
  const correctText = `${cNum}/${cDen}`;
  const [wholeNum, wholeDen] = simplifyFraction(len.num * wid.num, len.den * wid.den);
  const [halfNum, halfDen] = simplifyFraction(len.num * wid.num, len.den * wid.den * 2);
  const { options, correctAnswer } = buildMcq(correctText, [
    `${wholeNum}/${wholeDen}`, // forgot to split into 3
    `${halfNum}/${halfDen}`, // split into 2 instead of 3
    `${cNum}/${cDen * 3}`, // over-divided
  ]);
  return {
    order,
    section: "trac_nghiem",
    groupLabel: "Câu 8",
    prompt: `Một miếng bìa hình chữ nhật có chiều dài ${len.num}/${len.den} m, chiều rộng ${wid.num}/${wid.den} m. Người ta chia miếng bìa thành 3 phần bằng nhau. Vậy diện tích của mỗi miếng bìa đó là:`,
    answerType: "mcq",
    options,
    correctAnswer,
    points: 0.5,
  };
}

// ── Part II — Tự luận (6đ) ────────────────────────────────────────────────────────

function genCau1a(startOrder: number): ExamQuestionInput[] {
  const a1 = randInt(1000, 9000);
  const a2 = randInt(1000, 9000);

  const b1 = randInt(5000, 9999);
  const b2 = randInt(1000, b1 - 1);

  const c1 = randInt(100, 999);
  const c2 = randInt(11, 99);

  const divisor = randInt(11, 45);
  const quotient = randInt(20, 90);
  const dividend = divisor * quotient;

  const items: { prompt: string; correctAnswer: string }[] = [
    { prompt: `${a1} + ${a2}`, correctAnswer: String(a1 + a2) },
    { prompt: `${b1} − ${b2}`, correctAnswer: String(b1 - b2) },
    { prompt: `${c1} × ${c2}`, correctAnswer: String(c1 * c2) },
    { prompt: `${dividend} : ${divisor}`, correctAnswer: String(quotient) },
  ];

  return items.map((it, i) => ({
    order: startOrder + i,
    section: "tu_luan",
    groupLabel: "Câu 1a",
    prompt: `Đặt tính rồi tính: ${it.prompt}`,
    answerType: "number",
    correctAnswer: it.correctAnswer,
    points: 0.25,
  }));
}

function genCau1b(startOrder: number): ExamQuestionInput[] {
  const a = randInt(1000, 9000);
  const b = randInt(50, 300);
  const c = randInt(2, 9);
  const v1 = a + b * c;

  const g = randInt(2, 9);
  const efQuotient = randInt(50, 300);
  const ef = g * efQuotient;
  const e = randInt(10, ef - 10);
  const f = ef - e;
  const d = efQuotient + randInt(100, 5000);
  const v2 = d - efQuotient;

  return [
    {
      order: startOrder,
      section: "tu_luan",
      groupLabel: "Câu 1b",
      prompt: `Tính giá trị biểu thức: ${a} + ${b} × ${c}`,
      answerType: "number",
      correctAnswer: String(v1),
      points: 0.5,
    },
    {
      order: startOrder + 1,
      section: "tu_luan",
      groupLabel: "Câu 1b",
      prompt: `Tính giá trị biểu thức: ${d} − (${e} + ${f}) : ${g}`,
      answerType: "number",
      correctAnswer: String(v2),
      points: 0.5,
    },
  ];
}

function genCau2a(startOrder: number): ExamQuestionInput[] {
  const m = randInt(1, 9);
  const dm = randInt(1, 9);
  const ml = randInt(1, 9) * 1000 + randInt(0, 99) * 10;
  const km = randInt(1, 9);
  const mOnly = randInt(1, 999);
  const dm2 = randInt(1, 99);
  const cm2 = randInt(1, 99);

  const items = [
    { prompt: `${m} m ${dm} dm = .......... m.`, correctAnswer: vn(m + dm / 10, 1) },
    { prompt: `${ml} ml = .......... l.`, correctAnswer: vn(ml / 1000, 2) },
    { prompt: `${km} km ${mOnly} m = .......... km.`, correctAnswer: vn(km + mOnly / 1000, 3) },
    { prompt: `${dm2} dm² ${cm2} cm² = .......... dm².`, correctAnswer: vn(dm2 + cm2 / 100, 2) },
  ];

  return items.map((it, i) => ({
    order: startOrder + i,
    section: "tu_luan",
    groupLabel: "Câu 2a",
    prompt: it.prompt,
    answerType: "number",
    correctAnswer: it.correctAnswer,
    points: 0.125,
  }));
}

function genCau2b(startOrder: number): ExamQuestionInput[] {
  const kmA = randInt(2, 9);
  const haA = randInt(1, 99);
  const leftHa = kmA * 100 + haA;
  const rightHaA = randInt(Math.max(1, leftHa - 500), leftHa + 500);

  const haB = randInt(1, 9) * 100;
  const kmB = haB / 100 + pick([-1, 0, 1]);
  const rightKm2B = Math.max(1, kmB) * 100;

  const mC = randInt(2, 99);
  const dmC = randInt(1, 99);
  const leftDm = mC * 100 + dmC;
  const rightDmC = randInt(Math.max(1, leftDm - 500), leftDm + 500);

  const kmD = randInt(1, 9);
  const haD = randInt(1, 20) * 100;

  const items = [
    { prompt: `${kmA} km² ${haA} ha ...... ${rightHaA} ha.`, left: leftHa, right: rightHaA },
    { prompt: `${haB} ha ...... ${Math.max(1, kmB)} km².`, left: haB, right: rightKm2B },
    { prompt: `${mC} m² ${dmC} dm² ...... ${rightDmC} dm².`, left: leftDm, right: rightDmC },
    { prompt: `${kmD} km² ...... ${haD} ha.`, left: kmD * 100, right: haD },
  ];

  return items.map((it, i) => ({
    order: startOrder + i,
    section: "tu_luan",
    groupLabel: "Câu 2b",
    prompt: it.prompt,
    answerType: "symbol",
    correctAnswer: cmpSymbol(it.left, it.right),
    points: 0.125,
  }));
}

const PROVINCE_NAMES = [
  "Thừa Thiên Huế",
  "Bắc Ninh",
  "Quảng Ninh",
  "Hà Nam",
  "Nam Định",
  "Thái Bình",
  "Hưng Yên",
  "Vĩnh Phúc",
];

function genCau3(startOrder: number): ExamQuestionInput[] {
  const provinces = shuffle(PROVINCE_NAMES).slice(0, 3);
  const roundedIndex = randInt(0, 2);

  const areas = provinces.map((_, i) =>
    i === roundedIndex
      ? Number((randInt(500, 9000) + Math.random()).toFixed(1))
      : randInt(500, 9000)
  );

  const order = provinces
    .map((name, i) => ({ name, area: areas[i] }))
    .sort((a, b) => a.area - b.area)
    .map((p) => p.name);

  const roundedProvince = provinces[roundedIndex];
  const roundedValue = Math.round(areas[roundedIndex]);

  const tableDesc = provinces
    .map((name, i) => `${name}: ${vn(areas[i], areas[i] % 1 === 0 ? 0 : 1)} km²`)
    .join("; ");

  return [
    {
      order: startOrder,
      section: "tu_luan",
      groupLabel: "Câu 3",
      prompt: `Cho bảng thống kê diện tích sau — ${tableDesc}. Sắp xếp diện tích các tỉnh/thành phố theo thứ tự từ bé đến lớn.`,
      visual: { type: "order_items", items: provinces },
      answerType: "list",
      correctAnswer: order.join(", "),
      points: 0.5,
    },
    {
      order: startOrder + 1,
      section: "tu_luan",
      groupLabel: "Câu 3",
      prompt: `Diện tích của tỉnh/thành phố ${roundedProvince} sau khi làm tròn đến số tự nhiên gần nhất là bao nhiêu km²?`,
      answerType: "number",
      correctAnswer: String(roundedValue),
      points: 0.5,
    },
  ];
}

function genCau4(startOrder: number): ExamQuestionInput[] {
  const fractionChoices = [
    { n: 1, d: 4 },
    { n: 2, d: 5 },
    { n: 3, d: 10 },
    { n: 1, d: 2 },
  ];

  let lenDm = 0;
  let widDm = 0;
  let areaM2 = 0;
  let fraction = fractionChoices[0];

  // Search for dimensions whose area converts cleanly to m² and splits evenly by the
  // chosen fraction — keeps every intermediate number a whole or tidy decimal value.
  for (let attempt = 0; attempt < 500; attempt++) {
    const l = randInt(30, 150);
    const w = randInt(20, 120);
    const area = l * w;
    if (area % 100 !== 0) continue;
    const m2 = area / 100;
    const candidateFraction = pick(fractionChoices);
    if ((m2 * candidateFraction.n) % candidateFraction.d !== 0) continue;
    lenDm = l;
    widDm = w;
    areaM2 = m2;
    fraction = candidateFraction;
    break;
  }
  if (lenDm === 0) {
    // Deterministic fallback — guaranteed to satisfy both constraints.
    lenDm = 80;
    widDm = 50;
    areaM2 = 40;
    fraction = { n: 2, d: 5 };
  }

  const plantAreaM2 = (areaM2 * fraction.n) / fraction.d;
  const density = pick([3, 4, 5]);
  const totalPlants = plantAreaM2 * density;

  return [
    {
      order: startOrder,
      section: "tu_luan",
      groupLabel: "Câu 4",
      prompt: `Một mảnh vườn hình chữ nhật có chiều dài là ${lenDm} dm và chiều rộng ${widDm} dm. Tính diện tích của mảnh vườn hình chữ nhật đó (theo m²).`,
      answerType: "number",
      correctAnswer: String(areaM2),
      points: 1,
    },
    {
      order: startOrder + 1,
      section: "tu_luan",
      groupLabel: "Câu 4",
      prompt: `Người ta dùng ${fraction.n}/${fraction.d} diện tích mảnh vườn trên để trồng hoa. Cứ 1 m² trồng được ${density} cây hoa. Hỏi người ta trồng được bao nhiêu cây hoa trên mảnh vườn đó?`,
      answerType: "number",
      correctAnswer: String(totalPlants),
      points: 1,
    },
  ];
}

// ── Assemble one exam set ───────────────────────────────────────────────────────

export function generateExamSet(title: string): GeneratedExamSet {
  const mcGenerators = [genMC1, genMC2, genMC3, genMC4, genMC5, genMC6, genMC7, genMC8];
  const mcQuestions = mcGenerators.map((gen, i) => gen(i + 1));

  let order = mcQuestions.length + 1;
  const tuLuan: ExamQuestionInput[] = [];

  const cau1a = genCau1a(order);
  order += cau1a.length;
  const cau1b = genCau1b(order);
  order += cau1b.length;
  const cau2a = genCau2a(order);
  order += cau2a.length;
  const cau2b = genCau2b(order);
  order += cau2b.length;
  const cau3 = genCau3(order);
  order += cau3.length;
  const cau4 = genCau4(order);

  tuLuan.push(...cau1a, ...cau1b, ...cau2a, ...cau2b, ...cau3, ...cau4);

  const questions = [...mcQuestions, ...tuLuan];
  const totalPoints = Math.round(questions.reduce((sum, q) => sum + q.points, 0) * 100) / 100;

  return {
    title,
    subject: "Toán",
    grade: 5,
    totalPoints,
    questions,
  };
}

export function generateExamSets(count: number): GeneratedExamSet[] {
  return Array.from({ length: count }, (_, i) => generateExamSet(`Đề ${i + 1}`));
}
