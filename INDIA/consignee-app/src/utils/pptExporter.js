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
    let totalAmount = 0;
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
      const podRate = item.podRate || 0;
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
      totalAmount += metrics.amount || 0;
      sumScores += item.score || 0;

      if (item.avgDelay !== "-" && !isNaN(Number(item.avgDelay))) {
        totalDelaysForAvg += Number(item.avgDelay) * (item.deliveredLrs || 0);
        totalDeliveredLrsForAvg += item.deliveredLrs || 0;
      }

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

    // Add TOTAL / AVERAGE row
    const avgSndRate = totalDeliveredLrs > 0 ? (totalSndCount / totalDeliveredLrs) * 100 : 0;
    const avgDelay2Rate = totalDeliveredLrs > 0 ? (totalDelay2Count / totalDeliveredLrs) * 100 : 0;
    const avgDelay3Rate = totalDeliveredLrs > 0 ? (totalDelay3Count / totalDeliveredLrs) * 100 : 0;
    const avgDelay4AboveRate = totalDeliveredLrs > 0 ? (totalDelay4AboveCount / totalDeliveredLrs) * 100 : 0;
    const avgPodRate = totalDeliveredLrs > 0 ? (totalPodCount / totalDeliveredLrs) * 100 : 0;
    const avgScore = sortedLeaderboard.length > 0 ? Math.round(sumScores / sortedLeaderboard.length) : 0;
    const overallAvgDelay = totalDeliveredLrsForAvg > 0 ? (totalDelaysForAvg / totalDeliveredLrsForAvg).toFixed(1) : "-";

    const slide1TotalRowStyle = {
      fill: { color: "CBD5E1" },
      fontSize: 8.0,
      align: "center",
      valign: "middle",
      bold: true,
      color: "000000"
    };

    branchTableRows.push([
      { text: "TOTAL / AVERAGE", options: { ...slide1TotalRowStyle, align: "left" } },
      { text: `${totalDeliveredLrs} / ${totalTotalLrs}`, options: slide1TotalRowStyle },
      { text: `${totalSndCount} (${avgSndRate.toFixed(0)}%)`, options: { ...slide1TotalRowStyle, color: "0284C7" } },
      { text: `${totalDelay2Count} (${avgDelay2Rate.toFixed(0)}%)`, options: slide1TotalRowStyle },
      { text: `${totalDelay3Count} (${avgDelay3Rate.toFixed(0)}%)`, options: slide1TotalRowStyle },
      { text: `${totalDelay4AboveCount} (${avgDelay4AboveRate.toFixed(0)}%)`, options: { ...slide1TotalRowStyle, color: "B91C1C" } },
      { 
        text: `${totalPodCount} (${avgPodRate.toFixed(0)}%)\n${totalPendingCount > 0 ? `(${totalPendingCount} Pending)` : ""}`, 
        options: { 
          ...slide1TotalRowStyle,
          color: totalPendingCount > 0 ? "B91C1C" : "15803D"
        } 
      },
      { text: totalTotalBoxes.toLocaleString(), options: slide1TotalRowStyle },
      { text: totalDeliveryPoints.toLocaleString(), options: slide1TotalRowStyle },
      { text: `₹${totalFreight.toLocaleString("en-IN")}`, options: slide1TotalRowStyle },
      { text: `₹${totalAmount.toLocaleString("en-IN")}`, options: slide1TotalRowStyle },
      { text: String(avgScore), options: slide1TotalRowStyle },
      { text: overallAvgDelay !== "-" ? `${overallAvgDelay} Days` : "-", options: slide1TotalRowStyle }
    ]);

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
    
    // 1. 2nd Day Rate chart (decimals for % format)
    const delay2ChartData = [
      {
        name: "2nd Day Rate (%)",
        labels: branchNames,
        values: sortedLeaderboard.map(b => (b.delay2Rate || 0) / 100)
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
      // Top Left: 2nd Day Column Chart (formatted as %)
      slide2.addChart(pptx.ChartType.bar, delay2ChartData, {
        x: 0.5, y: 1.1, w: 5.8, h: 2.6, barDir: "col",
        showLegend: false, chartColors: [purple],
        showValue: true, valueFontSize: 8.5, valueColor: "1E293B", valueFormat: "0%",
        title: "Branch-wise 2nd Day Delivery Rate (%)", titleFontSize: 11, titleColor: purple, titleBold: true
      });

      // Top Right: Boxes Doughnut Chart (formatted with commas)
      slide2.addChart(pptx.ChartType.doughnut, boxesChartData, {
        x: 7.0, y: 1.1, w: 5.8, h: 2.6,
        showLegend: true, legendPos: "r", legendFontSize: 8,
        chartColors: ["5B2482", "00A3E0", "10B981", "F59E0B", "EF4444", "6366F1", "EC4899"],
        holeSize: 55, showValue: true, dataLabelFontSize: 8, valueFormat: "#,##0",
        title: "Branch-wise Boxes Delivered", titleFontSize: 11, titleColor: purple, titleBold: true
      });

      // Bottom Left: Freight Doughnut Chart (formatted as Rupee Currency)
      slide2.addChart(pptx.ChartType.doughnut, freightChartData, {
        x: 0.5, y: 4.1, w: 5.8, h: 2.6,
        showLegend: true, legendPos: "r", legendFontSize: 8,
        chartColors: ["5B2482", "00A3E0", "10B981", "F59E0B", "EF4444", "6366F1", "EC4899"],
        holeSize: 55, showValue: true, dataLabelFontSize: 8, valueFormat: "₹#,##0",
        title: "Branch-wise Freight Collected (₹)", titleFontSize: 11, titleColor: purple, titleBold: true
      });

      // Bottom Right: Avg Delay Column Chart (formatted to 1 decimal place)
      slide2.addChart(pptx.ChartType.bar, avgDelayChartData, {
        x: 7.0, y: 4.1, w: 5.8, h: 2.6, barDir: "col",
        showLegend: false, chartColors: [cyan],
        showValue: true, valueFontSize: 8.5, valueColor: "1E293B", valueFormat: "0.0",
        title: "Branch-wise Average Delay (Days)", titleFontSize: 11, titleColor: purple, titleBold: true
      });
    }


    // ==========================================
    // SLIDE 3: BRANCH-WISE DELIVERY DELAY ANALYSIS (DETAILED 18 COLUMNS MATRIX)
    // ==========================================
    const slide3 = pptx.addSlide();
    addSlideLayout(slide3, "BRANCH-WISE DELIVERY DELAY ANALYSIS");

    // Calculate branch delay matrix (0 to 16+ days)
    const branchDelayMatrix = {};
    allItems.forEach(item => {
      if (item.status === 'Delivery Process completed.') {
        const b = item.branch || "without despatched delivery";
        if (!branchDelayMatrix[b]) {
          branchDelayMatrix[b] = Array(17).fill(0); // 0 = Same Day, 1 = 1d, ..., 15 = 15d, 16 = 16d+
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

    // Detailed headers matching the Screenshot 4 request
    const slide3HeaderStyle = {
      ...tableHeaderStyle,
      fontSize: 6.5
    };
    const slide3RowStyle = {
      ...tableRowStyle,
      fontSize: 6.5
    };

    const delayDetailedHeaders = [
      { text: "Branch", options: { ...slide3HeaderStyle, align: "left" } },
      { text: "SAME\nDAY", options: slide3HeaderStyle },
      { text: "NEXT\nDAY", options: slide3HeaderStyle },
      { text: "2 ND\nDAY", options: slide3HeaderStyle },
      { text: "3rd\nDay", options: slide3HeaderStyle },
      { text: "4th\nDay", options: slide3HeaderStyle },
      { text: "5th\nDay", options: slide3HeaderStyle },
      { text: "6th\nDay", options: slide3HeaderStyle },
      { text: "7th\nDay", options: slide3HeaderStyle },
      { text: "8th\nDay", options: slide3HeaderStyle },
      { text: "9th\nDay", options: slide3HeaderStyle },
      { text: "10th\nDay", options: slide3HeaderStyle },
      { text: "11th\nDay", options: slide3HeaderStyle },
      { text: "12th\nDay", options: slide3HeaderStyle },
      { text: "13th\nDay", options: slide3HeaderStyle },
      { text: "14th\nDay", options: slide3HeaderStyle },
      { text: "15th\nDay", options: slide3HeaderStyle },
      { text: "16th+\nDay", options: slide3HeaderStyle }
    ];

    const delayTableRows = [delayDetailedHeaders];
    const totalDelayMatrix = Array(17).fill(0);

    sortedLeaderboard.forEach((item, idx) => {
      const rowBg = idx % 2 === 1 ? lightGrey : "FFFFFF";
      const arr = branchDelayMatrix[item.name] || Array(17).fill(0);
      
      const rowCells = [{ text: item.name || "N/A", options: { ...slide3RowStyle, align: "left", bold: true, fill: { color: rowBg } } }];
      
      for (let i = 0; i <= 16; i++) {
        const val = arr[i];
        totalDelayMatrix[i] += val;
        // Display cell value or keep empty if 0
        rowCells.push({ text: val > 0 ? String(val) : "", options: { ...slide3RowStyle, fill: { color: rowBg } } });
      }
      delayTableRows.push(rowCells);
    });

    // Add TOTAL row at the bottom of the table
    const slide3TotalRowStyle = {
      fill: { color: "CBD5E1" },
      fontSize: 6.5,
      align: "center",
      valign: "middle",
      bold: true,
      color: "000000"
    };

    const totalCells = [{ text: "TOTAL", options: { ...slide3TotalRowStyle, align: "left" } }];
    for (let i = 0; i <= 16; i++) {
      totalCells.push({ text: totalDelayMatrix[i] > 0 ? String(totalDelayMatrix[i]) : "", options: slide3TotalRowStyle });
    }
    delayTableRows.push(totalCells);

    const delayTableHeight = 0.5 + (delayTableRows.length * 0.35);
    slide3.addTable(delayTableRows, {
      x: 0.5,
      y: 1.1,
      w: 12.33,
      // colW: 2.13 branch + 17 columns of 0.6 inches = 12.33
      colW: [2.13, 0.6, 0.6, 0.6, 0.6, 0.6, 0.6, 0.6, 0.6, 0.6, 0.6, 0.6, 0.6, 0.6, 0.6, 0.6, 0.6, 0.6],
      border: { pt: 0.5, color: "CBD5E1" }
    });

    // Chart at the bottom updated with delay categories mapped from matrix
    const delayChartData = [
      {
        name: "Same Day",
        labels: branchNames,
        values: sortedLeaderboard.map(b => {
          const arr = branchDelayMatrix[b.name] || Array(17).fill(0);
          return arr[0];
        })
      },
      {
        name: "Next Day",
        labels: branchNames,
        values: sortedLeaderboard.map(b => {
          const arr = branchDelayMatrix[b.name] || Array(17).fill(0);
          return arr[1];
        })
      },
      {
        name: "2nd Day",
        labels: branchNames,
        values: sortedLeaderboard.map(b => {
          const arr = branchDelayMatrix[b.name] || Array(17).fill(0);
          return arr[2];
        })
      },
      {
        name: "3rd Day",
        labels: branchNames,
        values: sortedLeaderboard.map(b => {
          const arr = branchDelayMatrix[b.name] || Array(17).fill(0);
          return arr[3];
        })
      },
      {
        name: "4th Day+",
        labels: branchNames,
        values: sortedLeaderboard.map(b => {
          const arr = branchDelayMatrix[b.name] || Array(17).fill(0);
          return arr.slice(4).reduce((sum, val) => sum + val, 0);
        })
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
        chartColors: ["0284C7", "F59E0B", "10B981", "EF4444", "6B7280"], // sky, amber, emerald, red, grey
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
    // SLIDE 5: CUSTOMER-WISE PERFORMANCE & FREIGHT TURNOVER REPORT (MERGED & ATTACHED AS REQUESTED)
    // ==========================================
    // Aggregate consignor combined metrics
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
      .filter(item => item.name.toUpperCase() !== 'TOTAL' && item.name.toUpperCase() !== 'GRAND TOTAL') // Remove totals
      .sort((a, b) => b.freight - a.freight); // Sort by freight descending

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
        { text: item.name || "N/A", options: { ...multiColRowStyle, align: "left", bold: true, fill: { color: rowBg } } },
        { text: String(item.totalLrs || 0), options: { ...multiColRowStyle, fill: { color: rowBg } } },
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
        },
        { text: `₹${(item.freight || 0).toLocaleString("en-IN")}`, options: { ...multiColRowStyle, fill: { color: rowBg }, bold: true, color: "15803D" } }
      ]);
    });

    // Calculate customer overall totals
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
      { text: "TOTAL / AVERAGE", options: { ...multiColRowStyle, align: "left", bold: true, fill: { color: "CBD5E1" } } },
      { text: String(customerTotalLrs), options: { ...multiColRowStyle, bold: true, fill: { color: "CBD5E1" } } },
      { text: String(customerDelivered), options: { ...multiColRowStyle, bold: true, fill: { color: "CBD5E1" } } },
      { text: `${customerAvgSnd.toFixed(0)}%`, options: { ...multiColRowStyle, bold: true, fill: { color: "CBD5E1" } } },
      { text: `${customerAvgDelay.toFixed(1)} Days`, options: { ...multiColRowStyle, bold: true, fill: { color: "CBD5E1" } } },
      { text: `₹${customerTotalFreight.toLocaleString("en-IN")}`, options: { ...multiColRowStyle, bold: true, fill: { color: "CBD5E1" }, color: "15803D" } }
    ];

    customerMergedDataRows.push(customerTotalRow);

    // Render combining both delay and freight turnover in 2 columns
    addMultiColumnTable("CUSTOMER-WISE PERFORMANCE & FREIGHT TURNOVER REPORT", customerMergedHeaders, customerMergedDataRows, [4.33, 1.3, 1.3, 1.7, 1.7, 2.0], 2, 22);


    // ==========================================
    // SLIDE 6: DESTINATION WISE DELAY & FREIGHT REPORT (PAGINATED, 2-COLUMNS, COMPACT, FILTERED >= 2 DAYS)
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

    // Add totals row at the end of destination report
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
      { text: "TOTAL / AVERAGE", options: { ...multiColRowStyle, align: "left", bold: true, fill: { color: "CBD5E1" } } },
      { text: String(destTotalLrs), options: { ...multiColRowStyle, bold: true, fill: { color: "CBD5E1" } } },
      { text: `${destAvgDelay.toFixed(1)} Days`, options: { ...multiColRowStyle, bold: true, fill: { color: "CBD5E1" } } },
      { text: `₹${destTotalFreight.toLocaleString("en-IN")}`, options: { ...multiColRowStyle, bold: true, fill: { color: "CBD5E1" }, color: "0284C7" } }
    ];

    destinationDataRows.push(destTotalRow);

    addMultiColumnTable("DESTINATION-WISE DELAYS >= 2 DAYS REPORT", destinationHeaders, destinationDataRows, [5.83, 2.0, 2.0, 2.5], 2, 22);


    // ==========================================
    // SLIDE 7: DRIVER WISE PERFORMANCE REPORT
    // ==========================================
    const slide7 = pptx.addSlide();
    addSlideLayout(slide7, "DRIVER PERFORMANCE REPORT");

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

    slide7.addTable(driverTableRows, {
      x: 0.5,
      y: 1.1,
      w: 12.33,
      colW: [2.5, 2.0, 1.4, 2.0, 1.4, 1.63, 1.4],
      border: { pt: 0.5, color: "CBD5E1" }
    });


    // ==========================================
    // SLIDE 8: BRANCH-WISE DETAILED LR DELIVERY DELAY AGING REPORT
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
