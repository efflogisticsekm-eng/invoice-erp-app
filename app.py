import os
import time
import base64
import json
import io
import pandas as pd
import streamlit as st
from openai import OpenAI
import pymupdf  # PyMuPDF (fitz)
from dotenv import load_dotenv
from supabase import create_client, Client

# Load environment variables (useful for local development)
load_dotenv(override=True)

# Streamlit Page Config
st.set_page_config(page_title="Invoice Extraction ERP", page_icon="🧾", layout="wide")

# Custom CSS for aesthetics
st.markdown("""
<style>
    .main-header {
        font-size: 2.5rem;
        color: #1E3A8A;
        font-weight: 700;
        margin-bottom: 0rem;
    }
    .sub-header {
        font-size: 1.2rem;
        color: #6B7280;
        margin-bottom: 2rem;
    }
</style>
""", unsafe_allow_html=True)

st.markdown('<p class="main-header">🧾 Automated Invoice ERP</p>', unsafe_allow_html=True)
st.markdown('<p class="sub-header">Upload multiple invoices. Validates against Supabase Database to prevent duplicates.</p>', unsafe_allow_html=True)

# Define Excel Columns
MASTER_COLUMNS = [
    "Consignor", "Consignor GSTIN", "Ship to Party / Consignee", "Consignee Code",
    "Ship to Party / Consignee GSTIN", "PLACE", "AREA", "DISTRICT", "STATE", 
    "PIN CODE", "PHONE NUMBER", "ADDRESS"
]

ALL_INVOICES_COLUMNS = [
    "Date", "Invoice No", "Lr Number", 
    "Seal Ok", "Sign ok", "Date Ok", "Consignee seal matched", "Remarks from Consignee",
    "Uploaded Date", "Uploaded Time", "Uploaded Doc",
    "Consignor", "Consignor GSTIN", "Ship to Party / Consignee", "Consignee Code",
    "Ship to Party / Consignee GSTIN", "PLACE", "AREA", "DISTRICT", "STATE", 
    "PIN CODE", "PHONE NUMBER", "ADDRESS", "Remarks"
]

def map_to_db_row(extracted_data, is_master=False):
    # Convert extracted dictionary to Supabase compatible dictionary with snake_case keys
    row = {}
    cols = MASTER_COLUMNS if is_master else ALL_INVOICES_COLUMNS
    for col in cols:
        # e.g., "Ship to Party / Consignee GSTIN" -> "ship_to_party_consignee_gstin"
        db_key = col.lower().replace(" / ", "_").replace(" ", "_")
        row[db_key] = extracted_data.get(col, "")
    return row

# --- 1. SETUP OPENAI ---
API_KEY = os.getenv("OPENAI_API_KEY")

if not API_KEY:
    st.sidebar.warning("OpenAI API Key not found in environment.")
    API_KEY = st.sidebar.text_input("Enter OpenAI API Key (sk-...):", type="password")
    if API_KEY:
        with open(".env", "a") as f:
            f.write(f"\nOPENAI_API_KEY={API_KEY}\n")
        os.environ["OPENAI_API_KEY"] = API_KEY
        st.sidebar.success("API Key saved! It will load automatically next time.")

if not API_KEY:
    st.error("OpenAI API Key not found. Please enter it in the sidebar to continue.")
    st.stop()

client = OpenAI(api_key=API_KEY)


# --- 2. SETUP SUPABASE ---
st.sidebar.header("Supabase Configuration")
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")

supabase: Client = None
sheet_records = []

if SUPABASE_URL and SUPABASE_KEY:
    try:
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
        # Fetch existing master records for duplicate validation
        response = supabase.table("consignee_master").select("*").execute()
        sheet_records = response.data
        st.sidebar.success(f"Connected to Supabase! Found {len(sheet_records)} existing records in Master.")
    except Exception as e:
        st.sidebar.error(f"Error connecting to Supabase: {e}")
else:
    st.sidebar.error("Supabase credentials are not set. Please provide SUPABASE_URL and SUPABASE_KEY in Secrets.")


# --- 3. EXTRACTION FUNCTIONS ---
def encode_image_base64(image_bytes):
    return base64.b64encode(image_bytes).decode('utf-8')

