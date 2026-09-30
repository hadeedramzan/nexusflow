import { useEffect, useState } from "react";
import { supabase } from "./supabase";

const COLS = [["new", "New"], ["contacted", "Contacted"], ["qualified", "Qualified"], ["won", "Won"], ["lost", "Lost"]];
const EMPTY = { name: "", email: "", company: "", message: "" };
const SAMPLES = [
  { name: "Sara Khan", email: "sara@example.com", company: "Bright Dental", message: "We need a booking website for our clinic. Budget is around 3000 dollars and we want to launch in six weeks." },
  { name: "Tom Reed", email: "tom@example.com", company: "Reed Logistics", message: "Just browsing options for a CRM. No budget or timeline yet." },
  { name: "Aisha Malik", email: "aisha@example.com", company: "Orbit Studio", message: "Urgent: our checkout is broken and we lose orders every day. We need a developer this week, budget is flexible." },
];
const DEFAULT_ICP = "Small and mid-size service businesses that need a website or custom software, with a clear budget and a launch date within three months.";
const field = "w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-2 focus:outline-teal-700";
const STEPS = [
  ["1. Add a lead", "Use the form, press \"Add a sample lead\", or send one from any web form."],
  ["2. Qualify with AI", "The AI scores the lead against your ideal customer profile and writes an email draft."],
  ["3. Move it along", "Drag a card to another column, or use its dropdown."],
];

const TONES = {
  hot: { label: "Hot", box: "bg-emerald-50", title: "text-emerald-900", bar: "bg-emerald-600", track: "bg-emerald-100", badge: "bg-emerald-600" },
  warm: { label: "Warm", box: "bg-amber-50", title: "text-amber-900", bar: "bg-amber-500", track: "bg-amber-100", badge: "bg-amber-600" },
  cold: { label: "Cold", box: "bg-red-50", title: "text-red-900", bar: "bg-red-500", track: "bg-red-100", badge: "bg-red-600" },
};
const toneOf = (s) => (s >= 70 ? TONES.hot : s >= 40 ? TONES.warm : TONES.cold);

function Logo({ size = 40 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" role="img" aria-label="NexusFlow logo">
      <rect width="32" height="32" rx="8" fill="#0f766e" />
      <path d="M8 11h16M11 16h10M14 21h4" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" fill="none" />
    </svg>
  );
}

