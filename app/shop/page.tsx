"use client";

import { useCallback, useEffect, useState } from "react";

const PAGE_SIZES = [5, 10, 20, 50, 100];
const DEFAULT_QUERY = "site:https://www.amazon.com/shop";

type Shop = {
  id: string;
  handle: string;
  url: string;
  name: string;
  videoCount: number;
  countCapped: boolean;
  lastCrawledAt: string;
};

type ListResponse = {
  rows: Shop[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  error?: string;
};

type CrawlResult = {
  provider: string;
  found: number;
  added: number;
  updated: number;
  skipped: number;
  failed: number;
  attempts?: { provider: string; error: string }[];
  warning?: string;
};

type CrawlJob = {
  id: string;
  baseQuery: string;
  target: number;
  status: "running" | "done" | "stopped" | "error";
  discovered: number;
  saved: number;
  queriesRun: number;
  currentQuery: string | null;
  note: string | null;
  error: string | null;
};

const PROVIDERS = [
  { value: "auto", label: "Auto" },
  { value: "google", label: "Google API" },
  { value: "bing", label: "Bing" },
  { value: "duckduckgo", label: "DuckDuckGo" },
];

type SortField = "name" | "handle" | "videoCount" | "lastCrawledAt";

function IconSort({ active, dir }: { active: boolean; dir: "asc" | "desc" }) {
  return (
    <span className={`inline-block ml-1 text-[9px] ${active ? "text-gray-900" : "text-gray-300"}`}>
      {active && dir === "asc" ? "▲" : "▼"}
    </span>
  );
}

export default function ShopPage() {
  // ── Table state ───────────────────────────────────────────────────────────
  const [rows, setRows] = useState<Shop[]>([]);
  const [total, setTotal] = useState(0);
  const [pageCount, setPageCount] = useState(1);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [filter, setFilter] = useState("");
  const [debouncedFilter, setDebouncedFilter] = useState("");
  const [sort, setSort] = useState<SortField>("videoCount");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState("");

  // ── Crawl state ───────────────────────────────────────────────────────────
  const [query, setQuery] = useState(DEFAULT_QUERY);
  const [maxResults, setMaxResults] = useState(30);
  const [maxVideoPages, setMaxVideoPages] = useState(10);
  const [provider, setProvider] = useState("auto");
  const [refresh, setRefresh] = useState(false);
  const [crawling, setCrawling] = useState(false);
  const [crawlError, setCrawlError] = useState("");
  const [crawlResult, setCrawlResult] = useState<CrawlResult | null>(null);

  // ── Deep-crawl job state ──────────────────────────────────────────────────
  const [target, setTarget] = useState(1000);
  const [job, setJob] = useState<CrawlJob | null>(null);

  // Debounce the filter box so typing does not fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedFilter(filter);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [filter]);

  const load = useCallback(async () => {
    setLoading(true);
    setListError("");
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
      sort,
      dir,
    });
    if (debouncedFilter.trim()) params.set("q", debouncedFilter.trim());

    try {
      const res = await fetch(`/api/shop?${params}`);
      const data: ListResponse = await res.json();
      if (data.error) {
        setListError(data.error);
        return;
      }
      setRows(data.rows);
      setTotal(data.total);
      setPageCount(data.pageCount);
      if (data.page !== page) setPage(data.page);
    } catch {
      setListError("Could not load the shop list.");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, sort, dir, debouncedFilter]);

  useEffect(() => {
    load();
  }, [load]);

  function toggleSort(field: SortField) {
    if (sort === field) {
      setDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSort(field);
      setDir(field === "videoCount" ? "desc" : "asc");
    }
    setPage(1);
  }

  async function handleCrawl() {
    setCrawling(true);
    setCrawlError("");
    setCrawlResult(null);
    try {
      const res = await fetch("/api/shop/crawl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, maxResults, maxVideoPages, provider, refresh }),
      });
      const data = await res.json();
      if (data.error) setCrawlError(data.error);
      else {
        setCrawlResult(data);
        setPage(1);
        await load();
      }
    } catch {
      setCrawlError("The crawl request failed.");
    } finally {
      setCrawling(false);
    }
  }

  // Poll the job while it runs, refreshing the table as rows land.
  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch("/api/shop/job");
        const data = await res.json();
        if (cancelled) return;
        setJob(data.job ?? null);
        if (data.job?.status === "running") await load();
      } catch {
        /* transient — the next tick retries */
      }
    }

    poll();
    const id = setInterval(poll, 4000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
    // `load` is intentionally omitted: it changes on every paging/sort tweak and
    // would restart the interval each time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleDeepCrawl() {
    setCrawlError("");
    setCrawlResult(null);
    try {
      const res = await fetch("/api/shop/job", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, target, maxVideoPages }),
      });
      const data = await res.json();
      if (data.error) setCrawlError(data.error);
      if (data.job) setJob(data.job);
    } catch {
      setCrawlError("Could not start the crawl.");
    }
  }

  async function handleStopCrawl() {
    const res = await fetch("/api/shop/job", { method: "DELETE" });
    const data = await res.json();
    setJob(data.job ?? null);
    await load();
  }

  async function handleClear() {
    if (!confirm(`Delete all ${total} crawled shops?`)) return;
    await fetch("/api/shop", { method: "DELETE" });
    setPage(1);
    await load();
  }

  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Shop</h1>
        <p className="text-gray-400 text-sm mt-1">
          Amazon influencer storefronts and their video counts, discovered from a{" "}
          <code className="text-gray-500">site:</code> search and by crawling Amazon.
        </p>
      </div>

      {/* ── Crawl panel ─────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm mb-5">
        <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">
          Search query
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !crawling && handleCrawl()}
            placeholder={DEFAULT_QUERY}
            className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
          <button
            onClick={handleCrawl}
            disabled={crawling}
            className="bg-gray-900 hover:bg-gray-700 disabled:opacity-50 text-white px-5 py-2.5 rounded-xl text-sm font-medium transition-colors whitespace-nowrap"
          >
            {crawling ? "Crawling…" : "Crawl"}
          </button>
        </div>

        <div className="flex items-center gap-6 mt-4 flex-wrap">
          <div className="flex items-center gap-2">
            <label className="text-xs font-bold text-gray-400 uppercase tracking-widest whitespace-nowrap">
              Max shops
            </label>
            <input
              type="number"
              min={1}
              max={200}
              value={maxResults}
              onChange={(e) => setMaxResults(Math.max(1, Number(e.target.value)))}
              className="w-16 border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs font-bold text-gray-400 uppercase tracking-widest whitespace-nowrap">
              Video pages / shop
            </label>
            <input
              type="number"
              min={1}
              max={50}
              value={maxVideoPages}
              onChange={(e) => setMaxVideoPages(Math.max(1, Number(e.target.value)))}
              className="w-16 border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
            <span className="text-xs text-gray-400">×20 videos</span>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs font-bold text-gray-400 uppercase tracking-widest whitespace-nowrap">
              Engine
            </label>
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900"
            >
              {PROVIDERS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 text-xs font-bold text-gray-400 uppercase tracking-widest cursor-pointer">
            <input
              type="checkbox"
              checked={refresh}
              onChange={(e) => setRefresh(e.target.checked)}
              className="accent-gray-900"
            />
            Re-count known shops
          </label>
        </div>

        {crawlError && (
          <p className="mt-4 text-sm text-red-500 bg-red-50 rounded-xl px-3 py-2">{crawlError}</p>
        )}
        {crawlResult && (
          <p className="mt-4 text-sm text-gray-500 bg-gray-50 rounded-xl px-3 py-2">
            <span className="font-medium text-gray-900">{crawlResult.provider}</span> returned{" "}
            {crawlResult.found} storefront{crawlResult.found === 1 ? "" : "s"} — {crawlResult.added}{" "}
            new, {crawlResult.updated} updated, {crawlResult.skipped} already fresh
            {crawlResult.failed > 0 && `, ${crawlResult.failed} failed`}.
            {crawlResult.warning && ` ${crawlResult.warning}`}
            {crawlResult.attempts && crawlResult.attempts.length > 0 && (
              <span className="block mt-1 text-xs text-gray-400">
                Fell back after{" "}
                {crawlResult.attempts.map((a) => `${a.provider} (${a.error})`).join(", ")}.
              </span>
            )}
          </p>
        )}
      </div>

      {/* ── Deep crawl ──────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm mb-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-sm font-bold text-gray-900">Deep crawl</h2>
            <p className="text-xs text-gray-400 mt-1 max-w-xl">
              Search engines only index a few dozen of these pages, so this seeds from
              search and then walks Amazon itself — storefront videos give product ASINs,
              and each product page credits the creators who filmed it. Runs in the
              background; leave the page if you like.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs font-bold text-gray-400 uppercase tracking-widest whitespace-nowrap">
              Target
            </label>
            <input
              type="number"
              min={1}
              max={5000}
              value={target}
              onChange={(e) => setTarget(Math.max(1, Number(e.target.value)))}
              disabled={job?.status === "running"}
              className="w-20 border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-center disabled:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
            {job?.status === "running" ? (
              <button
                onClick={handleStopCrawl}
                className="bg-white border border-gray-200 hover:border-red-300 hover:text-red-500 text-gray-600 px-4 py-2 rounded-xl text-sm font-medium transition-colors"
              >
                Stop
              </button>
            ) : (
              <button
                onClick={handleDeepCrawl}
                className="bg-gray-900 hover:bg-gray-700 text-white px-5 py-2 rounded-xl text-sm font-medium transition-colors whitespace-nowrap"
              >
                Start deep crawl
              </button>
            )}
          </div>
        </div>

        {job && (
          <div className="mt-4">
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-gray-900 transition-all duration-500"
                style={{
                  width: `${Math.min(100, (job.discovered / Math.max(1, job.target)) * 100)}%`,
                }}
              />
            </div>
            <div className="flex items-center justify-between gap-3 mt-2 flex-wrap text-xs text-gray-400">
              <span>
                <span className="font-medium text-gray-900">{job.discovered}</span> /{" "}
                {job.target} storefronts · {job.saved} saved · {job.queriesRun} queries ·{" "}
                <span
                  className={
                    job.status === "running"
                      ? "text-gray-900"
                      : job.status === "error"
                        ? "text-red-500"
                        : "text-gray-400"
                  }
                >
                  {job.status}
                </span>
              </span>
              {job.note && <span className="truncate max-w-md">{job.note}</span>}
            </div>
            {job.currentQuery && job.status === "running" && (
              <p className="mt-1 text-xs text-gray-300 font-mono truncate">
                {job.currentQuery}
              </p>
            )}
            {job.error && <p className="mt-1 text-xs text-red-500">{job.error}</p>}
          </div>
        )}
      </div>

      {/* ── Table toolbar ───────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <input
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by name, handle or URL…"
          className="flex-1 min-w-[220px] border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900"
        />
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Rows</span>
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setPage(1);
            }}
            className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900"
          >
            {PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </div>
        {total > 0 && (
          <button
            onClick={handleClear}
            className="text-xs text-gray-400 hover:text-red-500 transition-colors"
          >
            Clear all
          </button>
        )}
      </div>

      {/* ── Table ───────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left">
                <th
                  onClick={() => toggleSort("handle")}
                  className="px-5 py-3 text-xs font-bold text-gray-400 uppercase tracking-widest cursor-pointer select-none hover:text-gray-700"
                >
                  Shop URL
                  <IconSort active={sort === "handle"} dir={dir} />
                </th>
                <th
                  onClick={() => toggleSort("name")}
                  className="px-5 py-3 text-xs font-bold text-gray-400 uppercase tracking-widest cursor-pointer select-none hover:text-gray-700"
                >
                  Shop Name
                  <IconSort active={sort === "name"} dir={dir} />
                </th>
                <th
                  onClick={() => toggleSort("videoCount")}
                  className="px-5 py-3 text-xs font-bold text-gray-400 uppercase tracking-widest cursor-pointer select-none hover:text-gray-700 text-right whitespace-nowrap"
                >
                  Videos
                  <IconSort active={sort === "videoCount"} dir={dir} />
                </th>
              </tr>
            </thead>
            <tbody>
              {loading && rows.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-5 py-10 text-center text-gray-300">
                    Loading…
                  </td>
                </tr>
              )}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-5 py-10 text-center text-gray-300">
                    {debouncedFilter
                      ? "No shops match this filter."
                      : "No shops yet — run a crawl above."}
                  </td>
                </tr>
              )}
              {rows.map((shop) => (
                <tr key={shop.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
                  <td className="px-5 py-3">
                    <a
                      href={shop.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-600 hover:underline break-all"
                    >
                      {shop.url}
                    </a>
                  </td>
                  <td className="px-5 py-3 text-gray-900">{shop.name}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-gray-900 whitespace-nowrap">
                    {shop.videoCount}
                    {shop.countCapped && (
                      <span
                        className="text-gray-400"
                        title="Hit the per-shop page limit — the real total is higher"
                      >
                        +
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ── Pagination ────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-gray-100 flex-wrap">
          <span className="text-xs text-gray-400">
            {from}–{to} of {total}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(1)}
              disabled={page <= 1}
              className="px-2.5 py-1.5 rounded-lg text-xs text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
            >
              « First
            </button>
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-2.5 py-1.5 rounded-lg text-xs text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
            >
              ‹ Prev
            </button>
            <span className="px-3 text-xs text-gray-500">
              Page {page} / {pageCount}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
              disabled={page >= pageCount}
              className="px-2.5 py-1.5 rounded-lg text-xs text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
            >
              Next ›
            </button>
            <button
              onClick={() => setPage(pageCount)}
              disabled={page >= pageCount}
              className="px-2.5 py-1.5 rounded-lg text-xs text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
            >
              Last »
            </button>
          </div>
        </div>
      </div>

      {listError && <p className="mt-4 text-sm text-red-500">{listError}</p>}
    </div>
  );
}
