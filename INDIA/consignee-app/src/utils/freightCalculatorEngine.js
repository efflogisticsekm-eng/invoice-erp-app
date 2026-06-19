import * as XLSX from 'xlsx';

export function cleanString(val) {
    if (val === null || val === undefined || val === '') return "";
    let s = String(val).replace(/&amp;/g, '&')
                       .replace(/&lt;/g, '<')
                       .replace(/&gt;/g, '>')
                       .replace(/&quot;/g, '"')
                       .replace(/&#039;/g, "'");
    s = s.trim().toUpperCase();
    s = s.replace(/[^A-Z0-9\s]/g, ' ');
    s = s.replace(/\s+/g, ' ').trim();
    return s;
}

export function sequenceMatcherRatio(a, b) {
    const m = a.length;
    const n = b.length;
    if (m === 0 || n === 0) return 0.0;
    
    // DP to find Longest Common Subsequence (LCS)
    const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            if (a[i - 1] === b[j - 1]) {
                dp[i][j] = dp[i - 1][j - 1] + 1;
            } else {
                dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
            }
        }
    }
    const lcs = dp[m][n];
    return (2.0 * lcs) / (m + n);
}

export function fuzzyMatchRow(rateRows, colName, searchVal) {
    if (!rateRows || rateRows.length === 0 || !searchVal) return null;
    const searchValClean = cleanString(searchVal);
    const searchTokens = new Set(searchValClean.split(/\s+/));
    
    // 1. Exact Match
    for (const row of rateRows) {
        if (cleanString(row[colName]) === searchValClean) {
            return row;
        }
    }
    
    // 2. Substring Match
    let bestSubstringRow = null;
    let maxLen = -1;
    for (const row of rateRows) {
        const rowValClean = cleanString(row[colName]);
        if (rowValClean.includes(searchValClean) || searchValClean.includes(rowValClean)) {
            if (rowValClean.length > maxLen) {
                maxLen = rowValClean.length;
                bestSubstringRow = row;
            }
        }
    }
    if (bestSubstringRow) return bestSubstringRow;
    
    // 3. Fuzzy ratio match
    let bestRatio = 0;
    let bestRow = null;
    
    for (const row of rateRows) {
        const rowValClean = cleanString(row[colName]);
        const valTokens = new Set(rowValClean.split(/\s+/));
        if (valTokens.size === 0) continue;
        
        const seqRatio = sequenceMatcherRatio(searchValClean, rowValClean);
        
        // Overlap ratio
        let intersectionSize = 0;
        for (const t of searchTokens) {
            if (valTokens.has(t)) intersectionSize++;
        }
        const minLen = Math.min(searchTokens.size, valTokens.size);
        const overlapRatio = minLen > 0 ? intersectionSize / minLen : 0;
        
        let combined = Math.max(seqRatio, overlapRatio * 0.7 + seqRatio * 0.3);
        if (overlapRatio >= 0.6) {
            combined = Math.max(combined, 0.75 + overlapRatio * 0.1);
        }
        
        if (combined > bestRatio) {
            bestRatio = combined;
            bestRow = row;
        }
    }
    
    if (bestRatio >= 0.7) {
        return bestRow;
    }
    return null;
}

export function parseNumber(val) {
    if (val === null || val === undefined || val === '') return 0.0;
    const str = String(val).replace(/\u00A0/g, '').replace(/INR/g, '').replace(/,/g, '').trim();
    const num = parseFloat(str);
    return isNaN(num) ? 0.0 : num;
}

export function parseBoxesString(boxesStr) {
    if (!boxesStr || String(boxesStr).trim() === '' || String(boxesStr).toLowerCase() === 'nan') return [];
    const parts = String(boxesStr).split(/[,\n]+/);
    const parsed = [];
    
    for (let p of parts) {
        p = p.trim();
        if (!p) continue;
        
        const match = p.match(/^(\d+)\s*[xX\*]\s*(.+)$/);
        if (match) {
            const qty = parseFloat(match[1]);
            const btype = match[2].trim().toUpperCase();
            parsed.push({ qty, type: btype });
        } else {
            parsed.push({ qty: 1.0, type: p.toUpperCase() });
        }
    }
    return parsed;
}

export function findBoxRateColumn(boxType, rateColumns) {
    const boxClean = cleanString(boxType);
    
    for (const col of rateColumns) {
        const headerParts = col.split(',').map(p => cleanString(p));
        if (headerParts.includes(boxClean)) {
            return col;
        }
    }
    
    for (const col of rateColumns) {
        const colClean = cleanString(col);
        if (boxClean.includes(colClean) || colClean.includes(boxClean)) {
            return col;
        }
    }
    
    return null;
}

