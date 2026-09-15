function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    
    // -----------------------------------------------------
    // PETTY CASH SAVE LOGIC
    // -----------------------------------------------------
    if (data.source === 'PettyCash') {
      var ss = SpreadsheetApp.getActiveSpreadsheet();
      var branch = data.branch || 'HO';
      var sheetName = "Master Petty Cash"; 
      
      // Helper function to find the true last row with data
      function getTrueLastRow(sheet, column) {
        var lastRow = sheet.getLastRow();
        if (lastRow === 0) return 0;
        var values = sheet.getRange(1, column, lastRow, 1).getValues();
        for (var i = values.length - 1; i >= 0; i--) {
          if (values[i][0] != null && values[i][0].toString().trim() !== "") {
            return i + 1;
          }
        }
        return 0;
      }
      
      function getMappingSheet() {
        var mappingSheet = ss.getSheetByName("Generated Branch Links");
        if (!mappingSheet) {
          mappingSheet = ss.insertSheet("Generated Branch Links");
          mappingSheet.getRange("A1:B1").setValues([["Branch Name", "Sheet Link"]]);
          mappingSheet.getRange("A1:B1").setFontWeight("bold");
        }
        return mappingSheet;
      }
      
      // Update Master Petty Cash (in current spreadsheet)
      function updateMasterPettyCash() {
        var sheetNameStr = "Master Petty Cash";
        var pcSheet = ss.getSheetByName(sheetNameStr);
        if (!pcSheet) {
          pcSheet = ss.insertSheet(sheetNameStr);
          var headers = [
            "Date", "Branch", "Category", "Head", "Subhead", "Description", 
            "Payment To/From", "Amount", "PURCHASE GST/IGST", "SALE GST/IGST",
            "Extra Details", "Submitted By", "Timestamp", "Cash In (Receipts)", 
            "Cash Out (Payments)", "Running Balance"
          ];
          pcSheet.getRange(1, 1, 1, headers.length).setValues([headers]);
          pcSheet.getRange("A1:P1").setFontWeight("bold");
        }
        
        var lastRow = getTrueLastRow(pcSheet, 1);
        var prevBalance = 0;
        if (lastRow > 1) {
          prevBalance = parseFloat(pcSheet.getRange(lastRow, 16).getValue()) || 0;
        }
        
        var debit = data.type === 'Receipt' ? parseFloat(data.amount) || 0 : 0;
        var credit = data.type === 'Payment' ? parseFloat(data.amount) || 0 : 0;
        var newBalance = prevBalance + debit - credit;
        
        var extraStr = "";
        if (data.extraDetails) {
          for (var key in data.extraDetails) {
            var val = data.extraDetails[key];
            if (val !== "" && val !== null && val !== undefined) {
               extraStr += key + ": " + val + "\n";
            }
          }
        }
          
        var rowData = [
          data.date, branch, data.category, data.head, data.subhead || "", 
          data.description, data.paymentTo || "", data.amount || "", data.gstAmount || "", "", 
          extraStr.trim(), data.submittedBy || "", new Date(), 
          debit || "", credit || "", newBalance
        ];
        
        pcSheet.getRange(lastRow + 1, 1, 1, rowData.length).setValues([rowData]);
      }
      
      function updateExternalBranchSheet() {
        var mappingSheet = getMappingSheet();
        var dataRange = mappingSheet.getDataRange().getValues();
        var spreadsheetUrl = "";
        
        for (var i = 1; i < dataRange.length; i++) {
          if (dataRange[i][0] === branch) {
            spreadsheetUrl = dataRange[i][1];
            break;
          }
        }
        
        var branchSpreadsheet;
        if (spreadsheetUrl) {
          branchSpreadsheet = SpreadsheetApp.openByUrl(spreadsheetUrl);
        } else {
          // Auto-create new external spreadsheet
          branchSpreadsheet = SpreadsheetApp.create(branch + " Branch Account");
          spreadsheetUrl = branchSpreadsheet.getUrl();
          mappingSheet.appendRow([branch, spreadsheetUrl]);
        }
        
        var pcSheet = branchSpreadsheet.getSheets()[0];
        pcSheet.setName("Petty Cash");
        
        var headers = [
          "Date", "Branch", "Category", "Head", "Subhead", "Description", 
          "Payment To/From", "Amount", "PURCHASE GST/IGST", "SALE GST/IGST",
          "Extra Details", "Submitted By", "Timestamp", "Cash In (Receipts)", 
          "Cash Out (Payments)", "Running Balance"
        ];
        
        if (pcSheet.getLastRow() === 0) {
          pcSheet.getRange(1, 1, 1, headers.length).setValues([headers]);
          pcSheet.getRange("A1:P1").setFontWeight("bold");
        }
        
        var lastRow = getTrueLastRow(pcSheet, 1);
        var prevBalance = 0;
        if (lastRow > 1) {
          prevBalance = parseFloat(pcSheet.getRange(lastRow, 16).getValue()) || 0;
        }
        
        var debit = data.type === 'Receipt' ? parseFloat(data.amount) || 0 : 0;
        var credit = data.type === 'Payment' ? parseFloat(data.amount) || 0 : 0;
        var newBalance = prevBalance + debit - credit;
        
        var extraStr = "";
        if (data.extraDetails) {
          for (var key in data.extraDetails) {
            var val = data.extraDetails[key];
            if (val !== "" && val !== null && val !== undefined) {
               extraStr += key + ": " + val + "\n";
            }
          }
        }
          
        var rowData = [
          data.date, branch, data.category, data.head, data.subhead || "", 
          data.description, data.paymentTo || "", data.amount || "", data.gstAmount || "", "", 
          extraStr.trim(), data.submittedBy || "", new Date(), 
          debit || "", credit || "", newBalance
        ];
        
        pcSheet.getRange(lastRow + 1, 1, 1, rowData.length).setValues([rowData]);
      }
      
      // Update Master Sheet
      updateMasterPettyCash();
      
      // Update External Branch Sheet Automatically
      if (branch) {
        updateExternalBranchSheet();
      }
      
      return ContentService.createTextOutput(JSON.stringify({"status": "success"}))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // -----------------------------------------------------
    // GDM EXPENSE ENTRY SAVE LOGIC
    // -----------------------------------------------------
    if (data.source === 'GdmExpenseEntry') {
      var ss = SpreadsheetApp.getActiveSpreadsheet();
      var branch = data.branch || 'HO';
      var sheetName = "Master GDM Expenses"; 
      var sheet = ss.getSheetByName(sheetName);
      
      if (!sheet) {
        sheet = ss.insertSheet(sheetName);
        sheet.appendRow([
          "Date", "Branch", "GDM Number", "Delivery Driver", "Lr Number", "Consignor", "Consignee", "Destination",
          "No of Boxes", "Boxes", "Weight", "Total Freight", "Topay", "Topay GST", "Actual UL Charge",
          "Bonnus", "RA", "Addl RA", "Total Rcble",
          "Bata", "Total Exp", "Net amount",
          "Recieved Cash from Driver", "Timestamp", "Submitted By"
        ]);
        sheet.getRange("A1:Y1").setFontWeight("bold");
      }
      
      if (data.rows && data.rows.length > 0) {
        var firstRow = data.rows[0];
        
        // Ledger Logic
        var ledgerSheet = ss.getSheetByName("All Drivers Data");
        if (!ledgerSheet) {
          ledgerSheet = ss.insertSheet("All Drivers Data");
          var lHeaders = ["Date", "Branch", "GDM Number", "Driver Name", "Liability (To-Pay/RA)", "Payment (Settled)", "Advance", "Timestamp"];
          ledgerSheet.getRange(1, 1, 1, lHeaders.length).setValues([lHeaders]);
          ledgerSheet.getRange("A1:H1").setFontWeight("bold");
        }
        
        var sumBonus = data.rows.reduce((acc, r) => acc + (parseFloat(r.bonusParkingFee) || 0), 0);
        var liability = (parseFloat(firstRow.topayGstTotal) || 0) + (parseFloat(firstRow.ra) || 0) + (parseFloat(firstRow.addlRa) || 0);
        var paymentSettled = (parseFloat(firstRow.bata) || 0) + (parseFloat(firstRow.totalExp) - (parseFloat(firstRow.bata) || 0) - sumBonus) + sumBonus + (parseFloat(firstRow.receivedCash) || 0);
        // Specifically: Bata + Actual UL + Bonus/Parking + Received Cash
        // The totalExp already has sumBonus + sumActualUl + Bata. So we can just use totalExp + receivedCash
        var trueSettled = (parseFloat(firstRow.totalExp) || 0) + (parseFloat(firstRow.receivedCash) || 0);
        
        ledgerSheet.appendRow([
            new Date(),
            branch,
            firstRow.gdmNumber,
            firstRow.deliveryDriver || "Unknown Driver",
            liability,
            trueSettled,
            "",
            new Date()
        ]);
        
        for (var i = 0; i < data.rows.length; i++) {
          var row = data.rows[i];
          sheet.appendRow([
            new Date(), 
            branch, 
            row.gdmNumber, 
            row.deliveryDriver, 
            row.lrNumber, 
            row.consignor, 
            row.consignee, 
            row.destination,
            row.noOfBoxes, 
            row.boxes, 
            row.weight, 
            row.totalFreight, 
            row.topay, 
            row.topayGst, 
            row.actualUlCharge,
            row.bonusParkingFee, 
            row.ra, 
            row.addlRa, 
            row.totalRcble,
            row.bata, 
            row.totalExp, 
            row.netAmount,
            row.receivedCash, 
            new Date(), 
            data.submittedBy
          ]);
        }
      }
      
      return ContentService.createTextOutput(JSON.stringify({"status": "success"}))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    // -----------------------------------------------------
    // GENERAL / NEW EXPENSE (Scanner) SAVE LOGIC
    // -----------------------------------------------------
    if (data.status === 'Approved' && data.category) {
      var ss = SpreadsheetApp.getActiveSpreadsheet();
      var branch = data.branch || 'HO';
      var sheetName = "Master General Expenses"; 
      var genSheet = ss.getSheetByName(sheetName);
      
      if (!genSheet) {
        genSheet = ss.insertSheet(sheetName);
        genSheet.appendRow([
          "I'd", "Entry Date", "Branch", "Category", "Sub Category", 
          "Unit /Item", "Qty", "Rate", "Amount", "GST", "IGST", "%", "Total Amount",
          "Bill No", "Bill Date", "Billing Party's GSTIN", "Billing Party Name",
          "Paying Amount", "Balance Payable", "Payment to Name", "Account Name",
          "IFSC Code", "Bank Name", "Entry By",
          "1st Approval", "2nd Approval", "3rd Approval", "4th Approval", "Final Approval", "Remarks"
        ]);
        genSheet.getRange("A1:AD1").setFontWeight("bold");
      }
      
      // Validation: Check for duplicates using the ID
      if (data.id) {
        var existingIds = genSheet.getRange("A:A").getValues().flat();
        if (existingIds.includes(data.id)) {
           return ContentService.createTextOutput(JSON.stringify({"status": "duplicate_skipped"}))
             .setMimeType(ContentService.MimeType.JSON);
        }
      }
      
      var det = data.details || {};
      
      var appChain = det.approvalChain || [];
      var app1 = appChain.length > 0 ? appChain[0] : "";
      var app2 = appChain.length > 1 ? appChain[1] : "";
      var app3 = appChain.length > 2 ? appChain[2] : "";
      var app4 = appChain.length > 3 ? appChain[3] : "";
      var appFinal = appChain.length > 4 ? appChain[4] : (appChain.length > 0 ? appChain[appChain.length - 1] : "");
      
      // Collect any leftover details into remarks
      var remarks = det.putDescription || "";
      var leftover = "";
      var skipKeys = ["unitItem", "qty", "rate", "billNo", "billDate", "billingGstin", "billingPartyName", "advance", "paymentToName", "accountName", "ifscCode", "bankName", "putDescription", "approvalChain", "cgstAmount", "sgstAmount", "igstAmount", "gstRate", "sheetSync"];
      for (var k in det) {
        if (skipKeys.indexOf(k) === -1 && det[k] !== "" && det[k] !== null && det[k] !== undefined) {
          leftover += k + ": " + det[k] + "\n";
        }
      }
      if (leftover) {
        remarks = remarks ? remarks + "\n" + leftover.trim() : leftover.trim();
      }

      var rowData = [
        data.id,
        new Date(),
        branch,
        data.category,
        data.sub_category,
        det.unitItem || "",
        det.qty || "",
        det.rate || "",
        data.amount || "",
        data.gst_amount || "",
        det.igstAmount || "",
        det.gstRate || "",
        data.total_amount || "",
        det.billNo || "",
        det.billDate || "",
        det.billingGstin || "",
        det.billingPartyName || "",
        det.advance || data.total_amount || "",
        det.balanceAmount || ((data.total_amount || 0) - (parseFloat(det.advance) || 0)),
        det.paymentToName || "",
        det.accountName || "",
        det.ifscCode || "",
        det.bankName || "",
        data.user_role || "",
        app1,
        app2,
        app3,
        app4,
        appFinal,
        remarks
      ];

      genSheet.appendRow(rowData);

      // Update Branch Sheet for General Expenses
      if (branch) {
        try {
          var mappingSheet = ss.getSheetByName("Generated Branch Links");
          if (!mappingSheet) {
            mappingSheet = ss.insertSheet("Generated Branch Links");
            mappingSheet.getRange("A1:B1").setValues([["Branch Name", "Sheet Link"]]);
            mappingSheet.getRange("A1:B1").setFontWeight("bold");
          }
          
          var mapData = mappingSheet.getDataRange().getValues();
          var branchUrl = "";
          for (var m = 1; m < mapData.length; m++) {
            if (mapData[m][0] === branch) {
              branchUrl = mapData[m][1];
              break;
            }
          }
          
          var branchSs;
          if (branchUrl) {
            branchSs = SpreadsheetApp.openByUrl(branchUrl);
          } else {
            branchSs = SpreadsheetApp.create(branch + " Branch Account");
            branchUrl = branchSs.getUrl();
            mappingSheet.appendRow([branch, branchUrl]);
            var defaultSheet = branchSs.getSheets()[0];
            defaultSheet.setName("Petty Cash");
            var pcHeaders = [
            "Date", "Branch", "Category", "Head", "Subhead", "Description", 
            "Payment To/From", "Amount", "PURCHASE GST/IGST", "SALE GST/IGST",
            "Extra Details", "Submitted By", "Timestamp", "Cash In (Receipts)", 
            "Cash Out (Payments)", "Running Balance"
          ];
            defaultSheet.getRange(1, 1, 1, pcHeaders.length).setValues([pcHeaders]);
            defaultSheet.getRange("A1:P1").setFontWeight("bold");
          }
          
          if (branchSs) {
            var branchGenSheet = branchSs.getSheetByName("General Expenses");
            if (!branchGenSheet) {
              branchGenSheet = branchSs.insertSheet("General Expenses");
              branchGenSheet.appendRow([
                "I'd", "Entry Date", "Branch", "Category", "Sub Category", 
                "Unit /Item", "Qty", "Rate", "Amount", "GST", "IGST", "%", "Total Amount",
                "Bill No", "Bill Date", "Billing Party's GSTIN", "Billing Party Name",
                "Paying Amount", "Balance Payable", "Payment to Name", "Account Name",
                "IFSC Code", "Bank Name", "Entry By",
                "1st Approval", "2nd Approval", "3rd Approval", "4th Approval", "Final Approval", "Remarks"
              ]);
              branchGenSheet.getRange("A1:AD1").setFontWeight("bold");
            }
            branchGenSheet.appendRow(rowData);
          }
        } catch(err) {
          console.error("Error updating branch sheet for General Expenses: " + err.message);
        }
      }
      
      return ContentService.createTextOutput(JSON.stringify({"status": "success"}))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    return ContentService.createTextOutput(JSON.stringify({"error": "Unknown source"}))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch(e) {
    return ContentService.createTextOutput(JSON.stringify({"error": e.message}))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doOptions(e) {
  return ContentService.createTextOutput("OK")
    .setMimeType(ContentService.MimeType.TEXT);
}

// 14 ബ്രാഞ്ച് ഷീറ്റുകൾ ഉണ്ടാക്കാനുള്ള സ്ക്രിപ്റ്റ് (For manual creation if needed)
function createAllBranchSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var mappingSheet = ss.getSheetByName("Generated Branch Links");
  if (!mappingSheet) {
    mappingSheet = ss.insertSheet("Generated Branch Links");
    mappingSheet.getRange("A1:B1").setValues([["Branch Name", "Sheet Link"]]);
    mappingSheet.getRange("A1:B1").setFontWeight("bold");
  }
  
  var branches = [
    "EDATHALA", "CFA-CLT", "CFA-Honda", "CFA-Eloor", "KRL", 
    "KOLLAM", "ASIAN KOLLAM", "ASIAN THRISSUR", "CALICUT", "KOTTAYAM", 
    "MALAPPURAM", "KANNUR", "KASARGOD", "HO"
  ];
  
  var existingData = mappingSheet.getDataRange().getValues();
  var existingBranches = existingData.map(function(row) { return row[0]; });

  for (var i = 0; i < branches.length; i++) {
    var b = branches[i];
    if (existingBranches.indexOf(b) === -1) {
      // Create new external spreadsheet
      var branchSpreadsheet = SpreadsheetApp.create(b + " Branch Account");
      var url = branchSpreadsheet.getUrl();
      
      var pcSheet = branchSpreadsheet.getSheets()[0];
      pcSheet.setName("Petty Cash");
      var headers = [
            "Date", "Branch", "Category", "Head", "Subhead", "Description", 
            "Payment To/From", "Amount", "PURCHASE GST/IGST", "SALE GST/IGST",
            "Extra Details", "Submitted By", "Timestamp", "Cash In (Receipts)", 
            "Cash Out (Payments)", "Running Balance"
          ];
      pcSheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      pcSheet.getRange("A1:P1").setFontWeight("bold");
      
      var genSheet = branchSpreadsheet.insertSheet("General Expenses");
      genSheet.appendRow([
        "I'd", "Entry Date", "Branch", "Category", "Sub Category", 
        "Unit /Item", "Qty", "Rate", "Amount", "GST", "IGST", "%", "Total Amount",
        "Bill No", "Bill Date", "Billing Party's GSTIN", "Billing Party Name",
        "Paying Amount", "Balance Payable", "Payment to Name", "Account Name",
        "IFSC Code", "Bank Name", "Entry By",
        "1st Approval", "2nd Approval", "3rd Approval", "4th Approval", "Final Approval", "Remarks"
      ]);
      genSheet.getRange("A1:AD1").setFontWeight("bold");
      
      mappingSheet.appendRow([b, url]);
    }
  }
  SpreadsheetApp.getUi().alert("14 Branch sheets linked successfully!");
}
