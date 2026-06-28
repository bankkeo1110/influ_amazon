"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type SavedPage = { id: string; pageId: string; name: string };
type RssItem = { title: string; link: string; snippet: string; pubDate: string };
type ScheduleResult = { count: number; pending: boolean; pageName: string; intervalDays: number };

export default function RssFeedPage() {
  const [pages, setPages] = useState<SavedPage[]>([]);
  const [selectedPage, setSelectedPage] = useState<SavedPage | null>(null);
  const [rssUrl, setRssUrl] = useState("");
  const [intervalDays, setIntervalDays] = useState(3);
  const [maxPosts, setMaxPosts] = useState(10);
  const [feedTitle, setFeedTitle] = useState("");
  const [items, setItems] = useState<RssItem[]>([]);
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState("");
  const [scheduleResult, setScheduleResult] = useState<ScheduleResult | null>(null);
  const router = useRouter();

  useEffect(() => {
    fetch("/api/facebook/me")
      .then((r) => r.json())
      .then((d) => {
        if (!d.user) { router.push("/facebook"); return; }
        setPages(d.user.pages);
        if (d.user.pages.length > 0) setSelectedPage(d.user.pages[0]);
      });
  }, [router]);

  async function handleFetch() {
    if (!rssUrl.trim()) return;
    setFetching(true);
    setFetchError("");
    setItems([]);
    setFeedTitle("");
    setScheduleResult(null);

    const res = await fetch(`/api/facebook/rss?url=${encodeURIComponent(rssUrl)}`);
    const data = await res.json();
    setFetching(false);

    if (data.error) {
      setFetchError(data.error);
    } else {
      setFeedTitle(data.feedTitle);
      setItems(data.items);
    }
  }

  function handleSchedule() {
    if (!selectedPage || items.length === 0) return;

    const count = Math.min(maxPosts, items.length);
    const savedUrl = rssUrl;
    const savedPage = selectedPage;
    const savedInterval = intervalDays;

    // Immediate feedback — clear form, don't wait for API
    setScheduleResult({ count, pending: true, pageName: savedPage.name, intervalDays: savedInterval });
    setItems([]);
    setRssUrl("");
    setFeedTitle("");
    setFetchError("");

    // Fire in background
    fetch("/api/facebook/rss", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fbPageId: savedPage.pageId,
        pageId: savedPage.id,
        rssUrl: savedUrl,
        intervalDays: savedInterval,
        maxItems: count,
      }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setFetchError(data.error);
          setScheduleResult(null);
        } else {
          setScheduleResult({ count: data.scheduled, pending: false, pageName: savedPage.name, intervalDays: savedInterval });
        }
      })
      .catch(() => {
        setFetchError("Scheduling failed. Check the dashboard.");
        setScheduleResult(null);
      });
  }

  const displayItems = items.slice(0, maxPosts);

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">RSS to Facebook</h1>
        <p className="text-gray-400 text-sm mt-1">
          Paste an RSS feed URL — posts are scheduled to your Page automatically.
        </p>
      </div>

      {/* Page selector */}
      {pages.length > 1 && (
        <div className="flex gap-2 mb-5 flex-wrap">
          {pages.map((p) => (
            <button
              key={p.id}
              onClick={() => setSelectedPage(p)}
              className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                selectedPage?.id === p.id
                  ? "bg-gray-900 text-white border-gray-900"
                  : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
              }`}
            >
              {p.name}
            </button>
          ))}
        </div>
      )}

      {/* Config card */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm mb-5">
        <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">
          RSS Feed URL
        </label>
        <div className="flex gap-2">
          <input
            type="url"
            value={rssUrl}
            onChange={(e) => { setRssUrl(e.target.value); setItems([]); setFeedTitle(""); setScheduleResult(null); }}
            onKeyDown={(e) => e.key === "Enter" && handleFetch()}
            placeholder="https://example.com/feed.xml"
            className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
          <button
            onClick={handleFetch}
            disabled={fetching || !rssUrl.trim()}
            className="bg-gray-900 hover:bg-gray-700 disabled:opacity-50 text-white px-5 py-2.5 rounded-xl text-sm font-medium transition-colors whitespace-nowrap"
          >
            {fetching ? "Fetching…" : "Fetch Feed"}
          </button>
        </div>

        {/* Settings row */}
        <div className="flex items-center gap-6 mt-4 flex-wrap">
          <div className="flex items-center gap-2">
            <label className="text-xs font-bold text-gray-400 uppercase tracking-widest whitespace-nowrap">
              Posts to schedule
            </label>
            <input
              type="number"
              min={1}
              max={50}
              value={maxPosts}
              onChange={(e) => setMaxPosts(Math.max(1, Number(e.target.value)))}
              className="w-16 border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs font-bold text-gray-400 uppercase tracking-widest whitespace-nowrap">
              Every
            </label>
            <input
              type="number"
              min={1}
              max={30}
              value={intervalDays}
              onChange={(e) => setIntervalDays(Math.max(1, Number(e.target.value)))}
              className="w-16 border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
            <span className="text-sm text-gray-400">days</span>
          </div>
        </div>

        {fetchError && (
          <p className="mt-3 text-sm text-red-500">{fetchError}</p>
        )}
      </div>

      {/* Async status banner */}
      {scheduleResult && (
        <div className={`rounded-2xl p-5 mb-5 border transition-colors ${
          scheduleResult.pending
            ? "bg-blue-50 border-blue-200"
            : "bg-green-50 border-green-200"
        }`}>
          {scheduleResult.pending ? (
            <>
              <div className="flex items-center gap-2">
                <span className="inline-block w-3 h-3 rounded-full bg-blue-400 animate-pulse" />
                <p className="text-blue-700 font-semibold text-sm">
                  Scheduling {scheduleResult.count} posts to {scheduleResult.pageName}…
                </p>
              </div>
              <p className="text-blue-500 text-xs mt-1 ml-5">
                Running in the background — you can leave this page.
              </p>
            </>
          ) : (
            <>
              <p className="text-green-700 font-semibold text-sm">
                ✓ {scheduleResult.count} posts scheduled to {scheduleResult.pageName}
              </p>
              <p className="text-green-600 text-xs mt-1">
                First post publishes in ~15 min, then every {scheduleResult.intervalDays} days.{" "}
                <a href="/facebook/dashboard" className="underline">View in Dashboard →</a>
              </p>
            </>
          )}
        </div>
      )}

      {/* Preview list */}
      {displayItems.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
            <div>
              <p className="font-semibold text-gray-900 text-sm">{feedTitle}</p>
              <p className="text-xs text-gray-400 mt-0.5">
                Showing {displayItems.length} of {items.length} · every {intervalDays} day{intervalDays !== 1 ? "s" : ""}
              </p>
            </div>
            <button
              onClick={handleSchedule}
              disabled={!selectedPage}
              className="bg-[#E05540] hover:opacity-90 disabled:opacity-50 text-white px-5 py-2 rounded-xl text-sm font-semibold transition-opacity whitespace-nowrap"
            >
              Schedule {displayItems.length} Posts
            </button>
          </div>

          <ul className="divide-y divide-gray-50">
            {displayItems.map((item, i) => {
              const daysFromNow = i * intervalDays;
              const publishDate = new Date(Date.now() + daysFromNow * 86400000 + 15 * 60000);
              return (
                <li key={i} className="px-5 py-4 flex gap-4 items-start">
                  <span className="text-[11px] font-mono text-gray-300 pt-0.5 w-5 flex-shrink-0">
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 leading-snug line-clamp-1">
                      {item.title || "(no title)"}
                    </p>
                    {item.snippet && (
                      <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{item.snippet}</p>
                    )}
                    {item.link && (
                      <a
                        href={item.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] text-blue-400 hover:underline mt-0.5 block truncate"
                      >
                        {item.link}
                      </a>
                    )}
                  </div>
                  <span className="text-[11px] text-gray-300 whitespace-nowrap flex-shrink-0 pt-0.5 text-right">
                    {daysFromNow === 0 ? "in 15 min" : `day ${daysFromNow}`}
                    <br />
                    <span className="text-[10px]">
                      {publishDate.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
