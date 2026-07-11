import React, { useState, useEffect } from 'react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx-js-style';
import * as XLSXReader from 'xlsx';
import { Upload, FileText, AlertTriangle, Clock, Settings, X, Plus, BarChart2, Download, MapPin, Search, Filter, ChevronDown, ChevronUp, Check, Truck, Award, TrendingUp, DollarSign } from 'lucide-react';
import { exportToPPT } from '../utils/pptExporter';

const STATUS_MAP = {
  'Despatched': 'On transit',
  'Open': 'Not Despatched',
  'Delivered': 'Delivery Process completed.',
  'Despatched from Branch': 'Cancelled LR'
};

export const cleanLrNumber = (lr) => {
  if (lr === undefined || lr === null) return "";
  let s = String(lr).trim();
  if (s.endsWith(".0")) {
    s = s.slice(0, -2);
  }
  return s;
};

const parseSheetToJSON = (ws, headerKeywords) => {
  const rows = XLSXReader.utils.sheet_to_json(ws, { header: 1, defval: "" });
  if (rows.length === 0) return [];
  
  // Find the header row
  let headerIndex = -1;
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const row = rows[i];
    if (Array.isArray(row) && row.some(cell => {
      if (!cell) return false;
      const str = String(cell).toUpperCase().replace(/[\s_-]/g, '');
      return headerKeywords.some(keyword => str.includes(keyword) || keyword.includes(str));
    })) {
      headerIndex = i;
      break;
    }
  }
  
  if (headerIndex === -1) {
    headerIndex = 0;
  }
  
  const headers = (rows[headerIndex] || []).map(h => String(h || '').trim());
  const dataRows = [];
  
  for (let i = headerIndex + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    const obj = {};
    headers.forEach((h, colIdx) => {
      if (h) {
        obj[h] = row[colIdx] !== undefined ? row[colIdx] : "";
      }
    });
    dataRows.push(obj);
  }
  
  return dataRows;
};

const adjustExcelDate = (d) => {
  if (!(d instanceof Date) || isNaN(d.getTime())) return d;
  const hours = d.getHours();
  const minutes = d.getMinutes();
  if (hours === 23 && minutes >= 50) {
    return new Date(d.getTime() + 10 * 60 * 1000); // add 10 minutes to cross midnight boundary
  }
  return d;
};

const parseDate = (str) => {
  if (!str) return null;
  if (str instanceof Date) {
    if (!isNaN(str.getTime())) return str;
    return null;
  }
  
  const dateStr = String(str).trim().split(/\s+/)[0]; 
  const parts = dateStr.split(/[-/.]/);
  
  if (parts.length === 3) {
    let [p1, p2, p3] = parts;
    const isNumeric = (val) => /^\d+$/.test(val);
    
    if (isNumeric(p1) && isNumeric(p2) && isNumeric(p3)) {
      let d, m, y;
      if (p1.length === 4) {
        y = parseInt(p1); m = parseInt(p2); d = parseInt(p3);
      } else {
        const val1 = parseInt(p1);
        const val2 = parseInt(p2);
        const val3 = parseInt(p3);
        if (val2 > 12) {
          // E.g. MM/DD/YYYY format: 04/29/2026 where second part is day > 12
          m = val1;
          d = val2;
        } else {
          // Default to Indian DD/MM/YYYY format
          d = val1;
          m = val2;
        }
        y = val3;
        if (y < 100) y += 2000;
      }
      return new Date(y, m - 1, d);
    } else {
      const getMonthIndex = (mStr) => {
         const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
         return months.findIndex(m => mStr.toLowerCase().startsWith(m));
      };
      if (isNumeric(p1) && !isNumeric(p2)) {
         let d = parseInt(p1);
         let m = getMonthIndex(p2);
         let y = parseInt(p3);
         if (y < 100) y += 2000;
         if (m !== -1) return new Date(y, m, d);
      } else if (!isNumeric(p1) && isNumeric(p2)) {
         let m = getMonthIndex(p1);
         let d = parseInt(p2);
         let y = parseInt(p3);
         if (y < 100) y += 2000;
         if (m !== -1) return new Date(y, m, d);
      }
    }
  }
  
  const fallback = new Date(str);
  if (!isNaN(fallback.getTime())) return fallback;
  return null;
};

const getDayStr = (d) => {
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getFullYear()).slice(-2)}`;
};

const getDateStr = (d) => {
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getFullYear())}`;
};

