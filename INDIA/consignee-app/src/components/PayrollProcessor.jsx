import React, { useState, useEffect } from 'react';
import { Upload, FileText, CheckCircle, AlertTriangle, Play, Download, Search, Edit2, Trash2, Plus, RefreshCw, Layers, Users, ShieldAlert, Award } from 'lucide-react';
import axios from 'axios';
import * as XLSX from 'xlsx-js-style';
import { calculatePayroll } from '../utils/payrollEngine';

export default function PayrollProcessor() {
  const [activeTab, setActiveTab] = useState('UPLOAD'); // 'UPLOAD', 'EDIT_TRIPS', 'MASTERS', 'RESULTS'
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);

  // Loaded database masters
  const [drivers, setDrivers] = useState([]);
  const [sections, setSections] = useState([]);
  const [deductions, setDeductions] = useState([]);
  const [isLoadingMasters, setIsLoadingMasters] = useState(false);

  // Uploaded and editable states
  const [monthYear, setMonthYear] = useState(''); // e.g. "FEBRUARY 2026"
  const [trips, setTrips] = useState([]);
  const [advances, setAdvances] = useState({});
  const [monthConfig, setMonthConfig] = useState(null);

  // Calculation Results
  const [results, setResults] = useState(null); // { salaryFinal, bankTransfer, workDone }
  const [manualWorkData, setManualWorkData] = useState(null);

  // Trip grid filter and pagination
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  // Inline editing state for Trip Sheet
  const [editingTripId, setEditingTripId] = useState(null);
  const [editForm, setEditForm] = useState({});

  // Syncing status
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    fetchMasters();
  }, []);

  const fetchMasters = async () => {
    setIsLoadingMasters(true);
    try {
      const isProd = import.meta.env.PROD;
      const baseUrl = isProd ? '' : 'http://localhost:3001';
      const response = await axios.get(`${baseUrl}/api/payroll/masters`);
      setDrivers(response.data.drivers || []);
      setSections(response.data.sections || []);
      setDeductions(response.data.deductions || []);
    } catch (err) {
      console.error(err);
      setError("Failed to load master data from Supabase. Make sure tables exist.");
    } finally {
      setIsLoadingMasters(false);
    }
  };

  const triggerMigration = async () => {
    setLoading(true);
    setMessage(null);
    setError(null);
    try {
      const isProd = import.meta.env.PROD;
      const baseUrl = isProd ? '' : 'http://localhost:3001';
      const response = await axios.get(`${baseUrl}/api/migrate-payroll`);
      setMessage("Database tables initialized successfully!");
      fetchMasters();
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.error || "Failed to initialize database tables.");
    } finally {
      setLoading(false);
    }
  };

  // Helper: Strip leading zeros from account number
  const stripLeadingZeros = (s) => {
    if (!s) return "";
    let str = String(s).trim();
    if (str.includes('.')) str = str.split('.')[0];
    return str.replace(/^0+/, '');
  };

  // Parse Excel Workbook (Salary Data.xlsx)
  const handleExcelUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setLoading(true);
    setError(null);
    setMessage(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const bstr = event.target.result;
        const workbook = XLSX.read(bstr, { type: 'binary', cellDates: true });
        
        // 1. Detect Sheets
        const sheetNames = workbook.SheetNames;
        const tripSheetName = sheetNames.find(n => n && n.toLowerCase().includes('trip'));
        const driverSheetName = sheetNames.find(n => n && n.toLowerCase().includes('driver'));
        const sectionSheetName = sheetNames.find(n => n && n.toLowerCase().includes('section'));
        const deductionSheetName = sheetNames.find(n => n && n.toLowerCase().includes('deduction'));
        const advanceSheetName = sheetNames.find(n => n && n.toLowerCase().includes('advance'));

        if (!tripSheetName) {
          throw new Error("Could not find a 'Trip Sheet' in the uploaded Excel file.");
        }

        // 2. Parse Trip Sheet (Always parsed for the current run)
        const tripWorksheet = workbook.Sheets[tripSheetName];
        const tripJson = XLSX.utils.sheet_to_json(tripWorksheet, { header: 1 });
        
        // Determine Month & Year from B1/B2
        // Cells(1, 2) is row 1, col 2 -> JSON index [0][1]
        let headerVal = "";
        if (tripJson[0] && tripJson[0][1]) headerVal = String(tripJson[0][1]).toUpperCase();
        else if (tripJson[0] && tripJson[0][3]) headerVal = String(tripJson[0][3]).toUpperCase(); // fallback
        
        let detectedMonth = "JANUARY";
        let detectedYear = new Date().getFullYear();
        const pos1 = headerVal.indexOf("PERIOD");
        if (pos1 !== -1) {
          const afterPeriod = headerVal.substring(pos1 + 6).trim();
          const match = afterPeriod.match(/(\d{1,2})-(\d{1,2})-(\d{4})/);
          if (match) {
            const mNum = parseInt(match[2], 10);
            detectedYear = parseInt(match[3], 10);
            const months = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];
            if (mNum >= 1 && mNum <= 12) detectedMonth = months[mNum - 1];
          }
        }
        const detectedMonthYear = `${detectedMonth} ${detectedYear}`;
        setMonthYear(detectedMonthYear);

        const parsedTrips = [];
        // Header on row 14 (index 13)
        for (let r = 13; r < tripJson.length; r++) {
          const row = tripJson[r];
          if (!row || !row[3]) continue; // Date is in Column D (index 3)
          
          parsedTrips.push({
            id: r - 13,
            date: formatExcelDate(row[3]),
            vehicle: row[4] ? String(row[4]).trim() : "",
            dept: row[6] ? String(row[6]).trim() : "",
            openTime: row[8] !== undefined ? String(row[8]).trim() : "",
            kmRun: row[11] !== undefined ? Number(row[11]) : 0,
            otAfter5: row[16] !== undefined ? Number(row[16]) : 0,
            mrngOt: row[29] !== undefined ? Number(row[29]) : 0,
            driverR: row[17] ? String(row[17]).trim() : "",
            driverS: row[18] ? String(row[18]).trim() : "",
            driverT: row[19] ? String(row[19]).trim() : "",
          });
        }
        setTrips(parsedTrips);

        // 3. Parse Advance Sheet (if present)
        const parsedAdvances = {};
        if (advanceSheetName) {
          const advWorksheet = workbook.Sheets[advanceSheetName];
          const advJson = XLSX.utils.sheet_to_json(advWorksheet, { header: 1 });
          if (advJson.length > 1) {
            // Detect structure (bank statement vs standard)
            let testColF = String(advJson[1][5] || "").trim();
            const acctCol = (testColF !== "" && testColF !== "0") ? 5 : 1;
            const amtCol = (testColF !== "" && testColF !== "0") ? 7 : 2;

            for (let r = 1; r < advJson.length; r++) {
              const row = advJson[r];
              if (row && row[acctCol]) {
                const acct = stripLeadingZeros(row[acctCol]);
                const amt = Number(String(row[amtCol] || 0).replace(/,/g, '')) || 0;
                if (acct) {
                  parsedAdvances[acct] = (parsedAdvances[acct] || 0) + amt;
                }
              }
            }
          }
        }
        setAdvances(parsedAdvances);

        // 4. Parse Masters & Configuration (if present, ask to sync)
        let foundDrivers = [];
        let foundSections = [];
        let foundDeductions = [];
        let parsedMonthConfig = null;

        if (driverSheetName) {
          const drSheet = workbook.Sheets[driverSheetName];
          const drJson = XLSX.utils.sheet_to_json(drSheet, { header: 1 });
          
          // Parse config variables
          for (let r = 2; r < 14; r++) {
            const row = drJson[r];
            if (row && row[21] && String(row[21]).toUpperCase().trim() === detectedMonth) {
              parsedMonthConfig = {
                month_name: detectedMonth,
                esi_max_qty: Number(row[23] || 0),
                lw_full: Number(row[24] || 0),
                lw_21: Number(row[25] || 0),
                lw_14: Number(row[26] || 0),
                lw_low: Number(row[27] || 0),
                holidays: []
              };
              break;
            }
          }

          // Parse holidays (filtered by active month and year of the payroll run)
          if (parsedMonthConfig) {
            const months = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];
            const monthIndex = months.indexOf(detectedMonth);
            const monthStr = String(monthIndex + 1).padStart(2, '0');
            const yearStr = String(detectedYear);

            for (let r = 2; r < 20; r++) {
              const row = drJson[r];
              if (row && row[30]) {
                const hDateStr = formatExcelDate(row[30]);
                if (hDateStr.startsWith(`${yearStr}-${monthStr}`)) {
                  parsedMonthConfig.holidays.push(hDateStr);
                }
              }
            }
            setMonthConfig(parsedMonthConfig);
          }

          // Parse Driver rows (rows start from index 1)
          for (let r = 1; r < drJson.length; r++) {
            const row = drJson[r];
            if (row && row[0] && String(row[0]).trim() !== "" && String(row[0]).trim() !== "0") {
              foundDrivers.push({
                driver_code: String(row[0]).trim(),
                actual_name: String(row[3] || row[4] || "").trim(),
                category: String(row[7] || "").trim(),
                account_number: stripLeadingZeros(row[4] || row[5]),
                ifsc_code: String(row[5] || row[6] || "").trim(),
                bank_name: String(row[6] || row[7] || "").trim(),
                branch_name: String(row[7] || row[8] || "").trim(),
                basic_pay: Number(row[8] || row[9] || 0),
                rate_per_day: Number(row[10] || row[11] || 0),
                ot_rate: Number(row[11] || row[12] || 0),
                esi_rate: Number(row[14] || row[15] || 0),
                epf_rate: Number(row[15] || row[16] || 0),
                leave_eligibility: String(row[16] || row[17] || "").trim(),
                holiday_eligibility: String(row[17] || row[18] || "").trim(),
                holiday_wages: Number(row[18] || row[19] || 0),
                esi_less: Number(row[19] || row[20] || 0),
              });
            }
          }
        }

        if (sectionSheetName) {
          const secSheet = workbook.Sheets[sectionSheetName];
          const secJson = XLSX.utils.sheet_to_json(secSheet, { header: 1 });
          for (let r = 1; r < secJson.length; r++) {
            const row = secJson[r];
            if (row && row[0] && String(row[0]).trim() !== "") {
              foundSections.push({
                dept: String(row[0] || "").trim(),
                ot_eligibility: String(row[6] || "NO").trim(),
                target_km: Number(row[7] || 0),
                sr_code: String(row[8] || "").trim(),
                material_desc: String(row[9] || "").trim(),
                rate: Number(row[10] || 0),
                addl_sr: String(row[11] || "").trim(),
                addl_material_desc: String(row[12] || "").trim(),
                addl_rate: Number(row[13] || 0),
                addl_hr_sr: String(row[14] || "").trim(),
                addl_hr_material_desc: String(row[15] || "").trim(),
                addl_hr_rate: Number(row[16] || 0)
              });
            }
          }
        }

        if (deductionSheetName) {
          const dedSheet = workbook.Sheets[deductionSheetName];
          const dedJson = XLSX.utils.sheet_to_json(dedSheet, { header: 1 });
          for (let r = 1; r < dedJson.length; r++) {
            const row = dedJson[r];
            if (row && row[0] && String(row[0]).trim() !== "") {
              foundDeductions.push({
                driver_code: String(row[0]).trim(),
                union_ded: Number(row[6] || 0),
                fine: Number(row[7] || 0),
                accident: Number(row[8] || 0),
                balance: Number(row[9] || 0),
                total_deductions: Number(row[10] || 0)
              });
            }
          }
        }

        // 5. Parse Manual Work Sheet (if present)
        const manualSheetName = sheetNames.find(n => n && (n.toLowerCase().includes('manual') || n.toLowerCase().includes('work')));
        if (manualSheetName) {
          const manualWorksheet = workbook.Sheets[manualSheetName];
          const manualJson = XLSX.utils.sheet_to_json(manualWorksheet, { header: 1 });
          const parsedManual = {};
          
          if (manualJson.length > 1) {
            const mHeaders = (manualJson[0] || []).map(h => h !== undefined && h !== null ? String(h).trim().toLowerCase().replace(/\s+/g, ' ') : "");
            
            // Map column indexes for required fields using the cleaned headers
            const codeIdx = mHeaders.findIndex(h => h && h.includes("code"));
            const nameIdx = mHeaders.findIndex(h => h && (h.includes("name") || h.includes("employee")));
            const shiftsIdx = mHeaders.findIndex(h => h && (h.includes("shifts worked") || h.includes("no of duties") || h.includes("duties") || (h.includes("shifts") && !h.includes("holiday"))));
            const salaryIdx = mHeaders.findIndex(h => h && h.includes("salary earned"));
            const leaveWagesIdx = mHeaders.findIndex(h => h && h.includes("addl salary"));
            const otEarningsIdx = mHeaders.findIndex(h => h && h.includes("ot earnings"));
            const totalSalaryIdx = mHeaders.findIndex(h => h && (h.includes("gross salary") || h.includes("total salary") || h.includes("salary earned")));
            
            // ESI & PF
            const esiPfIdx = mHeaders.findIndex(h => h && (h.includes("esi & pf") || (h.includes("esi") && h.includes("pf"))));
            const esiIdx = mHeaders.findIndex(h => h && h === "esi");
            const pfIdx = mHeaders.findIndex(h => h && h === "pf");
            
            // Advance
            const advIdx = mHeaders.findIndex(h => h && (h.includes("advance deduction") || h === "advance"));
            
            // Union and other deductions
            const unionIdx = mHeaders.findIndex(h => h && (h.includes("union deduction") || h === "union"));
            const deductAddlIdx = mHeaders.findIndex(h => h && (h.includes("deduct (addnl)") || h.includes("other dedu") || h.includes("other")));
            
            const totalDedIdx = mHeaders.findIndex(h => h && h.includes("total deduction"));
            const netIdx = mHeaders.findIndex(h => h && (h.includes("net salary") || h.includes("net pay") || h.includes("netpay")));


            const extractDriverCode = (val) => {
              if (!val) return "";
              const s = String(val).trim();
              const start = s.indexOf('*');
              if (start !== -1) {
                const end = s.indexOf('*', start + 1);
                if (end !== -1) {
                  return s.substring(start + 1, end).trim();
                }
              }
              return s;
            };

            for (let r = 1; r < manualJson.length; r++) {
              const row = manualJson[r];
              if (row) {
                let rawCode = "";
                if (codeIdx !== -1 && row[codeIdx] !== undefined && row[codeIdx] !== null) {
                  rawCode = String(row[codeIdx]).trim();
                } else if (nameIdx !== -1 && row[nameIdx] !== undefined && row[nameIdx] !== null) {
                  rawCode = String(row[nameIdx]).trim();
                }

                const code = extractDriverCode(rawCode);
                if (code) {
                  // Resolve ESI/PF
                  let parsedEsiPf = 0;
                  if (esiPfIdx !== -1) {
                    parsedEsiPf = Number(row[esiPfIdx] || 0);
                  } else {
                    const esiVal = esiIdx !== -1 ? Number(row[esiIdx] || 0) : 0;
                    const pfVal = pfIdx !== -1 ? Number(row[pfIdx] || 0) : 0;
                    parsedEsiPf = esiVal + pfVal;
                  }

                  // Resolve Union/Other Deductions
                  const unionVal = unionIdx !== -1 ? Number(row[unionIdx] || 0) : 0;
                  const otherVal = deductAddlIdx !== -1 ? Number(row[deductAddlIdx] || 0) : 0;
                  const parsedUnion = unionVal + otherVal;

                  parsedManual[code] = {
                    code,
                    name: nameIdx !== -1 ? String(row[nameIdx] || "").trim() : "",
                    shifts: shiftsIdx !== -1 ? Number(row[shiftsIdx] || 0) : 0,
                    salaryEarned: salaryIdx !== -1 ? Number(row[salaryIdx] || 0) : 0,
                    leaveWages: leaveWagesIdx !== -1 ? Number(row[leaveWagesIdx] || 0) : 0,
                    otEarnings: otEarningsIdx !== -1 ? Number(row[otEarningsIdx] || 0) : 0,
                    totalSalary: totalSalaryIdx !== -1 ? Number(row[totalSalaryIdx] || 0) : 0,
                    esiPf: parsedEsiPf,
                    advance: advIdx !== -1 ? Number(row[advIdx] || 0) : 0,
                    union: parsedUnion,
                    deductAddl: deductAddlIdx !== -1 ? Number(row[deductAddlIdx] || 0) : 0,
                    totalDeduction: totalDedIdx !== -1 ? Number(row[totalDedIdx] || 0) : 0,
                    netSalary: netIdx !== -1 ? Number(row[netIdx] || 0) : 0,
                  };
                }
              }
            }
            setManualWorkData(parsedManual);
          }
        } else {
          setManualWorkData(null);
        }


        // Trigger Sync dialog/action if Master data was present in upload
        if (foundDrivers.length > 0 || foundSections.length > 0 || foundDeductions.length > 0) {
          if (foundDrivers.length > 0) setDrivers(foundDrivers);
          if (foundSections.length > 0) setSections(foundSections);
          if (foundDeductions.length > 0) setDeductions(foundDeductions);
          syncUploadedMasters(foundDrivers, foundSections, foundDeductions);
        }

        setMessage(`Trips parsed: ${parsedTrips.length} rows for period: ${detectedMonthYear}`);
        setActiveTab('EDIT_TRIPS');
      } catch (err) {
        console.error(err);
        setError("Error parsing Excel: " + err.message);
      } finally {
        setLoading(false);
      }
    };
    reader.readAsBinaryString(file);
  };

  const formatExcelDate = (excelDate) => {
    if (!excelDate) return "";

    let localMs;
    if (excelDate instanceof Date) {
      localMs = excelDate.getTime() - (excelDate.getTimezoneOffset() * 60 * 1000);
    } else if (typeof excelDate === 'number') {
      localMs = (excelDate - 25569) * 86400 * 1000;
    } else {
      const str = String(excelDate).trim();
      const parts = str.split(/[\.\-\/]/);
      if (parts.length === 3) {
        let day, month, year;
        if (parts[0].length === 4) {
          year = parts[0];
          month = parts[1];
          day = parts[2];
        } else {
          day = parts[0].padStart(2, '0');
          month = parts[1].padStart(2, '0');
          year = parts[2];
          if (year.length === 2) year = "20" + year;
        }
        return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      }
      const d = new Date(str);
      if (isNaN(d.getTime())) return str;
      localMs = d.getTime() - (d.getTimezoneOffset() * 60 * 1000);
    }

    const roundedMs = Math.round(localMs / 86400000) * 86400000;
    const d = new Date(roundedMs);
    return d.toISOString().split('T')[0];
  };

  // Sync uploaded master data with Supabase
  const syncUploadedMasters = async (drv, sec, ded) => {
    setIsSyncing(true);
    try {
      const isProd = import.meta.env.PROD;
      const baseUrl = isProd ? '' : 'http://localhost:3001';
      await axios.post(`${baseUrl}/api/payroll/masters/sync`, {
        drivers: drv,
        sections: sec,
        deductions: ded
      });
      setMessage("Synced master tables (Drivers, Sections, Deductions) automatically from Excel upload!");
      fetchMasters();
    } catch (err) {
      console.error(err);
      setError("Failed to auto-sync masters with Supabase: " + err.message);
    } finally {
      setIsSyncing(false);
    }
  };

  // Trigger Payroll Math
  const handleCalculate = () => {
    if (trips.length === 0) {
      setError("Please upload a Trip Sheet first.");
      return;
    }
    if (drivers.length === 0) {
      setError("Driver Master data is missing. Please sync master data first.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = calculatePayroll({
        trips,
        advances,
        drivers,
        sections,
        deductions,
        monthConfig
      });
      setResults(res);
      setActiveTab('RESULTS');
      
      let messageStr = "Payroll calculated successfully! View results below.";
      if (manualWorkData) {
        let diffCount = 0;
        let nameMismatchCount = 0;
        res.salaryFinal.forEach(r => {
          const m = manualWorkData[r.driverCode];
          if (m) {
            if (m.netSalary !== undefined && Math.abs(r.netSalary - m.netSalary) > 0.01) {
              diffCount++;
            }
            const mCleanName = m.name ? m.name.split('*')[0].trim().toLowerCase().replace(/\s+/g, '') : "";
            const sCleanName = r.actualName ? r.actualName.toLowerCase().replace(/\s+/g, '') : "";
            if (mCleanName && sCleanName && mCleanName !== sCleanName) {
              nameMismatchCount++;
            }
          }
        });

        let warningParts = [];
        if (nameMismatchCount > 0) {
          warningParts.push(`${nameMismatchCount} ഡ്രൈവർമാരുടെ പേര് മാച്ച് ആകുന്നില്ല (പഴയ കോഡിൽ പുതിയ ആൾ)`);
        }
        if (diffCount > 0) {
          warningParts.push(`${diffCount} ഡ്രൈവർമാരുടെ നെറ്റ് സാലറിയിൽ വ്യത്യാസമുണ്ട്`);
        }

        if (warningParts.length > 0) {
          messageStr += ` (താരതമ്യം ചെയ്തതിൽ ${warningParts.join(' കൂടാതെ ')}. ഡൗൺലോഡ് ചെയ്യുന്ന ഫയലിൽ 'Comparison' ഷീറ്റ് പരിശോധിക്കുക.)`;
        } else {
          messageStr += " (മാനുവൽ വർക്കുമായി താരതമ്യം ചെയ്തതിൽ വ്യത്യാസങ്ങൾ ഒന്നും തന്നെ കണ്ടെത്തിയിട്ടില്ല.)";
        }
      }
      setMessage(messageStr);
    } catch (err) {

      console.error(err);
      setError("Calculation failed: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Inline editing actions
  const startEdit = (trip) => {
    setEditingTripId(trip.id);
    setEditForm({ ...trip });
  };

  const cancelEdit = () => {
    setEditingTripId(null);
    setEditForm({});
  };

  const saveEdit = (id) => {
    const updatedTrips = trips.map(t => t.id === id ? { ...editForm } : t);
    setTrips(updatedTrips);
    setEditingTripId(null);
    setEditForm({});
    setMessage("Trip row updated.");
  };

  const deleteTrip = (id) => {
    if (window.confirm("Are you sure you want to delete this trip record?")) {
      setTrips(trips.filter(t => t.id !== id));
      setMessage("Trip row deleted.");
    }
  };

  const addTripRow = () => {
    const newId = trips.length > 0 ? Math.max(...trips.map(t => t.id)) + 1 : 1;
    const newTrip = {
      id: newId,
      date: new Date().toISOString().split('T')[0],
      vehicle: '',
      dept: '',
      openTime: '',
      kmRun: 0,
      otAfter5: 0,
      mrngOt: 0,
      driverR: '',
      driverS: '',
      driverT: ''
    };
    setTrips([newTrip, ...trips]);
    setSearchTerm('');
    setCurrentPage(1);
    startEdit(newTrip);
  };

  // Export Results back to Excel (3 Sheets styled)
  const handleExportExcel = () => {
    if (!results) return;

    try {
      const wb = XLSX.utils.book_new();

      // Style configurations
      const headerStyle = {
        fill: { fgColor: { rgb: "0A2540" } }, // Dark Blue Navy
        font: { color: { rgb: "FFFFFF" }, bold: true, size: 11 },
        alignment: { horizontal: "center", vertical: "center" }
      };

      const totalStyle = {
        fill: { fgColor: { rgb: "E6EEF8" } }, // Light Blue
        font: { bold: true },
        border: {
          top: { style: "thin", color: { rgb: "0A2540" } },
          bottom: { style: "double", color: { rgb: "0A2540" } }
        }
      };

      // 1. SALARY FINAL SHEET
      const sfHeaders = [
        "Driver & Code", "Code", "Driver Name", "Driver Type", "DAYS Qty", "OT Qty",
        "Salary (Days+OT)", "LEAVE WAGES", "Holiday Salary", "Gross Salary",
        "ESI/EPF Qty", "Less Qty", "Net Qty", "ESI Amount", "EPF Amount",
        "ESI & EPF Total", "Other Deductions", "Current Advance", "Total Deductions", "Net Salary"
      ];
      
      const sfRows = results.salaryFinal.map(r => [
        r.driverValue, r.driverCode, r.actualName, r.category, r.daysQty, r.otQty,
        r.salary, r.leaveWages, r.holidaySalary, r.grossSalary,
        r.esiMaxPay, r.esiLess, r.netEsiQty, r.esiAmount, r.epfAmount,
        r.esiEpfTotalDeduction, r.otherDeduction, r.currentAdvance, r.totalDeduction, r.netSalary
      ]);

      // Totals Row calculations
      const sfTotals = Array(sfHeaders.length).fill(0);
      sfTotals[0] = "TOTAL";
      for (let c = 4; c < sfHeaders.length; c++) {
        sfTotals[c] = sfRows.reduce((sum, row) => sum + (Number(row[c]) || 0), 0);
        // round to 2 decimals
        sfTotals[c] = Number(sfTotals[c].toFixed(2));
      }

      // Merge header, rows and totals
      const sfData = [sfHeaders, ...sfRows, sfTotals];
      const wsSF = XLSX.utils.aoa_to_sheet(sfData);

      // Apply cell styling to Salary Final
      applyExcelStyles(wsSF, sfHeaders.length, sfRows.length, headerStyle, totalStyle);
      XLSX.utils.book_append_sheet(wb, wsSF, "Salary Final");

      // 2. BANK TRANSFER SHEET
      const btHeaders = ["CODE", "ACTUAL NAME", "Account Number", "IFSC Code", "BANK NAME", "BRANCH NAME", "NET SALARY"];
      const btRows = results.bankTransfer.map(r => [
        r.driverCode, r.actualName, r.accountNo, r.ifscCode, r.bankName, r.branchName, r.netSalary
      ]);
      const btTotals = Array(btHeaders.length).fill(0);
      btTotals[0] = "TOTAL";
      btTotals[6] = Number(btRows.reduce((sum, r) => sum + r[6], 0).toFixed(2));

      const btData = [btHeaders, ...btRows, btTotals];
      const wsBT = XLSX.utils.aoa_to_sheet(btData);
      applyExcelStyles(wsBT, btHeaders.length, btRows.length, headerStyle, totalStyle);
      XLSX.utils.book_append_sheet(wb, wsBT, "Bank Transfer");

      // 3. WORK DONE SHEET
      const wdHeaders = ["SR Code", "Work done Particulars", "Total Qty", "Less KM Qty", "Rate", "Amount", "Less KM Amount", "Net Amount"];
      const wdRows = results.workDone.map(r => [
        r.srCode, r.description, r.qty, r.lessKM, r.rate, r.amount, r.lessKMAmount, r.netAmount
      ]);
      const wdTotals = Array(wdHeaders.length).fill(0);
      wdTotals[0] = "TOTAL";
      wdTotals[2] = Number(wdRows.reduce((sum, r) => sum + r[2], 0).toFixed(2));
      wdTotals[3] = Number(wdRows.reduce((sum, r) => sum + r[3], 0).toFixed(2));
      wdTotals[5] = Number(wdRows.reduce((sum, r) => sum + r[5], 0).toFixed(2));
      wdTotals[6] = Number(wdRows.reduce((sum, r) => sum + r[6], 0).toFixed(2));
      wdTotals[7] = Number(wdRows.reduce((sum, r) => sum + r[7], 0).toFixed(2));

      const wdData = [wdHeaders, ...wdRows, wdTotals];
      const wsWD = XLSX.utils.aoa_to_sheet(wdData);
      applyExcelStyles(wsWD, wdHeaders.length, wdRows.length, headerStyle, totalStyle);
      XLSX.utils.book_append_sheet(wb, wsWD, "Work Done");

      // 4. COMPARISON SHEET (if manual data was loaded)
      if (manualWorkData) {
        const compHeaders = [
          "Code", "Manual Driver Name", "Calc Driver Name", "Name Match?",
          "Manual Shifts", "Calc Shifts", "Shifts Diff",
          "Manual Gross", "Calc Gross", "Gross Diff",
          "Manual ESI/PF", "Calc ESI/PF", "ESI/PF Diff",
          "Manual Advance", "Calc Advance", "Advance Diff",
          "Manual Other Ded", "Calc Other Ded", "Other Ded Diff",
          "Manual Net", "Calc Net", "Net Diff"
        ];

        const compRows = results.salaryFinal.map(r => {
          const m = manualWorkData[r.driverCode] || {};
          const mShifts = m.shifts !== undefined ? m.shifts : 0;
          const mGross = m.totalSalary !== undefined ? m.totalSalary : 0;
          const mEsiPf = m.esiPf !== undefined ? m.esiPf : 0;
          const mAdv = m.advance !== undefined ? m.advance : 0;
          const mUnion = m.union !== undefined ? m.union : 0;
          const mNet = m.netSalary !== undefined ? m.netSalary : 0;

          const sShifts = r.daysQty;
          const sGross = r.grossSalary;
          const sEsiPf = r.esiEpfTotalDeduction;
          const sAdv = r.currentAdvance;
          const sUnion = r.otherDeduction;
          const sNet = r.netSalary;

          const diffShifts = Number((sShifts - mShifts).toFixed(2));
          const diffGross = Number((sGross - mGross).toFixed(2));
          const diffEsiPf = Number((sEsiPf - mEsiPf).toFixed(2));
          const diffAdv = Number((sAdv - mAdv).toFixed(2));
          const diffUnion = Number((sUnion - mUnion).toFixed(2));
          const diffNet = Number((sNet - mNet).toFixed(2));

          const mCleanName = m.name ? m.name.split('*')[0].trim() : "";
          const sCleanName = r.actualName || "";
          
          const mCompare = mCleanName.toLowerCase().replace(/\s+/g, '');
          const sCompare = sCleanName.toLowerCase().replace(/\s+/g, '');
          const nameMatch = mCompare && sCompare ? (mCompare === sCompare ? "Yes" : "MISMATCH (പേര് മാറിയിട്ടുണ്ട്!)") : "Yes";

          return [
            r.driverCode, mCleanName || "(Not Found)", sCleanName, nameMatch,
            mShifts, sShifts, diffShifts,
            mGross, sGross, diffGross,
            mEsiPf, sEsiPf, diffEsiPf,
            mAdv, sAdv, diffAdv,
            mUnion, sUnion, diffUnion,
            mNet, sNet, diffNet
          ];
        });

        // Totals row
        const compTotals = Array(compHeaders.length).fill(0);
        compTotals[0] = "TOTAL";
        for (let c = 4; c < compHeaders.length; c++) {
          compTotals[c] = Number(compRows.reduce((sum, row) => sum + (Number(row[c]) || 0), 0).toFixed(2));
        }

        const compData = [compHeaders, ...compRows, compTotals];
        const wsComp = XLSX.utils.aoa_to_sheet(compData);
        applyExcelStyles(wsComp, compHeaders.length, compRows.length, headerStyle, totalStyle);

        // Highlight cells with non-zero differences and name mismatches in red
        const range = XLSX.utils.decode_range(wsComp['!ref']);
        for (let R = 1; R <= compRows.length; R++) {
          // Highlight Name Match column if MISMATCH
          const nameMatchCellRef = XLSX.utils.encode_cell({ r: R, c: 3 });
          const nameMatchCell = wsComp[nameMatchCellRef];
          if (nameMatchCell && nameMatchCell.v && String(nameMatchCell.v).includes("MISMATCH")) {
            if (!nameMatchCell.s) nameMatchCell.s = {};
            nameMatchCell.s.font = { color: { rgb: "E11D48" }, bold: true };
            nameMatchCell.s.fill = { fgColor: { rgb: "FFE4E6" } };
          }

          // Highlight difference columns: 6, 9, 12, 15, 18, 21
          const diffCols = [6, 9, 12, 15, 18, 21];
          diffCols.forEach(C => {
            const cellRef = XLSX.utils.encode_cell({ r: R, c: C });
            const cell = wsComp[cellRef];
            if (cell && cell.v !== 0 && cell.v !== "0") {
              if (!cell.s) cell.s = {};
              cell.s.font = { color: { rgb: "E11D48" }, bold: true };
              cell.s.fill = { fgColor: { rgb: "FFE4E6" } };
            }
          });
        }

        XLSX.utils.book_append_sheet(wb, wsComp, "Comparison");
      }

      // Write and trigger download
      XLSX.writeFile(wb, `Payroll_Statement_${monthYear.replace(/\s+/g, '_')}.xlsx`);

      setMessage("Excel downloaded successfully.");
    } catch (err) {
      console.error(err);
      setError("Excel export failed: " + err.message);
    }
  };

  // Helper to apply styled cells to generated sheets
  const applyExcelStyles = (ws, colCount, rowCount, headerStyle, totalStyle) => {
    const range = XLSX.utils.decode_range(ws['!ref']);
    for (let R = range.s.r; R <= range.e.r; R++) {
      for (let C = range.s.c; C <= range.e.c; C++) {
        const cellRef = XLSX.utils.encode_cell({ r: R, c: C });
        const cell = ws[cellRef];
        if (!cell) continue;

        // Ensure proper style node
        cell.s = {};

        if (R === 0) {
          // Header row
          cell.s = headerStyle;
        } else if (R === rowCount + 1) {
          // Totals row
          cell.s = totalStyle;
        } else {
          // Alternate row coloring for rows
          if (R % 2 === 0) {
            cell.s.fill = { fgColor: { rgb: "F8FAFC" } }; // Slate-50 background
          }
        }
      }
    }
  };

  // Filter trips by search term
  const filteredTrips = trips.filter(t => {
    const term = searchTerm.toLowerCase();
    return (
      String(t.driverR).toLowerCase().includes(term) ||
      String(t.driverS).toLowerCase().includes(term) ||
      String(t.driverT).toLowerCase().includes(term) ||
      String(t.vehicle).toLowerCase().includes(term) ||
      String(t.dept).toLowerCase().includes(term)
    );
  });

  // Trip pagination calculations
  const totalPages = Math.ceil(filteredTrips.length / itemsPerPage);
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentTrips = filteredTrips.slice(indexOfFirstItem, indexOfLastItem);

  return (
    <div className="w-full bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl transition duration-500 hover:shadow-primary/5">
      {/* Premium Header */}
      <div className="bg-gradient-to-r from-blue-950 via-slate-900 to-indigo-950 px-8 py-6 flex flex-col md:flex-row md:items-center justify-between border-b border-slate-800">
        <div className="space-y-1">
          <div className="flex items-center space-x-2">
            <span className="px-3 py-1 bg-primary/20 text-primary border border-primary/30 rounded-full text-xs font-bold font-mono tracking-wide uppercase">Passenger Contract</span>
            <span className="text-slate-500 font-bold">•</span>
            <span className="text-slate-400 text-xs font-semibold">{monthYear || "Select File"}</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight flex items-center space-x-3">
            <Layers className="text-primary animate-pulse" size={28} />
            <span>Payroll Processing Center</span>
          </h1>
        </div>

        {/* Global Action Trigger */}
        <div className="mt-4 md:mt-0 flex space-x-3">
          {trips.length > 0 && (
            <button
              onClick={handleCalculate}
              disabled={loading}
              className="px-5 py-3 bg-gradient-to-r from-emerald-600 to-teal-500 text-white font-bold text-sm rounded-xl flex items-center space-x-2 hover:opacity-90 active:scale-[0.98] transition cursor-pointer shadow-lg shadow-emerald-900/20 disabled:opacity-50"
            >
              <Play size={16} fill="white" />
              <span>Calculate Payroll</span>
            </button>
          )}

          {results && (
            <button
              onClick={handleExportExcel}
              className="px-5 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm rounded-xl flex items-center space-x-2 active:scale-[0.98] transition cursor-pointer shadow-lg shadow-indigo-950/20"
            >
              <Download size={16} />
              <span>Download Excel</span>
            </button>
          )}
        </div>
      </div>

      {/* Tabs Menu */}
      <div className="bg-slate-950 border-b border-slate-800 flex overflow-x-auto scrollbar-none px-6">
        {[
          { id: 'UPLOAD', name: '1. File Upload', icon: Upload },
          { id: 'EDIT_TRIPS', name: `2. Trip Sheet (${trips.length})`, icon: FileText },
          { id: 'MASTERS', name: 'Database Masters', icon: Users },
          { id: 'RESULTS', name: 'Payroll Statements', icon: CheckCircle }
        ].map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-6 py-4 flex items-center space-x-2 border-b-2 text-sm font-bold tracking-wide whitespace-nowrap transition duration-300 cursor-pointer ${
                isActive ? 'border-primary text-primary bg-primary/5' : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/40'
              }`}
            >
              <Icon size={16} />
              <span>{tab.name}</span>
            </button>
          );
        })}
      </div>

      {/* Error & Info Banners */}
      <div className="px-8 pt-6">
        {error && (
          <div className="p-4 bg-red-950/40 border border-red-800 text-red-400 rounded-2xl flex items-center space-x-3 animate-fadeIn">
            <AlertTriangle className="text-red-500 shrink-0" />
            <div className="text-sm font-semibold">{error}</div>
          </div>
        )}
        {message && (
          <div className="p-4 bg-slate-800/60 border border-slate-700 text-slate-300 rounded-2xl flex items-center space-x-3 animate-fadeIn">
            <CheckCircle className="text-primary shrink-0" />
            <div className="text-sm font-semibold">{message}</div>
          </div>
        )}
      </div>

      {/* Main Content Area */}
      <div className="p-8">
        
        {/* TAB 1: FILE UPLOAD */}
        {activeTab === 'UPLOAD' && (
          <div className="max-w-2xl mx-auto py-8 text-center space-y-8">
            <div className="p-6 bg-slate-950/60 border border-slate-800 rounded-3xl space-y-6">
              <div className="flex justify-center">
                <div className="p-5 bg-primary/10 text-primary border border-primary/20 rounded-full">
                  <Upload size={40} className="animate-bounce" />
                </div>
              </div>
              <div className="space-y-2">
                <h3 className="text-lg font-bold text-white">Upload Monthly Statement File</h3>
                <p className="text-slate-400 text-sm max-w-md mx-auto">
                  Drag and drop or select your <b>"Salary Data.xlsx"</b> file. 
                  The app will automatically extract trips, advances, and sync the driver/section configurations in Supabase.
                </p>
              </div>

              <div className="pt-4">
                <input
                  type="file"
                  id="salary-excel-file"
                  accept=".xlsx, .xlsm, .xls"
                  onChange={handleExcelUpload}
                  className="hidden"
                />
                <label
                  htmlFor="salary-excel-file"
                  className="px-6 py-4 bg-primary text-slate-950 font-extrabold text-sm rounded-xl cursor-pointer hover:bg-primary/95 transition inline-flex items-center space-x-2 shadow-lg shadow-primary/20 active:scale-95"
                >
                  <FileText size={18} />
                  <span>Choose Salary Data File</span>
                </label>
              </div>
            </div>

            <div className="p-6 bg-slate-950/20 border border-dashed border-slate-800 rounded-3xl flex flex-col items-center justify-between space-y-4">
              <div className="flex items-center space-x-3 text-left">
                <ShieldAlert className="text-amber-500" size={24} />
                <div>
                  <h4 className="text-sm font-bold text-white">Supabase Initialization</h4>
                  <p className="text-xs text-slate-400">If you are running the system for the first time, initialize the database tables.</p>
                </div>
              </div>
              <button
                onClick={triggerMigration}
                disabled={loading}
                className="px-4 py-2.5 bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 font-bold text-xs rounded-lg transition"
              >
                Initialize DB Tables
              </button>
            </div>
          </div>
        )}

        {/* TAB 2: TRIP SHEET GRID EDITOR */}
        {activeTab === 'EDIT_TRIPS' && (
          <div className="space-y-6">
            {/* Grid Search and Add Row */}
            <div className="flex flex-col md:flex-row gap-4 justify-between items-center bg-slate-950 p-4 border border-slate-800 rounded-2xl">
              <div className="relative w-full md:max-w-md">
                <Search className="absolute left-3.5 top-3.5 text-slate-500" size={18} />
                <input
                  type="text"
                  placeholder="Search trips by driver, vehicle or department..."
                  value={searchTerm}
                  onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                  className="w-full bg-slate-900 text-white pl-10 pr-4 py-3 rounded-xl border border-slate-800 focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none transition text-sm"
                />
              </div>

              <button
                onClick={addTripRow}
                className="w-full md:w-auto px-4 py-3 bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 font-bold text-sm rounded-xl flex items-center justify-center space-x-2 cursor-pointer transition active:scale-[0.98]"
              >
                <Plus size={16} />
                <span>Add Custom Trip</span>
              </button>
            </div>

            {/* Excel Grid Table */}
            {trips.length === 0 ? (
              <div className="py-20 text-center text-slate-500 font-medium">
                No trips loaded. Please upload a Trip Sheet file first.
              </div>
            ) : (
              <div className="border border-slate-800 rounded-2xl overflow-hidden bg-slate-950/40">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-900 border-b border-slate-800 text-slate-400 font-bold">
                        <th className="p-3.5">Date</th>
                        <th className="p-3.5">Vehicle</th>
                        <th className="p-3.5">Dept Used</th>
                        <th className="p-3.5 text-center">Open Time</th>
                        <th className="p-3.5 text-right">KM Run</th>
                        <th className="p-3.5 text-right">OT Col Q</th>
                        <th className="p-3.5 text-right">Mrng OT (Min)</th>
                        <th className="p-3.5">Driver R (Main)</th>
                        <th className="p-3.5">Driver S</th>
                        <th className="p-3.5">Driver T</th>
                        <th className="p-3.5 text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800 text-slate-300">
                      {currentTrips.map(trip => {
                        const isEditing = editingTripId === trip.id;
                        return (
                          <tr key={trip.id} className="hover:bg-slate-900/50 transition">
                            {isEditing ? (
                              <>
                                <td className="p-2">
                                  <input
                                    type="text"
                                    value={editForm.date || ''}
                                    onChange={(e) => setEditForm({ ...editForm, date: e.target.value })}
                                    className="bg-slate-900 text-white p-1.5 border border-slate-700 rounded w-24 text-xs"
                                  />
                                </td>
                                <td className="p-2">
                                  <input
                                    type="text"
                                    value={editForm.vehicle || ''}
                                    onChange={(e) => setEditForm({ ...editForm, vehicle: e.target.value })}
                                    className="bg-slate-900 text-white p-1.5 border border-slate-700 rounded w-20 text-xs"
                                  />
                                </td>
                                <td className="p-2">
                                  <input
                                    type="text"
                                    value={editForm.dept || ''}
                                    onChange={(e) => setEditForm({ ...editForm, dept: e.target.value })}
                                    className="bg-slate-900 text-white p-1.5 border border-slate-700 rounded w-32 text-xs"
                                  />
                                </td>
                                <td className="p-2 text-center">
                                  <input
                                    type="text"
                                    value={editForm.openTime || ''}
                                    onChange={(e) => setEditForm({ ...editForm, openTime: e.target.value })}
                                    className="bg-slate-900 text-white p-1.5 border border-slate-700 rounded w-16 text-center text-xs"
                                  />
                                </td>
                                <td className="p-2 text-right">
                                  <input
                                    type="number"
                                    value={editForm.kmRun}
                                    onChange={(e) => setEditForm({ ...editForm, kmRun: Number(e.target.value) })}
                                    className="bg-slate-900 text-white p-1.5 border border-slate-700 rounded w-16 text-right text-xs"
                                  />
                                </td>
                                <td className="p-2 text-right">
                                  <input
                                    type="number"
                                    value={editForm.otAfter5}
                                    onChange={(e) => setEditForm({ ...editForm, otAfter5: Number(e.target.value) })}
                                    className="bg-slate-900 text-white p-1.5 border border-slate-700 rounded w-16 text-right text-xs"
                                  />
                                </td>
                                <td className="p-2 text-right">
                                  <input
                                    type="number"
                                    value={editForm.mrngOt || 0}
                                    onChange={(e) => setEditForm({ ...editForm, mrngOt: Number(e.target.value) })}
                                    className="bg-slate-900 text-white p-1.5 border border-slate-700 rounded w-16 text-right text-xs"
                                  />
                                </td>
                                <td className="p-2">
                                  <input
                                    type="text"
                                    value={editForm.driverR || ''}
                                    onChange={(e) => setEditForm({ ...editForm, driverR: e.target.value })}
                                    className="bg-slate-900 text-white p-1.5 border border-slate-700 rounded w-36 text-xs"
                                  />
                                </td>
                                <td className="p-2">
                                  <input
                                    type="text"
                                    value={editForm.driverS || ''}
                                    onChange={(e) => setEditForm({ ...editForm, driverS: e.target.value })}
                                    className="bg-slate-900 text-white p-1.5 border border-slate-700 rounded w-36 text-xs"
                                  />
                                </td>
                                <td className="p-2">
                                  <input
                                    type="text"
                                    value={editForm.driverT || ''}
                                    onChange={(e) => setEditForm({ ...editForm, driverT: e.target.value })}
                                    className="bg-slate-900 text-white p-1.5 border border-slate-700 rounded w-36 text-xs"
                                  />
                                </td>
                                <td className="p-2 text-center space-x-2">
                                  <button onClick={() => saveEdit(trip.id)} className="px-2 py-1 bg-emerald-700 text-white rounded text-[10px] font-bold">Save</button>
                                  <button onClick={cancelEdit} className="px-2 py-1 bg-slate-800 text-slate-350 rounded text-[10px] font-bold">Cancel</button>
                                </td>
                              </>
                            ) : (
                              <>
                                <td className="p-3.5 font-mono">{trip.date}</td>
                                <td className="p-3.5 font-semibold text-white">{trip.vehicle}</td>
                                <td className="p-3.5 text-slate-400">{trip.dept}</td>
                                <td className="p-3.5 text-center font-mono">{trip.openTime || '-'}</td>
                                <td className="p-3.5 text-right font-mono font-semibold">{trip.kmRun}</td>
                                <td className="p-3.5 text-right font-mono">{trip.otAfter5 || '-'}</td>
                                <td className="p-3.5 text-right font-mono">{trip.mrngOt || '-'}</td>
                                <td className="p-3.5 font-semibold">{trip.driverR || '-'}</td>
                                <td className="p-3.5 text-slate-400">{trip.driverS || '-'}</td>
                                <td className="p-3.5 text-slate-400">{trip.driverT || '-'}</td>
                                <td className="p-3.5 text-center">
                                  <div className="flex justify-center space-x-2.5">
                                    <button onClick={() => startEdit(trip)} className="p-1.5 text-slate-400 hover:text-primary hover:bg-primary/10 rounded-lg transition" title="Edit row">
                                      <Edit2 size={13} />
                                    </button>
                                    <button onClick={() => deleteTrip(trip.id)} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition" title="Delete row">
                                      <Trash2 size={13} />
                                    </button>
                                  </div>
                                </td>
                              </>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Grid Pagination */}
                {totalPages > 1 && (
                  <div className="px-6 py-4 flex items-center justify-between border-t border-slate-800 bg-slate-900/40">
                    <span className="text-xs text-slate-500 font-semibold">
                      Showing {indexOfFirstItem + 1} - {Math.min(indexOfLastItem, filteredTrips.length)} of {filteredTrips.length} entries
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
        )}

        {/* TAB 3: MASTER DATA VIEWER */}
        {activeTab === 'MASTERS' && (
          <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="p-5 bg-slate-950/60 border border-slate-800 rounded-2xl flex items-center space-x-4">
                <div className="p-3.5 bg-blue-500/10 text-blue-500 rounded-xl border border-blue-500/20">
                  <Users size={22} />
                </div>
                <div>
                  <span className="text-slate-500 text-xs font-semibold block uppercase">Driver Master</span>
                  <span className="text-xl font-black text-white">{isLoadingMasters ? '...' : drivers.length} records</span>
                </div>
              </div>

              <div className="p-5 bg-slate-950/60 border border-slate-800 rounded-2xl flex items-center space-x-4">
                <div className="p-3.5 bg-indigo-500/10 text-indigo-500 rounded-xl border border-indigo-500/20">
                  <Layers size={22} />
                </div>
                <div>
                  <span className="text-slate-500 text-xs font-semibold block uppercase">Section Master</span>
                  <span className="text-xl font-black text-white">{isLoadingMasters ? '...' : sections.length} depts</span>
                </div>
              </div>

              <div className="p-5 bg-slate-950/60 border border-slate-800 rounded-2xl flex items-center space-x-4">
                <div className="p-3.5 bg-purple-500/10 text-purple-500 rounded-xl border border-purple-500/20">
                  <ShieldAlert size={22} />
                </div>
                <div>
                  <span className="text-slate-500 text-xs font-semibold block uppercase">Deductions Master</span>
                  <span className="text-xl font-black text-white">{isLoadingMasters ? '...' : deductions.length} drivers</span>
                </div>
              </div>
            </div>

            <div className="bg-slate-950/20 border border-slate-850 rounded-2xl p-6 space-y-4">
              <div className="flex justify-between items-center border-b border-slate-800 pb-4">
                <h3 className="text-base font-bold text-white">Supabase Master Lists</h3>
                <button
                  onClick={fetchMasters}
                  disabled={isLoadingMasters}
                  className="px-3.5 py-2 bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 font-bold text-xs rounded-lg flex items-center space-x-2 transition cursor-pointer"
                >
                  <RefreshCw size={14} className={isLoadingMasters ? 'animate-spin' : ''} />
                  <span>Refresh Lists</span>
                </button>
              </div>

              {/* Show short previews */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 text-xs text-slate-400">
                <div className="space-y-2 border border-slate-800/40 p-4 rounded-xl">
                  <h4 className="font-bold text-slate-300 flex items-center justify-between pb-1 border-b border-slate-800">
                    <span>Drivers Preview</span>
                    <span className="text-[10px] text-slate-500 font-semibold">{drivers.length} total</span>
                  </h4>
                  {drivers.slice(0, 5).map(d => (
                    <div key={d.driver_code} className="flex justify-between py-1 border-b border-slate-900">
                      <span className="font-semibold text-slate-350">{d.actual_name}</span>
                      <span className="font-mono text-slate-550">({d.driver_code})</span>
                    </div>
                  ))}
                  {drivers.length > 5 && <div className="text-[10px] text-slate-550 pt-1 text-center">... and {drivers.length - 5} more</div>}
                </div>

                <div className="space-y-2 border border-slate-800/40 p-4 rounded-xl">
                  <h4 className="font-bold text-slate-300 flex items-center justify-between pb-1 border-b border-slate-800">
                    <span>Sections Preview</span>
                    <span className="text-[10px] text-slate-500 font-semibold">{sections.length} total</span>
                  </h4>
                  {sections.slice(0, 5).map(s => (
                    <div key={s.dept} className="flex justify-between py-1 border-b border-slate-900">
                      <span className="text-slate-350 max-w-[150px] truncate">{s.dept}</span>
                      <span className="font-mono text-primary">₹{s.rate}/day</span>
                    </div>
                  ))}
                  {sections.length > 5 && <div className="text-[10px] text-slate-550 pt-1 text-center">... and {sections.length - 5} more</div>}
                </div>

                <div className="space-y-2 border border-slate-800/40 p-4 rounded-xl">
                  <h4 className="font-bold text-slate-300 flex items-center justify-between pb-1 border-b border-slate-800">
                    <span>Deductions Preview</span>
                    <span className="text-[10px] text-slate-500 font-semibold">{deductions.length} total</span>
                  </h4>
                  {deductions.slice(0, 5).map(d => (
                    <div key={d.driver_code} className="flex justify-between py-1 border-b border-slate-900">
                      <span className="font-mono text-slate-350">{d.driver_code}</span>
                      <span className="font-semibold text-red-400">₹{d.total_deductions}</span>
                    </div>
                  ))}
                  {deductions.length > 5 && <div className="text-[10px] text-slate-550 pt-1 text-center">... and {deductions.length - 5} more</div>}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: CALCULATED RESULTS */}
        {activeTab === 'RESULTS' && (
          <div className="space-y-12">
            {!results ? (
              <div className="py-24 text-center text-slate-500 font-medium">
                No calculation outputs. Click "Calculate Payroll" after editing your Trip Sheet.
              </div>
            ) : (
              <>
                {/* Visual Stats Bar */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                  <div className="p-6 bg-slate-950/60 border border-slate-800 rounded-3xl space-y-1.5">
                    <span className="text-slate-500 text-xs font-bold block uppercase tracking-wider">Gross Payroll Amount</span>
                    <span className="text-3xl font-black text-white">
                      ₹{results.salaryFinal.reduce((sum, r) => sum + r.grossSalary, 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                    </span>
                  </div>

                  <div className="p-6 bg-slate-950/60 border border-slate-800 rounded-3xl space-y-1.5">
                    <span className="text-slate-500 text-xs font-bold block uppercase tracking-wider">Net Payout Amount</span>
                    <span className="text-3xl font-black text-emerald-400">
                      ₹{results.salaryFinal.reduce((sum, r) => sum + r.netSalary, 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                    </span>
                  </div>

                  <div className="p-6 bg-slate-950/60 border border-slate-800 rounded-3xl space-y-1.5">
                    <span className="text-slate-500 text-xs font-bold block uppercase tracking-wider">Total Drivers Paid</span>
                    <span className="text-3xl font-black text-white">{results.salaryFinal.length} drivers</span>
                  </div>

                  <div className="p-6 bg-slate-950/60 border border-slate-800 rounded-3xl space-y-1.5">
                    <span className="text-slate-500 text-xs font-bold block uppercase tracking-wider">Advances Deducted</span>
                    <span className="text-3xl font-black text-indigo-400">
                      ₹{results.salaryFinal.reduce((sum, r) => sum + r.currentAdvance, 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>

                {/* Report Section 1: Salary Final */}
                <div className="space-y-4">
                  <h3 className="text-lg font-bold text-white border-b border-slate-800 pb-2 flex items-center space-x-2">
                    <Award size={18} className="text-primary" />
                    <span>Statement Final (Preview)</span>
                  </h3>
                  <div className="border border-slate-800 rounded-2xl overflow-hidden bg-slate-950/40">
                    <div className="overflow-x-auto max-h-[400px] scrollbar-thin">
                      <table className="w-full text-left border-collapse text-xs whitespace-nowrap">
                        <thead className="sticky top-0 bg-slate-900 border-b border-slate-800 text-slate-400 font-bold z-10">
                          <tr>
                            <th className="p-3">Driver Name</th>
                            <th className="p-3">Driver Code</th>
                            <th className="p-3">Category</th>
                            <th className="p-3 text-right">DAYS Qty</th>
                            <th className="p-3 text-right">OT Qty</th>
                            <th className="p-3 text-right">Salary (Days+OT)</th>
                            <th className="p-3 text-right">Leave Wages</th>
                            <th className="p-3 text-right">Holiday Salary</th>
                            <th className="p-3 text-right">Gross Salary</th>
                            <th className="p-3 text-right">ESI Amount</th>
                            <th className="p-3 text-right">EPF Amount</th>
                            <th className="p-3 text-right">Other Deductions</th>
                            <th className="p-3 text-right">Current Advance</th>
                            <th className="p-3 text-right font-bold text-emerald-400">Net Salary</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800 text-slate-350">
                          {results.salaryFinal.map(r => (
                            <tr key={r.driverCode} className="hover:bg-slate-900/50 transition">
                              <td className="p-3 font-semibold text-white">{r.actualName}</td>
                              <td className="p-3 font-mono">{r.driverCode}</td>
                              <td className="p-3 text-slate-450">{r.category}</td>
                              <td className="p-3 text-right font-mono font-semibold">{r.daysQty}</td>
                              <td className="p-3 text-right font-mono">{r.otQty || '-'}</td>
                              <td className="p-3 text-right font-mono">₹{r.salary}</td>
                              <td className="p-3 text-right font-mono">₹{r.leaveWages}</td>
                              <td className="p-3 text-right font-mono">₹{r.holidaySalary}</td>
                              <td className="p-3 text-right font-mono font-semibold text-white">₹{r.grossSalary}</td>
                              <td className="p-3 text-right font-mono text-red-400">₹{r.esiAmount}</td>
                              <td className="p-3 text-right font-mono text-red-400">₹{r.epfAmount}</td>
                              <td className="p-3 text-right font-mono text-red-400">₹{r.otherDeduction}</td>
                              <td className="p-3 text-right font-mono text-red-400">₹{r.currentAdvance}</td>
                              <td className="p-3 text-right font-mono font-bold text-emerald-400">₹{r.netSalary}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                {/* Report Section 2: Bank Transfer & Work Done side by side */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  
                  {/* Bank Transfer preview */}
                  <div className="space-y-4">
                    <h3 className="text-lg font-bold text-white border-b border-slate-800 pb-2">
                      Bank Transfer Statement
                    </h3>
                    <div className="border border-slate-800 rounded-2xl overflow-hidden bg-slate-950/40">
                      <div className="overflow-x-auto max-h-[350px]">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead>
                            <tr className="bg-slate-900 border-b border-slate-800 text-slate-400 font-bold">
                              <th className="p-3">Name</th>
                              <th className="p-3">Account No</th>
                              <th className="p-3">IFSC</th>
                              <th className="p-3">Bank Name</th>
                              <th className="p-3 text-right">Net Payout</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800 text-slate-350">
                            {results.bankTransfer.map(r => (
                              <tr key={r.driverCode} className="hover:bg-slate-900/50 transition">
                                <td className="p-3 font-semibold text-white">{r.actualName}</td>
                                <td className="p-3 font-mono">{r.accountNo}</td>
                                <td className="p-3 font-mono text-slate-400">{r.ifscCode}</td>
                                <td className="p-3 text-slate-400">{r.bankName}</td>
                                <td className="p-3 text-right font-mono font-bold text-emerald-400">₹{r.netSalary}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>

                  {/* Work Done preview */}
                  <div className="space-y-4">
                    <h3 className="text-lg font-bold text-white border-b border-slate-800 pb-2">
                      Work Done (Contract Summary)
                    </h3>
                    <div className="border border-slate-800 rounded-2xl overflow-hidden bg-slate-950/40">
                      <div className="overflow-x-auto max-h-[350px]">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead>
                            <tr className="bg-slate-900 border-b border-slate-800 text-slate-400 font-bold">
                              <th className="p-3">SR Code</th>
                              <th className="p-3">Particulars</th>
                              <th className="p-3 text-right">Qty</th>
                              <th className="p-3 text-right">Less KM</th>
                              <th className="p-3 text-right">Rate</th>
                              <th className="p-3 text-right">Net Amount</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800 text-slate-350">
                            {results.workDone.map((r, i) => (
                              <tr key={i} className="hover:bg-slate-900/50 transition">
                                <td className="p-3 font-mono text-primary">{r.srCode}</td>
                                <td className="p-3 text-white max-w-[200px] truncate">{r.description}</td>
                                <td className="p-3 text-right font-mono">{r.qty || '-'}</td>
                                <td className="p-3 text-right font-mono text-amber-400">{r.lessKM || '-'}</td>
                                <td className="p-3 text-right font-mono">₹{r.rate}</td>
                                <td className="p-3 text-right font-mono font-semibold text-emerald-450">₹{r.netAmount}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>

                </div>
              </>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
