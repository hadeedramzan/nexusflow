import { useEffect, useState } from "react";
import { supabase } from "./supabase";

const COLS = [
  ["new", "New"],
  ["contacted", "Contacted"],
  ["qualified", "Qualified"],
  ["won", "Won"],
  ["lost", "Lost"],
];
const EMPTY = { name: "", email: "", company: "", message: "" };
const field = "w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-2 focus:outline-teal-700";

export default function App() {
  const [leads, setLeads] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState("");

  async function load() {
    const { data, error } = await supabase.from("leads").select("*").order("created_at", { ascending: false });
    if (error) setErr(error.message);
    else setLeads(data);
  }
  useEffect(() => { load(); }, []);

  async function addLead(e) {
    e.preventDefault();
    setErr("");
    const { error } = await supabase.from("leads").insert(form);
    if (error) return setErr(error.message);
    setForm(EMPTY);
    load();
  }

  async function move(id, status) {
    setLeads((l) => l.map((x) => (x.id === id ? { ...x, status } : x)));
    const { error } = await supabase.from("leads").update({ status }).eq("id", id);
    if (error) { setErr(error.message); load(); }
  }

  async function qualify(lead) {
    setBusy(lead.id);
    setErr("");
    try {
      const r = await fetch("/api/qualify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(lead),
      });
      const out = await r.json();
      if (!r.ok) throw new Error(out.error || "AI request failed");
      const { error } = await supabase.from("leads").update(out).eq("id", lead.id);
      if (error) throw error;
      await load();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-7xl p-4 md:p-8">
      <h1 className="text-2xl font-semibold">NexusFlow</h1>
      <p className="mb-6 text-sm text-slate-600">Capture leads, score them with AI, move them through your pipeline.</p>

      <form onSubmit={addLead} className="mb-6 grid gap-3 rounded bg-white p-4 shadow-sm md:grid-cols-4">
        <input required className={field} placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input required type="email" className={field} placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <input className={field} placeholder="Company" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
        <button className="rounded bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800">Add lead</button>
        <textarea required className={field + " md:col-span-4"} rows={2} placeholder="What does the lead need?" value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />
      </form>

      {err && <p role="alert" className="mb-4 rounded bg-red-50 p-3 text-sm text-red-800">{err}</p>}

      <div className="grid gap-4 md:grid-cols-5">
        {COLS.map(([key, label]) => {
          const items = leads.filter((l) => l.status === key);
          return (
            <section key={key} className="rounded bg-slate-200/60 p-2">
              <h2 className="mb-2 px-1 text-sm font-medium">{label} ({items.length})</h2>
              {items.length === 0 && <p className="px-1 text-xs text-slate-500">No leads here yet.</p>}
              {items.map((l) => (
                <article key={l.id} className="mb-2 rounded bg-white p-3 text-sm shadow-sm">
                  <p className="font-medium">{l.name}</p>
                  <p className="text-xs text-slate-500">{l.company || l.email}</p>
                  <p className="my-2 text-slate-700">{l.message}</p>
                  {l.score != null && (
                    <div className="mb-2 rounded bg-teal-50 p-2 text-xs">
                      <p className="font-medium text-teal-900">Score {l.score}/100</p>
                      <p>{l.reason}</p>
                      <p className="mt-1 italic">{l.icebreaker}</p>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <select aria-label={`Move ${l.name}`} className="flex-1 rounded border border-slate-300 px-1 py-1 text-xs" value={l.status} onChange={(e) => move(l.id, e.target.value)}>
                      {COLS.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
                    </select>
                    <button disabled={busy === l.id} onClick={() => qualify(l)} className="rounded bg-slate-900 px-2 py-1 text-xs text-white disabled:opacity-50">
                      {busy === l.id ? "Scoring..." : l.score != null ? "Re-score" : "Qualify with AI"}
                    </button>
                  </div>
                </article>
              ))}
            </section>
          );
        })}
      </div>
    </div>
  );
}
