/**
 * Normalize strings for consistent comparison (case-insensitive, trimmed, and single-spaced).
 */
export const normalizeString = (str) => {
  if (str === null || str === undefined) return '';
  return String(str)
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
};

/**
 * Normalizes staff names to keep casing but remove extra spaces.
 */
export const cleanStaffName = (name) => {
  if (!name) return '';
  return String(name).trim().replace(/\s+/g, ' ');
};

/**
 * Searches row keys for one that matches options.
 */
export const findKey = (row, possibilities) => {
  const normalizedPossibilities = possibilities.map(p => p.toUpperCase().replace(/\s+/g, ''));
  for (const key of Object.keys(row)) {
    const normKey = key.toUpperCase().replace(/\s+/g, '');
    if (normalizedPossibilities.includes(normKey)) {
      return key;
    }
  }
  return null;
};

/**
 * Check if a staff name is in the excluded list.
 */
export const isNameExcluded = (name, excludedSet) => {
  if (!name) return true;
  const clean = name.trim().toLowerCase();
  return excludedSet.has(clean);
};

/**
 * Default rules structure.
 */
export const DEFAULT_RULES = [
  { role: 'COLLECTION  DRIVER', portion: 0.5, percentage: 0.02 },
  { role: 'COLLECTION  ATTN', portion: 0.5, percentage: 0.015 },
  { role: 'TO BRANCH DRIVER', portion: 0.5, percentage: 0.065 },
  { role: 'TO BRANCH ATTENTER', portion: 0.5, percentage: 0.04 },
  { role: 'TO DELIVERY DRIVER', portion: 0.5, percentage: 0.065 },
  { role: 'TO DELIVERY ATTENDER', portion: 0.5, percentage: 0.04 }
];

/**
 * Default excluded names.
 */
export const DEFAULT_EXCLUDED_NAMES = new Set([
  '',
  '0',
  '#n/a',
  'admin',
  'driver',
  'attenter',
  'delivery driver',
  'attn',
  'attender',
  '-',
  'null',
  'undefined'
]);

/**
 * Calculate staff incentives for the given data and rules.
 * 
 * @param {Array} rawData - Array of parsed objects from the sheet.
 * @param {Array} rules - Active rules with portion and percentage.
 * @param {Set} excludedSet - Set of lowercase excluded staff names.
 * @returns {Object} { summary, details, stats, errors }
 */
export const calculateIncentives = (rawData, rules, excludedSet) => {
  if (!rawData || rawData.length === 0) {
    return { summary: [], details: [], stats: {}, errors: [] };
  }

  // Find column keys
  const firstRow = rawData[0];
  const freightKey = findKey(firstRow, ['Fright Amt', 'Freight Amt', 'Freight Amount', 'Freight', 'Amt', 'Freight Value']) || 'Fright Amt';
  const dateKey = findKey(firstRow, ['LR DATE', 'Date', 'LRDate', 'LR_DATE']) || 'LR DATE';
  const lrNumberKey = findKey(firstRow, ['LR NUMBER', 'LR NO', 'LR Number', 'LRNo', 'LR_NUMBER']) || 'LR NUMBER';
  const consignorKey = findKey(firstRow, ['CONSIGNOR', 'Consignor Name', 'ConsignorName']) || 'CONSIGNOR';
  const consigneeKey = findKey(firstRow, ['CONSIGNEE', 'Consignee Name', 'ConsigneeName']) || 'CONSIGNEE';

  // Map rules to column keys in the row
  const roleKeys = {};
  rules.forEach(rule => {
    const normRule = normalizeString(rule.role);
    const matchedKey = Object.keys(firstRow).find(key => normalizeString(key) === normRule);
    roleKeys[rule.role] = matchedKey || rule.role;
  });

  const staffMap = {};
  const details = [];
  const errors = [];

  let totalFreight = 0;
  let totalIncentives = 0;
  let totalLrsCount = 0;

  rawData.forEach((row, idx) => {
    // 1. Skip header/subheader duplication rows
    const lrNo = String(row[lrNumberKey] || '').trim();
    const rawFreightVal = row[freightKey];

    if (!lrNo || lrNo === 'LR NUMBER' || String(rawFreightVal).trim().toUpperCase() === 'FRIGHT AMT' || String(rawFreightVal).trim().toUpperCase() === 'FREIGHT') {
      return; // Skip duplicated headers
    }

    // 2. Parse freight
    let freight = parseFloat(rawFreightVal);
    if (isNaN(freight) || String(rawFreightVal).trim().toLowerCase() === 'nan') {
      return; // Skip invalid numeric rows
    }

    totalLrsCount++;
    totalFreight += freight;

    // Detect high value anomalies
    if (freight > 50000) {
      errors.push({
        rowIdx: idx,
        lrNumber: lrNo,
        date: row[dateKey],
        consignor: row[consignorKey],
        consignee: row[consigneeKey],
        freight: freight,
        rowOriginal: row
      });
    }

    const calculatedRow = {
      date: row[dateKey],
      lrNumber: lrNo,
      consignor: row[consignorKey],
      consignee: row[consigneeKey],
      freight: freight,
    };

    // Keep track of original staff names for this row
    rules.forEach(rule => {
      const colKey = roleKeys[rule.role];
      calculatedRow[rule.role] = row[colKey] || '';
    });

    let rowTotalInc = 0;

    // 3. Process each role
    rules.forEach(rule => {
      const colKey = roleKeys[rule.role];
      const rawStaffName = row[colKey];
      const staffName = cleanStaffName(rawStaffName);
      
      const incKey = `${rule.role} Incentive`;
      
      if (!staffName || isNameExcluded(staffName, excludedSet)) {
        calculatedRow[incKey] = 0;
        return;
      }

      const incentive = freight * rule.portion * rule.percentage;
      const roundedIncentive = Number(incentive.toFixed(4));
      
      calculatedRow[incKey] = roundedIncentive;
      rowTotalInc += roundedIncentive;
      totalIncentives += roundedIncentive;

      // Accumulate in staff map
      if (!staffMap[staffName]) {
        staffMap[staffName] = {
          name: staffName,
          total: 0,
          roleBreakdown: {}
        };
        rules.forEach(r => {
          staffMap[staffName].roleBreakdown[r.role] = 0;
        });
      }

      staffMap[staffName].roleBreakdown[rule.role] += roundedIncentive;
      staffMap[staffName].total += roundedIncentive;
    });

    calculatedRow['Row Total Incentive'] = Number(rowTotalInc.toFixed(4));
    details.push(calculatedRow);
  });

  // Convert staff summary map to array and sort descending
  const summary = Object.values(staffMap).map(staff => {
    const item = {
      name: staff.name,
      total: Number(staff.total.toFixed(2))
    };
    rules.forEach(rule => {
      item[rule.role] = Number((staff.roleBreakdown[rule.role] || 0).toFixed(2));
    });
    return item;
  }).sort((a, b) => b.total - a.total);

  return {
    summary,
    details,
    stats: {
      totalFreight: Number(totalFreight.toFixed(2)),
      totalIncentives: Number(totalIncentives.toFixed(2)),
      totalLrsCount,
      uniqueStaffCount: summary.length
    },
    errors
  };
};
