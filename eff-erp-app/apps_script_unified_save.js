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
      var pettySheet = ss.getSheetByName(sheetName);
      
      if (!pettySheet) {
        pettySheet = ss.insertSheet(sheetName);
        pettySheet.appendRow([
          "Date", "Branch", "Category", "Head", "Subhead", "Type", 
          "Amount", "Description", "Extra Details", "Submitted By", "Timestamp"
        ]);
        pettySheet.getRange("A1:K1").setFontWeight("bold");
      }
      
      var extraStr = "";
      if (data.extraDetails) {
        for (var key in data.extraDetails) {
          var val = data.extraDetails[key];
          if (val !== "" && val !== null && val !== undefined) {
             extraStr += key + ": " + val + "\n";
          }
        }
      }
      
      pettySheet.appendRow([
        data.date, 
        branch,
        data.category, 
        data.head, 
        data.subhead, 
        data.type, 
        data.amount, 
        data.description, 
        extraStr.trim(), 
        data.submittedBy,
        new Date()
      ]);
      
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
          "Advance", "Balance Payable", "Payment to Name", "Account Name",
          "IFSC Code", "Bank Name", "Remarks", "Entry By",
          "1st Approval", "2nd Approval", "3rd Approval", "4th Approval", "Final Approval"
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

      genSheet.appendRow([
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
        det.advance || "",
        det.balanceAmount || ((data.total_amount || 0) - (parseFloat(det.advance) || 0)),
        det.paymentToName || "",
        det.accountName || "",
        det.ifscCode || "",
        det.bankName || "",
        remarks,
        data.user_role || "",
        app1,
        app2,
        app3,
        app4,
        appFinal
      ]);
      
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
