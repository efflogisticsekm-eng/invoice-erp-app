import React, { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Trash2, Plus, Users } from 'lucide-react';
import axios from 'axios';

const baseUrl = import.meta.env.PROD ? '' : 'http://localhost:3001';
const NEW_GROUP = '__new_group__';

/**
 * Unloading Master consignor groups (e.g. ASIAN PAINTS, BIRLA OPUS).
 * A rate added / edited / deleted for one member of a group is applied to every member
 * (database triggers on unloading_master). Adding a consignor here copies the group's rates to it.
 */
export default function ConsignorGroups() {
  const [groups, setGroups] = useState([]);
  const [consignors, setConsignors] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const [form, setForm] = useState({ consignor: '', group: '', newGroup: '' });

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const r = await axios.get(`${baseUrl}/api/explorer/ul-groups`);
      setGroups(r.data.groups || []);
      setConsignors(r.data.consignors || []);
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to load consignor groups.');
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const norm = (v) => String(v ?? '').trim().replace(/\s+/g, ' ').toUpperCase();
  const rowCount = useMemo(() => Object.fromEntries(consignors.map(c => [norm(c.consignor), c.rows])), [consignors]);
  const grouped = useMemo(() => {
    const m = {};
    groups.forEach(g => { (m[g.group_name] = m[g.group_name] || []).push(g); });
    return m;
  }, [groups]);
  const groupNames = Object.keys(grouped).sort();
  const inGroup = useMemo(() => new Set(groups.map(g => norm(g.consignor))), [groups]);
  const free = consignors.filter(c => !inGroup.has(norm(c.consignor)));

  const add = async (e) => {
    e.preventDefault();
    const group_name = form.group === NEW_GROUP ? form.newGroup : form.group;
    if (!form.consignor || !String(group_name || '').trim()) { setError('Select a consignor and a group.'); return; }
    const ok = window.confirm(`Add "${form.consignor}" to group "${group_name}"?\n\nAll unloading rates of this group will be copied to this consignor (group rate wins), and from now on any rate change in the group applies to it too.`);
    if (!ok) return;
    setBusy(true); setError(null); setMessage(null);
    try {
      await axios.post(`${baseUrl}/api/explorer/ul-groups/add`, { consignor: form.consignor, group_name });
      setMessage(`"${form.consignor}" added to ${String(group_name).toUpperCase()} — group rates copied.`);
      setForm({ consignor: '', group: '', newGroup: '' });
      await load();
    } catch (e2) {
      setError(e2.response?.data?.error || e2.message);
    } finally { setBusy(false); }
  };

  const remove = async (consignor, group_name) => {
    const ok = window.confirm(`Remove "${consignor}" from group "${group_name}"?\n\nIts rates stay in the Unloading Master, but they will no longer change together with the group.`);
    if (!ok) return;
    setBusy(true); setError(null); setMessage(null);
    try {
      await axios.post(`${baseUrl}/api/explorer/ul-groups/remove`, { consignor });
      setMessage(`"${consignor}" removed from ${group_name}.`);
      await load();
    } catch (e2) {
      setError(e2.response?.data?.error || e2.message);
    } finally { setBusy(false); }
  };

  const inputCls = 'w-full bg-slate-950 text-white border border-slate-800 rounded-xl px-3 py-2 text-xs focus:border-primary outline-none';

  return (
    <div className="space-y-6">
      <div className="text-xs text-slate-400 leading-relaxed">
        Unloading Master-ൽ ഒരു group-ലെ ഏതെങ്കിലും consignor-ന് റേറ്റ് add / edit / delete ചെയ്താൽ, അതേ Consignee + Rate Logic + Box Type-ൽ group-ലെ എല്ലാ consignors-നും അത് ബാധകമാകും.
        പുതിയ consignor-നെ group-ലേക്ക് ചേർത്താൽ group-ന്റെ എല്ലാ റേറ്റുകളും അതിലേക്ക് copy ആകും.
      </div>

      {error && <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs font-semibold">{error}</div>}
      {message && <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-semibold">{message}</div>}

      <form onSubmit={add} className="border border-slate-800 rounded-2xl bg-slate-950/40 p-4 grid gap-3 md:grid-cols-4 items-end">
        <div className="md:col-span-2">
          <label className="block text-[11px] font-bold text-slate-400 mb-1">Consignor (from Unloading Master)</label>
          <select value={form.consignor} onChange={e => setForm(f => ({ ...f, consignor: e.target.value }))} className={inputCls}>
            <option value="">-- select consignor --</option>
            {free.map(c => <option key={c.consignor} value={c.consignor}>{c.consignor} ({c.rows} rates)</option>)}
          </select>
          <div className="text-[10px] text-slate-500 mt-1">പുതിയ consignor ലിസ്റ്റിൽ ഇല്ലെങ്കിൽ, Unloading Master-ൽ അതിന് ഒരു റേറ്റ് ആദ്യം add ചെയ്യുക.</div>
        </div>
        <div>
          <label className="block text-[11px] font-bold text-slate-400 mb-1">Group</label>
          <select value={form.group} onChange={e => setForm(f => ({ ...f, group: e.target.value }))} className={inputCls}>
            <option value="">-- select group --</option>
            {groupNames.map(g => <option key={g} value={g}>{g}</option>)}
            <option value={NEW_GROUP}>➕ New group…</option>
          </select>
          {form.group === NEW_GROUP && (
            <input value={form.newGroup} onChange={e => setForm(f => ({ ...f, newGroup: e.target.value }))} placeholder="New group name" className={`${inputCls} mt-2`} />
          )}
        </div>
        <button type="submit" disabled={busy} className="px-4 py-2.5 bg-primary hover:opacity-90 text-white font-bold text-xs rounded-xl flex items-center justify-center space-x-1.5">
          {busy ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />}
          <span>Add to Group</span>
        </button>
      </form>

      {loading && groups.length === 0 ? (
        <div className="py-16 flex justify-center"><RefreshCw className="animate-spin text-primary" size={28} /></div>
      ) : groupNames.length === 0 ? (
        <div className="py-16 text-center text-slate-500 font-bold border border-slate-800 rounded-2xl">No consignor groups yet.</div>
      ) : groupNames.map(g => (
        <div key={g} className="border border-slate-800 rounded-2xl overflow-hidden bg-slate-950/40">
          <div className="px-4 py-3 bg-slate-900 border-b border-slate-800 flex items-center space-x-2">
            <Users size={15} className="text-primary" />
            <span className="text-sm font-black text-white">{g}</span>
            <span className="text-xs text-slate-400">· {grouped[g].length} consignors</span>
          </div>
          <table className="w-full text-left border-collapse text-xs whitespace-nowrap">
            <thead><tr className="border-b border-slate-800 text-slate-400 font-bold">
              <th className="p-3">Consignor</th><th className="p-3 text-right">Rates in master</th><th className="p-3">Added</th><th className="p-3 text-center">Remove</th>
            </tr></thead>
            <tbody>
              {grouped[g].map(r => (
                <tr key={r.consignor} className="border-b border-slate-800/60 hover:bg-slate-900/40">
                  <td className="p-3 font-semibold text-white">{r.consignor}</td>
                  <td className="p-3 text-right text-emerald-300 font-bold">{rowCount[norm(r.consignor)] ?? 0}</td>
                  <td className="p-3 font-mono text-slate-500">{r.created_at ? new Date(r.created_at).toLocaleDateString('en-IN') : '-'}</td>
                  <td className="p-3 text-center">
                    <button type="button" disabled={busy} onClick={() => remove(r.consignor, g)} className="p-1.5 rounded-lg text-red-400 hover:bg-red-500/10" title="Remove from group">
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
