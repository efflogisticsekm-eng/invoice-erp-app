// core payroll calculation engine (mirroring VBA Macro Module1_v3.bas)

export function calculatePayroll({ trips, advances, drivers, sections, deductions, monthConfig }) {
  // 1. Setup collections/maps for quick lookup
  const driverMasterMap = new Map();
  drivers.forEach(d => {
    driverMasterMap.set(d.driver_code.trim(), d);
  });

  const sectionMasterMap = new Map();
  sections.forEach(s => {
    sectionMasterMap.set(s.dept.trim(), s);
  });

  const deductionsMap = new Map();
  deductions.forEach(d => {
    deductionsMap.set(d.driver_code.trim(), d);
  });

  // Month parameters (default to standard values if monthConfig is missing)
  const esiMaxQty = Number(monthConfig?.esi_max_qty || 26);
  const lwFull = Number(monthConfig?.lw_full || 4);
  const lw21 = Number(monthConfig?.lw_21 || 3);
  const lw14 = Number(monthConfig?.lw_14 || 2);
  const lwLow = Number(monthConfig?.lw_low || 0);
  const holidaysList = monthConfig?.holidays || []; // Array of date strings in YYYY-MM-DD or DD.MM.YYYY format

  const holidaysSet = new Set(holidaysList.map(h => formatDateKey(h)));

  // Helper to standardise date keys (timezone-safe rounding)
  function formatDateKey(dateInput) {
    if (!dateInput) return "";

    let localMs;
    if (dateInput instanceof Date) {
      localMs = dateInput.getTime() - (dateInput.getTimezoneOffset() * 60 * 1000);
    } else if (typeof dateInput === 'number') {
      localMs = (dateInput - 25569) * 86400 * 1000;
    } else {
      const str = String(dateInput).trim();
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
  }

  // Helper to extract driver code from string with asterisks (e.g. "ANWAR *D101*")
  function extractDriverCode(val) {
    if (!val) return "";
    const s = String(val);
    const start = s.indexOf('*');
    if (start !== -1) {
      const end = s.indexOf('*', start + 1);
      if (end !== -1) {
        return s.substring(start + 1, end).trim();
      }
    }
    return s.trim();
  }

  // Helper to parse decimal time to hours (e.g. 7.30 -> 7.5 hours)
  function parseTimeToDecimalHours(timeVal) {
    if (timeVal === undefined || timeVal === null || timeVal === "") return 0;
    const num = Number(timeVal);
    if (isNaN(num)) return 0;
    const hours = Math.floor(num);
    const minutes = Math.round((num - hours) * 100);
    return hours + (minutes / 60);
  }

  // 2. Trackings
  const driverDuties = {};     // code -> count of trips/duties
  const driverOT = {};         // code -> sum of OT hours
  const driverHolShifts = {};  // code -> count of holiday duties
  
  // Work done tracking by SR code
  const wdQty = {};        // sr_code -> trip count
  const wdLessKM = {};     // sr_code -> total shortfall KM
  const wdPlusKM = {};     // sr_code -> total excess KM
  const wdRate = {};       // sr_code -> main rate
  let wdAddlKMRate = 7.6;  // default rate per km (usually comes from Section Master)
  
  let wdPlusKM8 = 0;   // Excess KM for 8HR car depts (SR 9009148)
  let wdPlusKM24 = 0;  // Excess KM for 24HR car depts (SR 9014950)
  let wdLessKM8 = 0;
  let wdLessKM24 = 0;

  // Process all trips
  trips.forEach(trip => {
    const deptUsed = String(trip.dept || "").trim();
    const section = sectionMasterMap.get(deptUsed);
    const isOTEligible = section ? (String(section.ot_eligibility).toUpperCase() === 'YES') : false;

    // A. OT Calculations (Only calculated for Col R driver, and only if OT eligible)
    let otAfter5 = Number(trip.otAfter5 || 0);
    let otBefore8 = 0;
    
    if (isOTEligible) {
      const openTimeNum = Number(trip.openTime);
      if (!isNaN(openTimeNum) && openTimeNum > 0) {
        const openHr = parseTimeToDecimalHours(openTimeNum);
        if (openHr > 0 && openHr < 8) {
          otBefore8 = 8 - openHr;
        }
      }
    }
    const dailyOT = otAfter5 + otBefore8;
    
    // B. Holiday Check
    const tripDateKey = formatDateKey(trip.date);
    const isHoliday = holidaysSet.has(tripDateKey);

    // C. Work Done Tracking by SR Code (if section exists)
    if (section) {
      const srCode = String(section.sr_code || "").trim();
      const targetKM = Number(section.target_km || 0);
      const kmRun = Number(trip.kmRun || 0);

      if (srCode && srCode !== "0") {
        // Store rate
        wdRate[srCode] = Number(section.rate || 0);
        // Increment trip count
        wdQty[srCode] = (wdQty[srCode] || 0) + 1;

        // KM shortfall/excess calculations
        if (kmRun > 0 && targetKM > 0) {
          if (kmRun < targetKM) {
            const lessVal = targetKM - kmRun;
            wdLessKM[srCode] = (wdLessKM[srCode] || 0) + lessVal;
            if (srCode === "9009148") wdLessKM8 += lessVal;
            if (srCode === "9014950") wdLessKM24 += lessVal;
          } else if (kmRun > targetKM) {
            const plusVal = kmRun - targetKM;
            wdPlusKM[srCode] = (wdPlusKM[srCode] || 0) + plusVal;
            if (srCode === "9009148") wdPlusKM8 += plusVal;
            if (srCode === "9014950") wdPlusKM24 += plusVal;
          }
        }

        // Additional KM Rate
        if (section.addl_rate) {
          wdAddlKMRate = Number(section.addl_rate);
        }
      }
    }

    // D. Driver specific counting (checking columns R, S, T)
    const driverCols = [trip.driverR, trip.driverS, trip.driverT];
    driverCols.forEach((dVal, index) => {
      const code = extractDriverCode(dVal);
      if (!code) return;

      const driverMaster = driverMasterMap.get(code);
      if (!driverMaster) return;

      // Track duties
      driverDuties[code] = (driverDuties[code] || 0) + 1;

      // Track OT (Only for Column R driver, index 0, and if eligible)
      if (index === 0 && isOTEligible && dailyOT >= 0.5) {
        driverOT[code] = (driverOT[code] || 0) + dailyOT;
      }

      // Track Holiday Shift (if holiday and driver eligible)
      if (isHoliday && driverMaster.holiday_eligibility !== 'NO') {
        driverHolShifts[code] = (driverHolShifts[code] || 0) + 1;
      }
    });
  });

  // 3. Compile Salary Final Results
  // Sort driver codes to match Excel outputs
  const sortedCodes = Array.from(driverMasterMap.keys()).sort();
  const advanceUsed = new Set(); // to prevent double counting advance

  const salaryFinal = [];
  const bankTransfer = [];

  sortedCodes.forEach(code => {
    const dMaster = driverMasterMap.get(code);
    const days = driverDuties[code] || 0;
    
    // Skip drivers who had 0 duties in the month
    if (days === 0) return;

    const ratePerDay = Number(dMaster.rate_per_day || 0);
    const basicAmt = Number(dMaster.basic_pay || 0);
    const otQty = Number(driverOT[code] || 0);
    const otRate = Number(dMaster.ot_rate || 0);
    
    // Duties Salary
    const salary = (days * ratePerDay) + (otQty * otRate);

    // Leave Wages Calculation
    let leaveWages = 0;
    if (dMaster.leave_eligibility !== "NO" && dMaster.leave_eligibility !== "0" && dMaster.leave_eligibility !== "") {
      let lwDays = 0;
      if (days >= esiMaxQty) lwDays = lwFull;
      else if (days >= 21) lwDays = lw21;
      else if (days >= 14) lwDays = lw14;
      else lwDays = lwLow;

      leaveWages = lwDays * basicAmt;
    }

    // Holiday Salary Calculation
    const holShifts = driverHolShifts[code] || 0;
    const holWagesRate = Number(dMaster.holiday_wages || 0);
    const holSalary = holShifts * holWagesRate;

    const grossSalary = salary + leaveWages + holSalary;

    // ESI & EPF Calculation
    const esiMaxPay = Math.min(days, esiMaxQty);
    const esiLess = Number(dMaster.esi_less || 0);
    const netEsiQty = Math.max(0, esiMaxPay - esiLess);

    const esiAmt = netEsiQty * Number(dMaster.esi_rate || 0);
    const epfAmt = netEsiQty * Number(dMaster.epf_rate || 0);
    const esiEpfTotalDeduction = esiAmt + epfAmt;

    // Deductions Lookups
    const decMaster = deductionsMap.get(code);
    const otherAdv = decMaster ? Number(decMaster.total_deductions || 0) : 0;

    // Advance Lookup (using account number, preventing double counts)
    const acctNo = String(dMaster.account_number || "").trim();
    let curAdv = 0;
    if (acctNo && acctNo !== "0" && !advanceUsed.has(acctNo)) {
      curAdv = Number(advances[acctNo] || 0);
      if (curAdv > 0) {
        advanceUsed.add(acctNo);
      }
    }

    const totalDed = esiEpfTotalDeduction + otherAdv + curAdv;
    const netSalary = grossSalary - totalDed;

    // A. Add to Salary Final
    salaryFinal.push({
      driverValue: dMaster.actual_name + ` *${code}*`, // matches format
      driverCode: code,
      actualName: dMaster.actual_name,
      category: dMaster.category,
      daysQty: days,
      otQty: Number(otQty.toFixed(2)),
      salary: Number(salary.toFixed(2)),
      leaveWages: Number(leaveWages.toFixed(2)),
      holidaySalary: Number(holSalary.toFixed(2)),
      grossSalary: Number(grossSalary.toFixed(2)),
      esiMaxPay,
      esiLess,
      netEsiQty,
      esiAmount: Number(esiAmt.toFixed(2)),
      epfAmount: Number(epfAmt.toFixed(2)),
      esiEpfTotalDeduction: Number(esiEpfTotalDeduction.toFixed(2)),
      otherDeduction: Number(otherAdv.toFixed(2)),
      currentAdvance: Number(curAdv.toFixed(2)),
      totalDeduction: Number(totalDed.toFixed(2)),
      netSalary: Number(netSalary.toFixed(2))
    });

    // B. Add to Bank Transfer
    bankTransfer.push({
      driverCode: code,
      actualName: dMaster.actual_name,
      accountNo: acctNo,
      ifscCode: String(dMaster.ifsc_code || "").trim() === "0" ? "" : String(dMaster.ifsc_code || "").trim(),
      bankName: dMaster.bank_name,
      branchName: dMaster.branch_name,
      netSalary: Number(netSalary.toFixed(2))
    });
  });

  // 4. Compile Work Done Sheet Results (Rows 2 to 21)
  const workDone = [];
  
  // Define Section Row structure to match Excel sheet Layout
  const wdRowsDefinition = [
    { srCode: "9009148", desc: "CAR RUNNING CHARGES 8 HRS" },
    { srCode: "9009152", desc: "CAR ADDITIONAL RUNNING KMS 8HRS" },
    { srCode: "9014950", desc: "CAR RUNNING CHARGES 24 HRS" },
    { srCode: "9009152", desc: "CAR ADDITIONAL RUNNING KMS 24HRS" },
    { srCode: "9009192", desc: "MUV SHIFT BASIS" },
    { srCode: "9009187", desc: "MUV RATE PER DAY" },
    { srCode: "9009196", desc: "MUV ADDITIONAL RUNNING KMS" },
    { srCode: "9009262", desc: "NON A/C BUS 35-40 SHIFT BASIS" },
    { srCode: "9009260", desc: "NON A/C BUS 35-40 RATE PER DAY" },
    { srCode: "9009264", desc: "NON A/C BUS 35-40 ADDL RUNNING KMS" },
    { srCode: "9009233", desc: "CARRIER SHIFT BASIS" },
    { srCode: "9009242", desc: "CARRIER ADDITIONAL RUNNING KMS" },
    { srCode: "9009282", desc: "50 SEATER BUS" },
    { srCode: "9009285", desc: "50 SEATER BUS ADDL RUNNING KMS" },
    { srCode: "9009156", desc: "CAR ADDITIONAL SHIFT HOURS 8 HRS" },
    { srCode: "9014954", desc: "CAR ADDITIONAL SHIFT HOURS 24 HRS" },
    { srCode: "9009200", desc: "MUV ADDITIONAL HOURS" },
    { srCode: "9009268", desc: "NON A/C BUS ADDITIONAL HOURS" },
    { srCode: "9009246", desc: "CARRIER ADDITIONAL HOURS" },
    { srCode: "9009289", desc: "50 SEATER BUS ADDITIONAL HOURS" }
  ];

  wdRowsDefinition.forEach(rowDef => {
    const { srCode, desc } = rowDef;
    const isAddlKms = desc.includes("ADDL") || desc.includes("ADDITIONAL RUNNING KMS");
    const isAddlHrs = desc.includes("ADDITIONAL HOURS") || desc.includes("ADDL SHIFT HOURS");
    
    let qty = 0;
    let lessKM = 0;
    let rate = 0;
    let amount = 0;
    let lessKMAmt = 0;
    let netAmount = 0;

    if (isAddlKms) {
      // Find excess KM based on target mapping
      if (srCode === "9009152") {
        if (desc.includes("8HRS")) {
          qty = wdPlusKM8;
        } else {
          qty = wdPlusKM24;
        }
      } else if (srCode === "9009196") {
        qty = (wdPlusKM["9009192"] || 0) + (wdPlusKM["9009187"] || 0);
      } else if (srCode === "9009264") {
        qty = (wdPlusKM["9009262"] || 0) + (wdPlusKM["9009260"] || 0);
      } else if (srCode === "9009242") {
        qty = wdPlusKM["9009233"] || 0;
      } else if (srCode === "9009285") {
        qty = wdPlusKM["9009282"] || 0;
      }
      
      rate = wdAddlKMRate;
      amount = qty * rate;
      netAmount = amount;
    } else if (isAddlHrs) {
      // Manual inputs needed, default to 0
      qty = 0;
      rate = 0;
      amount = 0;
      netAmount = 0;
    } else {
      // Main SR code
      qty = wdQty[srCode] || 0;
      lessKM = wdLessKM[srCode] || 0;
      rate = wdRate[srCode] || 0;
      amount = qty * rate;
      lessKMAmt = lessKM * wdAddlKMRate;
      netAmount = amount - lessKMAmt;
    }

    workDone.push({
      srCode,
      description: desc,
      qty: Number(qty.toFixed(2)),
      lessKM: Number(lessKM.toFixed(2)),
      rate: Number(rate.toFixed(2)),
      amount: Number(amount.toFixed(2)),
      lessKMAmount: Number(lessKMAmt.toFixed(2)),
      netAmount: Number(netAmount.toFixed(2))
    });
  });

  return { salaryFinal, bankTransfer, workDone };
}