def extract_data_from_image(base64_image):
    response = client.chat.completions.create(
        model="gpt-4o-2024-08-06",
        messages=[
            {
                "role": "system",
                "content": "You are a professional data extraction assistant. Extract the requested fields from the provided invoice or Lorry Receipt (LR) image. Return empty strings if a field is not found. CRITICAL RULES:\n1. Consignee GSTIN MUST be exactly 15 alphanumeric characters. Leave blank if not.\n2. 'Date' MUST be the Invoice Date (or LR Date) in DD/MM/YYYY format. Do NOT use the system created at date.\n3. For 'Uploaded Doc', analyze the image: answer 'LR POD' if it has the 'EFF' logo. Answer 'Inv POD' if it does NOT have the 'EFF' logo.\n4. For 'PLACE, AREA, DISTRICT': Only valid official District names can be placed in the 'DISTRICT' column. NEVER put a local place name (like a street or village) in the 'DISTRICT' column. If only a District name is provided in the address (and no other place names), you may use the District name for 'PLACE' and 'AREA' as well. If a local place is given (e.g. KALAYAPURAM P.O), put it in 'PLACE', and infer its actual official District (e.g. Kollam) to put in the 'DISTRICT' column.\n5. For 'Seal Ok', 'Sign ok', 'Date Ok', 'Consignee seal matched', you MUST look at the POD (Proof of Delivery) or receiver's signature section on BOTH Invoices AND LR Copies, and answer 'Yes' or 'No'.\n6. 'Remarks from Consignee' MUST ONLY capture handwritten notes made by a pen (e.g., 'short 1 box'). Leave completely blank if there are no handwritten remarks."
            },
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": "Extract the following details: Date, Invoice No, Lr Number, Uploaded Doc, Consignor, Consignor GSTIN, Ship to Party / Consignee, Consignee Code, Ship to Party / Consignee GSTIN, PLACE, AREA, DISTRICT, STATE, PIN CODE, PHONE NUMBER, ADDRESS, Remarks, Remarks from Consignee, Seal Ok, Sign ok, Date Ok, Consignee seal matched."
                    },
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:image/jpeg;base64,{base64_image}"
                        }
                    }
                ]
            }
        ],
        response_format={
            "type": "json_schema",
            "json_schema": {
                "name": "invoice_extraction",
                "strict": True,
                "schema": {
                    "type": "object",
                    "properties": {
                        "Date": {
                            "type": "string",
                            "description": "Date of the Invoice or LR in DD/MM/YYYY format. Do not use the system created date."
                        },
                        "Invoice No": {"type": "string"},
                        "Lr Number": {"type": "string"},
                        "Uploaded Doc": {
                            "type": "string",
                            "description": "'LR POD' if the image has the 'EFF' logo. 'Inv POD' if it does not have the 'EFF' logo."
                        },
                        "Consignor": {"type": "string"},
                        "Consignor GSTIN": {
                            "type": "string",
                            "description": "GSTIN must be exactly 15 alphanumeric characters. Leave blank if invalid."
                        },
                        "Ship to Party / Consignee": {"type": "string"},
                        "Consignee Code": {"type": "string"},
                        "Ship to Party / Consignee GSTIN": {
                            "type": "string",
                            "description": "GSTIN must be exactly 15 alphanumeric characters. Leave blank if invalid."
                        },
                        "PLACE": {"type": "string"},
                        "AREA": {"type": "string"},
                        "DISTRICT": {
                            "type": "string",
                            "description": "Extract ONLY the exact official District name. Never put a local place name here. Infer the official district if missing."
                        },
                        "STATE": {"type": "string"},
                        "PIN CODE": {"type": "string"},
                        "PHONE NUMBER": {"type": "string"},
                        "ADDRESS": {
                            "type": "string",
                            "description": "Extract the full address precisely as written."
                        },
                        "Remarks": {"type": "string"},
                        "Remarks from Consignee": {
                            "type": "string",
                            "description": "Any handwritten remarks made by the consignee using a pen (e.g., 'short 1 box'). Leave blank if none."
                        },
                        "Seal Ok": {
                            "type": "string",
                            "description": "'Yes' if consignee seal/stamp is present, else 'No'"
                        },
                        "Sign ok": {
                            "type": "string",
                            "description": "'Yes' if consignee signature is present, else 'No'"
                        },
                        "Date Ok": {
                            "type": "string",
                            "description": "'Yes' if date is written near the consignee signature/seal, else 'No'"
                        },
                        "Consignee seal matched": {
                            "type": "string",
                            "description": "'Yes' if the name on the consignee seal matches the Consignee Name, else 'No'"
                        }
                    },
                    "required": [col for col in ALL_INVOICES_COLUMNS if col not in ("Uploaded Date", "Uploaded Time")],
                    "additionalProperties": False
                }
            }
        },
        max_tokens=1000,
        temperature=0.0
    )
    
    result_text = response.choices[0].message.content
    result = json.loads(result_text)
    
    # --- POST-PROCESSING ---
    # 1. Enforce 15-character GSTIN
    for gstin_key in ["Consignor GSTIN", "Ship to Party / Consignee GSTIN"]:
        val = result.get(gstin_key, "")
        if val:
            cleaned_val = str(val).strip()
            if len(cleaned_val) != 15:
                result[gstin_key] = ""
            else:
                result[gstin_key] = cleaned_val
                
    return result