export function formatExcelDate(val) {
    if (val === null || val === undefined || val === '') return '';
    if (typeof val === 'string') {
        if (/^\d{2}\/\d{2}\/\d{4}$/.test(val)) return val;
        const parsed = Date.parse(val);
        if (!isNaN(parsed)) {
            const d = new Date(parsed);
            return formatDateObj(d);
        }
        return val;
    }
    if (val instanceof Date) {
        return formatDateObj(val);
    }
    if (typeof val === 'number') {
        const date = XLSX.SSF.parse_date_code(val);
        if (date) {
            const d = String(date.d).padStart(2, '0');
            const m = String(date.m).padStart(2, '0');
            const y = date.y;
            return `${d}/${m}/${y}`;
        }
    }
    return String(val);
}

function formatDateObj(d) {
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
}

export function parseHtmlExcelSheet(sheet, sheetName) {
    const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    if (rawRows.length === 0) return [];
    
    let headerIdx = -1;
    for (let i = 0; i < Math.min(100, rawRows.length); i++) {
        const row = rawRows[i];
        if (Array.isArray(row)) {
            const rowUpper = Array.from(row).map(cell => String(cell ?? '').trim().toUpperCase());
            if (rowUpper.includes('LR NO')) {
                headerIdx = i;
                break;
            }
        }
    }
    
    if (headerIdx === -1) return [];
    
    const headers = Array.from(rawRows[headerIdx] || []).map(cell => String(cell ?? '').trim().toUpperCase());
    const dataRows = rawRows.slice(headerIdx + 1);
    
    const getColIdx = (name) => headers.findIndex(h => h.includes(name));
    const getExactColIdx = (name) => headers.findIndex(h => h === name);
    
    const dateIdx = headers.findIndex(h => h.includes('DATE'));
    const lrIdx = getExactColIdx('LR NO');
    const consigneeIdx = getExactColIdx('CONSIGNEE');
    const consigneeCodeIdx = getExactColIdx('CONSIGNEE CODE');
    const destinationIdx = getExactColIdx('DESTINATION');
    const invoiceNoIdx = getExactColIdx('INVOICE NO');
    const weightIdx = getExactColIdx('WEIGHT');
    const boxQtyIdx = headers.findIndex(h => h === 'BOX COUNT' || h === 'BOX QTY');
    const paymentTypeIdx = getExactColIdx('PAYMENT TYPE');
    const totalFreightIdx = headers.findIndex(h => h === 'TOTAL' || h === 'TOTAL FRIGHT' || h === 'FRIGHT');
    const boxesIdx = getExactColIdx('BOXES');
    
    const result = [];
    for (let i = 0; i < dataRows.length; i++) {
        const row = dataRows[i];
        if (!row || row.length === 0) continue;
        
        const lrNo = lrIdx !== -1 ? String(row[lrIdx] ?? '').trim() : '';
        
        const item = {
            CONSIGNOR: sheetName,
            DATE: dateIdx !== -1 ? formatExcelDate(row[dateIdx]) : '',
            'LR NO': lrNo,
            CONSIGNEE: consigneeIdx !== -1 ? String(row[consigneeIdx] ?? '').trim() : '',
            'CONSIGNEE CODE': consigneeCodeIdx !== -1 ? String(row[consigneeCodeIdx] ?? '').trim() : '',
            DESTINATION: destinationIdx !== -1 ? String(row[destinationIdx] ?? '').trim() : '',
            'INVOICE NO': invoiceNoIdx !== -1 ? String(row[invoiceNoIdx] ?? '').trim() : '',
            WEIGHT: weightIdx !== -1 ? parseNumber(row[weightIdx]) : 0.0,
            'BOX QTY': boxQtyIdx !== -1 ? parseNumber(row[boxQtyIdx]) : 0,
            'PAYMENT TYPE': paymentTypeIdx !== -1 ? String(row[paymentTypeIdx] ?? '').trim() : '',
            'TOTAL FRIGHT': totalFreightIdx !== -1 ? parseNumber(row[totalFreightIdx]) : 0.0,
            'BOXES STR': boxesIdx !== -1 ? String(row[boxesIdx] ?? '').trim() : '',
            _rawIdx: i
        };
        result.push(item);
    }
    
    // Multi-row boxes aggregation
    let currentLr = null;
    const lrFilled = result.map(item => {
        const lr = item['LR NO'];
        if (lr && lr !== 'nan' && lr !== 'None' && lr.trim() !== '') {
            currentLr = lr;
        }
        return currentLr;
    });
    
    const boxesAgg = {};
    for (let i = 0; i < result.length; i++) {
        const lr = lrFilled[i];
        if (lr) {
            boxesAgg[lr] = (boxesAgg[lr] || '') + (result[i]['BOXES STR'] || '');
        }
    }
    
    let filtered = result.filter(item => {
        const lr = item['LR NO'];
        return lr && lr !== 'nan' && lr !== 'None' && lr.trim() !== '';
    });
    
    filtered.forEach(item => {
        const lr = item['LR NO'];
        item['BOXES STR'] = boxesAgg[lr] || item['BOXES STR'];
    });
    
    const badLrWords = ['TAX', 'TOTAL', 'GRAND', 'SL NO', 'LR NO'];
    filtered = filtered.filter(item => {
        const lrClean = item['LR NO'].toUpperCase();
        if (badLrWords.some(bad => lrClean.includes(bad))) return false;
        if (['0', 'NAN', 'NONE', ''].includes(lrClean)) return false;
        if (lrClean.length < 3 || lrClean.trim() === '') return false;
        return true;
    });
    
    // Filter out rows containing 'INR' in any column
    filtered = filtered.filter(item => {
        for (const key in item) {
            if (key === '_rawIdx') continue;
            if (String(item[key]).toUpperCase().includes('INR')) {
                return false;
            }
        }
        return true;
    });
    
    return filtered;
}

