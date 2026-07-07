import React, { useState, useEffect } from 'react';
import { Upload, AlertTriangle, CheckCircle, Download, Search, Info, Settings, Trash2, Edit2, AlertCircle, RefreshCw, X, Play, Plus, Coins, ShieldAlert, FileSpreadsheet } from 'lucide-react';
import * as XLSX from 'xlsx-js-style';
import { calculateIncentives, DEFAULT_RULES, DEFAULT_EXCLUDED_NAMES, normalizeString, cleanStaffName } from '../utils/incentiveEngine';

export default function IncentiveCalculator({ onBack }) {
  const [activeTab, setActiveTab] = useState('SUMMARY'); // 'SUMMARY', 'WARNINGS', 'RULES', 'EXCLUDED'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  const [fileName, setFileName] = useState('');

  // Core Data
  const [rawData, setRawData] = useState([]);
  const [activeRules, setActiveRules] = useState(DEFAULT_RULES);
  const [excludedNames, setExcludedNames] = useState(DEFAULT_EXCLUDED_NAMES);
  const [newExcludedName, setNewExcludedName] = useState('');
  
  // Results
  const [calculationResults, setCalculationResults] = useState(null); // { summary, details, stats, errors }
  
  // Warnings Inline Edits
  const [editedFreights, setEditedFreights] = useState({}); // rowIdx -> new freight value

  // Pagination & Search
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;

  // Run the calculation when data, rules, or excluded names change
  const runCalculation = (dataToUse = rawData) => {
    if (!dataToUse || dataToUse.length === 0) return;
    
    setLoading(true);
    setTimeout(() => {
      try {
        // Apply inline edits to raw data for calculations
        const finalData = dataToUse.map((row, idx) => {
          if (editedFreights[idx] !== undefined) {
            // Find freight key
            const freightKey = Object.keys(row).find(k => {
              const nk = k.toUpperCase().replace(/\s+/g, '');
              return ['FRIGHTAMT', 'FREIGHTAMT', 'FREIGHTAMOUNT', 'FREIGHT', 'AMT'].includes(nk);
            }) || 'Fright Amt';
            return { ...row, [freightKey]: editedFreights[idx] };
          }
          return row;
        });

        const res = calculateIncentives(finalData, activeRules, excludedNames);
        setCalculationResults(res);
        setError(null);
      } catch (err) {
        console.error(err);
        setError("Error running calculations: " + err.message);
      } finally {
        setLoading(false);
      }
    }, 100);
  };

  // Handle uploaded Excel parsing
  const handleExcelUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setLoading(true);
    setError(null);
    setFileName(file.name);
    setEditedFreights({}); // Clear previous edits

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const bstr = event.target.result;
        const workbook = XLSX.read(bstr, { type: 'binary', cellDates: true });
        
        // 1. Find and parse rules sheet
        const rulesSheetName = workbook.SheetNames.find(n => n.trim().toLowerCase() === 'rules');
        let parsedRules = DEFAULT_RULES;
        if (rulesSheetName) {
          const rSheet = workbook.Sheets[rulesSheetName];
          const rJson = XLSX.utils.sheet_to_json(rSheet, { header: 1 });
          const foundRules = [];
          for (let r = 1; r < rJson.length; r++) {
            const row = rJson[r];
            if (row && row[0]) {
              foundRules.push({
                role: String(row[0]).trim(),
                portion: row[1] !== undefined ? parseFloat(row[1]) : 0.5,
                percentage: row[2] !== undefined ? parseFloat(row[2]) : 0.0
              });
            }
          }
          if (foundRules.length > 0) {
            parsedRules = foundRules;
            setActiveRules(foundRules);
          }
        }

        // 2. Find and parse data sheet
        const dataSheetName = workbook.SheetNames.find(n => n.trim().toLowerCase() === 'incentive data');
        if (!dataSheetName) {
          throw new Error("Could not find an 'incentive data' sheet in the uploaded Excel file.");
        }

        const dSheet = workbook.Sheets[dataSheetName];
        const rawJson = XLSX.utils.sheet_to_json(dSheet, { defval: null });
        
        setRawData(rawJson);
        runCalculation(rawJson);
        setSuccessMessage("File loaded and processed successfully!");
        setTimeout(() => setSuccessMessage(null), 4000);
      } catch (err) {
        console.error(err);
        setError("Failed to parse Excel file: " + err.message);
        setFileName('');
      } finally {
        setLoading(false);
      }
    };
    reader.readAsBinaryString(file);
  };

  // Fetch the template file directly from the public folder
  const handleLoadSample = async () => {
    setLoading(true);
    setError(null);
    setFileName('INCENTIVE TEMPLTE.xlsx');
    setEditedFreights({});

    try {
      const response = await fetch('/INCENTIVE_TEMPLTE.xlsx');
      if (!response.ok) {
        throw new Error("Template file not found in public folder. Please drag and drop the file instead.");
      }
      const arrayBuffer = await response.arrayBuffer();
      const data = new Uint8Array(arrayBuffer);
      const workbook = XLSX.read(data, { type: 'array', cellDates: true });

      // Rules parse
      const rulesSheetName = workbook.SheetNames.find(n => n.trim().toLowerCase() === 'rules');
      let parsedRules = DEFAULT_RULES;
      if (rulesSheetName) {
        const rSheet = workbook.Sheets[rulesSheetName];
        const rJson = XLSX.utils.sheet_to_json(rSheet, { header: 1 });
        const foundRules = [];
        for (let r = 1; r < rJson.length; r++) {
          const row = rJson[r];
          if (row && row[0]) {
            foundRules.push({
              role: String(row[0]).trim(),
              portion: row[1] !== undefined ? parseFloat(row[1]) : 0.5,
              percentage: row[2] !== undefined ? parseFloat(row[2]) : 0.0
            });
          }
        }
        if (foundRules.length > 0) {
          parsedRules = foundRules;
          setActiveRules(foundRules);
        }
      }

      // Data parse
      const dataSheetName = workbook.SheetNames.find(n => n.trim().toLowerCase() === 'incentive data');
      if (!dataSheetName) {
        throw new Error("Could not find an 'incentive data' sheet in the template.");
      }

      const dSheet = workbook.Sheets[dataSheetName];
      const rawJson = XLSX.utils.sheet_to_json(dSheet, { defval: null });
      
      setRawData(rawJson);
      
      // Delay slightly to allow state to settle
      setTimeout(() => {
        const res = calculateIncentives(rawJson, parsedRules, excludedNames);
        setCalculationResults(res);
        setLoading(false);
        setSuccessMessage("Sample template loaded successfully!");
        setTimeout(() => setSuccessMessage(null), 4000);
      }, 100);

    } catch (err) {
      console.error(err);
      setError("Failed to load sample: " + err.message);
      setFileName('');
      setLoading(false);
    }
  };

  // Update rule value dynamically
  const handleRuleChange = (idx, field, val) => {
    const updated = [...activeRules];
    updated[idx] = {
      ...updated[idx],
      [field]: parseFloat(val) || 0
    };
    setActiveRules(updated);
  };

  // Add tag to excluded names
  const handleAddExcludedName = (e) => {
    e.preventDefault();
    const clean = newExcludedName.trim().toLowerCase();
    if (!clean) return;
    const updated = new Set(excludedNames);
    updated.add(clean);
    setExcludedNames(updated);
    setNewExcludedName('');
    
    // Recalculate
    setTimeout(() => {
      const res = calculateIncentives(rawData, activeRules, updated);
      setCalculationResults(res);
    }, 50);
  };

  // Remove tag from excluded names
  const handleRemoveExcludedName = (name) => {
    const updated = new Set(excludedNames);
    updated.delete(name.toLowerCase());
    setExcludedNames(updated);
    
    // Recalculate
    setTimeout(() => {
      const res = calculateIncentives(rawData, activeRules, updated);
      setCalculationResults(res);
    }, 50);
  };

  // Edit freight amount for anomaly rows
  const handleFreightEdit = (rowIdx, val) => {
    const num = parseFloat(val);
    if (isNaN(num)) return;
    const updatedEdits = { ...editedFreights, [rowIdx]: num };
    setEditedFreights(updatedEdits);
  };

  // Apply warning edits and run recalculation
  const handleApplyWarningEdits = () => {
    runCalculation(rawData);
    setSuccessMessage("Corrected values applied and recalculated!");
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  // Generate Excel workbook with styles
  const handleDownloadExcelReport = () => {
    if (!calculationResults) return;

    try {
      const wb = XLSX.utils.book_new();

      // Styles configurations
      const headerStyle = {
        fill: { fgColor: { rgb: "0A2540" } }, // Navy Dark Blue
        font: { color: { rgb: "FFFFFF" }, bold: true, name: "Calibri", sz: 11 },
        alignment: { horizontal: "center", vertical: "center" }
      };

      const totalStyle = {
        fill: { fgColor: { rgb: "E6EEF8" } }, // Light Slate/Blue
        font: { bold: true, name: "Calibri", sz: 11 },
        border: {
          top: { style: "thin", color: { rgb: "0A2540" } },
          bottom: { style: "double", color: { rgb: "0A2540" } }
        }
      };

      // 1. STAFF SUMMARY SHEET
      // Headers: Name, each role name, Total
      const summaryHeaders = ["Staff Name", ...activeRules.map(r => r.role), "Total Incentive (₹)"];
      
      const summaryRows = calculationResults.summary.map(item => [
        item.name,
        ...activeRules.map(r => item[r.role] || 0),
        item.total
      ]);

      // Totals
      const summaryTotals = Array(summaryHeaders.length).fill(0);
      summaryTotals[0] = "TOTAL";
      for (let c = 1; c < summaryHeaders.length; c++) {
        summaryTotals[c] = Number(summaryRows.reduce((sum, row) => sum + (row[c] || 0), 0).toFixed(2));
      }

      const summaryData = [summaryHeaders, ...summaryRows, summaryTotals];
      const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);

      // Apply Excel styling to summary sheet
      const rangeSum = XLSX.utils.decode_range(wsSummary['!ref']);
      for (let R = rangeSum.s.r; R <= rangeSum.e.r; R++) {
        for (let C = rangeSum.s.c; C <= rangeSum.e.c; C++) {
          const cellRef = XLSX.utils.encode_cell({ r: R, c: C });
          const cell = wsSummary[cellRef];
          if (!cell) continue;

          cell.s = {};
          if (R === 0) {
            cell.s = headerStyle;
          } else if (R === rangeSum.e.r) {
            cell.s = totalStyle;
          } else {
            if (R % 2 === 0) {
              cell.s.fill = { fgColor: { rgb: "F8FAFC" } }; // Slate alternating color
            }
            cell.s.font = { name: "Calibri", sz: 11 };
            // Align numbers right
            if (C > 0) {
              cell.s.alignment = { horizontal: "right" };
            }
          }
        }
      }
      
      // Auto size column widths
      wsSummary['!cols'] = summaryHeaders.map((h, i) => ({ wch: i === 0 ? 26 : 20 }));

      XLSX.utils.book_append_sheet(wb, wsSummary, "Staff Incentives Summary");

      // 2. DETAILED CALCULATIONS SHEET
      const detailHeaders = ["LR DATE", "LR NUMBER", "CONSIGNOR", "CONSIGNEE", "FREIGHT AMOUNT (₹)", 
                             ...activeRules.map(r => r.role), 
                             ...activeRules.map(r => `${r.role} Incentive (₹)`), 
                             "Row Total Incentive (₹)"];
                             
      const detailRows = calculationResults.details.map(item => {
        // Date formatting helper
        let dateVal = item.date;
        if (dateVal instanceof Date) {
          dateVal = dateVal.toISOString().split('T')[0];
        }
        
        return [
          dateVal || '-',
          item.lrNumber,
          item.consignor || '-',
          item.consignee || '-',
          item.freight,
          ...activeRules.map(r => item[r.role] || '-'),
          ...activeRules.map(r => item[`${r.role} Incentive`] || 0),
          item['Row Total Incentive']
        ];
      });

      // Totals for details
      const detailTotals = Array(detailHeaders.length).fill('');
      detailTotals[0] = "TOTAL";
      detailTotals[4] = Number(detailRows.reduce((sum, row) => sum + (row[4] || 0), 0).toFixed(2));
      
      const startIncCol = 5 + activeRules.length;
      for (let c = startIncCol; c < detailHeaders.length; c++) {
        detailTotals[c] = Number(detailRows.reduce((sum, row) => sum + (row[c] || 0), 0).toFixed(2));
      }

      const detailData = [detailHeaders, ...detailRows, detailTotals];
      const wsDetails = XLSX.utils.aoa_to_sheet(detailData);

      // Detailed Sheet Styling (Header and Totals only for 20k rows performance)
      const rangeDet = XLSX.utils.decode_range(wsDetails['!ref']);
      for (let C = rangeDet.s.c; C <= rangeDet.e.c; C++) {
        // Style header cell
        const headRef = XLSX.utils.encode_cell({ r: 0, c: C });
        if (wsDetails[headRef]) wsDetails[headRef].s = headerStyle;

        // Style total cell
        const totRef = XLSX.utils.encode_cell({ r: rangeDet.e.r, c: C });
        if (wsDetails[totRef]) wsDetails[totRef].s = totalStyle;
      }

      wsDetails['!cols'] = detailHeaders.map((h, i) => ({ wch: i < 4 ? 18 : 16 }));
      XLSX.utils.book_append_sheet(wb, wsDetails, "Detailed Calculations");

      // 3. RULES APPLIED SHEET
      const rulesHeaders = ["Staff Role Heading", "Portion of Freight", "Incentive Percentage"];
      const rulesRows = activeRules.map(r => [r.role, r.portion, r.percentage]);
      const rulesData = [rulesHeaders, ...rulesRows];
      const wsRules = XLSX.utils.aoa_to_sheet(rulesData);

      // Rules styling
      const rangeR = XLSX.utils.decode_range(wsRules['!ref']);
      for (let R = rangeR.s.r; R <= rangeR.e.r; R++) {
        for (let C = rangeR.s.c; C <= rangeR.e.c; C++) {
          const cellRef = XLSX.utils.encode_cell({ r: R, c: C });
          if (wsRules[cellRef]) {
            wsRules[cellRef].s = R === 0 ? headerStyle : { font: { name: "Calibri", sz: 11 } };
          }
        }
      }
      wsRules['!cols'] = [{ wch: 28 }, { wch: 18 }, { wch: 22 }];
      XLSX.utils.book_append_sheet(wb, wsRules, "Rules Used");

      // Write out
      XLSX.writeFile(wb, `Staff_Incentive_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
      setSuccessMessage("Excel report generated successfully!");
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      console.error(err);
      setError("Failed to export Excel file: " + err.message);
    }
  };

  // Reset Component State
  const handleReset = () => {
    setRawData([]);
    setFileName('');
    setEditedFreights({});
    setCalculationResults(null);
    setActiveRules(DEFAULT_RULES);
    setExcludedNames(DEFAULT_EXCLUDED_NAMES);
    setError(null);
  };

  // Filter calculations summary
  const filteredSummary = (calculationResults?.summary || []).filter(item => {
    const term = searchTerm.toLowerCase();
    return String(item.name).toLowerCase().includes(term);
  });

  // Pagination calculations
  const totalPages = Math.ceil(filteredSummary.length / itemsPerPage);
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentSummary = filteredSummary.slice(indexOfFirstItem, indexOfLastItem);

  return (
    <div className="w-full bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl transition duration-500 hover:shadow-primary/5">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-amber-950 via-slate-900 to-orange-950 px-8 py-6 flex flex-col md:flex-row md:items-center justify-between border-b border-slate-800 gap-4">
        <div className="space-y-1">
          <div className="flex items-center space-x-2">
            <div className="p-2 bg-amber-500/10 text-amber-500 border border-amber-500/20 rounded-xl">
              <Coins size={22} className="animate-pulse" />
            </div>
            <h2 className="text-xl font-extrabold text-white tracking-wide">Staff Incentive Calculator</h2>
          </div>
          <p className="text-xs text-slate-400">Dynamic rule processor & anomaly auditor for ERP LR records</p>
        </div>
        <div className="flex space-x-3">
          {calculationResults && (
            <button
              onClick={handleDownloadExcelReport}
              className="px-5 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-slate-950 font-black text-xs rounded-xl shadow-lg shadow-amber-500/10 flex items-center space-x-2 cursor-pointer transition active:scale-[0.98]"
            >
              <Download size={14} />
              <span>Export Excel Report</span>
            </button>
          )}
          <button
            onClick={onBack}
            className="px-4 py-2.5 bg-slate-800 hover:bg-slate-750 text-slate-300 font-bold text-xs rounded-xl border border-slate-700 cursor-pointer transition"
          >
            Back
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="p-8">
        
        {/* Error or Success Toast */}
        {error && (
          <div className="mb-6 p-4 bg-red-950/40 border border-red-500/30 rounded-2xl flex items-start space-x-3 text-red-400">
            <AlertCircle size={20} className="shrink-0 mt-0.5" />
            <div className="text-sm font-semibold">{error}</div>
          </div>
        )}
        {successMessage && (
          <div className="mb-6 p-4 bg-emerald-950/40 border border-emerald-500/30 rounded-2xl flex items-start space-x-3 text-emerald-400 animate-fadeIn">
            <CheckCircle size={20} className="shrink-0 mt-0.5" />
            <div className="text-sm font-semibold">{successMessage}</div>
          </div>
        )}

        {/* UPLOAD / START STATE */}
        {!calculationResults ? (
          <div className="max-w-xl mx-auto py-8 text-center space-y-6">
            <div className="border-2 border-dashed border-slate-800 rounded-3xl p-12 bg-slate-950/40 hover:border-amber-500/50 hover:bg-slate-950/70 transition-all group flex flex-col items-center justify-center">
              <input
                type="file"
                accept=".xlsx, .xls"
                onChange={handleExcelUpload}
                className="hidden"
                id="incentive-file-upload"
              />
              <label
                htmlFor="incentive-file-upload"
                className="cursor-pointer flex flex-col items-center space-y-4"
              >
                <div className="w-16 h-16 bg-slate-900 group-hover:bg-amber-500/10 text-slate-400 group-hover:text-amber-450 border border-slate-800 group-hover:border-amber-500/30 rounded-2xl flex items-center justify-center transition-colors">
                  <FileSpreadsheet size={32} />
                </div>
                <div>
                  <p className="font-bold text-base text-white">Upload Incentive Template File</p>
                  <p className="text-xs text-slate-500 mt-1">Select or drag & drop .xlsx containing data & rules</p>
                </div>
              </label>
            </div>

            <div className="flex items-center justify-center space-x-4">
              <span className="text-xs text-slate-500 font-semibold uppercase tracking-widest">or</span>
            </div>

            <div>
              <button
                onClick={handleLoadSample}
                disabled={loading}
                className="px-6 py-3 bg-slate-800 hover:bg-slate-750 text-amber-400 hover:text-amber-300 font-extrabold text-xs rounded-xl border border-slate-700 hover:border-slate-650 cursor-pointer shadow-md inline-flex items-center space-x-2 transition disabled:opacity-50"
              >
                {loading ? (
                  <RefreshCw size={14} className="animate-spin" />
                ) : (
                  <Play size={12} fill="currentColor" />
                )}
                <span>Load Sample Template (Local File)</span>
              </button>
              <p className="text-[10px] text-slate-500 mt-2">Loads and runs the calculations directly using INCENTIVE TEMPLTE.xlsx</p>
            </div>
          </div>
        ) : (
          /* DASHBOARD & DATA PRESENTATION STATE */
          <div className="space-y-8">
            
            {/* Stat Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="bg-slate-950/60 border border-slate-800/80 p-5 rounded-2xl space-y-2 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/5 rounded-full blur-2xl" />
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Total Freights Processed</span>
                <h3 className="text-2xl font-black text-white">₹{calculationResults.stats.totalFreight.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</h3>
                <p className="text-[10px] text-slate-400 flex items-center space-x-1">
                  <Info size={10} className="text-slate-500" />
                  <span>Gross freight turnover of loaded sheet</span>
                </p>
              </div>

              <div className="bg-slate-950/60 border border-slate-800/80 p-5 rounded-2xl space-y-2 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-full blur-2xl" />
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider font-bold">Total Staff Incentives</span>
                <h3 className="text-2xl font-black text-amber-400">₹{calculationResults.stats.totalIncentives.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</h3>
                <p className="text-[10px] text-slate-400 flex items-center space-x-1">
                  <Info size={10} className="text-slate-500" />
                  <span>{(calculationResults.stats.totalIncentives / (calculationResults.stats.totalFreight || 1) * 100).toFixed(2)}% of total freight value</span>
                </p>
              </div>

              <div className="bg-slate-950/60 border border-slate-800/80 p-5 rounded-2xl space-y-2 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-2xl" />
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Total LR Records</span>
                <h3 className="text-2xl font-black text-white">{calculationResults.stats.totalLrsCount.toLocaleString()}</h3>
                <p className="text-[10px] text-slate-400">Excluding duplicate headings and error lines</p>
              </div>

              <div className="bg-slate-950/60 border border-slate-800/80 p-5 rounded-2xl space-y-2 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-24 h-24 bg-purple-500/5 rounded-full blur-2xl" />
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Paid Staff Count</span>
                <h3 className="text-2xl font-black text-white">{calculationResults.stats.uniqueStaffCount}</h3>
                <p className="text-[10px] text-slate-400">Unique staff members earning incentives</p>
              </div>
            </div>

            {/* Navigation Tabs */}
            <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-slate-850 pb-2 gap-4">
              <div className="flex space-x-1 bg-slate-950 p-1 rounded-xl border border-slate-800/60 self-start">
                <button
                  onClick={() => { setActiveTab('SUMMARY'); setCurrentPage(1); }}
                  className={`px-4 py-2 text-xs font-bold rounded-lg cursor-pointer transition ${activeTab === 'SUMMARY' ? 'bg-amber-500/10 text-amber-450 border border-amber-500/20' : 'text-slate-400 hover:text-slate-200 border border-transparent'}`}
                >
                  Staff Incentives Summary
                </button>
                <button
                  onClick={() => { setActiveTab('WARNINGS'); }}
                  className={`px-4 py-2 text-xs font-bold rounded-lg cursor-pointer transition flex items-center space-x-1.5 ${activeTab === 'WARNINGS' ? 'bg-amber-500/10 text-amber-450 border border-amber-500/20' : 'text-slate-400 hover:text-slate-200 border border-transparent'}`}
                >
                  <span>Anomalies & Warnings</span>
                  {calculationResults.errors.length > 0 && (
                    <span className="bg-red-500 text-slate-950 px-1.5 py-0.5 rounded-full text-[9px] font-black shrink-0">
                      {calculationResults.errors.length}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => { setActiveTab('RULES'); }}
                  className={`px-4 py-2 text-xs font-bold rounded-lg cursor-pointer transition flex items-center space-x-1.5 ${activeTab === 'RULES' ? 'bg-amber-500/10 text-amber-450 border border-amber-500/20' : 'text-slate-400 hover:text-slate-200 border border-transparent'}`}
                >
                  <Settings size={12} />
                  <span>Dynamic Rules Editor</span>
                </button>
                <button
                  onClick={() => { setActiveTab('EXCLUDED'); }}
                  className={`px-4 py-2 text-xs font-bold rounded-lg cursor-pointer transition flex items-center space-x-1.5 ${activeTab === 'EXCLUDED' ? 'bg-amber-500/10 text-amber-450 border border-amber-500/20' : 'text-slate-400 hover:text-slate-200 border border-transparent'}`}
                >
                  <ShieldAlert size={12} />
                  <span>Excluded Names</span>
                </button>
              </div>

              {activeTab === 'SUMMARY' && (
                <div className="relative max-w-xs w-full">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-500 pointer-events-none">
                    <Search size={14} />
                  </span>
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                    className="w-full bg-slate-950 text-white placeholder-slate-500 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs outline-none focus:border-amber-500/50"
                    placeholder="Search staff member name..."
                  />
                  {searchTerm && (
                    <button
                      onClick={() => setSearchTerm('')}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-white"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              )}
              
              <div className="flex items-center space-x-2">
                <span className="text-xs text-slate-400 truncate max-w-[200px]">{fileName}</span>
                <button
                  onClick={handleReset}
                  className="px-3 py-1.5 bg-slate-950 hover:bg-slate-900 border border-slate-800 text-slate-400 hover:text-white rounded-lg text-[10px] font-bold cursor-pointer transition"
                >
                  Clear / Upload New
                </button>
              </div>
            </div>

            {/* TAB CONTENT: 1. SUMMARY GRID */}
            {activeTab === 'SUMMARY' && (
              <div className="space-y-4">
                <div className="border border-slate-850 rounded-2xl overflow-hidden bg-slate-950/40">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-950 border-b border-slate-850 text-slate-400 text-[10px] font-extrabold uppercase tracking-wider">
                          <th className="py-4 px-6">Staff Name</th>
                          {activeRules.map(r => (
                            <th key={r.role} className="py-4 px-4 text-right truncate max-w-[120px]" title={r.role}>
                              {r.role.replace('  ', ' ')}
                            </th>
                          ))}
                          <th className="py-4 px-6 text-right text-amber-450">Total Incentive</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-850 text-xs font-semibold text-slate-300">
                        {currentSummary.length > 0 ? (
                          currentSummary.map((item, index) => (
                            <tr
                              key={item.name}
                              className={`hover:bg-slate-900/60 transition-colors ${index % 2 === 0 ? 'bg-slate-950/10' : ''}`}
                            >
                              <td className="py-4 px-6 font-bold text-white whitespace-nowrap">{item.name}</td>
                              {activeRules.map(r => (
                                <td key={r.role} className="py-4 px-4 text-right font-mono">
                                  {item[r.role] > 0 ? `₹${item[r.role].toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-'}
                                </td>
                              ))}
                              <td className="py-4 px-6 text-right font-bold text-amber-400 font-mono">
                                ₹{item.total.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={summaryHeaders.length} className="text-center py-10 text-slate-500 font-bold">
                              No staff matches found.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Pagination Controls */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between pt-2">
                    <span className="text-[10px] text-slate-500 font-bold">
                      Showing {indexOfFirstItem + 1}-{Math.min(indexOfLastItem, filteredSummary.length)} of {filteredSummary.length} staff members
                    </span>
                    <div className="flex space-x-2">
                      <button
                        onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                        disabled={currentPage === 1}
                        className="px-3 py-1.5 bg-slate-950 hover:bg-slate-900 border border-slate-850 text-slate-400 hover:text-white rounded-lg text-xs font-bold cursor-pointer transition disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        Prev
                      </button>
                      <span className="px-3 py-1.5 text-xs text-white font-mono flex items-center">
                        Page {currentPage} of {totalPages}
                      </span>
                      <button
                        onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                        disabled={currentPage === totalPages}
                        className="px-3 py-1.5 bg-slate-950 hover:bg-slate-900 border border-slate-850 text-slate-400 hover:text-white rounded-lg text-xs font-bold cursor-pointer transition disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB CONTENT: 2. WARNINGS PANEL */}
            {activeTab === 'WARNINGS' && (
              <div className="space-y-6">
                <div className="p-5 bg-amber-500/5 border border-amber-500/10 rounded-2xl space-y-2">
                  <div className="flex items-center space-x-2 text-amber-500 font-bold text-sm">
                    <AlertTriangle size={18} />
                    <span>Potential Data Entry Typos & High Freight Values</span>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    The system automatically flags any LR transaction with a freight amount exceeding <strong>₹50,000</strong>. 
                    This helps catch GST numbers, barcode scans, or phone numbers accidentally typed into the freight amount column. 
                    You can edit the freight values directly below and click <strong>Apply Corrections</strong> to recalculate the incentives.
                  </p>
                </div>

                <div className="border border-slate-850 rounded-2xl overflow-hidden bg-slate-950/40">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-950 border-b border-slate-850 text-slate-400 text-[10px] font-extrabold uppercase tracking-wider">
                          <th className="py-4 px-6">Row #</th>
                          <th className="py-4 px-4">LR Number</th>
                          <th className="py-4 px-4">Consignee</th>
                          <th className="py-4 px-4 text-right">Original Freight</th>
                          <th className="py-4 px-6 text-center" style={{ width: '220px' }}>Corrected Freight (₹)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-850 text-xs font-semibold text-slate-300">
                        {calculationResults.errors.length > 0 ? (
                          calculationResults.errors.map((item) => {
                            const val = editedFreights[item.rowIdx] !== undefined 
                              ? editedFreights[item.rowIdx] 
                              : item.freight;

                            return (
                              <tr key={item.rowIdx} className="hover:bg-slate-900/40 transition-colors">
                                <td className="py-4 px-6 font-mono text-slate-500">#{item.rowIdx + 1}</td>
                                <td className="py-4 px-4 font-bold text-white">{item.lrNumber}</td>
                                <td className="py-4 px-4 text-slate-400 truncate max-w-[280px]" title={item.consignee}>
                                  {item.consignee || '-'}
                                </td>
                                <td className="py-4 px-4 text-right font-mono font-bold text-red-400">
                                  ₹{item.freight.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                                </td>
                                <td className="py-3 px-6 text-center">
                                  <div className="inline-flex items-center space-x-2">
                                    <span className="text-slate-500 font-mono text-xs">₹</span>
                                    <input
                                      type="number"
                                      value={val}
                                      onChange={(e) => handleFreightEdit(item.rowIdx, e.target.value)}
                                      className="w-32 bg-slate-950 text-white text-right font-mono border border-slate-800 focus:border-amber-500/50 outline-none rounded-lg px-2 py-1 text-xs"
                                    />
                                    {editedFreights[item.rowIdx] !== undefined && (
                                      <button
                                        onClick={() => {
                                          const updated = { ...editedFreights };
                                          delete updated[item.rowIdx];
                                          setEditedFreights(updated);
                                        }}
                                        className="p-1 bg-slate-800 text-slate-400 hover:text-white rounded"
                                        title="Revert correction"
                                      >
                                        <X size={12} />
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })
                        ) : (
                          <tr>
                            <td colSpan={5} className="text-center py-10 text-slate-500 font-bold">
                              No high-freight anomalies detected. Everything looks solid!
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {calculationResults.errors.length > 0 && (
                  <div className="flex justify-end">
                    <button
                      onClick={handleApplyWarningEdits}
                      className="px-6 py-3 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-xs rounded-xl shadow-lg shadow-amber-500/10 cursor-pointer flex items-center space-x-2 transition"
                    >
                      <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                      <span>Apply Corrections & Recalculate</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* TAB CONTENT: 3. DYNAMIC RULES CONFIGURATOR */}
            {activeTab === 'RULES' && (
              <div className="space-y-6">
                <div className="p-5 bg-slate-950 border border-slate-800/80 rounded-2xl space-y-2">
                  <div className="flex items-center space-x-2 text-white font-bold text-sm">
                    <Settings size={18} className="text-amber-500" />
                    <span>Dynamic Rates & Portions Configurator</span>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Modify the coefficients loaded from the <code>rules</code> sheet. These parameters calculate the incentive as:
                    <code className="block mt-2 bg-slate-900 p-2 rounded text-amber-400 font-mono text-[10px]">
                      Incentive Amount = Freight Amt * Portion of Freight * Incentive Percentage
                    </code>
                  </p>
                </div>

                <div className="border border-slate-850 rounded-2xl overflow-hidden bg-slate-950/40">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-950 border-b border-slate-850 text-slate-400 text-[10px] font-extrabold uppercase tracking-wider">
                        <th className="py-4 px-6">Role Heading (From Sheet)</th>
                        <th className="py-4 px-6 text-center">Portion of Freight</th>
                        <th className="py-4 px-6 text-center">Incentive Percentage</th>
                        <th className="py-4 px-6 text-right">Example on ₹1,000 Freight</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-850 text-xs font-semibold text-slate-300">
                      {activeRules.map((rule, idx) => {
                        const portionVal = rule.portion;
                        const pctVal = rule.percentage;
                        const exampleVal = 1000 * portionVal * pctVal;

                        return (
                          <tr key={rule.role} className="hover:bg-slate-900/40 transition-colors">
                            <td className="py-4 px-6 font-bold text-white">{rule.role}</td>
                            <td className="py-3 px-6 text-center">
                              <input
                                type="number"
                                step="0.05"
                                value={portionVal}
                                onChange={(e) => handleRuleChange(idx, 'portion', e.target.value)}
                                className="w-24 bg-slate-950 text-center font-mono border border-slate-800 focus:border-amber-500/50 outline-none rounded-lg px-2 py-1.5 text-xs text-white font-bold"
                              />
                            </td>
                            <td className="py-3 px-6 text-center">
                              <div className="inline-flex items-center space-x-1.5">
                                <input
                                  type="number"
                                  step="0.001"
                                  value={pctVal}
                                  onChange={(e) => handleRuleChange(idx, 'percentage', e.target.value)}
                                  className="w-28 bg-slate-950 text-center font-mono border border-slate-800 focus:border-amber-500/50 outline-none rounded-lg px-2 py-1.5 text-xs text-white font-bold"
                                />
                                <span className="text-slate-500 font-mono text-[10px]">
                                  ({(pctVal * 100).toFixed(2)}%)
                                </span>
                              </div>
                            </td>
                            <td className="py-4 px-6 text-right font-mono font-bold text-amber-450">
                              ₹{exampleVal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="flex justify-end space-x-3">
                  <button
                    onClick={() => {
                      setActiveRules(DEFAULT_RULES);
                      runCalculation(rawData);
                      setSuccessMessage("Rules reset to default coefficients!");
                      setTimeout(() => setSuccessMessage(null), 3000);
                    }}
                    className="px-4 py-3 bg-slate-950 hover:bg-slate-900 text-slate-400 hover:text-white border border-slate-800 rounded-xl text-xs font-bold cursor-pointer transition"
                  >
                    Reset to Defaults
                  </button>
                  <button
                    onClick={() => {
                      runCalculation(rawData);
                      setSuccessMessage("Incentives recalculated with updated parameters!");
                      setTimeout(() => setSuccessMessage(null), 3000);
                    }}
                    className="px-6 py-3 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-xs rounded-xl shadow-lg shadow-amber-500/10 cursor-pointer flex items-center space-x-2 transition"
                  >
                    <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                    <span>Recalculate Incentives</span>
                  </button>
                </div>
              </div>
            )}

            {/* TAB CONTENT: 4. EXCLUDED NAMES PANEL */}
            {activeTab === 'EXCLUDED' && (
              <div className="space-y-6">
                <div className="p-5 bg-slate-950 border border-slate-800/80 rounded-2xl space-y-2">
                  <div className="flex items-center space-x-2 text-white font-bold text-sm">
                    <ShieldAlert size={18} className="text-amber-500" />
                    <span>Manage Excluded Staff Names</span>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed font-semibold">
                    The names below will be skipped from payroll/incentive calculations. 
                    This keeps placeholder keys, unassigned values (like <code>0</code> or <code>#N/A</code>), or system accounts (like <code>Admin</code>) from showing up as paid staff members.
                  </p>
                </div>

                {/* Add new excluded tag */}
                <form onSubmit={handleAddExcludedName} className="flex items-center space-x-2 max-w-sm">
                  <input
                    type="text"
                    value={newExcludedName}
                    onChange={(e) => setNewExcludedName(e.target.value)}
                    placeholder="Enter name to exclude (e.g. Guest)"
                    className="flex-grow bg-slate-950 text-white placeholder-slate-500 border border-slate-800 focus:border-amber-500/50 outline-none rounded-xl px-3 py-2 text-xs"
                  />
                  <button
                    type="submit"
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold flex items-center space-x-1 border border-slate-750 transition cursor-pointer"
                  >
                    <Plus size={14} />
                    <span>Exclude</span>
                  </button>
                </form>

                {/* Tags grid */}
                <div className="p-6 bg-slate-950/40 border border-slate-850 rounded-2xl">
                  <span className="text-[10px] text-slate-500 font-extrabold uppercase tracking-widest block mb-4">Active Exclusions ({excludedNames.size})</span>
                  <div className="flex flex-wrap gap-2.5">
                    {Array.from(excludedNames).map(name => (
                      <div
                        key={name}
                        className="inline-flex items-center bg-slate-900 border border-slate-850 text-slate-350 px-3 py-1.5 rounded-xl text-xs font-bold space-x-1.5 shadow-sm"
                      >
                        <span className="font-mono">{name}</span>
                        <button
                          onClick={() => handleRemoveExcludedName(name)}
                          className="text-slate-500 hover:text-white transition shrink-0 cursor-pointer"
                          title="Remove from exclusion"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
            
          </div>
        )}

      </div>
    </div>
  );
}
