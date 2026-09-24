import React, { useState, useEffect } from 'react';
import { Database, Search, Edit2, Trash2, Download, RefreshCw, X, Check, Save, Table, AlertTriangle, FileSpreadsheet, Upload } from 'lucide-react';
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

  // Bulk Upload State
  const [bulkUploading, setBulkUploading] = useState(false);
  const [bulkData, setBulkData] = useState('');

  // Unloading Master validation warning shown inside the Add/Edit popup
  // { text, duplicateRow? }
  const [formWarning, setFormWarning] = useState(null);

  useEffect(() => {
    setSearchTerm('');
    setFormWarning(null);
    fetchData();
  }, [activeTable]);

  // ── Unloading Master helpers ───────────────────────────────────────────────
  const normKey = (v) => String(v ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
  const unloadingKey = (r) => [r.consignor, r.consignee, r.rate_logic, r.box_type].map(normKey).join('|');

  // Returns the existing row that has the same Consignor→Consignee→Rate Logic→Box Type (ignores the row being edited)
  const findUnloadingDuplicate = (form, excludeId = null) => {
    const key = unloadingKey(form);
    return rows.find(r => r.id !== excludeId && unloadingKey(r) === key) || null;
  };

  // Returns a warning text if a mandatory field is missing, else null
  const unloadingMissingFields = (form) => {
    const missing = [];
    if (!normKey(form.consignor)) missing.push('Consignor');
    if (!normKey(form.consignee)) missing.push('Consignee');
    if (!normKey(form.rate_logic)) missing.push('Rate Logic');
    if (!normKey(form.box_type)) missing.push('Box Type');
    if (form.rate === '' || form.rate === null || form.rate === undefined || isNaN(Number(form.rate)) || Number(form.rate) <= 0) missing.push('Rate');
    return missing.length ? `Cannot save — please enter ${missing.join(', ')}. (${missing.join(', ')} നൽകാതെ save ചെയ്യാൻ പറ്റില്ല)` : null;
  };

  const cleanUnloading = (form) => ({
    ...form,
    consignor: String(form.consignor ?? '').trim().replace(/\s+/g, ' '),
    consignee: String(form.consignee ?? '').trim().replace(/\s+/g, ' '),
    rate_logic: String(form.rate_logic ?? '').trim(),
    box_type: String(form.box_type ?? '').trim().replace(/\s+/g, ' '),
    rate: Number(form.rate)
  });

  const openEditFromDuplicate = (row) => {
    setCreatingNew(false);
    setCreateForm({});
    setFormWarning(null);
    startEdit(row);
  };

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

    let payloadForm = editForm;
    if (activeTable === 'unloading_master') {
      const missing = unloadingMissingFields(editForm);
      if (missing) { setFormWarning({ text: missing }); return; }
      const dup = findUnloadingDuplicate(editForm, editingRow.id);
      if (dup) {
        setFormWarning({ text: `Another entry already exists for this Consignor → Consignee → Rate Logic → Box Type (Rate ₹${dup.rate}). Edit that entry instead of creating a second one.`, duplicateRow: dup });
        return;
      }
      payloadForm = cleanUnloading(editForm);
    }

    setLoading(true);
    setError(null);
    setMessage(null);
    setFormWarning(null);

    try {
      const isProd = import.meta.env.PROD;
      const baseUrl = isProd ? '' : 'http://localhost:3001';
      await axios.post(`${baseUrl}/api/explorer/update/${activeTable}`, {
        id: editingRow.id,
        ...payloadForm
      });
      setMessage("Record updated successfully!");
      setEditingRow(null);
      fetchData();
    } catch (err) {
      console.error(err);
      const dupId = err.response?.data?.duplicate_id;
      const dupRow = dupId ? rows.find(r => r.id === dupId) : null;
      setFormWarning({ text: err.response?.data?.error || err.message, duplicateRow: dupRow || undefined });
      setLoading(false);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();

    let payloadForm = createForm;
    if (activeTable === 'unloading_master') {
      const missing = unloadingMissingFields(createForm);
      if (missing) { setFormWarning({ text: missing }); return; }
      const dup = findUnloadingDuplicate(createForm);
      if (dup) {
        setFormWarning({ text: `This Consignor → Consignee → Rate Logic → Box Type already exists (Rate ₹${dup.rate}). A new entry is not allowed — please edit the existing one. (ഇത് നിലവിലുണ്ട് — പുതിയത് ഉണ്ടാക്കാതെ Edit ചെയ്യുക)`, duplicateRow: dup });
        return;
      }
      payloadForm = cleanUnloading(createForm);
    }

    setLoading(true);
    setError(null);
    setMessage(null);
    setFormWarning(null);

    try {
      const isProd = import.meta.env.PROD;
      const baseUrl = isProd ? '' : 'http://localhost:3001';
      await axios.post(`${baseUrl}/api/explorer/create/${activeTable}`, payloadForm);
      setMessage("Record created successfully!");
      setCreatingNew(false);
      setCreateForm({});
      fetchData();
    } catch (err) {
      console.error(err);
      if (activeTable === 'unloading_master') {
        const dupId = err.response?.data?.duplicate_id;
        const dupRow = dupId ? rows.find(r => r.id === dupId) : null;
        setFormWarning({ text: err.response?.data?.error || err.message, duplicateRow: dupRow || undefined });
      } else {
        setError("Failed to create database record: " + (err.response?.data?.error || err.message));
      }
      setLoading(false);
    }
  };

  const handleBulkUpload = async (e) => {
    e.preventDefault();
    if (!bulkData.trim()) return;
    
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      // Parse TSV (Tab Separated Values) or CSV
      const rows = bulkData.trim().split('\n').map(line => line.split(/\t|,/));
      const payload = [];

      for (const row of rows) {
        if (activeTable === 'vehicles') {
          if (row.length >= 2) {
            payload.push({
              vehicle_no: row[0]?.trim(),
              branch: row[1]?.trim(),
              vehicle_type: row[2]?.trim() || ''
            });
          }
        }
      }

      if (payload.length === 0) {
        throw new Error("No valid data found to upload. Ensure format is Correct.");
      }

      const isProd = import.meta.env.PROD;
      const baseUrl = isProd ? '' : 'http://localhost:3001';
      await axios.post(`${baseUrl}/api/explorer/create/${activeTable}`, payload);
      
      setMessage(`${payload.length} records bulk uploaded successfully!`);
      setBulkUploading(false);
      setBulkData('');
      fetchData();
    } catch (err) {
      console.error(err);
      setError("Failed to bulk upload records: " + (err.response?.data?.error || err.message));
      setLoading(false);
    }
  };

  const handleDelete = async (pkValue) => {
    if (!window.confirm("Are you sure you want to permanently delete this record from Supabase?")) return;

    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const isProd = import.meta.env.PROD;
      const baseUrl = isProd ? '' : 'http://localhost:3001';
      
      const payload = activeTable === 'customer_branch_mapping' 
        ? { original_customer_name: pkValue } 
        : { id: pkValue };
        
      await axios.post(`${baseUrl}/api/explorer/delete/${activeTable}`, payload);
      setMessage("Record permanently deleted.");
      fetchData();
    } catch (err) {
      console.error(err);
      setError("Failed to delete record: " + (err.response?.data?.error || err.message));
      setLoading(false);
    }
  };

  const startEdit = (row) => {
    setFormWarning(null);
    setEditingRow(row);
    // clone all properties except metadata
    const clone = { ...row };
    if (activeTable === 'customer_branch_mapping') {
      clone.original_customer_name = row.customer_name;
    }
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
                        activeTable === 'customer_branch_mapping' ? 'Customer Mapping' :
                        activeTable === 'vehicles' ? 'Vehicle Master' :
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
    if (activeTable === 'unloading_master') {
      // every word typed must appear in Consignor / Consignee / Rate Logic / Box Type / Rate
      const hay = [r.consignor, r.consignee, r.rate_logic, r.box_type, r.rate].map(v => String(v ?? '').toLowerCase()).join(' | ');
      return term.trim().split(/\s+/).filter(Boolean).every(w => hay.includes(w));
    }
    return (
      String(r.invoice_no || '').toLowerCase().includes(term) ||
      String(r.consignee_code || '').toLowerCase().includes(term) ||
      String(r.consignor || '').toLowerCase().includes(term) ||
      String(r.ship_to_party_consignee || '').toLowerCase().includes(term) ||
      String(r.place || '').toLowerCase().includes(term) ||
      String(r.phone_number || '').toLowerCase().includes(term) ||
      String(r.remarks || '').toLowerCase().includes(term) ||
      String(r.supervisor_name || '').toLowerCase().includes(term) ||
      String(r.customer_name || '').toLowerCase().includes(term) ||
      String(r.branch || '').toLowerCase().includes(term) ||
      String(r.date || '').toLowerCase().includes(term) ||
      String(r.vehicle_no || '').toLowerCase().includes(term) ||
      String(r.vehicle_type || '').toLowerCase().includes(term) ||
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

          {(activeTable === 'supervisor_branch_mapping' || activeTable === 'customer_branch_mapping' || activeTable === 'holidays' || activeTable === 'unloading_master' || activeTable === 'vehicles') && (
            <div className="flex space-x-2">
              <button
                onClick={() => {
                  if (activeTable === 'supervisor_branch_mapping') {
                    setCreateForm({ supervisor_name: '', branch: '' });
                  } else if (activeTable === 'customer_branch_mapping') {
                    setCreateForm({ customer_name: '', branch: '' });
                  } else if (activeTable === 'unloading_master') {
                    setCreateForm({ consignor: '', consignee: '', rate_logic: '', box_type: '', rate: '' });
                  } else if (activeTable === 'vehicles') {
                    setCreateForm({ vehicle_no: '', branch: '', vehicle_type: '' });
                  } else {
                    setCreateForm({ date: '', description: '' });
                  }
                  setFormWarning(null);
                  setCreatingNew(true);
                }}
                className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl flex items-center space-x-2 transition shadow-lg shadow-emerald-950/20 cursor-pointer"
              >
                <span>{activeTable === 'supervisor_branch_mapping' ? '+ Add Supervisor' : activeTable === 'customer_branch_mapping' ? '+ Add Customer' : activeTable === 'unloading_master' ? '+ Add Rate' : activeTable === 'vehicles' ? '+ Add Vehicle' : '+ Add Holiday'}</span>
              </button>
              
              {activeTable === 'vehicles' && (
                <button
                  onClick={() => {
                    setBulkData('');
                    setBulkUploading(true);
                  }}
                  className="px-4 py-2.5 bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs rounded-xl flex items-center space-x-2 transition shadow-lg shadow-sky-950/20 cursor-pointer"
                >
                  <Upload size={14} />
                  <span>Bulk Upload</span>
                </button>
              )}
            </div>
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
          { id: 'customer_branch_mapping', name: 'Customer Mapping' },
          { id: 'vehicles', name: 'Vehicle Master' },
          { id: 'holidays', name: 'Holidays List' },
          { id: 'unloading_master', name: 'Unloading Master' },
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
            placeholder={activeTable === 'unloading_master' ? "Search consignor, consignee, rate logic or box type (e.g. asian kochi)..." : "Search by invoice no, consignee, code, or place..."}
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
            className="w-full bg-slate-950 text-white pl-10 pr-10 py-3.5 rounded-xl border border-slate-800 focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none transition text-sm"
          />
          {searchTerm && (
            <button type="button" onClick={() => { setSearchTerm(''); setCurrentPage(1); }} className="absolute right-3 top-3.5 text-slate-500 hover:text-white cursor-pointer" title="Clear search">
              <X size={16} />
            </button>
          )}
          {activeTable === 'unloading_master' && (
            <div className="mt-2 text-[11px] text-slate-500 font-semibold">
              {filteredRows.length} of {rows.length} rates{searchTerm ? ' match your search' : ''} — click the pencil icon on a row to edit it.
            </div>
          )}
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
                    {activeTable === 'supervisor_branch_mapping' || activeTable === 'customer_branch_mapping' || activeTable === 'vehicles' ? (
                      <>
                        {activeTable === 'supervisor_branch_mapping' && <th className="p-3.5">Created At</th>}
                        <th className="p-3.5">{activeTable === 'supervisor_branch_mapping' ? 'Supervisor Name' : activeTable === 'vehicles' ? 'Vehicle No' : 'Customer Name'}</th>
                        <th className="p-3.5">Branch Name</th>
                        {activeTable === 'vehicles' && <th className="p-3.5">Vehicle Type</th>}
                      </>
                    ) : activeTable === 'holidays' ? (
                      <>
                        <th className="p-3.5">Created At</th>
                        <th className="p-3.5">Date</th>
                        <th className="p-3.5">Description</th>
                      </>
                    ) : activeTable === 'unloading_master' ? (
                      <>
                        <th className="p-3.5">Consignor</th>
                        <th className="p-3.5">Consignee</th>
                        <th className="p-3.5">Rate Logic</th>
                        <th className="p-3.5">Box Type</th>
                        <th className="p-3.5 text-right">Rate</th>
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
                      
                      {activeTable === 'supervisor_branch_mapping' || activeTable === 'customer_branch_mapping' || activeTable === 'vehicles' ? (
                        <>
                          {activeTable === 'supervisor_branch_mapping' && <td className="p-3.5 font-mono">{row.created_at ? new Date(row.created_at).toLocaleString() : '-'}</td>}
                          <td className="p-3.5 font-semibold text-white">{activeTable === 'supervisor_branch_mapping' ? row.supervisor_name : activeTable === 'vehicles' ? row.vehicle_no : row.customer_name}</td>
                          <td className="p-3.5 font-semibold text-primary">{row.branch}</td>
                          {activeTable === 'vehicles' && <td className="p-3.5 font-semibold text-slate-300">{row.vehicle_type}</td>}
                        </>
                      ) : activeTable === 'holidays' ? (
                        <>
                          <td className="p-3.5 font-mono">{row.created_at ? new Date(row.created_at).toLocaleString() : '-'}</td>
                          <td className="p-3.5 font-semibold text-white font-mono">{row.date}</td>
                          <td className="p-3.5 text-primary font-semibold">{row.description || '-'}</td>
                        </>
                      ) : activeTable === 'unloading_master' ? (
                        <>
                          <td className="p-3.5 font-semibold text-white">{row.consignor || '-'}</td>
                          <td className="p-3.5 text-white">{row.consignee || '-'}</td>
                          <td className="p-3.5 text-slate-400 font-semibold">{row.rate_logic || '-'}</td>
                          <td className="p-3.5 text-primary font-bold">{row.box_type || '-'}</td>
                          <td className="p-3.5 font-mono font-bold text-right text-emerald-400">₹{row.rate || '0'}</td>
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
                            onClick={() => handleDelete(activeTable === 'customer_branch_mapping' ? row.customer_name : row.id)}
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
              {activeTable === 'unloading_master' && (() => {
                const liveDup = (!formWarning && normKey(editForm.consignor) && normKey(editForm.consignee) && normKey(editForm.rate_logic) && normKey(editForm.box_type)) ? findUnloadingDuplicate(editForm, editingRow.id) : null;
                const w = formWarning || (liveDup ? { text: `Already exists: this Consignor → Consignee → Rate Logic → Box Type has Rate ₹${liveDup.rate}. Save is blocked — edit the existing entry instead.`, duplicateRow: liveDup } : null);
                if (!w) return null;
                return (
                  <div className="p-3 bg-amber-950/50 border border-amber-700 text-amber-300 rounded-xl text-xs font-semibold space-y-2">
                    <div className="flex items-start space-x-2">
                      <AlertTriangle size={16} className="text-amber-400 shrink-0 mt-0.5" />
                      <span>{w.text}</span>
                    </div>
                    {w.duplicateRow && (
                      <div className="flex items-center justify-between bg-slate-950/60 border border-slate-800 rounded-lg px-3 py-2">
                        <span className="text-slate-300">{w.duplicateRow.consignor} → {w.duplicateRow.consignee} → {w.duplicateRow.rate_logic} → {w.duplicateRow.box_type} : <b className="text-emerald-400">₹{w.duplicateRow.rate}</b></span>
                        <button type="button" onClick={() => openEditFromDuplicate(w.duplicateRow)} className="ml-3 px-3 py-1 bg-primary text-slate-950 font-black rounded-lg cursor-pointer whitespace-nowrap">Edit Existing</button>
                      </div>
                    )}
                  </div>
                );
              })()}
              {activeTable === 'supervisor_branch_mapping' || activeTable === 'customer_branch_mapping' || activeTable === 'vehicles' ? (
                <>
                  <div>
                    <label className="block text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-1">
                      {activeTable === 'supervisor_branch_mapping' ? 'Supervisor Name' : activeTable === 'vehicles' ? 'Vehicle No' : 'Customer Name'}
                    </label>
                    <input
                      type="text"
                      value={activeTable === 'supervisor_branch_mapping' ? (editForm.supervisor_name || '') : activeTable === 'vehicles' ? (editForm.vehicle_no || '') : (editForm.customer_name || '')}
                      onChange={e => {
                        if (activeTable === 'supervisor_branch_mapping') {
                          setEditForm({ ...editForm, supervisor_name: e.target.value })
                        } else if (activeTable === 'vehicles') {
                          setEditForm({ ...editForm, vehicle_no: e.target.value })
                        } else {
                          setEditForm({ ...editForm, customer_name: e.target.value })
                        }
                      }}
                      disabled={activeTable === 'customer_branch_mapping'}
                      className={`w-full bg-slate-950 text-white border border-slate-800 rounded-xl px-3 py-2 text-xs focus:border-primary outline-none ${activeTable === 'customer_branch_mapping' ? 'opacity-50 cursor-not-allowed' : ''}`}
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
                  {activeTable === 'vehicles' && (
                  <div>
                    <label className="block text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-1">Vehicle Type</label>
                    <input
                      type="text"
                      value={editForm.vehicle_type || ''}
                      onChange={e => setEditForm({ ...editForm, vehicle_type: e.target.value })}
                      className="w-full bg-slate-950 text-white border border-slate-800 rounded-xl px-3 py-2 text-xs focus:border-primary outline-none"
                      required
                    />
                  </div>
                  )}
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
              ) : activeTable === 'unloading_master' ? (
                <>
                  <div>
                    <label className="block text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-1">Consignor</label>
                    <input type="text" value={editForm.consignor || ''} onChange={e => { setFormWarning(null); setEditForm({...editForm, consignor: e.target.value}); }} className="w-full bg-slate-950 text-white border border-slate-800 rounded-xl px-3 py-2 text-xs focus:border-primary outline-none" />
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-1">Consignee</label>
                    <input type="text" value={editForm.consignee || ''} onChange={e => { setFormWarning(null); setEditForm({...editForm, consignee: e.target.value}); }} className="w-full bg-slate-950 text-white border border-slate-800 rounded-xl px-3 py-2 text-xs focus:border-primary outline-none" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-1">Rate Logic</label>
                      <select value={editForm.rate_logic || ''} onChange={e => { setFormWarning(null); setEditForm({...editForm, rate_logic: e.target.value}); }} className="w-full bg-slate-950 text-white border border-slate-800 rounded-xl px-3 py-2 text-xs focus:border-primary outline-none">
                        <option value="">-- Select --</option>
                        <option value="Item/ Box Type">Item/ Box Type</option>
                        <option value="Weight">Weight</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-1">Box Type</label>
                      <input type="text" value={editForm.box_type || ''} onChange={e => { setFormWarning(null); setEditForm({...editForm, box_type: e.target.value}); }} className="w-full bg-slate-950 text-white border border-slate-800 rounded-xl px-3 py-2 text-xs focus:border-primary outline-none" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-1">Rate (₹)</label>
                    <input type="number" step="0.01" value={editForm.rate || ''} onChange={e => { setFormWarning(null); setEditForm({...editForm, rate: e.target.value}); }} className="w-full bg-slate-950 text-white border border-slate-800 rounded-xl px-3 py-2 text-xs focus:border-primary outline-none" />
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
              {activeTable === 'unloading_master' && (() => {
                const liveDup = (!formWarning && normKey(createForm.consignor) && normKey(createForm.consignee) && normKey(createForm.rate_logic) && normKey(createForm.box_type)) ? findUnloadingDuplicate(createForm, null) : null;
                const w = formWarning || (liveDup ? { text: `Already exists: this Consignor → Consignee → Rate Logic → Box Type has Rate ₹${liveDup.rate}. Save is blocked — edit the existing entry instead.`, duplicateRow: liveDup } : null);
                if (!w) return null;
                return (
                  <div className="p-3 bg-amber-950/50 border border-amber-700 text-amber-300 rounded-xl text-xs font-semibold space-y-2">
                    <div className="flex items-start space-x-2">
                      <AlertTriangle size={16} className="text-amber-400 shrink-0 mt-0.5" />
                      <span>{w.text}</span>
                    </div>
                    {w.duplicateRow && (
                      <div className="flex items-center justify-between bg-slate-950/60 border border-slate-800 rounded-lg px-3 py-2">
                        <span className="text-slate-300">{w.duplicateRow.consignor} → {w.duplicateRow.consignee} → {w.duplicateRow.rate_logic} → {w.duplicateRow.box_type} : <b className="text-emerald-400">₹{w.duplicateRow.rate}</b></span>
                        <button type="button" onClick={() => openEditFromDuplicate(w.duplicateRow)} className="ml-3 px-3 py-1 bg-primary text-slate-950 font-black rounded-lg cursor-pointer whitespace-nowrap">Edit Existing</button>
                      </div>
                    )}
                  </div>
                );
              })()}
              {activeTable === 'supervisor_branch_mapping' || activeTable === 'customer_branch_mapping' || activeTable === 'vehicles' ? (
                <>
                  <div>
                    <label className="block text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-1">
                      {activeTable === 'supervisor_branch_mapping' ? 'Supervisor Name' : activeTable === 'vehicles' ? 'Vehicle No' : 'Customer Name'}
                    </label>
                    <input
                      type="text"
                      value={activeTable === 'supervisor_branch_mapping' ? (createForm.supervisor_name || '') : activeTable === 'vehicles' ? (createForm.vehicle_no || '') : (createForm.customer_name || '')}
                      onChange={e => {
                        if (activeTable === 'supervisor_branch_mapping') {
                          setCreateForm({ ...createForm, supervisor_name: e.target.value })
                        } else if (activeTable === 'vehicles') {
                          setCreateForm({ ...createForm, vehicle_no: e.target.value })
                        } else {
                          setCreateForm({ ...createForm, customer_name: e.target.value })
                        }
                      }}
                      placeholder={activeTable === 'supervisor_branch_mapping' ? "e.g. BIPIN" : activeTable === 'vehicles' ? "e.g. KL41T0343" : "e.g. GEM PAINTS"}
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
                  {activeTable === 'vehicles' && (
                  <div>
                    <label className="block text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-1">Vehicle Type</label>
                    <input
                      type="text"
                      value={createForm.vehicle_type || ''}
                      onChange={e => setCreateForm({ ...createForm, vehicle_type: e.target.value })}
                      placeholder="e.g. BOLERO 1.7 TON - 4 WHEEL"
                      className="w-full bg-slate-950 text-white border border-slate-800 rounded-xl px-3 py-2 text-xs focus:border-primary outline-none"
                      required
                    />
                  </div>
                  )}
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
              ) : activeTable === 'unloading_master' ? (
                <>
                  <div>
                    <label className="block text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-1">Consignor</label>
                    <input type="text" value={createForm.consignor || ''} onChange={e => { setFormWarning(null); setCreateForm({...createForm, consignor: e.target.value}); }} className="w-full bg-slate-950 text-white border border-slate-800 rounded-xl px-3 py-2 text-xs focus:border-primary outline-none" />
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-1">Consignee</label>
                    <input type="text" value={createForm.consignee || ''} onChange={e => { setFormWarning(null); setCreateForm({...createForm, consignee: e.target.value}); }} className="w-full bg-slate-950 text-white border border-slate-800 rounded-xl px-3 py-2 text-xs focus:border-primary outline-none" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-1">Rate Logic</label>
                      <select value={createForm.rate_logic || ''} onChange={e => { setFormWarning(null); setCreateForm({...createForm, rate_logic: e.target.value}); }} className="w-full bg-slate-950 text-white border border-slate-800 rounded-xl px-3 py-2 text-xs focus:border-primary outline-none">
                        <option value="">-- Select --</option>
                        <option value="Item/ Box Type">Item/ Box Type</option>
                        <option value="Weight">Weight</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-1">Box Type</label>
                      <input type="text" value={createForm.box_type || ''} onChange={e => { setFormWarning(null); setCreateForm({...createForm, box_type: e.target.value}); }} className="w-full bg-slate-950 text-white border border-slate-800 rounded-xl px-3 py-2 text-xs focus:border-primary outline-none" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-1">Rate (₹)</label>
                    <input type="number" step="0.01" value={createForm.rate || ''} onChange={e => { setFormWarning(null); setCreateForm({...createForm, rate: e.target.value}); }} className="w-full bg-slate-950 text-white border border-slate-800 rounded-xl px-3 py-2 text-xs focus:border-primary outline-none" />
                  </div>
                </>
              ) : (
                <div className="text-slate-400 text-xs">
                  Create is only supported for mapping tables and Holidays.
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
      {/* Bulk Upload Modal */}
      {bulkUploading && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden animate-fadeIn">
            <div className="px-6 py-4 bg-slate-950 border-b border-slate-800 flex justify-between items-center">
              <h3 className="text-base font-bold text-white flex items-center space-x-2"><Upload size={18} className="text-sky-400" /><span>Bulk Upload / Paste Data</span></h3>
              <button onClick={() => setBulkUploading(false)} className="text-slate-400 hover:text-white p-1 rounded-lg">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleBulkUpload} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-2">
                  Paste data from Excel (Copy from Excel and Paste here). 
                  <br/><span className="text-sky-400">Format: Vehicle No | Branch | Vehicle Type</span>
                </label>
                <textarea
                  rows="10"
                  value={bulkData}
                  onChange={e => setBulkData(e.target.value)}
                  placeholder={"KL41T0343\tTRIVANDRUM\tBOLERO 1.7 TON - 4 WHEEL\nKL41T0344\tERNAKULAM\tTATA ACE"}
                  className="w-full bg-slate-950 text-white border border-slate-800 rounded-xl px-4 py-3 text-sm focus:border-sky-500 outline-none font-mono whitespace-pre"
                  required
                />
              </div>

              <div className="pt-4 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setBulkUploading(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-750 text-slate-350 font-bold text-xs rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white font-black text-xs rounded-xl flex items-center space-x-1.5"
                >
                  <Save size={14} />
                  <span>Upload Data</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
// Trigger Vercel Build 2
