// EFF 28-10-2026: Asian Unloading Master — edit / add / delete / Excel upload + change history.
// Saves go to erp.ls_unloading_master through /api/explorer/asian-ul/*; the database logs every change.
import React, { useMemo, useState } from 'react';
import axios from 'axios';
import * as XLSX from 'xlsx-js-style';
import { Edit2, Trash2, X, Save, Upload, Plus, History } from 'lucide-react';

const BOX_TYPES = ['Car', 'Lpks', 'Pails', 'Drums', 'Bags', 'All Types', 'Bonus'];
const BRANCHES = ['ASIAN KOLLAM', 'ASIAN THRISSUR'];
const base = () => (import.meta.env.PROD ? '' : 'http://localhost:3001');
const errText = e => e?.response?.data?.error || e?.message || String(e);
const fmt = d => d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';
const inp = 'w-full bg-slate-950 text-white px-3 py-2.5 rounded-lg border border-slate-700 focus:border-primary outline-none text-sm';

export default function AsianUnloadingTab({ rows, allRows, reload, setMessage, setError }) {
  const [sel, setSel] = useState({});
  const [form, setForm] = useState(null);          // {id?, branch, customer, town, box_type, rate}
  const [warn, setWarn] = useState('');
  const [busy, setBusy] = useState(false);
  const [upload, setUpload] = useState(null);      // parsed rows waiting for confirm
  const [hist, setHist] = useState(null);

  const branches = useMemo(() => [...new Set([...BRANCHES, ...allRows.map(r => r.branch).filter(Boolean)])], [allRows]);
  const boxTypes = useMemo(() => [...new Set([...BOX_TYPES, ...allRows.map(r => r.box_type).filter(Boolean)])], [allRows]);
  const selIds = Object.keys(sel).filter(k => sel[k]).map(Number);
  const allSel = rows.length > 0 && rows.every(r => sel[r.id]);

  const save = async e => {
    e.preventDefault(); setWarn('');
    if (form.id) {
      const old = allRows.find(r => r.id === form.id);
      if (old && Number(old.rate) === Number(form.rate) && old.customer === form.customer && old.town === form.town && old.box_type === form.box_type && old.branch === form.branch)
        return setWarn('ഒന്നും മാറ്റിയിട്ടില്ല.');
    }
    setBusy(true);
    try {
      await axios.post(`${base()}/api/explorer/asian-ul/save`, form);
      setMessage(form.id ? 'Asian unloading rate updated ✔ (history-യിൽ രേഖപ്പെടുത്തി)' : 'Asian unloading rate added ✔');
      setForm(null); reload();
    } catch (e2) { setWarn(errText(e2)); }
    setBusy(false);
  };

  const del = async ids => {
    if (!ids.length) return;
    if (!window.confirm(`${ids.length} row(s) delete ചെയ്യട്ടെ? (history-യിൽ രേഖപ്പെടുത്തും)`)) return;
    setBusy(true);
    try {
      await axios.post(`${base()}/api/explorer/asian-ul/delete`, { ids });
      setMessage(`${ids.length} row(s) deleted`); setSel({}); reload();
    } catch (e2) { setError(errText(e2)); }
    setBusy(false);
  };

  const onFile = e => {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f) return;
    const rd = new FileReader();
    rd.onload = ev => {
      try {
        const wb = XLSX.read(ev.target.result, { type: 'array' });
        const raw = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
        const pick = (o, ...names) => { const k = Object.keys(o).find(x => names.includes(String(x).trim().toLowerCase())); return k ? o[k] : ''; };
        const out = raw.map(o => ({
          branch: String(pick(o, 'branch')).trim(), customer: String(pick(o, 'customer', 'consignee')).trim(),
          town: String(pick(o, 'town', 'destination')).trim(), box_type: String(pick(o, 'box type', 'box_type', 'boxtype')).trim(),
          rate: pick(o, 'rate')
        })).filter(r => r.customer || r.town);
        if (!out.length) return setError('File-ൽ rows ഇല്ല. Columns: Branch, Customer, Town, Box Type, Rate');
        setUpload(out);
      } catch (e2) { setError('File വായിക്കാൻ പറ്റിയില്ല: ' + e2.message); }
    };
    rd.readAsArrayBuffer(f);
  };
  const doUpload = async () => {
    setBusy(true);
    try {
      const r = await axios.post(`${base()}/api/explorer/asian-ul/save`, { rows: upload });
      setMessage(`Upload done ✔ — ${r.data.added} added, ${r.data.updated} updated, ${r.data.unchanged} unchanged`);
      setUpload(null); reload();
    } catch (e2) { setError(errText(e2)); }
    setBusy(false);
  };
  const template = () => {
    const ws = XLSX.utils.json_to_sheet([{ Branch: 'ASIAN KOLLAM', Customer: 'SHOP NAME', Town: 'TOWN', 'Box Type': 'Drums', Rate: 5 }]);
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Asian UL'); XLSX.writeFile(wb, 'Asian_Unloading_Upload_Template.xlsx');
  };
  const openHist = async () => {
    setHist({ loading: true, rows: [] });
    try { const r = await axios.get(`${base()}/api/explorer/asian-ul/history`); setHist({ rows: r.data.data || [] }); }
    catch (e2) { setHist({ rows: [], err: errText(e2) }); }
  };

  const btn = 'px-3 py-2 text-white font-bold text-xs rounded-lg flex items-center gap-1.5 cursor-pointer disabled:opacity-50';
  return (
    <div className="border border-slate-800 rounded-2xl overflow-hidden bg-slate-950/40">
      <div className="px-4 py-3 flex flex-wrap items-center gap-2 border-b border-slate-800">
        <div className="text-xs text-slate-400 mr-auto">ASIAN KOLLAM / ASIAN THRISSUR — Asian Paints unloading rates · {rows.length} of {allRows.length} · ഓരോ മാറ്റവും History-യിൽ</div>
        <button className={`${btn} bg-emerald-600 hover:bg-emerald-500`} onClick={() => { setWarn(''); setForm({ branch: BRANCHES[0], customer: '', town: '', box_type: '', rate: '' }); }}><Plus size={14} />Add Rate</button>
        <label className={`${btn} bg-amber-600 hover:bg-amber-500`}><Upload size={14} />Excel Upload<input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={onFile} /></label>
        <button className={`${btn} bg-slate-700 hover:bg-slate-600`} onClick={template}>Template</button>
        <button className={`${btn} bg-indigo-600 hover:bg-indigo-500`} onClick={openHist}><History size={14} />History</button>
        {selIds.length > 0 && <button disabled={busy} className={`${btn} bg-red-600 hover:bg-red-500`} onClick={() => del(selIds)}><Trash2 size={14} />Delete {selIds.length}</button>}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs whitespace-nowrap">
          <thead><tr className="bg-slate-900 border-b border-slate-800 text-slate-400 font-bold">
            <th className="p-3.5 w-8"><input type="checkbox" checked={allSel} onChange={e => setSel(e.target.checked ? Object.fromEntries(rows.map(r => [r.id, true])) : {})} /></th>
            <th className="p-3.5">Branch</th><th className="p-3.5">Customer</th><th className="p-3.5">Town</th><th className="p-3.5">Box Type</th><th className="p-3.5 text-right">Rate</th><th className="p-3.5">Updated</th><th className="p-3.5 text-right">Actions</th>
          </tr></thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.id} className={`border-b border-slate-800/60 hover:bg-slate-900/40 ${sel[row.id] ? 'bg-primary/10' : ''}`}>
                <td className="p-3.5"><input type="checkbox" checked={!!sel[row.id]} onChange={e => setSel(s => ({ ...s, [row.id]: e.target.checked }))} /></td>
                <td className="p-3.5 text-primary font-semibold">{row.branch}</td>
                <td className="p-3.5 font-semibold text-white">{row.customer}</td>
                <td className="p-3.5 text-slate-300">{row.town}</td>
                <td className="p-3.5 text-slate-300">{row.box_type}</td>
                <td className="p-3.5 text-right font-bold text-emerald-300">₹{row.rate}</td>
                <td className="p-3.5 font-mono text-slate-500">{row.updated_at ? new Date(row.updated_at).toLocaleDateString() : '-'}</td>
                <td className="p-3.5 text-right">
                  <button title="Edit" className="p-1.5 text-sky-400 hover:text-sky-300 cursor-pointer" onClick={() => { setWarn(''); setForm({ id: row.id, branch: row.branch, customer: row.customer, town: row.town, box_type: row.box_type, rate: row.rate }); }}><Edit2 size={14} /></button>
                  <button title="Delete" className="p-1.5 text-red-400 hover:text-red-300 cursor-pointer" onClick={() => del([row.id])}><Trash2 size={14} /></button>
                </td>
              </tr>))}
            {rows.length === 0 && <tr><td colSpan={8} className="p-6 text-center text-slate-500">No Asian unloading rates found.</td></tr>}
          </tbody>
        </table>
      </div>

      {form && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <form onSubmit={save} className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-lg space-y-3">
            <div className="flex items-center justify-between"><h3 className="text-white font-bold">{form.id ? 'Edit Asian Unloading Rate' : 'Add Asian Unloading Rate'}</h3>
              <button type="button" className="text-slate-400 hover:text-white cursor-pointer" onClick={() => setForm(null)}><X size={18} /></button></div>
            {form.id && (() => { const o = allRows.find(r => r.id === form.id); return o ? <div className="text-xs text-slate-400">ഇപ്പോഴുള്ളത്: {o.box_type} ₹{o.rate}</div> : null; })()}
            <label className="block text-xs text-slate-400">Branch
              <select className={inp} value={form.branch} onChange={e => setForm(f => ({ ...f, branch: e.target.value }))}>{branches.map(b => <option key={b}>{b}</option>)}</select></label>
            <label className="block text-xs text-slate-400">Customer<input className={inp} value={form.customer} onChange={e => setForm(f => ({ ...f, customer: e.target.value }))} /></label>
            <label className="block text-xs text-slate-400">Town<input className={inp} value={form.town} onChange={e => setForm(f => ({ ...f, town: e.target.value }))} /></label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-xs text-slate-400">Box Type
                <select className={inp} value={form.box_type} onChange={e => setForm(f => ({ ...f, box_type: e.target.value }))}><option value="">--</option>{boxTypes.map(b => <option key={b}>{b}</option>)}</select></label>
              <label className="block text-xs text-slate-400">Rate (₹)<input className={inp} type="number" min="0" step="any" value={form.rate} onChange={e => setForm(f => ({ ...f, rate: e.target.value }))} /></label>
            </div>
            {!form.id && <div className="text-[11px] text-slate-500">Customer / Town പേര് log sheet-ലെ അതേ spelling-ൽ ആയിരിക്കണം (copy-paste ചെയ്യുക).</div>}
            {warn && <div className="text-xs text-amber-300 bg-amber-950/40 border border-amber-800 rounded-lg p-2">{warn}</div>}
            <div className="flex justify-end gap-2">
              <button type="button" className={`${btn} bg-slate-700`} onClick={() => setForm(null)}>Cancel</button>
              <button disabled={busy} className={`${btn} bg-emerald-600 hover:bg-emerald-500`}><Save size={14} />{busy ? 'Saving…' : 'Save'}</button>
            </div>
          </form>
        </div>)}

      {upload && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-3xl space-y-3">
            <div className="flex items-center justify-between"><h3 className="text-white font-bold">Excel Upload — {upload.length} rows</h3>
              <button className="text-slate-400 hover:text-white cursor-pointer" onClick={() => setUpload(null)}><X size={18} /></button></div>
            <div className="text-xs text-slate-400">ഉള്ളവയുടെ rate മാറ്റും, ഇല്ലാത്തവ പുതുതായി ചേർക്കും. ഒന്നും delete ചെയ്യില്ല.</div>
            <div className="max-h-80 overflow-auto border border-slate-800 rounded-lg">
              <table className="w-full text-xs text-slate-300"><tbody>
                {upload.slice(0, 300).map((r, i) => <tr key={i} className="border-b border-slate-800"><td className="p-2">{r.branch}</td><td className="p-2">{r.customer}</td><td className="p-2">{r.town}</td><td className="p-2">{r.box_type}</td><td className="p-2 text-right">₹{r.rate}</td></tr>)}
              </tbody></table>
            </div>
            <div className="flex justify-end gap-2">
              <button className={`${btn} bg-slate-700`} onClick={() => setUpload(null)}>Cancel</button>
              <button disabled={busy} className={`${btn} bg-amber-600 hover:bg-amber-500`} onClick={doUpload}>{busy ? 'Uploading…' : 'Upload'}</button>
            </div>
          </div>
        </div>)}

      {hist && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-5xl space-y-3">
            <div className="flex items-center justify-between"><h3 className="text-white font-bold">Asian Unloading Master — Change History</h3>
              <button className="text-slate-400 hover:text-white cursor-pointer" onClick={() => setHist(null)}><X size={18} /></button></div>
            {hist.loading && <div className="text-slate-400 text-sm">Loading…</div>}
            {hist.err && <div className="text-amber-300 text-sm">{hist.err}</div>}
            {!hist.loading && !hist.err && hist.rows.length === 0 && <div className="text-slate-400 text-sm">മാറ്റങ്ങൾ ഒന്നും രേഖപ്പെടുത്തിയിട്ടില്ല.</div>}
            {hist.rows.length > 0 && <div className="max-h-[60vh] overflow-auto border border-slate-800 rounded-lg">
              <table className="w-full text-xs text-slate-300 whitespace-nowrap">
                <thead><tr className="bg-slate-950 text-slate-400"><th className="p-2 text-left">When</th><th className="p-2 text-left">Action</th><th className="p-2 text-left">Branch</th><th className="p-2 text-left">Customer · Town</th><th className="p-2 text-left">Box</th><th className="p-2 text-right">Old</th><th className="p-2 text-right">New</th><th className="p-2 text-left">By</th></tr></thead>
                <tbody>{hist.rows.map(h => (
                  <tr key={h.id} className="border-b border-slate-800">
                    <td className="p-2 font-mono">{fmt(h.at)}</td>
                    <td className={`p-2 font-bold ${h.op === 'DELETE' ? 'text-red-400' : h.op === 'ADD' ? 'text-emerald-400' : 'text-sky-300'}`}>{h.op}</td>
                    <td className="p-2">{h.branch}</td><td className="p-2">{h.customer} · {h.town}</td><td className="p-2">{h.box_type}</td>
                    <td className="p-2 text-right">{h.old_rate == null ? '—' : '₹' + h.old_rate}</td>
                    <td className="p-2 text-right font-bold">{h.new_rate == null ? '—' : '₹' + h.new_rate}</td>
                    <td className="p-2">{h.changed_by_name || h.source}</td>
                  </tr>))}</tbody>
              </table></div>}
          </div>
        </div>)}
    </div>
  );
}