def is_duplicate(sheet_data, new_data):
    if not sheet_data:
        return False
        
    new_gstin = str(new_data.get("Ship to Party / Consignee GSTIN", "")).strip().lower()
    new_consignee = str(new_data.get("Ship to Party / Consignee", "")).strip().lower()
    
    for row in sheet_data:
        existing_gstin = str(row.get("ship_to_party_consignee_gstin", "")).strip().lower()
        existing_consignee = str(row.get("ship_to_party_consignee", "")).strip().lower()
        
        # Exact match on GSTIN
        if new_gstin and new_gstin not in ["", "none", "nan", "null"]:
            if new_gstin == existing_gstin:
                return True
        # Or exact match on Consignee Name
        elif new_consignee and new_consignee not in ["", "none", "nan", "null"]:
            if new_consignee == existing_consignee:
                return True
                
    return False

# --- 4. MAIN UI ---
if "uploader_key" not in st.session_state:
    st.session_state.uploader_key = 0

uploaded_files = st.file_uploader(
    "Drag and drop your invoices here", 
    type=["pdf", "png", "jpg", "jpeg"], 
    accept_multiple_files=True,
    key=f"uploader_{st.session_state.uploader_key}"
)

if uploaded_files:
    if st.button("🚀 Process & Extract", use_container_width=True):
        progress_bar = st.progress(0)
        status_text = st.empty()
        
        added_results = []
        duplicate_files = []
        error_files = []
        
        total_files = len(uploaded_files)
        
        for index, uploaded_file in enumerate(uploaded_files):
            file_name = uploaded_file.name
            status_text.text(f"Processing ({index+1}/{total_files}): {file_name} ...")
            
            try:
                # Read file bytes
                file_bytes = uploaded_file.read()
                
                # Determine file type and get image bytes
                if file_name.lower().endswith('.pdf'):
                    doc = pymupdf.open(stream=file_bytes, filetype="pdf")
                    page = doc.load_page(0)
                    pix = page.get_pixmap(dpi=150)
                    image_bytes = pix.tobytes("jpeg")
                    doc.close()
                else:
                    image_bytes = file_bytes
                
                # Extract Data
                base64_img = encode_image_base64(image_bytes)
                extracted_data = extract_data_from_image(base64_img)
                
                # Inject Upload Date and Time
                import datetime
                import pytz
                tz = pytz.timezone('Asia/Kolkata')
                now = datetime.datetime.now(tz)
                extracted_data["Uploaded Date"] = now.strftime('%d/%m/%Y')
                extracted_data["Uploaded Time"] = now.strftime('%I:%M %p')
                
                # --- ADD TO ALL INVOICES FIRST (No GSTIN validation required here) ---
                if supabase:
                    db_row_all = map_to_db_row(extracted_data, is_master=False)
                    supabase.table("all_invoices").insert(db_row_all).execute()
                
                # --- STRICT GSTIN RULE: Skip Master sheet if Consignee GSTIN is invalid/empty ---
                if not extracted_data.get("Ship to Party / Consignee GSTIN", "").strip():
                    st.warning(f"⚠️ Skipped Master addition for {file_name}: No valid 15-digit Consignee GSTIN found.")
                    error_files.append(file_name)
                    progress_bar.progress((index + 1) / total_files)
                    continue
                
                # Duplicate Check
                if is_duplicate(sheet_records, extracted_data):
                    duplicate_files.append(file_name)
                else:
                    # Append to Supabase Master if configured
                    if supabase:
                        db_row_master = map_to_db_row(extracted_data, is_master=True)
                        supabase.table("consignee_master").insert(db_row_master).execute()
                        sheet_records.append(db_row_master) # Update local cache
                        
                    added_results.append(extracted_data)
                    
            except Exception as e:
                st.error(f"Error processing {file_name}: {e}")
                error_files.append(file_name)
            
            # Update progress
            progress_bar.progress((index + 1) / total_files)
            
        status_text.empty()
        
        # Display Summary Cards
        col1, col2, col3 = st.columns(3)
        col1.metric("Successfully Added", len(added_results))
        col2.metric("Duplicates Skipped", len(duplicate_files), delta_color="inverse")
        col3.metric("Errors", len(error_files), delta_color="inverse")
        
        if duplicate_files:
            st.warning(f"**Duplicates Skipped:** {', '.join(duplicate_files)}")
            
        if error_files:
            st.error(f"**Errors:** {', '.join(error_files)}")
            
        # Display Results
        if added_results:
            df = pd.DataFrame(added_results, columns=ALL_INVOICES_COLUMNS)
            st.success("✅ Extraction & Validation Complete!")
            
            # Highlight 'No' in specific columns and any text in Remarks
            def highlight_no(val):
                return 'background-color: #ffcccc; color: red' if val == 'No' else ''
                
            def highlight_remarks(val):
                return 'background-color: #ffffcc; color: #b38f00' if str(val).strip() else ''
            
            try:
                styled_df = df.style.map(highlight_no, subset=['Seal Ok', 'Consignee seal matched']) \
                                    .map(highlight_remarks, subset=['Remarks from Consignee'])
            except AttributeError:
                styled_df = df.style.applymap(highlight_no, subset=['Seal Ok', 'Consignee seal matched']) \
                                    .applymap(highlight_remarks, subset=['Remarks from Consignee'])
                
            st.dataframe(styled_df, use_container_width=True)
            
            # Excel Download
            output = io.BytesIO()
            with pd.ExcelWriter(output, engine='openpyxl') as writer:
                styled_df.to_excel(writer, index=False, sheet_name='Invoices')
                # Also create a Master sheet
                df_master = pd.DataFrame(added_results, columns=MASTER_COLUMNS)
                df_master.to_excel(writer, index=False, sheet_name='Master')
            
            st.download_button(
                label="📥 Download Newly Added Data as Excel",
                data=output.getvalue(),
                file_name="Extracted_Invoices.xlsx",
                mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                use_container_width=True
            )
            
            if st.button("🧹 Clear Files & Start Over", use_container_width=True):
                st.session_state.uploader_key += 1
                st.rerun()

