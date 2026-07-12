import pptxgen from "pptxgenjs";

export function exportToPPT(data, filteredDashboard, branchLeaderboard, driverLeaderboard) {
  if (!filteredDashboard) {
    alert("No data available to export. Please upload your Excel file first.");
    return;
  }

  try {
    const pptx = new pptxgen();
    
    // Define custom widescreen layout to ensure consistent margins and spacing
    pptx.defineLayout({ name: "EFF_LAYOUT", width: 13.33, height: 7.5 });
    pptx.layout = "EFF_LAYOUT";

    // Brand Theme Colors
    const purple = "5B2482"; // Primary EFF Purple
    const cyan = "00A3E0";   // Accent EFF Cyan
    const slateDark = "1E293B"; // Dark Slate text
    const lightGrey = "F1F5F9"; // Light grey row background

    // Helper to add the header, footer and EFF logo
    const addSlideLayout = (slide, titleText) => {
      // 1. Accent Cyan strip at the very top
      slide.addShape(pptx.ShapeType.rect, {
        x: 0,
        y: 0,
        w: "100%",
        h: 0.1,
        fill: { color: cyan }
      });

      // 2. EFF Brand Logo
      slide.addImage({
        path: "/eff-logo.png",
        x: 0.5,
        y: 0.2,
        w: 1.8,
        h: 0.55
      });

      // 3. Slide Title
      slide.addText(titleText, {
        x: 2.5,
        y: 0.22,
        w: 10.3,
        h: 0.5,
        fontSize: 18,
        bold: true,
        color: purple,
        fontFace: "Arial"
      });

      // 4. Accent dividing line below header
      slide.addShape(pptx.ShapeType.rect, {
        x: 0.5,
        y: 0.85,
        w: 12.33,
        h: 0.02,
        fill: { color: "E2E8F0" }
      });

      // 5. Footer branding
      slide.addText("EFF EVER FIRST & FAST • Delivery Performance Presentation", {
        x: 0.5,
        y: 7.15,
        w: 8.0,
        h: 0.3,
        fontSize: 8.5,
        color: "64748B",
        fontFace: "Arial"
      });

      // 6. Page Numbers (Correct native pptxgenjs API)
      slide.slideNumber = {
        x: 11.5,
        y: 7.15,
        w: 1.3,
        h: 0.3,
        fontSize: 9,
        align: "right",
        color: "64748B",
        fontFace: "Arial"
      };
    };

    const tableHeaderStyle = {
      fill: { color: purple },
      color: "FFFFFF",
      fontSize: 9.5,
      bold: true,
      align: "center",
      valign: "middle"
    };

    const tableRowStyle = {
      fontSize: 9.0,
      bold: true,
      align: "center",
      valign: "middle"
    };

    const multiColHeaderStyle = {
      ...tableHeaderStyle,
      fontSize: 8.0,
      bold: true
    };
    const multiColRowStyle = {
      ...tableRowStyle,
      fontSize: 7.5,
      bold: true
    };

    // Helper for generating tables in parallel columns to fit on a single slide with minimum margins
    const addMultiColumnTable = (titleText, headers, allRows, colW, numColumns = 2, maxRowsPerCol = 26) => {
      const totalRowsPerSlide = maxRowsPerCol * numColumns;
      
      for (let i = 0; i < allRows.length; i += totalRowsPerSlide) {
        const slide = pptx.addSlide();
        const pageNumSuffix = allRows.length > totalRowsPerSlide ? ` (Part ${Math.floor(i / totalRowsPerSlide) + 1})` : "";
        addSlideLayout(slide, titleText + pageNumSuffix);
        
        const slideChunk = allRows.slice(i, i + totalRowsPerSlide);
        
        // Split slideChunk into columns
        for (let colIdx = 0; colIdx < numColumns; colIdx++) {
          const start = colIdx * maxRowsPerCol;
          const end = start + maxRowsPerCol;
          const colRows = slideChunk.slice(start, end);
          
          if (colRows.length === 0) continue;
          
          // Add header to this column's table
          const tableRows = [headers, ...colRows];
          
          // Calculate x position for this column
          const colWidth = (12.33 - (0.4 * (numColumns - 1))) / numColumns;
          const xPos = 0.5 + colIdx * (colWidth + 0.4);
          
          // Scale colW to fit the column width
          const sumOrig = colW.reduce((a, b) => a + b, 0);
          const scaledColW = colW.map(w => (w / sumOrig) * colWidth);
          
          slide.addTable(tableRows, {
            x: xPos,
            y: 0.95, // Shifted up further for maximum vertical space
            w: colWidth,
            colW: scaledColW,
            margin: [2, 4, 2, 4], // Compact cell padding to prevent overflow
            border: { pt: 0.5, color: "CBD5E1" }
          });
        }
      }
    };

    // Helper for calculating branch metrics
    const branchMetrics = {};
    const allItems = filteredDashboard.all || [];
    allItems.forEach(item => {
      const b = item.branch || "without despatched delivery";
      if (!branchMetrics[b]) {
        branchMetrics[b] = { freight: 0, amount: 0 };
      }
      branchMetrics[b].freight += Number(item.freight || 0);
      branchMetrics[b].amount += Number(item.amount || 0);
    });

    const activeBranchLeaderboard = branchLeaderboard || [];
    const sortedLeaderboard = [...activeBranchLeaderboard].sort((a, b) => (b.score || 0) - (a.score || 0));
    const branchNames = sortedLeaderboard.map(b => b.name || "N/A");

    // ==========================================
    // PRE-CALCULATIONS FOR MULTI-COLUMN TABLES (TO PREVENT UNDEFINED ERRORS)
    // ==========================================

    // 1. Customer-Wise Performance data
    const consignorsMerged = {};
    allItems.forEach(item => {
      const c = item.consignor || "N/A";
      if (!consignorsMerged[c]) {
        consignorsMerged[c] = { name: c, totalLrs: 0, delivered: 0, totalDelay: 0, delaysCount: 0, sndCount: 0, freight: 0 };
      }
      consignorsMerged[c].totalLrs++;
      consignorsMerged[c].freight += Number(item.freight || 0);
      if (item.status === 'Delivery Process completed.') {
        consignorsMerged[c].delivered++;
        if (item.delay !== null) {
          consignorsMerged[c].totalDelay += item.delay;
          consignorsMerged[c].delaysCount++;
          if (item.delay <= 1) {
            consignorsMerged[c].sndCount++;
          }
        }
      }
    });

    const sortedConsignorsMerged = Object.values(consignorsMerged)
      .map(c => ({
        name: c.name,
        totalLrs: c.totalLrs,
        delivered: c.delivered,
        sndRate: c.delivered > 0 ? (c.sndCount / c.delivered) * 100 : 0,
        avgDelay: c.delaysCount > 0 ? c.totalDelay / c.delaysCount : 0,
        freight: c.freight
      }))
      .filter(item => item.name.toUpperCase() !== 'TOTAL' && item.name.toUpperCase() !== 'GRAND TOTAL')
      .sort((a, b) => b.freight - a.freight);

    const customerMergedHeaders = [
      { text: "Consignor Name", options: multiColHeaderStyle },
      { text: "Total LRs", options: multiColHeaderStyle },
      { text: "Delivered LRs", options: multiColHeaderStyle },
      { text: "Same & Next Day (%)", options: multiColHeaderStyle },
      { text: "Avg Delay (Days)", options: multiColHeaderStyle },
      { text: "Total Freight Amount (₹)", options: multiColHeaderStyle }
    ];

    const customerMergedDataRows = [];
    sortedConsignorsMerged.forEach((item, idx) => {
      const rowBg = idx % 2 === 1 ? lightGrey : "FFFFFF";
      customerMergedDataRows.push([
        { text: item.name || "N/A", options: { ...multiColRowStyle, align: "left", fill: { color: rowBg } } },
        { text: String(item.totalLrs || 0), options: { ...multiColRowStyle, fill: { color: rowBg } } },
        { text: String(item.delivered || 0), options: { ...multiColRowStyle, fill: { color: rowBg } } },
        { text: `${(item.sndRate || 0).toFixed(0)}%`, options: { ...multiColRowStyle, fill: { color: rowBg } } },
        { 
          text: `${(item.avgDelay || 0).toFixed(1)} Days`, 
          options: { 
            ...multiColRowStyle, 
            fill: { color: rowBg }, 
            color: (item.avgDelay || 0) >= 2.0 ? "B91C1C" : "1E293B" 
          } 
        },
        { text: `₹${(item.freight || 0).toLocaleString("en-IN")}`, options: { ...multiColRowStyle, fill: { color: rowBg }, color: "15803D" } }
      ]);
    });

    let customerTotalLrs = 0;
    let customerDelivered = 0;
    let customerSndCount = 0;
    let customerDelaysCount = 0;
    let customerTotalDelay = 0;
    let customerTotalFreight = 0;

    Object.values(consignorsMerged).forEach(item => {
      if (item.name.toUpperCase() !== 'TOTAL' && item.name.toUpperCase() !== 'GRAND TOTAL') {
        customerTotalLrs += item.totalLrs;
        customerDelivered += item.delivered;
        customerSndCount += item.sndCount;
        customerDelaysCount += item.delaysCount;
        customerTotalDelay += item.totalDelay;
        customerTotalFreight += item.freight;
      }
    });

    const customerAvgSnd = customerDelivered > 0 ? (customerSndCount / customerDelivered) * 100 : 0;
    const customerAvgDelay = customerDelaysCount > 0 ? customerTotalDelay / customerDelaysCount : 0;

    const customerTotalRow = [
      { text: "TOTAL / AVERAGE", options: { ...multiColRowStyle, align: "left", fill: { color: "CBD5E1" } } },
      { text: String(customerTotalLrs), options: { ...multiColRowStyle, fill: { color: "CBD5E1" } } },
      { text: String(customerDelivered), options: { ...multiColRowStyle, fill: { color: "CBD5E1" } } },
      { text: `${customerAvgSnd.toFixed(0)}%`, options: { ...multiColRowStyle, fill: { color: "CBD5E1" } } },
      { text: `${customerAvgDelay.toFixed(1)} Days`, options: { ...multiColRowStyle, fill: { color: "CBD5E1" } } },
      { text: `₹${customerTotalFreight.toLocaleString("en-IN")}`, options: { ...multiColRowStyle, fill: { color: "CBD5E1" }, color: "15803D" } }
    ];
    customerMergedDataRows.push(customerTotalRow);


    // 2. Destination-Wise Performance data
    const destinations = {};
    allItems.forEach(item => {
      const d = item.area || "N/A";
      if (!destinations[d]) {
        destinations[d] = { name: d, totalLrs: 0, deliveredLrs: 0, totalDelay: 0, freight: 0 };
      }
      destinations[d].totalLrs++;
      destinations[d].freight += Number(item.freight || 0);
      if (item.status === 'Delivery Process completed.') {
        destinations[d].deliveredLrs++;
        if (item.delay !== null) {
          destinations[d].totalDelay += item.delay;
        }
      }
    });

    const sortedDestinations = Object.values(destinations)
      .map(d => ({
        name: d.name,
        totalLrs: d.totalLrs,
        avgDelay: d.deliveredLrs > 0 ? d.totalDelay / d.deliveredLrs : 0,
        freight: d.freight
      }))
      .filter(item => item.avgDelay >= 2.0 && item.name.toUpperCase() !== 'TOTAL' && item.name.toUpperCase() !== 'GRAND TOTAL')
      .sort((a, b) => b.avgDelay - a.avgDelay);

    const destinationHeaders = [
      { text: "Destination Area", options: multiColHeaderStyle },
      { text: "Total LRs", options: multiColHeaderStyle },
      { text: "Avg Delay (Days)", options: multiColHeaderStyle },
      { text: "Total Freight Amount (₹)", options: multiColHeaderStyle }
    ];

    const destinationDataRows = [];
    sortedDestinations.forEach((item, idx) => {
      const rowBg = idx % 2 === 1 ? lightGrey : "FFFFFF";
      destinationDataRows.push([
        { text: item.name || "N/A", options: { ...multiColRowStyle, align: "left", fill: { color: rowBg } } },
        { text: String(item.totalLrs || 0), options: { ...multiColRowStyle, fill: { color: rowBg } } },
        { text: `${(item.avgDelay || 0).toFixed(1)} Days`, options: { ...multiColRowStyle, fill: { color: rowBg } } },
        { text: `₹${(item.freight || 0).toLocaleString("en-IN")}`, options: { ...multiColRowStyle, fill: { color: rowBg }, color: "0284C7" } }
      ]);
    });

    let destTotalLrs = 0;
    let destDeliveredLrs = 0;
    let destTotalDelay = 0;
    let destTotalFreight = 0;

    sortedDestinations.forEach(item => {
      destTotalLrs += item.totalLrs;
      destTotalFreight += item.freight;
      const d = destinations[item.name] || {};
      destDeliveredLrs += d.deliveredLrs || 0;
      destTotalDelay += d.totalDelay || 0;
    });

    const destAvgDelay = destDeliveredLrs > 0 ? destTotalDelay / destDeliveredLrs : 0;

    const destTotalRow = [
      { text: "TOTAL / AVERAGE", options: { ...multiColRowStyle, align: "left", fill: { color: "CBD5E1" } } },
      { text: String(destTotalLrs), options: { ...multiColRowStyle, fill: { color: "CBD5E1" } } },
      { text: `${destAvgDelay.toFixed(1)} Days`, options: { ...multiColRowStyle, fill: { color: "CBD5E1" } } },
      { text: `₹${destTotalFreight.toLocaleString("en-IN")}`, options: { ...multiColRowStyle, fill: { color: "CBD5E1" }, color: "0284C7" } }
    ];
    destinationDataRows.push(destTotalRow);


    // ==========================================
    // PAGE 1: DELIVERY DELAY & PERFORMANCE SUMMARY (SET AS FIRST PAGE AS REQUESTED)
    // ==========================================
    const slide1 = pptx.addSlide();
    addSlideLayout(slide1, "DELIVERY DELAY & PERFORMANCE SUMMARY");

    const summary = filteredDashboard.summary || {};
    const deliveredCount = summary.delivered || 0;
    const despatchedCount = summary.despatchedCount || 0;
    const openCount = summary.openCount || 0;
    const cancelledCount = summary.cancelledCount || 0;
    const delayCounts = summary.delayCounts || {};

    const totalActive = deliveredCount + despatchedCount + openCount;
    const delPct = totalActive > 0 ? ((deliveredCount / totalActive) * 100).toFixed(1) : 0;
    const transitPct = totalActive > 0 ? ((despatchedCount / totalActive) * 100).toFixed(1) : 0;
    const openPct = totalActive > 0 ? ((openCount / totalActive) * 100).toFixed(1) : 0;

    const statsBoxY = 1.3;
    const addMetricText = (label, val, yOffset, colorCode = "1E293B") => {
      slide1.addText(label, { x: 0.8, y: yOffset, w: 2.8, h: 0.35, fontSize: 11, color: "475569", bold: true });
      slide1.addText(val, { x: 3.3, y: yOffset, w: 1.6, h: 0.35, fontSize: 12, color: colorCode, bold: true, align: "right" });
    };

    slide1.addShape(pptx.ShapeType.roundRect, {
      x: 0.5,
      y: statsBoxY,
      w: 4.8,
      h: 5.2,
      fill: { color: "F8FAFC" },
      line: { color: "E2E8F0", width: 1 }
    });

    slide1.addText("Overall Delivery Stats", {
      x: 0.8,
      y: statsBoxY + 0.2,
      w: 4.2,
      h: 0.4,
      fontSize: 14,
      bold: true,
      color: purple
    });

    addMetricText("Total Active LRs:", String(totalActive), statsBoxY + 0.8, purple);
    addMetricText("Delivered LRs:", `${deliveredCount} (${delPct}%)`, statsBoxY + 1.35, "15803D");
    addMetricText("On Transit (Transit):", `${despatchedCount} (${transitPct}%)`, statsBoxY + 1.9, "0284C7");
    addMetricText("Not Despatched (Open):", `${openCount} (${openPct}%)`, statsBoxY + 2.45, "B91C1C");
    addMetricText("Cancelled LRs:", String(cancelledCount), statsBoxY + 3.0, "64748B");

    const sndTotal = (delayCounts[0] || 0) + (delayCounts[1] || 0);
    const sndRateOverall = deliveredCount > 0 ? ((sndTotal / deliveredCount) * 100).toFixed(1) : 0;
    slide1.addShape(pptx.ShapeType.rect, { x: 0.8, y: statsBoxY + 3.65, w: 4.2, h: 0.02, fill: { color: "CBD5E1" } });
    addMetricText("Same & Next Day Checkpoint:", `${sndTotal} (${sndRateOverall}%)`, statsBoxY + 3.9, "0F766E");

    const summaryChartData = [
      {
        name: "LR Count",
        labels: ["Same Day (0d)", "Next Day (1d)", "2 Days", "3 Days", "4 Days", "5 Days", "6 Days", "7 Days", ">7 Days"],
        values: [
          delayCounts[0] || 0,
          delayCounts[1] || 0,
          delayCounts[2] || 0,
          delayCounts[3] || 0,
          delayCounts[4] || 0,
          delayCounts[5] || 0,
          delayCounts[6] || 0,
          delayCounts[7] || 0,
          delayCounts["more"] || 0
        ]
      }
    ];

    slide1.addChart(pptx.ChartType.bar, summaryChartData, {
      x: 5.6,
      y: statsBoxY,
      w: 7.2,
      h: 5.2,
      barDir: "col",
      chartColors: [purple],
      showLegend: false,
      showValue: true,
      valueFontSize: 10,
      valueColor: "1E293B",
      title: "Delivered LRs Delay Distribution",
      titleFontSize: 12,
      titleColor: purple,
      titleBold: true
    });


    // ==========================================
    // PAGE 2: BRANCH PERFORMANCE SNAPSHOT (SET AS PAGE 2 AS REQUESTED)
    // ==========================================
    const slide2 = pptx.addSlide();
    addSlideLayout(slide2, "BRANCH PERFORMANCE SNAPSHOT");

    // Prepare table data (Total Amount removed)
    const branchTableRows = [
      [
        { text: "Branch", options: tableHeaderStyle },
        { text: "LRs (Del/Tot)", options: tableHeaderStyle },
        { text: "Same & Next Day", options: tableHeaderStyle },
        { text: "2nd Day", options: tableHeaderStyle },
        { text: "3rd Day", options: tableHeaderStyle },
        { text: "4th Day+", options: tableHeaderStyle },
        { text: "POD (Pending)", options: tableHeaderStyle },
        { text: "Boxes", options: tableHeaderStyle },
        { text: "Points", options: tableHeaderStyle },
        { text: "Freight (₹)", options: tableHeaderStyle },
        { text: "Score", options: tableHeaderStyle },
        { text: "Avg Delay", options: tableHeaderStyle }
      ]
    ];

    // Totals calculations
    let totalTotalLrs = 0;
    let totalDeliveredLrs = 0;
    let totalSndCount = 0;
    let totalDelay2Count = 0;
    let totalDelay3Count = 0;
    let totalDelay4AboveCount = 0;
    let totalPodCount = 0;
    let totalPendingCount = 0;
    let totalTotalBoxes = 0;
    let totalDeliveryPoints = 0;
    let totalFreight = 0;
    let sumScores = 0;
    let totalDelaysForAvg = 0;
    let totalDeliveredLrsForAvg = 0;

    sortedLeaderboard.forEach((item, idx) => {
      const metrics = branchMetrics[item.name] || { freight: 0, amount: 0 };
      const rowBg = idx % 2 === 1 ? lightGrey : "FFFFFF";
      
      const sndRate = item.sndRate || 0;
      const delay2Rate = item.delay2Rate || 0;
      const delay3Rate = item.delay3Rate || 0;
      const delay4AboveRate = item.delay4AboveRate || 0;
      const pendingCount = item.pendingCount || 0;

      // Accumulate totals
      totalTotalLrs += item.totalLrs || 0;
      totalDeliveredLrs += item.deliveredLrs || 0;
      totalSndCount += item.sndCount || 0;
      totalDelay2Count += item.delay2Count || 0;
      totalDelay3Count += item.delay3Count || 0;
      totalDelay4AboveCount += item.delay4AboveCount || 0;
      totalPodCount += item.podCount || 0;
      totalPendingCount += pendingCount;
      totalTotalBoxes += item.totalBoxes || 0;
      totalDeliveryPoints += item.deliveryPoints || 0;
      totalFreight += metrics.freight || 0;
      sumScores += item.score || 0;

      if (item.avgDelay !== "-" && !isNaN(Number(item.avgDelay))) {
        totalDelaysForAvg += Number(item.avgDelay) * (item.deliveredLrs || 0);
        totalDeliveredLrsForAvg += item.deliveredLrs || 0;
      }

      // Check pending count to hide % in pending case as requested
      const podDisplayText = pendingCount > 0
        ? `${item.podCount || 0} (${pendingCount} Pending)`
        : `${item.podCount || 0} (100%)`;

      branchTableRows.push([
        { text: item.name || "N/A", options: { ...tableRowStyle, align: "left", fill: { color: rowBg } } },
        { text: `${item.deliveredLrs || 0} / ${item.totalLrs || 0}`, options: { ...tableRowStyle, fill: { color: rowBg } } },
        { text: `${item.sndCount || 0} (${sndRate.toFixed(0)}%)`, options: { ...tableRowStyle, fill: { color: rowBg }, color: "0284C7" } },
        { text: `${item.delay2Count || 0} (${delay2Rate.toFixed(0)}%)`, options: { ...tableRowStyle, fill: { color: rowBg } } },
        { text: `${item.delay3Count || 0} (${delay3Rate.toFixed(0)}%)`, options: { ...tableRowStyle, fill: { color: rowBg } } },
        { text: `${item.delay4AboveCount || 0} (${delay4AboveRate.toFixed(0)}%)`, options: { ...tableRowStyle, fill: { color: rowBg }, color: "B91C1C" } },
        { 
          text: podDisplayText, 
          options: { 
            ...tableRowStyle, 
            fill: { color: rowBg },
            color: pendingCount > 0 ? "B91C1C" : "15803D"
          } 
        },
        { text: (item.totalBoxes || 0).toLocaleString(), options: { ...tableRowStyle, fill: { color: rowBg } } },
        { text: (item.deliveryPoints || 0).toLocaleString(), options: { ...tableRowStyle, fill: { color: rowBg } } },
        { text: `₹${metrics.freight.toLocaleString("en-IN")}`, options: { ...tableRowStyle, fill: { color: rowBg } } },
        { 
          text: String(item.score || 0), 
          options: { 
            ...tableRowStyle, 
            fill: { color: idx === 0 ? "FEF3C7" : rowBg }, 
            color: idx === 0 ? "92400E" : slateDark 
          } 
        },
        { text: item.avgDelay !== "-" ? `${item.avgDelay} Days` : "-", options: { ...tableRowStyle, fill: { color: rowBg } } }
      ]);
    });

    // Add TOTAL / AVERAGE row
    const avgSndRate = totalDeliveredLrs > 0 ? (totalSndCount / totalDeliveredLrs) * 100 : 0;
    const avgDelay2Rate = totalDeliveredLrs > 0 ? (totalDelay2Count / totalDeliveredLrs) * 100 : 0;
    const avgDelay3Rate = totalDeliveredLrs > 0 ? (totalDelay3Count / totalDeliveredLrs) * 100 : 0;
    const avgDelay4AboveRate = totalDeliveredLrs > 0 ? (totalDelay4AboveCount / totalDeliveredLrs) * 100 : 0;
    const avgScore = sortedLeaderboard.length > 0 ? Math.round(sumScores / sortedLeaderboard.length) : 0;
    const overallAvgDelay = totalDeliveredLrsForAvg > 0 ? (totalDelaysForAvg / totalDeliveredLrsForAvg).toFixed(1) : "-";

    const slide2TotalRowStyle = {
      fill: { color: "CBD5E1" },
      fontSize: 9.0,
      align: "center",
      valign: "middle",
      bold: true,
      color: "000000"
    };

    const totalPodDisplayText = totalPendingCount > 0
      ? `${totalPodCount} (${totalPendingCount} Pending)`
      : `${totalPodCount} (100%)`;

    branchTableRows.push([
      { text: "TOTAL / AVERAGE", options: { ...slide2TotalRowStyle, align: "left" } },
      { text: `${totalDeliveredLrs} / ${totalTotalLrs}`, options: slide2TotalRowStyle },
      { text: `${totalSndCount} (${avgSndRate.toFixed(0)}%)`, options: { ...slide2TotalRowStyle, color: "0284C7" } },
      { text: `${totalDelay2Count} (${avgDelay2Rate.toFixed(0)}%)`, options: slide2TotalRowStyle },
      { text: `${totalDelay3Count} (${avgDelay3Rate.toFixed(0)}%)`, options: slide2TotalRowStyle },
      { text: `${totalDelay4AboveCount} (${avgDelay4AboveRate.toFixed(0)}%)`, options: { ...slide2TotalRowStyle, color: "B91C1C" } },
      { 
        text: totalPodDisplayText, 
        options: { 
          ...slide2TotalRowStyle,
          color: totalPendingCount > 0 ? "B91C1C" : "15803D"
        } 
      },
      { text: totalTotalBoxes.toLocaleString(), options: slide2TotalRowStyle },
      { text: totalDeliveryPoints.toLocaleString(), options: slide2TotalRowStyle },
      { text: `₹${totalFreight.toLocaleString("en-IN")}`, options: slide2TotalRowStyle },
      { text: String(avgScore), options: slide2TotalRowStyle },
      { text: overallAvgDelay !== "-" ? `${overallAvgDelay} Days` : "-", options: slide2TotalRowStyle }
    ]);

    slide2.addTable(branchTableRows, {
      x: 0.5,
      y: 1.25,
      w: 12.33,
      colW: [2.5, 0.9, 1.3, 0.9, 0.9, 0.9, 1.3, 0.8, 0.8, 1.2, 0.7, 0.83],
      margin: [4, 4, 4, 4],
      border: { pt: 0.5, color: "CBD5E1" }
    });


    // ==========================================
    // PAGE 3: BRANCH-WISE DELIVERY DELAY ANALYSIS (DETAILED BUCKETS TABLE & HORIZONTAL NON-OVERLAPPING CHART)
    // ==========================================
    const slide3 = pptx.addSlide();
    addSlideLayout(slide3, "BRANCH-WISE DELIVERY DELAY ANALYSIS");

    // Calculate branch delay matrix (0 to 16+ days)
    const branchDelayMatrix = {};
    allItems.forEach(item => {
      if (item.status === 'Delivery Process completed.') {
        const b = item.branch || "without despatched delivery";
        if (!branchDelayMatrix[b]) {
          branchDelayMatrix[b] = Array(17).fill(0);
        }
        if (item.delay !== null && !isNaN(item.delay)) {
          const d = Math.max(0, Math.floor(item.delay));
          if (d >= 16) {
            branchDelayMatrix[b][16]++;
          } else {
            branchDelayMatrix[b][d]++;
          }
        }
      }
    });

    const totalDelayMatrix = Array(17).fill(0);
    sortedLeaderboard.forEach(item => {
      const arr = branchDelayMatrix[item.name] || Array(17).fill(0);
      for (let i = 0; i <= 16; i++) {
        totalDelayMatrix[i] += arr[i];
      }
    });

    const activeIndices = [];
    for (let i = 0; i <= 16; i++) {
      if (totalDelayMatrix[i] > 0) {
        activeIndices.push(i);
      }
    }
    if (activeIndices.length === 0) {
      activeIndices.push(0, 1, 2, 3, 4);
    }

    const slide3HeaderStyle = {
      ...tableHeaderStyle,
      fontSize: 8.0
    };
    const slide3RowStyle = {
      ...tableRowStyle,
      fontSize: 8.0
    };

    const getHeaderLabel = (index) => {
      if (index === 0) return "SAME\nDAY";
      if (index === 1) return "NEXT\nDAY";
      if (index === 2) return "2nd\nDay";
      if (index === 3) return "3rd\nDay";
      if (index === 16) return "16th+\nDay";
      return `${index}th\nDay`;
    };

    const delayDetailedHeaders = [
      { text: "Branch", options: { ...slide3HeaderStyle, align: "left" } }
    ];
    activeIndices.forEach(idx => {
      delayDetailedHeaders.push({ text: getHeaderLabel(idx), options: slide3HeaderStyle });
    });

    const delayTableRows = [delayDetailedHeaders];

    sortedLeaderboard.forEach((item, idx) => {
      const rowBg = idx % 2 === 1 ? lightGrey : "FFFFFF";
      const arr = branchDelayMatrix[item.name] || Array(17).fill(0);
      
      const rowCells = [{ text: item.name || "N/A", options: { ...slide3RowStyle, align: "left", fill: { color: rowBg } } }];
      
      activeIndices.forEach(i => {
        const val = arr[i];
        rowCells.push({ text: val > 0 ? String(val) : "", options: { ...slide3RowStyle, fill: { color: rowBg } } });
      });
      delayTableRows.push(rowCells);
    });

    const slide3TotalRowStyle = {
      fill: { color: "CBD5E1" },
      fontSize: 8.0,
      align: "center",
      valign: "middle",
      bold: true,
      color: "000000"
    };

    const totalCells = [{ text: "TOTAL", options: { ...slide3TotalRowStyle, align: "left" } }];
    activeIndices.forEach(i => {
      totalCells.push({ text: totalDelayMatrix[i] > 0 ? String(totalDelayMatrix[i]) : "", options: slide3TotalRowStyle });
    });
    delayTableRows.push(totalCells);

    const totalWidthAvailable = 12.33;
    const branchColWidth = 2.5;
    const remainingWidth = totalWidthAvailable - branchColWidth;
    const colWidths = [branchColWidth, ...Array(activeIndices.length).fill(remainingWidth / activeIndices.length)];

    const delayTableHeight = 0.5 + (delayTableRows.length * 0.35);
    slide3.addTable(delayTableRows, {
      x: 0.5,
      y: 1.1,
      w: 12.33,
      colW: colWidths,
      margin: [3, 4, 3, 4],
      border: { pt: 0.5, color: "CBD5E1" }
    });

    const totalDeliveredDelays = totalDelayMatrix.reduce((sum, val) => sum + val, 0);
    const getLegendLabel = (name, count) => {
      const pct = totalDeliveredDelays > 0 ? ((count / totalDeliveredDelays) * 100).toFixed(1) : "0.0";
      return `${name}: ${count.toLocaleString()} (${pct}%)`;
    };

    const doughnutChartData = [
      {
        name: "Overall Delay Distribution",
        labels: [
          getLegendLabel("Same Day", totalDelayMatrix[0]),
          getLegendLabel("Next Day", totalDelayMatrix[1]),
          getLegendLabel("2nd Day", totalDelayMatrix[2]),
          getLegendLabel("3rd Day", totalDelayMatrix[3]),
          getLegendLabel("4th Day+", totalDelayMatrix.slice(4).reduce((sum, val) => sum + val, 0))
        ],
        values: [
          totalDelayMatrix[0],
          totalDelayMatrix[1],
          totalDelayMatrix[2],
          totalDelayMatrix[3],
          totalDelayMatrix.slice(4).reduce((sum, val) => sum + val, 0)
        ]
      }
    ];

    if (branchNames.length > 0) {
      slide3.addChart(pptx.ChartType.doughnut, doughnutChartData, {
        x: 3.2, // Slightly wider to fit longer legend labels
        y: 1.35 + delayTableHeight,
        w: 6.93, 
        h: Math.max(2.0, 7.2 - 1.6 - delayTableHeight),
        holeSize: 60,
        showLegend: true,
        legendPos: "r",
        legendFontSize: 9.5,
        legendColor: "1E293B",
        chartColors: ["0284C7", "F59E0B", "10B981", "EF4444", "6B7280"], // sky, amber, emerald, red, grey
        showPercent: false, // Turn off percent labels on slices to prevent overlaps!
        showValue: false,   // Turn off raw values on slices
        showLabel: false,   // Turn off slice text labels
        title: "Overall Delivery Delay Distribution (Total LRs)",
        titleFontSize: 11,
        titleColor: purple,
        titleBold: true
      });
    }


    // ==========================================
    // PAGE 4: BRANCH PERFORMANCE CHARTS (Part 1 - SND% + BOXES)
    // ==========================================
    const slide4 = pptx.addSlide();
    addSlideLayout(slide4, "BRANCH PERFORMANCE CHARTS (Part 1)");
    
    const sndChartData = [
      {
        name: "Same & Next Day Rate (%)",
        labels: branchNames,
        values: sortedLeaderboard.map(b => (b.sndRate || 0) / 100)
      }
    ];

    const boxesChartData = [
      {
        name: "Boxes Delivered",
        labels: branchNames,
        values: sortedLeaderboard.map(b => b.totalBoxes || 0)
      }
    ];

    if (branchNames.length > 0) {
      slide4.addText("Branch-wise Same & Next Day Delivery Rate (%)", {
        x: 0.5, y: 0.95, w: 12.33, h: 0.3, fontSize: 11, bold: true, color: purple, fontFace: "Arial"
      });
      slide4.addChart(pptx.ChartType.bar, sndChartData, {
        x: 0.5, y: 1.2, w: 12.33, h: 2.5, barDir: "col",
        showLegend: false, chartColors: [purple],
        showValue: true, valueFontSize: 8.5, valueColor: "1E293B",
        dataLabelFormatCode: "0.0%",
        valAxisLabelFormatCode: "0%"
      });

      slide4.addText("Branch-wise Boxes Delivered", {
        x: 0.5, y: 3.85, w: 12.33, h: 0.3, fontSize: 11, bold: true, color: purple, fontFace: "Arial"
      });
      slide4.addChart(pptx.ChartType.bar, boxesChartData, {
        x: 0.5, y: 4.1, w: 12.33, h: 2.5, barDir: "col",
        showLegend: false, chartColors: [cyan],
        showValue: true, valueFontSize: 8.5, valueColor: "1E293B",
        dataLabelFormatCode: "#,##0",
        valAxisLabelFormatCode: "#,##0"
      });
    }


    // ==========================================
    // PAGE 5: BRANCH PERFORMANCE CHARTS (Part 2 - FREIGHT + RAW AVG DELAY WITH DECIMALS FIXED)
    // ==========================================
    const slide5 = pptx.addSlide();
    addSlideLayout(slide5, "BRANCH PERFORMANCE CHARTS (Part 2)");

    const freightChartData = [
      {
        name: "Freight (₹)",
        labels: branchNames,
        values: sortedLeaderboard.map(b => {
          const metrics = branchMetrics[b.name] || { freight: 0 };
          return metrics.freight;
        })
      }
    ];

    const avgDelayChartData = [
      {
        name: "Avg Delay (Days)",
        labels: branchNames,
        values: sortedLeaderboard.map(b => b.avgDelay === '-' ? 0 : Number(Number(b.avgDelay || 0).toFixed(1)))
      }
    ];

    if (branchNames.length > 0) {
      slide5.addText("Branch-wise Freight Collected (₹)", {
        x: 0.5, y: 0.95, w: 12.33, h: 0.3, fontSize: 11, bold: true, color: purple, fontFace: "Arial"
      });
      slide5.addChart(pptx.ChartType.bar, freightChartData, {
        x: 0.5, y: 1.2, w: 12.33, h: 2.5, barDir: "col",
        showLegend: false, chartColors: [purple],
        showValue: true, valueFontSize: 8.5, valueColor: "1E293B",
        dataLabelFormatCode: "₹#,##0",
        valAxisLabelFormatCode: "₹#,##0"
      });

      slide5.addText("Branch-wise Average Delay (Days)", {
        x: 0.5, y: 3.85, w: 12.33, h: 0.3, fontSize: 11, bold: true, color: purple, fontFace: "Arial"
      });
      slide5.addChart(pptx.ChartType.bar, avgDelayChartData, {
        x: 0.5, y: 4.1, w: 12.33, h: 2.5, barDir: "col",
        showLegend: false, chartColors: [cyan],
        showValue: true, valueFontSize: 8.5, valueColor: "1E293B",
        dataLabelFormatCode: "0.0",
        valAxisLabelFormatCode: "0.0"
      });
    }


    // ==========================================
    // PAGE 6: DRIVER PERFORMANCE REPORT (DRIVER TABLE BOLD & READABLE & FIXED PENDING "%")
    // ==========================================
    const slide6 = pptx.addSlide();
    addSlideLayout(slide6, "DRIVER PERFORMANCE REPORT");

    const driverTableHeaderStyle = {
      ...tableHeaderStyle,
      fontSize: 9.0
    };
    const driverTableRowStyle = {
      ...tableRowStyle,
      fontSize: 8.5
    };

    const driverTableRows = [
      [
        { text: "Driver Name", options: driverTableHeaderStyle },
        { text: "LRs (Delivered/Total)", options: driverTableHeaderStyle },
        { text: "Same & Next Day", options: driverTableHeaderStyle },
        { text: "POD (Pending)", options: driverTableHeaderStyle },
        { text: "Boxes", options: driverTableHeaderStyle },
        { text: "Avg Delay (Days)", options: driverTableHeaderStyle },
        { text: "Performance Score", options: driverTableHeaderStyle }
      ]
    ];

    const activeDriverLeaderboard = driverLeaderboard || [];
    const sortedDriverLeaderboard = [...activeDriverLeaderboard].sort((a, b) => (b.score || 0) - (a.score || 0));

    sortedDriverLeaderboard.forEach((item, idx) => {
      const rowBg = idx % 2 === 1 ? lightGrey : "FFFFFF";
      const sndRate = item.sndRate || 0;
      const pendingCount = item.pendingCount || 0;

      const driverPodText = pendingCount > 0
        ? `${item.podCount || 0} (${pendingCount} Pending)`
        : `${item.podCount || 0} (100%)`;

      driverTableRows.push([
        { text: item.name || "N/A", options: { ...driverTableRowStyle, align: "left", fill: { color: rowBg } } },
        { text: `${item.deliveredLrs || 0} / ${item.totalLrs || 0}`, options: { ...driverTableRowStyle, fill: { color: rowBg } } },
        { text: `${sndRate.toFixed(0)}%`, options: { ...driverTableRowStyle, fill: { color: rowBg } } },
        { 
          text: driverPodText, 
          options: { 
            ...driverTableRowStyle, 
            fill: { color: rowBg },
            color: pendingCount > 0 ? "B91C1C" : "15803D"
          } 
        },
        { text: (item.totalBoxes || 0).toLocaleString(), options: { ...driverTableRowStyle, fill: { color: rowBg } } },
        { text: item.avgDelay !== "-" ? `${item.avgDelay} Days` : "-", options: { ...driverTableRowStyle, fill: { color: rowBg } } },
        { 
          text: String(item.score || 0), 
          options: { 
            ...driverTableRowStyle, 
            fill: { color: idx === 0 ? "FEF3C7" : rowBg }, 
            color: idx === 0 ? "92400E" : slateDark 
          } 
        }
      ]);
    });

    slide6.addTable(driverTableRows, {
      x: 0.5,
      y: 1.1,
      w: 12.33,
      colW: [2.5, 2.0, 1.4, 2.0, 1.4, 1.63, 1.4],
      margin: [4, 4, 4, 4],
      border: { pt: 0.5, color: "CBD5E1" }
    });


    // ==========================================
    // PAGE 7 & 8: CUSTOMER-WISE PERFORMANCE & FREIGHT TURNOVER REPORT (PAGINATED AT END OF PRE-DEFINED SLIDES)
    // ==========================================
    addMultiColumnTable("CUSTOMER-WISE PERFORMANCE & FREIGHT TURNOVER REPORT", customerMergedHeaders, customerMergedDataRows, [4.33, 1.3, 1.3, 1.7, 1.7, 2.0], 2, 26);


    // ==========================================
    // PAGE 9 & 10: DESTINATION-WISE DELAYS >= 2 DAYS REPORT (PAGINATED AT VERY END)
    // ==========================================
    addMultiColumnTable("DESTINATION-WISE DELAYS >= 2 DAYS REPORT", destinationHeaders, destinationDataRows, [5.83, 2.0, 2.0, 2.5], 2, 26);

    // Save the PPT file
    pptx.writeFile({ fileName: `EFF_Performance_Report_${new Date().toISOString().slice(0,10)}.pptx` });
  } catch (error) {
    console.error("PPT Generation Error:", error);
    alert("Error generating PPT presentation. Make sure to refresh the page and re-upload your Excel data file so the new features are initialized in the memory. Details: " + error.message);
  }
}
