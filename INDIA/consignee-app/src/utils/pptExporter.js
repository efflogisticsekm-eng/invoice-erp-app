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

      // 6. Page Numbers
      slide.addText("Page " + slide.slideNumber, {
        x: 11.5,
        y: 7.15,
        w: 1.3,
        h: 0.3,
        fontSize: 9,
        align: "right",
        color: "64748B",
        fontFace: "Arial"
      });
    };

    const tableHeaderStyle = {
      fill: { color: purple },
      color: "FFFFFF",
      fontSize: 9.0,
      bold: true,
      align: "center",
      valign: "middle"
    };

    const tableRowStyle = {
      fontSize: 8.5,
      align: "center",
      valign: "middle"
    };

    const multiColHeaderStyle = {
      ...tableHeaderStyle,
      fontSize: 7.5
    };
    const multiColRowStyle = {
      ...tableRowStyle,
      fontSize: 7.0
    };

    // Helper for generating tables in parallel columns to fit on a single slide with minimum margins
    const addMultiColumnTable = (titleText, headers, allRows, colW, numColumns = 2, maxRowsPerCol = 22) => {
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
            y: 1.05, // Shifted up slightly for maximum vertical space
            w: colWidth,
            colW: scaledColW,
            border: { pt: 0.5, color: "CBD5E1" }
          });
        }
      }
    };

    // Helper for a single wide paginated table (for detailed aging report)
    const addSingleColumnPaginatedTable = (titleText, headers, allRows, colW, maxRowsPerSlide = 16) => {
      let currentSlide = null;
      let slideRows = [];
      
      for (let i = 0; i < allRows.length; i++) {
        if (i % maxRowsPerSlide === 0) {
          if (currentSlide && slideRows.length > 0) {
            currentSlide.addTable(slideRows, {
              x: 0.5,
              y: 1.1,
              w: 12.33,
              colW: colW,
              border: { pt: 0.5, color: "CBD5E1" }
            });
          }
          
          currentSlide = pptx.addSlide();
          const pageNumSuffix = allRows.length > maxRowsPerSlide ? ` (Part ${Math.floor(i / maxRowsPerSlide) + 1})` : "";
          addSlideLayout(currentSlide, titleText + pageNumSuffix);
          
          slideRows = [headers];
        }
        slideRows.push(allRows[i]);
      }
      
      if (currentSlide && slideRows.length > 0) {
        currentSlide.addTable(slideRows, {
          x: 0.5,
          y: 1.1,
          w: 12.33,
          colW: colW,
          border: { pt: 0.5, color: "CBD5E1" }
        });
      }
    };

    // ==========================================
    // SLIDE 1: BRANCH PERFORMANCE SNAPSHOT
    // ==========================================
    const slide1 = pptx.addSlide();
    addSlideLayout(slide1, "BRANCH PERFORMANCE SNAPSHOT");

    const slide1TableHeaderStyle = {
      fill: { color: purple },
      color: "FFFFFF",
      fontSize: 8.5,
      bold: true,
      align: "center",
      valign: "middle"
    };

    const slide1TableRowStyle = {
      fontSize: 8.0,
      align: "center",
      valign: "middle"
    };

    // Prepare table data
    const branchTableRows = [
      [
        { text: "Branch", options: slide1TableHeaderStyle },
        { text: "LRs (Del/Tot)", options: slide1TableHeaderStyle },
        { text: "Same & Next Day", options: slide1TableHeaderStyle },
        { text: "2nd Day", options: slide1TableHeaderStyle },
        { text: "3rd Day", options: slide1TableHeaderStyle },
        { text: "4th Day+", options: slide1TableHeaderStyle },
        { text: "POD (Pending)", options: slide1TableHeaderStyle },
        { text: "Boxes", options: slide1TableHeaderStyle },
        { text: "Points", options: slide1TableHeaderStyle },
        { text: "Freight (₹)", options: slide1TableHeaderStyle },
        { text: "Total Amount (₹)", options: slide1TableHeaderStyle },
        { text: "Score", options: slide1TableHeaderStyle },
        { text: "Avg Delay", options: slide1TableHeaderStyle }
      ]
    ];

    // Calculate freight and points per branch from filtered list
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

    sortedLeaderboard.forEach((item, idx) => {
      const metrics = branchMetrics[item.name] || { freight: 0, amount: 0 };
      const rowBg = idx % 2 === 1 ? lightGrey : "FFFFFF";
      
      const sndRate = item.sndRate || 0;
      const delay2Rate = item.delay2Rate || 0;
      const delay3Rate = item.delay3Rate || 0;
      const delay4AboveRate = item.delay4AboveRate || 0;
      const podRate = item.podRate || 0;
      const pendingCount = item.pendingCount || 0;

      branchTableRows.push([
        { text: item.name || "N/A", options: { ...slide1TableRowStyle, align: "left", bold: true, fill: { color: rowBg } } },
        { text: `${item.deliveredLrs || 0} / ${item.totalLrs || 0}`, options: { ...slide1TableRowStyle, fill: { color: rowBg } } },
        { text: `${item.sndCount || 0} (${sndRate.toFixed(0)}%)`, options: { ...slide1TableRowStyle, fill: { color: rowBg }, bold: true, color: "0284C7" } },
        { text: `${item.delay2Count || 0} (${delay2Rate.toFixed(0)}%)`, options: { ...slide1TableRowStyle, fill: { color: rowBg } } },
        { text: `${item.delay3Count || 0} (${delay3Rate.toFixed(0)}%)`, options: { ...slide1TableRowStyle, fill: { color: rowBg } } },
        { text: `${item.delay4AboveCount || 0} (${delay4AboveRate.toFixed(0)}%)`, options: { ...slide1TableRowStyle, fill: { color: rowBg }, color: "B91C1C" } },
        { 
          text: `${item.podCount || 0} (${podRate.toFixed(0)}%)\n${pendingCount > 0 ? `(${pendingCount} Pending)` : ""}`, 
          options: { 
            ...slide1TableRowStyle, 
            fill: { color: rowBg },
            color: pendingCount > 0 ? "B91C1C" : "15803D",
            bold: true
          } 
        },
        { text: (item.totalBoxes || 0).toLocaleString(), options: { ...slide1TableRowStyle, fill: { color: rowBg } } },
        { text: (item.deliveryPoints || 0).toLocaleString(), options: { ...slide1TableRowStyle, fill: { color: rowBg } } },
        { text: `₹${metrics.freight.toLocaleString("en-IN")}`, options: { ...slide1TableRowStyle, fill: { color: rowBg }, bold: true } },
        { text: `₹${metrics.amount.toLocaleString("en-IN")}`, options: { ...slide1TableRowStyle, fill: { color: rowBg }, bold: true } },
        { 
          text: String(item.score || 0), 
          options: { 
            ...slide1TableRowStyle, 
            fill: { color: idx === 0 ? "FEF3C7" : rowBg }, 
            bold: true,
            color: idx === 0 ? "92400E" : slateDark 
          } 
        },
        { text: item.avgDelay !== "-" ? `${item.avgDelay} Days` : "-", options: { ...slide1TableRowStyle, fill: { color: rowBg } } }
      ]);
    });

    slide1.addTable(branchTableRows, {
      x: 0.5,
      y: 1.25,
      w: 12.33,
      colW: [2.2, 0.8, 1.2, 0.8, 0.8, 0.8, 1.2, 0.7, 0.7, 1.1, 1.3, 0.6, 0.73],
      border: { pt: 0.5, color: "CBD5E1" }
    });


    // ==========================================
    // SLIDE 2: BRANCH PERFORMANCE CHARTS
    // ==========================================
    const slide2 = pptx.addSlide();
    addSlideLayout(slide2, "BRANCH PERFORMANCE CHARTS");

    const branchNames = sortedLeaderboard.map(b => b.name || "N/A");
    
    // 1. 2nd Day Rate chart
    const delay2ChartData = [
      {
        name: "2nd Day Rate (%)",
        labels: branchNames,
        values: sortedLeaderboard.map(b => Number((b.delay2Rate || 0).toFixed(0)))
      }
    ];

    // 2. Boxes chart
    const boxesChartData = [
      {
        name: "Boxes Delivered",
        labels: branchNames,
        values: sortedLeaderboard.map(b => b.totalBoxes || 0)
      }
    ];

    // 3. Freight chart
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

    // 4. Avg Delay chart
    const avgDelayChartData = [
      {
        name: "Avg Delay (Days)",
        labels: branchNames,
        values: sortedLeaderboard.map(b => b.avgDelay === '-' ? 0 : Number(b.avgDelay || 0))
      }
    ];

    if (branchNames.length > 0) {
      // Top Left: 2nd Day Column Chart
      slide2.addChart(pptx.ChartType.bar, delay2ChartData, {
        x: 0.5, y: 1.1, w: 5.8, h: 2.6, barDir: "col",
        showLegend: false, chartColors: [purple],
        showValue: true, valueFontSize: 8.5, valueColor: "1E293B",
        title: "Branch-wise 2nd Day Delivery Rate (%)", titleFontSize: 11, titleColor: purple, titleBold: true
      });

      // Top Right: Boxes Doughnut Chart
      slide2.addChart(pptx.ChartType.doughnut, boxesChartData, {
        x: 7.0, y: 1.1, w: 5.8, h: 2.6,
        showLegend: true, legendPos: "r", legendFontSize: 8,
        chartColors: ["5B2482", "00A3E0", "10B981", "F59E0B", "EF4444", "6366F1", "EC4899"],
        holeSize: 55, showValue: true, dataLabelFontSize: 8,
        title: "Branch-wise Boxes Delivered", titleFontSize: 11, titleColor: purple, titleBold: true
      });

      // Bottom Left: Freight Doughnut Chart
      slide2.addChart(pptx.ChartType.doughnut, freightChartData, {
        x: 0.5, y: 4.1, w: 5.8, h: 2.6,
        showLegend: true, legendPos: "r", legendFontSize: 8,
        chartColors: ["5B2482", "00A3E0", "10B981", "F59E0B", "EF4444", "6366F1", "EC4899"],
        holeSize: 55, showValue: true, dataLabelFontSize: 8,
        title: "Branch-wise Freight Collected (₹)", titleFontSize: 11, titleColor: purple, titleBold: true
      });

      // Bottom Right: Avg Delay Column Chart
      slide2.addChart(pptx.ChartType.bar, avgDelayChartData, {
        x: 7.0, y: 4.1, w: 5.8, h: 2.6, barDir: "col",
        showLegend: false, chartColors: [cyan],
        showValue: true, valueFontSize: 8.5, valueColor: "1E293B",
        title: "Branch-wise Average Delay (Days)", titleFontSize: 11, titleColor: purple, titleBold: true
      });
    }


    // ==========================================
    // SLIDE 3: BRANCH-WISE DELIVERY DELAY ANALYSIS
    // ==========================================
    const slide3 = pptx.addSlide();
    addSlideLayout(slide3, "BRANCH-WISE DELIVERY DELAY ANALYSIS");

    const delayHeaders = [
      { text: "Branch", options: tableHeaderStyle },
      { text: "Same & Next Day", options: tableHeaderStyle },
      { text: "2nd Day", options: tableHeaderStyle },
      { text: "3rd Day", options: tableHeaderStyle },
      { text: "4th Day+", options: tableHeaderStyle },
      { text: "Total Delivered", options: tableHeaderStyle },
      { text: "Avg Delay (Days)", options: tableHeaderStyle }
    ];

    const delayTableRows = [delayHeaders];
    sortedLeaderboard.forEach((item, idx) => {
      const rowBg = idx % 2 === 1 ? lightGrey : "FFFFFF";
      const sndRate = item.sndRate || 0;
      const delay2Rate = item.delay2Rate || 0;
      const delay3Rate = item.delay3Rate || 0;
      const delay4AboveRate = item.delay4AboveRate || 0;
      
      delayTableRows.push([
        { text: item.name || "N/A", options: { ...tableRowStyle, align: "left", bold: true, fill: { color: rowBg } } },
        { text: `${item.sndCount || 0} (${sndRate.toFixed(0)}%)`, options: { ...tableRowStyle, fill: { color: rowBg } } },
        { text: `${item.delay2Count || 0} (${delay2Rate.toFixed(0)}%)`, options: { ...tableRowStyle, fill: { color: rowBg } } },
        { text: `${item.delay3Count || 0} (${delay3Rate.toFixed(0)}%)`, options: { ...tableRowStyle, fill: { color: rowBg } } },
        { text: `${item.delay4AboveCount || 0} (${delay4AboveRate.toFixed(0)}%)`, options: { ...tableRowStyle, fill: { color: rowBg }, color: "B91C1C" } },
        { text: String(item.deliveredLrs || 0), options: { ...tableRowStyle, fill: { color: rowBg } } },
        { text: item.avgDelay !== "-" ? `${item.avgDelay} Days` : "-", options: { ...tableRowStyle, fill: { color: rowBg }, bold: true } }
      ]);
    });

    const delayTableHeight = 0.5 + (delayTableRows.length * 0.35);
    slide3.addTable(delayTableRows, {
      x: 0.5,
      y: 1.1,
      w: 12.33,
      colW: [2.5, 1.8, 1.4, 1.4, 1.4, 1.8, 2.03],
      border: { pt: 0.5, color: "CBD5E1" }
    });

    // Stacked delay bar chart at the bottom
    const delayChartData = [
      {
        name: "Same & Next Day",
        labels: branchNames,
        values: sortedLeaderboard.map(b => b.sndCount || 0)
      },
      {
        name: "2nd Day",
        labels: branchNames,
        values: sortedLeaderboard.map(b => b.delay2Count || 0)
      },
      {
        name: "3rd Day",
        labels: branchNames,
        values: sortedLeaderboard.map(b => b.delay3Count || 0)
      },
      {
        name: "4th Day+",
        labels: branchNames,
        values: sortedLeaderboard.map(b => b.delay4AboveCount || 0)
      }
    ];

    if (branchNames.length > 0) {
      slide3.addChart(pptx.ChartType.bar, delayChartData, {
        x: 0.5,
        y: 1.35 + delayTableHeight,
        w: 12.33,
        h: Math.max(2.0, 7.2 - 1.6 - delayTableHeight),
        barDir: "col",
        showLegend: true,
        legendPos: "r",
        legendFontSize: 9,
        chartColors: ["0284C7", "F59E0B", "10B981", "EF4444"], // sky, amber, emerald, red
        showValue: true,
        valueFontSize: 8,
        valueColor: "1E293B",
        title: "Branch-wise Delay Days Comparison",
        titleFontSize: 11,
        titleColor: purple,
        titleBold: true
      });
    }


    // ==========================================
    // SLIDE 4: DELIVERY DELAY & PERFORMANCE SUMMARY
    // ==========================================
    const slide4 = pptx.addSlide();
    addSlideLayout(slide4, "DELIVERY DELAY & PERFORMANCE SUMMARY");

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
      slide4.addText(label, { x: 0.8, y: yOffset, w: 2.8, h: 0.35, fontSize: 11, color: "475569", bold: true });
      slide4.addText(val, { x: 3.3, y: yOffset, w: 1.6, h: 0.35, fontSize: 12, color: colorCode, bold: true, align: "right" });
    };

    slide4.addShape(pptx.ShapeType.roundRect, {
      x: 0.5,
      y: statsBoxY,
      w: 4.8,
      h: 5.2,
      fill: { color: "F8FAFC" },
      line: { color: "E2E8F0", width: 1 }
    });

    slide4.addText("Overall Delivery Stats", {
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
    slide4.addShape(pptx.ShapeType.rect, { x: 0.8, y: statsBoxY + 3.65, w: 4.2, h: 0.02, fill: { color: "CBD5E1" } });
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

    slide4.addChart(pptx.ChartType.bar, summaryChartData, {
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
    // SLIDE 5: CUSTOMER WISE DELAY REPORT (PAGINATED, 2-COLUMNS, COMPACT, ALL CONSIGNORS)
    // ==========================================
    // Aggregate consignor delays
    const consignors = {};
    allItems.forEach(item => {
      if (item.status === 'Delivery Process completed.') {
        const c = item.consignor || "N/A";
        if (!consignors[c]) {
          consignors[c] = { name: c, delivered: 0, totalDelay: 0, sndCount: 0 };
        }
        consignors[c].delivered++;
        if (item.delay !== null) {
          consignors[c].totalDelay += item.delay;
          if (item.delay <= 1) {
            consignors[c].sndCount++;
          }
        }
      }
    });

    const sortedConsignorsDelay = Object.values(consignors)
      .map(c => ({
        name: c.name,
        delivered: c.delivered,
        avgDelay: c.delivered > 0 ? c.totalDelay / c.delivered : 0,
        sndRate: c.delivered > 0 ? (c.sndCount / c.delivered) * 100 : 0
      }))
      .filter(item => item.name.toUpperCase() !== 'TOTAL' && item.name.toUpperCase() !== 'GRAND TOTAL') // Remove totals only, keep all consignors
      .sort((a, b) => b.avgDelay - a.avgDelay); // Highest delay first

    const customerDelayHeaders = [
      { text: "Consignor Name", options: multiColHeaderStyle },
      { text: "Delivered LRs", options: multiColHeaderStyle },
      { text: "Same & Next Day (%)", options: multiColHeaderStyle },
      { text: "Avg Delay (Days)", options: multiColHeaderStyle }
    ];

    const customerDelayDataRows = [];
    sortedConsignorsDelay.forEach((item, idx) => {
      const rowBg = idx % 2 === 1 ? lightGrey : "FFFFFF";
      customerDelayDataRows.push([
        { text: item.name || "N/A", options: { ...multiColRowStyle, align: "left", bold: true, fill: { color: rowBg } } },
        { text: String(item.delivered || 0), options: { ...multiColRowStyle, fill: { color: rowBg } } },
        { text: `${(item.sndRate || 0).toFixed(0)}%`, options: { ...multiColRowStyle, fill: { color: rowBg }, bold: true } },
        { 
          text: `${(item.avgDelay || 0).toFixed(1)} Days`, 
          options: { 
            ...multiColRowStyle, 
            fill: { color: rowBg }, 
            bold: true,
            color: (item.avgDelay || 0) >= 2.0 ? "B91C1C" : "1E293B" 
          } 
        }
      ]);
    });

    addMultiColumnTable("CUSTOMER-WISE AVERAGE DELAY REPORT", customerDelayHeaders, customerDelayDataRows, [5.83, 2.0, 2.0, 2.5], 2, 22);


    // ==========================================
    // SLIDE 6: CUSTOMER WISE FREIGHT & DELAY TURNOVER REPORT (PAGINATED, 2-COLUMNS, COMPACT, ALL CONSIGNORS)
    // ==========================================
    const consignorsFreight = {};
    allItems.forEach(item => {
      const c = item.consignor || "N/A";
      if (!consignorsFreight[c]) {
        consignorsFreight[c] = { name: c, totalLrs: 0, delivered: 0, freight: 0, totalDelay: 0, delaysCount: 0 };
      }
      consignorsFreight[c].totalLrs++;
      if (item.status === 'Delivery Process completed.') {
        consignorsFreight[c].delivered++;
        if (item.delay !== null) {
          consignorsFreight[c].totalDelay += item.delay;
          consignorsFreight[c].delaysCount++;
        }
      }
      consignorsFreight[c].freight += Number(item.freight || 0);
    });

    const sortedConsignorsFreight = Object.values(consignorsFreight)
      .filter(item => item.name.toUpperCase() !== 'TOTAL' && item.name.toUpperCase() !== 'GRAND TOTAL') // Remove totals
      .sort((a, b) => b.freight - a.freight);

    const customerFreightHeaders = [
      { text: "Consignor Name", options: multiColHeaderStyle },
      { text: "Total LRs", options: multiColHeaderStyle },
      { text: "Delivered LRs", options: multiColHeaderStyle },
      { text: "Avg Delay (Days)", options: multiColHeaderStyle },
      { text: "Total Freight Amount (₹)", options: multiColHeaderStyle }
    ];

    const customerFreightDataRows = [];
    sortedConsignorsFreight.forEach((item, idx) => {
      const rowBg = idx % 2 === 1 ? lightGrey : "FFFFFF";
      const avgDelay = item.delaysCount > 0 ? (item.totalDelay / item.delaysCount).toFixed(1) : "0.0";
      customerFreightDataRows.push([
        { text: item.name || "N/A", options: { ...multiColRowStyle, align: "left", bold: true, fill: { color: rowBg } } },
        { text: String(item.totalLrs || 0), options: { ...multiColRowStyle, fill: { color: rowBg } } },
        { text: String(item.delivered || 0), options: { ...multiColRowStyle, fill: { color: rowBg } } },
        { text: `${avgDelay} Days`, options: { ...multiColRowStyle, fill: { color: rowBg } } },
        { text: `₹${(item.freight || 0).toLocaleString("en-IN")}`, options: { ...multiColRowStyle, fill: { color: rowBg }, bold: true, color: "15803D" } }
      ]);
    });

    addMultiColumnTable("CUSTOMER-WISE FREIGHT TURNOVER & DELAY REPORT", customerFreightHeaders, customerFreightDataRows, [4.83, 1.5, 1.5, 1.8, 2.7], 2, 22);


    // ==========================================
    // SLIDE 7: DESTINATION WISE DELAY & FREIGHT REPORT (PAGINATED, 2-COLUMNS, COMPACT, FILTERED >= 2 DAYS)
    // ==========================================
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
      .filter(item => item.avgDelay >= 2.0 && item.name.toUpperCase() !== 'TOTAL' && item.name.toUpperCase() !== 'GRAND TOTAL') // Delay >= 2.0 only, remove TOTAL
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
        { text: item.name || "N/A", options: { ...multiColRowStyle, align: "left", bold: true, fill: { color: rowBg } } },
        { text: String(item.totalLrs || 0), options: { ...multiColRowStyle, fill: { color: rowBg } } },
        { text: `${(item.avgDelay || 0).toFixed(1)} Days`, options: { ...multiColRowStyle, fill: { color: rowBg }, bold: true } },
        { text: `₹${(item.freight || 0).toLocaleString("en-IN")}`, options: { ...multiColRowStyle, fill: { color: rowBg }, bold: true, color: "0284C7" } }
      ]);
    });

    addMultiColumnTable("DESTINATION-WISE DELAYS >= 2 DAYS REPORT", destinationHeaders, destinationDataRows, [5.83, 2.0, 2.0, 2.5], 2, 22);


    // ==========================================
    // SLIDE 8: DRIVER WISE PERFORMANCE REPORT
    // ==========================================
    const slide8 = pptx.addSlide();
    addSlideLayout(slide8, "DRIVER PERFORMANCE REPORT");

    const driverTableRows = [
      [
        { text: "Driver Name", options: tableHeaderStyle },
        { text: "LRs (Delivered/Total)", options: tableHeaderStyle },
        { text: "Same & Next Day", options: tableHeaderStyle },
        { text: "POD (Pending)", options: tableHeaderStyle },
        { text: "Boxes", options: tableHeaderStyle },
        { text: "Avg Delay (Days)", options: tableHeaderStyle },
        { text: "Performance Score", options: tableHeaderStyle }
      ]
    ];

    const activeDriverLeaderboard = driverLeaderboard || [];
    const sortedDriverLeaderboard = [...activeDriverLeaderboard].sort((a, b) => (b.score || 0) - (a.score || 0));

    sortedDriverLeaderboard.forEach((item, idx) => {
      const rowBg = idx % 2 === 1 ? lightGrey : "FFFFFF";
      const sndRate = item.sndRate || 0;
      const podRate = item.podRate || 0;
      const pendingCount = item.pendingCount || 0;

      driverTableRows.push([
        { text: item.name || "N/A", options: { ...tableRowStyle, align: "left", bold: true, fill: { color: rowBg } } },
        { text: `${item.deliveredLrs || 0} / ${item.totalLrs || 0}`, options: { ...tableRowStyle, fill: { color: rowBg } } },
        { text: `${sndRate.toFixed(0)}%`, options: { ...tableRowStyle, fill: { color: rowBg }, bold: true } },
        { 
          text: `${item.podCount || 0} (${podRate.toFixed(0)}%)\n${pendingCount > 0 ? `(${pendingCount} Pending)` : ""}`, 
          options: { 
            ...tableRowStyle, 
            fill: { color: rowBg },
            color: pendingCount > 0 ? "B91C1C" : "15803D",
            bold: true
          } 
        },
        { text: (item.totalBoxes || 0).toLocaleString(), options: { ...tableRowStyle, fill: { color: rowBg } } },
        { text: item.avgDelay !== "-" ? `${item.avgDelay} Days` : "-", options: { ...tableRowStyle, fill: { color: rowBg } } },
        { 
          text: String(item.score || 0), 
          options: { 
            ...tableRowStyle, 
            fill: { color: idx === 0 ? "FEF3C7" : rowBg }, 
            bold: true,
            color: idx === 0 ? "92400E" : slateDark 
          } 
        }
      ]);
    });

    slide8.addTable(driverTableRows, {
      x: 0.5,
      y: 1.1,
      w: 12.33,
      colW: [2.5, 2.0, 1.4, 2.0, 1.4, 1.63, 1.4],
      border: { pt: 0.5, color: "CBD5E1" }
    });


    // ==========================================
    // SLIDE 9: BRANCH-WISE DETAILED LR DELIVERY DELAY AGING REPORT (NEW)
    // ==========================================
    const agingHeaders = [
      { text: "Branch", options: tableHeaderStyle },
      { text: "LR No", options: tableHeaderStyle },
      { text: "Date", options: tableHeaderStyle },
      { text: "Consignor", options: tableHeaderStyle },
      { text: "Destination", options: tableHeaderStyle },
      { text: "Delay", options: tableHeaderStyle }
    ];

    const delayedLrs = [];
    allItems.forEach(item => {
      if (item.status === 'Delivery Process completed.' && item.delay !== null && item.delay >= 2) {
        delayedLrs.push(item);
      }
    });

    // Sort delayed LRs by branch, then by delay descending
    delayedLrs.sort((a, b) => {
      const branchA = (a.branch || '').toUpperCase();
      const branchB = (b.branch || '').toUpperCase();
      if (branchA !== branchB) return branchA.localeCompare(branchB);
      return (b.delay || 0) - (a.delay || 0);
    });

    const agingDataRows = [];
    delayedLrs.forEach((item, idx) => {
      const rowBg = idx % 2 === 1 ? lightGrey : "FFFFFF";
      agingDataRows.push([
        { text: item.branch || "N/A", options: { ...tableRowStyle, align: "left", bold: true, fill: { color: rowBg } } },
        { text: String(item.lrNo || "N/A"), options: { ...tableRowStyle, fill: { color: rowBg } } },
        { text: String(item.date || "N/A"), options: { ...tableRowStyle, fill: { color: rowBg } } },
        { text: item.consignor || "N/A", options: { ...tableRowStyle, align: "left", fill: { color: rowBg } } },
        { text: item.area || "N/A", options: { ...tableRowStyle, align: "left", fill: { color: rowBg } } },
        { text: `${item.delay} Days`, options: { ...tableRowStyle, fill: { color: rowBg }, bold: true, color: "B91C1C" } }
      ]);
    });

    addSingleColumnPaginatedTable("BRANCH-WISE DETAILED LR DELIVERY DELAY AGING REPORT (DELAY >= 2 DAYS)", agingHeaders, agingDataRows, [1.8, 1.2, 1.2, 3.2, 3.2, 1.73], 16);

    // Save the PPT file
    pptx.writeFile({ fileName: `EFF_Performance_Report_${new Date().toISOString().slice(0,10)}.pptx` });
  } catch (error) {
    console.error("PPT Generation Error:", error);
    alert("Error generating PPT presentation. Make sure to refresh the page and re-upload your Excel data file so the new features are initialized in the memory. Details: " + error.message);
  }
}
