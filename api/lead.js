// Webhook intake: any web form can POST a lead here and it lands on the board.
import { limited } from "./_ratelimit.js";
import { notify, esc } from "./_notify.js";

export default async function handler(req, res) {
  // Open CORS on purpose: this is a public webhook that other sites post to.
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).end();
  if (await limited(req, "lead", 10, "1 m")) {
    return res.status(429).json({ error: "Too many requests. Please wait a minute and try again." });
  }

  const { name, email, company, message, website } = req.body || {};
  // Honeypot: real forms leave this hidden field empty, bots fill it. Pretend success.
  if (typeof website === "string" && website.trim()) return res.status(201).json({ ok: true });

  const ok = (v, max) => typeof v === "string" && v.trim().length > 0 && v.length <= max;
  if (!ok(name, 100) || !ok(message, 2000) || !ok(email, 200) || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return res.status(400).json({ error: "name, a valid email and message are required" });
  }
  const key = process.env.VITE_SUPABASE_ANON_KEY;
  const co = typeof company === "string" ? company.trim().slice(0, 100) : "";
  const row = {
    name: name.trim(), email: email.trim(), message: message.trim(),
    company: co || null,
    source: "web_form",
  };
  try {
    const r = await fetch(`${process.env.VITE_SUPABASE_URL}/rest/v1/leads`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: key, Authorization: `Bearer ${key}`, Prefer: "return=minimal" },
      body: JSON.stringify(row),
    });
    if (!r.ok) throw new Error(`Database returned ${r.status}`);
    await notify(req, `New lead via web form: ${esc(row.name)}${row.company ? ` (${esc(row.company)})` : ""}\n${esc(row.message)}`);
    res.status(201).json({ ok: true });
  } catch (e) {
    console.error("lead insert failed", e);
    res.status(502).json({ error: "Could not save the lead. Please try again." });
  }
}
