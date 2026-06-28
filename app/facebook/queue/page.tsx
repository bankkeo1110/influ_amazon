"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

type SavedPage = { id: string; pageId: string; name: string; category: string };
type QueueItem = {
  id: string;
  message: string;
  link: string | null;
  sortOrder: number;
  consumed: boolean;
  createdAt: string;
};

export default function ContentQueuePage() {
  const [pages, setPages] = useState<SavedPage[]>([]);
  const [selectedPage, setSelectedPage] = useState<SavedPage | null>(null);
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [newMessage, setNewMessage] = useState("");
  const [newLink, setNewLink] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");
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

  const loadQueue = useCallback(async (page: SavedPage) => {
    setLoadingItems(true);
    const res = await fetch(`/api/facebook/queue?pageId=${page.id}`);
    const data = await res.json();
    setItems(data.items ?? []);
    setLoadingItems(false);
  }, []);

  useEffect(() => {
    if (selectedPage) loadQueue(selectedPage);
  }, [selectedPage, loadQueue]);

  async function handleAdd() {
    if (!selectedPage || !newMessage.trim()) return;
    setAdding(true);
    setError("");
    const res = await fetch("/api/facebook/queue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pageId: selectedPage.id,
        message: newMessage,
        link: newLink || undefined,
      }),
    });
    const data = await res.json();
    setAdding(false);
    if (data.error) {
      setError(data.error);
    } else {
      setNewMessage("");
      setNewLink("");
      loadQueue(selectedPage);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Remove this draft from the queue?")) return;
    await fetch(`/api/facebook/queue/${id}`, { method: "DELETE" });
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  const pending = items.filter((i) => !i.consumed);
  const consumed = items.filter((i) => i.consumed);

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Content Queue</h1>
        <p className="text-gray-500 text-sm mt-1">
          Stage draft posts here. The recurring scheduler pulls from this queue in order.
        </p>
      </div>

      {/* Page selector */}
      {pages.length > 1 && (
        <div className="flex gap-2 mb-6 flex-wrap">
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
        </div>
      )}

      {/* Add new draft */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-8 shadow-sm">
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
          Add Draft to Queue
        </label>
        <textarea
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          placeholder="Write your post content…"
          rows={4}
          className="w-full border border-gray-200 rounded-lg p-3 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-blue-500 mb-3"
        />
        <input
          type="url"
          value={newLink}
          onChange={(e) => setNewLink(e.target.value)}
          placeholder="Optional link (https://…)"
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mb-3"
        />
        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
        <button
          onClick={handleAdd}
          disabled={adding || !newMessage.trim()}
          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          {adding ? "Adding…" : "Add to Queue"}
        </button>
      </div>

      {/* Queue list */}
      {loadingItems ? (
        <div className="text-center text-gray-400 text-sm py-12">Loading queue…</div>
      ) : (
        <>
          {/* Pending items */}
          <div className="mb-8">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">
              Pending{" "}
              <span className="text-gray-400 font-normal">({pending.length})</span>
            </h2>
            {pending.length === 0 ? (
              <div className="text-sm text-gray-400 bg-gray-50 rounded-xl border border-gray-100 p-6 text-center">
                Queue is empty. Add some drafts above.
              </div>
            ) : (
              <div className="space-y-3">
                {pending.map((item, i) => (
                  <div
                    key={item.id}
                    className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm"
                  >
                    <div className="flex items-start gap-3">
                      <span className="text-xs font-mono text-gray-300 pt-0.5 w-5 flex-shrink-0">
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-800 whitespace-pre-wrap">{item.message}</p>
                        {item.link && (
                          <a
                            href={item.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-blue-500 hover:underline mt-1 block truncate"
                          >
                            {item.link}
                          </a>
                        )}
                        <p className="text-xs text-gray-400 mt-2">
                          Added {new Date(item.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <button
                        onClick={() => handleDelete(item.id)}
                        className="text-xs text-red-400 hover:text-red-600 flex-shrink-0 px-2 py-1 rounded hover:bg-red-50"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Consumed items */}
          {consumed.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-gray-400 mb-3">
                Used by Scheduler{" "}
                <span className="font-normal">({consumed.length})</span>
              </h2>
              <div className="space-y-2">
                {consumed.map((item) => (
                  <div
                    key={item.id}
                    className="bg-gray-50 rounded-xl border border-gray-100 p-4 opacity-60"
                  >
                    <p className="text-sm text-gray-500 line-clamp-2">{item.message}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
