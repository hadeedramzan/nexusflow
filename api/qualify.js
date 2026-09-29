// Vercel serverless function: keeps the Groq key on the server.
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const { name, company, message } = req.body || {};
  if (!message) return res.status(400).json({ error: "Lead message is required" });
  try {
    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: process.env.LLM_MODEL || "openai/gpt-oss-120b",
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              'You qualify inbound sales leads for a small B2B agency. Reply with JSON only: {"score": integer 0-100, "reason": one sentence, "icebreaker": two sentences opening a reply email, referring to what the lead wrote}. Score clarity of need, budget signals and urgency. Never invent facts about the lead.',
          },
          { role: "user", content: `Name: ${name}\nCompany: ${company || "unknown"}\nMessage: ${message}` },
        ],
      }),
    });
    if (!r.ok) throw new Error(`Groq returned ${r.status}`);
    const data = await r.json();
    const out = JSON.parse(data.choices[0].message.content);
    res.status(200).json({
      score: Math.max(0, Math.min(100, Math.round(Number(out.score)))),
      reason: String(out.reason),
      icebreaker: String(out.icebreaker),
    });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
}
