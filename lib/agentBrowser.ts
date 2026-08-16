import { execFile } from "node:child_process";
import path from "node:path";

// Thin wrapper around the agent-browser CLI (github.com/vercel-labs/agent-browser).
//
// Why: YouTube increasingly blocks/empties out raw server-side fetch() requests to
// its InnerTube endpoints (see comments in the search/transcript routes). Driving a
// real headless Chrome instead makes our requests look like genuine browser traffic.
//
// All commands run against one persistent named session so Chrome stays warm across
// requests instead of relaunching every time. Calls are serialized through an
// in-process queue because the CLI drives one page at a time per session, while
// Next.js can service multiple requests concurrently.

const SESSION = "influ-youtube";

// Call the native binary directly (node_modules/agent-browser/bin/agent-browser-<platform>.exe)
// rather than the .cmd/.js shims — execFile-spawning a .cmd on Windows throws EINVAL.
function resolveBinary(): string {
  const dir = path.join(process.cwd(), "node_modules", "agent-browser", "bin");
  if (process.platform === "win32") return path.join(dir, "agent-browser-win32-x64.exe");
  if (process.platform === "darwin") {
    return path.join(dir, `agent-browser-darwin-${process.arch === "arm64" ? "arm64" : "x64"}`);
  }
  return path.join(dir, `agent-browser-linux-${process.arch === "arm64" ? "arm64" : "x64"}`);
}

const BIN = resolveBinary();

let queue: Promise<unknown> = Promise.resolve();
function serialize<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

type AbEnvelope<T> = {
  success: boolean;
  data: { origin: string; result: T } | null;
  error: string | null;
};

function runCli(args: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      BIN,
      ["--session", SESSION, ...args],
      { timeout: timeoutMs, maxBuffer: 1024 * 1024 * 32, windowsHide: true },
      (err, stdout, stderr) => {
        if (err) {
          reject(new Error(`agent-browser ${args[0]} failed: ${stderr || err.message}`));
          return;
        }
        resolve(stdout);
      }
    );
  });
}

/** Navigate the persistent browser session to a URL. */
export async function abOpen(url: string, timeoutMs = 30000): Promise<void> {
  await serialize(() => runCli(["open", url, "--json"], timeoutMs));
}

/** Click an element by CSS selector (real click event, not a synthetic DOM .click()). */
export async function abClick(selector: string, timeoutMs = 15000): Promise<void> {
  await serialize(() => runCli(["click", selector, "--json"], timeoutMs));
}

/** Scroll the page (used to trigger YouTube's infinite-scroll loading of more results). */
export async function abScroll(
  direction: "up" | "down" | "left" | "right",
  px: number,
  timeoutMs = 15000
): Promise<void> {
  await serialize(() => runCli(["scroll", direction, String(px), "--json"], timeoutMs));
}

/**
 * Run JavaScript in the page and return its (JSON-serializable) result.
 * The script may be an async IIFE; agent-browser awaits the resolved value.
 */
export async function abEval<T = unknown>(js: string, timeoutMs = 20000): Promise<T> {
  const b64 = Buffer.from(js, "utf8").toString("base64");
  const out = await serialize(() => runCli(["eval", "-b", b64, "--json"], timeoutMs));
  let parsed: AbEnvelope<T>;
  try {
    parsed = JSON.parse(out);
  } catch {
    throw new Error(`agent-browser eval returned non-JSON output: ${out.slice(0, 300)}`);
  }
  if (!parsed.success || !parsed.data) {
    throw new Error(parsed.error ?? "agent-browser eval failed");
  }
  return parsed.data.result;
}
