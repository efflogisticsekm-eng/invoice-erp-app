import os
import sys
import pandas as pd
from datetime import datetime, timedelta
from bs4 import BeautifulSoup
import time
import gspread
from oauth2client.service_account import ServiceAccountCredentials
from google.oauth2.service_account import Credentials
import json

sys.path.append(os.path.join(os.path.dirname(__file__), "..", "libs"))
from playwright.sync_api import sync_playwright

###########################################
# SETTINGS
###########################################
START_DATE_STR = "01/07/2026"
END_DATE_STR = "26/08/2026"
CREDENTIALS_FILE = "/Users/anwar/Antigravity-Related/ERP nxt Data collection/Invoice_Extractor_Tool/credentials.json"
GOOGLE_SHEET_NAME = "Topay & Paid Parcel Billing"

EXPECTED_COLUMNS = [
    "Consignor Name",
    "Sl No",
    "Date",
    "LR No",
    "Consignee",
    "Destination",
    "Invoice No",
    "Box Count",
    "Boxes",
    "Product Type/Box Type",
    "Lr Amount",
    "LC/UC",
    "Stationary Charge",
    "Weight",
    "Payment type",
    "Total"
]

def generate_date_batches(start_str, end_str, batch_days=3):
    start = datetime.strptime(start_str, "%d/%m/%Y")
    end = datetime.strptime(end_str, "%d/%m/%Y")
    batches = []
    curr = start
    while curr <= end:
        batch_end = min(curr + timedelta(days=batch_days-1), end)
        batches.append((curr, batch_end))
        curr = batch_end + timedelta(days=1)
    return batches

def get_or_create_sheet():
    creds_path = CREDENTIALS_FILE
    scopes = ["https://www.googleapis.com/auth/spreadsheets", "https://www.googleapis.com/auth/drive"]
    
    google_creds_env = os.getenv("GOOGLE_CREDENTIALS_JSON")
    try:
        if google_creds_env:
            creds_dict = json.loads(google_creds_env)
            creds = Credentials.from_service_account_info(creds_dict, scopes=scopes)
        else:
            creds = Credentials.from_service_account_file(creds_path, scopes=scopes)
            
        client = gspread.authorize(creds)
        return client.open(GOOGLE_SHEET_NAME)
    except Exception as e:
        print(f"Error accessing sheet: {e}")
        return None

def upload_dataframe_to_worksheet(spreadsheet, df, worksheet_name, append_mode=True):
    df = df.fillna('')
    try:
        worksheet = spreadsheet.worksheet(worksheet_name)
    except gspread.exceptions.WorksheetNotFound:
        worksheet = spreadsheet.add_worksheet(title=worksheet_name, rows="1000", cols="20")
        
    if not append_mode:
        print(f"Clearing historical data from {worksheet_name} (Row 2 onwards)...")
        worksheet.batch_clear(['A2:Z50000'])
        data = df.values.tolist()
        if data:
            worksheet.update(values=data, range_name='A2')
            print(f"✅ Uploaded {len(df)} rows to '{worksheet_name}' (Overwrite Mode)!")
    else:
        data = df.values.tolist()
        if data:
            worksheet.append_rows(data, value_input_option="USER_ENTERED")
            print(f"✅ Appended {len(df)} rows to '{worksheet_name}'!")

