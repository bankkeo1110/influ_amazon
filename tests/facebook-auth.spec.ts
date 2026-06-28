import { test, expect, Page } from "@playwright/test";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Mock /api/facebook/me to return no session (logged-out state) */
async function mockLoggedOut(page: Page) {
  await page.route("/api/facebook/me", (route) =>
    route.fulfill({ json: { user: null } })
  );
}

/** Mock /api/facebook/me to return a logged-in user with pages */
async function mockLoggedIn(page: Page, pages = mockPages) {
  await page.route("/api/facebook/me", (route) =>
    route.fulfill({
      json: {
        user: {
          id: "user_1",
          name: "Test User",
          email: "test@example.com",
          tokenExpiry: new Date(Date.now() + 86400000).toISOString(),
          pages,
        },
      },
    })
  );
}

const mockPages = [
  { id: "dbpage_1", pageId: "111111111", name: "My Coffee Shop",   category: "Food & Beverage" },
  { id: "dbpage_2", pageId: "222222222", name: "Tech Blog Page",   category: "Technology" },
];

const mockFbPages = [
  { id: "111111111", name: "My Coffee Shop",   category: "Food & Beverage", access_token: "tok_aaa" },
  { id: "222222222", name: "Tech Blog Page",   category: "Technology",       access_token: "tok_bbb" },
];

// ─── Landing page ─────────────────────────────────────────────────────────────

test.describe("Facebook landing page", () => {
  test("shows Connect button when logged out", async ({ page }) => {
    await mockLoggedOut(page);
    await page.goto("/facebook");

    await expect(page.getByTestId("connect-facebook-btn")).toBeVisible();
    await expect(page.getByTestId("connect-facebook-btn")).toHaveText(/Continue with Facebook/i);
  });

  test("shows no error banner by default", async ({ page }) => {
    await mockLoggedOut(page);
    await page.goto("/facebook");

    await expect(page.getByTestId("auth-error")).not.toBeVisible();
  });

  test("shows auth error from URL param", async ({ page }) => {
    await mockLoggedOut(page);
    await page.goto("/facebook?auth_error=access_denied");

    await expect(page.getByTestId("auth-error")).toBeVisible();
    await expect(page.getByTestId("auth-error")).toContainText("access_denied");
  });

  test("redirects to dashboard when already logged in with pages", async ({ page }) => {
    await mockLoggedIn(page, mockPages);
    // Dashboard needs its own mocks to avoid errors
    await page.route("/api/facebook/scheduled**", (r) => r.fulfill({ json: { posts: [] } }));
    await page.route("/api/facebook/posts**",     (r) => r.fulfill({ json: { posts: [] } }));

    await page.goto("/facebook");
    await page.waitForURL("**/facebook/dashboard");
  });
});

// ─── Popup auth flow ──────────────────────────────────────────────────────────

test.describe("Facebook OAuth popup flow", () => {
  test("opens a popup when Connect button is clicked", async ({ page, context }) => {
    await mockLoggedOut(page);
    // Mock /api/auth/facebook to return a minimal popup page that closes immediately
    await page.route("/api/auth/facebook", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: `<script>window.close();</script>`,
      })
    );

    await page.goto("/facebook");

    const [popup] = await Promise.all([
      context.waitForEvent("page"),
      page.getByTestId("connect-facebook-btn").click(),
    ]);

    expect(popup).toBeTruthy();
    await popup.waitForLoadState();
  });

  test("navigates to /facebook/pages after successful popup auth", async ({ page }) => {
    await mockLoggedOut(page);
    await page.route("/api/facebook/pages", (r) =>
      r.fulfill({ json: { pages: mockFbPages } })
    );

    await page.goto("/facebook");
    await expect(page.getByTestId("connect-facebook-btn")).toBeVisible();

    // Simulate the postMessage that the real popup would send on success
    await page.evaluate(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: { type: "fb_auth_success" },
          origin: window.location.origin,
        })
      );
    });

    await page.waitForURL("**/facebook/pages", { timeout: 10_000 });
    expect(page.url()).toContain("/facebook/pages");
  });

  test("shows error message when popup reports auth failure", async ({ page }) => {
    await mockLoggedOut(page);
    await page.goto("/facebook");
    await expect(page.getByTestId("connect-facebook-btn")).toBeVisible();

    // Simulate the postMessage that the real popup would send on error
    await page.evaluate(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: { type: "fb_auth_error", error: "Permission denied by user" },
          origin: window.location.origin,
        })
      );
    });

    await expect(page.getByTestId("auth-error")).toBeVisible({ timeout: 8_000 });
    await expect(page.getByTestId("auth-error")).toContainText("Permission denied by user");
  });

  test("button shows Connecting… while popup is open", async ({ page, context }) => {
    await mockLoggedOut(page);

    // Popup that stays open (no close call)
    await page.route("/api/auth/facebook", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: `<html><body><p>Authorizing...</p></body></html>`,
      })
    );

    await page.goto("/facebook");

    const [popup] = await Promise.all([
      context.waitForEvent("page"),
      page.getByTestId("connect-facebook-btn").click(),
    ]);

    await expect(page.getByTestId("connect-facebook-btn")).toHaveText(/Connecting…/i);
    await expect(page.getByTestId("connect-facebook-btn")).toBeDisabled();

    await popup.close();
    // Button resets after popup is closed
    await expect(page.getByTestId("connect-facebook-btn")).toHaveText(/Continue with Facebook/i, { timeout: 3_000 });
  });
});

