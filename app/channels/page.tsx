"use client";
/* eslint-disable @next/next/no-img-element */

import { useState, useEffect, useCallback, useRef } from "react";

const ACCENT = "#E05540";
const POLL_INTERVAL_MS = 5000;
// If a query has been "pending" longer than this, the background job likely died with
// the dev server (e.g. a restart) rather than still being genuinely in progress.
const STALE_PENDING_MS = 15 * 60 * 1000;

type ChannelStatus = "pending" | "done" | "error";

type ChannelResult = {
  id: string;
  name: string;
  handle: string | null;
  url: string;
  thumbnailUrl: string | null;
  subscriberText: string | null;
  avgLengthSec: number | null;
  description: string | null;
};

type ChannelQuery = {
  id: string;
  query: string;
  status: ChannelStatus;
  error: string | null;
  createdAt: string;
  channels: ChannelResult[];
};

function formatLength(sec: number | null): string {
  if (sec === null) return "—";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function IconChevron({ open }: { open: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="transition-transform duration-150"
      style={{ transform: open ? "rotate(90deg)" : "rotate(0deg)" }}
    >
      <path d="M4 2l4 4-4 4" />
    </svg>
  );
}

function ChannelTable({ channels }: { channels: ChannelResult[] }) {
  if (channels.length === 0) {
    return (
      <div className="px-6 py-8 text-center text-gray-300 text-sm">
        No qualifying channels found for this query.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100">
            <th className="text-left px-6 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-widest">
              Channel
            </th>
            <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-widest">
              Subscribers
            </th>
            <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-widest">
              Avg. length
            </th>
            <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-widest">
              Description
            </th>
          </tr>
        </thead>
        <tbody>
          {channels.map((c) => (
            <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50/60 transition-colors">
              <td className="px-6 py-3 align-top">
                <a
                  href={c.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2.5 group"
                >
                  {c.thumbnailUrl ? (
                    <img
                      src={c.thumbnailUrl}
                      alt={c.name}
                      className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-gray-100 flex-shrink-0" />
                  )}
                  <span className="min-w-0">
                    <span className="block text-xs font-semibold text-gray-800 group-hover:text-gray-600 transition-colors line-clamp-1">
                      {c.name}
                    </span>
                    {c.handle && (
                      <span className="block text-[11px] text-gray-400">{c.handle}</span>
                    )}
                  </span>
                </a>
              </td>
              <td className="px-4 py-3 align-top text-xs text-gray-500 whitespace-nowrap">
                {c.subscriberText ?? "—"}
              </td>
              <td className="px-4 py-3 align-top text-xs text-gray-500 font-mono whitespace-nowrap">
                {formatLength(c.avgLengthSec)}
              </td>
              <td className="px-4 py-3 align-top text-xs text-gray-500 max-w-md line-clamp-2">
                {c.description || "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusBadge({ item }: { item: ChannelQuery }) {
  if (item.status === "done") {
    return <span>{item.channels.length} channels</span>;
  }
  if (item.status === "error") {
    return <span className="text-red-500 font-medium">Failed</span>;
  }
  const stale = Date.now() - new Date(item.createdAt).getTime() > STALE_PENDING_MS;
  if (stale) {
    return <span className="text-amber-500 font-medium">Stuck — may need a re-run</span>;
  }
  return (
    <span className="flex items-center gap-1.5" style={{ color: ACCENT }}>
      <span className="inline-block w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: ACCENT }} />
      Searching…
    </span>
  );
}

function QueryRow({ item, defaultOpen }: { item: ChannelQuery; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border-b border-gray-50 last:border-b-0">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-gray-50/60 transition-colors"
      >
        <span className="flex items-center gap-2.5 min-w-0">
          <span className="text-gray-300 flex-shrink-0">
            <IconChevron open={open} />
          </span>
          <span className="font-semibold text-gray-900 text-sm truncate">{item.query}</span>
        </span>
        <span className="flex items-center gap-4 flex-shrink-0 text-xs text-gray-400">
          <StatusBadge item={item} />
          <span>{new Date(item.createdAt).toLocaleString()}</span>
        </span>
      </button>
      {open && item.status === "done" && <ChannelTable channels={item.channels} />}
      {open && item.status === "pending" && (
        <div className="px-6 py-8 text-center text-gray-400 text-sm animate-pulse">
          Checking candidate channels for video length — this can take several minutes.
          Feel free to leave this page; results will be here when you come back.
        </div>
      )}
      {open && item.status === "error" && (
        <div className="px-6 py-8 text-center text-red-400 text-sm">
          {item.error || "Something went wrong."}
        </div>
      )}
    </div>
  );
}

export default function ChannelsPage() {
  const [input, setInput] = useState("");
  const [queries, setQueries] = useState<ChannelQuery[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [historyLoading, setHistoryLoading] = useState(true);
  const [latestId, setLatestId] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadHistory = useCallback(async () => {
    const res = await fetch("/api/channels/history");
    const data = await res.json();
    if (data.queries) setQueries(data.queries);
    setHistoryLoading(false);
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  // Poll while anything is still pending — this is what lets you leave the page and
  // come back to find results, since the scrape runs server-side regardless.
  useEffect(() => {
    const hasPending = queries.some((q) => q.status === "pending");
    if (hasPending && !pollRef.current) {
      pollRef.current = setInterval(loadHistory, POLL_INTERVAL_MS);
    } else if (!hasPending && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [queries, loadHistory]);

  async function handleSearch() {
    const trimmed = input.trim();
    if (!trimmed) {
      setError("Please enter a request.");
      return;
    }

    setSubmitting(true);
    setError("");

    const res = await fetch("/api/channels/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: trimmed }),
    });

    const data = await res.json();
    setSubmitting(false);

    if (data.error) {
      setError(data.error);
      return;
    }

    if (data.result) setLatestId(data.result.id);
    await loadHistory();
    setInput("");
  }

  async function handleClear() {
    if (!confirm("Delete all saved queries?")) return;
    await fetch("/api/channels/history", { method: "DELETE" });
    setQueries([]);
  }

  return (
    <div className="min-h-screen px-6 py-8 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="mb-7">
        <h1 className="text-[26px] font-bold text-gray-900 tracking-tight">Channel Finder</h1>
        <p className="text-gray-400 text-sm mt-1">
          Find faceless YouTube channels for quick reviews — filtered to an average video
          length under 4 minutes.
        </p>
      </div>

      {/* Input card */}
      <div className="bg-white rounded-2xl p-6 mb-5 shadow-sm border border-black/5">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          What kind of channels are you looking for?
        </label>
        <textarea
          className="w-full border border-gray-200 rounded-xl p-3 text-sm h-24 resize-y focus:outline-none focus:ring-2 transition-shadow placeholder:text-gray-300"
          style={{ "--tw-ring-color": ACCENT } as React.CSSProperties}
          placeholder="e.g. faceless tool review channels that unbox and review power tools"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSearch();
          }}
        />
        <div className="flex items-center gap-3 mt-4">
          <button
            onClick={handleSearch}
            disabled={submitting}
            className="flex items-center gap-2 text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-opacity disabled:opacity-50"
            style={{ background: ACCENT }}
          >
            {submitting ? "Starting…" : "Find Channels"}
          </button>
          <span className="text-sm text-gray-400">
            Runs in the background — the query appears below immediately and fills in as it
            completes. You can leave this page.
          </span>
          {error && <span className="text-sm text-red-500">{error}</span>}
        </div>
      </div>

      {/* History card */}
      <div className="bg-white rounded-2xl shadow-sm border border-black/5 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800 text-sm">
            Past Queries <span className="text-gray-400 font-normal">{queries.length}</span>
          </h2>
          <button
            onClick={handleClear}
            className="text-sm font-medium px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors"
            style={{ color: ACCENT }}
          >
            Clear all
          </button>
        </div>

        {historyLoading ? (
          <div className="p-14 text-center text-gray-300 text-sm">Loading saved queries…</div>
        ) : queries.length === 0 ? (
          <div className="p-14 text-center text-gray-300 text-sm">
            No queries yet — describe the kind of channels you want above and click Find
            Channels.
          </div>
        ) : (
          <div>
            {queries.map((q) => (
              <QueryRow key={q.id} item={q} defaultOpen={q.id === latestId} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
