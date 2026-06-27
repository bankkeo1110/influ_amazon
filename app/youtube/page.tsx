"use client";
/* eslint-disable @next/next/no-img-element */

import { useState, useEffect, useCallback } from "react";

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
      className="flex gap-2 hover:bg-gray-50 rounded-lg p-1 transition-colors group"
    >
      <div className="relative flex-shrink-0">
        <img
          src={video.thumbnailUrl}
          alt={video.title}
          className="w-32 h-20 object-cover rounded"
        />
        <span className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <span className="bg-red-600 text-white rounded-full w-8 h-8 flex items-center justify-center text-sm">
            ▶
          </span>
        </span>
      </div>
      <div className="flex-1 min-w-0">
        {best && (
          <span className="inline-block bg-green-100 text-green-700 text-xs font-medium px-1.5 py-0.5 rounded mb-1">
            best pick
          </span>
        )}
        <p className="text-sm font-medium text-gray-900 line-clamp-2 leading-snug group-hover:text-blue-600">
          {video.title}
        </p>
        <p className="text-xs text-gray-500 mt-1">{video.channelTitle}</p>
        {views && <p className="text-xs text-gray-400">{views} views</p>}
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
    setProgress(`Searching ${products.length} products…`);

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
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">
            YouTube Product Research
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Find faceless YouTube videos for Amazon products — auto-filtered for
            affiliate &amp; sponsored content.
          </p>
        </div>

        {/* Input panel */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-8 shadow-sm">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Product names{" "}
            <span className="text-gray-400 font-normal">(one per line)</span>
          </label>
          <textarea
            className="w-full border border-gray-200 rounded-lg p-3 text-sm font-mono h-40 resize-y focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder={
              "Wireless Earbuds\nStainless Steel Water Bottle\nYoga Mat\nPortable Charger\n..."
            }
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          <div className="flex items-center gap-3 mt-3">
            <button
              onClick={handleSearch}
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              {loading ? "Searching…" : "Search YouTube"}
            </button>
            {progress && (
              <span className="text-sm text-gray-500 animate-pulse">
                {progress}
              </span>
            )}
            {error && <span className="text-sm text-red-600">{error}</span>}
          </div>
        </div>

        {/* Results table */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-800">
              Saved Results{" "}
              <span className="text-gray-400 font-normal text-sm">
                ({searches.length} products)
              </span>
            </h2>
            <div className="flex items-center gap-3">
              <input
                type="text"
                placeholder="Filter products…"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-48"
              />
              <button
                onClick={handleClear}
                className="text-sm text-red-500 hover:text-red-700 px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors"
              >
                Clear all
              </button>
            </div>
          </div>

          {historyLoading ? (
            <div className="p-12 text-center text-gray-400 text-sm">
              Loading saved searches…
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-gray-400 text-sm">
              {searches.length === 0
                ? "No searches yet — paste product names above and click Search."
                : "No results match your filter."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-10">
                      #
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-52">
                      Product
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Best pick
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Video 2
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Video 3
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-28">
                      Saved
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtered.map((search, i) => (
                    <tr key={search.id} className="hover:bg-gray-50/50">
                      <td className="px-6 py-4 text-gray-400 text-xs">
                        {i + 1}
                      </td>
                      <td className="px-4 py-4">
                        <span className="font-medium text-gray-900 text-sm">
                          {search.productName}
                        </span>
                        {search.videos.length === 0 && (
                          <span className="block text-xs text-orange-500 mt-0.5">
                            No clean videos found
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-4 max-w-xs">
                        {search.videos[0] ? (
                          <VideoCard video={search.videos[0]} best />
                        ) : (
                          <span className="text-gray-400 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-4 max-w-xs">
                        {search.videos[1] ? (
                          <VideoCard video={search.videos[1]} />
                        ) : (
                          <span className="text-gray-400 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-4 max-w-xs">
                        {search.videos[2] ? (
                          <VideoCard video={search.videos[2]} />
                        ) : (
                          <span className="text-gray-400 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-4 text-gray-400 text-xs whitespace-nowrap">
                        {new Date(search.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