// ─── Page selection ───────────────────────────────────────────────────────────

test.describe("Facebook page selection", () => {
  test("lists pages fetched from Facebook", async ({ page }) => {
    await mockLoggedIn(page, []); // logged in but no pages saved yet
    await page.route("/api/facebook/pages", (route) =>
      route.fulfill({ json: { pages: mockFbPages } })
    );

    await page.goto("/facebook/pages");

    await expect(page.getByText("My Coffee Shop")).toBeVisible();
    await expect(page.getByText("Tech Blog Page")).toBeVisible();
  });

  test("all pages are pre-checked", async ({ page }) => {
    await mockLoggedIn(page, []);
    await page.route("/api/facebook/pages", (r) =>
      r.fulfill({ json: { pages: mockFbPages } })
    );

    await page.goto("/facebook/pages");

    const checkboxes = page.locator('input[type="checkbox"]');
    await expect(checkboxes.nth(0)).toBeChecked();
    await expect(checkboxes.nth(1)).toBeChecked();
  });

  test("can deselect a page", async ({ page }) => {
    await mockLoggedIn(page, []);
    await page.route("/api/facebook/pages", (r) =>
      r.fulfill({ json: { pages: mockFbPages } })
    );

    await page.goto("/facebook/pages");

    const firstCheckbox = page.locator('input[type="checkbox"]').nth(0);
    await firstCheckbox.uncheck();
    await expect(firstCheckbox).not.toBeChecked();

    await expect(page.getByRole("button", { name: /Save 1 Page/i })).toBeVisible();
  });

  test("Save button is disabled when nothing selected", async ({ page }) => {
    await mockLoggedIn(page, []);
    await page.route("/api/facebook/pages", (r) =>
      r.fulfill({ json: { pages: mockFbPages } })
    );

    await page.goto("/facebook/pages");

    // Uncheck both
    const checkboxes = page.locator('input[type="checkbox"]');
    await checkboxes.nth(0).uncheck();
    await checkboxes.nth(1).uncheck();

    await expect(page.getByRole("button", { name: /Save/i })).toBeDisabled();
  });

  test("redirects to dashboard after saving pages", async ({ page }) => {
    await mockLoggedIn(page, []);
    await page.route("/api/facebook/pages", async (route) => {
      if (route.request().method() === "GET") {
        return route.fulfill({ json: { pages: mockFbPages } });
      }
      return route.fulfill({ json: { ok: true, saved: 2 } });
    });
    // Dashboard mocks
    await page.route("/api/facebook/scheduled**", (r) => r.fulfill({ json: { posts: [] } }));
    await page.route("/api/facebook/posts**",     (r) => r.fulfill({ json: { posts: [] } }));

    await page.goto("/facebook/pages");
    await page.getByRole("button", { name: /Save 2 Pages/i }).click();

    await page.waitForURL("**/facebook/dashboard", { timeout: 8_000 });
  });

  test("shows empty state when no FB pages found", async ({ page }) => {
    await mockLoggedIn(page, []);
    await page.route("/api/facebook/pages", (r) =>
      r.fulfill({ json: { pages: [] } })
    );

    await page.goto("/facebook/pages");

    await expect(page.getByText(/No Pages found/i)).toBeVisible();
  });

  test("shows error when API returns an error", async ({ page }) => {
    await mockLoggedIn(page, []);
    await page.route("/api/facebook/pages", (r) =>
      r.fulfill({ json: { error: "Token expired" }, status: 401 })
    );

    await page.goto("/facebook/pages");

    await expect(page.getByText(/Token expired/i)).toBeVisible();
  });
});
