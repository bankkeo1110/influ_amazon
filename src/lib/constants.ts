export const TYPE_LABELS: Record<string, string> = {
  FIND_PARTNER: "Tìm bạn đánh",
  COURT: "Sân trống",
};

export const TYPE_COLORS: Record<string, string> = {
  FIND_PARTNER: "bg-court-light text-court-dark",
  COURT: "bg-feather/15 text-feather-dark",
};

export const SKILL_LABELS: Record<string, string> = {
  Y: "Yếu",
  TBY: "TB yếu",
  TB: "Trung bình",
  TBK: "TB khá",
  K: "Khá",
  T: "Tốt",
  ANY: "Mọi trình độ",
};

export const STATUS_LABELS: Record<string, string> = {
  OPEN: "Còn nhận",
  FILLED: "Đã đủ người",
  CLOSED: "Đã đóng",
};

export const AREAS = [
  "Hải Châu",
  "Thanh Khê",
  "Sơn Trà",
  "Liên Chiểu",
  "Ngũ Hành Sơn",
  "Cẩm Lệ",
  "Hòa Vang",
];

export type Post = {
  id: string;
  type: "FIND_PARTNER" | "COURT";
  title: string;
  area: string | null;
  location: string;
  date: string;
  time: string;
  skillLevel: keyof typeof SKILL_LABELS;
  playersNeeded: number;
  playersCurrent: number;
  pricePerHour: number | null;
  contactName: string;
  contactPhone: string;
  notes: string | null;
  sourceUrl: string | null;
  status: "OPEN" | "FILLED" | "CLOSED";
  createdAt: string;
  updatedAt: string;
};
