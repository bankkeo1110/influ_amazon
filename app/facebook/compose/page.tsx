"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type SavedPage = { id: string; pageId: string; name: string; category: string };

type PostMode = "now" | "scheduled" | "recurring";

export default function ComposePage() {
  const [pages, setPages] = useState<SavedPage[]>([]);
  const [selectedPage, setSelectedPage] = useState<SavedPage | null>(null);
  const [message, setMessage] = useState("");
  const [link, setLink] = useState("");
  const [mode, setMode] = useState<PostMode>("now");
  const [scheduledTime, setScheduledTime] = useState("");
  const [intervalDays, setIntervalDays] = useState(2);
  const [recurringCount, setRecurringCount] = useState(5);
  const [recurringStart, setRecurringStart] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok?: boolean; error?: string } | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    fetch("/api/facebook/me")
      .then((r) => r.json())
      .then((d) => {
        if (!d.user) { router.push("/facebook"); return; }
        setPages(d.user.pages);
        if (d.user.pages.length > 0) setSelectedPage(d.user.pages[0]);
        setAuthLoading(false);
      });
  }, [router]);

  // Default scheduled time to 1 hour from now
  useEffect(() => {
    const d = new Date(Date.now() + 60 * 60 * 1000);
    d.setSeconds(0, 0);
    setScheduledTime(d.toISOString().slice(0, 16));
    const s = new Date(Date.now() + 20 * 60 * 1000);
    s.setSeconds(0, 0);
    setRecurringStart(s.toISOString().slice(0, 16));
  }, []);

  async function handleSubmit() {
    if (!selectedPage || !message.trim()) return;
    setSubmitting(true);
    setResult(null);

    if (mode === "recurring") {
      const res = await fetch("/api/facebook/posts/recurring", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fbPageId: selectedPage.pageId,
          pageId: selectedPage.id,
          startDate: new Date(recurringStart).toISOString(),
          intervalDays,
          count: recurringCount,
        }),
      });
      const data = await res.json();
      setResult(data.error ? { error: data.error } : { ok: true });
    } else {
      const res = await fetch("/api/facebook/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fbPageId: selectedPage.pageId,
          pageId: selectedPage.id,
          message,
          link: link || undefined,
          scheduledTime: mode === "scheduled" ? new Date(scheduledTime).toISOString() : undefined,
        }),
      });
      const data = await res.json();
      if (data.error) {
        setResult({ error: data.error });
      } else {
        setResult({ ok: true });
        setMessage("");
        setLink("");
      }
    }
    setSubmitting(false);
  }

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <span className="text-gray-400 text-sm">Loading…</span>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Compose Post</h1>
        <p className="text-gray-500 text-sm mt-1">
          Publish now, schedule for later, or kick off a recurring series from your content queue.
        </p>
      </div>

      {/* Page selector */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5 shadow-sm">
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
          Page
        </label>
        {pages.length === 0 ? (
          <p className="text-sm text-gray-500">
            No pages saved.{" "}
            <a href="/facebook/pages" className="text-blue-600 hover:underline">
              Select pages →
            </a>
          </p>
        ) : (
          <div className="flex flex-wrap gap-2 items-center">
            {pages.map((p) => (
              <button
                key={p.id}
                onClick={() => setSelectedPage(p)}
                className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                  selectedPage?.id === p.id
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white text-gray-700 border-gray-200 hover:border-blue-300"
                }`}
              >
                {p.name}
              </button>
            ))}
            <a
              href="/facebook/pages"
              className="px-3 py-1.5 rounded-lg text-sm border border-dashed border-gray-300 text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors"
            >
              + Add Page
            </a>
          </div>
        )}
      </div>

      {/* Mode selector */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5 shadow-sm">
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
          Post Mode
        </label>
        <div className="flex gap-2">
          {(["now", "scheduled", "recurring"] as PostMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                mode === m
                  ? "bg-gray-900 text-white border-gray-900"
                  : "text-gray-600 border-gray-200 hover:border-gray-400"
              }`}
            >
              {m === "now" ? "Publish Now" : m === "scheduled" ? "Schedule" : "Recurring Series"}
            </button>
          ))}
        </div>
      </div>

      {/* Message composer (not shown for recurring — uses queue) */}
      {mode !== "recurring" && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5 shadow-sm">
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Post Message
          </label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="What's on your mind?"
            rows={5}
            className="w-full border border-gray-200 rounded-lg p-3 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mt-4 mb-2">
            Link <span className="font-normal text-gray-400">(optional)</span>
          </label>
          <input
            type="url"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="https://example.com"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      )}

      {/* Scheduled time picker */}
      {mode === "scheduled" && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5 shadow-sm">
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Publish Date & Time
          </label>
          <input
            type="datetime-local"
            value={scheduledTime}
            onChange={(e) => setScheduledTime(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="text-xs text-gray-400 mt-2">
            Must be at least 10 minutes in the future. Facebook handles the actual publish timing.
          </p>
        </div>
      )}

      {/* Recurring options */}
      {mode === "recurring" && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5 shadow-sm">
          <p className="text-sm text-gray-700 mb-4">
            Pulls drafts from your{" "}
            <a href="/facebook/queue" className="text-blue-600 hover:underline">
              Content Queue
            </a>{" "}
            and schedules them as individual posts spaced by the interval you choose.
          </p>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                Start Date & Time
              </label>
              <input
                type="datetime-local"
                value={recurringStart}
                onChange={(e) => setRecurringStart(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                Interval (days)
              </label>
              <input
                type="number"
                min={1}
                max={30}
                value={intervalDays}
                onChange={(e) => setIntervalDays(Number(e.target.value))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                # of Posts
              </label>
              <input
                type="number"
                min={1}
                max={50}
                value={recurringCount}
                onChange={(e) => setRecurringCount(Number(e.target.value))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>
      )}

      {/* Result feedback */}
      {result && (
        <div
          className={`mb-5 rounded-lg p-4 text-sm ${
            result.ok
              ? "bg-green-50 border border-green-200 text-green-700"
              : "bg-red-50 border border-red-200 text-red-700"
          }`}
        >
          {result.ok
            ? mode === "recurring"
              ? "Recurring series scheduled successfully! Check the Dashboard to view them."
              : mode === "scheduled"
              ? "Post scheduled! Facebook will publish it at the chosen time."
              : "Post published successfully!"
            : `Error: ${result.error}`}
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={
          submitting ||
          !selectedPage ||
          (mode !== "recurring" && !message.trim())
        }
        className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium py-3 rounded-xl text-sm transition-colors"
      >
        {submitting
          ? "Submitting…"
          : mode === "now"
          ? "Publish Now"
          : mode === "scheduled"
          ? "Schedule Post"
          : "Schedule Recurring Series"}
      </button>
    </div>
  );
}
