// Webhook intake: any web form can POST a lead here and it lands on the board.
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).end();
  const { name, email, company, message } = req.body || {};
  const ok = (v, max) => typeof v === "string" && v.trim().length > 0 && v.length <= max;
  if (!ok(name, 100) || !ok(message, 2000) || !ok(email, 200) || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return res.status(400).json({ error: "name, a valid email and message are required" });
  }
  const key = process.env.VITE_SUPABASE_ANON_KEY;
  const row = {
    name: name.trim(), email: email.trim(), message: message.trim(),
    company: typeof company === "string" ? company.slice(0, 100) : null,
  };
  try {
    const r = await fetch(`${process.env.VITE_SUPABASE_URL}/rest/v1/leads`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: key, Authorization: `Bearer ${key}`, Prefer: "return=minimal" },
      body: JSON.stringify(row),
    });
    if (!r.ok) throw new Error(`Database returned ${r.status}`);
    res.status(201).json({ ok: true });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
}
