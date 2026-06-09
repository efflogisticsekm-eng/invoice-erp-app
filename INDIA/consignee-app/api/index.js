import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import cors from 'cors';
import { DocumentAnalysisClient, AzureKeyCredential } from "@azure/ai-form-recognizer";
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';

const { Client } = pg;

const app = express();
app.use(cors());

// Vercel Serverless Functions have limits on memory/body parsing. multer.memoryStorage works well.
const upload = multer({ storage: multer.memoryStorage() });

const endpoint = process.env.AZURE_ENDPOINT || "<AZURE_ENDPOINT>";
const apiKey = process.env.AZURE_API_KEY || "<AZURE_API_KEY>";
const modelId = process.env.AZURE_MODEL_ID || "prebuilt-invoice";

const supabaseUrl = process.env.SUPABASE_URL || "";
const supabaseKey = process.env.SUPABASE_KEY || "";
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

// Helpers for stream parsing, GSTIN cleaning, and IST date-time conversion
const getRawBody = (req) => {
  return new Promise((resolve, reject) => {
    let chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', (err) => reject(err));
  });
};

const getFileBuffer = async (req) => {
  console.log("getFileBuffer: req.body present?", !!req.body);
  if (req.body) {
    console.log("getFileBuffer: req.body type =", typeof req.body, "isBuffer =", Buffer.isBuffer(req.body));
    if (Buffer.isBuffer(req.body)) {
      console.log("getFileBuffer: req.body length =", req.body.length);
      try {
        const str = req.body.toString('utf-8').trim();
        console.log("getFileBuffer: Buffer preview =", str.substring(0, 200));
        if (str.startsWith('{')) {
          const parsed = JSON.parse(str);
          if (parsed && parsed.$content) {
            console.log("getFileBuffer: Decoded $content from JSON in buffer. length =", parsed.$content.length);
            return Buffer.from(parsed.$content, 'base64');
          }
        }
      } catch (e) {
        console.log("getFileBuffer: Failed to parse buffer as JSON:", e.message);
      }
      return req.body;
    }
    if (typeof req.body === 'object') {
      console.log("getFileBuffer: req.body object keys =", Object.keys(req.body));
      if (req.body.$content) {
        return Buffer.from(req.body.$content, 'base64');
      }
      return Buffer.from(JSON.stringify(req.body));
    }
    if (typeof req.body === 'string') {
      console.log("getFileBuffer: req.body string length =", req.body.length, "preview =", req.body.substring(0, 200));
      try {
        const parsed = JSON.parse(req.body);
        if (parsed && parsed.$content) {
          return Buffer.from(parsed.$content, 'base64');
        }
      } catch (e) {}
      
      if (/^[A-Za-z0-9+/=]+$/.test(req.body) && req.body.length > 100) {
        return Buffer.from(req.body, 'base64');
      }
      return Buffer.from(req.body, 'utf-8');
    }
  }

  // 2. Fallback: read the raw stream if not pre-consumed
  try {
    console.log("getFileBuffer: Reading raw stream fallback...");
    const rawData = await getRawBody(req);
    console.log("getFileBuffer: Raw stream read length =", rawData ? rawData.length : 0);
    if (rawData && rawData.length > 0) {
      try {
        const str = rawData.toString('utf-8').trim();
        console.log("getFileBuffer: Raw stream preview =", str.substring(0, 200));
        if (str.startsWith('{')) {
          const parsed = JSON.parse(str);
          if (parsed && parsed.$content) {
            console.log("getFileBuffer: Decoded $content from JSON in raw stream. length =", parsed.$content.length);
            return Buffer.from(parsed.$content, 'base64');
          }
        }
      } catch (e) {}
      return rawData;
    }
  } catch (err) {
    console.error("Error reading raw body stream:", err);
  }

  return null;
};


function cleanGSTIN(val) {
  if (!val) return "";
  let cleaned = String(val).replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  if (cleaned.length !== 15) return "";

  // OCR Substitution maps for correcting common scanner errors
  const letToNum = {
    'I': '1', 'L': '1', 'O': '0', 'S': '5', 'Z': '2', 
    'B': '8', 'T': '7', 'G': '6', 'J': '9', 'E': '3', 
    'A': '4'
  };
  const numToLet = {
    '1': 'I', '0': 'O', '2': 'Z', '5': 'S', '8': 'B', 
    '6': 'G', '9': 'J', '3': 'E', '4': 'A', '7': 'T'
  };

  const chars = cleaned.split('');

  // 1. State Code (indices 0 and 1) must be digits
  for (let i = 0; i <= 1; i++) {
    if (!/\d/.test(chars[i])) {
      chars[i] = letToNum[chars[i]] || chars[i];
    }
  }

  // 2. PAN first 5 characters (indices 2 to 6) must be letters
  for (let i = 2; i <= 6; i++) {
    if (!/[A-Z]/.test(chars[i])) {
      chars[i] = numToLet[chars[i]] || chars[i];
    }
  }

  // 3. PAN next 4 characters (indices 7 to 10) must be digits
  for (let i = 7; i <= 10; i++) {
    if (!/\d/.test(chars[i])) {
      chars[i] = letToNum[chars[i]] || chars[i];
    }
  }

  // 4. PAN last character (index 11) must be a letter
  if (!/[A-Z]/.test(chars[11])) {
    chars[11] = numToLet[chars[11]] || chars[11];
  }

  // 5. Entity code (index 12) must be a digit (usually 1 or 2)
  if (!/\d/.test(chars[12])) {
    chars[12] = letToNum[chars[12]] || chars[12];
  }

  // 6. Default character (index 13) is usually 'Z'
  if (chars[13] !== 'Z') {
    if (['2', '7', 'S', '5', 'T'].includes(chars[13])) {
      chars[13] = 'Z';
    }
  }

  // 7. Calculate and correct the check digit (index 14) using Luhn Mod 36 algorithm
  try {
    const getCharVal = (c) => {
      return /\d/.test(c) ? parseInt(c, 10) : c.charCodeAt(0) - 65 + 10;
    };
    const getValChar = (v) => {
      return v <= 9 ? String(v) : String.fromCharCode(65 + v - 10);
    };

    let totalSum = 0;
    for (let i = 0; i < 14; i++) {
      const charVal = getCharVal(chars[i]);
      const factor = (i % 2 === 0) ? 1 : 2;
      const product = charVal * factor;
      const digitSum = Math.floor(product / 36) + (product % 36);
      totalSum += digitSum;
    }
    const remainder = totalSum % 36;
    const checkVal = (36 - remainder) % 36;
    chars[14] = getValChar(checkVal);
  } catch (err) {
    // Fallback if error occurs
  }

  const finalGstin = chars.join('');

  // Validate standard GSTIN pattern: 2 digits + 5 letters + 4 digits + 1 letter + 1 alphanumeric + Z + 1 alphanumeric
  const pattern = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[0-9A-Z]{1}Z[0-9A-Z]{1}$/;
  if (pattern.test(finalGstin)) {
    return finalGstin;
  }

  return ""; // Return empty string for invalid/un-repairable GSTIN
}

function findAllGSTINs(content) {
  if (!content) return [];
  const gstins = [];
  
  // 1. Direct Regex Match (standard patterns)
  const directPattern = /\b[0-9]{2}[A-Za-z]{5}[0-9]{4}[A-Za-z]{1}[A-Za-z0-9]{1}[Zz]{1}[A-Za-z0-9]{1}\b/g;
  const matches = content.match(directPattern) || [];
  for (const m of matches) {
    const cleaned = cleanGSTIN(m);
    if (cleaned && !gstins.includes(cleaned)) {
      gstins.push(cleaned);
    }
  }

  // 2. Keyword-based proximity search (handles spaces and minor OCR bugs)
  const cleanAndAdd = (str) => {
    const potential = str.replace(/[^A-Za-z0-9]/g, '').substring(0, 15);
    if (potential.length === 15) {
      const cleaned = cleanGSTIN(potential);
      if (cleaned && !gstins.includes(cleaned)) {
        gstins.push(cleaned);
      }
    }
  };

  const lines = content.split('\n');
  for (const line of lines) {
    if (/GST|GSTIN|TIN|TAX/i.test(line)) {
      const words = line.split(/[\s\:\-\,]+/);
      for (const w of words) {
        if (w.length >= 12 && w.length <= 18) {
          cleanAndAdd(w);
        }
      }
      const match = line.match(/(?:GSTIN|GST)\s*[:\-\s]*([A-Za-z0-9\s\-]+)/i);
      if (match) {
        cleanAndAdd(match[1]);
      }
    }
  }

  return gstins;
}

