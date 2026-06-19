import React, { useState } from 'react';
import { Upload, Loader2, CheckCircle, FileSpreadsheet, AlertTriangle, Download, ArrowLeft, AlertCircle, Info, RefreshCw } from 'lucide-react';
import * as XLSX from 'xlsx';
import XLSXStyle from 'xlsx-js-style';
import { processFreightData } from '../utils/freightCalculatorEngine';

export default function FreightCalculator({ onBack }) {
    const [ratesFile, setRatesFile] = useState(null);
    const [ratesWorkbook, setRatesWorkbook] = useState(null);
    const [lrFile, setLrFile] = useState(null);
    const [lrWorkbook, setLrWorkbook] = useState(null);
    
    const [loading, setLoading] = useState(false);
    const [auditResults, setAuditResults] = useState(null);
    const [error, setError] = useState(null);
    const [previewFilter, setPreviewFilter] = useState('ALL_MISMATCH'); // 'ALL_MISMATCH', 'ERROR', 'MANUAL'

    const handleFileChange = (e, setFile, setWorkbook) => {
        const file = e.target.files[0];
        if (!file) return;
        setFile(file);
        
        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const data = new Uint8Array(evt.target.result);
                const wb = XLSX.read(data, { type: 'array' });
                setWorkbook(wb);
                setError(null);
            } catch (err) {
                console.error("Error reading file", err);
                setError("Error parsing Excel file: " + err.message);
            }
        };
        reader.readAsArrayBuffer(file);
    };

    const runAudit = () => {
        if (!ratesWorkbook || !lrWorkbook) {
            setError("Please upload both Master Rates and ERP LR Data files first.");
            return;
        }

        setLoading(true);
        setError(null);

        // Run calculations asynchronously to avoid freezing the UI thread
        setTimeout(() => {
            try {
                const results = processFreightData(lrWorkbook, ratesWorkbook);
                setAuditResults(results);
                setLoading(false);
            } catch (err) {
                console.error("Audit error:", err);
                setError(err.message || "An unexpected error occurred during processing.");
                setLoading(false);
            }
        }, 100);
    };

    const handleDownload = () => {
        if (!auditResults) return;
        const { dfLr, consignorsData } = auditResults;
        
        try {
            const wb = XLSXStyle.utils.book_new();
            
            // Create worksheets
            const wsResults = XLSXStyle.utils.json_to_sheet(dfLr);
            const wsConsignors = XLSXStyle.utils.json_to_sheet(consignorsData);
            
            // Apply styling
            applyStylesToResultsSheet(wsResults, dfLr);
            applyStylesToConsignorsSheet(wsConsignors, consignorsData);
            
            XLSXStyle.utils.book_append_sheet(wb, wsResults, "Audit_Results");
            XLSXStyle.utils.book_append_sheet(wb, wsConsignors, "CONSIGNORS");
            
            XLSXStyle.writeFile(wb, "Freight_Audit_Report.xlsx");
        } catch (err) {
            console.error("Excel generation error:", err);
            setError("Could not generate Excel file: " + err.message);
        }
    };

    const applyStylesToResultsSheet = (ws, data) => {
        if (!ws['!ref']) return;
        const range = XLSXStyle.utils.decode_range(ws['!ref']);
        
        let findedReasonColIdx = -1;
        let boxesStrColIdx = -1;
        
        // Style Headers
        for (let c = range.s.c; c <= range.e.c; c++) {
            const cellAddress = XLSXStyle.utils.encode_cell({ r: range.s.r, c: c });
            const cell = ws[cellAddress];
            if (cell) {
                const h = String(cell.v).toUpperCase();
                if (h === 'FINDED REASON') findedReasonColIdx = c;
                if (h === 'BOXES STR') boxesStrColIdx = c;
                
                cell.s = {
                    fill: { fgColor: { rgb: "1E293B" } }, // slate-800
                    font: { name: "Calibri", sz: 11, color: { rgb: "FFFFFF" }, bold: true },
                    alignment: { horizontal: "center", vertical: "center" },
                    border: {
                        top: { style: "thin", color: { rgb: "D3D3D3" } },
                        bottom: { style: "medium", color: { rgb: "000000" } },
                        left: { style: "thin", color: { rgb: "D3D3D3" } },
                        right: { style: "thin", color: { rgb: "D3D3D3" } }
                    }
                };
            }
        }
        
        // Style Data Rows
        for (let r = range.s.r + 1; r <= range.e.r; r++) {
            const item = data[r - 1];
            if (!item) continue;
            
            const isManual = item['Finded Reason'] === 'Manual Rate Added Lr';
            const isNotSelectedBox = item['Finded Reason'] === 'Not selected Box type';
            const isError = item['Discrepancy Status'] === 'Error';
            
            for (let c = range.s.c; c <= range.e.c; c++) {
                const cellAddress = XLSXStyle.utils.encode_cell({ r: r, c: c });
                const cell = ws[cellAddress];
                if (!cell) continue;
                
                // Base style
                cell.s = {
                    font: { name: "Calibri", sz: 11 },
                    border: {
                        top: { style: "thin", color: { rgb: "E2E8F0" } },
                        bottom: { style: "thin", color: { rgb: "E2E8F0" } },
                        left: { style: "thin", color: { rgb: "E2E8F0" } },
                        right: { style: "thin", color: { rgb: "E2E8F0" } }
                    }
                };
                
                if (isManual) {
                    // lightpink: FFC0CB
                    cell.s.fill = { fgColor: { rgb: "FFC0CB" } };
                } else if (isError) {
                    // Light amber for rows with missing master rates or errors
                    cell.s.fill = { fgColor: { rgb: "FEF3C7" } };
                }
                
                if (isNotSelectedBox && c === boxesStrColIdx) {
                    // Red background, white text for BOXES STR
                    cell.s.fill = { fgColor: { rgb: "EF4444" } };
                    cell.s.font = { name: "Calibri", sz: 11, color: { rgb: "FFFFFF" }, bold: true };
                }
            }
        }
    };

    const applyStylesToConsignorsSheet = (ws, data) => {
        if (!ws['!ref']) return;
        const range = XLSXStyle.utils.decode_range(ws['!ref']);
        
        // Style Headers
        for (let c = range.s.c; c <= range.e.c; c++) {
            const cellAddress = XLSXStyle.utils.encode_cell({ r: range.s.r, c: c });
            const cell = ws[cellAddress];
            if (cell) {
                cell.s = {
                    fill: { fgColor: { rgb: "0F172A" } }, // slate-900
                    font: { name: "Calibri", sz: 11, color: { rgb: "FFFFFF" }, bold: true },
                    alignment: { horizontal: "center", vertical: "center" },
                    border: {
                        top: { style: "thin", color: { rgb: "D3D3D3" } },
                        bottom: { style: "medium", color: { rgb: "000000" } },
                        left: { style: "thin", color: { rgb: "D3D3D3" } },
                        right: { style: "thin", color: { rgb: "D3D3D3" } }
                    }
                };
            }
        }
        
        // Style Data Rows
        for (let r = range.s.r + 1; r <= range.e.r; r++) {
            const item = data[r - 1];
            if (!item) continue;
            
            const isGrandTotal = item['CONSIGNOR'] === 'GRAND TOTAL';
            
            for (let c = range.s.c; c <= range.e.c; c++) {
                const cellAddress = XLSXStyle.utils.encode_cell({ r: r, c: c });
                const cell = ws[cellAddress];
                if (!cell) continue;
                
                cell.s = {
                    font: { name: "Calibri", sz: 11 },
                    border: {
                        top: { style: "thin", color: { rgb: "E2E8F0" } },
                        bottom: { style: "thin", color: { rgb: "E2E8F0" } },
                        left: { style: "thin", color: { rgb: "E2E8F0" } },
                        right: { style: "thin", color: { rgb: "E2E8F0" } }
                    }
                };
                
                if (isGrandTotal) {
                    cell.s.fill = { fgColor: { rgb: "E2E8F0" } }; // Slate-200 / light gray
                    cell.s.font = { name: "Calibri", sz: 11, bold: true };
                    cell.s.border.bottom = { style: "double", color: { rgb: "000000" } };
                }
            }
        }
    };

    const resetAudit = () => {
        setRatesFile(null);
        setRatesWorkbook(null);
        setLrFile(null);
        setLrWorkbook(null);
        setAuditResults(null);
        setError(null);
    };

    // Filtered mismatches for preview table
    const getFilteredPreview = () => {
        if (!auditResults) return [];
        const { dfLr } = auditResults;
        
        return dfLr.filter(r => {
            if (previewFilter === 'ALL_MISMATCH') {
                return r['Discrepancy Status'] === 'Mismatch';
            }
            if (previewFilter === 'ERROR') {
                return r['Discrepancy Status'] === 'Error';
            }
            if (previewFilter === 'MANUAL') {
                return r['Finded Reason'] === 'Manual Rate Added Lr';
            }
            return false;
        }).slice(0, 50); // Show first 50
    };

    return (
        <div className="w-full space-y-6">
            {/* Header */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4 shadow-xl">
                <div className="space-y-1">
                    <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                        <span>🚚</span> Freight Billing Audit Tool
                    </h2>
                    <p className="text-slate-400 text-sm">
                        Verify ERP LR Data against Consignor Master Rates to find discrepancies. Runs entirely in your browser.
                    </p>
                </div>
                <button
                    onClick={onBack}
                    className="self-start md:self-auto px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-xl text-sm transition flex items-center gap-2 border border-slate-750"
                >
                    <ArrowLeft size={16} /> Back to Hub
                </button>
            </div>

            {error && (
                <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-2xl flex items-start gap-3 shadow-md">
                    <AlertCircle className="shrink-0 mt-0.5" size={18} />
                    <div className="text-sm">
                        <span className="font-bold">Error:</span> {error}
                    </div>
                </div>
            )}

            {!auditResults && !loading && (
                <div className="grid md:grid-cols-2 gap-6">
                    {/* File 1: Master Rates */}
                    <div className="bg-white border border-slate-100 rounded-3xl p-6 shadow-sm flex flex-col justify-between min-h-[300px]">
                        <div className="space-y-4">
                            <div className="flex items-center gap-3">
                                <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl">
                                    <FileSpreadsheet size={24} />
                                </div>
                                <div>
                                    <h3 className="font-bold text-slate-800 text-lg">1. Master Rates File</h3>
                                    <p className="text-slate-400 text-xs mt-0.5">Upload 'All Consignors - RATES Combined.xlsx'</p>
                                </div>
                            </div>
                            
                            <label className="border-2 border-dashed border-slate-200 rounded-2xl p-8 flex flex-col items-center justify-center cursor-pointer hover:bg-slate-50 hover:border-indigo-400 transition-all group">
                                <input
                                    type="file"
                                    accept=".xlsx, .xls"
                                    onChange={(e) => handleFileChange(e, setRatesFile, setRatesWorkbook)}
                                    className="hidden"
                                />
                                <Upload className="text-slate-400 group-hover:text-indigo-500 transition mb-3" size={32} />
                                <span className="font-semibold text-slate-700 text-sm group-hover:text-indigo-600 transition">
                                    {ratesFile ? ratesFile.name : "Select Master Rates File"}
                                </span>
                                <span className="text-slate-400 text-xs mt-1">Excel format (.xlsx)</span>
                            </label>
                        </div>
                        
                        {ratesFile && (
                            <div className="mt-4 p-3 bg-emerald-50 border border-emerald-100 text-emerald-700 rounded-xl text-xs font-semibold flex items-center gap-2">
                                <CheckCircle size={16} /> Loaded: {ratesFile.name} ({(ratesFile.size / 1024).toFixed(1)} KB)
                            </div>
                        )}
                    </div>

                    {/* File 2: ERP LR Data */}
                    <div className="bg-white border border-slate-100 rounded-3xl p-6 shadow-sm flex flex-col justify-between min-h-[300px]">
                        <div className="space-y-4">
                            <div className="flex items-center gap-3">
                                <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl">
                                    <FileSpreadsheet size={24} />
                                </div>
                                <div>
                                    <h3 className="font-bold text-slate-800 text-lg">2. ERP LR Data File</h3>
                                    <p className="text-slate-400 text-xs mt-0.5">Upload 'LR Data.xlsx'</p>
                                </div>
                            </div>
                            
                            <label className="border-2 border-dashed border-slate-200 rounded-2xl p-8 flex flex-col items-center justify-center cursor-pointer hover:bg-slate-50 hover:border-indigo-400 transition-all group">
                                <input
                                    type="file"
                                    accept=".xlsx, .xls"
                                    onChange={(e) => handleFileChange(e, setLrFile, setLrWorkbook)}
                                    className="hidden"
                                />
                                <Upload className="text-slate-400 group-hover:text-indigo-500 transition mb-3" size={32} />
                                <span className="font-semibold text-slate-700 text-sm group-hover:text-indigo-600 transition">
                                    {lrFile ? lrFile.name : "Select ERP LR Data"}
                                </span>
                                <span className="text-slate-400 text-xs mt-1">Excel format (.xlsx)</span>
                            </label>
                        </div>
                        
                        {lrFile && (
                            <div className="mt-4 p-3 bg-emerald-50 border border-emerald-100 text-emerald-700 rounded-xl text-xs font-semibold flex items-center gap-2">
                                <CheckCircle size={16} /> Loaded: {lrFile.name} ({(lrFile.size / 1024).toFixed(1)} KB)
                            </div>
                        )}
                    </div>
                </div>
            )}

            {!auditResults && !loading && ratesWorkbook && lrWorkbook && (
                <div className="flex justify-center pt-2">
                    <button
                        onClick={runAudit}
                        className="w-full max-w-md bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-4 rounded-2xl shadow-lg shadow-indigo-600/20 active:scale-[0.98] transition flex items-center justify-center gap-2 cursor-pointer"
                    >
                        🚀 Run Freight Audit
                    </button>
                </div>
            )}

            {loading && (
                <div className="bg-white border border-slate-100 rounded-3xl p-12 shadow-sm flex flex-col items-center justify-center space-y-4">
                    <div className="relative flex items-center justify-center">
                        <div className="absolute w-16 h-16 bg-indigo-500/10 rounded-full animate-ping" />
                        <Loader2 className="animate-spin text-indigo-600 relative z-10" size={40} />
                    </div>
                    <div className="text-center">
                        <h3 className="font-bold text-slate-800 text-lg">Auditing Freight Rates</h3>
                        <p className="text-slate-400 text-sm mt-1">Comparing LR entries with Master Rates...</p>
                    </div>
                </div>
            )}

            {/* Results Display */}
            {auditResults && !loading && (
                <div className="space-y-6">
                    {/* KPI Dashboard */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        <div className="bg-white border border-slate-100 p-6 rounded-2xl shadow-sm">
                            <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">Total LRs Processed</span>
                            <div className="text-3xl font-black text-slate-800 mt-2">
                                {auditResults.summaryStats.total_processed}
                            </div>
                        </div>

                        <div className="bg-emerald-50 border border-emerald-100 p-6 rounded-2xl shadow-sm">
                            <span className="text-xs text-emerald-600 font-bold uppercase tracking-wider">Exact Matches</span>
                            <div className="text-3xl font-black text-emerald-700 mt-2">
                                {auditResults.summaryStats.matches}
                            </div>
                        </div>

                        <div className="bg-rose-50 border border-rose-100 p-6 rounded-2xl shadow-sm">
                            <span className="text-xs text-rose-600 font-bold uppercase tracking-wider">Discrepancies</span>
                            <div className="text-3xl font-black text-rose-700 mt-2">
                                {auditResults.summaryStats.discrepancies}
                            </div>
                        </div>

                        <div className="bg-amber-50 border border-amber-100 p-6 rounded-2xl shadow-sm">
                            <span className="text-xs text-amber-600 font-bold uppercase tracking-wider">Errors / Missing</span>
                            <div className="text-3xl font-black text-amber-700 mt-2">
                                {auditResults.summaryStats.errors}
                            </div>
                        </div>
                    </div>

                    {/* Download & Action Buttons */}
                    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 flex flex-col md:flex-row items-center justify-between gap-4 shadow-xl">
                        <div className="space-y-1">
                            <h3 className="font-bold text-white text-lg flex items-center gap-2">
                                🌟 Audit Completed Successfully
                            </h3>
                            <p className="text-slate-400 text-sm">
                                Download the full audit report with worksheets 'Audit_Results' and 'CONSIGNORS'.
                            </p>
                        </div>
                        
                        <div className="flex flex-wrap gap-3 w-full md:w-auto">
                            <button
                                onClick={resetAudit}
                                className="px-5 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl text-sm transition flex items-center justify-center gap-2 border border-slate-750 flex-1 md:flex-initial"
                            >
                                <RefreshCw size={16} /> Audit Another
                            </button>
                            <button
                                onClick={handleDownload}
                                className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-sm transition flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/30 flex-1 md:flex-initial cursor-pointer"
                            >
                                <Download size={18} /> Download Excel Report
                            </button>
                        </div>
                    </div>

                    {/* Discrepancy Preview */}
                    <div className="bg-white border border-slate-100 rounded-3xl p-6 shadow-sm space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                            <div className="space-y-1">
                                <h3 className="font-bold text-slate-800 text-lg">Audit Discrepancies Preview</h3>
                                <p className="text-slate-400 text-xs">Displaying up to 50 records matching filter below.</p>
                            </div>
                            
                            {/* Filters */}
                            <div className="flex bg-slate-100 p-1 rounded-xl self-start sm:self-auto">
                                <button
                                    onClick={() => setPreviewFilter('ALL_MISMATCH')}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${previewFilter === 'ALL_MISMATCH' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                                >
                                    Mismatches ({auditResults.summaryStats.discrepancies})
                                </button>
                                <button
                                    onClick={() => setPreviewFilter('ERROR')}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${previewFilter === 'ERROR' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                                >
                                    Errors ({auditResults.summaryStats.errors})
                                </button>
                                <button
                                    onClick={() => setPreviewFilter('MANUAL')}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${previewFilter === 'MANUAL' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                                >
                                    Manual Rates
                                </button>
                            </div>
                        </div>

                        {/* Preview Table */}
                        {getFilteredPreview().length > 0 ? (
                            <div className="overflow-x-auto border border-slate-100 rounded-2xl scrollbar-thin">
                                <table className="w-full text-left border-collapse text-xs">
                                    <thead>
                                        <tr className="bg-slate-900 text-white font-bold">
                                            <th className="p-3">Date</th>
                                            <th className="p-3">LR No</th>
                                            <th className="p-3">Consignor</th>
                                            <th className="p-3">Consignee</th>
                                            <th className="p-3">Destination</th>
                                            <th className="p-3 text-right">ERP Total</th>
                                            <th className="p-3 text-right">Audit Total</th>
                                            <th className="p-3 text-right">Diff</th>
                                            <th className="p-3">Reason</th>
                                            <th className="p-3">Remarks</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-150">
                                        {getFilteredPreview().map((row, idx) => {
                                            const isManual = row['Finded Reason'] === 'Manual Rate Added Lr';
                                            const isNotSelectedBox = row['Finded Reason'] === 'Not selected Box type';
                                            const isError = row['Discrepancy Status'] === 'Error';
                                            
                                            let bgClass = "bg-white";
                                            if (isManual) bgClass = "bg-rose-50"; // Highlight pinkish
                                            else if (isError) bgClass = "bg-amber-50"; // Highlight amber
                                            
                                            return (
                                                <tr key={idx} className={`${bgClass} hover:bg-slate-50 transition-colors`}>
                                                    <td className="p-3 font-medium text-slate-650">{row['DATE']}</td>
                                                    <td className="p-3 font-bold text-slate-800">{row['LR NO']}</td>
                                                    <td className="p-3 text-slate-650 truncate max-w-[120px]" title={row['CONSIGNOR']}>{row['CONSIGNOR']}</td>
                                                    <td className="p-3 text-slate-650 truncate max-w-[150px]" title={row['CONSIGNEE']}>{row['CONSIGNEE']}</td>
                                                    <td className="p-3 text-slate-650">{row['DESTINATION']}</td>
                                                    <td className="p-3 text-right font-semibold text-slate-700">₹{parseFloat(row['Existing ERP Total']).toFixed(2)}</td>
                                                    <td className="p-3 text-right font-semibold text-indigo-700">
                                                        {isNaN(row['Grand Total with UL']) ? '-' : `₹${parseFloat(row['Grand Total with UL']).toFixed(2)}`}
                                                    </td>
                                                    <td className={`p-3 text-right font-bold ${parseFloat(row['Amount Difference']) < 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                                        {isNaN(row['Amount Difference']) ? '-' : `₹${parseFloat(row['Amount Difference']).toFixed(2)}`}
                                                    </td>
                                                    <td className="p-3">
                                                        <span className={`px-2 py-1 rounded-full text-[10px] font-bold ${
                                                            isManual ? 'bg-pink-100 text-pink-700' :
                                                            isNotSelectedBox ? 'bg-red-100 text-red-700 font-bold' :
                                                            isError ? 'bg-amber-100 text-amber-700' :
                                                            'bg-slate-100 text-slate-650'
                                                        }`}>
                                                            {row['Finded Reason'] || 'Mismatch'}
                                                        </span>
                                                    </td>
                                                    <td className="p-3 text-slate-400 italic max-w-[200px] truncate" title={row['Remarks']}>{row['Remarks'] || '-'}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <div className="p-12 text-center text-slate-400 border border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center">
                                <Info size={32} className="mb-2 text-slate-300" />
                                <p className="font-semibold text-sm">No records found for the selected filter.</p>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
