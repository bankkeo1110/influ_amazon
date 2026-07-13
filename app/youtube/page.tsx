"use client";
/* eslint-disable @next/next/no-img-element */

import { useState, useEffect, useCallback, useMemo } from "react";

const ACCENT = "#E05540";

const CAT_COLORS = {
  price: {
    bg: "bg-amber-100",
    text: "text-amber-800",
    pillBg: "bg-amber-50",
    pillBorder: "border-amber-200",
    pillText: "text-amber-700",
    label: "Price",
    emoji: "💰",
  },
  personal: {
    bg: "bg-blue-100",
    text: "text-blue-800",
    pillBg: "bg-blue-50",
    pillBorder: "border-blue-200",
    pillText: "text-blue-700",
    label: "Personal info",
    emoji: "👤",
  },
  subscribe: {
    bg: "bg-green-100",
    text: "text-green-800",
    pillBg: "bg-green-50",
    pillBorder: "border-green-200",
    pillText: "text-green-700",
    label: "Subscribe",
    emoji: "🔔",
  },
} as const;

type Category = keyof typeof CAT_COLORS;

type YoutubeVideo = {
  id: string;
  videoId: string;
  title: string;
  description: string;
  thumbnailUrl: string;
  channelTitle: string;
  publishedAt: string;
  viewCount: string | null;
};

type ProductSearch = {
  id: string;
  productName: string;
  createdAt: string;
  videos: YoutubeVideo[];
};

type TranscriptSegment = {
  text: string;
  startMs: number;
  startFormatted: string;
  categories: string[];
};

type TranscriptSummaryItem = { count: number; firstAt: string } | null;

type TranscriptData = {
  segments: TranscriptSegment[];
  summary: {
    price: TranscriptSummaryItem;
    personal: TranscriptSummaryItem;
    subscribe: TranscriptSummaryItem;
  };
};

function IconSearch() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    >
      <circle cx="6" cy="6" r="4.5" />
      <path d="M9.5 9.5 13 13" />
    </svg>
  );
}