function classifyGstins(content, consignorName) {
  if (!content) return { consignorGstin: "", consigneeGstin: "" };
  const gstins = findAllGSTINs(content);
  if (gstins.length === 0) return { consignorGstin: "", consigneeGstin: "" };
  
  const normConsignor = String(consignorName || "").toLowerCase();
  
  let consignorGstin = "";
  let consigneeGstin = "";
  
  const gstinScores = gstins.map(gst => {
    let consignorScore = 0;
    let consigneeScore = 0;
    
    // Find all occurrences of this GSTIN in the content
    const gstinRegex = new RegExp(gst.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'gi');
    let match;
    while ((match = gstinRegex.exec(content)) !== null) {
      const idx = match.index;
      const start = Math.max(0, idx - 150);
      const end = Math.min(content.length, idx + match[0].length + 100);
      const context = content.substring(start, end).toLowerCase();
      
      // Keywords for Consignor
      if (/consignor|seller|vendor|supplier|from|dispatch|sender|billed\s+by/i.test(context)) {
        consignorScore += 3;
      }
      if (normConsignor && context.includes(normConsignor)) {
        consignorScore += 5;
      }
      if (/asian\s*paint|finolex|cri\s*pump|gem\s*paint/i.test(context)) {
        consignorScore += 4;
      }
      
      // Keywords for Consignee
      if (/consignee|buyer|customer|recipient|ship\s*to|bill\s*to|delivery|dispatch\s*to|to\b/i.test(context)) {
        consigneeScore += 3;
      }
    }
    
    return { gst, consignorScore, consigneeScore };
  });

  // Sort by scores
  const consignorMatches = [...gstinScores].sort((a, b) => b.consignorScore - a.consignorScore);
  const consigneeMatches = [...gstinScores].sort((a, b) => b.consigneeScore - a.consigneeScore);

  if (consignorMatches.length > 0 && consignorMatches[0].consignorScore > 0) {
    consignorGstin = consignorMatches[0].gst;
  }
  
  // Consignee GSTIN should be different from Consignor GSTIN if possible
  const remainingConsignee = consigneeMatches.filter(m => m.gst !== consignorGstin);
  if (remainingConsignee.length > 0 && remainingConsignee[0].consigneeScore > 0) {
    consigneeGstin = remainingConsignee[0].gst;
  } else {
    const fallback = gstins.filter(g => g !== consignorGstin);
    if (fallback.length > 0) {
      consigneeGstin = fallback[0];
    }
  }

  return { consignorGstin, consigneeGstin };
}

function getISTDateTime() {
  const optionsDate = { timeZone: 'Asia/Kolkata', day: '2-digit', month: '2-digit', year: 'numeric' };
  const optionsTime = { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true };
  
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-GB', optionsDate);
  const timeStr = now.toLocaleTimeString('en-US', optionsTime);
  
  return { date: dateStr, time: timeStr };
}

// Extract handwriting natively from Azure Document Analysis styles
function extractHandwrittenText(content, styles) {
  if (!content || !styles || !Array.isArray(styles)) return "";
  let textParts = [];
  for (const style of styles) {
    if (style.isHandwritten && style.spans) {
      for (const span of style.spans) {
        const start = span.offset;
        const end = span.offset + span.length;
        if (start >= 0 && end <= content.length) {
          const chunk = content.substring(start, end).trim();
          if (chunk) textParts.push(chunk);
        }
      }
    }
  }
  return textParts.join(" ");
}

// Detect if a signature exists on any page using Azure's signature detection
function detectSignature(pages) {
  if (!pages || !Array.isArray(pages)) return false;
  for (const page of pages) {
    if (page.signatures && Array.isArray(page.signatures) && page.signatures.length > 0) {
      const validSigs = page.signatures.filter(sig => sig.confidence > 0.4);
      if (validSigs.length > 0) return true;
    }
  }
  return false;
}

// Detect rubber stamp or seal presence based on stamp-like text patterns
function detectSeal(content) {
  if (!content) return "No";
  const cleaned = content.toLowerCase();
  const stampKeywords = ["received for", "subject to", "seal", "stamp", "signature of consignee", "consignee seal", "authorized sign"];
  for (const word of stampKeywords) {
    if (cleaned.includes(word)) {
      return "Yes";
    }
  }
  if (/\breceived\b/i.test(cleaned) && (/\bfor\b/i.test(cleaned) || /\bseal\b/i.test(cleaned))) {
    return "Yes";
  }
  return "No";
}

// Detect date in the document text or handwritten blocks
function detectDate(content, handwrittenText) {
  if (!content) return "No";
  const dateRegex = /\b\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}\b/;
  if (dateRegex.test(handwrittenText) || dateRegex.test(content)) {
    return "Yes";
  }
  return "No";
}

// Verify if the rubber stamp seal text matches the consignee's name
function isSealMatched(content, consignee) {
  if (!content || !consignee) return "No";
  const cleanedContent = content.toLowerCase();
  const firstWord = String(consignee).toLowerCase().split(" ")[0];
  if (firstWord && firstWord.length > 3) {
    if (cleanedContent.includes(firstWord) && /received/i.test(cleanedContent)) {
      return "Yes";
    }
  }
  return "No";
}

// Consignor-Specific designated area routing logic
function resolveDesignatedArea(consignor, place, area, address) {
  const normConsignor = String(consignor || "").toUpperCase();
  const normPlace = String(place || "").toUpperCase();
  const normArea = String(area || "").toUpperCase();
  const normAddress = String(address || "").toUpperCase();

  // 1. ASIAN PAINTS DEPOT CODE MAPPING
  if (normConsignor.includes("ASIAN PAINTS")) {
    const depotMatch = normAddress.match(/\b(14\d{2}|4\d{3})\b/) || normPlace.match(/\b(14\d{2}|4\d{3})\b/);
    if (depotMatch) {
      return `Depot ${depotMatch[0]}`;
    }
  }

  // 2. FINOLEX CABLES MAPPING
  if (normConsignor.includes("FINOLEX")) {
    if (normPlace.includes("COCHIN") || normPlace.includes("ERNAKULAM") || normPlace.includes("ALUVA")) {
      return "Ernakulam Area";
    }
    if (normPlace.includes("CALICUT") || normPlace.includes("KOZHIKODE")) {
      return "Calicut Area";
    }
    if (normPlace.includes("TRIVANDRUM") || normPlace.includes("THIRUVANANTHAPURAM")) {
      return "Trivandrum Area";
    }
  }

  // 3. CRI PUMPS MAPPING (Consignee Based)
  if (normConsignor.includes("CRI PUMP") || normConsignor.includes("GEM PAINT")) {
    return normPlace || normArea || "Consignee Specific";
  }

  return area || place || "Kerala";
}

// Self-healing database insert helper with dynamic column fallback
async function safeInsert(table, row) {
  if (!supabase) return { error: "Supabase not configured" };
  
  console.log(`Attempting safe insert into '${table}'...`);
  const { error } = await supabase.from(table).insert([row]);
  if (!error) return { status: "success" };
  
  console.error(`Insert into '${table}' failed:`, error.message);
  
  // If missing column error, serialize fields to remarks and delete them from row
  if (error.message && (error.message.includes("column") || error.message.includes("does not exist"))) {
    console.log("Missing database columns detected! Falling back to serializing fields inside 'remarks' column...");
    
    const fallbackRow = { ...row };
    const extraDetails = [];
    if (row.invoice_value_total) extraDetails.push(`Invoice Value: ₹${row.invoice_value_total}`);
    if (row.invoice_item_total_count) extraDetails.push(`Item Qty: ${row.invoice_item_total_count}`);
    if (row.item_wise_count) extraDetails.push(`Items: ${row.item_wise_count}`);
    
    if (extraDetails.length > 0) {
      fallbackRow.remarks = `[AUTO-EXTRACTED]\n${extraDetails.join("\n")}\n\n${row.remarks || ""}`.trim();
    }
    
    // Safely remove the columns that don't exist in Supabase yet
    delete fallbackRow.invoice_value_total;
    delete fallbackRow.invoice_item_total_count;
    delete fallbackRow.item_wise_count;
    
    console.log(`Re-attempting insert into '${table}' without new columns...`);
    const { error: fallbackError } = await supabase.from(table).insert([fallbackRow]);
    if (!fallbackError) {
      return { status: "success", fallback_active: true };
    }
    return { error: fallbackError.message };
  }
  
  return { error: error.message };
}