function Spinner() {
  return (
    <svg className="mr-1 inline h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity=".25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function loadIcp() {
  try { return localStorage.getItem("nexusflow-icp") || DEFAULT_ICP; } catch { return DEFAULT_ICP; }
}

export default function App() {
  const [leads, setLeads] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(null);
  const [q, setQ] = useState("");
  const [icp, setIcp] = useState(loadIcp);
  const [over, setOver] = useState(null);
  const [copied, setCopied] = useState(null);
  const [panel, setPanel] = useState(null); // null | "lead" | "settings" | "how"
  const [toasts, setToasts] = useState([]);

  function notify(msg, kind = "error") {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, msg, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }

  async function load() {
    const { data, error } = await supabase.from("leads").select("*").order("created_at", { ascending: false });
    if (error) notify(error.message); else setLeads(data);
    setLoaded(true);
  }
  useEffect(() => { load(); }, []);

  function changeIcp(v) {
    setIcp(v);
    try { localStorage.setItem("nexusflow-icp", v); } catch { /* storage unavailable */ }
  }

  async function insert(lead) {
    const { error } = await supabase.from("leads").insert(lead);
    if (error) { notify(error.message); return false; }
    await load();
    return true;
  }
  async function addLead(e) {
    e.preventDefault();
    if (await insert(form)) { setForm(EMPTY); setPanel(null); notify("Lead added", "ok"); }
  }
  const addSample = () => insert(SAMPLES[Math.floor(Math.random() * SAMPLES.length)]);

  async function move(id, status) {
    setLeads((l) => l.map((x) => (x.id === id ? { ...x, status } : x)));
    const { error } = await supabase.from("leads").update({ status }).eq("id", id);
    if (error) { notify(error.message); load(); }
  }

  async function remove(lead) {
    if (!window.confirm(`Delete ${lead.name}?`)) return;
    setLeads((l) => l.filter((x) => x.id !== lead.id));
    const { error } = await supabase.from("leads").delete().eq("id", lead.id);
    if (error) { notify(error.message); load(); }
  }

  async function qualify(lead) {
    setBusy(lead.id);
    try {
      const r = await fetch("/api/qualify", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...lead, icp: icp.trim() || DEFAULT_ICP }),
      });
      const out = await r.json();
      if (!r.ok) throw new Error(out.error || "AI request failed");
      const { error } = await supabase.from("leads").update(out).eq("id", lead.id);
      if (error) throw error;
      await load();
    } catch (e) { notify(e.message); } finally { setBusy(null); }
  }

  async function copy(lead) {
    try { await navigator.clipboard.writeText(lead.email_draft); setCopied(lead.id); setTimeout(() => setCopied(null), 1500); }
    catch { notify("Could not copy. Select the text and copy it manually."); }
  }

  const togglePanel = (name) => setPanel((p) => (p === name ? null : name));
  const term = q.trim().toLowerCase();
  const shown = leads.filter((l) => !term || [l.name, l.company, l.message].some((v) => (v || "").toLowerCase().includes(term)));
  const scored = leads.filter((l) => l.score != null);
  const avg = scored.length ? Math.round(scored.reduce((s, l) => s + l.score, 0) / scored.length) : "-";
  const stats = [["Leads", leads.length], ["Scored", scored.length], ["Average score", avg], ["Won", leads.filter((l) => l.status === "won").length]];
  const checklist = [
    ["Add a lead", leads.length > 0],
    ["Score it with AI", scored.length > 0],
    ["Move a card to another column", leads.some((l) => l.status !== "new")],
  ];
  const allDone = checklist.every(([, ok]) => ok);
  const tab = "rounded border px-3 py-1.5 text-sm font-medium transition-colors";

  return (
    <div className="mx-auto max-w-7xl p-4 md:p-8">
      <header className="flex flex-wrap items-center gap-3">
        <Logo />
        <div className="mr-auto">
          <h1 className="text-2xl font-semibold leading-tight">NexusFlow</h1>
          <p className="text-sm text-slate-600">A small CRM: capture leads, score them with AI, move them through your pipeline.</p>
        </div>
        <nav className="flex flex-wrap gap-2" aria-label="Actions">
          <button onClick={() => togglePanel("lead")} aria-expanded={panel === "lead"}
            className={`${tab} ${panel === "lead" ? "border-teal-800 bg-teal-800 text-white" : "border-teal-700 bg-teal-700 text-white hover:bg-teal-800"}`}>New lead</button>
          <button onClick={() => togglePanel("how")} aria-expanded={panel === "how"}
            className={`${tab} border-slate-300 bg-white hover:bg-slate-100`}>How it works</button>
          <button onClick={() => togglePanel("settings")} aria-expanded={panel === "settings"}
            className={`${tab} border-slate-300 bg-white hover:bg-slate-100`}>Settings</button>
        </nav>
      </header>

      <section aria-labelledby="try" className="mt-4 rounded bg-white p-4 shadow-sm">
        <h2 id="try" className="text-sm font-semibold">{allDone ? "You have tried everything. Nice." : "Try it in 30 seconds"}</h2>
        <ul className="mt-2 grid gap-2 text-sm md:grid-cols-3">
          {checklist.map(([label, ok]) => (
            <li key={label} className={`flex items-center gap-2 rounded p-2 ${ok ? "bg-emerald-50 text-emerald-900" : "bg-slate-100 text-slate-700"}`}>
              <span aria-hidden="true" className={`flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold ${ok ? "bg-emerald-600 text-white" : "bg-slate-300 text-slate-600"}`}>{ok ? "\u2713" : ""}</span>
              <span>{label}<span className="sr-only">{ok ? " (done)" : " (not done yet)"}</span></span>
            </li>
          ))}
        </ul>
      </section>

      {panel === "how" && (
        <section aria-labelledby="how" className="mt-4 rounded bg-white p-5 shadow-sm">
          <h2 id="how" className="font-semibold">What this app does</h2>
          <p className="mt-1 text-sm text-slate-700">
            Leads come in from a form or a web form webhook. An AI scores each one against your ideal customer profile and drafts a reply email. You move leads through your sales pipeline.
          </p>
          <ol className="mt-4 grid gap-4 text-sm md:grid-cols-3">
            {STEPS.map(([t, d]) => <li key={t}><span className="font-semibold">{t}.</span> {d}</li>)}
          </ol>
          <p className="mt-4 text-xs text-slate-500">Public demo: leads are shared and visible to every visitor, so please do not enter real personal details.</p>
        </section>
      )}

      {panel === "settings" && (
        <section aria-labelledby="settings" className="mt-4 rounded bg-white p-5 shadow-sm">
          <h2 id="settings" className="font-semibold">Settings</h2>
          <label className="mt-3 block text-sm font-semibold" htmlFor="icp">Your ideal customer profile (used for scoring)</label>
          <textarea id="icp" rows={3} className={field + " mt-1"} value={icp} onChange={(e) => changeIcp(e.target.value)} />
          <button onClick={() => changeIcp(DEFAULT_ICP)} className="mt-1 text-xs text-teal-800 underline">Reset to default</button>
          <details className="mt-4 text-sm">
            <summary className="cursor-pointer font-medium">Connect a web form</summary>
            <p className="mt-2 text-slate-700">Any form can send a lead to this board with a POST request:</p>
            <pre className="mt-2 overflow-x-auto rounded bg-slate-900 p-3 text-xs text-slate-100">{`curl -X POST ${window.location.origin}/api/lead \\
  -H "Content-Type: application/json" \\
  -d '{"name":"Jo Lee","email":"jo@example.com","company":"Acme","message":"Need a website"}'`}</pre>
          </details>
        </section>
      )}

      {panel === "lead" && (
        <form onSubmit={addLead} className="mt-4 grid gap-3 rounded bg-white p-4 shadow-sm md:grid-cols-4">
          <input required aria-label="Name" className={field} placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input required aria-label="Email" type="email" className={field} placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <input aria-label="Company" className={field} placeholder="Company" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
          <button className="rounded bg-teal-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-teal-800">Add lead</button>
          <textarea required aria-label="What does the lead need?" className={field + " md:col-span-4"} rows={2} placeholder="What does the lead need?" value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />
        </form>
      )}

      {!loaded && <p className="mt-8 text-sm text-slate-500" role="status">Loading leads...</p>}

      {loaded && leads.length === 0 && (
        <section className="mt-6 rounded border-2 border-dashed border-slate-300 bg-white p-10 text-center">
          <h2 className="text-lg font-semibold">Your pipeline is empty</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-600">Add a sample lead to see the AI score it, write an email draft, and move it across the board.</p>
          <div className="mt-4 flex flex-wrap justify-center gap-3">
            <button onClick={addSample} className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-700">Add a sample lead</button>
            <button onClick={() => setPanel("lead")} className="rounded border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-100">Enter my own</button>
          </div>
        </section>
      )}

      {loaded && leads.length > 0 && (
        <>
          <dl className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            {stats.map(([k, v]) => (
              <div key={k} className="rounded bg-white p-3 shadow-sm">
                <dt className="text-xs text-slate-500">{k}</dt>
                <dd className="text-xl font-semibold">{v}</dd>
              </div>
            ))}
          </dl>

          <div className="mt-4 mb-4 flex flex-wrap items-center gap-3">
            <input aria-label="Search leads" className={field + " md:max-w-sm"} placeholder="Search by name, company or message" value={q} onChange={(e) => setQ(e.target.value)} />
            <button onClick={addSample} className="rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-700">Add a sample lead</button>
          </div>

          <div className="grid gap-4 md:grid-cols-5">
            {COLS.map(([key, label]) => {
              const items = shown.filter((l) => l.status === key);
              return (
                <section key={key} aria-label={label}
                  onDragOver={(e) => { e.preventDefault(); setOver(key); }}
                  onDragLeave={() => setOver(null)}
                  onDrop={(e) => { e.preventDefault(); setOver(null); const id = e.dataTransfer.getData("text/plain"); if (id) move(id, key); }}
                  className={`min-h-24 rounded p-2 transition-colors ${over === key ? "bg-teal-100" : "bg-slate-200/60"}`}>
                  <h2 className="mb-2 px-1 text-sm font-medium">{label} ({items.length})</h2>
                  {items.length === 0 && (
                    <p className="rounded border border-dashed border-slate-300 px-2 py-3 text-center text-xs text-slate-500">Drop a card here</p>
                  )}
                  {items.map((l) => {
                    const tone = l.score != null ? toneOf(l.score) : null;
                    return (
                      <article key={l.id} draggable onDragStart={(e) => e.dataTransfer.setData("text/plain", l.id)}
                        className="card-in mb-2 cursor-grab rounded bg-white p-3 text-sm shadow-sm active:cursor-grabbing">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-medium">{l.name}</p>
                            <p className="text-xs text-slate-500">{l.company || l.email}</p>
                          </div>
                          <button onClick={() => remove(l)} aria-label={`Delete ${l.name}`} className="text-xs text-slate-400 hover:text-red-700">Delete</button>
                        </div>
                        <p className="my-2 text-slate-700">{l.message}</p>
                        {tone && (
                          <div className={`mb-2 rounded p-2 text-xs ${tone.box}`}>
                            <p className={`flex items-center gap-2 font-medium ${tone.title}`}>
                              Score {l.score}/100
                              <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase text-white ${tone.badge}`}>{tone.label}</span>
                            </p>
                            <div className={`my-1 h-1.5 rounded ${tone.track}`} aria-hidden="true"><div className={`h-1.5 rounded ${tone.bar}`} style={{ width: `${l.score}%` }} /></div>
                            <p>{l.reason}</p>
                            <p className="mt-1 italic">{l.icebreaker}</p>
                            {l.email_draft && (
                              <details className="mt-2">
                                <summary className="cursor-pointer font-medium">Email draft</summary>
                                <pre className="mt-1 whitespace-pre-wrap font-sans">{l.email_draft}</pre>
                                <button onClick={() => copy(l)} className="mt-1 rounded border border-slate-500 px-2 py-0.5 hover:bg-white">{copied === l.id ? "Copied" : "Copy"}</button>
                              </details>
                            )}
                          </div>
                        )}
                        <div className="flex gap-2">
                          <select aria-label={`Move ${l.name}`} className="flex-1 rounded border border-slate-300 px-1 py-1 text-xs" value={l.status} onChange={(e) => move(l.id, e.target.value)}>
                            {COLS.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
                          </select>
                          <button disabled={busy === l.id} onClick={() => qualify(l)} className="rounded bg-slate-900 px-2 py-1 text-xs text-white transition-colors hover:bg-slate-700 disabled:opacity-60">
                            {busy === l.id ? <><Spinner />Scoring...</> : l.score != null ? "Re-score" : "Qualify with AI"}
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </section>
              );
            })}
          </div>
        </>
      )}

      <div className="fixed bottom-4 right-4 z-50 flex w-72 flex-col gap-2" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`rounded p-3 text-sm shadow-lg ${t.kind === "ok" ? "bg-emerald-700 text-white" : "bg-red-700 text-white"}`}>{t.msg}</div>
        ))}
      </div>
    </div>
  );
}
