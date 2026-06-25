import {
  TYPE_LABELS,
  TYPE_COLORS,
  SKILL_LABELS,
  STATUS_LABELS,
  Post,
} from "@/lib/constants";

function timeAgo(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "vừa xong";
  if (mins < 60) return `${mins} phút trước`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.floor(hours / 24);
  return `${days} ngày trước`;
}

export default function PostCard({ post }: { post: Post }) {
  const isPartner = post.type === "FIND_PARTNER";

  return (
    <div className="rounded-xl2 border border-court/10 bg-white p-4 shadow-sm transition hover:shadow-md">
      <div className="mb-2 flex items-center justify-between">
        <span
          className={`rounded-md px-2 py-0.5 text-xs font-medium ${TYPE_COLORS[post.type]}`}
        >
          {TYPE_LABELS[post.type]}
        </span>
        <span className="text-xs text-ink/40">{timeAgo(post.createdAt)}</span>
      </div>

      <h3 className="font-display text-[15px] font-semibold leading-snug text-ink">
        {post.title}
      </h3>

      <div className="mt-2 space-y-1 text-[13px] text-ink/65">
        <p>
          <i className="inline-block w-4">📍</i> {post.location}
          {post.area ? ` · ${post.area}` : ""}
        </p>
        <p>
          <i className="inline-block w-4">🕒</i> {post.date} · {post.time}
        </p>
        {isPartner ? (
          <p>
            <i className="inline-block w-4">👥</i> {post.playersCurrent}/
            {post.playersNeeded} người · Trình độ: {SKILL_LABELS[post.skillLevel]}
          </p>
        ) : (
          post.pricePerHour && (
            <p>
              <i className="inline-block w-4">💰</i>{" "}
              {post.pricePerHour.toLocaleString("vi-VN")}đ/giờ
            </p>
          )
        )}
      </div>

      {post.notes && (
        <p className="mt-2 rounded-lg bg-shuttle-line px-3 py-2 text-[13px] text-ink/70">
          {post.notes}
        </p>
      )}

      <div className="mt-3 flex items-center justify-between border-t border-court/10 pt-3">
        <span className="text-xs text-ink/50">
          {STATUS_LABELS[post.status]}
        </span>
        <a
          href={`tel:${post.contactPhone}`}
          className="rounded-lg bg-court px-3 py-1.5 text-xs font-medium text-white hover:bg-court-dark"
        >
          Liên hệ {post.contactName}
        </a>
      </div>
    </div>
  );
}