// Shared Document Processing Flow (Supports dynamic and forced POD routing via Azure AI)
async function processDoc(req, res, isPodForce) {
  try {
    let fileBuffer;
    let originalName = 'document.pdf';
    let mimeType = 'application/pdf';

    if (req.headers['content-type']?.toLowerCase().includes('application/octet-stream') || req.headers['x-file-name']) {
      console.log("Received raw octet-stream payload...");
      console.log("Request Headers:", JSON.stringify(req.headers));
      fileBuffer = await getFileBuffer(req);
      console.log("Resolved fileBuffer length:", fileBuffer ? fileBuffer.length : 0);
      originalName = req.headers['x-file-name'] || 'document.pdf';
      mimeType = req.headers['x-file-type'] || 'application/pdf';
    } else {
      // Use multer upload middleware dynamically
      await new Promise((resolve, reject) => {
        upload.single('invoice')(req, res, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      if (!req.file) {
        return res.status(400).json({ 
          error: 'No image uploaded',
          debug: {
            headers: req.headers,
            method: req.method,
            contentType: req.headers['content-type'],
            xFileName: req.headers['x-file-name']
          }
        });
      }
      fileBuffer = req.file.buffer;
      originalName = req.file.originalname;
      mimeType = req.file.mimetype;
    }

    if (!fileBuffer || fileBuffer.length === 0) {
      return res.status(400).json({ 
        error: 'Empty file payload',
        debug: {
          headers: req.headers,
          method: req.method,
          hasBody: !!req.body,
          bodyType: typeof req.body,
          isBuffer: req.body ? Buffer.isBuffer(req.body) : false,
          bodyLength: req.body ? (Buffer.isBuffer(req.body) ? req.body.length : String(req.body).length) : 0,
          bodyPreview: req.body ? (Buffer.isBuffer(req.body) ? req.body.toString('utf-8').substring(0, 100) : String(req.body).substring(0, 100)) : ""
        }
      });
    }

    console.log(`Processing file: ${originalName} (${fileBuffer.length} bytes) via Azure...`);
    if (endpoint === "<AZURE_ENDPOINT>") {
      return res.status(500).json({ error: 'Azure credentials not configured' });
    }

    const client = new DocumentAnalysisClient(endpoint, new AzureKeyCredential(apiKey));
    const poller = await client.beginAnalyzeDocument(modelId, fileBuffer);
    const analysisResult = await poller.pollUntilDone();
    const { documents, pages, styles, content } = analysisResult;

    if (!documents || documents.length === 0) {
      return res.status(404).json({ error: 'No data found in document' });
    }

    const invoice = documents[0].fields;
    
    // Safely get field values
    const getVal = (key) => {
      if (invoice && invoice[key]) {
        return invoice[key].content || invoice[key].value || "";
      }
      return "";
    };

        const invoiceNo = getVal("InvoiceId");
    const date = getVal("InvoiceDate");
    const consignor = getVal("VendorName");
    const consignorType = req.body.consignor_type || req.query.consignor_type || 'GENERAL';

    let resolvedConsignorName = consignor ? String(consignor) : "";
    if (consignorType === 'ACMATEX') resolvedConsignorName = "ACMATEX COATING PVT LTD";
    else if (consignorType === 'ALLIED_COATING') resolvedConsignorName = "ALLIED COATING INDUSTRIES";
    else if (consignorType === 'AMPLE_TRADE') resolvedConsignorName = "AMPLE TRADE INCORPORATES KANNUR";
    else if (consignorType === 'ASIAN_PAINTS') resolvedConsignorName = "ASIAN PAINTS LTD";
    else if (consignorType === 'BIRLA_OPUS') resolvedConsignorName = "BIRLA OPUS";
    else if (consignorType === 'CERA') resolvedConsignorName = "CERA SANITARYWARE LTD";
    else if (consignorType === 'CRI_PUMPS') resolvedConsignorName = "CRI PUMPS PVT LTD";
    else if (consignorType === 'DURAMETAL') resolvedConsignorName = "DURAMETAL SYSTEMS PVT LTD";
    else if (consignorType === 'FINOLEX') resolvedConsignorName = "FINOLEX CABLES LTD";
    else if (consignorType === 'FORTUNE') resolvedConsignorName = "FORTUNE BUSINESS CORP";
    else if (consignorType === 'ASTRAL_PAINTS') resolvedConsignorName = "Astral / Gem Paints";
    else if (consignorType === 'HEME_DIAMED') resolvedConsignorName = "HEME DIAMED LLP";
    else if (consignorType === 'IDEMITSU') resolvedConsignorName = "IDEMITSU LUBE INDIA PVT LTD";
    else if (consignorType === 'IRA_CHEM') resolvedConsignorName = "IRA CHEM";
    else if (consignorType === 'ISOCHEM') resolvedConsignorName = "ISOCHEM LABORATORY";
    else if (consignorType === 'JJ_CHEMICALS') resolvedConsignorName = "J J CHEMICALS";
    else if (consignorType === 'KEI') resolvedConsignorName = "KEI INDUSTRIES LIMITED";
    else if (consignorType === 'LUMINOUS') resolvedConsignorName = "LUMINOUS POWER";
    else if (consignorType === 'MICOLUBE') resolvedConsignorName = "MICOLUBE INDIA LTD";
    else if (consignorType === 'MIRAS') resolvedConsignorName = "MIRAS TRADERS";
    else if (consignorType === 'NICE_CHEMICALS') resolvedConsignorName = "NICE CHEMICALS (P) LTD";
    else if (consignorType === 'PIDILITE') resolvedConsignorName = "PIDILITE INDUSTRIES LTD";
    else if (consignorType === 'SAYEGH') resolvedConsignorName = "SAYEGH PAINT FACTORIES INDIA PVT LTD";
    else if (consignorType === 'SEEKEN') resolvedConsignorName = "SEEKEN ELECTRONICS INDIA PVT LTD";
    else if (consignorType === 'SMILE_COAT') resolvedConsignorName = "SMILE COAT";
    else if (consignorType === 'SPECTRUM') resolvedConsignorName = "SPECTRUM REAGENTS AND CHEMICALS PVT LTD";
    else if (consignorType === 'SPEED_AWAY') resolvedConsignorName = "SPEED A WAY PRIVATE LTD";
    else if (consignorType === 'TORMAC') resolvedConsignorName = "TORMAC PUMPS";
    else if (consignorType === 'TRACO_CABLE') resolvedConsignorName = "TRACO CABLE COMPANY LTD";
    else if (consignorType === 'UNIVERSAL') resolvedConsignorName = "UNIVERSAL CORPORATION LIMITED";

    // Call smart GSTIN classifier
    const classification = classifyGstins(content, resolvedConsignorName);
    console.log("Smart GSTIN Classification result:", classification);

    // Differentiate consignor and consignee
    let consignorGstin = cleanGSTIN(getVal("VendorTaxId"));
    if (!consignorGstin) {
      consignorGstin = classification.consignorGstin;
    }

    const consignee = getVal("CustomerName") || getVal("ShippingAddressRecipient");
    
    // Extract Billing GSTIN
    let billingGstin = cleanGSTIN(getVal("CustomerTaxId"));
    if (!billingGstin && classification.consigneeGstin) {
      billingGstin = classification.consigneeGstin;
    }

    // Extract Shipping GSTIN if present
    let shippingGstin = "";
    let shippingAddressBlock = "";
    if (content) {
      const lowerContent = content.toLowerCase();
      const shipKeywords = ["ship to", "consignee address", "delivery to", "consignee:", "ship-to", "dispatch to"];
      let bestStartIndex = -1;
      for (const kw of shipKeywords) {
        const idx = lowerContent.indexOf(kw);
        if (idx !== -1 && (bestStartIndex === -1 || idx < bestStartIndex)) {
          bestStartIndex = idx + kw.length;
        }
      }
      if (bestStartIndex !== -1) {
        shippingAddressBlock = content.substring(bestStartIndex, bestStartIndex + 400);
      }
    }

    if (shippingAddressBlock) {
      const gstinsInShipping = findAllGSTINs(shippingAddressBlock);
      const validShippingGstins = gstinsInShipping.filter(g => g !== consignorGstin);
      if (validShippingGstins.length > 0) {
        shippingGstin = validShippingGstins[0];
      }
    }

    // Determine if Billing and Shipping addresses are the same or if one has no GSTIN
    const isSameAddress = () => {
      const billingAddrStr = String(invoice.CustomerAddress?.content || "").toLowerCase().replace(/[^a-z0-9]/g, '');
      const shippingAddrStr = String(invoice.ShippingAddress?.content || "").toLowerCase().replace(/[^a-z0-9]/g, '');
      
      const billingName = String(getVal("CustomerName")).toLowerCase().trim();
      const shippingName = String(getVal("ShippingAddressRecipient")).toLowerCase().trim();
      
      if (billingAddrStr && shippingAddrStr) {
        if (billingAddrStr.includes(shippingAddrStr) || shippingAddrStr.includes(billingAddrStr)) {
          return true;
        }
        const commonWords = billingAddrStr.split('').filter(char => shippingAddrStr.includes(char)).length;
        const similarity = commonWords / Math.max(billingAddrStr.length, shippingAddrStr.length);
        if (similarity > 0.8) return true;
      }
      
      if (billingName && shippingName && billingName === shippingName) {
        return true;
      }
      
      if (consignee && (getVal("CustomerName") === getVal("ShippingAddressRecipient"))) {
        return true;
      }
      
      return false;
    };

    let consigneeGstin = shippingGstin;
    if (!consigneeGstin) {
      if (isSameAddress() || !shippingGstin) {
        // Fallback to Recipient Address (Billing Address) GSTIN
        consigneeGstin = billingGstin;
      }
    }

    // If still empty, search the whole document for any other GSTIN that is not the vendor's
    if (!consigneeGstin && content) {
      const allGstins = findAllGSTINs(content);
      const remainingGstins = allGstins.filter(g => g !== consignorGstin);
      if (remainingGstins.length > 0) {
        consigneeGstin = remainingGstins[0];
      }
    }

    // Hard Differentiator Check: Consignee GSTIN must NEVER be identical to Consignor GSTIN
    if (consigneeGstin && consigneeGstin === consignorGstin) {
      console.log("Consignee GSTIN matched Consignor GSTIN! Differentiating...");
      const allGstins = content ? findAllGSTINs(content) : [];
      const distinctGstins = allGstins.filter(g => g !== consignorGstin);
      if (distinctGstins.length > 0) {
        consigneeGstin = distinctGstins[0];
      } else {
        consigneeGstin = ""; // Clear to prevent incorrect mapping if no other GSTIN is present
      }
    }
    
    // Address components fallback
    const place = invoice.ShippingAddress?.properties?.city?.content || 
                  invoice.CustomerAddress?.properties?.city?.content || 
                  getVal("PLACE");
    const areaRaw = invoice.ShippingAddress?.properties?.streetAddress?.content || 
                    invoice.CustomerAddress?.properties?.streetAddress?.content || 
                    getVal("AREA");
    const address = invoice.CustomerAddress?.content || invoice.ShippingAddress?.content || getVal("ADDRESS");
    
    // 1. PIN Code extraction with direct OCR text fallback
    let pinCode = invoice.ShippingAddress?.properties?.postalCode?.content || 
                  invoice.CustomerAddress?.properties?.postalCode?.content || 
                  getVal("PIN CODE") || getVal("PIN_CODE");
    if (!pinCode && content) {
      const pinMatch = content.match(/\b([1-9]\d{5})\b/);
      if (pinMatch) {
        pinCode = pinMatch[1];
      }
    }

    // 2. State extraction with direct OCR text fallback
    let state = invoice.ShippingAddress?.properties?.state?.content || 
                invoice.CustomerAddress?.properties?.state?.content || 
                getVal("STATE");
    if (!state && content) {
      const upperContent = content.toUpperCase();
      if (upperContent.includes("KERALA")) {
        state = "Kerala";
      } else if (upperContent.includes("TAMIL NADU") || upperContent.includes("TAMILNADU")) {
        state = "Tamil Nadu";
      } else if (upperContent.includes("KARNATAKA")) {
        state = "Karnataka";
      }
    }

    // 3. District extraction by scanning ONLY the extracted Consignee's Address/Place components
    let district = getVal("DISTRICT");
    if (!district) {
      const searchStr = `${String(address || "").toUpperCase()} ${String(place || "").toUpperCase()} ${String(areaRaw || "").toUpperCase()}`;
      const keralaDistricts = [
        "ERNAKULAM", "KOZHIKODE", "THRISSUR", "ALAPPUZHA", "KOLLAM", "KOTTAYAM", 
        "PALAKKAD", "KANNUR", "KASARAGOD", "WAYANAD", "PATHANAMTHITTA", "IDUKKI", 
        "MALAPPURAM", "THIRUVANANTHAPURAM"
      ];
      for (const d of keralaDistricts) {
        if (searchStr.includes(d)) {
          district = d.charAt(0) + d.slice(1).toLowerCase();
          break;
        }
      }
      if (!district && (searchStr.includes("COCHIN") || searchStr.includes("KOCHI") || searchStr.includes("ALUVA"))) {
        district = "Ernakulam";
      } else if (!district && searchStr.includes("CALICUT")) {
        district = "Kozhikode";
      } else if (!district && searchStr.includes("TRIVANDRUM")) {
        district = "Thiruvananthapuram";
      }
    }
    if (!district && place) {
      const pUpper = String(place).toUpperCase();
      if (pUpper.includes("COCHIN") || pUpper.includes("KOCHI") || pUpper.includes("ALUVA") || pUpper.includes("ERNAKULAM")) {
        district = "Ernakulam";
      } else if (pUpper.includes("CALICUT") || pUpper.includes("KOZHIKODE")) {
        district = "Kozhikode";
      } else if (pUpper.includes("TRIVANDRUM") || pUpper.includes("THIRUVANANTHAPURAM")) {
        district = "Thiruvananthapuram";
      }
    }

    // 4. Phone number extraction with direct 10-digit OCR text fallback
    let phoneNumber = getVal("PHONE NUMBER") || getVal("PHONE_NUMBER");
    if (!phoneNumber && content) {
      const phoneMatch = content.match(/\b([6-9]\d{9})\b/);
      if (phoneMatch) {
        phoneNumber = phoneMatch[1];
      }
    }

    // 5. LR Number extraction with regex scanning of OCR text
    let lrNumber = getVal("Lr Number") || getVal("LrNumber");
    if (!lrNumber && content) {
      const lrMatch = content.match(/L[R\.]\s*(?:No|Num|Number|[\.\-\_])?\s*[:\-\s]*([A-Z0-9\/\\_\-]+)/i);
      if (lrMatch) {
        lrNumber = lrMatch[1].trim();
      }
    }

    const consigneeCode = getVal("Consignee Code") || getVal("ConsigneeCode");

    // Extract Items and total values
    let itemWiseCounts = [];
    let totalItemQuantity = 0;

    if (invoice.Items && Array.isArray(invoice.Items.value)) {
      for (const item of invoice.Items.value) {
        if (item.properties) {
          const props = item.properties;
          const desc = props.Description?.value || props.Description?.content || 
                       props.ProductCode?.value || props.ProductCode?.content || "Unknown Item";
          
          let qty = 0;
          if (props.Quantity) {
            const qtyVal = props.Quantity.value;
            qty = typeof qtyVal === 'number' ? qtyVal : parseFloat(qtyVal || props.Quantity.content || "0") || 0;
          }
          
          totalItemQuantity += qty;
          itemWiseCounts.push(`${desc.trim()} = ${qty}`);
        }
      }
    }

    let invoiceValueTotal = "";
    if (invoice.InvoiceTotal) {
      const val = invoice.InvoiceTotal.value;
      if (val && typeof val === 'object' && 'amount' in val) {
        invoiceValueTotal = String(val.amount);
      } else {
        invoiceValueTotal = String(invoice.InvoiceTotal.value || invoice.InvoiceTotal.content || "");
      }
    }
    if (!invoiceValueTotal && content) {
      const totalMatch = content.match(/(?:grand\s*)?total(?:\s*amount)?\s*(?:rs\.?|inr)?\s*[:\-\s]*([0-9,]+\.[0-9]{2})/i) ||
                         content.match(/(?:grand\s*)?total(?:\s*amount)?\s*(?:rs\.?|inr)?\s*[:\-\s]*([0-9,]+)/i);
      if (totalMatch) {
        invoiceValueTotal = totalMatch[1].replace(/,/g, '');
      }
    }

    // consignorType is already defined on line 544

    // Consignor-specific formatting and parsing overrides
    let finalConsignor = consignor ? String(consignor) : "";
    let finalInvoiceNo = invoiceNo ? String(invoiceNo) : "";
    let finalPlace = place ? String(place) : "";
    
    if (consignorType === 'ACMATEX') {
      finalConsignor = "ACMATEX COATING PVT LTD";
    } else if (consignorType === 'ALLIED_COATING') {
      finalConsignor = "ALLIED COATING INDUSTRIES";
    } else if (consignorType === 'AMPLE_TRADE') {
      finalConsignor = "AMPLE TRADE INCORPORATES KANNUR";
    } else if (consignorType === 'ASIAN_PAINTS') {
      finalConsignor = "ASIAN PAINTS LTD";
      if (content && (!finalInvoiceNo || !/^\d{10}$/.test(finalInvoiceNo))) {
        const apMatch = content.match(/\b([129]\d{9})\b/);
        if (apMatch) finalInvoiceNo = apMatch[1];
      }
      if (content && !finalPlace) {
        const depotMatch = content.match(/Depot\s*[:\-\s]*(\d{4})/i);
        if (depotMatch) {
          finalPlace = `Depot ${depotMatch[1]}`;
        }
      }
    } else if (consignorType === 'BIRLA_OPUS') {
      finalConsignor = "BIRLA OPUS";
    } else if (consignorType === 'CERA') {
      finalConsignor = "CERA SANITARYWARE LTD";
    } else if (consignorType === 'CRI_PUMPS') {
      finalConsignor = "CRI PUMPS PVT LTD";
    } else if (consignorType === 'DURAMETAL') {
      finalConsignor = "DURAMETAL SYSTEMS PVT LTD";
    } else if (consignorType === 'FINOLEX') {
      finalConsignor = "FINOLEX CABLES LTD";
      if (content && !finalInvoiceNo) {
        const finolexMatch = content.match(/Inv(?:oice)?\s*No\.?\s*[:\-\s]*([A-Z0-9\/]+)/i);
        if (finolexMatch) finalInvoiceNo = finolexMatch[1].trim();
      }
    } else if (consignorType === 'FORTUNE') {
      finalConsignor = "FORTUNE BUSINESS CORP";
    } else if (consignorType === 'ASTRAL_PAINTS') {
      finalConsignor = "Astral / Gem Paints";
    } else if (consignorType === 'HEME_DIAMED') {
      finalConsignor = "HEME DIAMED LLP";
    } else if (consignorType === 'IDEMITSU') {
      finalConsignor = "IDEMITSU LUBE INDIA PVT LTD";
    } else if (consignorType === 'IRA_CHEM') {
      finalConsignor = "IRA CHEM";
    } else if (consignorType === 'ISOCHEM') {
      finalConsignor = "ISOCHEM LABORATORY";
    } else if (consignorType === 'JJ_CHEMICALS') {
      finalConsignor = "J J CHEMICALS";
    } else if (consignorType === 'KEI') {
      finalConsignor = "KEI INDUSTRIES LIMITED";
    } else if (consignorType === 'LUMINOUS') {
      finalConsignor = "LUMINOUS POWER";
    } else if (consignorType === 'MICOLUBE') {
      finalConsignor = "MICOLUBE INDIA LTD";
    } else if (consignorType === 'MIRAS') {
      finalConsignor = "MIRAS TRADERS";
    } else if (consignorType === 'NICE_CHEMICALS') {
      finalConsignor = "NICE CHEMICALS (P) LTD";
    } else if (consignorType === 'PIDILITE') {
      finalConsignor = "PIDILITE INDUSTRIES LTD";
    } else if (consignorType === 'SAYEGH') {
      finalConsignor = "SAYEGH PAINT FACTORIES INDIA PVT LTD";
    } else if (consignorType === 'SEEKEN') {
      finalConsignor = "SEEKEN ELECTRONICS INDIA PVT LTD";
    } else if (consignorType === 'SMILE_COAT') {
      finalConsignor = "SMILE COAT";
    } else if (consignorType === 'SPECTRUM') {
      finalConsignor = "SPECTRUM REAGENTS AND CHEMICALS PVT LTD";
    } else if (consignorType === 'SPEED_AWAY') {
      finalConsignor = "SPEED A WAY PRIVATE LTD";
    } else if (consignorType === 'TORMAC') {
      finalConsignor = "TORMAC PUMPS";
    } else if (consignorType === 'TRACO_CABLE') {
      finalConsignor = "TRACO CABLE COMPANY LTD";
    } else if (consignorType === 'UNIVERSAL') {
      finalConsignor = "UNIVERSAL CORPORATION LIMITED";
    }

    // Native Azure Handwriting & Signature parsing
    const handwrittenRemarks = extractHandwrittenText(content, styles);
    const hasSignature = detectSignature(pages);
    const hasSeal = detectSeal(content);

    const isFromOneDrive = !!(req.headers['x-file-name'] || req.headers['content-type']?.toLowerCase().includes('application/octet-stream'));

    // Determine if this is a POD or an Invoice:
    // 1. Explicitly requested via query ?type=pod or forced in backend route (isPodForce)
    // 2. For OneDrive sync, we auto-detect POD based on signature or handwriting remarks
    let isPod = isPodForce || req.query.type === 'pod';
    if (!isPod && isFromOneDrive) {
      isPod = hasSignature || (handwrittenRemarks.length > 5);
    }

    const finalArea = resolveDesignatedArea(finalConsignor || consignor, finalPlace || place, areaRaw, address);

    // Prepare database row
    const { date: uploadedDate, time: uploadedTime } = getISTDateTime();
    
    const dbRow = {
      date: date ? String(date) : "",
      invoice_no: finalInvoiceNo || (invoiceNo ? String(invoiceNo) : ""),
      lr_number: lrNumber ? String(lrNumber) : "",
      uploaded_date: uploadedDate,
      uploaded_time: uploadedTime,
      uploaded_doc: originalName,
      consignor: finalConsignor || (consignor ? String(consignor) : ""),
      consignor_gstin: consignorGstin,
      ship_to_party_consignee: consignee ? String(consignee) : "",
      consignee_code: consigneeCode ? String(consigneeCode) : "",
      ship_to_party_consignee_gstin: consigneeGstin,
      place: finalPlace || (place ? String(place) : ""),
      area: finalArea,
      district: district ? String(district) : "",
      state: state ? String(state) : "",
      pin_code: pinCode ? String(pinCode) : "",
      phone_number: phoneNumber ? String(phoneNumber) : "",
      address: address ? String(address) : "",
      remarks: handwrittenRemarks || getVal("Remarks") || "",
      remarks_from_consignee: handwrittenRemarks ? "Consignee" : (getVal("Remarks from Consignee") || getVal("RemarksFromConsignee") || ""),
      seal_ok: isPod ? hasSeal : "",
      sign_ok: isPod ? (hasSignature ? "Yes" : "No") : "",
      date_ok: isPod ? detectDate(content, handwrittenRemarks) : "",
      consignee_seal_matched: isPod ? isSealMatched(content, consignee) : "",
      invoice_value_total: invoiceValueTotal,
      invoice_item_total_count: String(totalItemQuantity || ""),
      item_wise_count: itemWiseCounts.join(", ")
    };

    if (isPod) {
      console.log("Saving POD to 'pod_register' table...");
      const insertRes = await safeInsert("pod_register", dbRow);
      if (insertRes.error) {
        console.error("pod_register insert error:", insertRes.error);
        console.log("Falling back: Saving POD to 'all_invoices' with clear prefix...");
        
        const fallbackRow = {
          ...dbRow,
          invoice_no: dbRow.invoice_no ? `POD-${dbRow.invoice_no}` : `POD-${dbRow.lr_number || 'UNKNOWN'}`,
          uploaded_doc: `POD: ${dbRow.uploaded_doc || 'document.pdf'}`
        };
        
        const fallbackRes = await safeInsert("all_invoices", fallbackRow);
        if (fallbackRes.error) {
          console.error("Supabase fallback insert all_invoices error:", fallbackRes.error);
          return res.status(500).json({
            error: "Failed to save POD data to database",
            details: fallbackRes.error
          });
        }
        
        return res.json({
          status: "success",
          message: "Successfully processed POD (saved to all_invoices under POD prefix as fallback).",
          extracted_data: fallbackRow
        });
      }
      
      return res.json({
        status: "success",
        message: "Successfully processed and saved to pod_register.",
        extracted_data: dbRow
      });
    } else {
      // Reuse outer isFromOneDrive variable
      
      if (isFromOneDrive) {
        console.log("Saving Invoice from OneDrive/Teams to 'all_invoices' table...");
        const insertRes = await safeInsert("all_invoices", dbRow);
        if (insertRes.error) console.error("Supabase insert all_invoices error:", insertRes.error);
        
        // Strict Master appending logic for OneDrive files
        const consigneeGstin = dbRow.ship_to_party_consignee_gstin;
        const consigneeName = dbRow.ship_to_party_consignee;
        if (consigneeGstin && !insertRes.error) {
          let isDup = false;
          if (supabase) {
            const { data: resGstin } = await supabase.from("consignee_master").select("id").eq("ship_to_party_consignee_gstin", consigneeGstin);
            if (resGstin && resGstin.length > 0) isDup = true;
            
            if (!isDup && consigneeName) {
              const { data: resName } = await supabase.from("consignee_master").select("id").eq("ship_to_party_consignee", consigneeName);
              if (resName && resName.length > 0) isDup = true;
            }
            
            if (!isDup) {
              const masterRow = {
                consignor: dbRow.consignor,
                consignor_gstin: dbRow.consignor_gstin,
                ship_to_party_consignee: consigneeName,
                consignee_code: dbRow.consignee_code,
                ship_to_party_consignee_gstin: consigneeGstin,
                place: dbRow.place,
                area: dbRow.area,
                district: dbRow.district,
                state: dbRow.state,
                pin_code: dbRow.pin_code,
                phone_number: dbRow.phone_number,
                address: dbRow.address
              };
              const { error: masterError } = await supabase.from("consignee_master").insert([masterRow]);
              if (masterError) console.error("Supabase insert consignee_master error:", masterError.message || masterError);
              else console.log("Successfully added new consignee to consignee_master.");
            }
          }
        }
        
        return res.json({
          status: "success",
          message: "Successfully processed OneDrive invoice and saved to all_invoices & master.",
          extracted_data: dbRow
        });
      } else {
        console.log("Saving Invoice from Live Mobile scan to 'live_scanned_invoices' table...");
        const insertRes = await safeInsert("live_scanned_invoices", dbRow);
        if (insertRes.error) console.error("Supabase insert error:", insertRes.error);

        return res.json({
          status: "success",
          message: "Successfully processed live scanned invoice and saved.",
          extracted_data: dbRow
        });
      }
    }
  } catch (error) {
    console.error('Error extracting data:', error);
    res.status(500).json({ error: error.message || 'Failed to extract data' });
  }
}

// --- PHASE 1: LR CREATION (OFFICE STAFF) ---
app.post('/api/extract-invoice', async (req, res) => {
  await processDoc(req, res, false);
});

// --- PHASE 2: POD SCANNING (DRIVER) ---
// Completely replaces OpenAI Vision with cost-free Azure Document Intelligence
app.post('/api/extract-pod', async (req, res) => {
  await processDoc(req, res, true);
});

// --- TEMPORARY MIGRATION ENDPOINT (IPv6 Compatible from Vercel Serverless Function) ---
app.get('/api/migrate', async (req, res) => {
  const projectRef = "ktxhjnhghgzcyokbcsoe";
  const database = "postgres";
  const user = `postgres.${projectRef}`;
  
  const regions = [
    'ap-south-1',      // Mumbai (User location)
    'ap-southeast-1',  // Singapore
    'ap-southeast-2',  // Sydney
    'ap-northeast-1',  // Tokyo
    'us-east-1',       // N. Virginia
    'us-east-2',       // Ohio
    'us-west-1',       // N. California
    'us-west-2',       // Oregon
    'eu-west-1',       // Ireland
    'eu-central-1',    // Frankfurt
    'eu-west-2',       // London
    'sa-east-1'        // Sao Paulo
  ];

  const passwords = [
    "efflogistics2024",
    "hrrecruit2024",
    "efflogistics",
    "erpnxt",
    "erpnxtffe",
    "anwar123",
    "anwar2024",
    "Anwar@123",
    process.env.SUPABASE_KEY
  ].filter(Boolean);

  let errors = [];
  
  for (const region of regions) {
    const host = `aws-0-${region}.pooler.supabase.com`;
    for (const password of passwords) {
      for (const port of [6543, 5432]) {
        console.log(`Auto-Migrating: trying ${host}:${port} with password prefix ${password.substring(0, 3)}...`);
        const client = new Client({
          host,
          port,
          user,
          password,
          database,
          ssl: { rejectUnauthorized: false },
          connectionTimeoutMillis: 2500 // 2.5s timeout to speed up checks
        });

        try {
          await client.connect();
          console.log(`SUCCESS! Connected to ${host}:${port}`);
          
          const createTableSql = `
            CREATE TABLE IF NOT EXISTS public.pod_register (
              id BIGSERIAL PRIMARY KEY,
              created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
              date TEXT,
              invoice_no TEXT,
              lr_number TEXT,
              uploaded_date TEXT,
              uploaded_time TEXT,
              uploaded_doc TEXT,
              consignor TEXT,
              consignor_gstin TEXT,
              ship_to_party_consignee TEXT,
              consignee_code TEXT,
              ship_to_party_consignee_gstin TEXT,
              place TEXT,
              area TEXT,
              district TEXT,
              state TEXT,
              pin_code TEXT,
              phone_number TEXT,
              address TEXT,
              remarks TEXT,
              remarks_from_consignee TEXT,
              seal_ok TEXT,
              sign_ok TEXT,
              date_ok TEXT,
              consignee_seal_matched TEXT
            );
          `;
          await client.query(createTableSql);

          const createSupervisorTableSql = `
            CREATE TABLE IF NOT EXISTS public.supervisor_branch_mapping (
              id BIGSERIAL PRIMARY KEY,
              created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
              supervisor_name TEXT UNIQUE NOT NULL,
              branch TEXT NOT NULL
            );
          `;
          await client.query(createSupervisorTableSql);

          const createHolidaysTableSql = `
            CREATE TABLE IF NOT EXISTS public.holidays (
              id BIGSERIAL PRIMARY KEY,
              created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
              date DATE UNIQUE NOT NULL,
              description TEXT
            );
          `;
          await client.query(createHolidaysTableSql);

          const alterTableSql = `
            ALTER TABLE public.pod_register ADD COLUMN IF NOT EXISTS invoice_value_total TEXT;
            ALTER TABLE public.pod_register ADD COLUMN IF NOT EXISTS invoice_item_total_count TEXT;
            ALTER TABLE public.pod_register ADD COLUMN IF NOT EXISTS item_wise_count TEXT;

            ALTER TABLE public.live_scanned_invoices ADD COLUMN IF NOT EXISTS invoice_value_total TEXT;
            ALTER TABLE public.live_scanned_invoices ADD COLUMN IF NOT EXISTS invoice_item_total_count TEXT;
            ALTER TABLE public.live_scanned_invoices ADD COLUMN IF NOT EXISTS item_wise_count TEXT;

            ALTER TABLE public.all_invoices ADD COLUMN IF NOT EXISTS invoice_value_total TEXT;
            ALTER TABLE public.all_invoices ADD COLUMN IF NOT EXISTS invoice_item_total_count TEXT;
            ALTER TABLE public.all_invoices ADD COLUMN IF NOT EXISTS item_wise_count TEXT;
          `;
          await client.query(alterTableSql);
          await client.end();
          
          return res.json({
            status: "success",
            message: `Migration completed successfully on region ${region} via port ${port}!`
          });
        } catch (err) {
          console.error(`Failed ${host}:${port}: ${err.message}`);
          errors.push(`${host}:${port} (${password.substring(0, 3)}): ${err.message}`);
          try { await client.end(); } catch (e) {}
        }
      }
    }
  }

  return res.status(500).json({
    error: "All connection attempts and password fallbacks failed",
    details: errors.slice(-15) // return last 15 errors for complete debug context
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// BOX VOLUME SCANNER — Gemini Vision AI endpoint
// Accepts: 1 diagonal photo with 30cm scale on top of box
// Returns: length_cm, width_cm, height_cm, volumetric_weight_kg, confidence
// Cost: FREE (Gemini 2.0 Flash free tier — 1500 req/day)
// ─────────────────────────────────────────────────────────────────────────────
app.post('/api/measure-volume', async (req, res) => {
  try {
    // Parse uploaded photo
    await new Promise((resolve, reject) => {
      upload.single('box_photo')(req, res, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    if (!req.file) {
      return res.status(400).json({ error: 'No photo uploaded' });
    }

    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) {
      return res.status(500).json({ error: 'GEMINI_API_KEY not configured in environment variables' });
    }

    // Convert image buffer to base64
    const base64Image = req.file.buffer.toString('base64');
    const mimeType = req.file.mimetype || 'image/jpeg';

    // Gemini Vision prompt — highly specific for scale-referenced box measurement
    const prompt = `You are an expert at measuring physical objects from photos.

In this image, there is a cardboard box with a 30cm ruler/scale placed flat on TOP of the box.
The photo is taken from a diagonal/corner angle (approximately 45°) so that you can see:
- The TOP face of the box (with the 30cm scale)
- The FRONT face of the box (to measure width/depth)
- One SIDE face of the box (to measure height)

Your task:
1. Identify the 30cm scale in the image and use it as a pixel reference to determine the pixel-per-cm ratio.
2. Using this ratio, measure the box's:
   - Length (longest horizontal dimension of the top face)
   - Width (shorter horizontal dimension of the top face / front face)
   - Height (vertical dimension of the side face)

IMPORTANT RULES:
- All measurements must be in centimeters (cm), rounded to the nearest 0.5 cm
- Use the 30cm scale as your ONLY measurement reference
- If the scale is partially visible, extrapolate carefully
- Account for perspective distortion in your calculations

Respond ONLY with a valid JSON object in this exact format (no markdown, no explanation):
{
  "length_cm": <number>,
  "width_cm": <number>,
  "height_cm": <number>,
  "confidence": "<high|medium|low>"
}

If you cannot detect the scale or box clearly, set confidence to "low" and provide your best estimate.`;

    // Call Gemini Vision API (try gemini-2.5-flash first, fallback to gemini-2.5-flash-lite if it fails/hits quota)
    let geminiResponse;
    let modelUsed = 'gemini-2.5-flash';
    try {
      console.log('Attempting volume analysis with gemini-2.5-flash...');
      geminiResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [
                { text: prompt },
                {
                  inline_data: {
                    mime_type: mimeType,
                    data: base64Image
                  }
                }
              ]
            }],
            generationConfig: {
              temperature: 0.1,      // Low temp for consistent measurements
              maxOutputTokens: 4096,
              responseMimeType: "application/json",
            }
          })
        }
      );

      if (!geminiResponse.ok) {
        const errText = await geminiResponse.text();
        throw new Error(`Model gemini-2.5-flash failed with status ${geminiResponse.status}: ${errText}`);
      }
    } catch (primaryError) {
      console.warn('Gemini 2.5 Flash failed or hit rate limit:', primaryError.message);
      console.log('Falling back to gemini-2.5-flash-lite...');
      modelUsed = 'gemini-2.5-flash-lite';
      
      geminiResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${geminiApiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [
                { text: prompt },
                {
                  inline_data: {
                    mime_type: mimeType,
                    data: base64Image
                  }
                }
              ]
            }],
            generationConfig: {
              temperature: 0.1,      // Low temp for consistent measurements
              maxOutputTokens: 4096,
              responseMimeType: "application/json",
            }
          })
        }
      );

      if (!geminiResponse.ok) {
        const errText = await geminiResponse.text();
        console.error('Fallback Gemini 2.5 Flash Lite API error:', errText);
        return res.status(500).json({ error: 'Gemini AI service error: ' + errText });
      }
    }

    const geminiData = await geminiResponse.json();
    const rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    console.log('Gemini raw response:', rawText);

    // Parse JSON from Gemini response (strip any accidental markdown)
    let parsed;
    try {
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON in response');
      parsed = JSON.parse(jsonMatch[0]);
    } catch (parseErr) {
      console.error('JSON parse error:', parseErr.message);
      return res.status(500).json({
        error: 'AI response parsing failed. Try retaking the photo with better lighting.',
        raw: rawText
      });
    }

    // Validate parsed values
    const length_cm = parseFloat(parsed.length_cm) || 0;
    const width_cm  = parseFloat(parsed.width_cm)  || 0;
    const height_cm = parseFloat(parsed.height_cm) || 0;

    if (length_cm === 0 || width_cm === 0 || height_cm === 0) {
      return res.status(422).json({
        error: 'AI could not detect valid box dimensions. Ensure the 30cm scale is clearly visible and the photo shows all 3 sides of the box.',
        confidence: 'low'
      });
    }

    // Calculate volumetric weight (Indian logistics standard: divide by 5000)
    const volumetric_weight_kg = parseFloat(((length_cm * width_cm * height_cm) / 5000).toFixed(2));

    return res.json({
      length_cm,
      width_cm,
      height_cm,
      volumetric_weight_kg,
      confidence: parsed.confidence || 'medium',
      notes: parsed.notes || ''
    });

  } catch (error) {
    console.error('measure-volume error:', error);
    res.status(500).json({ error: error.message || 'Volume measurement failed' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// SAVE VOLUME MEASUREMENT to Supabase
// ─────────────────────────────────────────────────────────────────────────────
app.post('/api/save-volume', express.json(), async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase not configured' });
    }

    const {
      length_cm,
      width_cm,
      height_cm,
      actual_weight_kg,
      volumetric_weight_kg,
      chargeable_weight_kg,
    } = req.body;

    const { date: uploadedDate, time: uploadedTime } = getISTDateTime();

    const { error: sbError } = await supabase.from('volume_measurements').insert([{
      length_cm:             parseFloat(length_cm)             || null,
      width_cm:              parseFloat(width_cm)              || null,
      height_cm:             parseFloat(height_cm)             || null,
      actual_weight_kg:      parseFloat(actual_weight_kg)      || null,
      volumetric_weight_kg:  parseFloat(volumetric_weight_kg)  || null,
      chargeable_weight_kg:  parseFloat(chargeable_weight_kg)  || null,
      uploaded_date:         uploadedDate,
      uploaded_time:         uploadedTime,
    }]);

    if (sbError) {
      console.error('Supabase save-volume error:', sbError.message);
      return res.status(500).json({ error: 'Database save failed: ' + sbError.message });
    }

    return res.json({ status: 'success', message: 'Volume measurement saved to ERP.' });

  } catch (error) {
    console.error('save-volume error:', error);
    res.status(500).json({ error: error.message || 'Save failed' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// MIGRATE — Create volume_measurements table in Supabase
// Visit: /api/migrate-volume  (one-time setup)
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/migrate-volume', async (req, res) => {
  const password = process.env.SUPABASE_KEY;
  const hosts = [
    { host: "aws-0-ap-south-1.pooler.supabase.com", port: 6543, user: "postgres.ktxhjnhghgzcyokbcsoe" },
    { host: "aws-0-ap-south-1.pooler.supabase.com", port: 5432, user: "postgres.ktxhjnhghgzcyokbcsoe" },
    { host: "db.ktxhjnhghgzcyokbcsoe.supabase.co",  port: 5432, user: "postgres" },
  ];

  const createTableSql = `
    CREATE TABLE IF NOT EXISTS public.volume_measurements (
      id BIGSERIAL PRIMARY KEY,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
      length_cm NUMERIC,
      width_cm NUMERIC,
      height_cm NUMERIC,
      actual_weight_kg NUMERIC,
      volumetric_weight_kg NUMERIC,
      chargeable_weight_kg NUMERIC,
      uploaded_date TEXT,
      uploaded_time TEXT
    );
  `;

  let errors = [];
  for (const h of hosts) {
    console.log(`migrate-volume: trying ${h.host}:${h.port}...`);
    const client = new Client({
      host: h.host, port: h.port, user: h.user,
      password, database: "postgres",
      ssl: { rejectUnauthorized: false }
    });
    try {
      await client.connect();
      await client.query(createTableSql);
      await client.end();
      return res.json({ status: "success", message: "✅ volume_measurements table created successfully!" });
    } catch (err) {
      console.error(`Failed ${h.host}:${h.port}: ${err.message}`);
      errors.push(`${h.host}:${h.port}: ${err.message}`);
      try { await client.end(); } catch (e) {}
    }
  }
  return res.status(500).json({ error: "All connection attempts failed", details: errors });
});

// ─────────────────────────────────────────────────────────────────────────────
// PAYROLL SYSTEM — Table Migration, Masters Sync, and Draft Management
// ─────────────────────────────────────────────────────────────────────────────

app.get('/api/migrate-payroll', async (req, res) => {
  const regions = [
    'ap-south-1', 'ap-southeast-1', 'ap-southeast-2', 'ap-northeast-1', 'ap-northeast-2',
    'us-east-1', 'us-east-2', 'us-west-1', 'us-west-2',
    'eu-west-1', 'eu-central-1', 'eu-west-2', 'eu-west-3', 'sa-east-1'
  ];
  const passwords = [
    "efflogistics2024",
    "hrrecruit2024",
    "efflogistics",
    "erpnxt",
    "erpnxtffe",
    "anwar123",
    "anwar2024",
    "Anwar@123",
    process.env.SUPABASE_KEY
  ].filter(Boolean);
  const ports = [6543, 5432];

  const attempts = [];
  for (const region of regions) {
    for (const port of ports) {
      for (const password of passwords) {
        attempts.push({
          host: `aws-0-${region}.pooler.supabase.com`,
          port,
          user: "postgres.ktxhjnhghgzcyokbcsoe",
          password
        });
      }
    }
  }

  for (const password of passwords) {
    attempts.push({
      host: "2406:da14:25a:5801:2280:b643:74c9:b400",
      port: 5432,
      user: "postgres",
      password
    });
    attempts.push({
      host: "db.ktxhjnhghgzcyokbcsoe.supabase.co",
      port: 5432,
      user: "postgres",
      password
    });
  }

  const createTablesSql = `
    -- Drivers Master Table
    CREATE TABLE IF NOT EXISTS public.payroll_drivers (
      driver_code TEXT PRIMARY KEY,
      actual_name TEXT,
      category TEXT,
      account_number TEXT,
      ifsc_code TEXT,
      bank_name TEXT,
      branch_name TEXT,
      basic_pay NUMERIC DEFAULT 0,
      rate_per_day NUMERIC DEFAULT 0,
      ot_rate NUMERIC DEFAULT 0,
      esi_rate NUMERIC DEFAULT 0,
      epf_rate NUMERIC DEFAULT 0,
      leave_eligibility TEXT,
      holiday_eligibility TEXT,
      holiday_wages NUMERIC DEFAULT 0,
      esi_less NUMERIC DEFAULT 0,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
    );

    -- Sections Master Table
    CREATE TABLE IF NOT EXISTS public.payroll_sections (
      dept TEXT PRIMARY KEY,
      ot_eligibility TEXT,
      target_km NUMERIC DEFAULT 0,
      sr_code TEXT,
      rate NUMERIC DEFAULT 0,
      addl_sr TEXT,
      addl_rate NUMERIC DEFAULT 0,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
    );

    -- Deductions Master Table
    CREATE TABLE IF NOT EXISTS public.payroll_deductions (
      driver_code TEXT PRIMARY KEY,
      union_ded NUMERIC DEFAULT 0,
      fine NUMERIC DEFAULT 0,
      accident NUMERIC DEFAULT 0,
      balance NUMERIC DEFAULT 0,
      total_deductions NUMERIC DEFAULT 0,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
    );

    -- Payroll Run Drafts Table
    CREATE TABLE IF NOT EXISTS public.payroll_drafts (
      month_year TEXT PRIMARY KEY,
      trips JSONB DEFAULT '[]'::jsonb,
      advances JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
    );

    -- Supervisor / Branch Mapping Table
    CREATE TABLE IF NOT EXISTS public.supervisor_branch_mapping (
      id BIGSERIAL PRIMARY KEY,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
      supervisor_name TEXT UNIQUE NOT NULL,
      branch TEXT NOT NULL
    );
  `;

  const testConnection = async (att) => {
    const client = new Client({
      host: att.host,
      port: att.port,
      user: att.user,
      password: att.password,
      database: "postgres",
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 3000
    });
    try {
      await client.connect();
      return { client, attempt: att };
    } catch (err) {
      throw err;
    }
  };

  try {
    const { client, attempt } = await Promise.any(
      attempts.map(att => testConnection(att).catch(err => {
        throw new Error(`${att.host}:${att.port}:${att.user}: ${err.message}`);
      }))
    );

    console.log(`Connected successfully via ${attempt.host}:${attempt.port} with user ${attempt.user}`);
    await client.query(createTablesSql);
    await client.end();

    return res.json({
      status: "success",
      message: "✅ Payroll tables created successfully!",
      connected_via: {
        host: attempt.host,
        port: attempt.port,
        user: attempt.user
      }
    });
  } catch (err) {
    console.error("All migration attempts failed:", err);
    return res.status(500).json({
      error: "All connection attempts and password fallbacks failed",
      details: err.errors ? err.errors.map(e => e.message) : [err.message]
    });
  }
});

app.get('/api/payroll/masters', async (req, res) => {
  if (!supabase) return res.status(500).json({ error: "Supabase not configured" });
  try {
    const { data: drivers, error: errD } = await supabase.from('payroll_drivers').select('*').order('driver_code');
    const { data: sections, error: errS } = await supabase.from('payroll_sections').select('*').order('dept');
    const { data: deductions, error: errDed } = await supabase.from('payroll_deductions').select('*').order('driver_code');

    if (errD || errS || errDed) {
      return res.status(500).json({ error: "Failed to fetch master data", details: { errD, errS, errDed } });
    }

    return res.json({ drivers: drivers || [], sections: sections || [], deductions: deductions || [] });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/payroll/masters/sync', express.json({ limit: '10mb' }), async (req, res) => {
  if (!supabase) return res.status(500).json({ error: "Supabase not configured" });
  try {
    const { drivers, sections, deductions } = req.body;
    let results = {};

    if (drivers && drivers.length > 0) {
      const { data, error } = await supabase.from('payroll_drivers').upsert(drivers);
      if (error) throw new Error("Drivers sync failed: " + error.message);
      results.driversSynced = drivers.length;
    }
    if (sections && sections.length > 0) {
      const { data, error } = await supabase.from('payroll_sections').upsert(sections);
      if (error) throw new Error("Sections sync failed: " + error.message);
      results.sectionsSynced = sections.length;
    }
    if (deductions && deductions.length > 0) {
      const { data, error } = await supabase.from('payroll_deductions').upsert(deductions);
      if (error) throw new Error("Deductions sync failed: " + error.message);
      results.deductionsSynced = deductions.length;
    }

    return res.json({ status: "success", results });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.get('/api/payroll/draft/:month_year', async (req, res) => {
  if (!supabase) return res.status(500).json({ error: "Supabase not configured" });
  try {
    const { month_year } = req.params;
    const { data, error } = await supabase.from('payroll_drafts').select('*').eq('month_year', month_year).maybeSingle();
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ draft: data || null });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/payroll/draft/save', express.json({ limit: '20mb' }), async (req, res) => {
  if (!supabase) return res.status(500).json({ error: "Supabase not configured" });
  try {
    const { month_year, trips, advances } = req.body;
    if (!month_year) return res.status(400).json({ error: "month_year is required" });

    const { data, error } = await supabase.from('payroll_drafts').upsert({ month_year, trips, advances });
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ status: "success", message: "Draft saved successfully" });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});


// ─────────────────────────────────────────────────────────────────────────────
// DATABASE EXPLORER SYSTEM — View, Edit, and Delete Scanned Docs in Supabase
// ─────────────────────────────────────────────────────────────────────────────

app.get('/api/explorer/data/:table', async (req, res) => {
  if (!supabase) return res.status(500).json({ error: "Supabase not configured" });
  const { table } = req.params;
  if (!['live_scanned_invoices', 'all_invoices', 'pod_register', 'supervisor_branch_mapping', 'holidays'].includes(table)) {
    return res.status(400).json({ error: "Invalid table name" });
  }
  try {
    const { data, error } = await supabase.from(table).select('*').order('id', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ data: data || [] });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/explorer/create/:table', express.json({ limit: '5mb' }), async (req, res) => {
  if (!supabase) return res.status(500).json({ error: "Supabase not configured" });
  const { table } = req.params;
  if (!['live_scanned_invoices', 'all_invoices', 'pod_register', 'supervisor_branch_mapping', 'holidays'].includes(table)) {
    return res.status(400).json({ error: "Invalid table name" });
  }
  const newRow = req.body;
  
  // Clean up any user-submitted id or timestamps
  delete newRow.id;
  delete newRow.created_at;

  try {
    if (table === 'supervisor_branch_mapping' && newRow.supervisor_name) {
      // Split by comma, trim spaces, filter empty values
      const names = newRow.supervisor_name.split(',').map(n => n.trim()).filter(Boolean);
      if (names.length === 0) {
        return res.status(400).json({ error: "Supervisor name cannot be empty" });
      }
      const rowsToInsert = names.map(name => ({
        supervisor_name: name,
        branch: newRow.branch ? newRow.branch.trim() : ''
      }));
      const { data, error } = await supabase.from(table).insert(rowsToInsert).select();
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ status: "success", data: data?.[0] });
    } else {
      const { data, error } = await supabase.from(table).insert(newRow).select();
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ status: "success", data: data?.[0] });
    }
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/explorer/update/:table', express.json({ limit: '5mb' }), async (req, res) => {
  if (!supabase) return res.status(500).json({ error: "Supabase not configured" });
  const { table } = req.params;
  if (!['live_scanned_invoices', 'all_invoices', 'pod_register', 'supervisor_branch_mapping', 'holidays'].includes(table)) {
    return res.status(400).json({ error: "Invalid table name" });
  }
  const { id, ...updatedFields } = req.body;
  if (!id) return res.status(400).json({ error: "ID is required" });
  
  // Clean up any metadata columns that shouldn't be edited/updated manually if any
  delete updatedFields.created_at;

  try {
    const { data, error } = await supabase.from(table).update(updatedFields).eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ status: "success" });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/explorer/delete/:table', express.json(), async (req, res) => {
  if (!supabase) return res.status(500).json({ error: "Supabase not configured" });
  const { table } = req.params;
  if (!['live_scanned_invoices', 'all_invoices', 'pod_register', 'supervisor_branch_mapping', 'holidays'].includes(table)) {
    return res.status(400).json({ error: "Invalid table name" });
  }
  const { id } = req.body;
  if (!id) return res.status(400).json({ error: "ID is required" });
  try {
    const { data, error } = await supabase.from(table).delete().eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ status: "success" });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});


// Export the app for Vercel Serverless Functions
export const config = {
  api: {
    bodyParser: false,
  },
};

export default app;
