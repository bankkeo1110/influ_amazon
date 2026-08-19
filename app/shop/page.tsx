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
  warning?: string;
};

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
  const [refresh, setRefresh] = useState(false);
  const [crawling, setCrawling] = useState(false);
  const [crawlError, setCrawlError] = useState("");
  const [crawlResult, setCrawlResult] = useState<CrawlResult | null>(null);

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
        body: JSON.stringify({ query, maxResults, maxVideoPages, refresh }),
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
          Amazon influencer storefronts discovered from a{" "}
          <code className="text-gray-500">site:</code> search, with their video counts.
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
          </p>
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
