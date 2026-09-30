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
const focus = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700";
const money = (n) => (n == null || n === "" ? "" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n));
// quote every cell and neutralise spreadsheet formulas (=, +, -, @)
function csvCell(v) {
  let t = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(t)) t = "'" + t;
  return `"${t.replace(/"/g, '""')}"`;
}

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
  const [editing, setEditing] = useState(null); // lead id whose email draft is being edited
  const [draft, setDraft] = useState("");
  const [sort, setSort] = useState("newest"); // newest | score | value
  const [editLead, setEditLead] = useState(null); // lead id being edited
  const [lf, setLf] = useState({ name: "", company: "", message: "", deal_value: "", notes: "" });

  function notify(msg, kind = "error", action = null) {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, msg, kind, action }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), action ? 8000 : 4500);
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
    const dup = leads.some((l) => (l.email || "").toLowerCase() === form.email.trim().toLowerCase());
    if (dup && !window.confirm("A lead with this email already exists. Add it anyway?")) return;
    if (await insert(form)) { setForm(EMPTY); setPanel(null); notify("Lead added", "ok"); }
  }
  const addSample = () => insert(SAMPLES[Math.floor(Math.random() * SAMPLES.length)]);

  async function move(id, status) {
    setLeads((l) => l.map((x) => (x.id === id ? { ...x, status } : x)));
    const { error } = await supabase.from("leads").update({ status }).eq("id", id);
    if (error) { notify(error.message); load(); }
  }

  async function remove(lead) {
    setLeads((l) => l.filter((x) => x.id !== lead.id));
    const { error } = await supabase.from("leads").delete().eq("id", lead.id);
    if (error) { notify(error.message); load(); return; }
    notify(`Deleted ${lead.name}`, "ok", { label: "Undo", fn: async () => { if (await insert(lead)) notify("Lead restored", "ok"); } });
  }

  function startLeadEdit(l) {
    setEditLead(l.id);
    setLf({ name: l.name, company: l.company || "", message: l.message, deal_value: l.deal_value ?? "", notes: l.notes || "" });
  }
  async function saveLead(l) {
    const patch = {
      name: lf.name.trim(), company: lf.company.trim() || null, message: lf.message.trim(),
      deal_value: lf.deal_value === "" ? null : Number(lf.deal_value), notes: lf.notes.trim() || null,
    };
    if (!patch.name || !patch.message) return notify("Name and message are required");
    if (patch.deal_value != null && (!Number.isFinite(patch.deal_value) || patch.deal_value < 0)) return notify("Deal value must be a positive number");
    const { error } = await supabase.from("leads").update(patch).eq("id", l.id);
    if (error) return notify(error.message);
    setLeads((x) => x.map((y) => (y.id === l.id ? { ...y, ...patch } : y)));
    setEditLead(null);
    notify("Lead updated", "ok");
  }

  function exportCsv() {
    const cols = ["name", "email", "company", "status", "score", "deal_value", "message", "notes", "created_at"];
    const csv = [cols.join(","), ...shown.map((l) => cols.map((c) => csvCell(l[c])).join(","))].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url; a.download = "nexusflow-leads.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  async function qualify(lead) {
    if (lead.email_draft && !window.confirm("Re-scoring will replace the current email draft, including your edits. Continue?")) return;
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

  function startEdit(lead) { setEditing(lead.id); setDraft(lead.email_draft || ""); }
  async function saveDraft(lead) {
    const { error } = await supabase.from("leads").update({ email_draft: draft }).eq("id", lead.id);
    if (error) return notify(error.message);
    setLeads((l) => l.map((x) => (x.id === lead.id ? { ...x, email_draft: draft } : x)));
    setEditing(null);
    notify("Draft saved", "ok");
  }

  const togglePanel = (name) => setPanel((p) => (p === name ? null : name));
  const term = q.trim().toLowerCase();
  const shown = leads
    .filter((l) => !term || [l.name, l.company, l.message].some((v) => (v || "").toLowerCase().includes(term)))
    .sort((a, b) => (sort === "score" ? (b.score ?? -1) - (a.score ?? -1) : sort === "value" ? (b.deal_value ?? -1) - (a.deal_value ?? -1) : 0));
  const open = leads.filter((l) => ["new", "contacted", "qualified"].includes(l.status)).reduce((s, l) => s + (Number(l.deal_value) || 0), 0);
  const scored = leads.filter((l) => l.score != null);
  const avg = scored.length ? Math.round(scored.reduce((s, l) => s + l.score, 0) / scored.length) : "-";
  const stats = [["Leads", leads.length], ["Scored", scored.length], ["Average score", avg], ["Won", leads.filter((l) => l.status === "won").length], ["Open pipeline", money(open) || "-"]];
  const checklist = [
    ["Add a lead", leads.length > 0],
    ["Score it with AI", scored.length > 0],
    ["Move a card to another column", leads.some((l) => l.status !== "new")],
  ];
  const allDone = checklist.every(([, ok]) => ok);
  const tab = `rounded border px-3 py-1.5 text-sm font-medium transition-colors ${focus}`;

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

      {!loaded && (
        <div className="mt-6 grid gap-4 md:grid-cols-5" role="status" aria-label="Loading leads">
          {[0, 1, 2, 3, 4].map((i) => <div key={i} className="h-40 animate-pulse rounded bg-slate-200/70" />)}
        </div>
      )}

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
          <dl className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-5">
            {stats.map(([k, v]) => (
              <div key={k} className="rounded bg-white p-3 shadow-sm">
                <dt className="text-xs text-slate-500">{k}</dt>
                <dd className="text-xl font-semibold">{v}</dd>
              </div>
            ))}
          </dl>

          <div className="mt-4 mb-4 flex flex-wrap items-center gap-3">
            <input aria-label="Search leads" className={field + " md:max-w-sm"} placeholder="Search by name, company or message" value={q} onChange={(e) => setQ(e.target.value)} />
            <select aria-label="Sort leads" value={sort} onChange={(e) => setSort(e.target.value)} className={field + " md:w-auto"}>
              <option value="newest">Sort: newest</option>
              <option value="score">Sort: highest score</option>
              <option value="value">Sort: highest deal value</option>
            </select>
            <button onClick={exportCsv} className={`rounded border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-100 ${focus}`}>Export CSV</button>
            <button onClick={addSample} className={`rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-700 ${focus}`}>Add a sample lead</button>
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
                      <article key={l.id} draggable={editLead !== l.id} onDragStart={(e) => e.dataTransfer.setData("text/plain", l.id)}
                        className="card-in mb-2 cursor-grab rounded bg-white p-3 text-sm shadow-sm active:cursor-grabbing">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-medium">{l.name}</p>
                            <p className="text-xs text-slate-500">{l.company || l.email}</p>
                          </div>
                          <div className="flex gap-2 text-xs">
                            <button onClick={() => startLeadEdit(l)} aria-label={`Edit ${l.name}`} className={`text-slate-600 hover:text-teal-800 ${focus}`}>Edit</button>
                            <button onClick={() => remove(l)} aria-label={`Delete ${l.name}`} className={`text-slate-600 hover:text-red-700 ${focus}`}>Delete</button>
                          </div>
                        </div>
                        {editLead === l.id ? (
                          <div className="my-2 grid gap-2">
                            <input aria-label="Name" className={field} maxLength={100} value={lf.name} onChange={(e) => setLf({ ...lf, name: e.target.value })} />
                            <input aria-label="Company" className={field} maxLength={100} placeholder="Company" value={lf.company} onChange={(e) => setLf({ ...lf, company: e.target.value })} />
                            <textarea aria-label="Message" rows={3} className={field} maxLength={2000} value={lf.message} onChange={(e) => setLf({ ...lf, message: e.target.value })} />
                            <input aria-label="Deal value in dollars" type="number" min="0" className={field} placeholder="Deal value ($)" value={lf.deal_value} onChange={(e) => setLf({ ...lf, deal_value: e.target.value })} />
                            <textarea aria-label="Notes" rows={2} className={field} maxLength={1000} placeholder="Private notes" value={lf.notes} onChange={(e) => setLf({ ...lf, notes: e.target.value })} />
                            <div className="flex gap-2">
                              <button onClick={() => saveLead(l)} className={`rounded bg-slate-900 px-2 py-1 text-xs text-white hover:bg-slate-700 ${focus}`}>Save</button>
                              <button onClick={() => setEditLead(null)} className={`rounded border border-slate-400 px-2 py-1 text-xs hover:bg-slate-100 ${focus}`}>Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <p className="my-2 text-slate-700">{l.message}</p>
                            {l.deal_value != null && <p className="mb-2 text-xs font-semibold text-slate-800">Deal value: {money(l.deal_value)}</p>}
                            {l.notes && <p className="mb-2 rounded bg-amber-50 p-2 text-xs text-slate-700"><span className="font-semibold">Note:</span> {l.notes}</p>}
                          </>
                        )}
                        {tone && (
                          <div className={`mb-2 rounded p-2 text-xs ${tone.box}`}>
                            <p className={`flex items-center gap-2 font-medium ${tone.title}`}>
                              Score {l.score}/100
                              <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase text-white ${tone.badge}`}>{tone.label}</span>
                            </p>
                            <div className={`my-1 h-1.5 rounded ${tone.track}`} aria-hidden="true"><div className={`h-1.5 rounded ${tone.bar}`} style={{ width: `${Math.min(100, Math.max(0, l.score))}%` }} /></div>
                            <p>{l.reason}</p>
                            <p className="mt-1 italic">{l.icebreaker}</p>
                            {l.email_draft && (
                              <details className="mt-2">
                                <summary className="cursor-pointer font-medium">Email draft</summary>
                                {editing === l.id ? (
                                  <>
                                    <textarea aria-label={`Edit email draft for ${l.name}`} rows={8} className={field + " mt-1 bg-white"} value={draft} onChange={(e) => setDraft(e.target.value)} />
                                    <div className="mt-1 flex gap-2">
                                      <button onClick={() => saveDraft(l)} className="rounded bg-slate-900 px-2 py-0.5 text-white hover:bg-slate-700">Save</button>
                                      <button onClick={() => setEditing(null)} className="rounded border border-slate-500 px-2 py-0.5 hover:bg-white">Cancel</button>
                                    </div>
                                  </>
                                ) : (
                                  <>
                                    <pre className="mt-1 whitespace-pre-wrap font-sans">{l.email_draft}</pre>
                                    <div className="mt-1 flex flex-wrap gap-2">
                                      <button onClick={() => startEdit(l)} className="rounded border border-slate-500 px-2 py-0.5 hover:bg-white">Edit</button>
                                      <button onClick={() => copy(l)} className="rounded border border-slate-500 px-2 py-0.5 hover:bg-white">{copied === l.id ? "Copied" : "Copy"}</button>
                                      <a href={`mailto:${l.email}?subject=${encodeURIComponent("Re: your inquiry")}&body=${encodeURIComponent(l.email_draft)}`} className="rounded border border-slate-500 px-2 py-0.5 hover:bg-white">Open in email app</a>
                                    </div>
                                  </>
                                )}
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
          <div key={t.id} className={`flex items-center justify-between gap-2 rounded p-3 text-sm shadow-lg ${t.kind === "ok" ? "bg-emerald-700 text-white" : "bg-red-700 text-white"}`}>
            <span>{t.msg}</span>
            {t.action && (
              <button onClick={() => { t.action.fn(); setToasts((x) => x.filter((y) => y.id !== t.id)); }} className="rounded border border-white/70 px-2 py-0.5 text-xs font-semibold hover:bg-white/20">{t.action.label}</button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
