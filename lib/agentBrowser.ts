import { execFile } from "node:child_process";
import path from "node:path";

// Thin wrapper around the agent-browser CLI (github.com/vercel-labs/agent-browser).
//
// Why: YouTube increasingly blocks/empties out raw server-side fetch() requests to
// its InnerTube endpoints (see comments in the search/transcript routes). Driving a
// real headless Chrome instead makes our requests look like genuine browser traffic.
//
// Each named session is its own persistent Chrome tab (stays warm across requests
// instead of relaunching), and --session <name> is agent-browser's own mechanism for
// running several of these in parallel with independent cookies/tabs. Calls are
// serialized per session — one tab can't navigate two places at once — but calls
// against different sessions run fully concurrently. DEFAULT_SESSION is what every
// caller gets unless it asks for a specific one (see channelFinder.ts, which runs a
// worker pool across several sessions to verify candidates in parallel).

export const DEFAULT_SESSION = "influ-youtube";

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

const queues = new Map<string, Promise<unknown>>();
function serialize<T>(session: string, fn: () => Promise<T>): Promise<T> {
  const prev = queues.get(session) ?? Promise.resolve();
  const run = prev.then(fn, fn);
  queues.set(
    session,
    run.then(
      () => undefined,
      () => undefined
    )
  );
  return run;
}

type AbEnvelope<T> = {
  success: boolean;
  data: { origin: string; result: T } | null;
  error: string | null;
};

function runCli(session: string, args: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      BIN,
      ["--session", session, ...args],
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

/** Navigate a browser session to a URL. */
export async function abOpen(
  url: string,
  timeoutMs = 30000,
  session = DEFAULT_SESSION
): Promise<void> {
  await serialize(session, () => runCli(session, ["open", url, "--json"], timeoutMs));
}

/** Click an element by CSS selector (real click event, not a synthetic DOM .click()). */
export async function abClick(
  selector: string,
  timeoutMs = 15000,
  session = DEFAULT_SESSION
): Promise<void> {
  await serialize(session, () => runCli(session, ["click", selector, "--json"], timeoutMs));
}

/** Scroll the page (used to trigger YouTube's infinite-scroll loading of more results). */
export async function abScroll(
  direction: "up" | "down" | "left" | "right",
  px: number,
  timeoutMs = 15000,
  session = DEFAULT_SESSION
): Promise<void> {
  await serialize(session, () =>
    runCli(session, ["scroll", direction, String(px), "--json"], timeoutMs)
  );
}

/**
 * Run JavaScript in the page and return its (JSON-serializable) result.
 * The script may be an async IIFE; agent-browser awaits the resolved value.
 */
export async function abEval<T = unknown>(
  js: string,
  timeoutMs = 20000,
  session = DEFAULT_SESSION
): Promise<T> {
  const b64 = Buffer.from(js, "utf8").toString("base64");
  const out = await serialize(session, () => runCli(session, ["eval", "-b", b64, "--json"], timeoutMs));
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

/** Closes a session's browser tab. Best-effort — never throws. */
export async function abClose(session: string): Promise<void> {
  await serialize(session, () => runCli(session, ["close", "--json"], 10000)).catch(() => {});
}
