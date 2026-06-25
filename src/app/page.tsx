"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import PostCard from "@/components/PostCard";
import CreatePostModal from "@/components/CreatePostModal";
import { Post } from "@/lib/constants";

const TABS = [
  { key: "ALL", label: "Tất cả" },
  { key: "FIND_PARTNER", label: "Tìm bạn" },
  { key: "COURT", label: "Sân trống" },
] as const;

export default function HomePage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [tab, setTab] = useState<string>("ALL");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleSearchChange(value: string) {
    setSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(value), 350);
  }

  const fetchPosts = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (tab !== "ALL") params.set("type", tab);
    if (debouncedSearch) params.set("q", debouncedSearch);
    const res = await fetch(`/api/posts?${params.toString()}`);
    const data = await res.json();
    setPosts(data);
    setLoading(false);
  }, [tab, debouncedSearch]);

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  return (
    <div className="mx-auto min-h-screen max-w-md bg-shuttle-line pb-24">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-court/10 bg-white/90 px-4 py-3 backdrop-blur">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-base font-bold text-court-dark">
            🏸 BadmintonDN
          </h1>
          <span className="text-xs text-ink/40">Đà Nẵng</span>
        </div>
        <div className="mt-2 flex gap-1.5">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`rounded-md px-3 py-1 text-xs font-medium ${
                tab === t.key
                  ? "bg-court-light text-court-dark"
                  : "text-ink/50 hover:bg-shuttle-line"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <input
          className="mt-2 w-full"
          placeholder="Tìm theo sân, khu vực..."
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
        />
      </header>

      {/* Feed */}
      <main className="space-y-3 p-4">
        {loading ? (
          <p className="py-10 text-center text-sm text-ink/40">Đang tải...</p>
        ) : posts.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-sm text-ink/50">Chưa có bài đăng nào.</p>
            <p className="mt-1 text-xs text-ink/35">
              Hãy là người đầu tiên đăng tin tìm bạn hoặc sân trống!
            </p>
          </div>
        ) : (
          posts.map((p) => <PostCard key={p.id} post={p} />)
        )}
      </main>

      {/* FAB */}
      <button
        onClick={() => setShowModal(true)}
        className="fixed bottom-6 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-full bg-court px-5 py-3 text-sm font-medium text-white shadow-lg hover:bg-court-dark"
      >
        <span className="text-base leading-none">+</span> Đăng bài
      </button>

      {showModal && (
        <CreatePostModal
          onClose={() => setShowModal(false)}
          onCreated={() => {
            setShowModal(false);
            fetchPosts();
          }}
        />
      )}
    </div>
  );
}
