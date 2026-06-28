"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type FbPage = { id: string; pageId: string; name: string; category: string };
type User = { id: string; name: string; email: string; tokenExpiry: string; pages: FbPage[] };

function FacebookLandingInner() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState("");
  const [connecting, setConnecting] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  // Show error from URL (fallback redirect path)
  useEffect(() => {
    const e = searchParams.get("auth_error");
    if (e) setAuthError(decodeURIComponent(e));
  }, [searchParams]);

  const loadUser = useCallback(() => {
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

  useEffect(() => { loadUser(); }, [loadUser]);

  // Listen for popup postMessage
  useEffect(() => {
    function handleMessage(e: MessageEvent) {
      if (e.origin !== window.location.origin) return;
      if (e.data?.type === "fb_auth_success") {
        setConnecting(false);
        router.push("/facebook/pages");
      } else if (e.data?.type === "fb_auth_error") {
        setConnecting(false);
        setAuthError(e.data.error ?? "Authentication failed");
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [router]);

  function openAuthPopup() {
    setAuthError("");
    setConnecting(true);

    const w = 620, h = 700;
    const left = window.screenX + Math.round((window.outerWidth - w) / 2);
    const top = window.screenY + Math.round((window.outerHeight - h) / 2);

    const popup = window.open(
      "/api/auth/facebook",
      "fb_oauth",
      `width=${w},height=${h},left=${left},top=${top},resizable=yes,scrollbars=yes`
    );

    if (!popup) {
      // Popup blocked — fall back to full-page redirect
      window.location.href = "/api/auth/facebook";
      return;
    }

    // Detect if user closes popup without completing auth
    const timer = setInterval(() => {
      if (popup.closed) {
        clearInterval(timer);
        setConnecting(false);
      }
    }, 500);
  }

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
    <div className="flex items-center justify-center min-h-screen">
      <div
        data-testid="fb-login-card"
        className="bg-white rounded-2xl shadow-sm border border-gray-200 p-10 max-w-sm w-full text-center"
      >
        <div className="w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
          <span className="text-white text-2xl font-bold">f</span>
        </div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">Facebook Page Manager</h1>
        <p className="text-gray-500 text-sm mb-8">
          Connect your Facebook account to schedule and manage posts across your Pages.
        </p>

        {authError && (
          <div
            data-testid="auth-error"
            className="mb-4 text-sm text-red-600 bg-red-50 rounded-lg p-3"
          >
            {authError}
          </div>
        )}

        <button
          data-testid="connect-facebook-btn"
          onClick={openAuthPopup}
          disabled={connecting}
          className="flex items-center justify-center gap-2 w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-medium py-3 px-4 rounded-xl text-sm transition-colors"
        >
          <span className="text-lg leading-none">f</span>
          {connecting ? "Connecting…" : "Continue with Facebook"}
        </button>

        <p className="text-xs text-gray-400 mt-6">
          Requires <code>pages_manage_posts</code> and <code>pages_read_engagement</code> permissions.
        </p>
      </div>
    </div>
  );
}

export default function FacebookLanding() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen">
          <span className="text-gray-400 text-sm">Loading…</span>
        </div>
      }
    >
      <FacebookLandingInner />
    </Suspense>
  );
}
