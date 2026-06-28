"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type FbPage = { id: string; name: string; category: string; access_token: string };

export default function PagesSelector() {
  const [pages, setPages] = useState<FbPage[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  useEffect(() => {
    fetch("/api/facebook/pages")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) {
          if (d.error === "Unauthorized") router.push("/facebook");
          else setError(d.error);
        } else {
          setPages(d.pages ?? []);
          // Pre-select all
          setSelected(new Set(d.pages.map((p: FbPage) => p.id)));
        }
        setLoading(false);
      });
  }, [router]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function handleSave() {
    if (selected.size === 0) return;
    setSaving(true);
    setError("");
    const toSave = pages.filter((p) => selected.has(p.id));
    const res = await fetch("/api/facebook/pages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pages: toSave }),
    });
    const data = await res.json();
    setSaving(false);
    if (data.error) {
      setError(data.error);
    } else {
      router.push("/facebook/dashboard");
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <span className="text-gray-400 text-sm">Fetching your pages…</span>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-12">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Select Pages to Manage</h1>
      <p className="text-gray-500 text-sm mb-8">
        Choose which Facebook Pages you want to schedule and manage posts for.
      </p>

      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {pages.length === 0 && !error && (
        <div className="text-gray-500 text-sm bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          No Pages found. Make sure you granted <strong>pages_show_list</strong> permission and
          you are an admin of at least one Page.
        </div>
      )}

      <div className="space-y-3 mb-8">
        {pages.map((page) => {
          const checked = selected.has(page.id);
          return (
            <label
              key={page.id}
              className={`flex items-center gap-4 p-4 rounded-xl border cursor-pointer transition-colors ${
                checked
                  ? "border-blue-500 bg-blue-50"
                  : "border-gray-200 bg-white hover:bg-gray-50"
              }`}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggle(page.id)}
                className="w-4 h-4 accent-blue-600"
              />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 text-sm">{page.name}</p>
                {page.category && (
                  <p className="text-xs text-gray-500 mt-0.5">{page.category}</p>
                )}
              </div>
              <span className="text-xs text-gray-400 font-mono">{page.id}</span>
            </label>
          );
        })}
      </div>

      <button
        onClick={handleSave}
        disabled={saving || selected.size === 0}
        className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium py-3 rounded-xl text-sm transition-colors"
      >
        {saving ? "Saving…" : `Save ${selected.size} Page${selected.size !== 1 ? "s" : ""}`}
      </button>
    </div>
  );
}
