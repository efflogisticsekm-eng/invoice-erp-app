import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { parse } from "https://deno.land/std@0.177.0/encoding/csv.ts";

// Utility to parse cookies from Set-Cookie header
function parseCookies(headers: Headers): string {
  const cookieStrings = headers.get("set-cookie") || "";
  if (!cookieStrings) return "";
  
  // A simple hack to get just the session cookies we need
  const cookies = [];
  const parts = cookieStrings.split(/,(?=\s*[A-Za-z0-9_-]+\=)/);
  for (const part of parts) {
    const cookie = part.split(";")[0].trim();
    if (cookie) cookies.push(cookie);
  }
  return cookies.join("; ");
}

serve(async (req) => {
  // CORS Headers
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { gdmNumber, username, password } = await req.json();

    if (!gdmNumber || !username || !password) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Starting fetch for GDM: ${gdmNumber}`);

    // 1. Initial GET to get the base cookie (dkt_erp_ci_session)
    const initRes = await fetch("https://eff.aadhocc.in/eff_2021/login", {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    
    // We need to parse raw set-cookie headers properly.
    // fetch API sometimes combines them.
    let currentCookies = "";
    if (initRes.headers.has("set-cookie")) {
      const initialCookie = initRes.headers.get("set-cookie")?.split(";")[0] || "";
      currentCookies = initialCookie;
    }

    // 2. Authenticate via AJAX POST
    const authPayload = new URLSearchParams();
    authPayload.append("username", username);
    authPayload.append("password", password);

    const authRes = await fetch("https://eff.aadhocc.in/eff_2021/login/authenticate", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "User-Agent": "Mozilla/5.0",
        "Cookie": currentCookies,
        "X-Requested-With": "XMLHttpRequest",
      },
      body: authPayload.toString(),
    });

    const authData = await authRes.json();
    if (authData.status !== "success") {
      return new Response(JSON.stringify({ error: "ERP Authentication Failed" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Append new cookies (e.g., token)
    if (authRes.headers.has("set-cookie")) {
      // Very basic cookie combination
      const newCookies = parseCookies(authRes.headers);
      currentCookies = `${currentCookies}; ${newCookies}`;
    }

    // 3. Download the Despatch CSV for the specific GDM
    // We query without dates but pass the despatch_number to filter exactly!
    const csvUrl = `https://eff.aadhocc.in/eff_2021/main/effdespatch/exportDespatchExcel?despatch_number=${encodeURIComponent(gdmNumber)}&location_id=&lr_number=&from_date=&to_date=&delivery_staff_search=`;
    
    const csvRes = await fetch(csvUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Cookie": currentCookies,
      },
    });

    if (!csvRes.ok) {
      throw new Error(`Failed to fetch CSV: ${csvRes.statusText}`);
    }

    const csvText = await csvRes.text();
    
    // Parse CSV without assuming column count to avoid mismatch errors
    const rows = await parse(csvText, {
      lazyQuotes: true
    });

    if (!rows || rows.length === 0) {
      throw new Error("CSV is empty");
    }

    const header = rows[0];
    const despatchIdx = header.findIndex((h: string) => h.trim() === "Despatch No");
    const lrIdx = header.findIndex((h: string) => h.trim() === "Lr no");
    const boxQtyIdx = header.findIndex((h: string) => h.trim() === "Box Qty");
    const weightIdx = header.findIndex((h: string) => h.trim() === "Weight");

    if (despatchIdx === -1 || lrIdx === -1) {
      throw new Error("Could not find 'Despatch No' or 'Lr no' columns in the CSV");
    }

    // Extract all LR numbers for this GDM and calculate totals
    let totalBox = 0;
    let totalWeight = 0;
    const lrNumbers = rows.slice(1)
      .filter((row: any[]) => String(row[despatchIdx]).trim() === String(gdmNumber).trim())
      .map((row: any[]) => {
        if (boxQtyIdx !== -1) {
          const qty = parseInt(row[boxQtyIdx], 10);
          if (!isNaN(qty)) {
            totalBox += qty;
          }
        }
        if (weightIdx !== -1) {
          const w = parseFloat(row[weightIdx]);
          if (!isNaN(w)) {
            totalWeight += w;
          }
        }
        return row[lrIdx];
      })
      .filter(Boolean); // Remove empty values

    return new Response(JSON.stringify({ lrNumbers, totalBox, totalWeight }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
    
  } catch (error: any) {
    console.error("Edge Function Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