def get_header_mapping(headers):
    # Maps screen column index -> standard column name
    mapping = {}
    for i, h_raw in enumerate(headers):
        h = h_raw.upper().strip()
        if h in ["SL NO", "SL NO.", "SL"]:
            mapping[i] = "Sl No"
        elif h == "DATE":
            mapping[i] = "Date"
        elif h in ["LR NO", "LR"]:
            mapping[i] = "LR No"
        elif h in ["CONSIGNEE", "PARTY"]:
            mapping[i] = "Consignee"
        elif h in ["PLACE", "DESTINATION"]:
            mapping[i] = "Destination"
        elif h in ["INVOICE", "INVOICE NO", "INVOICE NUMBER"]:
            mapping[i] = "Invoice No"
        elif h in ["QTY", "BOX QTY", "BOX COUNT"]:
            mapping[i] = "Box Count"
        elif h in ["BOX STR", "BOXES"]:
            mapping[i] = "Boxes"
        elif h in ["PRODUCT TYPE", "BOX TYPE", "PRODUCT TYPE/BOX TYPE"]:
            mapping[i] = "Product Type/Box Type"
        elif h in ["AMOUNT", "LR AMOUNT", "FRIGHT"]:
            mapping[i] = "Lr Amount"
        elif h in ["LC/UC", "LC"]:
            mapping[i] = "LC/UC"
        elif h in ["STATIONARY", "STATIONARY CHARGE"]:
            mapping[i] = "Stationary Charge"
        elif h == "WEIGHT":
            mapping[i] = "Weight"
        elif h in ["PAYMENT TYPE", "TYPE"]:
            mapping[i] = "Payment type"
        elif h == "TOTAL":
            mapping[i] = "Total"
    return mapping

