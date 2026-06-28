"use client";
/* eslint-disable @next/next/no-img-element */

import { useState, useEffect, useCallback } from "react";

const ACCENT = "#E05540";

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

function IconSearch() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <circle cx="6" cy="6" r="4.5" />
      <path d="M9.5 9.5 13 13" />
    </svg>
  );
}

function VideoCard({ video, best }: { video: YoutubeVideo; best?: boolean }) {
  const url = `https://www.youtube.com/watch?v=${video.videoId}`;
  const views = video.viewCount
    ? parseInt(video.viewCount).toLocaleString()
    : null;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex flex-col gap-1.5 group"
    >
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

  return (
    <div className="min-h-screen px-6 py-8 max-w-[1400px] mx-auto">
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
        {/* Table toolbar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800 text-sm">
            Saved Results{" "}
            <span className="text-gray-400 font-normal">{searches.length} products</span>
          </h2>
          <div className="flex items-center gap-3">
            {/* Filter input */}
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

        {/* Table body */}
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
                    <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-widest w-56">
                      Product
                    </th>
                    <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-widest">
                      Best Pick
                    </th>
                    <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-widest">
                      Video 2
                    </th>
                    <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-widest">
                      Video 3
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((search, i) => (
                    <tr
                      key={search.id}
                      className="border-b border-gray-50 hover:bg-gray-50/60 transition-colors"
                    >
                      <td className="px-6 py-5 text-gray-300 text-xs font-mono">
                        {i + 1}
                      </td>
                      <td className="px-4 py-5">
                        <span className="font-semibold text-gray-900 text-sm leading-snug">
                          {search.productName}
                        </span>
                        {search.videos.length === 0 && (
                          <span className="block text-[11px] text-orange-400 mt-1">
                            No clean videos found
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-5 w-44">
                        {search.videos[0] ? (
                          <VideoCard video={search.videos[0]} best />
                        ) : (
                          <span className="text-gray-200 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-5 w-44">
                        {search.videos[1] ? (
                          <VideoCard video={search.videos[1]} />
                        ) : (
                          <span className="text-gray-200 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-5 w-44">
                        {search.videos[2] ? (
                          <VideoCard video={search.videos[2]} />
                        ) : (
                          <span className="text-gray-200 text-xs">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Footer */}
            <div className="px-6 py-3 border-t border-gray-50 text-xs text-gray-400">
              Showing {filtered.length} of {searches.length} products
            </div>
          </>
        )}
      </div>
    </div>
  );
}
