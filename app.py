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
import gspread

# Load environment variables (useful for local development)
load_dotenv()

# Streamlit Page Config
st.set_page_config(page_title="Invoice Extraction ERP", page_icon="🧾", layout="wide")

# Custom CSS for aesthetics
st.markdown("""
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
<style>
    html, body, [class*="css"], [class*="st-"] {
        font-family: 'Inter', sans-serif !important;
    }
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
    .stButton>button {
        background-color: #2563EB;
        color: white;
        border-radius: 8px;
        padding: 0.5rem 1rem;
        font-weight: 600;
    }
    .stButton>button:hover {
        background-color: #1D4ED8;
    }
</style>
""", unsafe_allow_html=True)

st.markdown('<p class="main-header">🧾 Automated Invoice ERP</p>', unsafe_allow_html=True)
st.markdown('<p class="sub-header">Upload multiple invoices. Validates against Google Sheets to prevent duplicates.</p>', unsafe_allow_html=True)

# Define Excel Columns
COLUMNS = [
    "Consignor", "Consignor GSTIN", "Ship to Party / Consignee", "Consignee Code",
    "Ship to Party / Consignee GSTIN", "PLACE", "AREA", "DISTRICT", "STATE", 
    "PIN CODE", "PHONE NUMBER", "ADDRESS", "Remarks"
]

# --- 1. SETUP OPENAI ---
API_KEY = os.getenv("OPENAI_API_KEY")
if not API_KEY:
    try:
        API_KEY = st.secrets["OPENAI_API_KEY"]
    except:
        pass

if not API_KEY:
    st.error("OpenAI API Key not found. Please set it in your environment or Streamlit secrets.")
    st.stop()

client = OpenAI(api_key=API_KEY)


# --- 2. SETUP GOOGLE SHEETS ---
def init_gspread():
    try:
        if os.path.exists("credentials.json"):
            return gspread.service_account(filename="credentials.json")
        elif "gcp_service_account" in st.secrets:
            return gspread.service_account_from_dict(st.secrets["gcp_service_account"])
    except Exception as e:
        st.sidebar.error(f"Error loading Google Credentials: {e}")
    return None

gc = init_gspread()

# Google Sheet Config
st.sidebar.header("Google Sheets Configuration")
sheet_url = st.sidebar.text_input("Enter Google Sheet URL:", value=os.getenv("GOOGLE_SHEET_URL", ""))

worksheet = None
sheet_records = []

if gc and sheet_url:
    try:
        sh = gc.open_by_url(sheet_url)
        worksheet = sh.sheet1
        
        # Ensure headers exist
        existing_data = worksheet.get_all_records()
        if not existing_data and len(worksheet.row_values(1)) == 0:
            worksheet.append_row(COLUMNS)
            existing_data = []
            
        sheet_records = existing_data
        st.sidebar.success(f"Connected! Found {len(sheet_records)} existing records.")
    except Exception as e:
        st.sidebar.error(f"Could not open Google Sheet: {e}")
        st.sidebar.info("Ensure the Service Account Email is shared as 'Editor' on the Google Sheet.")
elif not gc:
    st.sidebar.warning("⚠️ `credentials.json` not found. Duplicate validation will be skipped.")
elif not sheet_url:
    st.sidebar.warning("⚠️ Please enter a Google Sheet URL to enable duplicate validation.")

# --- 3. EXTRACTION FUNCTIONS ---
def encode_image_base64(image_bytes):
    return base64.b64encode(image_bytes).decode('utf-8')

def extract_data_from_image(base64_image):
    response = client.chat.completions.create(
        model="gpt-4o-2024-08-06",
        messages=[
            {
                "role": "system",
                "content": "You are a professional data extraction assistant. Extract the requested fields from the provided invoice image. Return empty strings if a field is not found. CRITICAL RULES:\n1. GSTIN numbers MUST be exactly 15 alphanumeric characters. Verify the GSTIN format (e.g., 2 digits state code, 10 char PAN, 1 entity code, Z, 1 checksum). If a GSTIN does not have exactly 15 characters, leave it blank.\n2. The 'PLACE' field MUST NOT contain the name of the state (e.g., do not put 'Kerala' in the PLACE field, put it in STATE)."
            },
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": "Extract the following details: Consignor, Consignor GSTIN, Ship to Party / Consignee, Consignee Code, Ship to Party / Consignee GSTIN, PLACE, AREA, DISTRICT, STATE, PIN CODE, PHONE NUMBER, ADDRESS, Remarks."
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
                        "DISTRICT": {"type": "string"},
                        "STATE": {"type": "string"},
                        "PIN CODE": {"type": "string"},
                        "PHONE NUMBER": {"type": "string"},
                        "ADDRESS": {"type": "string"},
                        "Remarks": {"type": "string"}
                    },
                    "required": COLUMNS,
                    "additionalProperties": False
                }
            }
        },
        max_tokens=1000,
        temperature=0.0
    )
    
    result_text = response.choices[0].message.content
    return json.loads(result_text)

def is_duplicate(sheet_data, new_data):
    if not sheet_data:
        return False
        
    new_gstin = str(new_data.get("Ship to Party / Consignee GSTIN", "")).strip().lower()
    new_consignee = str(new_data.get("Ship to Party / Consignee", "")).strip().lower()
    new_address = str(new_data.get("ADDRESS", "")).strip().lower()
    
    for row in sheet_data:
        existing_gstin = str(row.get("Ship to Party / Consignee GSTIN", "")).strip().lower()
        existing_consignee = str(row.get("Ship to Party / Consignee", "")).strip().lower()
        existing_address = str(row.get("ADDRESS", "")).strip().lower()
        
        if new_gstin and new_gstin not in ["", "none", "nan", "null"]:
            if new_gstin == existing_gstin:
                return True
        elif new_consignee and new_address and new_consignee not in ["", "none", "nan", "null"]:
            if new_consignee == existing_consignee and new_address == existing_address:
                return True
                
    return False

# --- 4. MAIN UI ---
uploaded_files = st.file_uploader(
    "Drag and drop your invoices here", 
    type=["pdf", "png", "jpg", "jpeg"], 
    accept_multiple_files=True
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
                
                # Duplicate Check
                if worksheet and is_duplicate(sheet_records, extracted_data):
                    duplicate_files.append(file_name)
                else:
                    # Append to Google Sheet if configured
                    if worksheet:
                        # Prepare row data in correct column order
                        row_data = [extracted_data.get(col, "") for col in COLUMNS]
                        worksheet.append_row(row_data)
                        sheet_records.append(extracted_data) # Update local cache
                        
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
            df = pd.DataFrame(added_results, columns=COLUMNS)
            st.success("✅ Extraction & Validation Complete!")
            st.dataframe(df, use_container_width=True)
            
            # Excel Download
            output = io.BytesIO()
            with pd.ExcelWriter(output, engine='openpyxl') as writer:
                df.to_excel(writer, index=False, sheet_name='Invoices')
            
            st.download_button(
                label="📥 Download Newly Added Data as Excel",
                data=output.getvalue(),
                file_name="Extracted_Invoices.xlsx",
                mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                use_container_width=True
            )
