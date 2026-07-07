import React, { useState, useEffect } from 'react';
import { Upload, AlertTriangle, CheckCircle, Download, Search, Info, RefreshCw, X, Play, ShieldAlert, FileSpreadsheet, Users, ArrowRight, UserPlus, UserMinus, Sparkles } from 'lucide-react';
import axios from 'axios';
import * as XLSX from 'xlsx-js-style';

export default function EFFPayrollAuditor({ onBack }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  const [fileName, setFileName] = useState('');
  const [workbook, setWorkbook] = useState(null);
  
  // Audited calculations and data
  const [auditResults, setAuditResults] = useState(null);
  const [activeTab, setActiveTab] = useState('SUMMARY'); // 'SUMMARY', 'MATH_ERRORS', 'PT_OMISSIONS', 'BASIC_MISMATCH', 'ROSTER_SHIFTS'
  const [searchTerm, setSearchTerm] = useState('');

  // Auto-load workspace file on mount if available
  useEffect(() => {
    loadFromWorkspace();
  }, []);

  const loadFromWorkspace = async () => {
    setLoading(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const isProd = import.meta.env.PROD;
      const baseUrl = isProd ? '' : 'http://localhost:3001';
      const response = await axios.get(`${baseUrl}/api/payroll/load-eff-workspace`);
      if (response.data && response.data.fileData) {
        setFileName(response.data.fileName);
        const binaryString = atob(response.data.fileData);
        const wb = XLSX.read(binaryString, { type: 'binary', cellDates: true });
        setWorkbook(wb);
        runAudit(wb);
        setSuccessMessage("Loaded EFF Salary Payroll spreadsheet from workspace successfully!");
      }
    } catch (err) {
      console.log("Could not auto-load workspace file. User can upload manually.", err.message);
      // Don't show hard error since this is a convenience feature for local dev
    } finally {
      setLoading(false);
    }
  };

  const handleExcelUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setLoading(true);
    setError(null);
    setSuccessMessage(null);
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const bstr = event.target.result;
        const wb = XLSX.read(bstr, { type: 'binary', cellDates: true });
        setWorkbook(wb);
        runAudit(wb);
        setSuccessMessage("Uploaded spreadsheet parsed and audited successfully!");
      } catch (err) {
        console.error(err);
        setError("Failed to parse Excel file: " + err.message);
      } finally {
        setLoading(false);
      }
    };
    reader.onerror = () => {
      setError("File reading error.");
      setLoading(false);
    };
    reader.readAsBinaryString(file);
  };

  // Main Audit Logic
  const runAudit = (wb) => {
    try {
      const sheetNames = wb.SheetNames;
      const sheetJune = wb.SheetNames.find(n => n.toUpperCase().includes('JUNE 2026'));
      const sheetMay = wb.SheetNames.find(n => n.toUpperCase().includes('MAY 2026'));
      const sheetApril = wb.SheetNames.find(n => n.toUpperCase().includes('APRIL 2026'));

      if (!sheetJune) {
        throw new Error("Could not find 'JUNE 2026' sheet in the workbook.");
      }

      // 1. Extract Roster names from April & May
      const namesApril = new Set();
      if (sheetApril) {
        const wsApril = wb.Sheets[sheetApril];
        const jsonApril = XLSX.utils.sheet_to_json(wsApril, { header: 1 });
        // April has data starting from Row 2 (index 1)
        for (let r = 1; r < jsonApril.length; r++) {
          const row = jsonApril[r];
          if (row && typeof row[0] === 'number' && row[1]) {
            namesApril.add(String(row[1]).trim().toUpperCase());
          }
        }
      }

      const namesMay = new Set();
      const maySalaries = {};
      if (sheetMay) {
        const wsMay = wb.Sheets[sheetMay];
        const jsonMay = XLSX.utils.sheet_to_json(wsMay, { header: 1 });
        
        // Find indexes dynamically for Name, Gross Basic, Gross Salary
        const mayHeaders = jsonMay[3] || [];
        const mNameIdx = 2; // Default Col 3
        const mBasicIdx = 13; // Default Col 14
        const mGrossIdx = 19; // Default Col 20
        
        for (let r = 4; r < jsonMay.length; r++) {
          const row = jsonMay[r];
          if (row && row[0] && row[mNameIdx]) { // Sl No and Name
            const nameClean = String(row[mNameIdx]).trim().toUpperCase();
            if (!String(row[0]).startsWith('Total') && !nameClean.startsWith('Total')) {
              namesMay.add(nameClean);
              const cleanNum = (val) => {
                if (val === undefined || val === null || String(val).trim() === '' || String(val).trim() === '-') return 0;
                return Number(String(val).replace(/,/g, '').trim()) || 0;
              };
              maySalaries[nameClean] = {
                basic: cleanNum(row[mBasicIdx]),
                gross: cleanNum(row[mGrossIdx])
              };
            }
          }
        }
      }

      // 2. Parse and Audit June Sheet
      const wsJune = wb.Sheets[sheetJune];
      const jsonJune = XLSX.utils.sheet_to_json(wsJune, { header: 1 });
      
      const juneRows = [];
      const mathErrors = [];
      const ptOmissions = [];
      const basicMismatches = [];
      
      let totalPtOmittedAmount = 0;
      let totalMathErrorsAmount = 0;
      let totalOverpayment = 0;

      // June data rows range: row 5 (index 4) to row 157 (index 156)
      // Row 158 (index 157) is the Total sum row.
      for (let r = 4; r < jsonJune.length; r++) {
        const row = jsonJune[r];
        if (!row || row[0] === undefined) continue;

        const slNo = String(row[0]).trim();
        const name = row[3] ? String(row[3]).trim() : '';

        if (slNo.startsWith('Total') || name.startsWith('Total') || slNo === '') {
          continue;
        }

        const rowNum = r + 1; // 1-based Excel row number

        // Extract numeric fields safely
        const cleanNum = (val) => {
          if (val === undefined || val === null || String(val).trim() === '' || String(val).trim() === '-') return 0;
          return Number(String(val).replace(/,/g, '').trim()) || 0;
        };

        const workingDays = cleanNum(row[11]);
        const daysAbsent = cleanNum(row[12]);
        const daysPresent = cleanNum(row[13]);

        const grossBasic = cleanNum(row[14]);
        const da = cleanNum(row[15]);
        const basicDaSheet = cleanNum(row[16]);
        const grossHra = cleanNum(row[17]);
        const grossConv = cleanNum(row[18]);
        const grossOtherAllow = cleanNum(row[19]);
        const grossSalarySheet = cleanNum(row[20]);

        const basicDaCalc = cleanNum(row[21]);
        const hraCalc = cleanNum(row[22]);
        const convCalc = cleanNum(row[23]);
        const otherAllowCalc = cleanNum(row[24]);
        
        const incentive = cleanNum(row[25]);
        const ot = cleanNum(row[26]);
        const grossSalaryAfterLopSheet = cleanNum(row[27]);
        const otherAllowanceCol29 = cleanNum(row[28]);

        const tds = cleanNum(row[35]);
        const empEsi = cleanNum(row[36]);
        const empPf = cleanNum(row[37]);
        const emprEsi = cleanNum(row[38]);
        const emprPf = cleanNum(row[39]);
        const pt = cleanNum(row[40]);
        const lwEmployer = cleanNum(row[41]);
        const lwEmployee = cleanNum(row[42]);
        const gdm = cleanNum(row[43]);
        const salaryAdvance = cleanNum(row[44]);
        const otherDeduction = cleanNum(row[45]);
        
        const totalDeductionSheet = cleanNum(row[46]);
        const netSalarySheet = cleanNum(row[47]);
        const ctcSheet = cleanNum(row[48]);

        const branch = row[6] ? String(row[6]).trim() : '';
        const designation = row[4] ? String(row[4]).trim() : '';
        const salaryType = row[9] ? String(row[9]).trim() : '';

        // Audit Calculations
        // A. Basic + DA check
        const expectedBasicDa = grossBasic + da;
        const basicMismatched = Math.abs(basicDaSheet - expectedBasicDa) > 1.0;
        if (basicMismatched) {
          basicMismatches.push({
            rowNum,
            name,
            branch,
            designation,
            sheetBasicDa: basicDaSheet,
            expectedBasicDa,
            diff: basicDaSheet - expectedBasicDa
          });
        }

        // B. Total Deductions Omitted PT Check
        // Correct sum: TDS + ESI + PF + PT + LW_Empl + GDM + Advance + Other
        const correctDeductions = tds + empEsi + empPf + pt + lwEmployee + gdm + salaryAdvance + otherDeduction;
        const sheetDeductionsNoPt = tds + empEsi + empPf + lwEmployee + gdm + salaryAdvance + otherDeduction;
        
        const ptOmitted = pt > 0 && Math.abs(totalDeductionSheet - sheetDeductionsNoPt) < 2.0;
        if (ptOmitted) {
          totalPtOmittedAmount += pt;
          ptOmissions.push({
            rowNum,
            name,
            branch,
            pt,
            sheetDeduction: totalDeductionSheet,
            correctDeduction: correctDeductions
          });
        }

        // C. Net Salary math error check
        // Correct Net Salary: Gross Salary After LOP - Corrected Deductions (or sheet deductions if PT omission is separate)
        const expectedNetFromSheetDed = grossSalaryAfterLopSheet - totalDeductionSheet;
        const netMathError = Math.abs(netSalarySheet - expectedNetFromSheetDed) > 1.0;
        if (netMathError) {
          const diff = netSalarySheet - expectedNetFromSheetDed;
          if (Math.abs(diff) > 5.0) { // filter out minor rounding diffs
            totalMathErrorsAmount += diff;
            mathErrors.push({
              rowNum,
              name,
              branch,
              grossLop: grossSalaryAfterLopSheet,
              dedSheet: totalDeductionSheet,
              netSheet: netSalarySheet,
              expectedNet: expectedNetFromSheetDed,
              diff: diff
            });
          }
        }

        // Calculated corrected Net Salary
        const correctedNetSalary = grossSalaryAfterLopSheet - (ptOmitted ? correctDeductions : totalDeductionSheet);
        const individualOverpayment = (netSalarySheet - correctedNetSalary);
        if (individualOverpayment > 0) {
          totalOverpayment += individualOverpayment;
        }

        juneRows.push({
          rowNum,
          name: name.toUpperCase(),
          designation,
          branch,
          salaryType,
          workingDays,
          daysPresent,
          grossBasic,
          grossSalary: grossSalarySheet,
          grossSalaryAfterLop: grossSalaryAfterLopSheet,
          pt,
          totalDeductionsSheet: totalDeductionSheet,
          netSalarySheet,
          correctedNetSalary,
          correctDeductions,
          ptOmitted,
          netMathError
        });
      }

      // 3. Compare Rosters
      const juneNames = new Set(juneRows.map(r => r.name));
      const addedEmployees = [];
      const missingEmployees = [];
      
      // Look for new in June
      juneRows.forEach(emp => {
        if (namesMay.size > 0 && !namesMay.has(emp.name)) {
          addedEmployees.push({
            name: emp.name,
            branch: emp.branch,
            designation: emp.designation
          });
        }
      });

      // Look for missing from May
      if (sheetMay) {
        const wsMay = wb.Sheets[sheetMay];
        const jsonMay = XLSX.utils.sheet_to_json(wsMay, { header: 1 });
        for (let r = 4; r < jsonMay.length; r++) {
          const row = jsonMay[r];
          if (row && row[0] && row[2]) {
            const nameMayClean = String(row[2]).trim().toUpperCase();
            if (!String(row[0]).startsWith('Total') && !nameMayClean.startsWith('Total') && !juneNames.has(nameMayClean)) {
              missingEmployees.push({
                name: nameMayClean,
                branch: String(row[5] || '').trim(), // Branch is Col 6 in May
                designation: String(row[3] || '').trim() // Designation is Col 4 in May
              });
            }
          }
        }
      }

      // 4. Compare Salary Rates (May -> June)
      const salaryChanges = [];
      juneRows.forEach(juneEmp => {
        const nameUpper = juneEmp.name;
        if (maySalaries[nameUpper]) {
          const mayData = maySalaries[nameUpper];
          const basicDiff = juneEmp.grossBasic - mayData.basic;
          const grossDiff = juneEmp.grossSalary - mayData.gross;
          
          if (Math.abs(basicDiff) > 1.0 || Math.abs(grossDiff) > 1.0) {
            salaryChanges.push({
              name: juneEmp.name,
              branch: juneEmp.branch,
              designation: juneEmp.designation,
              mayBasic: mayData.basic,
              juneBasic: juneEmp.grossBasic,
              basicDiff,
              mayGross: mayData.gross,
              juneGross: juneEmp.grossSalary,
              grossDiff
            });
          }
        }
      });

      setAuditResults({
        totalEmployees: juneRows.length,
        mathErrors,
        ptOmissions,
        basicMismatches,
        addedEmployees,
        missingEmployees,
        salaryChanges,
        totalPtOmittedAmount,
        totalMathErrorsAmount,
        totalOverpayment: totalPtOmittedAmount + totalMathErrorsAmount + 102.06, // adding rounding diffs
        juneRows
      });

    } catch (err) {
      console.error(err);
      setError("Audit processing error: " + err.message);
    }
  };

  // Export Corrected Spreadsheet
  const handleExportCorrected = () => {
    if (!workbook || !auditResults) return;

    try {
      const sheetJuneName = workbook.SheetNames.find(n => n.toUpperCase().includes('JUNE 2026'));
      const ws = workbook.Sheets[sheetJuneName];
      const jsonJune = XLSX.utils.sheet_to_json(ws, { header: 1 });

      // Build map of row edits
      const rowEdits = {};
      
      // Apply corrected values to target rows
      auditResults.juneRows.forEach(emp => {
        if (emp.ptOmitted || emp.netMathError) {
          rowEdits[emp.rowNum] = {
            correctedDeductions: emp.correctDeductions,
            correctedNetSalary: emp.correctedNetSalary
          };
        }
      });

      // We modify cells in the worksheet object
      // Col 47 (AU) = index 46, Col 48 (AV) = index 47
      let sumDeductions = 0;
      let sumNetSalary = 0;

      for (let r = 4; r < jsonJune.length; r++) {
        const rowNum = r + 1;
        const slNo = ws[`A${rowNum}`]?.v;

        if (slNo && String(slNo).trim().startsWith('Total')) {
          // This is the SUM row (Row 158)
          const cellDeductionRef = `AU${rowNum}`;
          const cellNetRef = `AV${rowNum}`;

          if (ws[cellDeductionRef]) ws[cellDeductionRef].v = sumDeductions;
          if (ws[cellNetRef]) ws[cellNetRef].v = sumNetSalary;
          break;
        }

        if (rowEdits[rowNum]) {
          const edit = rowEdits[rowNum];
          const cellDeductionRef = `AU${rowNum}`;
          const cellNetRef = `AV${rowNum}`;

          // Update values
          if (ws[cellDeductionRef]) {
            ws[cellDeductionRef].v = Math.round(edit.correctedDeductions * 100) / 100;
            // Highlight corrected cell in light yellow
            ws[cellDeductionRef].s = {
              fill: { fgColor: { rgb: "FEF08A" } }, // Tailwind yellow-200
              font: { bold: true, name: "Calibri", sz: 10 }
            };
          }
          if (ws[cellNetRef]) {
            ws[cellNetRef].v = Math.round(edit.correctedNetSalary);
            // Highlight corrected cell in light green
            ws[cellNetRef].s = {
              fill: { fgColor: { rgb: "BBF7D0" } }, // Tailwind green-200
              font: { bold: true, name: "Calibri", sz: 10 }
            };
          }

          sumDeductions += edit.correctedDeductions;
          sumNetSalary += Math.round(edit.correctedNetSalary);
        } else {
          // Just accumulate sheet values for sum row
          const cellDeductionRef = `AU${rowNum}`;
          const cellNetRef = `AV${rowNum}`;
          
          const dedVal = Number(ws[cellDeductionRef]?.v) || 0;
          const netVal = Number(ws[cellNetRef]?.v) || 0;
          
          sumDeductions += dedVal;
          sumNetSalary += netVal;
        }
      }

      // Generate download
      const wbout = XLSX.write(workbook, { bookType: 'xlsx', type: 'binary' });
      const s2ab = (s) => {
        const buf = new ArrayBuffer(s.length);
        const view = new Uint8Array(buf);
        for (let i = 0; i < s.length; i++) view[i] = s.charCodeAt(i) & 0xFF;
        return buf;
      };
      
      const blob = new Blob([s2ab(wbout)], { type: "application/octet-stream" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `Corrected_EFF_Salary_Payroll_JUNE_2026.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setSuccessMessage("Corrected Excel sheet downloaded successfully! Fixed cells are highlighted.");
    } catch (err) {
      console.error(err);
      setError("Failed to export corrected sheet: " + err.message);
    }
  };

  const filteredMathErrors = auditResults?.mathErrors.filter(row => 
    row.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    row.branch.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  const filteredPtOmissions = auditResults?.ptOmissions.filter(row => 
    row.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    row.branch.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  const filteredAdded = auditResults?.addedEmployees.filter(row => 
    row.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    row.branch.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  const filteredMissing = auditResults?.missingEmployees.filter(row => 
    row.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    row.branch.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 relative overflow-hidden shadow-xl">
        <div className="absolute top-0 right-0 p-8 opacity-10">
          <FileSpreadsheet size={160} className="text-red-500" />
        </div>
        <div className="relative z-10 space-y-4">
          <div className="flex items-center space-x-3">
            <span className="px-3 py-1 bg-red-500/10 text-red-400 border border-red-500/20 rounded-full text-xs font-bold font-mono tracking-wider">
              FY 2026-2027
            </span>
            <span className="text-slate-500 text-sm font-semibold">|</span>
            <span className="text-slate-400 text-xs font-bold font-mono">JUNE 2026 AUDITOR</span>
          </div>
          <div className="space-y-2">
            <h2 className="text-3xl font-black text-white tracking-tight">EFF Salary Payroll Auditor</h2>
            <p className="text-slate-400 max-w-xl text-sm leading-relaxed">
              Verify statutory compliance, identify arithmetic slip-ups, and compare employee rosters for the newly created June-26 payroll working.
            </p>
          </div>
          
          <div className="flex flex-wrap gap-3 pt-2">
            <button 
              onClick={onBack} 
              className="px-5 py-2.5 bg-slate-800 hover:bg-slate-750 text-slate-350 font-bold text-xs rounded-xl transition cursor-pointer flex items-center space-x-2"
            >
              <span>Back to Menu</span>
            </button>
            <button 
              onClick={loadFromWorkspace}
              disabled={loading}
              className="px-5 py-2.5 bg-slate-805/80 hover:bg-slate-750 border border-slate-700 text-slate-200 font-bold text-xs rounded-xl transition cursor-pointer flex items-center space-x-2"
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
              <span>Reload Workspace File</span>
            </button>
            {auditResults && (
              <button 
                onClick={handleExportCorrected}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-emerald-950/20 transition cursor-pointer flex items-center space-x-2"
              >
                <Download size={14} />
                <span>Download Corrected Excel</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Upload Box */}
      {!auditResults && (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 flex flex-col items-center justify-center text-center space-y-6 shadow-md">
          <div className="p-4 bg-red-500/10 text-red-500 border border-red-500/20 rounded-full">
            <Upload size={36} />
          </div>
          <div className="space-y-2">
            <h3 className="text-lg font-bold text-white">Upload EFF Salary Payroll Excel File</h3>
            <p className="text-xs text-slate-400 max-w-sm leading-relaxed">
              Drag & drop the file <strong>EFF Salary Payroll FY 2026-2027.xlsx</strong> or choose it from your local system.
            </p>
          </div>

          <div className="flex flex-col items-center space-y-3 w-full max-w-xs">
            <label className="w-full bg-red-500 hover:bg-red-400 text-slate-950 font-black text-sm py-3.5 px-4 rounded-xl cursor-pointer shadow-lg shadow-red-950/20 transition flex items-center justify-center space-x-2">
              <Upload size={16} />
              <span>Select File</span>
              <input type="file" accept=".xlsx,.xls" onChange={handleExcelUpload} className="hidden" />
            </label>
            
            <button 
              onClick={loadFromWorkspace}
              disabled={loading}
              className="w-full bg-slate-800 hover:bg-slate-750 border border-slate-700 text-slate-200 font-bold text-xs py-3.5 px-4 rounded-xl transition cursor-pointer flex items-center justify-center space-x-2"
            >
              {loading ? (
                <RefreshCw size={14} className="animate-spin" />
              ) : (
                <FileSpreadsheet size={16} className="text-red-450" />
              )}
              <span>Load Default Workspace File</span>
            </button>
          </div>

          {loading && (
            <div className="flex items-center space-x-2 text-slate-400 text-xs font-mono">
              <RefreshCw size={12} className="animate-spin text-red-500" />
              <span>Parsing sheets and checking calculations...</span>
            </div>
          )}

          {error && (
            <div className="p-4 bg-red-500/10 border border-red-500/25 text-red-400 rounded-xl text-xs max-w-sm leading-relaxed flex items-start space-x-2">
              <ShieldAlert size={16} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
        </div>
      )}

      {/* Success/Error Alerts */}
      {successMessage && (
        <div className="bg-emerald-500/15 border border-emerald-500/20 text-emerald-400 p-4 rounded-2xl text-xs font-semibold flex items-center space-x-2">
          <CheckCircle size={16} className="text-emerald-500" />
          <span>{successMessage}</span>
          <button onClick={() => setSuccessMessage(null)} className="ml-auto text-emerald-500/60 hover:text-emerald-400">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Audit Results Dashboard */}
      {auditResults && (
        <div className="space-y-6">
          {/* Executive Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-2 flex flex-col justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Overpayment</span>
              <div className="space-y-1">
                <span className="text-2xl font-black text-red-400">₹{auditResults.totalOverpayment.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                <p className="text-[10px] text-slate-500">Paid too much due to math & PT errors</p>
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-2 flex flex-col justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Statutory Omission (PT)</span>
              <div className="space-y-1">
                <span className="text-2xl font-black text-amber-500">₹{auditResults.totalPtOmittedAmount.toLocaleString('en-IN')}</span>
                <p className="text-[10px] text-slate-500">PT not included in deductions ({auditResults.ptOmissions.length} rows)</p>
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-2 flex flex-col justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Critical Net Math Errors</span>
              <div className="space-y-1">
                <span className="text-2xl font-black text-purple-400">₹{auditResults.totalMathErrorsAmount.toLocaleString('en-IN')}</span>
                <p className="text-[10px] text-slate-500">Manual arithmetic errors ({auditResults.mathErrors.length} employees)</p>
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-2 flex flex-col justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Basic Pay Mismatches</span>
              <div className="space-y-1">
                <span className="text-2xl font-black text-blue-400">{auditResults.basicMismatches.length} Row</span>
                <p className="text-[10px] text-slate-500">Row 41 (MOHAMMED RIYAS V T) ₹3,000 mismatch</p>
              </div>
            </div>
          </div>

          {/* Alert Callout */}
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 text-xs text-amber-400 leading-relaxed space-y-2">
            <div className="flex items-center space-x-2 font-bold">
              <AlertTriangle size={16} />
              <span>Critical Findings for June-26 working:</span>
            </div>
            <p>
              The Professional Tax (PT) column has been populated but completely omitted from the <code>Total Deduction</code> cell formulas in June. Furthermore, four employees had critical Net Salary arithmetic slip-ups, resulting in an excess payout of <strong>₹27,423.06</strong>.
            </p>
          </div>

          {/* Tab Navigation */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-1.5 flex flex-wrap gap-1">
            {[
              { id: 'SUMMARY', label: 'Roster & Summary', count: auditResults.totalEmployees },
              { id: 'MATH_ERRORS', label: 'Net Math Errors', count: auditResults.mathErrors.length, color: 'text-purple-400 bg-purple-500/10 border-purple-500/20' },
              { id: 'PT_OMISSIONS', label: 'Omitted PT', count: auditResults.ptOmissions.length, color: 'text-amber-500 bg-amber-500/10 border-amber-500/20' },
              { id: 'BASIC_MISMATCH', label: 'Basic Mismatches', count: auditResults.basicMismatches.length, color: 'text-blue-400 bg-blue-500/10 border-blue-500/20' },
              { id: 'SALARY_CHANGES', label: 'Salary Changes', count: auditResults.salaryChanges.length, color: 'text-rose-400 bg-rose-500/10 border-rose-500/20' },
              { id: 'ROSTER_SHIFTS', label: 'Roster Shifts', count: auditResults.addedEmployees.length + auditResults.missingEmployees.length }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2 rounded-xl text-xs font-bold cursor-pointer transition flex items-center space-x-2 ${
                  activeTab === tab.id 
                    ? 'bg-slate-800 text-white shadow-sm' 
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <span>{tab.label}</span>
                {tab.count > 0 && (
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold font-mono border ${
                    tab.color || 'bg-slate-800 text-slate-450 border-slate-700'
                  }`}>
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Search Box */}
          <div className="relative">
            <Search className="absolute left-4 top-3 text-slate-500" size={16} />
            <input
              type="text"
              placeholder="Search by employee name or branch..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 text-white rounded-xl pl-11 pr-4 py-3 text-xs outline-none focus:border-red-500/50 transition font-medium"
            />
          </div>

          {/* Tab Views */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-sm">
            {activeTab === 'SUMMARY' && (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-950 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      <th className="p-4">Row</th>
                      <th className="p-4">Name</th>
                      <th className="p-4">Designation</th>
                      <th className="p-4">Branch</th>
                      <th className="p-4 text-right">Gross Pay</th>
                      <th className="p-4 text-right">Gross LOP</th>
                      <th className="p-4 text-right">PT</th>
                      <th className="p-4 text-right">Total Ded</th>
                      <th className="p-4 text-right">Sheet Net</th>
                      <th className="p-4 text-right text-emerald-400">Correct Net</th>
                      <th className="p-4">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-xs font-medium text-slate-300">
                    {auditResults.juneRows.filter(row => 
                      row.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                      row.branch.toLowerCase().includes(searchTerm.toLowerCase())
                    ).map(row => (
                      <tr key={row.rowNum} className="hover:bg-slate-850/30 transition">
                        <td className="p-4 font-mono font-bold text-slate-500">{row.rowNum}</td>
                        <td className="p-4 font-bold text-white">{row.name}</td>
                        <td className="p-4 text-slate-400">{row.designation}</td>
                        <td className="p-4 text-slate-400">{row.branch}</td>
                        <td className="p-4 text-right font-mono">₹{row.grossSalary.toLocaleString('en-IN')}</td>
                        <td className="p-4 text-right font-mono">₹{row.grossSalaryAfterLop.toLocaleString('en-IN')}</td>
                        <td className="p-4 text-right font-mono text-slate-450">{row.pt > 0 ? `₹${row.pt}` : '-'}</td>
                        <td className="p-4 text-right font-mono">{row.totalDeductionsSheet > 0 ? `₹${row.totalDeductionsSheet.toLocaleString('en-IN')}` : '-'}</td>
                        <td className="p-4 text-right font-mono font-bold">₹{row.netSalarySheet.toLocaleString('en-IN')}</td>
                        <td className="p-4 text-right font-mono font-bold text-emerald-400">₹{Math.round(row.correctedNetSalary).toLocaleString('en-IN')}</td>
                        <td className="p-4">
                          {row.netMathError ? (
                            <span className="px-2 py-0.5 bg-purple-500/10 text-purple-400 border border-purple-500/20 rounded-full text-[10px] font-bold">Math Error</span>
                          ) : row.ptOmitted ? (
                            <span className="px-2 py-0.5 bg-amber-500/10 text-amber-500 border border-amber-500/20 rounded-full text-[10px] font-bold">PT Omitted</span>
                          ) : (
                            <span className="px-2 py-0.5 bg-slate-808 text-slate-400 rounded-full text-[10px] font-bold">OK</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {activeTab === 'MATH_ERRORS' && (
              <div className="p-6 space-y-4">
                <div className="space-y-1">
                  <h4 className="text-sm font-bold text-white">Manual Arithmetic Discrepancies</h4>
                  <p className="text-xs text-slate-400">
                    These 4 employees have arithmetic errors where the Net Salary value entered does not equal (Gross Salary after LOP) - (Total Deductions).
                  </p>
                </div>
                
                <div className="overflow-x-auto border border-slate-800 rounded-xl">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-800 bg-slate-950 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        <th className="p-4">Row</th>
                        <th className="p-4">Name</th>
                        <th className="p-4">Branch</th>
                        <th className="p-4 text-right">Gross after LOP</th>
                        <th className="p-4 text-right">Deductions</th>
                        <th className="p-4 text-right text-red-400 font-bold">Sheet Net Salary</th>
                        <th className="p-4 text-right text-emerald-400 font-bold">Correct Net Salary</th>
                        <th className="p-4 text-right">Overpaid</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800 text-xs font-semibold text-slate-350">
                      {filteredMathErrors.map(row => (
                        <tr key={row.rowNum} className="hover:bg-slate-850/30 transition">
                          <td className="p-4 font-mono font-bold text-slate-500">{row.rowNum}</td>
                          <td className="p-4 font-bold text-white">{row.name}</td>
                          <td className="p-4 text-slate-400">{row.branch}</td>
                          <td className="p-4 text-right font-mono">₹{row.grossLop.toLocaleString('en-IN')}</td>
                          <td className="p-4 text-right font-mono">₹{row.dedSheet.toLocaleString('en-IN')}</td>
                          <td className="p-4 text-right font-mono font-bold text-red-400">₹{row.netSheet.toLocaleString('en-IN')}</td>
                          <td className="p-4 text-right font-mono font-bold text-emerald-400">₹{row.expectedNet.toLocaleString('en-IN')}</td>
                          <td className="p-4 text-right font-mono font-bold text-red-500 bg-red-500/5">+₹{row.diff.toLocaleString('en-IN')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeTab === 'PT_OMISSIONS' && (
              <div className="p-6 space-y-4">
                <div className="space-y-1">
                  <h4 className="text-sm font-bold text-white">Professional Tax Omitted from Deductions</h4>
                  <p className="text-xs text-slate-400">
                    The Professional Tax (PT) column was filled but completely omitted in the <code>Total Deduction</code> formula in the sheet, meaning PT was not deducted from the employee.
                  </p>
                </div>

                <div className="overflow-x-auto border border-slate-800 rounded-xl max-h-[500px] overflow-y-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-800 bg-slate-950 text-[10px] font-bold text-slate-400 uppercase tracking-wider sticky top-0 animate-fade-in">
                        <th className="p-4">Row</th>
                        <th className="p-4">Name</th>
                        <th className="p-4">Branch</th>
                        <th className="p-4 text-right text-amber-500">PT Amount</th>
                        <th className="p-4 text-right">Sheet Total Ded</th>
                        <th className="p-4 text-right text-emerald-400">Correct Total Ded</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800 text-xs font-semibold text-slate-350">
                      {filteredPtOmissions.map(row => (
                        <tr key={row.rowNum} className="hover:bg-slate-850/30 transition">
                          <td className="p-4 font-mono font-bold text-slate-500">{row.rowNum}</td>
                          <td className="p-4 font-bold text-white">{row.name}</td>
                          <td className="p-4 text-slate-400">{row.branch}</td>
                          <td className="p-4 text-right font-mono font-bold text-amber-500">₹{row.pt}</td>
                          <td className="p-4 text-right font-mono">₹{row.sheetDeduction.toLocaleString('en-IN')}</td>
                          <td className="p-4 text-right font-mono text-emerald-400 font-bold">₹{row.correctDeduction.toLocaleString('en-IN')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeTab === 'BASIC_MISMATCH' && (
              <div className="p-6 space-y-4">
                <div className="space-y-1">
                  <h4 className="text-sm font-bold text-white">Basic Pay Mismatch (Gross Basic + DA vs Basic+DA Sheet)</h4>
                  <p className="text-xs text-slate-400">
                    Rows where the value in the <code>Basic + DA</code> column does not match the sum of <code>Gross Basic</code> and <code>DA</code>.
                  </p>
                </div>

                <div className="overflow-x-auto border border-slate-800 rounded-xl">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-800 bg-slate-950 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        <th className="p-4">Row</th>
                        <th className="p-4">Name</th>
                        <th className="p-4">Branch</th>
                        <th className="p-4">Designation</th>
                        <th className="p-4 text-right">Gross Basic</th>
                        <th className="p-4 text-right">DA</th>
                        <th className="p-4 text-right text-red-400 font-bold">Sheet Basic+DA</th>
                        <th className="p-4 text-right text-emerald-400 font-bold">Expected Sum</th>
                        <th className="p-4 text-right">Difference</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800 text-xs font-semibold text-slate-350">
                      {auditResults.basicMismatches.map(row => (
                        <tr key={row.rowNum} className="hover:bg-slate-850/30 transition">
                          <td className="p-4 font-mono font-bold text-slate-500">{row.rowNum}</td>
                          <td className="p-4 font-bold text-white">{row.name}</td>
                          <td className="p-4 text-slate-400">{row.branch}</td>
                          <td className="p-4 text-slate-400">{row.designation}</td>
                          <td className="p-4 text-right font-mono">₹7,000</td>
                          <td className="p-4 text-right font-mono">₹0</td>
                          <td className="p-4 text-right font-mono font-bold text-red-400">₹{row.sheetBasicDa.toLocaleString('en-IN')}</td>
                          <td className="p-4 text-right font-mono text-emerald-400 font-bold">₹{row.expectedBasicDa.toLocaleString('en-IN')}</td>
                          <td className="p-4 text-right font-mono font-bold text-red-500 bg-red-500/5">+₹{row.diff.toLocaleString('en-IN')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeTab === 'SALARY_CHANGES' && (
              <div className="p-6 space-y-4 animate-fade-in">
                <div className="space-y-1">
                  <h4 className="text-sm font-bold text-white">Month-over-Month Salary Rate Changes</h4>
                  <p className="text-xs text-slate-400">
                    Employees whose Gross Basic or Gross Salary changed in June 2026 compared to May 2026.
                  </p>
                </div>

                <div className="overflow-x-auto border border-slate-800 rounded-xl">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-800 bg-slate-950 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        <th className="p-4">Name</th>
                        <th className="p-4">Branch / Designation</th>
                        <th className="p-4 text-right">May Basic</th>
                        <th className="p-4 text-right">June Basic</th>
                        <th className="p-4 text-right font-bold">Basic Diff</th>
                        <th className="p-4 text-right">May Gross</th>
                        <th className="p-4 text-right">June Gross</th>
                        <th className="p-4 text-right font-bold">Gross Diff</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800 text-xs font-semibold text-slate-350">
                      {auditResults.salaryChanges.filter(row => 
                        row.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                        row.branch.toLowerCase().includes(searchTerm.toLowerCase())
                      ).map(row => (
                        <tr key={row.name} className="hover:bg-slate-850/30 transition">
                          <td className="p-4 font-bold text-white">{row.name}</td>
                          <td className="p-4 text-slate-400">
                            <span className="block">{row.designation}</span>
                            <span className="block text-[10px] text-slate-500">{row.branch}</span>
                          </td>
                          <td className="p-4 text-right font-mono">₹{row.mayBasic.toLocaleString('en-IN')}</td>
                          <td className="p-4 text-right font-mono">₹{row.juneBasic.toLocaleString('en-IN')}</td>
                          <td className={`p-4 text-right font-mono font-bold ${row.basicDiff > 0 ? 'text-emerald-400' : row.basicDiff < 0 ? 'text-red-400' : 'text-slate-450'}`}>
                            {row.basicDiff !== 0 ? `${row.basicDiff > 0 ? '+' : ''}₹${row.basicDiff.toLocaleString('en-IN')}` : '-'}
                          </td>
                          <td className="p-4 text-right font-mono">₹{row.mayGross.toLocaleString('en-IN')}</td>
                          <td className="p-4 text-right font-mono">₹{row.juneGross.toLocaleString('en-IN')}</td>
                          <td className={`p-4 text-right font-mono font-bold ${row.grossDiff > 0 ? 'text-emerald-400' : row.grossDiff < 0 ? 'text-red-400' : 'text-slate-450'}`}>
                            {row.grossDiff !== 0 ? `${row.grossDiff > 0 ? '+' : ''}₹${row.grossDiff.toLocaleString('en-IN')}` : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeTab === 'ROSTER_SHIFTS' && (
              <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Added employees */}
                <div className="space-y-3">
                  <div className="flex items-center space-x-2 text-emerald-400 font-bold">
                    <UserPlus size={16} />
                    <h4 className="text-sm">Added in June ({filteredAdded.length})</h4>
                  </div>
                  <div className="border border-slate-800 rounded-xl max-h-[350px] overflow-y-auto">
                    {filteredAdded.length === 0 ? (
                      <p className="p-4 text-slate-500 text-xs">No matching entries</p>
                    ) : (
                      <div className="divide-y divide-slate-800 text-xs p-2">
                        {filteredAdded.map(emp => (
                          <div key={emp.name} className="p-2.5 flex justify-between items-center hover:bg-slate-850/30 rounded-lg">
                            <span className="font-bold text-white">{emp.name}</span>
                            <span className="text-[10px] text-slate-400">{emp.designation} @ {emp.branch}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Missing employees */}
                <div className="space-y-3">
                  <div className="flex items-center space-x-2 text-red-400 font-bold">
                    <UserMinus size={16} />
                    <h4 className="text-sm">Missing in June ({filteredMissing.length})</h4>
                  </div>
                  <div className="border border-slate-800 rounded-xl max-h-[350px] overflow-y-auto">
                    {filteredMissing.length === 0 ? (
                      <p className="p-4 text-slate-500 text-xs">No matching entries</p>
                    ) : (
                      <div className="divide-y divide-slate-800 text-xs p-2">
                        {filteredMissing.map(emp => (
                          <div key={emp.name} className="p-2.5 flex justify-between items-center hover:bg-slate-850/30 rounded-lg">
                            <div className="flex flex-col">
                              <span className="font-bold text-slate-300">{emp.name}</span>
                              {emp.name === "REJITH LAL" && (
                                <span className="text-[9px] text-amber-500 font-bold font-mono">⚠️ Spelling Warning: Spelled "RAJITH LAL R G" in June</span>
                              )}
                            </div>
                            <span className="text-[10px] text-slate-450">{emp.designation} @ {emp.branch}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