# --- DATABASE HISTORY DOWNLOAD ---
st.markdown("---")
st.subheader("🗄️ Full Database History")
st.write("Download all previously processed invoices with formatting.")

if st.button("Download Full History as Excel", use_container_width=True):
    if supabase:
        try:
            with st.spinner("Fetching data from Supabase..."):
                response = supabase.table("all_invoices").select("*").execute()
                all_records = response.data
                
                if all_records:
                    # Reverse map db_keys back to display columns
                    reverse_map = {col.lower().replace(" / ", "_").replace(" ", "_"): col for col in ALL_INVOICES_COLUMNS}
                    
                    formatted_records = []
                    for row in all_records:
                        new_row = {}
                        for col in ALL_INVOICES_COLUMNS:
                            db_key = col.lower().replace(" / ", "_").replace(" ", "_")
                            new_row[col] = row.get(db_key, "")
                        formatted_records.append(new_row)
                        
                    history_df = pd.DataFrame(formatted_records, columns=ALL_INVOICES_COLUMNS)
                    
                    def highlight_no(val):
                        return 'background-color: #ffcccc; color: red' if val == 'No' else ''
                    def highlight_remarks(val):
                        return 'background-color: #ffffcc; color: #b38f00' if str(val).strip() else ''
                        
                    try:
                        styled_hist = history_df.style.map(highlight_no, subset=['Seal Ok', 'Consignee seal matched']) \
                                            .map(highlight_remarks, subset=['Remarks from Consignee'])
                    except AttributeError:
                        styled_hist = history_df.style.applymap(highlight_no, subset=['Seal Ok', 'Consignee seal matched']) \
                                            .applymap(highlight_remarks, subset=['Remarks from Consignee'])
                    
                    out_hist = io.BytesIO()
                    with pd.ExcelWriter(out_hist, engine='openpyxl') as writer:
                        styled_hist.to_excel(writer, index=False, sheet_name='All_Invoices')
                        
                    st.download_button(
                        label="📥 Click Here to Download Full History",
                        data=out_hist.getvalue(),
                        file_name="All_Invoices_History.xlsx",
                        mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                        use_container_width=True
                    )
                else:
                    st.info("No records found in database.")
        except Exception as e:
            st.error(f"Error fetching history: {e}")
    else:
        st.error("Supabase not connected.")