function TranscriptModal({
  video,
  data,
  loading,
  error,
  onClose,
}: {
  video: YoutubeVideo;
  data: TranscriptData | null;
  loading: boolean;
  error: string;
  onClose: () => void;
}) {
  const chunks = useMemo(() => {
    if (!data) return [];
    const result: Array<{ startFormatted: string; parts: TranscriptSegment[] }> = [];
    let current: (typeof result)[0] | null = null;
    let chunkStartMs = -1;

    for (const seg of data.segments) {
      if (!current || seg.startMs - chunkStartMs >= 15000) {
        if (current) result.push(current);
        current = { startFormatted: seg.startFormatted, parts: [] };
        chunkStartMs = seg.startMs;
      }
      current.parts.push(seg);
    }
    if (current && current.parts.length) result.push(current);
    return result;
  }, [data]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div className="min-w-0 pr-4">
            <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-0.5 font-medium">
              {video.channelTitle}
            </p>
            <h3 className="text-sm font-semibold text-gray-900 leading-snug line-clamp-2">
              {video.title}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 w-7 h-7 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 text-sm transition-colors"
          >
            ✕
          </button>
        </div>

        {loading && (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-sm py-14 animate-pulse">
            Fetching transcript…
          </div>
        )}

        {!loading && error && (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400 text-sm py-14 gap-2">
            <span className="text-2xl">📄</span>
            <span>
              {error === "No transcript available"
                ? "This video doesn't have captions."
                : `Error: ${error}`}
            </span>
          </div>
        )}

        {!loading && data && (
          <>
            {/* Summary tags */}
            <div className="px-5 py-3 border-b border-gray-50 flex flex-wrap gap-2 shrink-0">
              {(["price", "personal", "subscribe"] as Category[]).map((cat) => {
                const item = data.summary[cat];
                if (!item) return null;
                const c = CAT_COLORS[cat];
                return (
                  <span
                    key={cat}
                    className={`flex items-center gap-1.5 ${c.pillBg} ${c.pillText} border ${c.pillBorder} text-xs font-semibold px-3 py-1 rounded-full`}
                  >
                    {c.emoji} {c.label}
                    <span className="font-mono font-normal opacity-80">{item.firstAt}</span>
                    <span className="opacity-50 font-normal">×{item.count}</span>
                  </span>
                );
              })}
              {!data.summary.price && !data.summary.personal && !data.summary.subscribe && (
                <span className="text-xs text-gray-400 italic">
                  No flagged content detected in this transcript.
                </span>
              )}
            </div>

            {/* Legend */}
            <div className="px-5 py-2 border-b border-gray-50 flex gap-4 text-[10px] text-gray-500 shrink-0">
              {(Object.entries(CAT_COLORS) as [Category, (typeof CAT_COLORS)[Category]][]).map(
                ([key, val]) => (
                  <span key={key} className="flex items-center gap-1.5">
                    <span className={`inline-block w-2.5 h-2.5 rounded ${val.bg}`} />
                    {val.label}
                  </span>
                )
              )}
            </div>

            {/* Transcript body */}
            <div className="overflow-y-auto flex-1 px-5 py-4 space-y-2">
              {chunks.map((chunk, i) => (
                <div key={i} className="flex gap-3">
                  <span className="text-[10px] text-gray-300 font-mono shrink-0 pt-0.5 w-10 text-right">
                    {chunk.startFormatted}
                  </span>
                  <p className="text-xs text-gray-700 leading-relaxed">
                    {chunk.parts.map((seg, j) => {
                      if (!seg.categories.length) {
                        return <span key={j}>{seg.text} </span>;
                      }
                      const cat = seg.categories[0] as Category;
                      const c = CAT_COLORS[cat];
                      return (
                        <mark
                          key={j}
                          className={`${c.bg} ${c.text} rounded-sm px-0.5`}
                          title={seg.categories
                            .map((k) => CAT_COLORS[k as Category].label)
                            .join(" + ")}
                        >
                          {seg.text}
                        </mark>
                      );
                    })}{" "}
                  </p>
                </div>
              ))}
              {chunks.length === 0 && (
                <p className="text-xs text-gray-400 text-center py-8">
                  No transcript content found.
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function VideoCard({ video, best }: { video: YoutubeVideo; best?: boolean }) {
  const url = `https://www.youtube.com/watch?v=${video.videoId}`;
  const views = video.viewCount ? parseInt(video.viewCount).toLocaleString() : null;

  const [showModal, setShowModal] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptData | null>(null);
  const [txState, setTxState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [txError, setTxError] = useState("");

  async function handleTranscript() {
    setShowModal(true);
    if (txState !== "idle") return;
    setTxState("loading");
    try {
      const res = await fetch(`/api/youtube/transcript?videoId=${video.videoId}`);
      const data = await res.json();
      if (!res.ok || data.error) {
        setTxError(data.error ?? "Failed to load");
        setTxState("error");
      } else {
        setTranscript(data);
        setTxState("done");
      }
    } catch {
      setTxError("Network error");
      setTxState("error");
    }
  }

  const { summary } = transcript ?? {};

  return (
    <div className="flex flex-col gap-1.5">
      {/* Clickable thumbnail */}
      <a href={url} target="_blank" rel="noopener noreferrer" className="group flex flex-col gap-1.5">
        <div className="relative flex-shrink-0">
          <img
            src={video.thumbnailUrl}
            alt={video.title}
            className="w-full h-20 object-cover rounded-lg"
          />
          <span className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-lg bg-black/10">
            <span
              className="text-white rounded-full w-8 h-8 flex items-center justify-center text-xs"
              style={{ background: ACCENT }}
            >
              ▶
            </span>
          </span>
          {best && (
            <span
              className="absolute top-1.5 left-1.5 text-white text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
              style={{ background: ACCENT }}
            >
              Best Pick
            </span>
          )}
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium text-gray-800 line-clamp-2 leading-snug group-hover:text-gray-600 transition-colors">
            {video.channelTitle}
          </p>
          {views && <p className="text-[11px] text-gray-400 mt-0.5">{views} views</p>}
        </div>
      </a>

      {/* Transcript category tags — shown once loaded */}
      {txState === "done" && (
        <div className="flex flex-wrap gap-1">
          {(["price", "personal", "subscribe"] as Category[]).map((cat) => {
            const item = summary?.[cat];
            if (!item) return null;
            const c = CAT_COLORS[cat];
            return (
              <button
                key={cat}
                onClick={handleTranscript}
                className={`flex items-center gap-0.5 ${c.pillBg} border ${c.pillBorder} ${c.pillText} text-[9px] font-semibold px-1.5 py-0.5 rounded-full hover:opacity-80 transition-opacity`}
              >
                {c.emoji} {item.firstAt}
              </button>
            );
          })}
          {!summary?.price && !summary?.personal && !summary?.subscribe && (
            <span className="text-[9px] text-gray-300 italic">clean</span>
          )}
        </div>
      )}
      {txState === "error" && (
        <span className="text-[9px] text-gray-300">No transcript</span>
      )}

      {/* Transcript button */}
      <button
        onClick={handleTranscript}
        className="text-left text-[10px] text-gray-400 hover:text-gray-600 transition-colors"
      >
        {txState === "loading"
          ? "⏳ Loading…"
          : txState === "done"
          ? "📄 View transcript"
          : "📄 Transcript"}
      </button>

      {/* Modal */}
      {showModal && (
        <TranscriptModal
          video={video}
          data={transcript}
          loading={txState === "loading"}
          error={txError}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}

export default function YoutubePage() {
  const [input, setInput] = useState("");
  const [searches, setSearches] = useState<ProductSearch[]>([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [historyLoading, setHistoryLoading] = useState(true);
  const [filter, setFilter] = useState("");

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    const res = await fetch("/api/youtube/history");
    const data = await res.json();
    if (data.searches) setSearches(data.searches);
    setHistoryLoading(false);
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  async function handleSearch() {
    const products = input
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

    if (products.length === 0) {
      setError("Please enter at least one product name.");
      return;
    }

    setLoading(true);
    setError("");
    setProgress(`Searching ${products.length} product${products.length > 1 ? "s" : ""}…`);

    const res = await fetch("/api/youtube/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ products }),
    });

    const data = await res.json();
    setLoading(false);
    setProgress("");

    if (data.error) {
      setError(data.error);
      return;
    }

    await loadHistory();
    setInput("");
  }

  async function handleClear() {
    if (!confirm("Delete all saved searches?")) return;
    await fetch("/api/youtube/history", { method: "DELETE" });
    setSearches([]);
  }

  const filtered = filter
    ? searches.filter((s) =>
        s.productName.toLowerCase().includes(filter.toLowerCase())
      )
    : searches;

  const VIDEO_COLS = [
    { label: "Best Pick", best: true },
    { label: "Video 2", best: false },
    { label: "Video 3", best: false },
    { label: "Video 4", best: false },
    { label: "Video 5", best: false },
  ];

  return (
    <div className="min-h-screen px-6 py-8 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="mb-7">
        <h1 className="text-[26px] font-bold text-gray-900 tracking-tight">
          YouTube Product Research
        </h1>
        <p className="text-gray-400 text-sm mt-1">
          Find faceless YouTube videos for Amazon products — auto-filtered for affiliate &amp; sponsored content.
        </p>
      </div>

      {/* Input card */}
      <div className="bg-white rounded-2xl p-6 mb-5 shadow-sm border border-black/5">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Product names{" "}
          <span className="text-gray-400 font-normal">one per line</span>
        </label>
        <textarea
          className="w-full border border-gray-200 rounded-xl p-3 text-sm font-mono h-36 resize-y focus:outline-none focus:ring-2 transition-shadow placeholder:text-gray-300"
          style={{ "--tw-ring-color": ACCENT } as React.CSSProperties}
          placeholder={"Wireless Earbuds\nStainless Steel Water Bottle\nYoga Mat\nPortable Charger\nCircular Saw"}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSearch();
          }}
        />
        <div className="flex items-center gap-3 mt-4">
          <button
            onClick={handleSearch}
            disabled={loading}
            className="flex items-center gap-2 text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-opacity disabled:opacity-50"
            style={{ background: ACCENT }}
          >
            <span className="text-xs">▶</span>
            {loading ? "Searching…" : "Search YouTube"}
          </button>
          {progress && (
            <span className="text-sm text-gray-400 animate-pulse">{progress}</span>
          )}
          {error && <span className="text-sm text-red-500">{error}</span>}
        </div>
      </div>

      {/* Results card */}
      <div className="bg-white rounded-2xl shadow-sm border border-black/5 overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800 text-sm">
            Saved Results{" "}
            <span className="text-gray-400 font-normal">{searches.length} products</span>
          </h2>
          <div className="flex items-center gap-3">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                <IconSearch />
              </span>
              <input
                type="text"
                placeholder="Filter products…"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="border border-gray-200 rounded-xl pl-8 pr-3 py-1.5 text-sm focus:outline-none focus:ring-2 w-44 transition-shadow placeholder:text-gray-300"
                style={{ "--tw-ring-color": ACCENT } as React.CSSProperties}
              />
            </div>
            <button
              onClick={handleClear}
              className="text-sm font-medium px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors"
              style={{ color: ACCENT }}
            >
              Clear all
            </button>
          </div>
        </div>

        {/* Table */}
        {historyLoading ? (
          <div className="p-14 text-center text-gray-300 text-sm">
            Loading saved searches…
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-14 text-center text-gray-300 text-sm">
            {searches.length === 0
              ? "No searches yet — paste product names above and click Search."
              : "No results match your filter."}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left px-6 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-widest w-10">
                      #
                    </th>
                    <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-widest w-52">
                      Product
                    </th>
                    {VIDEO_COLS.map((col) => (
                      <th
                        key={col.label}
                        className="text-left px-4 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-widest w-44"
                      >
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((search, i) => (
                    <tr
                      key={search.id}
                      className="border-b border-gray-50 hover:bg-gray-50/60 transition-colors"
                    >
                      <td className="px-6 py-5 text-gray-300 text-xs font-mono align-top">
                        {i + 1}
                      </td>
                      <td className="px-4 py-5 align-top">
                        <span className="font-semibold text-gray-900 text-sm leading-snug">
                          {search.productName}
                        </span>
                        {search.videos.length === 0 && (
                          <span className="block text-[11px] text-orange-400 mt-1">
                            No clean videos found
                          </span>
                        )}
                      </td>
                      {VIDEO_COLS.map((col, vi) => (
                        <td key={col.label} className="px-4 py-5 w-44 align-top">
                          {search.videos[vi] ? (
                            <VideoCard video={search.videos[vi]} best={col.best} />
                          ) : (
                            <span className="text-gray-200 text-xs">—</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="px-6 py-3 border-t border-gray-50 text-xs text-gray-400">
              Showing {filtered.length} of {searches.length} products
            </div>
          </>
        )}
      </div>
    </div>
  );
}