export function processFreightData(workbookLr, workbookRates) {
    const lrSheets = workbookLr.SheetNames;
    const rateSheets = workbookRates.SheetNames;
    
    // 1. Cancelled LRs
    const cancelledLrs = new Set();
    let dfWhole = [];
    const wholeSheetName = lrSheets.find(s => s.trim().toLowerCase() === 'whole lr nos');
    if (wholeSheetName) {
        const rawWhole = XLSX.utils.sheet_to_json(workbookLr.Sheets[wholeSheetName]);
        dfWhole = rawWhole.map(r => {
            const newRow = {};
            for (const k in r) {
                newRow[String(k).trim().toUpperCase()] = r[k];
            }
            return newRow;
        });
        
        dfWhole.forEach(r => {
            const status = String(r['LR STATUS'] || '').trim().toUpperCase();
            const lr = String(r['LR NO'] || '').trim().toUpperCase();
            if (status === 'DESPATCHED FROM BRANCH' && lr) {
                cancelledLrs.add(lr);
            }
        });
    }
    
    const validWhole = dfWhole.filter(r => String(r['LR STATUS'] || '').trim().toUpperCase() !== 'DESPATCHED FROM BRANCH');
    
    // 2. Manual Rates
    const manualRates = {};
    const manualSheetName = lrSheets.find(s => s.trim().toLowerCase() === 'manual rate added lrs');
    if (manualSheetName) {
        try {
            const rawManual = XLSX.utils.sheet_to_json(workbookLr.Sheets[manualSheetName]);
            rawManual.forEach(r => {
                const lrNoKey = Object.keys(r).find(k => k.trim().toUpperCase() === 'LR NO');
                const amountKey = Object.keys(r).find(k => k.trim().toUpperCase() === 'FREIGHT AMOUNT');
                if (lrNoKey && amountKey && r[lrNoKey] !== undefined && r[amountKey] !== undefined) {
                    const lrNo = String(r[lrNoKey]).trim().toUpperCase();
                    const amount = parseFloat(r[amountKey]);
                    if (lrNo && !isNaN(amount)) {
                        manualRates[lrNo] = amount;
                    }
                }
            });
        } catch (err) {
            console.error("Error parsing manual rates sheet:", err);
        }
    }
    
    // 3. Combined LR data
    const combinedDfs = [];
    for (const s of lrSheets) {
        const sLower = s.trim().toLowerCase();
        if (sLower === 'whole lr nos' || sLower === 'manual rate added lrs') continue;
        try {
            const parsed = parseHtmlExcelSheet(workbookLr.Sheets[s], s);
            if (parsed.length > 0) {
                combinedDfs.push(...parsed);
            }
        } catch (err) {
            console.error(`Error parsing sheet ${s}:`, err);
        }
    }
    
    if (combinedDfs.length === 0) {
        throw new Error("Could not extract any valid LR data from individual sheets.");
    }
    
    let dfLr = combinedDfs;
    
    // Remove cancelled LRs from main list
    dfLr = dfLr.filter(item => {
        const lrUpper = String(item['LR NO']).trim().toUpperCase();
        return !cancelledLrs.has(lrUpper);
    });
    
    // 4. Cache Master Rates
    const ratesCache = {};
    for (const s of rateSheets) {
        const ws = workbookRates.Sheets[s];
        const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
        const normalizedRows = rows.map(r => {
            const newRow = {};
            for (const k in r) {
                newRow[String(k).trim()] = r[k];
            }
            return newRow;
        });
        ratesCache[s] = normalizedRows;
    }
    
    const consignorSheetMap = {};
    for (const s of rateSheets) {
        consignorSheetMap[cleanString(s)] = s;
    }
    
    // Initialize results fields
    dfLr.forEach(row => {
        row['Calculated Amount'] = 0.0;
        row['Calculated Min LR Amount'] = 0.0;
        row['Calculated Stationary Charge'] = 0.0;
        row['Calculated Unloading Charge'] = 0.0;
        row['Master Rate'] = "";
        row['Remarks'] = "";
        row['Finded Reason'] = "";
        row['Discrepancy Status'] = "Match";
        row['Existing ERP Total'] = row['TOTAL FRIGHT'] || 0.0;
        
        row['Account Pay'] = 0.0;
        row['To Pay'] = 0.0;
        row['Paid'] = 0.0;
    });
    
    // Calculate row by row
    dfLr.forEach(row => {
        const lrNoUpper = String(row['LR NO'] || '').trim().toUpperCase();
        const ptype = String(row['PAYMENT TYPE'] || '').trim().toUpperCase();
        
        // Manual rate check
        if (lrNoUpper in manualRates) {
            const manualFreight = manualRates[lrNoUpper];
            row['Finded Reason'] = 'Manual Rate Added Lr';
            row['Calculated Amount'] = NaN;
            row['Calculated Min LR Amount'] = NaN;
            row['Calculated Stationary Charge'] = NaN;
            row['Calculated Unloading Charge'] = NaN;
            
            if (ptype.includes('ACCOUNT')) {
                row['Account Pay'] = manualFreight;
            } else if (ptype.includes('TO PAY')) {
                row['To Pay'] = manualFreight;
            } else {
                row['Paid'] = manualFreight;
            }
            return;
        }
        
        const consignor = cleanString(row['CONSIGNOR']);
        const consignee = cleanString(row['CONSIGNEE']);
        const destination = cleanString(row['DESTINATION']);
        const weight = parseFloat(row['WEIGHT']) || 0.0;
        const boxQtyTotal = parseFloat(row['BOX QTY']) || 0.0;
        const boxesStr = row['BOXES STR'];
        
        if (cancelledLrs.has(lrNoUpper)) {
            row['Remarks'] = "Cancelled LR";
            row['Discrepancy Status'] = "Cancelled";
            return;
        }
        
        // Consignor sheet matching
        const consignorNoSpace = consignor.replace(/\s/g, '');
        let matchedSheet = null;
        for (const key of Object.keys(consignorSheetMap)) {
            const keyNoSpace = key.replace(/\s/g, '');
            if (keyNoSpace.includes(consignorNoSpace) || consignorNoSpace.includes(keyNoSpace)) {
                matchedSheet = consignorSheetMap[key];
                break;
            }
        }
        
        if (!matchedSheet) {
            row['Remarks'] = "Rate sheet not found for Consignor";
            row['Discrepancy Status'] = "Error";
            return;
        }
        
        const rateRows = ratesCache[matchedSheet];
        if (!rateRows || rateRows.length === 0) {
            row['Remarks'] = "Rate sheet is empty";
            row['Discrepancy Status'] = "Error";
            return;
        }
        
        let calculatedAmount = 0.0;
        let minLr = 0.0;
        let stationery = 0.0;
        let unloading = 0.0;
        let calcRemarks = [];
        let hasError = false;
        
        const colNames = Object.keys(rateRows[0]);
        const destCol = colNames.find(c => c.toUpperCase().includes('DESTINATION'));
        const consCol = colNames.find(c => c.toUpperCase().includes('CONSIGNEE') && !c.toUpperCase().includes('CODE'));
        const codeCol = colNames.find(c => c.toUpperCase().includes('CONSIGNEE CODE'));
        
        if (consignor.includes('UNIVERSAL')) {
            // Universal fallback
            row['Remarks'] = "Universal consignor billing fallback";
        }
        
        let matchedRow = null;
        if (consignor.includes('UNIVERSAL')) {
            matchedRow = rateRows[0];
        } else if (codeCol && row['CONSIGNEE CODE'] && String(row['CONSIGNEE CODE']).trim()) {
            const targetCode = String(row['CONSIGNEE CODE']).trim().replace(/\.0$/, '');
            matchedRow = rateRows.find(r => {
                const codeVal = String(r[codeCol] || '').replace(/\.0$/, '').trim();
                return codeVal === targetCode;
            });
            if (!matchedRow) {
                row['Remarks'] = `Consignee Code '${targetCode}' not found in rate sheet`;
                hasError = true;
            }
        } else if (destCol) {
            matchedRow = fuzzyMatchRow(rateRows, destCol, row['DESTINATION']);
            if (!matchedRow) {
                const allDestRow = rateRows.find(r => String(r[destCol] || '').toUpperCase().includes('ALL DEST'));
                if (allDestRow) {
                    matchedRow = allDestRow;
                } else {
                    row['Remarks'] = `Destination '${row['DESTINATION']}' not found in rate sheet`;
                    hasError = true;
                }
            }
        } else if (consCol) {
            matchedRow = fuzzyMatchRow(rateRows, consCol, row['CONSIGNEE']);
            if (!matchedRow) {
                const allConsRow = rateRows.find(r => String(r[consCol] || '').toUpperCase().includes('ALL CONS'));
                if (allConsRow) {
                    matchedRow = allConsRow;
                } else {
                    row['Remarks'] = `Consignee '${row['CONSIGNEE']}' not found in rate sheet`;
                    hasError = true;
                }
            }
        } else {
            matchedRow = rateRows[0];
        }
        
        if (hasError || !matchedRow) {
            row['Discrepancy Status'] = "Error";
            return;
        }
        
        const mRow = matchedRow;
        const kgCol = colNames.find(c => c.toUpperCase().includes('KILOGRAM') || c.toUpperCase().includes('KG'));
        const excludeCols = [
            destCol, consCol, codeCol, 
            '__clean_dest', '__clean_cons', '__clean_col', '__clean_code',
            'Min lr amount', 'Stationary Charge', 'UL Charge', 'U/L Charge',
            'Consignor ', 'Consignor'
        ].map(c => c ? c.toUpperCase() : '');
        
        let availRateCols = colNames.filter(c => {
            if (!c || c.includes('Unnamed')) return false;
            const cUpper = c.toUpperCase();
            if (excludeCols.includes(cUpper)) return false;
            if (kgCol && cUpper === kgCol.toUpperCase()) return false;
            return true;
        });
        
        const boxesParsed = parseBoxesString(boxesStr);
        let billedByBox = false;
        
        // 1. Try to bill by box types FIRST
        if (boxesParsed.length > 0 && availRateCols.length > 0) {
            const anyMatch = boxesParsed.some(b => findBoxRateColumn(b.type, availRateCols) !== null);
            if (anyMatch) {
                billedByBox = true;
                for (const b of boxesParsed) {
                    const bType = b.type;
                    const bQty = b.qty;
                    
                    if (bType.includes('KILOGRAM') || bType.includes('KG')) {
                        if (kgCol && weight > 0) {
                            const kgRate = parseNumber(mRow[kgCol]);
                            if (mRow[kgCol] !== "" && !isNaN(kgRate)) {
                                const kgTotal = weight * kgRate;
                                calculatedAmount += kgTotal;
                                calcRemarks.push(`Kilogram (${weight}kg) X Rate (${kgRate}) = ${kgTotal}`);
                                row['Master Rate'] = String(kgRate);
                            } else {
                                calcRemarks.push("RATE NOT ADDED IN MASTER for KILOGRAM");
                                hasError = true;
                            }
                        } else {
                            calcRemarks.push("WEIGHT NOT ADDED IN LR");
                            hasError = true;
                        }
                        continue;
                    }
                    
                    const matchedCol = findBoxRateColumn(bType, availRateCols);
                    if (matchedCol) {
                        const bRate = parseNumber(mRow[matchedCol]);
                        if (mRow[matchedCol] !== "" && !isNaN(bRate)) {
                            const bTotal = bQty * bRate;
                            calculatedAmount += bTotal;
                            calcRemarks.push(`(${bQty} x ${bType}) X Box Rate (${bRate}) = ${bTotal}`);
                            const currRate = row['Master Rate'] || "";
                            row['Master Rate'] = currRate ? `${currRate}${bRate},` : String(bRate);
                        } else {
                            calcRemarks.push(`RATE NOT ADDED IN MASTER for ${bType}`);
                            hasError = true;
                        }
                    } else {
                        // General fallback
                        if (availRateCols.length === 1) {
                            const bRate = parseNumber(mRow[availRateCols[0]]);
                            if (mRow[availRateCols[0]] !== "" && !isNaN(bRate)) {
                                const bTotal = bQty * bRate;
                                calculatedAmount += bTotal;
                                calcRemarks.push(`(${bQty} x ${bType}) X Fallback Rate (${bRate}) = ${bTotal}`);
                                const currRate = row['Master Rate'] || "";
                                row['Master Rate'] = currRate ? `${currRate}${bRate},` : String(bRate);
                            } else {
                                calcRemarks.push(`RATE NOT ADDED IN MASTER for ${bType}`);
                                hasError = true;
                            }
                        } else {
                            calcRemarks.push(`RATE NOT ADDED IN MASTER for ${bType}`);
                            hasError = true;
                        }
                    }
                }
            }
        }
        
        // 2. Fallback to KG or Box Qty
        if (!billedByBox) {
            if (kgCol && weight > 0) {
                const rateVal = parseNumber(mRow[kgCol]);
                if (mRow[kgCol] !== "" && !isNaN(rateVal)) {
                    calculatedAmount = weight * rateVal;
                    calcRemarks.push(`Kilogram (${weight}kg) X Rate (${rateVal}) = ${calculatedAmount}`);
                    row['Master Rate'] = String(rateVal);
                } else {
                    calcRemarks.push("RATE NOT ADDED IN MASTER");
                    hasError = true;
                }
            } else if (boxesParsed.length === 0 && boxQtyTotal > 0 && availRateCols.length > 0) {
                const boxRate = parseNumber(mRow[availRateCols[0]]);
                if (mRow[availRateCols[0]] !== "" && !isNaN(boxRate)) {
                    calculatedAmount = boxQtyTotal * boxRate;
                    calcRemarks.push(`Box Qty (${boxQtyTotal}) X Rate (${boxRate}) = ${calculatedAmount}`);
                    row['Master Rate'] = String(boxRate);
                } else {
                    calcRemarks.push("RATE NOT ADDED IN MASTER");
                    hasError = true;
                }
            } else {
                if (kgCol && weight <= 0) {
                    const rateVal = parseNumber(mRow[kgCol]);
                    if (mRow[kgCol] !== "" && !isNaN(rateVal)) {
                        row['Master Rate'] = String(rateVal);
                    }
                    calcRemarks.push("WEIGHT NOT ADDED IN LR");
                    hasError = true;
                } else {
                    calcRemarks.push("NO MATCHING BOX TYPES OR KG FOUND");
                    hasError = true;
                }
            }
        }
        
        const minLrCol = colNames.find(c => c.toUpperCase() === 'MIN LR AMOUNT');
        if (minLrCol) minLr = parseNumber(mRow[minLrCol]);
        
        const stationaryCol = colNames.find(c => c.toUpperCase() === 'STATIONARY CHARGE');
        if (stationaryCol) stationery = parseNumber(mRow[stationaryCol]);
        
        const ulCol = colNames.find(c => c.toUpperCase() === 'U/L CHARGE' || c.toUpperCase() === 'UL CHARGE');
        if (ulCol) {
            const ulRate = parseNumber(mRow[ulCol]);
            if (mRow[ulCol] !== "" && !isNaN(ulRate)) {
                unloading = ulRate * boxQtyTotal;
            }
        }
        
        row['Calculated Amount'] = calculatedAmount;
        row['Calculated Min LR Amount'] = minLr;
        row['Calculated Stationary Charge'] = stationery;
        row['Calculated Unloading Charge'] = unloading;
        row['Remarks'] = calcRemarks.join(" | ");
        if (hasError) {
            row['Discrepancy Status'] = "Error";
        }
    });
    
    // Group and apply Min LR split
    const groupMap = {};
    dfLr.forEach(row => {
        if (row['Discrepancy Status'] === 'Error' || row['Discrepancy Status'] === 'Cancelled') return;
        const key = `${row['CONSIGNOR']}|${row['CONSIGNEE']}|${row['DATE']}`;
        if (!groupMap[key]) {
            groupMap[key] = {
                rows: [],
                totalCalc: 0.0,
                maxMinLr: 0.0
            };
        }
        groupMap[key].rows.push(row);
        groupMap[key].totalCalc += row['Calculated Amount'] || 0.0;
        groupMap[key].maxMinLr = Math.max(groupMap[key].maxMinLr, row['Calculated Min LR Amount'] || 0.0);
    });
    
    Object.keys(groupMap).forEach(key => {
        const group = groupMap[key];
        if (group.totalCalc < group.maxMinLr && group.maxMinLr > 0) {
            const count = group.rows.length;
            const splitMin = group.maxMinLr / count;
            group.rows.forEach(row => {
                row['Calculated Amount'] = splitMin;
                const currentRemarks = row['Remarks'] || "";
                row['Remarks'] = currentRemarks ? `${currentRemarks} | [Min LR Applied: ${group.maxMinLr} / ${count}]` : `[Min LR Applied: ${group.maxMinLr} / ${count}]`;
            });
        }
    });
    
    // Final bucket calculations and discrepancies
    dfLr.forEach(row => {
        if (row['Remarks'] === 'Cancelled LR' || row['Discrepancy Status'] === 'Cancelled') {
            row['Discrepancy Status'] = 'Cancelled';
            return;
        }
        
        if (row['Finded Reason'] === 'Manual Rate Added Lr') {
            const manualAmount = row['Account Pay'] || row['To Pay'] || row['Paid'] || 0.0;
            row['Grand Total with UL'] = manualAmount;
            const erpTotal = row['Existing ERP Total'] || 0.0;
            row['Amount Difference'] = erpTotal - manualAmount;
            row['Discrepancy Status'] = Math.abs(erpTotal - manualAmount) <= 1.0 ? "Match" : "Mismatch";
            return;
        }
        
        const calcAmount = row['Calculated Amount'] || 0.0;
        const stationery = row['Calculated Stationary Charge'] || 0.0;
        const unloading = row['Calculated Unloading Charge'] || 0.0;
        
        const calcTotalFreight = calcAmount + stationery;
        const grandTotal = calcTotalFreight + unloading;
        const erpTotal = row['Existing ERP Total'] || 0.0;
        
        row['Calculated Total Freight'] = calcTotalFreight;
        row['Grand Total with UL'] = grandTotal;
        
        const ptype = String(row['PAYMENT TYPE'] || '').trim().toUpperCase();
        if (ptype.includes('ACCOUNT')) {
            row['Account Pay'] = grandTotal;
        } else if (ptype.includes('TO PAY')) {
            row['To Pay'] = grandTotal;
        } else {
            row['Paid'] = grandTotal;
        }
        
        const diffGrand = erpTotal - grandTotal;
        const diffBase = erpTotal - calcTotalFreight;
        
        if (row['Discrepancy Status'] !== 'Error') {
            row['Amount Difference'] = diffGrand;
            if (Math.abs(diffGrand) <= 1.0) {
                row['Discrepancy Status'] = "Match";
            } else {
                row['Discrepancy Status'] = "Mismatch";
            }
        }
        
        let reason = row['Finded Reason'] || "";
        if (row['Discrepancy Status'] === "Mismatch") {
            const boxQty = parseFloat(row['BOX QTY']) || 0;
            const boxesStrClean = String(row['BOXES STR'] || '').trim().toLowerCase();
            
            if (boxQty === 0) {
                reason = "Box Qty not added in Lr Data";
            } else if (!boxesStrClean || boxesStrClean === "nan" || boxesStrClean === "none") {
                reason = "Not selected Box type";
            } else if (row['Calculated Amount'] === 0) {
                reason = "Rate not added in master";
            } else {
                if (Math.abs(diffBase) <= 1.0 && unloading > 0) {
                    reason = "may be the reason is U/L Charge not added in Existing ERP";
                } else if (Math.abs(erpTotal - (grandTotal - stationery)) <= 1.0 && stationery > 0) {
                    reason = "may be the reason is Stationary Charge not added in Existing ERP";
                } else if (Math.abs(erpTotal - (calcTotalFreight - stationery)) <= 1.0 && unloading > 0 && stationery > 0) {
                    reason = "may be the reason is U/L and Stationary Charge not added in Existing ERP";
                }
            }
        }
        row['Finded Reason'] = reason;
    });
    
    // Sort columns as required
    const colsOrder = [
        'DATE', 'LR NO', 'CONSIGNOR', 'CONSIGNEE', 'DESTINATION', 'INVOICE NO', 
        'WEIGHT', 'BOXES STR', 'BOX QTY', 'PAYMENT TYPE', 'Master Rate', 
        'Existing ERP Total', 'Calculated Total Freight', 'Account Pay', 'To Pay', 'Paid', 
        'Calculated Stationary Charge', 'Calculated Unloading Charge', 'Grand Total with UL', 
        'Amount Difference', 'Discrepancy Status', 'Finded Reason', 'Remarks'
    ];
    
    const formattedDfLr = dfLr.map(row => {
        const item = {};
        colsOrder.forEach(col => {
            if (row[col] !== undefined) {
                item[col] = row[col];
            } else {
                item[col] = "";
            }
        });
        return item;
    });
    
    // 5. Consignors summary sheet
    const summaryData = [];
    const excludedConsignors = ['EFF EKM', 'EFF KLM', 'EFF MPM', 'EFF CLT', 'EFF KNR', 'EFF KSD'].map(c => c.toUpperCase());
    const consignorList = [];
    
    if (validWhole.length > 0) {
        const consignorCounts = {};
        validWhole.forEach(r => {
            const cons = String(r['CONSIGNOR'] || '').trim();
            if (cons) {
                consignorCounts[cons] = (consignorCounts[cons] || 0) + 1;
            }
        });
        
        const sortedCons = Object.keys(consignorCounts).sort((a, b) => consignorCounts[b] - consignorCounts[a]);
        sortedCons.forEach(cons => {
            if (!excludedConsignors.includes(cons.toUpperCase())) {
                consignorList.push({ cons, count: consignorCounts[cons] });
            }
        });
    } else {
        const consignorCounts = {};
        dfLr.forEach(row => {
            const cons = String(row['CONSIGNOR'] || '').trim();
            if (cons) {
                consignorCounts[cons] = (consignorCounts[cons] || 0) + 1;
            }
        });
        const sortedCons = Object.keys(consignorCounts).sort((a, b) => consignorCounts[b] - consignorCounts[a]);
        sortedCons.forEach(cons => {
            if (!excludedConsignors.includes(cons.toUpperCase())) {
                consignorList.push({ cons, count: consignorCounts[cons] });
            }
        });
    }
    
    consignorList.forEach(({ cons, count: lrCount }) => {
        const consClean = cons.toUpperCase().replace(/\s/g, '');
        const group = formattedDfLr.filter(row => {
            const rCons = String(row['CONSIGNOR'] || '').trim().toUpperCase().replace(/\s/g, '');
            return rCons.includes(consClean) || consClean.includes(rCons);
        });
        
        let periodStr = "";
        const parseDateForMinMax = (dateVal) => {
            if (!dateVal) return null;
            if (dateVal instanceof Date) return dateVal;
            const dateStr = String(dateVal).trim();
            const pts = dateStr.split('/');
            if (pts.length === 3) {
                return new Date(parseInt(pts[2], 10), parseInt(pts[1], 10) - 1, parseInt(pts[0], 10));
            }
            const parsed = Date.parse(dateStr);
            return isNaN(parsed) ? null : new Date(parsed);
        };
        
        if (group.length > 0) {
            const validDates = group
                .map(r => r['DATE'])
                .filter(Boolean)
                .map(parseDateForMinMax)
                .filter(Boolean);
            
            if (validDates.length > 0) {
                const minDate = new Date(Math.min(...validDates));
                const maxDate = new Date(Math.max(...validDates));
                const minDateStr = formatDateObj(minDate);
                const maxDateStr = formatDateObj(maxDate);
                periodStr = minDateStr === maxDateStr ? minDateStr : `${minDateStr} to ${maxDateStr}`;
            }
        } else if (validWhole.length > 0) {
            const consDates = validWhole.filter(r => String(r['CONSIGNOR'] || '').trim() === cons);
            if (consDates.length > 0) {
                const validDates = consDates
                    .map(r => r['DATE'])
                    .filter(Boolean)
                    .map(parseDateForMinMax)
                    .filter(Boolean);
                
                if (validDates.length > 0) {
                    const minDate = new Date(Math.min(...validDates));
                    const maxDate = new Date(Math.max(...validDates));
                    const minDateStr = formatDateObj(minDate);
                    const maxDateStr = formatDateObj(maxDate);
                    periodStr = minDateStr === maxDateStr ? minDateStr : `${minDateStr} to ${maxDateStr}`;
                }
            }
        }
        
        const sumField = (fieldName) => {
            let total = 0;
            group.forEach(r => {
                const v = parseFloat(r[fieldName]);
                if (!isNaN(v)) total += v;
            });
            return total;
        };
        
        if (group.length === 0) {
            summaryData.push({
                'PERIOD': periodStr,
                'CONSIGNOR': cons,
                'TOTAL LR COUNT': lrCount,
                'TOTAL WEIGHT': "",
                'TOTAL BOX QTY': "",
                'Existing ERP Total': "",
                'Account Pay': "",
                'To Pay': "",
                'Paid': "",
                'Calculated Stationary Charge': "",
                'Calculated Unloading Charge': "",
                'Grand Total with UL': "",
                'Amount Difference': ""
            });
        } else {
            summaryData.push({
                'PERIOD': periodStr,
                'CONSIGNOR': cons,
                'TOTAL LR COUNT': lrCount,
                'TOTAL WEIGHT': sumField('WEIGHT'),
                'TOTAL BOX QTY': sumField('BOX QTY'),
                'Existing ERP Total': sumField('Existing ERP Total'),
                'Account Pay': sumField('Account Pay'),
                'To Pay': sumField('To Pay'),
                'Paid': sumField('Paid'),
                'Calculated Stationary Charge': sumField('Calculated Stationary Charge'),
                'Calculated Unloading Charge': sumField('Calculated Unloading Charge'),
                'Grand Total with UL': sumField('Grand Total with UL'),
                'Amount Difference': sumField('Amount Difference')
            });
        }
    });
    
    if (summaryData.length > 0) {
        const numCols = [
            'TOTAL LR COUNT', 'TOTAL WEIGHT', 'TOTAL BOX QTY', 'Existing ERP Total', 
            'Account Pay', 'To Pay', 'Paid', 'Calculated Stationary Charge', 
            'Calculated Unloading Charge', 'Grand Total with UL', 'Amount Difference'
        ];
        
        const totalRow = {
            'PERIOD': '',
            'CONSIGNOR': 'GRAND TOTAL'
        };
        
        numCols.forEach(col => {
            let total = 0;
            summaryData.forEach(r => {
                const val = parseFloat(r[col]);
                if (!isNaN(val)) total += val;
            });
            totalRow[col] = total;
        });
        
        summaryData.push(totalRow);
    }
    
    // Summary counts
    const summaryStats = {
        total_processed: formattedDfLr.length,
        matches: formattedDfLr.filter(r => r['Discrepancy Status'] === 'Match').length,
        discrepancies: formattedDfLr.filter(r => r['Discrepancy Status'] === 'Mismatch').length,
        errors: formattedDfLr.filter(r => r['Discrepancy Status'] === 'Error').length,
        cancelled: cancelledLrs.size
    };
    
    return {
        dfLr: formattedDfLr,
        summaryStats,
        consignorsData: summaryData
    };
}
