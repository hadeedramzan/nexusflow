// Sends a short message to a Slack or Discord incoming webhook (set NOTIFY_WEBHOOK_URL).
// The URL comes from an env var only, never from a request, so this cannot be pointed at other hosts.
import { limited } from "./_ratelimit.js";

// Lead text is untrusted: escape Slack control characters (neutralises <!channel>), strip newlines, cap length.
export const esc = (s) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/[\r\n]+/g, " ").trim().slice(0, 200);

export async function notify(req, text) {
  const url = process.env.NOTIFY_WEBHOOK_URL;
  if (!url) return;
  // global cap so a flood of requests cannot flood your channel (only enforced when Upstash is configured)
  if (await limited(req, "notify", 10, "1 m", "global")) return;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    const body = url.includes("discord.com")
      ? { content: text, allowed_mentions: { parse: [] } }
      : { text };
    await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: ctrl.signal });
  } catch (e) {
    console.error("notify failed", e);
  } finally {
    clearTimeout(timer);
  }
}
