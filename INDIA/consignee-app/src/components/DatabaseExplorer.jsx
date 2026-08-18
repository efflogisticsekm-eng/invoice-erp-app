import React, { useState, useEffect } from 'react';
import { Database, Search, Edit2, Trash2, Download, RefreshCw, X, Check, Save, Table, AlertTriangle, FileSpreadsheet } from 'lucide-react';
import axios from 'axios';
import * as XLSX from 'xlsx-js-style';

export default function DatabaseExplorer() {
  const [activeTable, setActiveTable] = useState('live_scanned_invoices'); // 'live_scanned_invoices', 'pod_register', 'all_invoices'
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);

  // Search and Filter states
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;

  // Edit Modal State
  const [editingRow, setEditingRow] = useState(null);
  const [editForm, setEditForm] = useState({});

  // Create Modal State
  const [creatingNew, setCreatingNew] = useState(false);
  const [createForm, setCreateForm] = useState({});

  useEffect(() => {
    fetchData();
  }, [activeTable]);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const isProd = import.meta.env.PROD;
      const baseUrl = isProd ? '' : 'http://localhost:3001';
      const response = await axios.get(`${baseUrl}/api/explorer/data/${activeTable}`);
      setRows(response.data.data || []);
      setCurrentPage(1);
    } catch (err) {
      console.error(err);
      setError("Failed to load records from Supabase database table.");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    if (!editingRow) return;

    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const isProd = import.meta.env.PROD;
      const baseUrl = isProd ? '' : 'http://localhost:3001';
      await axios.post(`${baseUrl}/api/explorer/update/${activeTable}`, {
        id: editingRow.id,
        ...editForm
      });
      setMessage("Record updated successfully!");
      setEditingRow(null);
      fetchData();
    } catch (err) {
      console.error(err);
      setError("Failed to update database record: " + (err.response?.data?.error || err.message));
      setLoading(false);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const isProd = import.meta.env.PROD;
      const baseUrl = isProd ? '' : 'http://localhost:3001';
      await axios.post(`${baseUrl}/api/explorer/create/${activeTable}`, createForm);
      setMessage("Record created successfully!");
      setCreatingNew(false);
      setCreateForm({});
      fetchData();
    } catch (err) {
      console.error(err);
      setError("Failed to create database record: " + (err.response?.data?.error || err.message));
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to permanently delete this record from Supabase?")) return;

    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const isProd = import.meta.env.PROD;
      const baseUrl = isProd ? '' : 'http://localhost:3001';
      await axios.post(`${baseUrl}/api/explorer/delete/${activeTable}`, { id });
      setMessage("Record permanently deleted.");
      fetchData();
    } catch (err) {
      console.error(err);
      setError("Failed to delete record: " + (err.response?.data?.error || err.message));
      setLoading(false);
    }
  };

  const startEdit = (row) => {
    setEditingRow(row);
    // clone all properties except metadata
    const clone = { ...row };
    delete clone.id;
    delete clone.created_at;
    setEditForm(clone);
  };

  // Export current table to Excel
  const handleExportExcel = () => {
    if (rows.length === 0) return;

    try {
      const wb = XLSX.utils.book_new();
      const sheetName = activeTable === 'live_scanned_invoices' ? 'Scanned Invoices' :
                        activeTable === 'pod_register' ? 'POD Register' :
                        activeTable === 'supervisor_branch_mapping' ? 'Supervisor Mapping' :
                        activeTable === 'holidays' ? 'Holidays' : 'All Invoices';
      
      // Filter rows based on search term
      const dataToExport = filteredRows.map(r => {
        const rowCopy = { ...r };
        delete rowCopy.created_at; // remove timestamp if not needed
        return rowCopy;
      });

      const ws = XLSX.utils.json_to_sheet(dataToExport);

      // Style headers
      const headerStyle = {
        fill: { fgColor: { rgb: "0A2540" } }, // Dark Navy Blue
        font: { color: { rgb: "FFFFFF" }, bold: true },
        alignment: { horizontal: "center", vertical: "center" }
      };

      const range = XLSX.utils.decode_range(ws['!ref'] || "A1:A1");
      for (let C = range.s.c; C <= range.e.c; C++) {
        const cellRef = XLSX.utils.encode_cell({ r: 0, c: C });
        const cell = ws[cellRef];
        if (cell) cell.s = headerStyle;
      }

      XLSX.book_append_sheet(wb, ws, sheetName);
      XLSX.writeFile(wb, `${sheetName.replace(/\s+/g, '_')}_Export.xlsx`);
      setMessage("Excel downloaded successfully.");
    } catch (err) {
      console.error(err);
      setError("Excel download failed: " + err.message);
    }
  };

  // Filter rows
  const filteredRows = rows.filter(r => {
    const term = searchTerm.toLowerCase();
    return (
      String(r.invoice_no || '').toLowerCase().includes(term) ||
      String(r.consignee_code || '').toLowerCase().includes(term) ||
      String(r.consignor || '').toLowerCase().includes(term) ||
      String(r.ship_to_party_consignee || '').toLowerCase().includes(term) ||
      String(r.place || '').toLowerCase().includes(term) ||
      String(r.phone_number || '').toLowerCase().includes(term) ||
      String(r.remarks || '').toLowerCase().includes(term) ||
      String(r.supervisor_name || '').toLowerCase().includes(term) ||
      String(r.branch || '').toLowerCase().includes(term) ||
      String(r.date || '').toLowerCase().includes(term) ||
      String(r.description || '').toLowerCase().includes(term)
    );
  });

  // Pagination
  const totalPages = Math.ceil(filteredRows.length / itemsPerPage);
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentRows = filteredRows.slice(indexOfFirstItem, indexOfLastItem);

  return (
    <div className="w-full bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl transition duration-500 hover:shadow-primary/5">
      {/* Title Header */}
      <div className="bg-gradient-to-r from-blue-950 via-slate-900 to-indigo-950 px-8 py-6 flex flex-col md:flex-row md:items-center justify-between border-b border-slate-800">
        <div className="space-y-1">
          <div className="flex items-center space-x-2">
            <span className="px-3 py-1 bg-primary/20 text-primary border border-primary/30 rounded-full text-xs font-bold font-mono tracking-wide uppercase">Database Viewer</span>
            <span className="text-slate-500 font-bold">•</span>
            <span className="text-slate-400 text-xs font-semibold">Supabase Tables Manager</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight flex items-center space-x-3">
            <Database className="text-primary animate-pulse" size={28} />
            <span>Database Explorer</span>
          </h1>
        </div>

        <div className="mt-4 md:mt-0 flex space-x-3">
          <button
            onClick={fetchData}
            disabled={loading}
            className="px-4 py-2.5 bg-slate-850 hover:bg-slate-800 border border-slate-750 text-slate-200 font-bold text-xs rounded-xl flex items-center space-x-2 transition"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            <span>Reload Data</span>
          </button>

          {(activeTable === 'supervisor_branch_mapping' || activeTable === 'holidays') && (
            <button
              onClick={() => {
                if (activeTable === 'supervisor_branch_mapping') {
                  setCreateForm({ supervisor_name: '', branch: '' });
                } else {
                  setCreateForm({ date: '', description: '' });
                }
                setCreatingNew(true);
              }}
              className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl flex items-center space-x-2 transition shadow-lg shadow-emerald-950/20 cursor-pointer"
            >
              <span>{activeTable === 'supervisor_branch_mapping' ? '+ Add Supervisor' : '+ Add Holiday'}</span>
            </button>
          )}

          {rows.length > 0 && (
            <button
              onClick={handleExportExcel}
              className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl flex items-center space-x-2 transition shadow-lg shadow-indigo-950/20"
            >
              <FileSpreadsheet size={14} />
              <span>Export CSV/Excel</span>
            </button>
          )}
        </div>
      </div>

      {/* Table Selector Tabs */}
      <div className="bg-slate-950 border-b border-slate-800 flex overflow-x-auto scrollbar-none px-6">
        {[
          { id: 'live_scanned_invoices', name: 'Scanned Invoices' },
          { id: 'pod_register', name: 'POD Register (Signature/Seals)' },
          { id: 'supervisor_branch_mapping', name: 'Supervisor Mapping' },
          { id: 'holidays', name: 'Holidays List' },
          { id: 'all_invoices', name: 'All Invoices (Backup)' }
        ].map(tab => {
          const isActive = activeTable === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTable(tab.id)}
              className={`px-6 py-4 flex items-center space-x-2 border-b-2 text-sm font-bold tracking-wide whitespace-nowrap transition duration-300 cursor-pointer ${
                isActive ? 'border-primary text-primary bg-primary/5' : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/40'
              }`}
            >
              <Table size={15} />
              <span>{tab.name}</span>
            </button>
          );
        })}
      </div>

      {/* Messages */}
      <div className="px-8 pt-6">
        {error && (
          <div className="p-4 bg-red-950/40 border border-red-800 text-red-400 rounded-2xl flex items-center space-x-3">
            <AlertTriangle className="text-red-500 shrink-0" />
            <div className="text-sm font-semibold">{error}</div>
          </div>
        )}
        {message && (
          <div className="p-4 bg-slate-800/60 border border-slate-700 text-slate-350 rounded-2xl flex items-center space-x-3">
            <Check className="text-primary shrink-0" size={18} />
            <div className="text-sm font-semibold">{message}</div>
          </div>
        )}
      </div>

      <div className="p-8 space-y-6">
        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3.5 top-3.5 text-slate-500" size={18} />
          <input
            type="text"
            placeholder="Search by invoice no, consignee, code, or place..."
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
            className="w-full bg-slate-950 text-white pl-10 pr-4 py-3.5 rounded-xl border border-slate-800 focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none transition text-sm"
          />
        </div>

        {/* Database Grid */}
        {loading && rows.length === 0 ? (
          <div className="py-20 flex justify-center items-center">
            <RefreshCw className="animate-spin text-primary" size={32} />
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="py-20 text-center text-slate-500 font-bold border border-slate-800 rounded-2xl">
            No database records found matching criteria.
          </div>
        ) : (
          <div className="border border-slate-800 rounded-2xl overflow-hidden bg-slate-950/40">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs whitespace-nowrap">
                <thead>
                  <tr className="bg-slate-900 border-b border-slate-800 text-slate-400 font-bold">
                    <th className="p-3.5">ID</th>
                    {activeTable === 'supervisor_branch_mapping' ? (
                      <>
                        <th className="p-3.5">Created At</th>
                        <th className="p-3.5">Supervisor Name</th>
                        <th className="p-3.5">Branch Name</th>
                      </>
                    ) : activeTable === 'holidays' ? (
                      <>
                        <th className="p-3.5">Created At</th>
                        <th className="p-3.5">Date</th>
                        <th className="p-3.5">Description</th>
                      </>
                    ) : (
                      <>
                        <th className="p-3.5">Uploaded Date</th>
                        <th className="p-3.5">Doc Date</th>
                        <th className="p-3.5">Invoice No</th>
                        <th className="p-3.5">Consignor</th>
                        <th className="p-3.5">Consignee Name</th>
                        {activeTable === 'pod_register' ? (
                          <>
                            <th className="p-3.5 text-center">Seal OK</th>
                            <th className="p-3.5 text-center">Sign OK</th>
                            <th className="p-3.5 text-center">Date OK</th>
                            <th className="p-3.5 text-center">Seal Matched</th>
                          </>
                        ) : (
                          <>
                            <th className="p-3.5">Place</th>
                            <th className="p-3.5">GSTIN</th>
                            <th className="p-3.5">Address</th>
                          </>
                        )}
                        <th className="p-3.5">Remarks</th>
                      </>
                    )}
                    <th className="p-3.5 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 text-slate-300">
                  {currentRows.map(row => (
                    <tr key={row.id} className="hover:bg-slate-900/50 transition">
                      <td className="p-3.5 font-mono text-slate-500">#{row.id}</td>
                      
                      {activeTable === 'supervisor_branch_mapping' ? (
                        <>
                          <td className="p-3.5 font-mono">{row.created_at ? new Date(row.created_at).toLocaleString() : '-'}</td>
                          <td className="p-3.5 font-semibold text-white">{row.supervisor_name}</td>
                          <td className="p-3.5 font-semibold text-primary">{row.branch}</td>
                        </>
                      ) : activeTable === 'holidays' ? (
                        <>
                          <td className="p-3.5 font-mono">{row.created_at ? new Date(row.created_at).toLocaleString() : '-'}</td>
                          <td className="p-3.5 font-semibold text-white font-mono">{row.date}</td>
                          <td className="p-3.5 text-primary font-semibold">{row.description || '-'}</td>
                        </>
                      ) : (
                        <>
                          <td className="p-3.5 font-mono">{row.uploaded_date} {row.uploaded_time}</td>
                          <td className="p-3.5 font-mono">{row.date}</td>
                          <td className="p-3.5 font-semibold text-white font-mono">{row.invoice_no}</td>
                          <td className="p-3.5">{row.consignor}</td>
                          <td className="p-3.5 font-semibold">{row.ship_to_party_consignee}</td>
                          
                          {activeTable === 'pod_register' ? (
                            <>
                              <td className="p-3.5 text-center font-bold">{row.seal_ok || '-'}</td>
                              <td className="p-3.5 text-center font-bold">{row.sign_ok || '-'}</td>
                              <td className="p-3.5 text-center font-bold">{row.date_ok || '-'}</td>
                              <td className="p-3.5 text-center font-bold">{row.consignee_seal_matched || '-'}</td>
                            </>
                          ) : (
                            <>
                              <td className="p-3.5">{row.place || '-'}</td>
                              <td className="p-3.5 font-mono">{row.ship_to_party_consignee_gstin || '-'}</td>
                              <td className="p-3.5 max-w-[200px] truncate" title={row.address}>{row.address || '-'}</td>
                            </>
                          )}

                          <td className="p-3.5 max-w-[150px] truncate" title={row.remarks}>{row.remarks || '-'}</td>
                        </>
                      )}
                      
                      <td className="p-3.5 text-center">
                        <div className="flex justify-center space-x-2">
                          <button
                            onClick={() => startEdit(row)}
                            className="p-1.5 text-slate-400 hover:text-primary hover:bg-primary/10 rounded-lg transition cursor-pointer"
                          >
                            <Edit2 size={13} />
                          </button>
                          <button
                            onClick={() => handleDelete(row.id)}
                            className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition cursor-pointer"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination footer */}
            {totalPages > 1 && (
              <div className="px-6 py-4 flex items-center justify-between border-t border-slate-800 bg-slate-900/40">
                <span className="text-xs text-slate-500 font-semibold">
                  Showing {indexOfFirstItem + 1} - {Math.min(indexOfLastItem, filteredRows.length)} of {filteredRows.length} entries
                </span>
                <div className="flex space-x-2">
                  <button
                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                    disabled={currentPage === 1}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 rounded-lg text-xs font-bold transition disabled:opacity-40 cursor-pointer"
                  >
                    Previous
                  </button>
                  <span className="px-3 py-1.5 text-xs font-mono font-bold text-slate-400 self-center">Page {currentPage} of {totalPages}</span>
                  <button
                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                    disabled={currentPage === totalPages}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 rounded-lg text-xs font-bold transition disabled:opacity-40 cursor-pointer"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Row Edit Modal */}
      {editingRow && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden animate-fadeIn">
            <div className="px-6 py-4 bg-slate-950 border-b border-slate-800 flex justify-between items-center">
              <h3 className="text-base font-bold text-white">Edit Record #{editingRow.id}</h3>
              <button onClick={() => setEditingRow(null)} className="text-slate-400 hover:text-white p-1 rounded-lg">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleUpdate} className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              {activeTable === 'supervisor_branch_mapping' ? (
                <>
                  <div>
                    <label className="block text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-1">Supervisor Name</label>
                    <input
                      type="text"
                      value={editForm.supervisor_name || ''}
                      onChange={e => setEditForm({ ...editForm, supervisor_name: e.target.value })}
                      className="w-full bg-slate-950 text-white border border-slate-800 rounded-xl px-3 py-2 text-xs focus:border-primary outline-none"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-1">Branch Name</label>
                    <input
                      type="text"
                      value={editForm.branch || ''}
                      onChange={e => setEditForm({ ...editForm, branch: e.target.value })}
                      className="w-full bg-slate-950 text-white border border-slate-800 rounded-xl px-3 py-2 text-xs focus:border-primary outline-none"
                      required
                    />
                  </div>
                </>
              ) : activeTable === 'holidays' ? (
                <>
                  <div>
                    <label className="block text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-1">Date</label>
                    <input
                      type="date"
                      value={editForm.date ? editForm.date.split('T')[0] : ''}
                      onChange={e => setEditForm({ ...editForm, date: e.target.value })}
                      className="w-full bg-slate-950 text-white border border-slate-800 rounded-xl px-3 py-2 text-xs focus:border-primary outline-none"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-1">Description</label>
                    <input
                      type="text"
                      value={editForm.description || ''}
                      onChange={e => setEditForm({ ...editForm, description: e.target.value })}
                      className="w-full bg-slate-950 text-white border border-slate-800 rounded-xl px-3 py-2 text-xs focus:border-primary outline-none"
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-1">Doc Date</label>
                      <input
                        type="text"
                        value={editForm.date || ''}
                        onChange={e => setEditForm({ ...editForm, date: e.target.value })}
                        className="w-full bg-slate-950 text-white border border-slate-800 rounded-xl px-3 py-2 text-xs focus:border-primary outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-1">Invoice No</label>
                      <input
                        type="text"
                        value={editForm.invoice_no || ''}
                        onChange={e => setEditForm({ ...editForm, invoice_no: e.target.value })}
                        className="w-full bg-slate-950 text-white border border-slate-800 rounded-xl px-3 py-2 text-xs focus:border-primary outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-1">Consignor</label>
                    <input
                      type="text"
                      value={editForm.consignor || ''}
                      onChange={e => setEditForm({ ...editForm, consignor: e.target.value })}
                      className="w-full bg-slate-950 text-white border border-slate-800 rounded-xl px-3 py-2 text-xs focus:border-primary outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-1">Consignee Name</label>
                    <input
                      type="text"
                      value={editForm.ship_to_party_consignee || ''}
                      onChange={e => setEditForm({ ...editForm, ship_to_party_consignee: e.target.value })}
                      className="w-full bg-slate-950 text-white border border-slate-800 rounded-xl px-3 py-2 text-xs focus:border-primary outline-none"
                    />
                  </div>

                  {activeTable === 'pod_register' ? (
                    <div className="grid grid-cols-4 gap-3">
                      <div>
                        <label className="block text-[9px] uppercase font-bold text-slate-500 tracking-wider mb-1">Seal OK</label>
                        <input
                          type="text"
                          value={editForm.seal_ok || ''}
                          onChange={e => setEditForm({ ...editForm, seal_ok: e.target.value })}
                          className="w-full bg-slate-950 text-white border border-slate-800 rounded-xl px-2 py-2 text-center text-xs focus:border-primary outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[9px] uppercase font-bold text-slate-500 tracking-wider mb-1">Sign OK</label>
                        <input
                          type="text"
                          value={editForm.sign_ok || ''}
                          onChange={e => setEditForm({ ...editForm, sign_ok: e.target.value })}
                          className="w-full bg-slate-950 text-white border border-slate-800 rounded-xl px-2 py-2 text-center text-xs focus:border-primary outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[9px] uppercase font-bold text-slate-500 tracking-wider mb-1">Date OK</label>
                        <input
                          type="text"
                          value={editForm.date_ok || ''}
                          onChange={e => setEditForm({ ...editForm, date_ok: e.target.value })}
                          className="w-full bg-slate-950 text-white border border-slate-800 rounded-xl px-2 py-2 text-center text-xs focus:border-primary outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[9px] uppercase font-bold text-slate-500 tracking-wider mb-1">Seal Match</label>
                        <input
                          type="text"
                          value={editForm.consignee_seal_matched || ''}
                          onChange={e => setEditForm({ ...editForm, consignee_seal_matched: e.target.value })}
                          className="w-full bg-slate-950 text-white border border-slate-800 rounded-xl px-2 py-2 text-center text-xs focus:border-primary outline-none"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-1">Place</label>
                        <input
                          type="text"
                          value={editForm.place || ''}
                          onChange={e => setEditForm({ ...editForm, place: e.target.value })}
                          className="w-full bg-slate-950 text-white border border-slate-800 rounded-xl px-3 py-2 text-xs focus:border-primary outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-1">GSTIN</label>
                        <input
                          type="text"
                          value={editForm.ship_to_party_consignee_gstin || ''}
                          onChange={e => setEditForm({ ...editForm, ship_to_party_consignee_gstin: e.target.value })}
                          className="w-full bg-slate-950 text-white border border-slate-800 rounded-xl px-3 py-2 text-xs focus:border-primary outline-none"
                        />
                      </div>
                    </div>
                  )}

                  {activeTable !== 'pod_register' && (
                    <div>
                      <label className="block text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-1">Address</label>
                      <textarea
                        rows="3"
                        value={editForm.address || ''}
                        onChange={e => setEditForm({ ...editForm, address: e.target.value })}
                        className="w-full bg-slate-950 text-white border border-slate-800 rounded-xl px-3 py-2 text-xs focus:border-primary outline-none"
                      />
                    </div>
                  )}

                  <div>
                    <label className="block text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-1">Remarks</label>
                    <input
                      type="text"
                      value={editForm.remarks || ''}
                      onChange={e => setEditForm({ ...editForm, remarks: e.target.value })}
                      className="w-full bg-slate-950 text-white border border-slate-800 rounded-xl px-3 py-2 text-xs focus:border-primary outline-none"
                    />
                  </div>
                </>
              )}

              <div className="pt-4 border-t border-slate-800 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setEditingRow(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-750 text-slate-350 font-bold text-xs rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 bg-primary text-slate-950 font-black text-xs rounded-xl flex items-center space-x-1.5"
                >
                  <Save size={14} />
                  <span>Save Changes</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Create Modal */}
      {creatingNew && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden animate-fadeIn">
            <div className="px-6 py-4 bg-slate-950 border-b border-slate-800 flex justify-between items-center">
              <h3 className="text-base font-bold text-white">Add New Record</h3>
              <button onClick={() => setCreatingNew(false)} className="text-slate-400 hover:text-white p-1 rounded-lg">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreate} className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              {activeTable === 'supervisor_branch_mapping' ? (
                <>
                  <div>
                    <label className="block text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-1">Supervisor Name</label>
                    <input
                      type="text"
                      value={createForm.supervisor_name || ''}
                      onChange={e => setCreateForm({ ...createForm, supervisor_name: e.target.value })}
                      placeholder="e.g. BIPIN"
                      className="w-full bg-slate-950 text-white border border-slate-800 rounded-xl px-3 py-2 text-xs focus:border-primary outline-none"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-1">Branch Name</label>
                    <input
                      type="text"
                      value={createForm.branch || ''}
                      onChange={e => setCreateForm({ ...createForm, branch: e.target.value })}
                      placeholder="e.g. TRIVANDRUM"
                      className="w-full bg-slate-950 text-white border border-slate-800 rounded-xl px-3 py-2 text-xs focus:border-primary outline-none"
                      required
                    />
                  </div>
                </>
              ) : activeTable === 'holidays' ? (
                <>
                  <div>
                    <label className="block text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-1">Date</label>
                    <input
                      type="date"
                      value={createForm.date || ''}
                      onChange={e => setCreateForm({ ...createForm, date: e.target.value })}
                      className="w-full bg-slate-950 text-white border border-slate-800 rounded-xl px-3 py-2 text-xs focus:border-primary outline-none"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-1">Description</label>
                    <input
                      type="text"
                      value={createForm.description || ''}
                      onChange={e => setCreateForm({ ...createForm, description: e.target.value })}
                      placeholder="e.g. Independence Day"
                      className="w-full bg-slate-950 text-white border border-slate-800 rounded-xl px-3 py-2 text-xs focus:border-primary outline-none"
                    />
                  </div>
                </>
              ) : (
                <div className="text-slate-400 text-xs">
                  Create is only supported for Supervisor Mapping and Holidays tables.
                </div>
              )}

              <div className="pt-4 border-t border-slate-800 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setCreatingNew(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-750 text-slate-350 font-bold text-xs rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 bg-primary text-slate-950 font-black text-xs rounded-xl flex items-center space-x-1.5"
                >
                  <Save size={14} />
                  <span>Create Record</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
