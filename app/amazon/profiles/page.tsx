"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const STATUSES = [
  "Step 1",
  "Submitted L1",
  "Submitted L2",
  "Submitted L3",
  "Rejected",
  "Approved",
] as const;

type Status = (typeof STATUSES)[number];

type Profile = {
  id: string;
  mail: string;
  ip: string;
  shopUrl: string;
  status: Status;
  createdAt: string;
};

type DraftRow = Omit<Profile, "createdAt"> & { isNew?: boolean; deleted?: boolean };

const STATUS_COLORS: Record<Status, string> = {
  "Step 1": "bg-gray-100 text-gray-600",
  "Submitted L1": "bg-blue-50 text-blue-700",
  "Submitted L2": "bg-indigo-50 text-indigo-700",
  "Submitted L3": "bg-violet-50 text-violet-700",
  Rejected: "bg-red-50 text-red-600",
  Approved: "bg-green-50 text-green-700",
};

function newBlankRow(): DraftRow {
  return { id: `new-${Date.now()}`, mail: "", ip: "", shopUrl: "", status: "Step 1", isNew: true };
}

export default function AmazonProfilesPage() {
  const [rows, setRows] = useState<DraftRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saveMsg, setSaveMsg] = useState("");
  const [dirty, setDirty] = useState(false);

  // ids of rows that have been edited but not yet saved
  const dirtyIds = useRef<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/amazon/profiles");
      const data = await res.json();
      if (data.error) { setError(data.error); return; }
      setRows((data.rows as Profile[]).map((r) => ({ ...r })));
      dirtyIds.current.clear();
      setDirty(false);
    } catch {
      setError("Could not load profiles.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function markDirty(id: string) {
    dirtyIds.current.add(id);
    setDirty(true);
    setSaveMsg("");
  }

  function updateCell(id: string, field: keyof Omit<DraftRow, "id" | "isNew" | "deleted">, value: string) {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: value } : r))
    );
    markDirty(id);
  }

  function addRow() {
    const blank = newBlankRow();
    setRows((prev) => [...prev, blank]);
    markDirty(blank.id);
  }

  function deleteRow(id: string) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, deleted: true } : r)));
    markDirty(id);
    setDirty(true);
  }

  async function handleSave() {
    setSaving(true);
    setSaveMsg("");
    setError("");

    const toDelete = rows.filter((r) => r.deleted && !r.isNew);
    const toCreate = rows.filter((r) => r.isNew && !r.deleted && r.mail.trim());
    const toUpdate = rows.filter(
      (r) => !r.isNew && !r.deleted && dirtyIds.current.has(r.id)
    );

    try {
      // deletions
      await Promise.all(
        toDelete.map((r) => fetch(`/api/amazon/profiles?id=${r.id}`, { method: "DELETE" }))
      );

      // new rows
      await Promise.all(
        toCreate.map((r) =>
          fetch("/api/amazon/profiles", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ mail: r.mail, ip: r.ip, shopUrl: r.shopUrl, status: r.status }),
          })
        )
      );

      // updates
      if (toUpdate.length) {
        const res = await fetch("/api/amazon/profiles", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            updates: toUpdate.map(({ id, mail, ip, shopUrl, status }) => ({
              id, mail, ip, shopUrl, status,
            })),
          }),
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
      }

      await load();
      setSaveMsg("Saved successfully.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  const visible = rows.filter((r) => !r.deleted);

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Amazon Profiles</h1>
        <p className="text-gray-400 text-sm mt-1">
          Manage Amazon influencer accounts — click any cell to edit inline, then save.
        </p>
      </div>

      {error && (
        <div className="mb-4 text-sm text-red-600 bg-red-50 rounded-xl px-4 py-2">{error}</div>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left bg-gray-50/60">
                <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-widest w-[220px]">Mail</th>
                <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-widest w-[140px]">IP</th>
                <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-widest">Shop URL</th>
                <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-widest w-[160px]">Status</th>
                <th className="px-4 py-3 w-10" />
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-gray-300">Loading…</td>
                </tr>
              )}
              {!loading && visible.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-gray-300">
                    No profiles yet — add one below.
                  </td>
                </tr>
              )}
              {visible.map((row) => (
                <tr key={row.id} className="border-b border-gray-50 last:border-0 group">
                  <td className="px-2 py-1.5">
                    <input
                      type="email"
                      value={row.mail}
                      onChange={(e) => updateCell(row.id, "mail", e.target.value)}
                      placeholder="account@example.com"
                      className="w-full px-2 py-1.5 rounded-lg border border-transparent hover:border-gray-200 focus:border-gray-400 focus:outline-none text-gray-900 text-sm bg-transparent focus:bg-white transition-colors"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      type="text"
                      value={row.ip}
                      onChange={(e) => updateCell(row.id, "ip", e.target.value)}
                      placeholder="192.168.1.1"
                      className="w-full px-2 py-1.5 rounded-lg border border-transparent hover:border-gray-200 focus:border-gray-400 focus:outline-none text-gray-900 text-sm font-mono bg-transparent focus:bg-white transition-colors"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      type="text"
                      value={row.shopUrl}
                      onChange={(e) => updateCell(row.id, "shopUrl", e.target.value)}
                      placeholder="https://amazon.com/shop/handle"
                      className="w-full px-2 py-1.5 rounded-lg border border-transparent hover:border-gray-200 focus:border-gray-400 focus:outline-none text-gray-900 text-sm bg-transparent focus:bg-white transition-colors"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <select
                      value={row.status}
                      onChange={(e) => updateCell(row.id, "status", e.target.value)}
                      className={`w-full px-2 py-1.5 rounded-lg border border-transparent hover:border-gray-200 focus:border-gray-400 focus:outline-none text-sm font-medium cursor-pointer transition-colors ${STATUS_COLORS[row.status]}`}
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    <button
                      onClick={() => deleteRow(row.id)}
                      title="Delete row"
                      className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-all text-base leading-none"
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer toolbar */}
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-gray-100 bg-gray-50/40">
          <button
            onClick={addRow}
            className="text-sm text-gray-500 hover:text-gray-900 font-medium transition-colors flex items-center gap-1"
          >
            <span className="text-lg leading-none">+</span> Add row
          </button>
          <div className="flex items-center gap-3">
            {saveMsg && <span className="text-xs text-green-600">{saveMsg}</span>}
            <button
              onClick={handleSave}
              disabled={saving || !dirty}
              className="bg-gray-900 hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed text-white px-5 py-2 rounded-xl text-sm font-medium transition-colors"
            >
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
