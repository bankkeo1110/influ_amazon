"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type FbPage = { id: string; pageId: string; name: string; category: string };
type User = { id: string; name: string; email: string; tokenExpiry: string; pages: FbPage[] };

export default function FacebookLanding() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const searchParams = useSearchParams();
  const authError = searchParams.get("auth_error");

  useEffect(() => {
    fetch("/api/facebook/me")
      .then((r) => r.json())
      .then((d) => {
        setUser(d.user);
        setLoading(false);
        if (d.user && d.user.pages.length > 0) {
          router.replace("/facebook/dashboard");
        }
      });
  }, [router]);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <span className="text-gray-400 text-sm">Loading…</span>
      </div>
    );
  }

  if (user && user.pages.length === 0) {
    return (
      <div className="max-w-lg mx-auto mt-24 px-4 text-center">
        <p className="text-gray-700 mb-4">
          Logged in as <strong>{user.name}</strong>. No pages saved yet.
        </p>
        <a
          href="/facebook/pages"
          className="inline-block bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-blue-700"
        >
          Select Pages to Manage →
        </a>
        <button
          onClick={handleLogout}
          className="block mx-auto mt-4 text-sm text-gray-400 hover:text-red-500"
        >
          Logout
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-10 max-w-sm w-full text-center">
        <div className="w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
          <span className="text-white text-2xl font-bold">f</span>
        </div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">Facebook Page Manager</h1>
        <p className="text-gray-500 text-sm mb-8">
          Connect your Facebook account to schedule and manage posts across your Pages.
        </p>

        {authError && (
          <div className="mb-4 text-sm text-red-600 bg-red-50 rounded-lg p-3">
            Auth error: {decodeURIComponent(authError)}
          </div>
        )}

        <a
          href="/api/auth/facebook"
          className="flex items-center justify-center gap-2 w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-xl text-sm transition-colors"
        >
          <span className="text-lg leading-none">f</span>
          Continue with Facebook
        </a>

        <p className="text-xs text-gray-400 mt-6">
          Requires <code>pages_manage_posts</code> and <code>pages_read_engagement</code> permissions.
        </p>
      </div>
    </div>
  );
}
