"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

type SavedPage = { id: string; pageId: string; name: string };

type FbScheduledPost = {
  id: string;
  message: string;
  scheduled_publish_time: number;
  full_picture?: string;
};

type DbPost = {
  id: string;
  fbPostId: string | null;
  message: string;
  status: string;
  scheduledTime: string | null;
  isRecurring: boolean;
  errorMessage: string | null;
  createdAt: string;
};

type EditState = { id: string; message: string; scheduledTime: string } | null;

export default function DashboardPage() {
  const [pages, setPages] = useState<SavedPage[]>([]);
  const [selectedPage, setSelectedPage] = useState<SavedPage | null>(null);
  const [fbPosts, setFbPosts] = useState<FbScheduledPost[]>([]);
  const [dbPosts, setDbPosts] = useState<DbPost[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"live" | "db">("live");
  const [editState, setEditState] = useState<EditState>(null);
  const [saving, setSaving] = useState(false);
  const [cancelling, setCancelling] = useState<string | null>(null);
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

  const loadData = useCallback(async (page: SavedPage) => {
    setLoading(true);
    setError("");
    const [liveRes, dbRes] = await Promise.all([
      fetch(`/api/facebook/scheduled?fbPageId=${page.pageId}`),
      fetch(`/api/facebook/posts?pageId=${page.pageId}`),
    ]);
    const liveData = await liveRes.json();
    const dbData = await dbRes.json();

    if (liveData.error) setError(`Facebook API: ${liveData.error}`);
    else setFbPosts(liveData.posts ?? []);

    setDbPosts(dbData.posts ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (selectedPage) loadData(selectedPage);
  }, [selectedPage, loadData]);

  async function handleCancel(postId: string) {
    if (!confirm("Cancel this scheduled post? This cannot be undone.")) return;
    setCancelling(postId);
    const res = await fetch(`/api/facebook/posts/${postId}`, { method: "DELETE" });
    const data = await res.json();
    setCancelling(null);
    if (data.error) {
      setError(data.error);
    } else if (selectedPage) {
      loadData(selectedPage);
    }
  }

  async function handleSaveEdit() {
    if (!editState) return;
    setSaving(true);
    const res = await fetch(`/api/facebook/posts/${editState.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: editState.message,
        scheduledTime: new Date(editState.scheduledTime).toISOString(),
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (data.error) {
      setError(data.error);
    } else {
      setEditState(null);
      if (selectedPage) loadData(selectedPage);
    }
  }

  function formatTime(ts: number | string): string {
    const d = typeof ts === "number" ? new Date(ts * 1000) : new Date(ts);
    return d.toLocaleString(undefined, {
      month: "short", day: "numeric", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  }

  const scheduledDbPosts = dbPosts.filter((p) => p.status === "scheduled");
  const otherDbPosts = dbPosts.filter((p) => p.status !== "scheduled");

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Scheduled Posts</h1>
          <p className="text-gray-500 text-sm mt-1">
            Manage upcoming posts for your Facebook Pages.
          </p>
        </div>
        <a
          href="/facebook/compose"
          className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          + New Post
        </a>
      </div>

      {/* Page tabs */}
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

      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* View tabs */}
      <div className="flex border-b border-gray-200 mb-6">
        <button
          onClick={() => setActiveTab("live")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "live"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          Live on Facebook{" "}
          <span className="ml-1 text-xs text-gray-400">({fbPosts.length})</span>
        </button>
        <button
          onClick={() => setActiveTab("db")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "db"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          All Posts (local){" "}
          <span className="ml-1 text-xs text-gray-400">({dbPosts.length})</span>
        </button>
      </div>

      {loading ? (
        <div className="text-center text-gray-400 text-sm py-16">Loading posts…</div>
      ) : activeTab === "live" ? (
        /* Live scheduled posts from Facebook */
        fbPosts.length === 0 ? (
          <div className="text-center text-gray-400 text-sm py-16">
            No scheduled posts on this Page right now.
            <br />
            <a href="/facebook/compose" className="text-blue-500 hover:underline mt-2 block">
              Compose one →
            </a>
          </div>
        ) : (
          <div className="space-y-4">
            {fbPosts
              .slice()
              .sort((a, b) => a.scheduled_publish_time - b.scheduled_publish_time)
              .map((post) => {
                const dbMatch = dbPosts.find((d) => d.fbPostId === post.id);
                return (
                  <div
                    key={post.id}
                    className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm"
                  >
                    <div className="flex gap-4">
                      {post.full_picture && (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={post.full_picture}
                          alt=""
                          className="w-20 h-16 object-cover rounded-lg flex-shrink-0"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        {editState?.id === dbMatch?.id && editState ? (
                          <div className="space-y-2">
                            <textarea
                              value={editState.message}
                              onChange={(e) =>
                                setEditState((s) => s && { ...s, message: e.target.value })
                              }
                              rows={3}
                              className="w-full border border-gray-300 rounded-lg p-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            <input
                              type="datetime-local"
                              value={editState!.scheduledTime}
                              onChange={(e) =>
                                setEditState((s) => s && { ...s, scheduledTime: e.target.value })
                              }
                              className="border border-gray-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            <div className="flex gap-2">
                              <button
                                onClick={handleSaveEdit}
                                disabled={saving}
                                className="bg-blue-600 text-white px-3 py-1 rounded-lg text-xs font-medium hover:bg-blue-700 disabled:opacity-50"
                              >
                                {saving ? "Saving…" : "Save"}
                              </button>
                              <button
                                onClick={() => setEditState(null)}
                                className="text-gray-500 px-3 py-1 rounded-lg text-xs hover:bg-gray-100"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <p className="text-sm text-gray-800 line-clamp-3">{post.message}</p>
                            <div className="flex items-center gap-3 mt-2">
                              <span className="text-xs text-blue-600 font-medium">
                                📅 {formatTime(post.scheduled_publish_time)}
                              </span>
                              {dbMatch?.isRecurring && (
                                <span className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded">
                                  recurring
                                </span>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                      {editState?.id !== dbMatch?.id && (
                        <div className="flex flex-col gap-2 flex-shrink-0">
                          {dbMatch && (
                            <button
                              onClick={() =>
                                setEditState({
                                  id: dbMatch.id,
                                  message: post.message,
                                  scheduledTime: new Date(post.scheduled_publish_time * 1000)
                                    .toISOString()
                                    .slice(0, 16),
                                })
                              }
                              className="text-xs text-gray-500 hover:text-blue-600 px-2 py-1 rounded hover:bg-blue-50"
                            >
                              Edit
                            </button>
                          )}
                          {dbMatch && (
                            <button
                              onClick={() => handleCancel(dbMatch.id)}
                              disabled={cancelling === dbMatch.id}
                              className="text-xs text-red-400 hover:text-red-600 px-2 py-1 rounded hover:bg-red-50 disabled:opacity-50"
                            >
                              {cancelling === dbMatch.id ? "…" : "Cancel"}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
        )
      ) : (
        /* DB posts */
        <div className="space-y-4">
          {scheduledDbPosts.length > 0 && (
            <section>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                Scheduled
              </h3>
              {scheduledDbPosts.map((post) => (
                <DbPostRow
                  key={post.id}
                  post={post}
                  onCancel={() => handleCancel(post.id)}
                  cancelling={cancelling === post.id}
                  formatTime={formatTime}
                />
              ))}
            </section>
          )}
          {otherDbPosts.length > 0 && (
            <section>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 mt-6">
                History
              </h3>
              {otherDbPosts.map((post) => (
                <DbPostRow
                  key={post.id}
                  post={post}
                  onCancel={() => {}}
                  cancelling={false}
                  formatTime={formatTime}
                />
              ))}
            </section>
          )}
          {dbPosts.length === 0 && (
            <div className="text-center text-gray-400 text-sm py-16">
              No posts recorded yet.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DbPostRow({
  post,
  onCancel,
  cancelling,
  formatTime,
}: {
  post: DbPost;
  onCancel: () => void;
  cancelling: boolean;
  formatTime: (ts: string | number) => string;
}) {
  const statusColors: Record<string, string> = {
    published: "bg-green-100 text-green-700",
    scheduled: "bg-blue-100 text-blue-700",
    cancelled: "bg-gray-100 text-gray-500",
    failed: "bg-red-100 text-red-700",
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm mb-3">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm text-gray-800 line-clamp-2">{post.message}</p>
          {post.scheduledTime && (
            <p className="text-xs text-gray-500 mt-1">
              📅 {formatTime(post.scheduledTime)}
            </p>
          )}
          {post.errorMessage && (
            <p className="text-xs text-red-500 mt-1">{post.errorMessage}</p>
          )}
          <div className="flex items-center gap-2 mt-2">
            <span
              className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                statusColors[post.status] ?? "bg-gray-100 text-gray-600"
              }`}
            >
              {post.status}
            </span>
            {post.isRecurring && (
              <span className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded">
                recurring
              </span>
            )}
          </div>
        </div>
        {post.status === "scheduled" && (
          <button
            onClick={onCancel}
            disabled={cancelling}
            className="text-xs text-red-400 hover:text-red-600 px-2 py-1 rounded hover:bg-red-50 disabled:opacity-50 flex-shrink-0"
          >
            {cancelling ? "…" : "Cancel"}
          </button>
        )}
      </div>
    </div>
  );
}
