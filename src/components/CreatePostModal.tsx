"use client";

import { useState } from "react";
import { AREAS, SKILL_LABELS } from "@/lib/constants";

export default function CreatePostModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [type, setType] = useState<"FIND_PARTNER" | "COURT">("FIND_PARTNER");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    title: "",
    area: AREAS[0],
    location: "",
    date: "",
    time: "",
    skillLevel: "ANY",
    playersNeeded: 4,
    playersCurrent: 1,
    pricePerHour: "",
    contactName: "",
    contactPhone: "",
    notes: "",
    sourceUrl: "",
  });

  function update<K extends keyof typeof form>(key: K, value: typeof form[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!form.title || !form.location || !form.date || !form.time || !form.contactName || !form.contactPhone) {
      setError("Vui lòng điền đầy đủ thông tin bắt buộc.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, type }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Có lỗi xảy ra.");
      }
      onCreated();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl2 bg-white p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold text-ink">
            Đăng bài mới
          </h2>
          <button
            onClick={onClose}
            className="rounded-full px-2 py-1 text-ink/50 hover:bg-shuttle-line"
            aria-label="Đóng"
          >
            ✕
          </button>
        </div>

        {/* Type toggle */}
        <div className="mb-4 flex gap-2">
          <button
            type="button"
            onClick={() => setType("FIND_PARTNER")}
            className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${
              type === "FIND_PARTNER"
                ? "border-court bg-court-light text-court-dark"
                : "border-court/15 text-ink/60"
            }`}
          >
            Tìm bạn đánh
          </button>
          <button
            type="button"
            onClick={() => setType("COURT")}
            className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${
              type === "COURT"
                ? "border-feather bg-feather/15 text-feather-dark"
                : "border-court/15 text-ink/60"
            }`}
          >
            Sân trống
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-ink/60">
              Tiêu đề *
            </label>
            <input
              className="w-full"
              placeholder={
                type === "FIND_PARTNER"
                  ? "VD: Thiếu 1 nam đánh đôi tối nay"
                  : "VD: 2 sân trống sáng thứ 7"
              }
              value={form.title}
              onChange={(e) => update("title", e.target.value)}
            />
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-ink/60">
                Khu vực
              </label>
              <select
                className="w-full"
                value={form.area}
                onChange={(e) => update("area", e.target.value)}
              >
                {AREAS.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-ink/60">
                Trình độ
              </label>
              <select
                className="w-full"
                value={form.skillLevel}
                onChange={(e) => update("skillLevel", e.target.value)}
              >
                {Object.entries(SKILL_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-ink/60">
              Tên sân / địa điểm *
            </label>
            <input
              className="w-full"
              placeholder="VD: SVĐ Tuyên Sơn"
              value={form.location}
              onChange={(e) => update("location", e.target.value)}
            />
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-ink/60">
                Ngày *
              </label>
              <input
                className="w-full"
                placeholder="Hôm nay / 28/06"
                value={form.date}
                onChange={(e) => update("date", e.target.value)}
              />
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-ink/60">
                Giờ *
              </label>
              <input
                className="w-full"
                placeholder="19:00-21:00"
                value={form.time}
                onChange={(e) => update("time", e.target.value)}
              />
            </div>
          </div>

          {type === "FIND_PARTNER" ? (
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="mb-1 block text-xs font-medium text-ink/60">
                  Số người cần
                </label>
                <input
                  type="number"
                  min={1}
                  className="w-full"
                  value={form.playersNeeded}
                  onChange={(e) =>
                    update("playersNeeded", Number(e.target.value))
                  }
                />
              </div>
              <div className="flex-1">
                <label className="mb-1 block text-xs font-medium text-ink/60">
                  Đã có
                </label>
                <input
                  type="number"
                  min={0}
                  className="w-full"
                  value={form.playersCurrent}
                  onChange={(e) =>
                    update("playersCurrent", Number(e.target.value))
                  }
                />
              </div>
            </div>
          ) : (
            <div>
              <label className="mb-1 block text-xs font-medium text-ink/60">
                Giá / giờ (VNĐ)
              </label>
              <input
                type="number"
                min={0}
                className="w-full"
                placeholder="80000"
                value={form.pricePerHour}
                onChange={(e) => update("pricePerHour", e.target.value)}
              />
            </div>
          )}

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-ink/60">
                Tên liên hệ *
              </label>
              <input
                className="w-full"
                placeholder="Tên của bạn"
                value={form.contactName}
                onChange={(e) => update("contactName", e.target.value)}
              />
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-ink/60">
                Số điện thoại *
              </label>
              <input
                className="w-full"
                placeholder="09xxxxxxxx"
                value={form.contactPhone}
                onChange={(e) => update("contactPhone", e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-ink/60">
              Ghi chú
            </label>
            <textarea
              className="w-full"
              rows={2}
              placeholder="Thông tin thêm..."
              value={form.notes}
              onChange={(e) => update("notes", e.target.value)}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-ink/60">
              Link bài Facebook gốc (nếu lưu từ FB)
            </label>
            <input
              className="w-full"
              placeholder="https://facebook.com/..."
              value={form.sourceUrl}
              onChange={(e) => update("sourceUrl", e.target.value)}
            />
          </div>

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-court py-2.5 text-sm font-medium text-white hover:bg-court-dark disabled:opacity-60"
          >
            {submitting ? "Đang đăng..." : "Đăng bài"}
          </button>
        </form>
      </div>
    </div>
  );
}