def run_smart_html_extraction(start_date_str=START_DATE_STR, end_date_str=END_DATE_STR, append_mode=False):
    batches = generate_date_batches(start_date_str, end_date_str, batch_days=3)
    print(f"🚀 Starting V7 HTML-Batched Extraction for {len(batches)} batches...")
    
    lr_mapping = {}
    print("📋 Loading Consignor Mapping from LR Data Google Sheet...")
    spreadsheet = get_or_create_sheet()
    if not spreadsheet:
        return
        
    try:
        ws = spreadsheet.worksheet("LR Data")
        headers = ws.row_values(1)
        headers_upper = [h.strip().upper() for h in headers]
        lr_idx = headers_upper.index("LR NO") if "LR NO" in headers_upper else -1
        cons_idx = headers_upper.index("CONSIGNOR") if "CONSIGNOR" in headers_upper else -1
        if cons_idx == -1 and "CONSIGNOR_NAME" in headers_upper:
            cons_idx = headers_upper.index("CONSIGNOR_NAME")
            
        if lr_idx != -1 and cons_idx != -1:
            mapping_vals = ws.get_all_values()[1:]
            for row in mapping_vals:
                if len(row) > max(lr_idx, cons_idx):
                    lr_val = row[lr_idx].strip().upper()
                    consignor = row[cons_idx].strip()
                    if lr_val:
                        lr_mapping[lr_val] = consignor
            print(f"✅ Loaded {len(lr_mapping)} LR to Consignor mappings.")
        else:
            print("⚠️ Required columns not found in LR Data.")
    except Exception as e:
        print(f"⚠️ Could not load LR mapping: {e}")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=["--no-sandbox", "--disable-gpu"])
        
        for batch_idx, (b_start, b_end) in enumerate(batches):
            page = browser.new_page()
            
            d_log_from = b_start.strftime("%d/%m/%Y")
            d_log_to = b_end.strftime("%d/%m/%Y")
            d_input_from = b_start.strftime("%m/%d/%Y")
            d_input_to = b_end.strftime("%m/%d/%Y")
            
            print(f"\n=======================================================")
            print(f"📅 Fetching HTML data for batch {d_log_from} to {d_log_to}")
            print(f"=======================================================")
            
            try:
                page.goto("https://eff.aadhocc.in/eff_2021/login")
                page.fill("#login_user_id", "effedathala")
                page.fill("#login_password", "@eff2019")
                page.click("button[type='submit']")
                page.wait_for_timeout(2000)
                
                # We need to get all consignors active to search them individually?
                # No, if we don't pass a consignor_id, the HTML table returns ALL consignors combined!!
                # The user's screen shows all records.
                page.goto("https://eff.aadhocc.in/eff_2021/main/bill_clear", timeout=60000)
                page.wait_for_timeout(2000)
                
                page.fill("input[name='fromDate']", d_input_from)
                page.fill("input[name='toDate']", d_input_to)
                
                # We just click search without selecting a consignor. 
                # This will load ALL consignors for these dates into multiple tables!
                page.click("input[name='search']")
                page.wait_for_timeout(7000) # Wait for all tables to load
                
                html = page.content()
                soup = BeautifulSoup(html, "html.parser")
                tables = soup.find_all("table")
                
                if not tables:
                    print(f"  ❌ No tables found on screen for batch {d_log_from}-{d_log_to}.")
                    continue
                    
                print(f"  Found {len(tables)} tables to process.")
                batch_master_data = []
                data_rows = 0
                
                for table in tables:
                    # Skip layout tables that contain nested tables
                    if table.find("table"):
                        continue
                        
                    rows = table.find_all("tr")
                    if len(rows) < 2:
                        continue # No data rows
                        
                    for row in rows:
                        cols = [td.get_text(separator=' ', strip=True) for td in row.find_all(["td", "th"])]
                        if not cols or not any(cols): continue
                        
                        if "Total :" in cols[0] or "Grand Total" in cols[0] or "TOTAL" in cols[-1].upper():
                            continue
                            
                        # If cols[1] is a header string, it's a repeated header
                        if len(cols) > 2 and cols[1].upper().strip() in ["SL NO", "SL NO.", "DATE"]:
                            continue
                            
                        # Only process rows that have exactly 15 or 16 columns
                        if len(cols) not in [15, 16]:
                            continue
                            
                        lr_no = cols[3]
                        if not lr_no or lr_no.upper() == "LR NO":
                            continue
                            
                        found_consignor = ""
                        lr_no_upper = lr_no.strip().upper()
                        if lr_no_upper in lr_mapping:
                            found_consignor = lr_mapping[lr_no_upper]
                                
                        # Build standard row
                        row_dict = {col: "" for col in EXPECTED_COLUMNS}
                        row_dict["Consignor Name"] = found_consignor
                        row_dict["Sl No"] = cols[1]
                        row_dict["Date"] = cols[2]
                        row_dict["LR No"] = cols[3]
                        row_dict["Consignee"] = cols[4]
                        row_dict["Destination"] = cols[5]
                        row_dict["Invoice No"] = cols[6]
                        row_dict["Box Count"] = cols[7]
                        row_dict["Boxes"] = cols[8]
                        
                        if len(cols) == 16:
                            row_dict["Product Type/Box Type"] = cols[9]
                            row_dict["Lr Amount"] = cols[10]
                            row_dict["LC/UC"] = cols[11]
                            row_dict["Stationary Charge"] = cols[12]
                            row_dict["Weight"] = cols[13]
                            row_dict["Payment type"] = cols[14]
                            row_dict["Total"] = cols[15]
                        elif len(cols) == 15:
                            row_dict["Product Type/Box Type"] = ""
                            row_dict["Lr Amount"] = cols[9]
                            row_dict["LC/UC"] = cols[10]
                            row_dict["Stationary Charge"] = cols[11]
                            row_dict["Weight"] = cols[12]
                            row_dict["Payment type"] = cols[13]
                            row_dict["Total"] = cols[14]
                        
                        # Ensure Stationary Charge is numeric default
                        if not row_dict["Stationary Charge"]:
                            row_dict["Stationary Charge"] = 0
                        
                        batch_master_data.append(row_dict)
                        data_rows += 1
                        
                print(f"  ✅ Extracted {data_rows} total rows from this batch.")
                        
                # Batch finished. Build DataFrame and upload!
                if batch_master_data:
                    batch_df = pd.DataFrame(batch_master_data)
                    # Enforce column order and fillnas
                    for col in EXPECTED_COLUMNS:
                        if col not in batch_df.columns:
                            if col == "Stationary Charge":
                                batch_df[col] = 0
                            else:
                                batch_df[col] = ""
                    batch_df = batch_df[EXPECTED_COLUMNS]
                    
                    # Convert numerics
                    for col in ["Lr Amount", "LC/UC", "Stationary Charge", "Weight", "Total"]:
                        batch_df[col] = pd.to_numeric(batch_df[col].astype(str).str.replace(r'[^\d.-]', '', regex=True), errors='coerce').fillna(0)
                        
                    print(f"\n  📤 Uploading batch {d_log_from} to {d_log_to} ({len(batch_df)} rows)...")
                    
                    # --- NEW: Deduplication Logic ---
                    print("  🔍 Checking for existing LR Numbers in 'All Data' to prevent duplicates...")
                    try:
                        all_data_ws = spreadsheet.worksheet("All Data")
                        existing_lrs = all_data_ws.col_values(4)[1:] # LR No is column 4
                        existing_lrs_set = set([str(lr).strip() for lr in existing_lrs if str(lr).strip()])
                        
                        initial_len = len(batch_df)
                        batch_df = batch_df[~batch_df['LR No'].astype(str).str.strip().isin(existing_lrs_set)]
                        print(f"  ✨ Removed {initial_len - len(batch_df)} duplicate rows. {len(batch_df)} new rows to insert.")
                    except Exception as e:
                        print(f"  ⚠️ Could not fetch existing LRs for deduplication: {e}")
                    # --------------------------------
                    
                    if batch_df.empty:
                        print("  ⏭️ No new rows to append for this batch. Skipping upload.")
                        continue
                        
                    topay_df = batch_df[batch_df['Payment type'].astype(str).str.contains('To Pay', case=False, na=False)]
                    paid_df = batch_df[batch_df['Payment type'].astype(str).str.strip().str.lower() == 'paid']
                    
                    is_first_batch = (batch_idx == 0 and not append_mode)
                    
                    upload_dataframe_to_worksheet(spreadsheet, batch_df, "All Data", append_mode=(not is_first_batch))
                    if not topay_df.empty:
                        upload_dataframe_to_worksheet(spreadsheet, topay_df, "Topay", append_mode=(not is_first_batch))
                    if not paid_df.empty:
                        upload_dataframe_to_worksheet(spreadsheet, paid_df, "Paid", append_mode=(not is_first_batch))
                else:
                    print(f"  ⚠️ No valid data extracted for batch {d_log_from}-{d_log_to}.")
                    
            except Exception as e:
                print(f"  ❌ Error processing batch {d_log_from}-{d_log_to}: {e}")
            finally:
                page.close()
                
        browser.close()
    
    print("\n✅ All batches completed!")

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--historical", action="store_true")
    parser.add_argument("--from-date", type=str, help="Start date (DD/MM/YYYY)")
    parser.add_argument("--to-date", type=str, help="End date (DD/MM/YYYY)")
    args = parser.parse_args()
    
    if args.historical:
        print("Running historical rebuild (01/07/2026 to 26/08/2026)...")
        run_smart_html_extraction(start_date_str="01/07/2026", end_date_str="26/08/2026", append_mode=False)
    elif args.from_date and args.to_date:
        print(f"Running manual extraction for {args.from_date} to {args.to_date}...")
        run_smart_html_extraction(start_date_str=args.from_date, end_date_str=args.to_date, append_mode=True)
    else:
        # Fetch last 7 days to safely cover weekends and holidays without duplicates
        today = datetime.now()
        seven_days_ago = today - timedelta(days=7)
        start_str = seven_days_ago.strftime("%d/%m/%Y")
        end_str = today.strftime("%d/%m/%Y")
        print(f"Running daily append mode ({start_str} to {end_str})...")
        run_smart_html_extraction(start_date_str=start_str, end_date_str=end_str, append_mode=True)
