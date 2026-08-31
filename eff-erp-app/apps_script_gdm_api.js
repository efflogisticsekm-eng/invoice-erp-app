function doGet(e) {
  var gdmNumber = e.parameter.gdmNumber;
  var branch = e.parameter.branch || 'HO'; // Accept branch for future use if needed
  
  if (!gdmNumber) {
    return ContentService.createTextOutput(JSON.stringify({"error": "gdmNumber is required"})).setMimeType(ContentService.MimeType.JSON);
  }

  var ss = SpreadsheetApp.openById("1G9ApdBn7jq3H7L7KZoMlwkBwDvCcKJ37go8QpaYpo6Y");
  
  // 1. Check for duplicates in Master GDM Expenses
  var masterGdmSheet = ss.getSheetByName("Master GDM Expenses");
  if (masterGdmSheet) {
    var masterData = masterGdmSheet.getDataRange().getValues();
    for (var d = 1; d < masterData.length; d++) {
      var row = masterData[d];
      // Assuming GDM Number is Column C (index 2) as per the new save script plan
      // We will check Column 3 (index 2) for GDM Number.
      if (String(row[2]).trim() === String(gdmNumber).trim()) {
        return ContentService.createTextOutput(JSON.stringify({
          "error": "Duplicate Entry! This GDM (" + gdmNumber + ") has already been submitted."
        })).setMimeType(ContentService.MimeType.JSON);
      }
    }
  }
  
  // Legacy Check for duplicates in old branch-specific sheets (optional but good for transition)
  var legacyGdmSheet = ss.getSheetByName(branch + " GDM");
  if (legacyGdmSheet) {
    var legacyData = legacyGdmSheet.getDataRange().getValues();
    for (var l = 1; l < legacyData.length; l++) {
      var lRow = legacyData[l];
      if (String(lRow[0]).trim() === String(gdmNumber).trim()) {
        return ContentService.createTextOutput(JSON.stringify({
          "error": "Duplicate Entry! This GDM (" + gdmNumber + ") has already been submitted."
        })).setMimeType(ContentService.MimeType.JSON);
      }
    }
  }

  // Proceed with standard fetching
  var despatchSheet = ss.getSheetByName("Despatch Data");
  var despatchData = despatchSheet.getDataRange().getValues();
  var matchedLRs = [];
  
  var normalizeStr = function(str) {
    return String(str).toLowerCase().replace(/[^a-z0-9]/g, '');
  };
  
  for (var i = 1; i < despatchData.length; i++) {
    var row = despatchData[i];
    if (String(row[11]).trim() == String(gdmNumber).trim()) { 
      matchedLRs.push({
        gdmNumber: gdmNumber,
        deliveryDriver: row[17] || "",
        lrNumber: String(row[4]).trim(),
        consignor: String(row[1]).trim(),
        consignee: String(row[2]).trim(),
        destination: String(row[3]).trim(),
        weight: parseFloat(row[6]) || 0,
        boxQtyOnly: row[7] || "", 
        totalFreight: parseFloat(row[9]) || 0
      });
    }
  }

  if (matchedLRs.length === 0) {
    return ContentService.createTextOutput(JSON.stringify({"error": "GDM Number not found", "data": []})).setMimeType(ContentService.MimeType.JSON);
  }

  var allDataSheet = ss.getSheetByName("All Data");
  var allData = allDataSheet.getDataRange().getValues();
  
  var allDataMap = {};
  for (var j = allData.length - 1; j >= 1; j--) {
    var row = allData[j];
    var lr = normalizeStr(row[3]); 
    if (lr && !allDataMap[lr]) {
      
      var paymentType = String(row[14]).toLowerCase().trim(); // Column O (Payment Type)
      var topayAmount = 0;
      
      if (paymentType.indexOf('topay') !== -1 || paymentType.indexOf('to pay') !== -1) {
         topayAmount = parseFloat(row[15]) || 0; // Column P (Amount)
      }
      
      allDataMap[lr] = {
        boxes: row[8],     
        topay: topayAmount     
      };
    }
  }

  var unloadingSheet = ss.getSheetByName("Unloading Master");
  var unloadingData = unloadingSheet ? unloadingSheet.getDataRange().getValues() : [];

  for (var k = 0; k < matchedLRs.length; k++) {
    var item = matchedLRs[k];
    
    var normalizedLr = normalizeStr(item.lrNumber);
    var lrData = allDataMap[normalizedLr] || {};
    
    var boxesFullString = lrData.boxes || item.boxQtyOnly;
    var topayAmount = parseFloat(lrData.topay) || 0; 
    
    item.boxes = boxesFullString; 
    item.topay = topayAmount; 
    
    var boxQty = parseFloat(item.boxQtyOnly) || parseFloat(boxesFullString) || 1; 
    var itemBoxString = String(boxesFullString).toLowerCase();
    
    var ulCharge = 0;
    if (unloadingData.length > 0) {
      for (var m = 1; m < unloadingData.length; m++) {
        var uRow = unloadingData[m];
        var uConsignor = uRow[0]; // A
        var uConsignee = uRow[1]; // B
        
        if (normalizeStr(uConsignor) === normalizeStr(item.consignor) && 
            normalizeStr(uConsignee) === normalizeStr(item.consignee)) {
            
          var rateLogic = normalizeStr(uRow[2]); // C
          var boxType = normalizeStr(uRow[3]); // D
          var rate = parseFloat(uRow[4]) || 0; // E
          
          if (rateLogic === "weight") {
            ulCharge = item.weight * rate;
            break; 
          } else if (rateLogic === "item" || rateLogic === "boxtype" || rateLogic === "itemboxtype") {
            if (boxType === "allboxtype" || boxType === "allanyitem" || normalizeStr(itemBoxString).indexOf(boxType) !== -1) {
              ulCharge = boxQty * rate;
              break;
            }
          }
        }
      }
    }
    item.ulCharge = ulCharge;
  }

  return ContentService.createTextOutput(JSON.stringify({
    "status": "success",
    "data": matchedLRs
  })).setMimeType(ContentService.MimeType.JSON);
}
