import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { base64Image, category, vehicleListString } = await req.json();

    if (!base64Image) {
      return new Response(JSON.stringify({ error: "Missing base64Image" }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const apiKey = Deno.env.get('OPENAI_API_KEY');
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "OpenAI API Key not configured on server" }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const prompt = `Extract details from this receipt/invoice for the expense category: "${category}". Return ONLY a valid JSON object with the keys: 'partyName' (the name of the shop, vendor, or workshop), 'totalAmount' (the grand total amount as a number), 'cgst' (the CGST amount as a number, or 0), 'sgst' (the SGST amount as a number, or 0), 'igst' (the IGST amount as a number, or 0), 'gstTotal' (the total tax/GST amount as a number. If only a single GST amount is present, put it here, otherwise sum the CGST, SGST, IGST into this), and 'subTotal' (the amount before tax). Also extract 'vehicleNo' (Look for a vehicle registration number in the bill. Here are the valid vehicle numbers: ${vehicleListString || 'None provided'}. Match ignoring spaces, dashes, or special characters. Return the exact matching vehicle number from the list if found). Do not include markdown formatting or any other text, just the raw JSON.`;

    const openAiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: prompt
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:image/jpeg;base64,${base64Image}`
                }
              }
            ]
          }
        ],
        max_tokens: 500,
        temperature: 0.0
      })
    });

    if (!openAiResponse.ok) {
      const errorText = await openAiResponse.text();
      throw new Error(`OpenAI API error: ${errorText}`);
    }

    const data = await openAiResponse.json();
    return new Response(JSON.stringify(data), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (err) {
    console.error("Error in scan-receipt:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