const getDateTimeStr = (d) => {
  const dateStr = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getFullYear())}`;
  const hours = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  return `${dateStr} ${displayHours}:${minutes}:00 ${ampm}`;
};

// Removed obsolete parseStandardDate function

const parseLocalInputDate = (inputStr) => {
  if (!inputStr) return null;
  const parts = inputStr.split('-'); // YYYY-MM-DD
  if (parts.length === 3) {
    const y = parseInt(parts[0]);
    const m = parseInt(parts[1]);
    const d = parseInt(parts[2]);
    return new Date(y, m - 1, d);
  }
  return null;
};

const calculateDelay = (startStr, endStr, consignor, customHolidays, excludeSundays) => {
  if (!endStr || endStr.trim() === '') return null; 
  
  const start = parseDate(startStr);
  const end = parseDate(endStr);
  
  if (!start || !end || isNaN(start) || isNaN(end)) return null;

  const diffTime = end - start;
  const rawDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
  
  let calculatedDelay = rawDays;
  let temp = new Date(start);
  
  const normalizedHolidays = customHolidays.map(h => {
    const pd = parseDate(h);
    return pd ? getDayStr(pd) : h;
  });

  while (temp < end) {
    const dStr = getDayStr(temp);
    const isSunday = temp.getDay() === 0;
    
    if (normalizedHolidays.includes(dStr) || (excludeSundays && isSunday && !normalizedHolidays.includes(dStr))) {
      calculatedDelay--;
    }
    temp.setDate(temp.getDate() + 1);
  }
  
  return Math.max(0, calculatedDelay);
};

export default function DeliveryDashboard() {
  const [data, setData] = useState(null);
  const [rawRows, setRawRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState(null); 
  const [selectedDestination, setSelectedDestination] = useState(null);

  const [excludeSundays, setExcludeSundays] = useState(true);
  const [customHolidays, setCustomHolidays] = useState([]);
  const [holidaysDbList, setHolidaysDbList] = useState([]);
  const [newHoliday, setNewHoliday] = useState('');

  const [selectedConsignor, setSelectedConsignor] = useState('All');
  const [isConsignorDropdownOpen, setIsConsignorDropdownOpen] = useState(false);
  const [consignorSearchTerm, setConsignorSearchTerm] = useState('');

  const [despatchMap, setDespatchMap] = useState({});
  const [supervisorMap, setSupervisorMap] = useState({});
  const [selectedBranch, setSelectedBranch] = useState('All');
  const [isBranchDropdownOpen, setIsBranchDropdownOpen] = useState(false);
  const [branchSearchTerm, setBranchSearchTerm] = useState('');

  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');

  const [despatchRawRows, setDespatchRawRows] = useState([]);
  const [despatchStartDateFilter, setDespatchStartDateFilter] = useState('');
  const [despatchEndDateFilter, setDespatchEndDateFilter] = useState('');
  const [despatchLrStartDateFilter, setDespatchLrStartDateFilter] = useState('');
  const [despatchLrEndDateFilter, setDespatchLrEndDateFilter] = useState('');
  const [despatchGdmFilter, setDespatchGdmFilter] = useState('');
  const [activeTab, setActiveTab] = useState('delayReport'); // 'delayReport', 'despatchReport' or 'performanceLeaderboard'
  const [leaderboardSortBy, setLeaderboardSortBy] = useState('score'); // 'score', 'lrs', 'boxes', 'delay', 'points'
  const [holidaysConfirmed, setHolidaysConfirmed] = useState(false);

  useEffect(() => {
    setSelectedDestination(null);
  }, [selectedConsignor, selectedBranch, filterStartDate, filterEndDate]);

  useEffect(() => {
    const fetchHolidays = async () => {
      try {
        const res = await fetch('/api/explorer/data/holidays');
        if (res.ok) {
          const result = await res.json();
          const list = result.data || [];
          setHolidaysDbList(list);
          setCustomHolidays(list.map(h => {
            const dateOnly = h.date ? h.date.split('T')[0] : '';
            return dateOnly;
          }).filter(Boolean));
        }
      } catch (err) {
        console.error("Error fetching holidays:", err);
      }
    };
    fetchHolidays();
  }, []);

  const consignorsList = React.useMemo(() => {
    if (!data) return [];
    const unique = new Set();
    data.all.forEach(x => {
      if (x.consignor) unique.add(x.consignor);
    });
    data.cancelled.forEach(x => {
      if (x.consignor) unique.add(x.consignor);
    });
    return Array.from(unique).sort();
  }, [data]);

  const consignorCounts = React.useMemo(() => {
    if (!data) return {};
    const counts = {};
    data.all.forEach(x => {
      if (x.consignor) counts[x.consignor] = (counts[x.consignor] || 0) + 1;
    });
    data.cancelled.forEach(x => {
      if (x.consignor) counts[x.consignor] = (counts[x.consignor] || 0) + 1;
    });
    return counts;
  }, [data]);

  const filteredConsignors = React.useMemo(() => {
    if (!consignorsList) return [];
    return consignorsList.filter(c => 
      c.toLowerCase().includes(consignorSearchTerm.toLowerCase())
    );
  }, [consignorsList, consignorSearchTerm]);

  const branchesList = React.useMemo(() => {
    if (!data) return [];
    const unique = new Set();
    data.all.forEach(x => {
      if (x.branch) unique.add(x.branch);
    });
    data.cancelled.forEach(x => {
      if (x.branch) unique.add(x.branch);
    });
    return Array.from(unique).sort();
  }, [data]);

  const branchCounts = React.useMemo(() => {
    if (!data) return {};
    const counts = {};
    data.all.forEach(x => {
      if (x.branch) counts[x.branch] = (counts[x.branch] || 0) + 1;
    });
    data.cancelled.forEach(x => {
      if (x.branch) counts[x.branch] = (counts[x.branch] || 0) + 1;
    });
    return counts;
  }, [data]);

  const filteredBranches = React.useMemo(() => {
    if (!branchesList) return [];
    return branchesList.filter(b => 
      b.toLowerCase().includes(branchSearchTerm.toLowerCase())
    );
  }, [branchesList, branchSearchTerm]);

  const branchPerformance = React.useMemo(() => {
    if (!data) return [];
    
    const performance = {};
    
    let allData = data.all;
    let cancelledData = data.cancelled;

    if (selectedConsignor !== 'All') {
      allData = allData.filter(x => x.consignor === selectedConsignor);
      cancelledData = cancelledData.filter(x => x.consignor === selectedConsignor);
    }
    
    if (filterStartDate) {
      const startLimit = parseLocalInputDate(filterStartDate);
      if (startLimit) {
        startLimit.setHours(0,0,0,0);
        allData = allData.filter(x => {
          const d = parseDate(x.date);
          return d && d >= startLimit;
        });
        cancelledData = cancelledData.filter(x => {
          const d = parseDate(x.date);
          return d && d >= startLimit;
        });
      }
    }

    if (filterEndDate) {
      const endLimit = parseLocalInputDate(filterEndDate);
      if (endLimit) {
        endLimit.setHours(23,59,59,999);
        allData = allData.filter(x => {
          const d = parseDate(x.date);
          return d && d <= endLimit;
        });
        cancelledData = cancelledData.filter(x => {
          const d = parseDate(x.date);
          return d && d <= endLimit;
        });
      }
    }
    
    allData.forEach(x => {
      const b = x.branch || 'N/A';
      if (!performance[b]) {
        performance[b] = {
          name: b,
          total: 0,
          delivered: 0,
          transit: 0,
          open: 0,
          cancelled: 0,
          delayed2DaysPlus: 0,
          delays: []
        };
      }
      
      performance[b].total++;
      if (x.status === 'Not Despatched') {
        performance[b].open++;
      } else if (x.status === 'On transit') {
        performance[b].transit++;
      } else if (x.status === 'Delivery Process completed.') {
        performance[b].delivered++;
        if (x.delay !== null) {
          performance[b].delays.push(x.delay);
          if (x.delay >= 2) {
            performance[b].delayed2DaysPlus++;
          }
        }
      }
    });

    cancelledData.forEach(x => {
      const b = x.branch || 'N/A';
      if (!performance[b]) {
        performance[b] = {
          name: b,
          total: 0,
          delivered: 0,
          transit: 0,
          open: 0,
          cancelled: 0,
          delayed2DaysPlus: 0,
          delays: []
        };
      }
      performance[b].cancelled++;
      performance[b].total++;
    });

    return Object.values(performance).map(p => {
      const sum = p.delays.reduce((a, c) => a + c, 0);
      const avg = p.delays.length > 0 ? (sum / p.delays.length).toFixed(1) : '-';
      const activeTotal = p.delivered + p.transit + p.open;
      const deliveryPct = activeTotal > 0 ? ((p.delivered / activeTotal) * 100).toFixed(1) + '%' : '0%';
      const delayPct = activeTotal > 0 ? ((p.delayed2DaysPlus / activeTotal) * 100).toFixed(1) + '%' : '0%';
      
      return {
        ...p,
        activeTotal,
        avgDelay: avg,
        deliveryRate: deliveryPct,
        delayRate: delayPct
      };
    }).sort((a, b) => b.activeTotal - a.activeTotal);
  }, [data, selectedConsignor, filterStartDate, filterEndDate]);

  const filteredDashboard = React.useMemo(() => {
    if (!data) return null;
    
    let filteredAll = data.all;
    let filteredCancelled = data.cancelled;

    if (selectedConsignor !== 'All') {
      filteredAll = filteredAll.filter(x => x.consignor === selectedConsignor);
      filteredCancelled = filteredCancelled.filter(x => x.consignor === selectedConsignor);
    }

    if (selectedBranch !== 'All') {
      filteredAll = filteredAll.filter(x => x.branch === selectedBranch);
      filteredCancelled = filteredCancelled.filter(x => x.branch === selectedBranch);
    }

    if (filterStartDate) {
      const startLimit = parseLocalInputDate(filterStartDate);
      if (startLimit) {
        startLimit.setHours(0,0,0,0);
        filteredAll = filteredAll.filter(x => {
          const d = parseDate(x.date);
          return d && d >= startLimit;
        });
        filteredCancelled = filteredCancelled.filter(x => {
          const d = parseDate(x.date);
          return d && d >= startLimit;
        });
      }
    }

    if (filterEndDate) {
      const endLimit = parseLocalInputDate(filterEndDate);
      if (endLimit) {
        endLimit.setHours(23,59,59,999);
        filteredAll = filteredAll.filter(x => {
          const d = parseDate(x.date);
          return d && d <= endLimit;
        });
        filteredCancelled = filteredCancelled.filter(x => {
          const d = parseDate(x.date);
          return d && d <= endLimit;
        });
      }
    }
    
    let openCount = 0;
    let despatchedCount = 0;
    let deliveredCount = 0;
    
    const delayCounts = {
      0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 'more': 0, 'invalid': 0
    };
    
    filteredAll.forEach(x => {
      if (x.status === 'Not Despatched') {
        openCount++;
      } else if (x.status === 'On transit') {
        despatchedCount++;
      } else if (x.status === 'Delivery Process completed.') {
        deliveredCount++;
        const delay = x.delay;
        
        if (delay !== null) {
          if (delay === 0) delayCounts[0]++;
          else if (delay === 1) delayCounts[1]++;
          else if (delay === 2) delayCounts[2]++;
          else if (delay === 3) delayCounts[3]++;
          else if (delay === 4) delayCounts[4]++;
          else if (delay === 5) delayCounts[5]++;
          else if (delay === 6) delayCounts[6]++;
          else if (delay === 7) delayCounts[7]++;
          else delayCounts['more']++;
        } else {
          delayCounts['invalid']++;
        }
      }
    });
    
    const activeTotal = deliveredCount + openCount + despatchedCount;
    
    return {
      all: filteredAll,
      cancelled: filteredCancelled,
      summary: {
        rawTotal: data.summary.rawTotal,
        activeTotal: activeTotal,
        delivered: deliveredCount,
        openCount,
        despatchedCount,
        cancelledCount: filteredCancelled.length,
        totalExcludedConsignors: data.summary.totalExcludedConsignors,
        delayCounts
      }
    };
  }, [data, selectedConsignor, selectedBranch, filterStartDate, filterEndDate]);

  const despatchBranchesList = React.useMemo(() => {
    if (!despatchRawRows) return [];
    const unique = new Set();
    despatchRawRows.forEach(row => {
      const branch = row.supervisor ? (supervisorMap[row.supervisor] || 'N/A') : 'N/A';
      unique.add(branch);
    });
    return Array.from(unique).sort();
  }, [despatchRawRows, supervisorMap]);

  const despatchReportData = React.useMemo(() => {
    if (!despatchRawRows || despatchRawRows.length === 0) return [];
    
    const startLimit = despatchStartDateFilter ? parseLocalInputDate(despatchStartDateFilter) : null;
    const endLimit = despatchEndDateFilter ? parseLocalInputDate(despatchEndDateFilter) : null;

    if (startLimit) startLimit.setHours(0, 0, 0, 0);
    if (endLimit) endLimit.setHours(23, 59, 59, 999);

    const lrStartLimit = despatchLrStartDateFilter ? parseLocalInputDate(despatchLrStartDateFilter) : null;
    const lrEndLimit = despatchLrEndDateFilter ? parseLocalInputDate(despatchLrEndDateFilter) : null;

    if (lrStartLimit) lrStartLimit.setHours(0, 0, 0, 0);
    if (lrEndLimit) lrEndLimit.setHours(23, 59, 59, 999);

    // 1. Filter raw rows first
    const filteredRows = despatchRawRows.filter(row => {
      // Branch check
      const branch = row.supervisor ? (supervisorMap[row.supervisor] || 'N/A') : 'N/A';
      if (selectedBranch !== 'All' && branch !== selectedBranch) {
        return false;
      }
      
      // Date range check
      if (startLimit || endLimit) {
        const rowDate = parseDate(row.despatchDate);
        if (!rowDate) return false;
        if (startLimit && rowDate < startLimit) return false;
        if (endLimit && rowDate > endLimit) return false;
      }

      // LR Date range check
      if (lrStartLimit || lrEndLimit) {
        const rowLrDate = parseDate(row.lrDate);
        if (!rowLrDate) return false;
        if (lrStartLimit && rowLrDate < lrStartLimit) return false;
        if (lrEndLimit && rowLrDate > lrEndLimit) return false;
      }
      
      // GDM / Despatch No check
      if (despatchGdmFilter && !row.despatchNo.toLowerCase().includes(despatchGdmFilter.toLowerCase())) {
        return false;
      }
      
      return true;
    });

    // 2. Group by despatchNo
    const groups = {};
    filteredRows.forEach(row => {
      const dNo = row.despatchNo;
      if (!dNo) return;
      
      if (!groups[dNo]) {
        groups[dNo] = {
          despatchNo: dNo,
          despatchDate: row.despatchDate || '',
          branch: row.supervisor ? (supervisorMap[row.supervisor] || 'N/A') : 'N/A',
          totalLrCount: 0,
          consigneeKeys: new Set(),
          deliveredLrs: [],
          totalBoxQty: 0,
          deliveryDrivers: new Set()
        };
      }
      
      const g = groups[dNo];
      g.totalLrCount++;
      g.totalBoxQty += row.boxQty || 0;
      if (row.deliveryDriver) {
        g.deliveryDrivers.add(row.deliveryDriver.trim());
      }
      
      // A unique delivery is defined as a unique combination of consignee name & destination
      const cKey = `${(row.consignee || '').trim().toLowerCase()}||${(row.destination || '').trim().toLowerCase()}`;
      g.consigneeKeys.add(cKey);
      
      if (row.deliveryTime) {
        const parsedTime = row.deliveryTimeRaw || parseDate(row.deliveryTime);
        if (parsedTime && !isNaN(parsedTime.getTime())) {
          g.deliveredLrs.push(parsedTime);
        }
      }
      
      if (g.branch === 'N/A' && row.supervisor) {
        const mappedBranch = supervisorMap[row.supervisor];
        if (mappedBranch) g.branch = mappedBranch;
      }
    });

    // 3. Format groups
    const sorted = Object.values(groups).map(g => {
      let firstDeliveryTime = '-';
      let lastDeliveryTime = '-';
      
      if (g.deliveredLrs.length > 0) {
        g.deliveredLrs.sort((a, b) => a - b);
        const first = g.deliveredLrs[0];
        const last = g.deliveredLrs[g.deliveredLrs.length - 1];
        
        const formatTime = (d) => {
          const dateStr = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getFullYear())}`;
          let hours = d.getHours();
          const minutes = String(d.getMinutes()).padStart(2, '0');
          const ampm = hours >= 12 ? 'pm' : 'am';
          hours = hours % 12;
          hours = hours ? hours : 12;
          return `(${dateStr})${hours}:${minutes}${ampm}`;
        };
        
        firstDeliveryTime = formatTime(first);
        lastDeliveryTime = formatTime(last);
      }
      
      const driverList = g.deliveryDrivers.size > 0 
        ? Array.from(g.deliveryDrivers).join(', ') 
        : '-';

      return {
        despatchNo: g.despatchNo,
        despatchDate: g.despatchDate,
        branch: g.branch,
        totalLrCount: g.totalLrCount,
        totalDelivery: g.consigneeKeys.size,
        firstDeliveryTime,
        lastDeliveryTime,
        rawLrCount: g.totalLrCount,
        rawDeliveryCount: g.consigneeKeys.size,
        totalBoxQty: g.totalBoxQty,
        deliveryDriver: driverList
      };
    }).sort((a, b) => b.despatchNo.localeCompare(a.despatchNo));

    let currentShade = false;
    let lastDate = null;
    sorted.forEach((item) => {
      const dVal = (item.despatchDate || '').trim();
      if (lastDate !== null && dVal !== lastDate) {
        currentShade = !currentShade;
      }
      item.bgClass = currentShade ? 'bg-blue-50/20' : 'bg-white';
      lastDate = dVal;
    });

    return sorted;
  }, [despatchRawRows, selectedBranch, despatchStartDateFilter, despatchEndDateFilter, despatchLrStartDateFilter, despatchLrEndDateFilter, despatchGdmFilter, supervisorMap]);

  const branchLeaderboardData = React.useMemo(() => {
    if (!filteredDashboard) return [];
    
    const branches = {};
    const branchPodSummaryMap = data?.summary?.branchPodSummaryMap || {};
    
    const rows = filteredDashboard.all;
    
    rows.forEach(item => {
      const b = item.branch || 'without despatched delivery';
      if (!branches[b]) {
        branches[b] = {
          name: b,
          totalLrs: 0,
          deliveredLrs: 0,
          totalBoxes: 0,
          deliveryPoints: new Set(),
          totalDelayDays: 0,
          delaysCount: 0,
          sndCount: 0,
          delay2Count: 0,
          delay3Count: 0,
          delay4AboveCount: 0,
          totalAmount: 0,
          podCount: 0
        };
      }
      
      const g = branches[b];
      g.totalLrs++;
      g.totalBoxes += item.boxQty || 0;
      g.totalAmount += item.amount || 0;
      
      const pKey = `${(item.consignee || '').trim().toLowerCase()}||${(item.area || '').trim().toLowerCase()}`;
      if (item.consignee || item.area) {
        g.deliveryPoints.add(pKey);
      }
      
      if (item.status === 'Delivery Process completed.') {
        g.deliveredLrs++;
        if (item.delay !== null) {
          g.totalDelayDays += item.delay;
          g.delaysCount++;
          if (item.delay <= 1) {
            g.sndCount++;
          } else if (item.delay === 2) {
            g.delay2Count++;
          } else if (item.delay === 3) {
            g.delay3Count++;
          } else {
            g.delay4AboveCount++;
          }
        }
        if (item.podReceived) {
          g.podCount++;
        }
      }
    });
    
    const branchesList = Object.values(branches).map(b => {
      const avgDelay = b.delaysCount > 0 ? (b.totalDelayDays / b.delaysCount) : 0;
      const pointsCount = b.deliveryPoints.size;
      
      let pendingCount = 0;
      let finalPodCount = b.deliveredLrs;
      const cleanBranchName = b.name.toUpperCase();
      
      if (branchPodSummaryMap[cleanBranchName] !== undefined) {
        pendingCount = Number(branchPodSummaryMap[cleanBranchName] || 0);
        finalPodCount = Math.max(0, b.deliveredLrs - pendingCount);
      } else {
        const hasPodMap = Object.keys(data?.summary?.podMap || {}).length > 0;
        if (hasPodMap) {
          finalPodCount = b.podCount;
          pendingCount = Math.max(0, b.deliveredLrs - finalPodCount);
        } else {
          pendingCount = 0;
          finalPodCount = b.deliveredLrs;
        }
      }
      
      const podRate = b.deliveredLrs > 0 ? (finalPodCount / b.deliveredLrs) * 100 : 0;
      const sndRate = b.deliveredLrs > 0 ? (b.sndCount / b.deliveredLrs) * 100 : 0;
      const delay2Rate = b.deliveredLrs > 0 ? (b.delay2Count / b.deliveredLrs) * 100 : 0;
      const delay3Rate = b.deliveredLrs > 0 ? (b.delay3Count / b.deliveredLrs) * 100 : 0;
      const delay4AboveRate = b.deliveredLrs > 0 ? (b.delay4AboveCount / b.deliveredLrs) * 100 : 0;
      
      const productivityRaw = (b.deliveredLrs * 1.0) + (pointsCount * 2.0) + (b.totalBoxes * 0.1);
      
      return {
        name: b.name,
        totalLrs: b.totalLrs,
        deliveredLrs: b.deliveredLrs,
        totalBoxes: b.totalBoxes,
        deliveryPoints: pointsCount,
        avgDelay: b.delaysCount > 0 ? avgDelay.toFixed(1) : '-',
        rawAvgDelay: avgDelay,
        sndCount: b.sndCount,
        sndRate: sndRate,
        delay2Count: b.delay2Count,
        delay2Rate: delay2Rate,
        delay3Count: b.delay3Count,
        delay3Rate: delay3Rate,
        delay4AboveCount: b.delay4AboveCount,
        delay4AboveRate: delay4AboveRate,
        totalAmount: b.totalAmount,
        podCount: finalPodCount,
        pendingCount: pendingCount,
        podRate: podRate,
        productivityRaw: productivityRaw
      };
    });
    
    const maxProductivity = Math.max(...branchesList.map(b => b.productivityRaw), 1);
    
    return branchesList.map(b => {
      const baseScore = (b.sndRate * 0.25) + ((b.productivityRaw / maxProductivity) * 35);
      const podScore = 40 - (b.pendingCount * 10);
      const score = Math.max(0, Math.round(baseScore + podScore));
      
      return {
        ...b,
        score: score
      };
    });
  }, [filteredDashboard, data]);

  const driverLeaderboardData = React.useMemo(() => {
    if (!filteredDashboard) return [];
    
    const drivers = {};
    const rows = filteredDashboard.all;
    
    rows.forEach(item => {
      const dStr = (item.deliveryDriver || '').trim();
      if (!dStr || dStr === '-') return;
      
      const splitDrivers = dStr.split(',').map(s => s.trim()).filter(Boolean);
      
      splitDrivers.forEach(d => {
        if (!drivers[d]) {
          drivers[d] = {
            name: d,
            totalLrs: 0,
            deliveredLrs: 0,
            totalBoxes: 0,
            deliveryPoints: new Set(),
            totalDelayDays: 0,
            delaysCount: 0,
            sndCount: 0,
            podCount: 0
          };
        }
        
        const g = drivers[d];
        g.totalLrs++;
        g.totalBoxes += item.boxQty || 0;
        
        const pKey = `${(item.consignee || '').trim().toLowerCase()}||${(item.area || '').trim().toLowerCase()}`;
        if (item.consignee || item.area) {
          g.deliveryPoints.add(pKey);
        }
        
        if (item.status === 'Delivery Process completed.') {
          g.deliveredLrs++;
          if (item.delay !== null) {
            g.totalDelayDays += item.delay;
            g.delaysCount++;
            if (item.delay <= 1) {
              g.sndCount++;
            }
          }
          if (item.podReceived) {
            g.podCount++;
          }
        }
      });
    });
    
    const driversList = Object.values(drivers).map(d => {
      const avgDelay = d.delaysCount > 0 ? (d.totalDelayDays / d.delaysCount) : 0;
      const pointsCount = d.deliveryPoints.size;
      
      const hasPodMap = Object.keys(data?.summary?.podMap || {}).length > 0;
      const pendingCount = hasPodMap ? Math.max(0, d.deliveredLrs - d.podCount) : 0;
      const podRate = d.deliveredLrs > 0 ? ((d.deliveredLrs - pendingCount) / d.deliveredLrs) * 100 : 0;
      const sndRate = d.deliveredLrs > 0 ? (d.sndCount / d.deliveredLrs) * 100 : 0;
      
      const productivityRaw = (d.deliveredLrs * 1.0) + (pointsCount * 2.0) + (d.totalBoxes * 0.1);
      
      return {
        name: d.name,
        totalLrs: d.totalLrs,
        deliveredLrs: d.deliveredLrs,
        totalBoxes: d.totalBoxes,
        deliveryPoints: pointsCount,
        avgDelay: d.delaysCount > 0 ? avgDelay.toFixed(1) : '-',
        rawAvgDelay: avgDelay,
        sndCount: d.sndCount,
        sndRate: sndRate,
        podCount: d.deliveredLrs - pendingCount,
        pendingCount: pendingCount,
        podRate: podRate,
        productivityRaw: productivityRaw
      };
    });
    
    const maxProductivity = Math.max(...driversList.map(d => d.productivityRaw), 1);
    
    return driversList.map(d => {
      const baseScore = (d.sndRate * 0.25) + ((d.productivityRaw / maxProductivity) * 35);
      const podScore = 40 - (d.pendingCount * 10);
      const score = Math.max(0, Math.round(baseScore + podScore));
      
      return {
        ...d,
        score: score
      };
    });
  }, [filteredDashboard, data]);

  const sortedBranchLeaderboard = React.useMemo(() => {
    const data = [...branchLeaderboardData];
    if (leaderboardSortBy === 'score') {
      return data.sort((a, b) => b.score - a.score);
    } else if (leaderboardSortBy === 'lrs') {
      return data.sort((a, b) => b.deliveredLrs - a.deliveredLrs);
    } else if (leaderboardSortBy === 'boxes') {
      return data.sort((a, b) => b.totalBoxes - a.totalBoxes);
    } else if (leaderboardSortBy === 'delay') {
      return data.sort((a, b) => {
        if (a.rawAvgDelay === 0 && a.deliveredLrs === 0) return 1;
        if (b.rawAvgDelay === 0 && b.deliveredLrs === 0) return -1;
        return a.rawAvgDelay - b.rawAvgDelay;
      });
    } else if (leaderboardSortBy === 'points') {
      return data.sort((a, b) => b.deliveryPoints - a.deliveryPoints);
    }
    return data;
  }, [branchLeaderboardData, leaderboardSortBy]);

  const sortedDriverLeaderboard = React.useMemo(() => {
    const data = [...driverLeaderboardData];
    if (leaderboardSortBy === 'score') {
      return data.sort((a, b) => b.score - a.score);
    } else if (leaderboardSortBy === 'lrs') {
      return data.sort((a, b) => b.deliveredLrs - a.deliveredLrs);
    } else if (leaderboardSortBy === 'boxes') {
      return data.sort((a, b) => b.totalBoxes - a.totalBoxes);
    } else if (leaderboardSortBy === 'delay') {
      return data.sort((a, b) => {
        if (a.rawAvgDelay === 0 && a.deliveredLrs === 0) return 1;
        if (b.rawAvgDelay === 0 && b.deliveredLrs === 0) return -1;
        return a.rawAvgDelay - b.rawAvgDelay;
      });
    } else if (leaderboardSortBy === 'points') {
      return data.sort((a, b) => b.deliveryPoints - a.deliveryPoints);
    }
    return data;
  }, [driverLeaderboardData, leaderboardSortBy]);

  const freightAnalysisData = React.useMemo(() => {
    if (!filteredDashboard) return { branches: [], consignors: [], destinations: [], totalFreight: 0 };
    
    const branchMap = {};
    const consignorMap = {};
    const destMap = {};
    let totalFreight = 0;
    
    filteredDashboard.all.forEach(item => {
      const fr = Number(item.freight || 0);
      totalFreight += fr;
      
      const b = item.branch || 'without despatched delivery';
      branchMap[b] = (branchMap[b] || 0) + fr;
      
      const c = item.consignor || 'N/A';
      consignorMap[c] = (consignorMap[c] || 0) + fr;
      
      const d = item.area || 'N/A';
      destMap[d] = (destMap[d] || 0) + fr;
    });
    
    const sortAndFormat = (m) => {
      return Object.entries(m)
        .map(([name, amount]) => ({ name, amount }))
        .sort((a, b) => b.amount - a.amount);
    };
    
    return {
      branches: sortAndFormat(branchMap),
      consignors: sortAndFormat(consignorMap),
      destinations: sortAndFormat(destMap),
      totalFreight
    };
  }, [filteredDashboard]);

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setLoading(true);
    const fileName = file.name.toLowerCase();

    let despatchDetailsMap = {};

    const standardizeRowKeys = (row) => {
      if (!row) return {};
      const standardizedRow = {};
      const keys = Object.keys(row);
      
      const findKey = (candidates, searchKeys = keys) => {
        const cleanCandidates = candidates.map(c => c.toUpperCase().replace(/[^A-Z0-9]/g, ''));
        const exact = searchKeys.find(k => {
          const cleanK = k.toUpperCase().replace(/[^A-Z0-9]/g, '');
          return cleanCandidates.includes(cleanK);
        });
        if (exact) return exact;

        return searchKeys.find(k => {
          const cleanK = k.toUpperCase().replace(/[^A-Z0-9]/g, '');
          return cleanCandidates.some(c => cleanK.includes(c) || c.includes(cleanK));
        });
      };
      
      const consignorKey = findKey(['CONSIGNOR', 'CLIENT', 'CUSTOMER', 'CONSIGNORNAME', 'CONSIGNOR_NAME']);
      const lrNoKey = findKey(['LRNO', 'LRNUMBER', 'LR', 'LRNO.', 'LR_NO']);
      const deliveryTimeKey = findKey([
        'DELIVERYTIME', 'DELIVEREDTIME', 'DELIVERYDATE', 'DELIVEREDDATE', 
        'DELIVEREDON', 'ACTUALDELIVERY', 'ACTUALDELIVERYDATE', 'PODDATE', 
        'PODTIME', 'DELIVERED', 'DELIVERY', 'DELIVERY_DATE', 'DELIVERED_DATE',
        'DELIVEREDDATETIME', 'DELIVERYDATETIME', 'DELIVERED_DATE_TIME', 'DELIVERY_DATE_TIME'
      ]);
      
      const remainingKeysForDate = keys.filter(k => k !== deliveryTimeKey);
      const dateKey = findKey([
        'DATE', 'LRDATE', 'DESPATCHDATE', 'BOOKINGDATE', 'CREATEDDATE',
        'LR_DATE', 'DESPATCH_DATE', 'BOOKING_DATE', 'CREATED_DATE',
        'LR_DT', 'LRDT'
      ], remainingKeysForDate);
      
      const consigneeKey = findKey(['CONSIGNEE', 'CONSIGNEENAME', 'RECIPENT', 'CONSIGNEE_NAME', 'CONSIGNEENAME.']);
      const destinationKey = findKey(['DESTINATION', 'AREA', 'PLACE', 'TO', 'DESTINATIONNAME']);
      const statusKey = findKey(['LRSTATUS', 'STATUS', 'LR_STATUS']);
      const despatchNoKey = findKey(['DESPATCHNO', 'DESPATCHNUMBER', 'DESPATCH_NO', 'DESPATCH_NUMBER', 'DESPATCHNO.', 'DISPATCHNO', 'DISPATCHNO.', 'DESPATCH_NO.', 'TRIPSHEET', 'TRIPSHEETNO', 'TRIPSHEET_NO', 'TRIP_SHEET_NO', 'DESPATCH']);
      const despatchDateKey = findKey(['DESPATCHDATE', 'DESPATCH_DATE', 'DESPATCH_DT', 'DESPATCHDT', 'DISPATCHDATE', 'DISPATCH_DATE']);
      const freightKey = findKey(['FRIGHTAMT', 'FREIGHTAMT', 'FREIGHTAMOUNT', 'FREIGHT', 'AMT', 'FRIGHT', 'FREIGHT_AMOUNT', 'FREIGHT_AMT', 'FREIGHTAMT.']);
      const amountKey = findKey(['AMOUNT', 'INVOICEVALUE', 'INVOICE_VALUE', 'LRVALUE', 'NETAMOUNT', 'NET_AMOUNT', 'INV_AMT', 'INVAMT']);

      if (consignorKey) standardizedRow['CONSIGNOR'] = row[consignorKey] !== undefined && row[consignorKey] !== null ? String(row[consignorKey]).trim() : '';
      if (lrNoKey) standardizedRow['LR NO'] = cleanLrNumber(row[lrNoKey]);
      
      const lrNoVal = standardizedRow['LR NO'] || '';

      if (dateKey) {
        let val = row[dateKey];
        if (val instanceof Date) {
          val = adjustExcelDate(val);
          standardizedRow['DATE'] = getDateStr(val);
        } else {
          standardizedRow['DATE'] = val !== undefined && val !== null ? String(val).trim() : '';
        }
      }

      if (deliveryTimeKey) {
        let val = row[deliveryTimeKey];
        if (val instanceof Date) {
          val = adjustExcelDate(val);
          standardizedRow['DELIVERY TIME'] = getDateTimeStr(val);
          standardizedRow['DELIVERY TIME_RAW'] = val;
        } else {
          standardizedRow['DELIVERY TIME'] = val !== undefined && val !== null ? String(val).trim() : '';
          const parsed = parseDate(val);
          standardizedRow['DELIVERY TIME_RAW'] = parsed;
        }
      }
      
      if (consigneeKey) standardizedRow['CONSIGNEE'] = row[consigneeKey] !== undefined && row[consigneeKey] !== null ? String(row[consigneeKey]).trim() : '';
      if (destinationKey) standardizedRow['DESTINATION'] = row[destinationKey] !== undefined && row[destinationKey] !== null ? String(row[destinationKey]).trim() : '';
      if (statusKey) standardizedRow['LR STATUS'] = row[statusKey] !== undefined && row[statusKey] !== null ? String(row[statusKey]).trim() : '';
      
      if (despatchNoKey) {
        standardizedRow['DESPATCH NO'] = row[despatchNoKey] !== undefined && row[despatchNoKey] !== null ? String(row[despatchNoKey]).trim() : '';
      } else {
        standardizedRow['DESPATCH NO'] = '';
      }

      if (despatchDateKey) {
        let val = row[despatchDateKey];
        if (val instanceof Date) {
          val = adjustExcelDate(val);
          standardizedRow['DESPATCH DATE'] = getDateStr(val);
        } else {
          standardizedRow['DESPATCH DATE'] = val !== undefined && val !== null ? String(val).trim() : '';
        }
      } else {
        standardizedRow['DESPATCH DATE'] = '';
      }

      if (!standardizedRow['DESPATCH DATE'] && standardizedRow['DATE']) {
        standardizedRow['DESPATCH DATE'] = standardizedRow['DATE'];
      }

      const supervisorKey = findKey(['LDSUPERVISOR', 'SUPERVISOR', 'LD_SUPERVISOR']);
      if (supervisorKey) {
        standardizedRow['LD SUPERVISOR'] = row[supervisorKey] !== undefined && row[supervisorKey] !== null ? String(row[supervisorKey]).trim() : '';
      }

      if (freightKey) {
        const val = row[freightKey];
        standardizedRow['FREIGHT'] = val !== undefined && val !== null && !isNaN(Number(val)) ? Number(val) : 0;
      } else {
        standardizedRow['FREIGHT'] = 0;
      }

      if (amountKey) {
        const val = row[amountKey];
        standardizedRow['AMOUNT'] = val !== undefined && val !== null && !isNaN(Number(val)) ? Number(val) : 0;
      } else {
        standardizedRow['AMOUNT'] = 0;
      }

      // Copy any other keys as-is just in case
      keys.forEach(k => {
        const cleanK = k.toUpperCase().replace(/[\s_-]/g, '');
        if (!['CONSIGNOR', 'LRNO', 'DATE', 'DELIVERYTIME', 'CONSIGNEE', 'DESTINATION', 'LRSTATUS', 'DESPATCHNO', 'DESPATCHDATE', 'DISPATCHNO', 'DISPATCHDATE', 'LDSUPERVISOR', 'SUPERVISOR', 'LD_SUPERVISOR', 'FREIGHT', 'AMOUNT'].includes(cleanK)) {
          standardizedRow[k] = row[k];
        }
      });

      return standardizedRow;
    };

    if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const ab = evt.target.result;
          const wb = XLSXReader.read(ab, { type: 'array', cellDates: true });
          
          let lrData = [];
          let dMap = {}; 
          let sMap = {}; 
          
          const sheetNames = wb.SheetNames;

          // 1. Parse Sheet 2 (Despatch Details) FIRST so it is available to Sheet 1 parser
          const despatchSheetName = sheetNames.find(n => n.toLowerCase() === 'despatch') || (sheetNames.length > 1 ? sheetNames[1] : null);
          let rawDespatchRows = [];
          if (despatchSheetName) {
            const ws2 = wb.Sheets[despatchSheetName];
            const ws2Data = parseSheetToJSON(ws2, ['LR', 'DESPATCH', 'DRIVER', 'SUPERVISOR', 'BOX']);
            
            const standardizeDespatchRowKeys = (row) => {
              if (!row) return null;
              const keys = Object.keys(row);
              const findKey = (candidates) => {
                const cleanCandidates = candidates.map(c => c.toUpperCase().replace(/[^A-Z0-9]/g, ''));
                const exact = keys.find(k => {
                  const cleanK = k.toUpperCase().replace(/[^A-Z0-9]/g, '');
                  return cleanCandidates.includes(cleanK);
                });
                if (exact) return exact;
                return keys.find(k => {
                  const cleanK = k.toUpperCase().replace(/[^A-Z0-9]/g, '');
                  return cleanCandidates.some(c => cleanK.includes(c) || c.includes(cleanK));
                });
              };
              
              const lrNoKey = findKey(['LRNO', 'LRNUMBER', 'LR', 'LRNO.', 'LR_NO', 'DOCKET', 'DOCKETNO', 'GCNO', 'GC_NO', 'CNNO', 'CN_NO', 'CONNOTE', 'CONNOTENO', 'GCNO.', 'CNNO.']);
              const despatchNoKey = findKey(['DESPATCHNO', 'DESPATCHNUMBER', 'DESPATCH_NO', 'DESPATCH_NUMBER', 'DESPATCHNO.', 'DISPATCHNO', 'DISPATCHNO.', 'DESPATCH_NO.', 'TRIPSHEET', 'TRIPSHEETNO', 'TRIPSHEET_NO', 'TRIP_SHEET_NO', 'DESPATCH']);
              const despatchDateKey = findKey(['DESPATCHDATE', 'DESPATCH_DATE', 'DESPATCH_DT', 'DESPATCHDT', 'DISPATCHDATE', 'DISPATCH_DATE']);
              const deliveryTimeKey = findKey([
                'DELIVERYTIME', 'DELIVEREDTIME', 'DELIVERYDATE', 'DELIVEREDDATE', 
                'DELIVEREDON', 'ACTUALDELIVERY', 'ACTUALDELIVERYDATE', 'PODDATE', 
                'PODTIME', 'DELIVERED', 'DELIVERY', 'DELIVERY_DATE', 'DELIVERED_DATE',
                'DELIVEREDDATETIME', 'DELIVERYDATETIME', 'DELIVERED_DATE_TIME', 'DELIVERY_DATE_TIME'
              ]);
              const supervisorKey = findKey(['LDSUPERVISOR', 'SUPERVISOR', 'LD_SUPERVISOR']);
              const consignorKey = findKey(['CONSIGNOR', 'CLIENT', 'CUSTOMER', 'CONSIGNORNAME', 'CONSIGNOR_NAME']);
              const consigneeKey = findKey(['CONSIGNEE', 'CONSIGNEENAME', 'RECIPENT', 'CONSIGNEE_NAME', 'CONSIGNEENAME.']);
              const destinationKey = findKey(['DESTINATION', 'AREA', 'PLACE', 'TO', 'DESTINATIONNAME']);
              const deliveryDriverKey = findKey(['DELIVERYDRIVER', 'DELIVERY_DRIVER', 'DRIVER', 'DRIVERNAME', 'DRIVER_NAME', 'VEHICLEDRIVER', 'DRIVERNAME.', 'DELIVERYDRIVERNAME', 'DELIVERY_DRIVER_NAME']);
              const boxQtyKey = findKey(['BOXQTY', 'BOXQUANTITY', 'BOX_QTY', 'BOX_QUANTITY', 'BOX']);

              const lrNoVal = lrNoKey ? cleanLrNumber(row[lrNoKey]) : '';
              const despatchNoVal = despatchNoKey && row[despatchNoKey] !== undefined && row[despatchNoKey] !== null ? String(row[despatchNoKey]).trim() : '';
              
              let despatchDateVal = '';
              if (despatchDateKey) {
                let val = row[despatchDateKey];
                if (val instanceof Date) {
                  val = adjustExcelDate(val);
                  despatchDateVal = getDateStr(val);
                } else {
                  despatchDateVal = val !== undefined && val !== null ? String(val).trim() : '';
                }
              }

              let deliveryTimeVal = '';
              let deliveryTimeRawVal = null;
              if (deliveryTimeKey) {
                let val = row[deliveryTimeKey];
                if (val instanceof Date) {
                  val = adjustExcelDate(val);
                  deliveryTimeVal = getDateTimeStr(val);
                  deliveryTimeRawVal = val;
                } else {
                  deliveryTimeVal = val !== undefined && val !== null ? String(val).trim() : '';
                  deliveryTimeRawVal = parseDate(val);
                }
              }

              const supervisorVal = supervisorKey && row[supervisorKey] !== undefined && row[supervisorKey] !== null ? String(row[supervisorKey]).trim() : '';
              const consignorVal = consignorKey && row[consignorKey] !== undefined && row[consignorKey] !== null ? String(row[consignorKey]).trim() : '';
              const consigneeVal = consigneeKey && row[consigneeKey] !== undefined && row[consigneeKey] !== null ? String(row[consigneeKey]).trim() : '';
              const destinationVal = destinationKey && row[destinationKey] !== undefined && row[destinationKey] !== null ? String(row[destinationKey]).trim() : '';
              const deliveryDriverVal = deliveryDriverKey && row[deliveryDriverKey] !== undefined && row[deliveryDriverKey] !== null ? String(row[deliveryDriverKey]).trim() : '';
              
              let boxQtyVal = 0;
              if (boxQtyKey) {
                const val = row[boxQtyKey];
                boxQtyVal = val !== undefined && val !== null && !isNaN(Number(val)) ? Number(val) : 0;
              }

              return {
                lrNo: lrNoVal,
                despatchNo: despatchNoVal,
                despatchDate: despatchDateVal,
                deliveryTime: deliveryTimeVal,
                deliveryTimeRaw: deliveryTimeRawVal,
                supervisor: supervisorVal,
                consignor: consignorVal,
                consignee: consigneeVal,
                destination: destinationVal,
                deliveryDriver: deliveryDriverVal,
                boxQty: boxQtyVal
              };
            };
            
            rawDespatchRows = ws2Data.map(standardizeDespatchRowKeys).filter(r => r && r.lrNo);
            
            // Build the maps for backward compatibility and dashboard calculations
            rawDespatchRows.forEach(row => {
              despatchDetailsMap[row.lrNo] = {
                despatchNo: row.despatchNo,
                despatchDate: row.despatchDate,
                deliveryTime: row.deliveryTime,
                deliveryTimeRaw: row.deliveryTimeRaw,
                supervisor: row.supervisor,
                deliveryDriver: row.deliveryDriver,
                boxQty: row.boxQty
              };
              if (row.supervisor) {
                dMap[row.lrNo] = row.supervisor;
              }
            });
          }
          
          // 2. Parse Sheet 3 (Supervisor table) SECOND to map supervisor names to branches
          const supervisorSheetName = sheetNames.find(n => n.toLowerCase() === 'superwisor' || n.toLowerCase() === 'supervisor') || (sheetNames.length > 2 ? sheetNames[2] : null);
          if (supervisorSheetName) {
            const ws3 = wb.Sheets[supervisorSheetName];
            const ws3Data = parseSheetToJSON(ws3, ['SUPERVISOR', 'BRANCH']);
            ws3Data.forEach(row => {
              if (!row) return;
              const supervisorKey = Object.keys(row).find(k => k.toLowerCase().replace(/[\s_-]/g, '') === 'ldsupervisor' || k.toLowerCase().replace(/[\s_-]/g, '') === 'supervisor');
              const branchKey = Object.keys(row).find(k => k.toLowerCase().replace(/[\s_-]/g, '') === 'branch');
              
              if (supervisorKey && branchKey) {
                const supVal = String(row[supervisorKey] !== undefined && row[supervisorKey] !== null ? row[supervisorKey] : '').trim();
                const branchVal = String(row[branchKey] !== undefined && row[branchKey] !== null ? row[branchKey] : '').trim();
                if (supVal && branchVal) {
                  sMap[supVal] = branchVal;
                }
              }
            });
          }

          // 2.5 Parse Sheet 4 (POD)
          const podSheetName = sheetNames.find(n => n.toLowerCase() === 'pod');
          let podMap = {};
          let branchPodSummaryMap = {};
          
          if (podSheetName) {
            const wsPod = wb.Sheets[podSheetName];
            const wsPodData = parseSheetToJSON(wsPod, ['LR', 'BRANCH', 'POD', 'COUNT', 'RECEIVED']);
            
            if (wsPodData.length > 0) {
              const sampleRow = wsPodData[0];
              const sampleKeys = Object.keys(sampleRow);
              
              const findKey = (candidates, keysList = sampleKeys) => {
                const cleanCandidates = candidates.map(c => c.toUpperCase().replace(/[^A-Z0-9]/g, ''));
                const exact = keysList.find(k => {
                  const cleanK = k.toUpperCase().replace(/[^A-Z0-9]/g, '');
                  return cleanCandidates.includes(cleanK);
                });
                if (exact) return exact;
                return keysList.find(k => {
                  const cleanK = k.toUpperCase().replace(/[^A-Z0-9]/g, '');
                  return cleanCandidates.some(c => cleanK.includes(c) || c.includes(cleanK));
                });
              };
              
              const lrNoKey = findKey(['LRNO', 'LRNUMBER', 'LR', 'LRNO.', 'LR_NO', 'DOCKET', 'DOCKETNO', 'GCNO', 'GC_NO', 'CNNO', 'CN_NO', 'CONNOTE', 'CONNOTENO', 'GCNO.', 'CNNO.']);
              const branchKey = findKey(['BRANCH', 'OFFICE', 'PLACE', 'BFRANCH', 'BBRANCH', 'BRANCHNAME', 'BRANCH_NAME']);
              const countKey = findKey(['COUNT', 'POD', 'PODCOUNT', 'TOTAL', 'QTY', 'RECEIVED', 'LR\'S QTY', 'LRSQTY', 'LR_QTY', 'PENDING', 'PENDINGCOUNT']);
              
              if (lrNoKey) {
                wsPodData.forEach(row => {
                  const lr = cleanLrNumber(row[lrNoKey]);
                  if (lr) {
                    const podDateKey = findKey(['DATE', 'PODDATE', 'POD_DATE', 'RECEIVEDDATE', 'RECEIVED_DATE', 'DELIVERY_DATE']);
                    let podDateVal = '';
                    if (podDateKey) {
                      let val = row[podDateKey];
                      if (val instanceof Date) {
                        val = adjustExcelDate(val);
                        podDateVal = getDateStr(val);
                      } else {
                        podDateVal = val !== undefined && val !== null ? String(val).trim() : '';
                      }
                    }
                    podMap[lr] = {
                      lrNo: lr,
                      podDate: podDateVal,
                      status: 'Yes'
                    };
                  }
                });
              } else if (branchKey && countKey) {
                wsPodData.forEach(row => {
                  const branchName = String(row[branchKey] || '').trim().toUpperCase();
                  const countVal = Number(row[countKey] || 0);
                  if (branchName && !isNaN(countVal) && branchName !== 'TOTAL' && branchName !== 'GRAND TOTAL' && branchName !== 'GRANDTOTAL') {
                    branchPodSummaryMap[branchName] = countVal;
                  }
                });
              }
            }
          }

          // 3. Parse Sheet 1 (Main LR records) LAST so it can use the maps
          const mainSheetName = sheetNames.find(n => n.toLowerCase() === 'lr data' || n.toLowerCase() === 'whole lr nos') || (sheetNames.length > 0 ? sheetNames[0] : null);
          if (mainSheetName) {
            const ws1 = wb.Sheets[mainSheetName];
            const rawLrData = parseSheetToJSON(ws1, ['CONSIGNOR', 'LR', 'DATE', 'STATUS']);
            lrData = rawLrData.map(standardizeRowKeys).filter(r => r && r['CONSIGNOR']);
          }
          
          // Inject LR Date from Sheet 1 into Sheet 2 rows
          const lrDateLookup = {};
          lrData.forEach(r => {
            const lr = r['LR NO'];
            if (lr) {
              lrDateLookup[lr] = r['DATE'];
            }
          });

          const enrichedDespatchRows = rawDespatchRows.map(row => ({
            ...row,
            lrDate: lrDateLookup[row.lrNo] || ''
          }));

          setDespatchMap(dMap);
          setSupervisorMap(sMap);
          setDespatchRawRows(enrichedDespatchRows);
          setRawRows(lrData);
          setHolidaysConfirmed(false);
          setSelectedConsignor('All');
          setSelectedBranch('All');
          setFilterStartDate('');
          setFilterEndDate('');
          setDespatchStartDateFilter('');
          setDespatchEndDateFilter('');
          setDespatchLrStartDateFilter('');
          setDespatchLrEndDateFilter('');
          setDespatchGdmFilter('');
          processData(lrData, customHolidays, excludeSundays, dMap, sMap, despatchDetailsMap, podMap, branchPodSummaryMap);
          setLoading(false);
        } catch (err) {
          console.error(err);
          setLoading(false);
          alert('Error parsing Excel file');
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      setDespatchMap({});
      setSupervisorMap({});
      setDespatchRawRows([]);
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          const standardizedCSV = results.data.map(standardizeRowKeys).filter(r => r && r['CONSIGNOR']);
          setRawRows(standardizedCSV);
          setHolidaysConfirmed(false);
          setSelectedConsignor('All');
          setSelectedBranch('All');
          setFilterStartDate('');
          setFilterEndDate('');
          setDespatchStartDateFilter('');
          setDespatchEndDateFilter('');
          setDespatchLrStartDateFilter('');
          setDespatchLrEndDateFilter('');
          setDespatchGdmFilter('');
          processData(standardizedCSV, customHolidays, excludeSundays, {}, {}, {}, {}, {});
          setLoading(false);
        },
        error: (error) => {
          console.error(error);
          setLoading(false);
          alert('Error parsing CSV file');
        }
      });
    }
  };

  const processData = (rows, holidays, excludeSun, dMap = {}, sMap = {}, despatchDetailsMap = {}, podMap = {}, branchPodSummaryMap = {}) => {
    const processed = [];
    const cancelledList = [];
    
    const delayCounts = {
      0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 'more': 0, 'invalid': 0
    };
    
    let openCount = 0;
    let despatchedCount = 0;
    let deliveredCount = 0;
    let totalExcludedConsignors = 0;
    
    rows.forEach(row => {
      if (!row) return;
      const consignor = row['CONSIGNOR'] !== undefined && row['CONSIGNOR'] !== null ? String(row['CONSIGNOR']).trim() : '';
      if (!consignor) return;
      
      const rawStatus = row['LR STATUS'] !== undefined && row['LR STATUS'] !== null ? String(row['LR STATUS']).trim() : '';
      let mappedStatus = STATUS_MAP[rawStatus] || rawStatus;
      
      const lrNo = cleanLrNumber(row['LR NO']);
      const supervisor = row['LD SUPERVISOR'] || (lrNo ? (dMap[lrNo] || '') : '');
      const branchVal = supervisor ? (sMap[supervisor] || '') : '';
      
      let branch = branchVal;
      if (!branch) {
        const inDespatch = lrNo && (despatchDetailsMap[lrNo] || dMap[lrNo]);
        if (inDespatch) {
          branch = "branch missing";
        } else {
          branch = "without despatched delivery";
        }
      }

      const despatchInfo = lrNo ? despatchDetailsMap[lrNo] : null;
      let boxQty = 0;
      if (despatchInfo) {
        boxQty = despatchInfo.boxQty || 0;
      } else {
        const boxQtyKey = Object.keys(row).find(k => ['BOXQTY', 'BOXQUANTITY', 'BOX_QTY', 'BOX_QUANTITY', 'BOX'].includes(k.toUpperCase().replace(/[\s_-]/g, '')));
        if (boxQtyKey) {
          boxQty = Number(row[boxQtyKey] || 0);
        }
      }
      
      const deliveryDriver = despatchInfo ? (despatchInfo.deliveryDriver || '') : '';
      const hasPod = lrNo && podMap[lrNo];
      const podDate = hasPod ? (podMap[lrNo].podDate || '') : '';

      const item = {
        lrNo: lrNo,
        date: row['DATE'] !== undefined && row['DATE'] !== null ? String(row['DATE']).trim() : '',
        deliveryTime: row['DELIVERY TIME'] !== undefined && row['DELIVERY TIME'] !== null ? String(row['DELIVERY TIME']).trim() : '',
        deliveryTimeRaw: row['DELIVERY TIME_RAW'] || null,
        despatchNo: row['DESPATCH NO'] !== undefined && row['DESPATCH NO'] !== null ? String(row['DESPATCH NO']).trim() : '',
        despatchDate: row['DESPATCH DATE'] !== undefined && row['DESPATCH DATE'] !== null ? String(row['DESPATCH DATE']).trim() : '',
        consignor: consignor,
        consignee: row['CONSIGNEE'] !== undefined && row['CONSIGNEE'] !== null ? String(row['CONSIGNEE']).trim() : '',
        area: row['DESTINATION'] !== undefined && row['DESTINATION'] !== null ? String(row['DESTINATION']).trim() : '',
        status: mappedStatus,
        delay: null,
        supervisor: supervisor || (branch === 'branch missing' ? 'branch missing' : 'without despatched delivery'),
        branch: branch,
        boxQty: boxQty,
        deliveryDriver: deliveryDriver,
        freight: Number(row['FREIGHT'] || 0),
        amount: Number(row['AMOUNT'] || 0),
        podReceived: !!hasPod,
        podDate: podDate
      };

      if (mappedStatus === 'Cancelled LR' || String(rawStatus).toLowerCase().includes('cancelled')) {
        item.status = 'Cancelled LR';
        cancelledList.push(item);
        return; 
      }
      
      if (consignor.toUpperCase().startsWith('EFF')) {
        totalExcludedConsignors++;
        return;
      }
      
      if (mappedStatus === 'Not Despatched') {
        openCount++;
      } else if (mappedStatus === 'On transit') {
        despatchedCount++;
      } else if (mappedStatus === 'Delivery Process completed.' || String(mappedStatus).toLowerCase().includes('deliver')) {
        item.status = 'Delivery Process completed.';
        deliveredCount++;
        const delay = calculateDelay(item.date, item.deliveryTime, consignor, holidays, excludeSun);
        item.delay = delay;
        
        if (delay !== null) {
          if (delay === 0) delayCounts[0]++;
          else if (delay === 1) delayCounts[1]++;
          else if (delay === 2) delayCounts[2]++;
          else if (delay === 3) delayCounts[3]++;
          else if (delay === 4) delayCounts[4]++;
          else if (delay === 5) delayCounts[5]++;
          else if (delay === 6) delayCounts[6]++;
          else if (delay === 7) delayCounts[7]++;
          else delayCounts['more']++;
        } else {
          delayCounts['invalid']++;
        }
      }

      processed.push(item);
    });

    const activeTotal = deliveredCount + openCount + despatchedCount;

    setData({
      all: processed.filter(p => ['Delivery Process completed.', 'Not Despatched', 'On transit'].includes(p.status)),
      cancelled: cancelledList,
      summary: {
        rawTotal: rows.length,
        activeTotal: activeTotal,
        delivered: deliveredCount,
        openCount,
        despatchedCount,
        cancelledCount: cancelledList.length,
        totalExcludedConsignors,
        delayCounts,
        despatchDetailsMap,
        podMap,
        branchPodSummaryMap
      }
    });
    setSelectedCategory(null);
    setSelectedDestination(null);
    setSelectedConsignor('All');
    setSelectedBranch('All');
  };

  useEffect(() => {
    if (rawRows.length > 0) {
      processData(
        rawRows, 
        customHolidays, 
        excludeSundays, 
        despatchMap, 
        supervisorMap, 
        data?.summary?.despatchDetailsMap || {}, 
        data?.summary?.podMap || {}, 
        data?.summary?.branchPodSummaryMap || {}
      );
    }
  }, [customHolidays, excludeSundays, despatchMap, supervisorMap]);

  const addHolidayDate = async (dateStr) => {
    if (!dateStr || customHolidays.includes(dateStr)) return;
    try {
      const res = await fetch('/api/explorer/create/holidays', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: dateStr, description: 'Custom Holiday' })
      });
      if (res.ok) {
        const result = await res.json();
        const newRow = result.data;
        if (newRow) {
          setHolidaysDbList(prev => [...prev, newRow]);
          const dateOnly = newRow.date ? newRow.date.split('T')[0] : dateStr;
          setCustomHolidays(prev => [...prev, dateOnly]);
        }
      }
    } catch (err) {
      console.error("Error adding holiday:", err);
    }
  };

  const addHoliday = async () => {
    if (newHoliday) {
      await addHolidayDate(newHoliday);
      setNewHoliday('');
    }
  };

  const removeHoliday = async (h) => {
    const holidayObj = holidaysDbList.find(item => {
      const dateOnly = item.date ? item.date.split('T')[0] : '';
      return dateOnly === h;
    });
    if (holidayObj) {
      try {
        const res = await fetch('/api/explorer/delete/holidays', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: holidayObj.id })
        });
        if (res.ok) {
          setCustomHolidays(prev => prev.filter(item => item !== h));
          setHolidaysDbList(prev => prev.filter(item => item.id !== holidayObj.id));
        }
      } catch (err) {
        console.error("Error deleting holiday:", err);
      }
    } else {
      setCustomHolidays(prev => prev.filter(item => item !== h));
    }
  };

  const getDestinationBreakdown = (category) => {
    if (!filteredDashboard) return [];
    let filtered;
    if (category === 'open') {
       filtered = filteredDashboard.all.filter(x => x.status === 'Not Despatched');
    } else if (category === 'transit') {
       filtered = filteredDashboard.all.filter(x => x.status === 'On transit');
    } else if (category === 'cancelled') {
       filtered = filteredDashboard.cancelled;
    } else if (category === 'invalid') {
       filtered = filteredDashboard.all.filter(x => x.status === 'Delivery Process completed.' && x.delay === null);
    } else if (category === 'more') {
       filtered = filteredDashboard.all.filter(x => x.delay > 7 && x.status === 'Delivery Process completed.');
    } else {
       filtered = filteredDashboard.all.filter(x => x.delay === category && x.status === 'Delivery Process completed.');
    }
    const counts = {};
    filtered.forEach(x => {
       counts[x.area] = (counts[x.area] || 0) + 1;
    });
    return Object.entries(counts).sort((a,b) => b[1] - a[1]);
  };

  const getPercentage = (count) => {
    if (!filteredDashboard || filteredDashboard.summary.activeTotal === 0) return '0%';
    return ((count / filteredDashboard.summary.activeTotal) * 100).toFixed(1) + '%';
  };

  const applyAutoFilter = (ws, rowCount, colCount) => {
    if (rowCount > 0 && colCount > 0) {
      const endCol = String.fromCharCode(64 + colCount);
      ws['!autofilter'] = { ref: `A1:${endCol}${rowCount}` };
    }
  };

  const applyDashboardStyles = (ws, rowCount, colCount, sheetType = "default") => {
    const headerStyle = {
      font: { name: "Arial", sz: 12, bold: true, color: { rgb: "FFFFFF" } },
      fill: { fgColor: { rgb: "1E293B" } }, // slate-800
      alignment: { vertical: "center", horizontal: "center" },
      border: {
        top: { style: "thin", color: { auto: 1 } },
        bottom: { style: "thin", color: { auto: 1 } },
        left: { style: "thin", color: { auto: 1 } },
        right: { style: "thin", color: { auto: 1 } }
      }
    };

    const dataStyle = {
      font: { name: "Arial", sz: 11 },
      alignment: { vertical: "center" },
      border: {
        bottom: { style: "thin", color: { rgb: "E2E8F0" } }, // slate-200
        left: { style: "thin", color: { rgb: "E2E8F0" } },
        right: { style: "thin", color: { rgb: "E2E8F0" } }
      }
    };

    const rowShades = [];
    if (sheetType === "despatch" && rowCount > 1) {
      let currentShade = false;
      let lastDateVal = null;
      for (let r = 1; r < rowCount; r++) {
        const dateCellRef = XLSX.utils.encode_cell({ c: 2, r });
        const dateVal = ws[dateCellRef] ? ws[dateCellRef].v : null;
        if (dateVal) {
          const dateStr = String(dateVal).trim();
          if (lastDateVal !== null && dateStr !== lastDateVal) {
            currentShade = !currentShade;
          }
          lastDateVal = dateStr;
        }
        rowShades[r] = currentShade;
      }
    }

    for (let r = 0; r < rowCount; r++) {
      for (let c = 0; c < colCount; c++) {
        const cellRef = XLSX.utils.encode_cell({ c, r });
        if (!ws[cellRef]) continue;

        const val = ws[cellRef].v;

        // Check if this row is a header row (either row 0, or containing header labels like "Rank" and "Driver Name")
        const isHeaderCell = r === 0 || (typeof val === 'string' && ["Rank", "Driver Name"].includes(val));

        if (isHeaderCell && sheetType !== "summary") {
          ws[cellRef].s = headerStyle;
        } else if (sheetType === "summary") {
          if (val === "DELIVERY DELAY REPORT - SUMMARY") {
            ws[cellRef].s = { font: { name: "Arial", sz: 16, bold: true, color: { rgb: "0F172A" } } };
          } else if (["OVERALL STATS", "DELAY BREAKDOWN (Delivered Only)", "COUNT", "% (of Active)", "VISUAL CHART"].includes(val)) {
            ws[cellRef].s = headerStyle;
          } else {
            ws[cellRef].s = dataStyle;
            if (val === "A) Total LR Count (Except Cancelled & EFF)") {
              ws[cellRef].s = { font: { name: "Arial", sz: 12, bold: true, color: { rgb: "FFFFFF" } }, fill: { fgColor: { rgb: "334155" } } };
              const countCell = XLSX.utils.encode_cell({ c: c+1, r });
              if (ws[countCell]) ws[countCell].s = { font: { name: "Arial", sz: 12, bold: true, color: { rgb: "FFFFFF" } }, fill: { fgColor: { rgb: "334155" } } };
            }
          }
        } else if (sheetType === "despatch" && r > 0) {
          ws[cellRef].s = rowShades[r]
            ? { ...dataStyle, fill: { fgColor: { rgb: "EFF6FF" } } } // soft blue background for alternate date block
            : dataStyle;
        } else {
          ws[cellRef].s = dataStyle;
        }

        // Apply progress bar style override
        if (typeof val === 'string' && (val.includes('█') || val.includes('░'))) {
          const match = val.match(/(\d+)%/);
          const pct = match ? parseInt(match[1], 10) : 0;
          
          let colorRgb = "0284C7"; // default blue (sky/blue-600)
          
          if (sheetType === "leaderboard" && c === 9) {
            // For Delay Chart: high delay percentage is RED (bad), low delay percentage is GREEN (good)
            if (pct >= 70) {
              colorRgb = "DC2626"; // red
            } else if (pct < 40) {
              colorRgb = "059669"; // green
            }
          } else {
            // Normal progress bar coloring
            if (pct >= 70) {
              colorRgb = "059669"; // green
            } else if (pct < 40) {
              colorRgb = "DC2626"; // red
            }
          }
          
          ws[cellRef].s = {
            font: { name: "Courier New", sz: 11, bold: true, color: { rgb: colorRgb } },
            alignment: { vertical: "center", horizontal: "left" },
            border: {
              bottom: { style: "thin", color: { rgb: "E2E8F0" } },
              left: { style: "thin", color: { rgb: "E2E8F0" } },
              right: { style: "thin", color: { rgb: "E2E8F0" } }
            }
          };
        }
      }
    }
  };

  const handleExportExcel = () => {
    if (!filteredDashboard) return;
    const wb = XLSX.utils.book_new();

    const getProgressBar = (val, max = 100) => {
      if (!max || max <= 0) return '░░░░░░░░░░ 0%';
      const bars = 10;
      const filled = Math.min(bars, Math.max(0, Math.round((val / max) * bars)));
      const empty = bars - filled;
      const pct = Math.round((val / max) * 100);
      return '█'.repeat(filled) + '░'.repeat(empty) + ` ${pct}%`;
    };

    const activeTotal = filteredDashboard.summary.activeTotal || 1;

    const wsSummaryData = [
      ["DELIVERY DELAY REPORT - SUMMARY"],
      [""],
      ["OVERALL STATS", "COUNT", "% (of Active)", "VISUAL CHART"],
      ["Total LRs in File", filteredDashboard.summary.rawTotal, "-", ""],
      ["Cancelled LRs", filteredDashboard.summary.cancelledCount, "-", ""],
      ["Excluded EFF LRs", filteredDashboard.summary.totalExcludedConsignors, "-", ""],
      [""],
      ["A) Total LR Count (Except Cancelled & EFF)", filteredDashboard.summary.activeTotal, "100%", getProgressBar(filteredDashboard.summary.activeTotal, filteredDashboard.summary.activeTotal)],
      ["Delivered", filteredDashboard.summary.delivered, getPercentage(filteredDashboard.summary.delivered), getProgressBar(filteredDashboard.summary.delivered, activeTotal)],
      ["Not Despatched (Open)", filteredDashboard.summary.openCount, getPercentage(filteredDashboard.summary.openCount), getProgressBar(filteredDashboard.summary.openCount, activeTotal)],
      ["On Transit (Despatched)", filteredDashboard.summary.despatchedCount, getPercentage(filteredDashboard.summary.despatchedCount), getProgressBar(filteredDashboard.summary.despatchedCount, activeTotal)],
      [""],
      ["DELAY BREAKDOWN (Delivered Only)", "COUNT", "% (of Active)", "VISUAL CHART"],
      ["Same Day (0)", filteredDashboard.summary.delayCounts[0], getPercentage(filteredDashboard.summary.delayCounts[0]), getProgressBar(filteredDashboard.summary.delayCounts[0], activeTotal)],
      ["Next Day (1)", filteredDashboard.summary.delayCounts[1], getPercentage(filteredDashboard.summary.delayCounts[1]), getProgressBar(filteredDashboard.summary.delayCounts[1], activeTotal)],
      ["2nd Day", filteredDashboard.summary.delayCounts[2], getPercentage(filteredDashboard.summary.delayCounts[2]), getProgressBar(filteredDashboard.summary.delayCounts[2], activeTotal)],
      ["3rd Day", filteredDashboard.summary.delayCounts[3], getPercentage(filteredDashboard.summary.delayCounts[3]), getProgressBar(filteredDashboard.summary.delayCounts[3], activeTotal)],
      ["4th Day", filteredDashboard.summary.delayCounts[4], getPercentage(filteredDashboard.summary.delayCounts[4]), getProgressBar(filteredDashboard.summary.delayCounts[4], activeTotal)],
      ["5th Day", filteredDashboard.summary.delayCounts[5], getPercentage(filteredDashboard.summary.delayCounts[5]), getProgressBar(filteredDashboard.summary.delayCounts[5], activeTotal)],
      ["6th Day", filteredDashboard.summary.delayCounts[6], getPercentage(filteredDashboard.summary.delayCounts[6]), getProgressBar(filteredDashboard.summary.delayCounts[6], activeTotal)],
      ["7th Day", filteredDashboard.summary.delayCounts[7], getPercentage(filteredDashboard.summary.delayCounts[7]), getProgressBar(filteredDashboard.summary.delayCounts[7], activeTotal)],
      ["> 7 Days", filteredDashboard.summary.delayCounts['more'], getPercentage(filteredDashboard.summary.delayCounts['more']), getProgressBar(filteredDashboard.summary.delayCounts['more'], activeTotal)]
    ];
    
    if (filteredDashboard.summary.delayCounts['invalid'] > 0) {
      wsSummaryData.push(["No Date Info / Invalid", filteredDashboard.summary.delayCounts['invalid'], getPercentage(filteredDashboard.summary.delayCounts['invalid']), getProgressBar(filteredDashboard.summary.delayCounts['invalid'], activeTotal)]);
    }

    const wsSummary = XLSX.utils.aoa_to_sheet(wsSummaryData);
    wsSummary['!cols'] = [{ wch: 45 }, { wch: 15 }, { wch: 15 }, { wch: 25 }];
    applyDashboardStyles(wsSummary, wsSummaryData.length, 4, "summary");
    XLSX.utils.book_append_sheet(wb, wsSummary, "1. Overall Summary");

    const destMap = {};
    const addCount = (dest, catKey) => {
        if (!dest) dest = 'UNKNOWN';
        if (!destMap[dest]) destMap[dest] = { total: 0 };
        destMap[dest][catKey] = (destMap[dest][catKey] || 0) + 1;
        destMap[dest].total++;
    };

    filteredDashboard.all.forEach(x => {
        if (x.status === 'Not Despatched') {
            addCount(x.area, 'open');
        } else if (x.status === 'On transit') {
            addCount(x.area, 'transit');
        } else if (x.status === 'Delivery Process completed.') {
            if (x.delay === null) addCount(x.area, 'invalid');
            else if (x.delay > 7) addCount(x.area, 'more');
            else addCount(x.area, x.delay);
        }
    });

    filteredDashboard.cancelled.forEach(x => {
        addCount(x.area, 'cancelled');
    });

    const categoriesArray = [
        { key: 0, label: "Same Day (0)" }, { key: 1, label: "Next Day (1)" },
        { key: 2, label: "2nd Day" }, { key: 3, label: "3rd Day" },
        { key: 4, label: "4th Day" }, { key: 5, label: "5th Day" },
        { key: 6, label: "6th Day" }, { key: 7, label: "7th Day" },
        { key: 'more', label: "> 7 Days" }, { key: 'invalid', label: "No Date" },
        { key: 'open', label: "Not Despatched" }, { key: 'transit', label: "On Transit" },
        { key: 'cancelled', label: "Cancelled" }
    ];

    const destHeaders = ["Destination", ...categoriesArray.map(c => c.label), "TOTAL"];
    const wsDestData = [destHeaders];

    const sortedDests = Object.keys(destMap).sort((a,b) => destMap[b].total - destMap[a].total);

    sortedDests.forEach(dest => {
        const row = [dest];
        categoriesArray.forEach(cat => {
            row.push(destMap[dest][cat.key] || 0);
        });
        row.push(destMap[dest].total);
        wsDestData.push(row);
    });

    const wsDest = XLSX.utils.aoa_to_sheet(wsDestData);
    const cols = [{ wch: 35 }];
    for (let i = 0; i < categoriesArray.length + 1; i++) cols.push({ wch: 12 });
    wsDest['!cols'] = cols;
    applyAutoFilter(wsDest, wsDestData.length, destHeaders.length);
    applyDashboardStyles(wsDest, wsDestData.length, destHeaders.length, "default");
    XLSX.utils.book_append_sheet(wb, wsDest, "2. Destination Breakdown");

    // Consignor Breakdown Sheet
    const consignorMap = {};
    const addConsignorCount = (consignor, catKey) => {
        if (!consignor) consignor = 'UNKNOWN';
        if (!consignorMap[consignor]) consignorMap[consignor] = { total: 0 };
        consignorMap[consignor][catKey] = (consignorMap[consignor][catKey] || 0) + 1;
        consignorMap[consignor].total++;
    };

    filteredDashboard.all.forEach(x => {
        if (x.status === 'Not Despatched') {
            addConsignorCount(x.consignor, 'open');
        } else if (x.status === 'On transit') {
            addConsignorCount(x.consignor, 'transit');
        } else if (x.status === 'Delivery Process completed.') {
            if (x.delay === null) addConsignorCount(x.consignor, 'invalid');
            else if (x.delay > 7) addConsignorCount(x.consignor, 'more');
            else addConsignorCount(x.consignor, x.delay);
        }
    });

    filteredDashboard.cancelled.forEach(x => {
        addConsignorCount(x.consignor, 'cancelled');
    });

    const consignorHeaders = ["Consignor", ...categoriesArray.map(c => c.label), "TOTAL"];
    const wsConsignorData = [consignorHeaders];

    const sortedConsignors = Object.keys(consignorMap).sort((a,b) => consignorMap[b].total - consignorMap[a].total);

    sortedConsignors.forEach(consignor => {
        const row = [consignor];
        categoriesArray.forEach(cat => {
            row.push(consignorMap[consignor][cat.key] || 0);
        });
        row.push(consignorMap[consignor].total);
        wsConsignorData.push(row);
    });

    const wsConsignor = XLSX.utils.aoa_to_sheet(wsConsignorData);
    const consignorCols = [{ wch: 35 }];
    for (let i = 0; i < categoriesArray.length + 1; i++) consignorCols.push({ wch: 12 });
    wsConsignor['!cols'] = consignorCols;
    applyAutoFilter(wsConsignor, wsConsignorData.length, consignorHeaders.length);
    applyDashboardStyles(wsConsignor, wsConsignorData.length, consignorHeaders.length, "default");
    XLSX.utils.book_append_sheet(wb, wsConsignor, "3. Consignor Breakdown");

    const getDetailRows = (source) => source.map(x => {
      const row = {
        "LR NO": x.lrNo,
        "AREA": x.area,
      };
      
      if (branchesList.length > 0) {
        row["BRANCH"] = x.branch;
        row["SUPERVISOR"] = x.supervisor;
      }
      
      row["CONSIGNOR"] = x.consignor;
      row["CONSIGNEE"] = x.consignee;
      row["DATE"] = x.date;
      row["DELIVERY TIME"] = x.deliveryTime;
      row["DELAY (DAYS)"] = x.delay !== null ? x.delay : '-';
      row["STATUS"] = x.status;
      
      return row;
    });

    const detailsCols = branchesList.length > 0 
      ? [ { wch: 15 }, { wch: 25 }, { wch: 20 }, { wch: 25 }, { wch: 30 }, { wch: 40 }, { wch: 15 }, { wch: 20 }, { wch: 15 }, { wch: 20 } ]
      : [ { wch: 15 }, { wch: 25 }, { wch: 30 }, { wch: 40 }, { wch: 15 }, { wch: 20 }, { wch: 15 }, { wch: 20 } ];

    const detailColCount = branchesList.length > 0 ? 10 : 8;

    if (filteredDashboard.all.length > 0) {
      const rows = getDetailRows(filteredDashboard.all);
      const wsDetails = XLSX.utils.json_to_sheet(rows);
      wsDetails['!cols'] = detailsCols;
      applyAutoFilter(wsDetails, rows.length + 1, detailColCount); 
      applyDashboardStyles(wsDetails, rows.length + 1, detailColCount, "default");
      XLSX.utils.book_append_sheet(wb, wsDetails, "4. Active LRs");
    }

    if (filteredDashboard.cancelled.length > 0) {
      const rows = getDetailRows(filteredDashboard.cancelled);
      const wsCancelled = XLSX.utils.json_to_sheet(rows);
      wsCancelled['!cols'] = detailsCols;
      applyAutoFilter(wsCancelled, rows.length + 1, detailColCount); 
      applyDashboardStyles(wsCancelled, rows.length + 1, detailColCount, "default");
      XLSX.utils.book_append_sheet(wb, wsCancelled, "5. Cancelled LRs");
    }

    // Branch Breakdown Sheet
    if (branchesList.length > 0) {
      const branchMap = {};
      const addBranchCount = (branch, catKey) => {
          if (!branch) branch = 'N/A';
          if (!branchMap[branch]) branchMap[branch] = { total: 0 };
          branchMap[branch][catKey] = (branchMap[branch][catKey] || 0) + 1;
          branchMap[branch].total++;
      };

      filteredDashboard.all.forEach(x => {
          if (x.status === 'Not Despatched') {
              addBranchCount(x.branch, 'open');
          } else if (x.status === 'On transit') {
              addBranchCount(x.branch, 'transit');
          } else if (x.status === 'Delivery Process completed.') {
              if (x.delay === null) addBranchCount(x.branch, 'invalid');
              else if (x.delay > 7) addBranchCount(x.branch, 'more');
              else addBranchCount(x.branch, x.delay);
          }
      });

      filteredDashboard.cancelled.forEach(x => {
          addBranchCount(x.branch, 'cancelled');
      });

      const branchHeaders = ["Branch", ...categoriesArray.map(c => c.label), "TOTAL"];
      const wsBranchData = [branchHeaders];

      const sortedBranches = Object.keys(branchMap).sort((a,b) => branchMap[b].total - branchMap[a].total);

      sortedBranches.forEach(branch => {
          const row = [branch];
          categoriesArray.forEach(cat => {
              row.push(branchMap[branch][cat.key] || 0);
          });
          row.push(branchMap[branch].total);
          wsBranchData.push(row);
      });

      const wsBranch = XLSX.utils.aoa_to_sheet(wsBranchData);
      const branchCols = [{ wch: 30 }];
      for (let i = 0; i < categoriesArray.length + 1; i++) branchCols.push({ wch: 12 });
      wsBranch['!cols'] = branchCols;
      applyAutoFilter(wsBranch, wsBranchData.length, branchHeaders.length);
      applyDashboardStyles(wsBranch, wsBranchData.length, branchHeaders.length, "default");
      XLSX.utils.book_append_sheet(wb, wsBranch, "6. Branch Breakdown");
    }

    if (despatchReportData.length > 0) {
      const despatchHeaders = ["Branch", "Despatch No", "Despatch Date", "Total LR count", "Total Delivery Point", "Delivery Driver", "Box Qty", "First Delivery Time", "Last Delivery Time"];
      const wsDespatchData = [despatchHeaders];
      
      despatchReportData.forEach(d => {
        wsDespatchData.push([
          d.branch,
          d.despatchNo,
          d.despatchDate,
          d.totalLrCount,
          d.totalDelivery,
          d.deliveryDriver,
          d.totalBoxQty,
          d.firstDeliveryTime,
          d.lastDeliveryTime
        ]);
      });
      
      const wsDespatch = XLSX.utils.aoa_to_sheet(wsDespatchData);
      const despatchCols = [
        { wch: 20 }, // Branch
        { wch: 15 }, // Despatch No
        { wch: 15 }, // Despatch Date
        { wch: 15 }, // Total LR count
        { wch: 20 }, // Total Delivery Point
        { wch: 20 }, // Delivery Driver
        { wch: 12 }, // Box Qty
        { wch: 25 }, // First Delivery Time
        { wch: 25 }  // Last Delivery Time
      ];
      wsDespatch['!cols'] = despatchCols;
      applyAutoFilter(wsDespatch, wsDespatchData.length, despatchHeaders.length);
      applyDashboardStyles(wsDespatch, wsDespatchData.length, despatchHeaders.length, "despatch");
      XLSX.utils.book_append_sheet(wb, wsDespatch, "Despatch Summary Report");
    }

    if (branchLeaderboardData.length > 0 || driverLeaderboardData.length > 0) {
      const leaderHeaders = ["Rank", "Name", "Type (Branch/Driver)", "Performance Score", "Performance Chart", "Delivered LRs", "Delivery Points", "Delivered Boxes", "Average Delay (Days)", "Delay Chart"];
      const wsLeaderData = [leaderHeaders];
      
      // Sort branches and add
      const sortedBranch = [...branchLeaderboardData].sort((a, b) => b.score - a.score);
      const maxBranchScore = sortedBranch.length > 0 ? sortedBranch[0].score : 1;
      
      // Calculate max branch delay to scale Delay Chart
      const branchDelays = sortedBranch.map(x => x.avgDelay === '-' ? 0 : Number(x.avgDelay));
      const maxBranchDelay = Math.max(...branchDelays, 1);

      sortedBranch.forEach((item, idx) => {
        const itemDelay = item.avgDelay === '-' ? 0 : Number(item.avgDelay);
        wsLeaderData.push([
          idx + 1,
          item.name,
          "Branch",
          item.score,
          getProgressBar(item.score, maxBranchScore),
          item.deliveredLrs,
          item.deliveryPoints,
          item.totalBoxes,
          itemDelay,
          getProgressBar(itemDelay, maxBranchDelay)
        ]);
      });
      
      // Empty separator row
      wsLeaderData.push([]);
      
      // Header for Drivers
      wsLeaderData.push(["Rank", "Driver Name", "Type", "Performance Score", "Performance Chart", "Delivered LRs", "Delivery Points", "Delivered Boxes", "Average Delay (Days)", "Delay Chart"]);
      
      // Sort drivers and add
      const sortedDriver = [...driverLeaderboardData].sort((a, b) => b.score - a.score);
      const maxDriverScore = sortedDriver.length > 0 ? sortedDriver[0].score : 1;

      // Calculate max driver delay to scale Delay Chart
      const driverDelays = sortedDriver.map(x => x.avgDelay === '-' ? 0 : Number(x.avgDelay));
      const maxDriverDelay = Math.max(...driverDelays, 1);

      sortedDriver.forEach((item, idx) => {
        const itemDelay = item.avgDelay === '-' ? 0 : Number(item.avgDelay);
        wsLeaderData.push([
          idx + 1,
          item.name,
          "Driver",
          item.score,
          getProgressBar(item.score, maxDriverScore),
          item.deliveredLrs,
          item.deliveryPoints,
          item.totalBoxes,
          itemDelay,
          getProgressBar(itemDelay, maxDriverDelay)
        ]);
      });
      
      const wsLeader = XLSX.utils.aoa_to_sheet(wsLeaderData);
      const leaderCols = [
        { wch: 8 },  // Rank
        { wch: 25 }, // Name
        { wch: 20 }, // Type
        { wch: 18 }, // Performance Score
        { wch: 25 }, // Performance Chart
        { wch: 15 }, // Delivered LRs
        { wch: 25 }, // Delivery Points
        { wch: 15 }, // Delivered Boxes
        { wch: 22 }, // Average Delay (Days)
        { wch: 25 }  // Delay Chart
      ];
      wsLeader['!cols'] = leaderCols;
      applyAutoFilter(wsLeader, wsLeaderData.length, leaderHeaders.length);
      applyDashboardStyles(wsLeader, wsLeaderData.length, leaderHeaders.length, "leaderboard");
      XLSX.utils.book_append_sheet(wb, wsLeader, "Performance Leaderboard");
    }

    XLSX.writeFile(wb, "Interactive_Delivery_Report.xlsx");
  };

  const delayConfig = [
    { label: 'Same Day', key: 0, color: 'text-emerald-600', bg: 'hover:bg-emerald-100/50' },
    { label: 'Next Day', key: 1, color: 'text-emerald-500', bg: 'hover:bg-emerald-100/50' },
    { label: '2nd Day', key: 2, color: 'text-amber-500', bg: 'hover:bg-amber-100/50' },
    { label: '3rd Day', key: 3, color: 'text-amber-600', bg: 'hover:bg-amber-100/50' },
    { label: '4th Day', key: 4, color: 'text-orange-500', bg: 'hover:bg-orange-100/50' },
    { label: '5th Day', key: 5, color: 'text-orange-600', bg: 'hover:bg-orange-100/50' },
    { label: '6th Day', key: 6, color: 'text-rose-500', bg: 'hover:bg-rose-100/50' },
    { label: '7th Day', key: 7, color: 'text-rose-600', bg: 'hover:bg-rose-100/50' },
    { label: '> 7 Days', key: 'more', color: 'text-rose-700', bg: 'hover:bg-rose-100/50' },
  ];

  if (filteredDashboard?.summary.delayCounts['invalid'] > 0) {
    delayConfig.push({ label: 'No Date Info', key: 'invalid', color: 'text-slate-500', bg: 'hover:bg-slate-200/50' });
  }

  const statusConfig = [
    { label: 'On Transit', key: 'transit', color: 'text-blue-600', bg: 'hover:bg-blue-100/50', val: filteredDashboard?.summary.despatchedCount },
    { label: 'Not Despatched', key: 'open', color: 'text-rose-500', bg: 'hover:bg-rose-100/50', val: filteredDashboard?.summary.openCount },
    { label: 'Cancelled LRs', key: 'cancelled', color: 'text-slate-500', bg: 'hover:bg-slate-200/50', val: filteredDashboard?.summary.cancelledCount }
  ];

  const handleCategoryClick = (key) => {
    if (selectedCategory === key) {
        setSelectedCategory(null);
        setSelectedDestination(null);
    } else {
        setSelectedCategory(key);
        setSelectedDestination(null);
    }
  };

  const getFilteredDetails = () => {
    if (!filteredDashboard) return [];
    
    if (selectedCategory === 'cancelled') {
        let filtered = filteredDashboard.cancelled;
        if (selectedDestination) filtered = filtered.filter(x => x.area === selectedDestination);
        return filtered;
    }

    let filtered = filteredDashboard.all; 
    
    if (selectedCategory === null) {
        return filtered.filter(x => (x.delay !== null && x.delay >= 2 && x.status === 'Delivery Process completed.') || x.status === 'Not Despatched' || x.status === 'On transit');
    }

    if (selectedCategory === 'open') {
        filtered = filtered.filter(x => x.status === 'Not Despatched');
    } else if (selectedCategory === 'transit') {
        filtered = filtered.filter(x => x.status === 'On transit');
    } else if (selectedCategory === 'invalid') {
        filtered = filtered.filter(x => x.status === 'Delivery Process completed.' && x.delay === null);
    } else if (selectedCategory === 'more') {
        filtered = filtered.filter(x => x.delay > 7 && x.status === 'Delivery Process completed.');
    } else {
        filtered = filtered.filter(x => x.delay === selectedCategory && x.status === 'Delivery Process completed.');
    }

    if (selectedDestination) {
        filtered = filtered.filter(x => x.area === selectedDestination);
    }

    return filtered;
  };

  const filteredDetails = getFilteredDetails();

  const getCategoryTitle = () => {
    if (selectedCategory === 'open') return 'Not Despatched (Open)';
    if (selectedCategory === 'transit') return 'On Transit (Despatched)';
    if (selectedCategory === 'cancelled') return 'Cancelled LRs';
    if (selectedCategory === 'invalid') return 'No Date Info (Invalid)';
    if (selectedCategory === 'more') return '> 7 Days Delay';
    if (selectedCategory !== null) return `${selectedCategory} Day${selectedCategory === 1 || selectedCategory === 0 ? '' : 's'} Delay`;
    return 'Delayed >= 2 Days & Non-Delivered';
  };

  return (
    <div className="space-y-6 pb-12 w-full max-w-full overflow-x-hidden">
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 relative">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-4">
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-3">
            <img src="/eff-logo.png" alt="EFF Logo" className="h-9 object-contain" />
            <span className="border-l border-slate-200 pl-3">Delivery Dashboard</span>
          </h2>
          <div className="flex items-center gap-2 flex-wrap">
            {data && (
              <>
                <button 
                  onClick={() => exportToPPT(data, filteredDashboard, branchLeaderboardData, driverLeaderboardData)}
                  className="bg-primary hover:bg-primary/95 text-white transition flex items-center gap-2 text-sm px-4 py-2 rounded-full font-medium shadow-sm cursor-pointer"
                >
                  <FileText size={16} /> Download Presentation (PPT)
                </button>
                <button 
                  onClick={handleExportExcel}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white transition flex items-center gap-2 text-sm px-4 py-2 rounded-full font-medium shadow-sm cursor-pointer"
                >
                  <Download size={16} /> Interactive Excel Export
                </button>
              </>
            )}
            <button 
              onClick={() => setShowConfig(!showConfig)}
              className="text-slate-500 hover:text-primary transition flex items-center gap-2 text-sm bg-slate-50 border border-slate-200 px-3 py-2 rounded-full font-medium"
            >
              <Settings size={16} /> Config
            </button>
          </div>
        </div>

        {showConfig && (
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 mb-6 animate-in fade-in slide-in-from-top-2">
            <h3 className="font-semibold text-slate-700 mb-3 text-sm uppercase tracking-wider">Delay Calculation Settings</h3>
            <div className="space-y-4">
              <label className="flex items-center gap-2 text-slate-700 font-medium cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={excludeSundays} 
                  onChange={(e) => setExcludeSundays(e.target.checked)} 
                  className="w-4 h-4 text-primary rounded border-slate-300 focus:ring-primary"
                />
                Exclude Sundays automatically
              </label>
              
              <div>
                <p className="text-sm text-slate-600 mb-2 font-semibold">Custom Holidays (അവധി ദിവസങ്ങൾ)</p>
                <div className="flex flex-wrap gap-2 mb-3">
                  {customHolidays.map((h, i) => (
                    <span key={i} className="bg-white border border-slate-200 text-slate-700 px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-2 shadow-sm animate-in zoom-in-95">
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                      {h}
                      <button onClick={() => removeHoliday(h)} className="text-slate-400 hover:text-rose-500 transition cursor-pointer">
                        <X size={14} />
                      </button>
                    </span>
                  ))}
                  {customHolidays.length === 0 && (
                    <span className="text-sm text-slate-400 italic">No custom holidays set.</span>
                  )}
                </div>
                
                <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center bg-white p-3 rounded-xl border border-slate-200">
                  <div className="flex gap-2 items-center flex-1">
                    <span className="text-xs text-slate-500 font-bold uppercase whitespace-nowrap">Add via Calendar:</span>
                    <input 
                      type="date" 
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val) {
                          const parsed = parseLocalInputDate(val);
                          if (parsed) {
                            const formatted = getDateStr(parsed);
                            addHolidayDate(formatted);
                          }
                          e.target.value = ''; // Reset input
                        }
                      }}
                      className="flex-1 bg-slate-50 border border-slate-200 hover:border-slate-350 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer transition-all"
                    />
                  </div>
                  <div className="text-slate-350 text-xs sm:border-l sm:h-5 sm:flex sm:items-center sm:pl-3 select-none">OR</div>
                  <div className="flex gap-2 flex-1">
                    <input 
                      type="text" 
                      placeholder="Type manually: DD/MM/YYYY" 
                      value={newHoliday}
                      onChange={(e) => setNewHoliday(e.target.value)}
                      className="flex-1 bg-slate-50 border border-slate-200 hover:border-slate-350 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                      onKeyDown={(e) => e.key === 'Enter' && addHoliday()}
                    />
                    <button 
                      onClick={addHoliday}
                      className="bg-primary text-white p-1.5 rounded-lg hover:bg-primary/95 transition flex items-center justify-center cursor-pointer shadow-sm"
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
        
        {!data && (
          <div className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center hover:bg-slate-50 transition mt-4">
            <input 
              type="file" 
              accept=".csv,.xls,.xlsx,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" 
              onChange={handleFileUpload} 
              className="hidden" 
              id="csv-upload"
            />
            <label htmlFor="csv-upload" className="cursor-pointer flex flex-col items-center">
              <div className="p-4 bg-primary/10 rounded-full text-primary mb-4">
                {loading ? <Clock className="animate-spin" /> : <Upload size={32} />}
              </div>
              <span className="font-semibold text-slate-700 text-lg">Upload LR Details (CSV or Excel)</span>
              <span className="text-sm text-slate-500 mt-1">Select CSV or multi-sheet Excel file (.xlsx) to generate the report</span>
            </label>
          </div>
        )}
      </div>

      {filteredDashboard && (
        <>
          {/* Holiday Confirmation Banner */}
          {!holidaysConfirmed && customHolidays.length === 0 && (
            <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-3 animate-in fade-in slide-in-from-top-2 shadow-sm text-left">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-100 rounded-xl text-amber-700">
                  <AlertTriangle size={20} />
                </div>
                <div>
                  <p className="font-bold text-amber-900 text-sm">Holiday Check Reminder (ഹോളിഡേ പരിശോധന ഓർമ്മപ്പെടുത്തൽ)</p>
                  <p className="text-xs text-amber-750 mt-0.5 font-medium">
                    You haven't configured any custom holidays for this period. Please make sure to add them if there were holidays to ensure delay reports are accurate.
                  </p>
                </div>
              </div>
              <div className="flex gap-2 self-end md:self-auto">
                <button
                  onClick={() => {
                    setShowConfig(true);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold px-4 py-2 rounded-xl transition cursor-pointer shadow-sm whitespace-nowrap"
                >
                  Configure Holidays
                </button>
                <button
                  onClick={() => setHolidaysConfirmed(true)}
                  className="bg-white hover:bg-slate-50 border border-amber-200 text-amber-900 text-xs font-bold px-4 py-2 rounded-xl transition cursor-pointer shadow-sm whitespace-nowrap"
                >
                  Yes, No Holidays / Confirmed
                </button>
              </div>
            </div>
          )}

          {/* Active Holiday Reminder Banner */}
          {!holidaysConfirmed && customHolidays.length > 0 && (
            <div className="bg-emerald-50 border border-emerald-250 p-4 rounded-2xl mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-3 animate-in fade-in slide-in-from-top-2 shadow-sm text-left">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-100 rounded-xl text-emerald-700">
                  <Check size={20} />
                </div>
                <div>
                  <p className="font-bold text-emerald-950 text-sm">Active Holidays Configured ({customHolidays.length} active holidays)</p>
                  <p className="text-xs text-emerald-750 mt-0.5 font-medium">
                    The report currently accounts for these holidays. Please verify if this is correct or edit them in Settings.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setHolidaysConfirmed(true)}
                className="bg-emerald-600 hover:bg-emerald-750 text-white text-xs font-bold px-4 py-2 rounded-xl transition cursor-pointer shadow-sm self-end md:self-auto whitespace-nowrap"
              >
                Confirm & Dismiss
              </button>
            </div>
          )}

          {/* Tab Switcher */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-6 bg-slate-50 p-2 rounded-2xl border border-slate-200 shadow-inner">
            <button
              onClick={() => setActiveTab('delayReport')}
              className={`py-3 px-4 font-bold text-sm rounded-xl transition-all flex items-center justify-center gap-2 border-2 cursor-pointer shadow-sm ${
                activeTab === 'delayReport' 
                  ? 'bg-primary border-primary text-white shadow-primary/20' 
                  : 'bg-purple-50/40 border-purple-200 text-purple-700 hover:bg-purple-50 hover:text-purple-800'
              }`}
            >
              <Clock size={16} className={activeTab === 'delayReport' ? 'text-white' : 'text-purple-600'} /> 
              LR Delivery Delay Report
            </button>
            <button
              onClick={() => setActiveTab('despatchReport')}
              className={`py-3 px-4 font-bold text-sm rounded-xl transition-all flex items-center justify-center gap-2 border-2 cursor-pointer shadow-sm ${
                activeTab === 'despatchReport' 
                  ? 'bg-primary border-primary text-white shadow-primary/20' 
                  : 'bg-purple-50/40 border-purple-200 text-purple-700 hover:bg-purple-50 hover:text-purple-800'
              }`}
            >
              <Truck size={16} className={activeTab === 'despatchReport' ? 'text-white' : 'text-purple-600'} /> 
              Despatch Summary Report
            </button>
            <button
              onClick={() => setActiveTab('freightAnalysis')}
              className={`py-3 px-4 font-bold text-sm rounded-xl transition-all flex items-center justify-center gap-2 border-2 cursor-pointer shadow-sm ${
                activeTab === 'freightAnalysis' 
                  ? 'bg-primary border-primary text-white shadow-primary/20' 
                  : 'bg-purple-50/40 border-purple-200 text-purple-700 hover:bg-purple-50 hover:text-purple-800'
              }`}
            >
              <DollarSign size={16} className={activeTab === 'freightAnalysis' ? 'text-white' : 'text-purple-605'} /> 
              Freight Analysis
            </button>
            <button
              onClick={() => setActiveTab('performanceLeaderboard')}
              className={`py-3 px-4 font-bold text-sm rounded-xl transition-all flex items-center justify-center gap-2 border-2 cursor-pointer shadow-sm ${
                activeTab === 'performanceLeaderboard' 
                  ? 'bg-primary border-primary text-white shadow-primary/20' 
                  : 'bg-purple-50/40 border-purple-200 text-purple-700 hover:bg-purple-50 hover:text-purple-800'
              }`}
            >
              <Award size={16} className={activeTab === 'performanceLeaderboard' ? 'text-white' : 'text-purple-600'} /> 
              Performance Leaderboard
            </button>
          </div>

          {activeTab === 'delayReport' && (() => {
            const total = filteredDashboard.summary.delivered + filteredDashboard.summary.despatchedCount + filteredDashboard.summary.openCount;
            const pctDelivered = total > 0 ? (filteredDashboard.summary.delivered / total) * 100 : 0;
            const pctTransit = total > 0 ? (filteredDashboard.summary.despatchedCount / total) * 100 : 0;
            const pctOpen = total > 0 ? (filteredDashboard.summary.openCount / total) * 100 : 0;
            
            const circ = 2 * Math.PI * 50; // 314.159
            const strokeDelivered = (pctDelivered / 100) * circ;
            const strokeTransit = (pctTransit / 100) * circ;
            const strokeOpen = (pctOpen / 100) * circ;
            
            return (
              <div className="space-y-6 animate-in fade-in duration-200">
                {/* 1. Top Filter Bar */}
                <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex flex-col xl:flex-row gap-4 items-stretch xl:items-center">
                  {/* Consignor Filter */}
                  <div className="flex-1 space-y-1 text-left relative z-40">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Consignor (ഉപഭോക്താവ്)</label>
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => {
                          setIsConsignorDropdownOpen(!isConsignorDropdownOpen);
                          setIsBranchDropdownOpen(false);
                        }}
                        className="w-full flex items-center justify-between bg-slate-50 border border-slate-200 hover:border-slate-350 rounded-xl px-4 py-2.5 text-left text-sm text-slate-750 font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all cursor-pointer shadow-sm"
                      >
                        <span className="truncate" title={selectedConsignor === 'All' ? 'All Consignors' : selectedConsignor}>
                          {selectedConsignor === 'All' ? 'All Consignors' : selectedConsignor}
                        </span>
                        <div className="flex items-center gap-1.5 pl-2 text-slate-450">
                          {selectedConsignor !== 'All' && (
                            <span 
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedConsignor('All');
                                setConsignorSearchTerm('');
                              }}
                              className="p-1 rounded-full hover:bg-slate-200 hover:text-rose-500 transition-colors animate-fade-in"
                            >
                              <X size={14} />
                            </span>
                          )}
                          {isConsignorDropdownOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </div>
                      </button>

                      {isConsignorDropdownOpen && (
                        <>
                          <div className="fixed inset-0 z-40" onClick={() => setIsConsignorDropdownOpen(false)} />
                          <div className="absolute left-0 mt-2 w-full max-h-80 bg-white border border-slate-100 rounded-xl shadow-xl z-50 overflow-hidden flex flex-col animate-in fade-in slide-in-from-top-2">
                            <div className="p-2 border-b border-slate-100 sticky top-0 bg-white z-10">
                              <div className="relative">
                                <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
                                <input
                                  type="text"
                                  placeholder="Search consignor..."
                                  value={consignorSearchTerm}
                                  onChange={(e) => setConsignorSearchTerm(e.target.value)}
                                  className="w-full pl-9 pr-4 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all placeholder:text-slate-400 font-medium"
                                  onClick={(e) => e.stopPropagation()}
                                />
                              </div>
                            </div>
                            <div className="overflow-y-auto max-h-60 py-1 text-left">
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedConsignor('All');
                                  setIsConsignorDropdownOpen(false);
                                  setConsignorSearchTerm('');
                                }}
                                className={`w-full flex items-center justify-between px-4 py-2.5 text-left text-sm transition-colors ${selectedConsignor === 'All' ? 'bg-emerald-50 text-emerald-700 font-bold' : 'hover:bg-slate-50 text-slate-600'}`}
                              >
                                <span>All Consignors</span>
                                {selectedConsignor === 'All' && <Check size={16} className="text-emerald-600" />}
                              </button>
                              {filteredConsignors.map((c, i) => (
                                <button
                                  key={i}
                                  type="button"
                                  onClick={() => {
                                    setSelectedConsignor(c);
                                    setIsConsignorDropdownOpen(false);
                                    setConsignorSearchTerm('');
                                  }}
                                  className={`w-full flex items-center justify-between px-4 py-2.5 text-left text-sm transition-colors ${selectedConsignor === c ? 'bg-emerald-50 text-emerald-700 font-bold' : 'hover:bg-slate-50 text-slate-600'}`}
                                >
                                  <span className="truncate flex-1 pr-2">{c}</span>
                                  <div className="flex items-center gap-2 flex-shrink-0">
                                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${selectedConsignor === c ? 'bg-emerald-200/50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                                      {consignorCounts[c] || 0}
                                    </span>
                                    {selectedConsignor === c && <Check size={16} className="text-emerald-600" />}
                                  </div>
                                </button>
                              ))}
                              {filteredConsignors.length === 0 && (
                                <p className="text-xs text-slate-400 p-4 text-center">No consignors match your search.</p>
                              )}
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Branch Filter */}
                  <div className="flex-1 space-y-1 text-left relative z-30">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Branch (ശാഖ)</label>
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => {
                          setIsBranchDropdownOpen(!isBranchDropdownOpen);
                          setIsConsignorDropdownOpen(false);
                        }}
                        className="w-full flex items-center justify-between bg-slate-50 border border-slate-200 hover:border-slate-350 rounded-xl px-4 py-2.5 text-left text-sm text-slate-700 font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all cursor-pointer shadow-sm"
                      >
                        <span className="truncate" title={selectedBranch === 'All' ? 'All Branches' : selectedBranch}>
                          {selectedBranch === 'All' ? 'All Branches' : selectedBranch}
                        </span>
                        <div className="flex items-center gap-1.5 pl-2 text-slate-450">
                          {selectedBranch !== 'All' && (
                            <span 
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedBranch('All');
                                setBranchSearchTerm('');
                              }}
                              className="p-1 rounded-full hover:bg-slate-200 hover:text-rose-500 transition-colors animate-fade-in"
                            >
                              <X size={14} />
                            </span>
                          )}
                          {isBranchDropdownOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </div>
                      </button>

                      {isBranchDropdownOpen && (
                        <>
                          <div className="fixed inset-0 z-40" onClick={() => setIsBranchDropdownOpen(false)} />
                          <div className="absolute left-0 mt-2 w-full max-h-80 bg-white border border-slate-100 rounded-xl shadow-xl z-50 overflow-hidden flex flex-col animate-in fade-in slide-in-from-top-2">
                            <div className="p-2 border-b border-slate-100 sticky top-0 bg-white z-10">
                              <div className="relative">
                                <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
                                <input
                                  type="text"
                                  placeholder="Search branch..."
                                  value={branchSearchTerm}
                                  onChange={(e) => setBranchSearchTerm(e.target.value)}
                                  className="w-full pl-9 pr-4 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all placeholder:text-slate-400 font-medium"
                                  onClick={(e) => e.stopPropagation()}
                                />
                              </div>
                            </div>
                            <div className="overflow-y-auto max-h-60 py-1 text-left">
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedBranch('All');
                                  setIsBranchDropdownOpen(false);
                                  setBranchSearchTerm('');
                                }}
                                className={`w-full flex items-center justify-between px-4 py-2.5 text-left text-sm transition-colors ${selectedBranch === 'All' ? 'bg-blue-50 text-blue-700 font-bold' : 'hover:bg-slate-50 text-slate-600'}`}
                              >
                                <span>All Branches</span>
                                {selectedBranch === 'All' && <Check size={16} className="text-blue-600" />}
                              </button>
                              {filteredBranches.map((b, i) => (
                                <button
                                  key={i}
                                  type="button"
                                  onClick={() => {
                                    setSelectedBranch(b);
                                    setIsBranchDropdownOpen(false);
                                    setBranchSearchTerm('');
                                  }}
                                  className={`w-full flex items-center justify-between px-4 py-2.5 text-left text-sm transition-colors ${selectedBranch === b ? 'bg-blue-50 text-blue-700 font-bold' : 'hover:bg-slate-50 text-slate-600'}`}
                                >
                                  <span className="truncate flex-1 pr-2">{b}</span>
                                  <div className="flex items-center gap-2 flex-shrink-0">
                                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${selectedBranch === b ? 'bg-blue-200/50 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>
                                      {branchCounts[b] || 0}
                                    </span>
                                    {selectedBranch === b && <Check size={16} className="text-blue-600" />}
                                  </div>
                                </button>
                              ))}
                              {filteredBranches.length === 0 && (
                                <p className="text-xs text-slate-400 p-4 text-center">No branches match your search.</p>
                              )}
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* LR Date Range Filter */}
                  <div className="flex-1 flex flex-row gap-3 items-stretch relative z-10">
                    <div className="flex-1 space-y-1 text-left">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">LR Date From (തുടക്കം)</label>
                      <input 
                        type="date"
                        value={filterStartDate}
                        onChange={(e) => setFilterStartDate(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 hover:border-slate-350 rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all cursor-pointer shadow-sm"
                      />
                    </div>
                    <div className="flex-1 space-y-1 text-left">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">LR Date To (അവസാനം)</label>
                      <input 
                        type="date"
                        value={filterEndDate}
                        onChange={(e) => setFilterEndDate(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 hover:border-slate-350 rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all cursor-pointer shadow-sm"
                      />
                    </div>
                  </div>

                  {/* Clear Filters Button */}
                  {(selectedConsignor !== 'All' || selectedBranch !== 'All' || filterStartDate || filterEndDate) && (
                    <button
                      onClick={() => {
                        setSelectedConsignor('All');
                        setSelectedBranch('All');
                        setFilterStartDate('');
                        setFilterEndDate('');
                        setConsignorSearchTerm('');
                        setBranchSearchTerm('');
                      }}
                      className="self-end px-4 py-2.5 border border-rose-150 bg-rose-50 hover:bg-rose-100 text-rose-600 hover:text-rose-700 font-bold rounded-xl text-sm transition-all cursor-pointer h-[42px] flex items-center justify-center gap-1.5 shadow-sm"
                    >
                      <X size={16} /> Reset Filters
                    </button>
                  )}
                </div>

                {/* 2. Graphical Status Overview & Summary Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 bg-white p-6 rounded-2xl border border-slate-100 shadow-sm text-left">
                  {/* Left: Donut Chart Graph */}
                  <div className="lg:col-span-4 flex flex-col items-center justify-center p-4 bg-slate-50/50 rounded-2xl border border-slate-100 text-center relative py-6">
                    <h4 className="font-bold text-slate-800 text-sm mb-4 absolute top-4 left-4 flex items-center gap-1.5">
                      <BarChart2 size={16} className="text-emerald-500" /> Delivery Status (ഡെലിവറി നില)
                    </h4>
                    
                    <div className="relative flex items-center justify-center mt-6">
                      <svg width="170" height="170" viewBox="0 0 140 140" className="transform -rotate-90">
                        <circle cx="70" cy="70" r="50" fill="transparent" stroke="#f1f5f9" strokeWidth="14" />
                        {strokeDelivered > 0 && (
                          <circle cx="70" cy="70" r="50" fill="transparent" stroke="#10b981" strokeWidth="14" strokeDasharray={`${strokeDelivered} ${circ}`} strokeDashoffset={0} strokeLinecap="round" />
                        )}
                        {strokeTransit > 0 && (
                          <circle cx="70" cy="70" r="50" fill="transparent" stroke="#3b82f6" strokeWidth="14" strokeDasharray={`${strokeTransit} ${circ}`} strokeDashoffset={-strokeDelivered} strokeLinecap="round" />
                        )}
                        {strokeOpen > 0 && (
                          <circle cx="70" cy="70" r="50" fill="transparent" stroke="#f43f5e" strokeWidth="14" strokeDasharray={`${strokeOpen} ${circ}`} strokeDashoffset={-(strokeDelivered + strokeTransit)} strokeLinecap="round" />
                        )}
                      </svg>
                      
                      <div className="absolute flex flex-col items-center justify-center">
                        <span className="text-3xl font-black text-slate-800">{pctDelivered.toFixed(0)}%</span>
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider font-mono">Delivered</span>
                      </div>
                    </div>

                    {/* Donut Legend */}
                    <div className="flex gap-x-4 gap-y-1.5 justify-center mt-6 flex-wrap text-[11px] font-bold text-slate-600">
                      <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-emerald-500"></span> Delivered ({pctDelivered.toFixed(0)}%)</span>
                      <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-blue-500"></span> Transit ({pctTransit.toFixed(0)}%)</span>
                      <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-rose-500"></span> Open ({pctOpen.toFixed(0)}%)</span>
                    </div>
                  </div>

                  {/* Right: Metrics Grid */}
                  <div className="lg:col-span-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Total Active Card */}
                    <div className="bg-slate-800 p-5 rounded-2xl shadow-sm text-left flex flex-col justify-between relative overflow-hidden">
                      <div className="absolute top-0 right-0 w-24 h-24 bg-white/5 rounded-full transform translate-x-8 -translate-y-8"></div>
                      <div>
                        <p className="text-xs text-slate-400 font-bold uppercase tracking-wide">A) Total Active LRs (ആകെ)</p>
                        <p className="text-4xl font-black text-white mt-1.5">{total}</p>
                      </div>
                      <p className="text-[10px] text-slate-450 mt-4 border-t border-slate-700/60 pt-2 font-medium">Except Cancelled & EFF LRs (100%)</p>
                    </div>
                    
                    {/* Delivered Card */}
                    <div className="bg-white p-5 rounded-2xl border border-slate-200/80 text-left flex flex-col justify-between shadow-sm hover:border-emerald-250 transition-all group">
                      <div>
                        <p className="text-xs text-emerald-600 font-bold uppercase tracking-wide">Delivered (കൈമാറിയവ)</p>
                        <p className="text-3xl font-black text-emerald-600 mt-1.5">{filteredDashboard.summary.delivered}</p>
                      </div>
                      <div className="mt-4">
                        <div className="w-full bg-slate-100 rounded-full h-1.5">
                          <div className="bg-emerald-500 h-1.5 rounded-full transition-all duration-500" style={{ width: `${pctDelivered}%` }}></div>
                        </div>
                        <p className="text-[10px] font-bold text-slate-500 mt-1.5">{pctDelivered.toFixed(1)}% of total active</p>
                      </div>
                    </div>

                    {/* Transit Card */}
                    <div className="bg-white p-5 rounded-2xl border border-slate-200/80 text-left flex flex-col justify-between shadow-sm hover:border-blue-200 transition-all group">
                      <div>
                        <p className="text-xs text-blue-600 font-bold uppercase tracking-wide">On Transit (വഴിയിൽ)</p>
                        <p className="text-3xl font-black text-blue-600 mt-1.5">{filteredDashboard.summary.despatchedCount}</p>
                      </div>
                      <div className="mt-4">
                        <div className="w-full bg-slate-100 rounded-full h-1.5">
                          <div className="bg-blue-500 h-1.5 rounded-full transition-all duration-500" style={{ width: `${pctTransit}%` }}></div>
                        </div>
                        <p className="text-[10px] font-bold text-slate-500 mt-1.5">{pctTransit.toFixed(1)}% of total active</p>
                      </div>
                    </div>

                    {/* Open Card */}
                    <div className="bg-white p-5 rounded-2xl border border-slate-200/80 text-left flex flex-col justify-between shadow-sm hover:border-rose-200 transition-all group">
                      <div>
                        <p className="text-xs text-rose-500 font-bold uppercase tracking-wide">Not Despatched (അയക്കാത്തവ)</p>
                        <p className="text-3xl font-black text-rose-500 mt-1.5">{filteredDashboard.summary.openCount}</p>
                      </div>
                      <div className="mt-4">
                        <div className="w-full bg-slate-100 rounded-full h-1.5">
                          <div className="bg-rose-500 h-1.5 rounded-full transition-all duration-500" style={{ width: `${pctOpen}%` }}></div>
                        </div>
                        <p className="text-[10px] font-bold text-slate-500 mt-1.5">{pctOpen.toFixed(1)}% of total active</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 3. Branch Performance table */}
                {branchesList.length > 0 && (
                  <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                    <div className="bg-gradient-to-r from-blue-50 to-blue-100/30 p-4 border-b border-blue-100 flex justify-between items-center animate-fade-in">
                      <h3 className="font-bold text-blue-800 flex items-center gap-2">
                        <MapPin size={20} className="text-blue-600" /> Branch-wise Performance Summary
                      </h3>
                      <span className="text-xs bg-blue-100 text-blue-800 px-3 py-1.5 rounded-full font-bold border border-blue-200 shadow-sm">
                        {branchesList.length} Branches Active
                      </span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 text-slate-650 font-bold border-b border-slate-100">
                          <tr>
                            <th className="px-6 py-3.5">Branch</th>
                            <th className="px-6 py-3.5 text-center">Active LRs</th>
                            <th className="px-6 py-3.5 text-center">Delivered %</th>
                            <th className="px-6 py-3.5 text-center">Delayed ≥ 2 Days</th>
                            <th className="px-6 py-3.5 text-center">On Transit</th>
                            <th className="px-6 py-3.5 text-center">Not Despatched</th>
                            <th className="px-6 py-3.5 text-center">Avg Delay (Days)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-left">
                          {branchPerformance.map((branch, idx) => (
                            <tr 
                              key={idx} 
                              onClick={() => setSelectedBranch(selectedBranch === branch.name ? 'All' : branch.name)}
                              className={`hover:bg-slate-50/80 transition-colors cursor-pointer ${selectedBranch === branch.name ? 'bg-blue-50/50 font-bold' : ''}`}
                            >
                              <td className="px-6 py-4 font-bold text-slate-800 flex items-center gap-2 flex-wrap">
                                <span className={`w-2.5 h-2.5 rounded-full ${branch.name === 'N/A' ? 'bg-slate-400' : 'bg-primary'}`}></span>
                                {branch.name}
                              </td>
                              <td className="px-6 py-4 text-center font-semibold text-slate-700">{branch.activeTotal}</td>
                              <td className="px-6 py-4 text-center">
                                <span className="text-emerald-600 font-black">{branch.deliveryRate}</span>
                                <span className="text-[11px] text-slate-400 block">{branch.delivered} LRs</span>
                              </td>
                              <td className="px-6 py-4 text-center">
                                <span className={`font-black ${branch.delayed2DaysPlus > 0 ? 'text-rose-500' : 'text-slate-500'}`}>{branch.delayRate}</span>
                                <span className="text-[11px] text-slate-400 block">{branch.delayed2DaysPlus} LRs</span>
                              </td>
                              <td className="px-6 py-4 text-center text-blue-600 font-bold">{branch.transit}</td>
                              <td className="px-6 py-4 text-center text-rose-500 font-bold">{branch.open}</td>
                              <td className="px-6 py-4 text-center font-black text-slate-700">
                                {branch.avgDelay !== '-' ? `${branch.avgDelay} Days` : '-'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {activeTab === 'despatchReport' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              {/* Despatch Summary Statistics Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-slate-800 p-4 rounded-xl shadow-sm text-center">
                  <p className="text-xs text-slate-400 font-bold uppercase tracking-wide">Total Despatches</p>
                  <p className="text-3xl font-black text-white">{despatchReportData.length}</p>
                  <p className="text-xs text-slate-400 mt-1">Based on current filters</p>
                </div>
                <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col justify-center text-center">
                  <p className="text-sm text-indigo-600 font-bold uppercase tracking-wide">Total LRs Dispatched</p>
                  <p className="text-2xl font-black text-indigo-600">
                    {despatchReportData.reduce((sum, d) => sum + (d.rawLrCount || 0), 0)} LRs
                  </p>
                </div>
                <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col justify-center text-center">
                  <p className="text-sm text-emerald-600 font-bold uppercase tracking-wide">Total Deliveries Scheduled</p>
                  <p className="text-2xl font-black text-emerald-600">
                    {despatchReportData.reduce((sum, d) => sum + (d.rawDeliveryCount || 0), 0)} Deliveries
                  </p>
                  <p className="text-xs text-slate-450 mt-0.5 font-medium">(Unique Consignees per Despatch)</p>
                </div>
              </div>

              {/* Despatch Filter Bar */}
              <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex flex-col gap-4">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-end">
                  {/* Branch Picklist Filter */}
                  <div className="lg:col-span-2 space-y-1 text-left">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Branch</label>
                    <select
                      value={selectedBranch}
                      onChange={(e) => setSelectedBranch(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 hover:border-slate-350 rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all cursor-pointer shadow-sm"
                    >
                      <option value="All">All Branches</option>
                      {despatchBranchesList.map((b, i) => (
                        <option key={i} value={b}>{b}</option>
                      ))}
                    </select>
                  </div>

                  {/* Despatch Date Range Filter */}
                  <div className="lg:col-span-4 flex flex-row gap-3 items-stretch">
                    <div className="flex-1 space-y-1 text-left">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider text-indigo-600">Despatch Date From</label>
                      <input 
                        type="date"
                        value={despatchStartDateFilter}
                        onChange={(e) => setDespatchStartDateFilter(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 hover:border-slate-350 rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all cursor-pointer shadow-sm"
                      />
                    </div>
                    <div className="flex-1 space-y-1 text-left">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider text-indigo-600">Despatch Date To</label>
                      <input 
                        type="date"
                        value={despatchEndDateFilter}
                        onChange={(e) => setDespatchEndDateFilter(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 hover:border-slate-350 rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all cursor-pointer shadow-sm"
                      />
                    </div>
                  </div>

                  {/* LR Date Range Filter */}
                  <div className="lg:col-span-4 flex flex-row gap-3 items-stretch">
                    <div className="flex-1 space-y-1 text-left">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider text-emerald-600">LR Date From</label>
                      <input 
                        type="date"
                        value={despatchLrStartDateFilter}
                        onChange={(e) => setDespatchLrStartDateFilter(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 hover:border-slate-350 rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all cursor-pointer shadow-sm"
                      />
                    </div>
                    <div className="flex-1 space-y-1 text-left">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider text-emerald-600">LR Date To</label>
                      <input 
                        type="date"
                        value={despatchLrEndDateFilter}
                        onChange={(e) => setDespatchLrEndDateFilter(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 hover:border-slate-350 rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all cursor-pointer shadow-sm"
                      />
                    </div>
                  </div>

                  {/* GDM No / Despatch No Search */}
                  <div className="lg:col-span-2 space-y-1 text-left">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">GDM No</label>
                    <div className="relative">
                      <Search className="absolute left-3 top-3 text-slate-400" size={16} />
                      <input
                        type="text"
                        placeholder="Search GDM..."
                        value={despatchGdmFilter}
                        onChange={(e) => setDespatchGdmFilter(e.target.value)}
                        className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 hover:border-slate-350 rounded-xl text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all placeholder:text-slate-400 shadow-sm"
                      />
                    </div>
                  </div>
                </div>

                {/* Clear filters if active */}
                {(selectedBranch !== 'All' || despatchStartDateFilter || despatchEndDateFilter || despatchLrStartDateFilter || despatchLrEndDateFilter || despatchGdmFilter) && (
                  <div className="flex justify-end pt-1">
                    <button
                      onClick={() => {
                        setSelectedBranch('All');
                        setDespatchStartDateFilter('');
                        setDespatchEndDateFilter('');
                        setDespatchLrStartDateFilter('');
                        setDespatchLrEndDateFilter('');
                        setDespatchGdmFilter('');
                      }}
                      className="px-4 py-2.5 border border-rose-100 bg-rose-50 text-rose-600 hover:bg-rose-100 hover:text-rose-700 font-bold rounded-xl text-sm transition-all cursor-pointer shadow-sm flex items-center gap-1.5"
                    >
                      <X size={16} /> Reset Filters
                    </button>
                  </div>
                )}
              </div>

              {/* Despatch Summary Report Table */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                <div className="bg-indigo-50 p-4 border-b border-indigo-100 flex justify-between items-center rounded-t-2xl">
                  <h3 className="font-bold text-indigo-800 flex items-center gap-2">
                    <Truck size={20} className="text-indigo-600" /> Despatch Summary Report
                  </h3>
                  <span className="text-xs bg-indigo-200 text-indigo-850 px-3 py-1.5 rounded-full font-bold border border-indigo-300 shadow-sm">
                    {despatchReportData.length} Despatches Shown
                  </span>
                </div>
                <div className="overflow-x-auto max-h-[600px]">
                  <table className="w-full text-sm text-left relative">
                    <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-100 sticky top-0 z-10 shadow-sm">
                      <tr>
                        <th className="px-6 py-3.5">Branch</th>
                        <th className="px-6 py-3.5">Despatch No</th>
                        <th className="px-6 py-3.5">Despatch Date</th>
                        <th className="px-6 py-3.5 text-center">Total LR Count</th>
                        <th className="px-6 py-3.5 text-center">Total Delivery Point</th>
                        <th className="px-6 py-3.5">Delivery Driver</th>
                        <th className="px-6 py-3.5 text-center">Box Qty</th>
                        <th className="px-6 py-3.5">First Delivery Time</th>
                        <th className="px-6 py-3.5">Last Delivery Time</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {despatchReportData.length > 0 ? (
                        despatchReportData.map((despatch, idx) => (
                          <tr key={idx} className={`${despatch.bgClass} hover:bg-indigo-50/30 transition-colors`}>
                            <td className="px-6 py-4 font-bold text-slate-800">{despatch.branch}</td>
                            <td className="px-6 py-4 font-semibold text-indigo-600">{despatch.despatchNo}</td>
                            <td className="px-6 py-4 text-slate-500">{despatch.despatchDate}</td>
                            <td className="px-6 py-4 text-center text-slate-700 font-medium">{despatch.totalLrCount}</td>
                            <td className="px-6 py-4 text-center font-semibold text-emerald-600">{despatch.totalDelivery}</td>
                            <td className="px-6 py-4 text-slate-700">{despatch.deliveryDriver}</td>
                            <td className="px-6 py-4 text-center font-semibold text-indigo-600">{despatch.totalBoxQty}</td>
                            <td className="px-6 py-4 text-slate-500 font-mono text-xs">{despatch.firstDeliveryTime}</td>
                            <td className="px-6 py-4 text-slate-500 font-mono text-xs">{despatch.lastDeliveryTime}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={9} className="px-6 py-16 text-center text-slate-400 font-medium text-lg">
                            No despatch records match the current filter.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'delayReport' && (
            <>
              <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-visible transition-all">
                <div className="bg-emerald-50 p-4 border-b border-emerald-100 flex flex-col sm:flex-row justify-between sm:items-center gap-2 rounded-t-2xl">
                  <h3 className="font-bold text-emerald-800 flex items-center gap-2">
                    <BarChart2 size={20} /> Summarised Delivery Report
                  </h3>
                  <span className="text-xs text-emerald-700 bg-emerald-200/50 px-2 py-1 rounded font-medium">
                    Click any box to view destination details
                  </span>
                </div>
                
                <div className="p-4 grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-9 xl:grid-cols-12 gap-3 overflow-x-auto">
                  
                  {delayConfig.map((item) => (
                    <div 
                      key={item.key}
                      onClick={() => handleCategoryClick(item.key)}
                      className={`cursor-pointer transition-all border p-2 rounded-xl text-center shadow-sm flex flex-col justify-center ${item.bg} ${selectedCategory === item.key ? 'border-primary ring-2 ring-primary/20 bg-slate-50 scale-[1.02]' : 'border-slate-200 bg-slate-50 hover:border-slate-300'}`}
                    >
                      <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">{item.label}</p>
                      <p className={`text-xl font-black mt-1 ${item.color}`}>{filteredDashboard.summary.delayCounts[item.key]}</p>
                      <p className="text-[10px] font-bold text-slate-400 mt-1 bg-white rounded-md mx-2 border border-slate-100">{getPercentage(filteredDashboard.summary.delayCounts[item.key])}</p>
                    </div>
                  ))}

                  {statusConfig.map((item) => (
                    <div 
                      key={item.key}
                      onClick={() => handleCategoryClick(item.key)}
                      className={`cursor-pointer transition-all border p-2 rounded-xl text-center shadow-sm flex flex-col justify-center ${item.bg} ${selectedCategory === item.key ? 'border-primary ring-2 ring-primary/20 bg-slate-50 scale-[1.02]' : 'border-slate-200 bg-slate-50 hover:border-slate-300'}`}
                    >
                      <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">{item.label}</p>
                      <p className={`text-xl font-black mt-1 ${item.color}`}>{item.val}</p>
                      {item.key !== 'cancelled' && <p className="text-[10px] font-bold text-slate-400 mt-1 bg-white rounded-md mx-2 border border-slate-100">{getPercentage(item.val)}</p>}
                    </div>
                  ))}

                </div>



                {selectedCategory !== null && (
                  <div className="border-t border-slate-200 bg-slate-100/50 p-5 animate-in fade-in slide-in-from-top-4 relative rounded-b-2xl">
                    <h4 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                      <MapPin size={18} className="text-primary" /> 
                      Destination Breakdown: <span className="text-primary">{getCategoryTitle()}</span>
                    </h4>
                    
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 max-h-60 overflow-y-auto pr-2 pb-2">
                      {getDestinationBreakdown(selectedCategory).map(([area, count], idx) => {
                        const isSelected = selectedDestination === area;
                        return (
                          <div 
                            key={idx} 
                            onClick={() => setSelectedDestination(isSelected ? null : area)}
                            className={`cursor-pointer px-3 py-2 rounded-lg border flex justify-between items-center shadow-sm transition-colors ${isSelected ? 'bg-primary border-primary text-white' : 'bg-white border-slate-200 hover:border-primary/50'}`}
                          >
                            <span className={`text-xs font-semibold truncate mr-2 ${isSelected ? 'text-white' : 'text-slate-700'}`} title={area}>{area}</span>
                            <span className={`text-xs font-black px-2 py-0.5 rounded-md ${isSelected ? 'bg-white/20 text-white' : 'bg-primary/10 text-primary'}`}>{count}</span>
                          </div>
                        );
                      })}
                      {getDestinationBreakdown(selectedCategory).length === 0 && (
                        <p className="text-sm text-slate-500 col-span-full bg-white p-3 rounded-lg border border-dashed border-slate-300 text-center">No items found for this category.</p>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                <div className="bg-slate-50 p-4 border-b border-slate-200 flex flex-col sm:flex-row justify-between sm:items-center gap-3">
                  <h3 className="font-bold text-slate-800 flex items-center gap-2 text-sm sm:text-base">
                    <Search size={20} className="flex-shrink-0 text-primary" /> 
                    Detailed Deliveries: {getCategoryTitle()}
                    {selectedDestination ? ` - ${selectedDestination}` : ''}
                  </h3>
                  <span className="text-xs bg-slate-200 text-slate-800 px-3 py-1.5 rounded-full font-bold whitespace-nowrap border border-slate-300 shadow-sm">
                    {filteredDetails.length} Records Shown
                  </span>
                </div>
                <div className="overflow-x-auto max-h-[600px]">
                  <table className="w-full text-sm text-left relative">
                    <thead className="bg-slate-100 text-slate-600 font-bold border-b-2 border-slate-200 sticky top-0 shadow-sm z-10">
                      <tr>
                        <th className="px-4 py-3 whitespace-nowrap">LR NO</th>
                        <th className="px-4 py-3 whitespace-nowrap">AREA</th>
                        {branchesList.length > 0 && (
                          <>
                            <th className="px-4 py-3 whitespace-nowrap">BRANCH</th>
                            <th className="px-4 py-3 whitespace-nowrap">SUPERVISOR</th>
                          </>
                        )}
                        <th className="px-4 py-3 whitespace-nowrap">CONSIGNOR</th>
                        <th className="px-4 py-3 min-w-[200px]">CONSIGNEE</th>
                        <th className="px-4 py-3 whitespace-nowrap">DATE</th>
                        <th className="px-4 py-3 whitespace-nowrap">DELIVERY TIME</th>
                        <th className="px-4 py-3 text-center whitespace-nowrap">DELAY</th>
                        <th className="px-4 py-3 whitespace-nowrap">STATUS</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredDetails.length > 0 ? filteredDetails.map((item, i) => (
                        <tr key={i} className="hover:bg-blue-50/50 transition-colors">
                          <td className="px-4 py-3 font-bold text-slate-800 whitespace-nowrap">{item.lrNo}</td>
                          <td className="px-4 py-3 font-medium text-slate-700 whitespace-nowrap">{item.area}</td>
                          {branchesList.length > 0 && (
                            <>
                              <td className="px-4 py-3 font-semibold text-blue-600 whitespace-nowrap">{item.branch}</td>
                              <td className="px-4 py-3 font-medium text-slate-700 whitespace-nowrap">{item.supervisor}</td>
                            </>
                          )}
                          <td className="px-4 py-3 font-semibold text-slate-600 whitespace-nowrap">{item.consignor}</td>
                          <td className="px-4 py-3 text-slate-600 max-w-[250px] truncate" title={item.consignee}>{item.consignee}</td>
                          <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{item.date}</td>
                          <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{item.deliveryTime}</td>
                          <td className="px-4 py-3 text-center">
                            {item.delay !== null ? (
                              <span className={`px-2 py-1 rounded-md font-bold ${item.delay >= 2 ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                {item.delay}
                              </span>
                            ) : '-'}
                          </td>
                          <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                            <span className="bg-white border border-slate-200 shadow-sm px-2 py-1 rounded text-xs font-semibold text-slate-700">{item.status}</span>
                          </td>
                        </tr>
                      )) : (
                        <tr>
                          <td colSpan={branchesList.length > 0 ? 10 : 8} className="px-4 py-16 text-center text-slate-400 font-medium text-lg">No records match the current filter.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {activeTab === 'freightAnalysis' && (
            <div className="space-y-6 animate-in fade-in duration-200 text-left">
              {/* Total Freight Card */}
              <div className="bg-gradient-to-r from-primary to-indigo-900 p-6 rounded-2xl text-white shadow-md">
                <div className="flex justify-between items-center">
                  <div>
                    <span className="text-xs uppercase tracking-wider font-bold opacity-80">Total Freight Amount (ആകെ ഫ്രൈറ്റ് തുക)</span>
                    <h3 className="text-3xl font-black mt-1">₹{freightAnalysisData.totalFreight.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</h3>
                  </div>
                  <div className="p-3 bg-white/10 rounded-full text-white">
                    <DollarSign size={32} />
                  </div>
                </div>
              </div>

              {/* Three Grid Layout */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* 1. Branch-wise Freight */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                  <h4 className="font-bold text-slate-800 text-base mb-4 flex items-center gap-2">
                    🏢 Branch Wise Freight
                  </h4>
                  <div className="space-y-4">
                    {freightAnalysisData.branches.map((item, idx) => {
                      const maxVal = freightAnalysisData.branches[0]?.amount || 1;
                      const pct = Math.max(5, (item.amount / maxVal) * 100);
                      return (
                        <div key={idx} className="space-y-1">
                          <div className="flex justify-between text-xs font-semibold">
                            <span className="text-slate-700 font-bold">{item.name}</span>
                            <span className="text-primary font-black">₹{item.amount.toLocaleString('en-IN')}</span>
                          </div>
                          <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                            <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                    {freightAnalysisData.branches.length === 0 && (
                      <p className="text-xs text-slate-400 italic text-center py-6">No data available</p>
                    )}
                  </div>
                </div>

                {/* 2. Consignor-wise Freight */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                  <h4 className="font-bold text-slate-800 text-base mb-4 flex items-center gap-2">
                    👤 Consignor Wise Freight
                  </h4>
                  <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                    {freightAnalysisData.consignors.map((item, idx) => {
                      const maxVal = freightAnalysisData.consignors[0]?.amount || 1;
                      const pct = Math.max(5, (item.amount / maxVal) * 100);
                      return (
                        <div key={idx} className="space-y-1">
                          <div className="flex justify-between text-xs font-semibold">
                            <span className="text-slate-700 font-bold truncate max-w-[180px]">{item.name}</span>
                            <span className="text-indigo-650 font-black">₹{item.amount.toLocaleString('en-IN')}</span>
                          </div>
                          <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                            <div className="h-full rounded-full bg-indigo-600" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                    {freightAnalysisData.consignors.length === 0 && (
                      <p className="text-xs text-slate-400 italic text-center py-6">No data available</p>
                    )}
                  </div>
                </div>

                {/* 3. Destination-wise Freight */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                  <h4 className="font-bold text-slate-800 text-base mb-4 flex items-center gap-2">
                    📍 Destination Wise Freight
                  </h4>
                  <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                    {freightAnalysisData.destinations.map((item, idx) => {
                      const maxVal = freightAnalysisData.destinations[0]?.amount || 1;
                      const pct = Math.max(5, (item.amount / maxVal) * 100);
                      return (
                        <div key={idx} className="space-y-1">
                          <div className="flex justify-between text-xs font-semibold">
                            <span className="text-slate-700 font-bold truncate max-w-[180px]">{item.name}</span>
                            <span className="text-emerald-650 font-black">₹{item.amount.toLocaleString('en-IN')}</span>
                          </div>
                          <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                    {freightAnalysisData.destinations.length === 0 && (
                      <p className="text-xs text-slate-400 italic text-center py-6">No data available</p>
                    )}
                  </div>
                </div>

              </div>
            </div>
          )}

          {activeTab === 'performanceLeaderboard' && (
            <div className="space-y-6 animate-in fade-in duration-200 text-left">
              {/* Leaderboard Header Card */}
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  <Award className="text-amber-500" size={24} /> Performance Leaderboard (പെർഫോമൻസ് ലീഡർബോർഡ്)
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Rankings calculated based on Delivery Speed (Low Delay), LR Volume, Unique Delivery Points, and Box Quantities.
                </p>
                <p className="text-xs text-amber-600 bg-amber-50/50 px-2 py-1 rounded border border-amber-100/50 inline-block mt-2 font-semibold">
                  💡 <strong>Avg Delay (Days):</strong> Despatch ചെയ്ത തീയতি മുതൽ Delivery ആകുന്നതുവരെയുള്ള ആകെ ദിവസങ്ങളുടെ ശരാശരി (Avg. Delivery Days). ഞായറാഴ്ചകളും മറ്റ് അവധി ദിവസങ്ങളും ഇതിൽ നിന്നും ഒഴിവാക്കിയിട്ടുണ്ട്.
                </p>
              </div>

              {/* Leaderboard Filter Bar */}
              <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex flex-col gap-4">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-end">
                  {/* Sort Metric Selector */}
                  <div className="lg:col-span-4 space-y-1 text-left">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Sort Metric</label>
                    <select
                      value={leaderboardSortBy}
                      onChange={(e) => setLeaderboardSortBy(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 hover:border-slate-350 rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-500/20 transition-all cursor-pointer shadow-sm"
                    >
                      <option value="score">Performance Score (Overall)</option>
                      <option value="lrs">Delivered LR Count</option>
                      <option value="points">Unique Delivery Points</option>
                      <option value="boxes">Delivered Box Qty</option>
                      <option value="delay">Average Delay (Lowest First)</option>
                    </select>
                  </div>

                  {/* Despatch Date Range Filter */}
                  <div className="lg:col-span-4 flex flex-row gap-3 items-stretch">
                    <div className="flex-1 space-y-1 text-left">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider text-indigo-600">Despatch Date From</label>
                      <input 
                        type="date"
                        value={despatchStartDateFilter}
                        onChange={(e) => setDespatchStartDateFilter(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 hover:border-slate-350 rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-500/20 transition-all cursor-pointer shadow-sm"
                      />
                    </div>
                    <div className="flex-1 space-y-1 text-left">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider text-indigo-600">Despatch Date To</label>
                      <input 
                        type="date"
                        value={despatchEndDateFilter}
                        onChange={(e) => setDespatchEndDateFilter(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 hover:border-slate-350 rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-500/20 transition-all cursor-pointer shadow-sm"
                      />
                    </div>
                  </div>

                  {/* LR Date Range Filter */}
                  <div className="lg:col-span-4 flex flex-row gap-3 items-stretch">
                    <div className="flex-1 space-y-1 text-left">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider text-emerald-600">LR Date From</label>
                      <input 
                        type="date"
                        value={despatchLrStartDateFilter}
                        onChange={(e) => setDespatchLrStartDateFilter(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 hover:border-slate-350 rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-500/20 transition-all cursor-pointer shadow-sm"
                      />
                    </div>
                    <div className="flex-1 space-y-1 text-left">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider text-emerald-600">LR Date To</label>
                      <input 
                        type="date"
                        value={despatchLrEndDateFilter}
                        onChange={(e) => setDespatchLrEndDateFilter(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 hover:border-slate-350 rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-500/20 transition-all cursor-pointer shadow-sm"
                      />
                    </div>
                  </div>
                </div>

                {/* Reset button if active */}
                {(despatchStartDateFilter || despatchEndDateFilter || despatchLrStartDateFilter || despatchLrEndDateFilter) && (
                  <div className="flex justify-end pt-1">
                    <button
                      onClick={() => {
                        setDespatchStartDateFilter('');
                        setDespatchEndDateFilter('');
                        setDespatchLrStartDateFilter('');
                        setDespatchLrEndDateFilter('');
                      }}
                      className="px-4 py-2.5 border border-rose-100 bg-rose-50 text-rose-600 hover:bg-rose-100 hover:text-rose-700 font-bold rounded-xl text-sm transition-all cursor-pointer shadow-sm flex items-center gap-1.5"
                    >
                      <X size={16} /> Reset Date Filters
                    </button>
                  </div>
                )}
              </div>

              {/* Leaderboard Visual Analytics Card */}
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 text-left">
                <h4 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-4 flex items-center gap-2">
                  📊 Performance Leaderboard Charts (വിഷ്വൽ ഗ്രാഫുകൾ)
                </h4>
                
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  {/* Top 5 Branches Chart */}
                  <div className="space-y-4">
                    <h5 className="font-bold text-slate-700 text-sm flex items-center gap-2">
                      🏢 Top 5 Branches (മികച്ച ശാഖകൾ) - {
                        leaderboardSortBy === 'lrs' ? 'by LR Count'
                        : leaderboardSortBy === 'points' ? 'by Delivery Points'
                        : leaderboardSortBy === 'boxes' ? 'by Box Qty'
                        : leaderboardSortBy === 'delay' ? 'by Average Delay'
                        : 'by Performance Score'
                      }
                    </h5>
                    <div className="space-y-3">
                      {sortedBranchLeaderboard.slice(0, 5).map((item, idx) => {
                        let val = item.score;
                        let displayLabel = `${item.score} pts`;
                        let maxVal = sortedBranchLeaderboard[0]?.score || 1;
                        
                        if (leaderboardSortBy === 'lrs') {
                          val = item.deliveredLrs;
                          displayLabel = `${item.deliveredLrs} LRs`;
                          maxVal = sortedBranchLeaderboard[0]?.deliveredLrs || 1;
                        } else if (leaderboardSortBy === 'points') {
                          val = item.deliveryPoints;
                          displayLabel = `${item.deliveryPoints} Points`;
                          maxVal = sortedBranchLeaderboard[0]?.deliveryPoints || 1;
                        } else if (leaderboardSortBy === 'boxes') {
                          val = item.totalBoxes;
                          displayLabel = `${item.totalBoxes} Boxes`;
                          maxVal = sortedBranchLeaderboard[0]?.totalBoxes || 1;
                        } else if (leaderboardSortBy === 'delay') {
                          val = item.avgDelay === '-' ? 0 : Number(item.avgDelay);
                          displayLabel = `${item.avgDelay !== '-' ? item.avgDelay : '0.0'} Days`;
                          const top5Delays = sortedBranchLeaderboard.slice(0, 5).map(x => x.avgDelay === '-' ? 0 : Number(x.avgDelay));
                          const maxDelayInTop5 = Math.max(...top5Delays, 1);
                          maxVal = maxDelayInTop5;
                        }

                        let pct = maxVal > 0 ? Math.max(5, (val / maxVal) * 100) : 5;
                        if (leaderboardSortBy === 'delay') {
                          // Inverse scaling for delay: lowest delay gets the longest bar (best performance)
                          const delays = sortedBranchLeaderboard.slice(0, 5).map(x => x.avgDelay === '-' ? 0 : Number(x.avgDelay)).filter(x => x > 0);
                          const minDelay = delays.length > 0 ? Math.min(...delays) : 0.1;
                          pct = val > 0 ? Math.max(5, (minDelay / val) * 100) : 100;
                        }

                        return (
                          <div key={idx} className="space-y-1 text-left">
                            <div className="flex justify-between text-xs font-semibold">
                              <span className="text-slate-700 flex items-center gap-1">
                                <span className="w-5 text-slate-450 font-bold">{idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx+1}`}</span>
                                <span className="font-bold">{item.name}</span>
                              </span>
                              <span className="text-amber-600 font-black">{displayLabel}</span>
                            </div>
                            <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden shadow-inner">
                              <div 
                                className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-500 transition-all duration-500"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                      {sortedBranchLeaderboard.length === 0 && (
                        <p className="text-xs text-slate-450 text-center py-6">No branch data to display.</p>
                      )}
                    </div>
                  </div>

                  {/* Top 5 Drivers Chart */}
                  <div className="space-y-4">
                    <h5 className="font-bold text-slate-700 text-sm flex items-center gap-2">
                      🚚 Top 5 Drivers (മികച്ച ഡ്രൈവർമാർ) - {
                        leaderboardSortBy === 'lrs' ? 'by LR Count'
                        : leaderboardSortBy === 'points' ? 'by Delivery Points'
                        : leaderboardSortBy === 'boxes' ? 'by Box Qty'
                        : leaderboardSortBy === 'delay' ? 'by Average Delay'
                        : 'by Performance Score'
                      }
                    </h5>
                    <div className="space-y-3">
                      {sortedDriverLeaderboard.slice(0, 5).map((item, idx) => {
                        let val = item.score;
                        let displayLabel = `${item.score} pts`;
                        let maxVal = sortedDriverLeaderboard[0]?.score || 1;
                        
                        if (leaderboardSortBy === 'lrs') {
                          val = item.deliveredLrs;
                          displayLabel = `${item.deliveredLrs} LRs`;
                          maxVal = sortedDriverLeaderboard[0]?.deliveredLrs || 1;
                        } else if (leaderboardSortBy === 'points') {
                          val = item.deliveryPoints;
                          displayLabel = `${item.deliveryPoints} Points`;
                          maxVal = sortedDriverLeaderboard[0]?.deliveryPoints || 1;
                        } else if (leaderboardSortBy === 'boxes') {
                          val = item.totalBoxes;
                          displayLabel = `${item.totalBoxes} Boxes`;
                          maxVal = sortedDriverLeaderboard[0]?.totalBoxes || 1;
                        } else if (leaderboardSortBy === 'delay') {
                          val = item.avgDelay === '-' ? 0 : Number(item.avgDelay);
                          displayLabel = `${item.avgDelay !== '-' ? item.avgDelay : '0.0'} Days`;
                          const top5Delays = sortedDriverLeaderboard.slice(0, 5).map(x => x.avgDelay === '-' ? 0 : Number(x.avgDelay));
                          const maxDelayInTop5 = Math.max(...top5Delays, 1);
                          maxVal = maxDelayInTop5;
                        }

                        let pct = maxVal > 0 ? Math.max(5, (val / maxVal) * 100) : 5;
                        if (leaderboardSortBy === 'delay') {
                          // Inverse scaling for delay: lowest delay gets the longest bar (best performance)
                          const delays = sortedDriverLeaderboard.slice(0, 5).map(x => x.avgDelay === '-' ? 0 : Number(x.avgDelay)).filter(x => x > 0);
                          const minDelay = delays.length > 0 ? Math.min(...delays) : 0.1;
                          pct = val > 0 ? Math.max(5, (minDelay / val) * 100) : 100;
                        }

                        return (
                          <div key={idx} className="space-y-1 text-left">
                            <div className="flex justify-between text-xs font-semibold">
                              <span className="text-slate-700 flex items-center gap-1">
                                <span className="w-5 text-slate-450 font-bold">{idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx+1}`}</span>
                                <span className="font-bold">{item.name}</span>
                              </span>
                              <span className="text-indigo-600 font-black">{displayLabel}</span>
                            </div>
                            <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden shadow-inner">
                              <div 
                                className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-purple-600 transition-all duration-500"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                      {sortedDriverLeaderboard.length === 0 && (
                        <p className="text-xs text-slate-450 text-center py-6">No driver data to display.</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Responsive Columns */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                
                {/* 1. Branch Leaderboard */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                  <div className="bg-gradient-to-r from-amber-50/50 to-amber-100/30 p-4 border-b border-slate-150 flex justify-between items-center">
                    <h4 className="font-bold text-slate-800 flex items-center gap-2">
                      <Award size={18} className="text-amber-500" /> Branches Performance
                    </h4>
                    <span className="text-xs bg-amber-100 text-amber-850 px-2.5 py-1 rounded-full font-bold border border-amber-200 shadow-sm">
                      {sortedBranchLeaderboard.length} Ranked
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-100">
                        <tr>
                          <th className="px-4 py-3 text-center w-12">Rank</th>
                          <th className="px-4 py-3">Branch</th>
                          <th className="px-4 py-3 text-center">Score</th>
                          <th className="px-4 py-3 text-center">LRs</th>
                          <th className="px-4 py-3 text-center">Same & Next Day</th>
                          <th className="px-4 py-3 text-center">2nd Day</th>
                          <th className="px-4 py-3 text-center">3rd Day</th>
                          <th className="px-4 py-3 text-center">4th Day+</th>
                          <th className="px-4 py-3 text-center">POD (Pending)</th>
                          <th className="px-4 py-3 text-center">Points</th>
                          <th className="px-4 py-3 text-center">Boxes</th>
                          <th className="px-4 py-3 text-center">Total Amount</th>
                          <th className="px-4 py-3 text-center">Avg Delay</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {sortedBranchLeaderboard.length > 0 ? (
                          sortedBranchLeaderboard.map((item, idx) => (
                            <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                              <td className="px-4 py-4 text-center font-bold text-base">
                                {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`}
                              </td>
                              <td className="px-4 py-4 font-bold text-slate-800">{item.name}</td>
                              <td className="px-4 py-4 text-center">
                                <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-black border ${idx === 0 ? 'bg-amber-100 text-amber-800 border-amber-250 shadow-sm' : 'bg-slate-100 text-slate-850 border-slate-200'}`}>
                                  {item.score}
                                </span>
                              </td>
                              <td className="px-4 py-4 text-center font-semibold text-slate-700">{item.deliveredLrs}</td>
                              <td className="px-4 py-4 text-center font-semibold text-sky-600">{item.sndCount} ({item.sndRate.toFixed(0)}%)</td>
                              <td className="px-4 py-4 text-center font-semibold text-slate-650">{item.delay2Count} ({item.delay2Rate.toFixed(0)}%)</td>
                              <td className="px-4 py-4 text-center font-semibold text-slate-650">{item.delay3Count} ({item.delay3Rate.toFixed(0)}%)</td>
                              <td className="px-4 py-4 text-center font-semibold text-rose-600">{item.delay4AboveCount} ({item.delay4AboveRate.toFixed(0)}%)</td>
                              <td className="px-4 py-4 text-center font-semibold">
                                <span className={item.pendingCount > 0 ? 'text-rose-600 font-black' : 'text-emerald-600 font-bold'}>
                                  {item.podCount} ({item.podRate.toFixed(0)}%)
                                </span>
                                {item.pendingCount > 0 && (
                                  <span className="text-[10px] block text-rose-500 font-bold">({item.pendingCount} Pending)</span>
                                )}
                              </td>
                              <td className="px-4 py-4 text-center font-semibold text-slate-600">{item.deliveryPoints}</td>
                              <td className="px-4 py-4 text-center font-semibold text-indigo-650">{item.totalBoxes}</td>
                              <td className="px-4 py-4 text-center font-black text-emerald-600">₹{item.totalAmount.toLocaleString('en-IN')}</td>
                              <td className="px-4 py-4 text-center font-black text-slate-700">
                                {item.avgDelay !== '-' ? `${item.avgDelay} Days` : '-'}
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={13} className="px-4 py-16 text-center text-slate-450 font-medium">
                              No branch performance data available.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* 2. Driver Leaderboard */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                  <div className="bg-gradient-to-r from-amber-50/50 to-amber-100/30 p-4 border-b border-slate-150 flex justify-between items-center">
                    <h4 className="font-bold text-slate-800 flex items-center gap-2">
                      <Truck size={18} className="text-amber-500" /> Drivers Performance
                    </h4>
                    <span className="text-xs bg-amber-100 text-amber-850 px-2.5 py-1 rounded-full font-bold border border-amber-200 shadow-sm">
                      {sortedDriverLeaderboard.length} Ranked
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-100">
                        <tr>
                          <th className="px-4 py-3 text-center w-12">Rank</th>
                          <th className="px-4 py-3">Driver</th>
                          <th className="px-4 py-3 text-center">Score</th>
                          <th className="px-4 py-3 text-center">LRs</th>
                          <th className="px-4 py-3 text-center">Same & Next Day</th>
                          <th className="px-4 py-3 text-center">POD (Pending)</th>
                          <th className="px-4 py-3 text-center">Points</th>
                          <th className="px-4 py-3 text-center">Boxes</th>
                          <th className="px-4 py-3 text-center">Avg Delay</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {sortedDriverLeaderboard.length > 0 ? (
                          sortedDriverLeaderboard.map((item, idx) => (
                            <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                              <td className="px-4 py-4 text-center font-bold text-base">
                                {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`}
                              </td>
                              <td className="px-4 py-4 font-bold text-slate-800">{item.name}</td>
                              <td className="px-4 py-4 text-center">
                                <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-black border ${idx === 0 ? 'bg-amber-100 text-amber-800 border-amber-250 shadow-sm' : 'bg-slate-100 text-slate-850 border-slate-200'}`}>
                                  {item.score}
                                </span>
                              </td>
                              <td className="px-4 py-4 text-center font-semibold text-slate-700">{item.deliveredLrs}</td>
                              <td className="px-4 py-4 text-center font-semibold text-sky-600">{item.sndCount} ({item.sndRate.toFixed(0)}%)</td>
                              <td className="px-4 py-4 text-center font-semibold">
                                <span className={item.pendingCount > 0 ? 'text-rose-600 font-black' : 'text-emerald-600 font-bold'}>
                                  {item.podCount} ({item.podRate.toFixed(0)}%)
                                </span>
                                {item.pendingCount > 0 && (
                                  <span className="text-[10px] block text-rose-500 font-bold">({item.pendingCount} Pending)</span>
                                )}
                              </td>
                              <td className="px-4 py-4 text-center font-semibold text-slate-600">{item.deliveryPoints}</td>
                              <td className="px-4 py-4 text-center font-semibold text-indigo-650">{item.totalBoxes}</td>
                              <td className="px-4 py-4 text-center font-black text-slate-700">
                                {item.avgDelay !== '-' ? `${item.avgDelay} Days` : '-'}
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={9} className="px-4 py-16 text-center text-slate-450 font-medium">
                              No driver performance data available.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

              </div>
            </div>
          )}

          <button 
            onClick={() => { 
              setData(null); 
              setRawRows([]); 
              setSelectedConsignor('All'); 
              setSelectedBranch('All');
              setFilterStartDate('');
              setFilterEndDate('');
              setDespatchStartDateFilter('');
              setDespatchEndDateFilter('');
              setDespatchLrStartDateFilter('');
              setDespatchLrEndDateFilter('');
              setDespatchGdmFilter('');
              setDespatchMap({});
              setSupervisorMap({});
            }} 
            className="w-full bg-slate-100 text-slate-700 font-bold py-4 rounded-xl hover:bg-slate-200 hover:text-slate-900 transition-all shadow-sm"
          >
            Upload Another File
          </button>
        </>
      )}
    </div>
  );
}
