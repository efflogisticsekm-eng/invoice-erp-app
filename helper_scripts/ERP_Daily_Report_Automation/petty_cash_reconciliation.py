#!/usr/bin/env python3
import os
import sys
import re
import gspread
import pandas as pd
import numpy as np
from datetime import datetime, timedelta, timezone
from google.oauth2.service_account import Credentials
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
import time
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.base import MIMEBase
from email.encoders import encode_base64

# Define directories and credentials path
BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CREDENTIALS_PATH = os.path.join(BASE_DIR, "ERP nxt Data collection", "Invoice_Extractor_Tool", "credentials.json")
DOWNLOAD_DIR = os.path.expanduser("~/Downloads/erp_temp_downloads")

# Load environment variables for email
SENDER_EMAIL = os.getenv("SENDER_EMAIL")
SENDER_PASSWORD = os.getenv("SENDER_PASSWORD")
RECEIVER_EMAIL = os.getenv("RECEIVER_EMAIL")

# Mappings from user instructions
BRANCH_PREFIX_MAP = {
    "CALICUT PETTY CASH IBB": "CLT NEW Petty Cash",
    "MALAPPURAM PETTY CASH": "MLPM Petty Cash",
    "KANHANGAD PETTY CASH": "KSD NEW Petty Cash",
    "CASH - OFFICE PETTY CASH": "NEW Petty Cash - EDATHALA",
    "ANAND PETTY CASH KANNUR": "KNR NEW Petty Cash",
    "KOLLAM PETTY CASH -IBB Saifudeen": "KLM NEW Petty Cash",
    "KOTTAYAM PETTY CASH": "KOTTAYAM Petty Cash -"
}

MONTHS_MAP = {
    'JAN': 1, 'FEB': 2, 'MAR': 3, 'APR': 4, 'MAY': 5, 'JUN': 6,
    'JUL': 7, 'JULY': 7, 'AUG': 8, 'SEP': 9, 'OCT': 10, 'NOV': 11, 'DEC': 12
}

def clean_val(val, default=""):
    if pd.isna(val) or val is None or val is pd.NaT:
        return default
    s = str(val).strip()
    if s.lower() in ('nan', 'nat', 'none', 'null', '-'):
        return default
    return s

def parse_date(val_str):
    if not val_str:
        return None
    val_str = str(val_str).strip()
    # Normalize separators
    val_str = val_str.replace('/', '-').replace('.', '-')
    
    formats = (
        '%Y-%m-%d %H:%M:%S', '%Y-%m-%d %I:%M:%S %p', '%Y-%m-%d %H:%M', '%Y-%m-%d %I:%M %p', '%Y-%m-%d',
        '%d-%m-%Y %H:%M:%S', '%d-%m-%Y %I:%M:%S %p', '%d-%m-%Y %H:%M', '%d-%m-%Y %I:%M %p', '%d-%m-%Y',
        '%m-%d-%Y %H:%M:%S', '%m-%d-%Y %I:%M:%S %p', '%m-%d-%Y %H:%M', '%m-%d-%Y %I:%M %p', '%m-%d-%Y',
    )
    for fmt in formats:
        try:
            return datetime.strptime(val_str, fmt)
        except ValueError:
            continue
            
    try:
        return pd.to_datetime(val_str, dayfirst=True).to_pydatetime()
    except Exception:
        return None

def parse_date_range_from_title(title):
    pattern = r'(\d{1,2})\s*([A-Z]{3,4})\s*-\s*(\d{1,2})\s*([A-Z]{3,4})'
    match = re.search(pattern, title.upper())
    if match:
        start_day = int(match.group(1))
        start_month_str = match.group(2)
        end_day = int(match.group(3))
        end_month_str = match.group(4)
        
        start_month = MONTHS_MAP.get(start_month_str)
        if not start_month:
            for k, v in MONTHS_MAP.items():
                if k in start_month_str:
                    start_month = v
                    break
        
        end_month = MONTHS_MAP.get(end_month_str)
        if not end_month:
            for k, v in MONTHS_MAP.items():
                if k in end_month_str:
                    end_month = v
                    break
                    
        if start_month and end_month:
            return start_day, start_month, end_day, end_month
    return None

def date_falls_in_range(tx_date, start_day, start_month, end_day, end_month):
    year = tx_date.year
    start_date = datetime(year, start_month, start_day)
    if end_month < start_month:  # Crossover (Dec -> Jan)
        if tx_date.month >= start_month:
            end_date = datetime(year + 1, end_month, end_day)
        else:
            start_date = datetime(year - 1, start_month, start_day)
            end_date = datetime(year, end_month, end_day)
    else:
        end_date = datetime(year, end_month, end_day)
        
    tx_date_clean = datetime(tx_date.year, tx_date.month, tx_date.day)
    return start_date <= tx_date_clean <= end_date

def load_df(file_path):
    with open(file_path, "rb") as f:
        head = f.read(4)
    if head == b"PK\x03\x04" or head == b"\xd0\xcf\x11\xe0":
        return pd.read_excel(file_path)
    else:
        import csv
        import io
        cleaned_rows = []
        for enc in ["utf-8", "latin1", "utf-8-sig"]:
            try:
                with open(file_path, "r", encoding=enc) as f_csv:
                    reader = csv.reader(f_csv)
                    header = next(reader)
                    num_cols = len(header)
                    cleaned_rows.append(header)
                    
                    for row in reader:
                        if len(row) > num_cols:
                            last_col_val = ",".join(row[num_cols-1:])
                            cleaned_row = row[:num_cols-1] + [last_col_val]
                            cleaned_rows.append(cleaned_row)
                        else:
                            cleaned_row = row + [""] * (num_cols - len(row))
                            cleaned_rows.append(cleaned_row)
                
                output = io.StringIO()
                writer = csv.writer(output)
                writer.writerows(cleaned_rows)
                output.seek(0)
                return pd.read_csv(output)
            except Exception:
                continue
        return pd.read_csv(file_path)

def calculate_branch_stats(pc_rows):
    if not pc_rows or len(pc_rows) <= 1:
        return 0.0, 0.0, 0.0
        
    headers = [h.strip() for h in pc_rows[0]]
    payment_idx = headers.index("Payment") if "Payment" in headers else 6
    balance_idx = headers.index("Balance") if "Balance" in headers else 7
    
    closing_balance = 0.0
    total_payments = 0.0
    
    # 1. Find last non-empty balance row
    for row in reversed(pc_rows[1:]):
        if len(row) > balance_idx and row[balance_idx].strip():
            try:
                bal_clean = row[balance_idx].replace(',', '').replace('(', '-').replace(')', '').strip()
                closing_balance = float(bal_clean)
                break
            except ValueError:
                continue
                
    # 2. Sum up total payments (expenses)
    for row in pc_rows[1:]:
        if len(row) > payment_idx and row[payment_idx].strip():
            try:
                pay_val = float(row[payment_idx].replace(',', ''))
                total_payments += pay_val
            except ValueError:
                continue
                
    recommended_topup = abs(closing_balance) if closing_balance < 0 else 0.0
    return closing_balance, total_payments, recommended_topup

def main():
    print("Initializing Petty Cash Auditing & Reconciliation System...", flush=True)
    
    # 1. Authorize Google Sheets API
    if not os.path.exists(CREDENTIALS_PATH):
        print(f"Error: Google Service Account credentials not found at {CREDENTIALS_PATH}", flush=True)
        sys.exit(1)
        
    scopes = ["https://www.googleapis.com/auth/spreadsheets", "https://www.googleapis.com/auth/drive"]
    creds = Credentials.from_service_account_file(CREDENTIALS_PATH, scopes=scopes)
    client = gspread.authorize(creds)
    print("Authorized Google API successfully.", flush=True)

    # 2. Get list of all spreadsheets shared with the service account
    print("Discovering shared spreadsheets on Google Drive...", flush=True)
    # Wrapped in a retry loop to handle transient 503 errors
    all_spreadsheets = []
    for attempt in range(5):
        try:
            all_spreadsheets = client.openall()
            break
        except Exception as api_err:
            if attempt == 4:
                raise api_err
            backoff_secs = (attempt + 1) * 5
            print(f"Google API Error (attempt {attempt+1}/5): {api_err}. Retrying in {backoff_secs}s...", flush=True)
            time.sleep(backoff_secs)
    print(f"Found {len(all_spreadsheets)} accessible spreadsheets.", flush=True)

    # Locate Purchase Register
    pr_sheet = next((s for s in all_spreadsheets if s.title.strip().upper() == "PURCHASE REGISTER"), None)
    if not pr_sheet:
        print("Error: 'PURCHASE REGISTER' spreadsheet not shared or not found.", flush=True)
        sys.exit(1)
    print(f"Connected to Purchase Register (ID: {pr_sheet.id})", flush=True)

    # 3. Read Purchase Register 'MAIN' and 'PETTY CASH MASTER'
    try:
        main_ws = pr_sheet.worksheet("MAIN")
        master_ws = pr_sheet.worksheet("PETTY CASH MASTER")
    except Exception as e:
        print(f"Error accessing worksheets in Purchase Register: {e}", flush=True)
        sys.exit(1)

    # Load mappings from PETTY CASH MASTER
    mapping_data = master_ws.get_all_values()
    if len(mapping_data) > 1:
        branch_map = {}
        for r in mapping_data[1:]:
            if len(r) >= 2 and r[0].strip() and r[1].strip():
                branch_map[r[0].strip()] = r[1].strip()
    else:
        branch_map = BRANCH_PREFIX_MAP
    print("Branch Name Mapping:", branch_map, flush=True)

    # Read MAIN transfers
    pr_rows = main_ws.get_all_values()
    pr_headers = [h.strip() for h in pr_rows[3]] 
    pr_data_rows = pr_rows[4:]
    print(f"Read {len(pr_data_rows)} rows of transaction data from Purchase Register MAIN.", flush=True)

    # Find column indices in Purchase Register
    party_col_idx = 4  
    net_pay_col_idx = 11 
    date_col_idx = 12 
    
    # Filter for branch transfers
    transfers = []
    for r_idx, row in enumerate(pr_data_rows):
        if len(row) <= max(party_col_idx, net_pay_col_idx, date_col_idx):
            continue
        party_name = row[party_col_idx].strip()
        net_pay_str = row[net_pay_col_idx].strip()
        date_str = row[date_col_idx].strip()
        
        matched_branch_pr = None
        for pr_name in branch_map.keys():
            if pr_name.upper() in party_name.upper():
                matched_branch_pr = pr_name
                break
                
        if matched_branch_pr:
            try:
                clean_pay = net_pay_str.replace(',', '')
                amount = float(clean_pay) if clean_pay else 0.0
            except ValueError:
                amount = 0.0
                
            tx_date = parse_date(date_str)
            if tx_date and amount > 0:
                transfers.append({
                    "row_number": r_idx + 5, 
                    "branch_pr_name": matched_branch_pr,
                    "branch_prefix": branch_map[matched_branch_pr],
                    "party_entered": party_name,
                    "amount": amount,
                    "date": tx_date,
                    "date_str": date_str
                })
                
    print(f"Found {len(transfers)} petty cash transfers in Purchase Register.", flush=True)

    # 4. Load ERP reports for Paid LRs and GDMs
    lr_file = os.path.join(DOWNLOAD_DIR, "lr_raw.xlsx")
    despatch_file = os.path.join(DOWNLOAD_DIR, "despatch_raw.xlsx")
    
    if not os.path.exists(lr_file) or not os.path.exists(despatch_file):
        print("Raw ERP downloads not found in ~/Downloads. Checking scratch fallbacks...", flush=True)
        fallback_dir = os.path.join(BASE_DIR, "scratch", "manual_run_july18_tables", "debug-artifacts")
        lr_file = os.path.join(fallback_dir, "lr_raw.xlsx")
        despatch_file = os.path.join(fallback_dir, "despatch_raw.xlsx")
        
    print(f"Using ERP LR report: {lr_file}", flush=True)
    print(f"Using ERP Despatch report: {despatch_file}", flush=True)

    try:
        df_lr = load_df(lr_file)
        df_lr.columns = [str(c).strip().upper() for c in df_lr.columns]
        
        df_desp = load_df(despatch_file)
        df_desp.columns = [str(c).strip().upper() for c in df_desp.columns]
        
        print(f"Loaded {len(df_lr)} actual LRs and {len(df_desp)} actual dispatches from ERP.", flush=True)
    except Exception as e:
        print(f"Error loading ERP files: {e}. Checking without ERP lookups.", flush=True)
        df_lr = pd.DataFrame()
        df_desp = pd.DataFrame()

    # Pre-index ERP data
    lr_db = {}
    if not df_lr.empty:
        lr_no_col = next((c for c in df_lr.columns if c in ['LR NO', 'LRNO', 'LR_NUMBER', 'LR_NO']), None)
        fright_col = next((c for c in df_lr.columns if c in ['TOTAL FRIGHT', 'TOTAL_FRIGHT', 'FRIGHT', 'LR AMOUNT']), None)
        status_col = next((c for c in df_lr.columns if c in ['LR STATUS', 'STATUS']), None)
        consignor_col = next((c for c in df_lr.columns if c in ['CONSIGNOR', 'CONSIGNOR_NAME']), None)
        consignee_col = next((c for c in df_lr.columns if c in ['CONSIGNEE', 'CONSIGNEE_NAME']), None)
        dest_col = next((c for c in df_lr.columns if c in ['DESTINATION', 'PLACE', 'AREA']), None)
        box_col = next((c for c in df_lr.columns if c in ['BOX QTY', 'BOXES', 'QUANTITY']), None)
        
        for _, r in df_lr.iterrows():
            lr_no = clean_val(r[lr_no_col]) if lr_no_col else ""
            if lr_no:
                try:
                    fright_val = float(clean_val(r[fright_col], "0").replace(',', ''))
                except ValueError:
                    fright_val = 0.0
                try:
                    box_val = int(float(clean_val(r[box_col], "0")))
                except ValueError:
                    box_val = 0
                lr_db[lr_no] = {
                    "total_fright": fright_val,
                    "status": clean_val(r[status_col]),
                    "consignor": clean_val(r[consignor_col]),
                    "consignee": clean_val(r[consignee_col]),
                    "destination": clean_val(r[dest_col]),
                    "box_qty": box_val
                }

    # Pre-index GDM to LR mapping
    gdm_lrs = {} 
    if not df_desp.empty:
        desp_no_col = next((c for c in df_desp.columns if c in ['DESPATCH NO', 'DISPATCH NO', 'DESPATCH_NO']), None)
        lr_no_col = next((c for c in df_desp.columns if c in ['LR NO', 'LRNO', 'LR_NUMBER', 'LR_NO']), None)
        
        for _, r in df_desp.iterrows():
            gdm = clean_val(r[desp_no_col]) if desp_no_col else ""
            lr = clean_val(r[lr_no_col]) if lr_no_col else ""
            if gdm and lr:
                if gdm not in gdm_lrs:
                    gdm_lrs[gdm] = []
                gdm_lrs[gdm].append(lr)
 
    # Load bill_clear exports
    bill_clear_db = {}
    import glob
    bc_files = glob.glob(os.path.join(DOWNLOAD_DIR, "bill_clear_*.xlsx"))
    print(f"Loading {len(bc_files)} bill clearance report files...", flush=True)
    for bf in bc_files:
        try:
            df_bc = load_df(bf)
            if df_bc.empty:
                continue
            df_bc.columns = [str(c).strip().upper() for c in df_bc.columns]
            
            lr_col = next((c for c in df_bc.columns if c in ['LR NUMBER', 'LR_NUMBER', 'LR NO', 'LRNO', 'LR']), None)
            fright_col = next((c for c in df_bc.columns if c in ['FREIGHT', 'TOTAL FRIGHT', 'FRIGHT AMOUNT']), None)
            topay_col = next((c for c in df_bc.columns if c in ['TO PAY', 'TOPAY', 'TO_PAY']), None)
            qty_col = next((c for c in df_bc.columns if c in ['QUANTITY', 'QTY', 'BOX COUNT', 'BOXES']), None)
            
            for _, r in df_bc.iterrows():
                lr_no = clean_val(r[lr_col]) if lr_col else ""
                if lr_no:
                    try:
                        fright_val = float(clean_val(r[fright_col], "0").replace('INR', '').replace(',', '').strip())
                    except ValueError:
                        fright_val = 0.0
                    try:
                        topay_val = float(clean_val(r[topay_col], "0").replace('INR', '').replace(',', '').strip())
                    except ValueError:
                        topay_val = 0.0
                    try:
                        qty_val = int(float(clean_val(r[qty_col], "0")))
                    except ValueError:
                        qty_val = 0
                        
                    bill_clear_db[lr_no] = {
                        "total_fright": fright_val,
                        "topay": topay_val,
                        "box_qty": qty_val,
                        "status": "PAID" if topay_val == 0.0 else "TO PAY",
                        "consignor": clean_val(r.get('CONSIGNOR', '')),
                        "consignee": clean_val(r.get('CONSIGNEE', '')),
                        "destination": clean_val(r.get('DESTINATION', ''))
                    }
        except Exception as bc_err:
            print(f"Error parsing bill clear file {bf}: {bc_err}", flush=True)
            
    print(f"Loaded {len(bill_clear_db)} cleared LRs from bill_clear files.", flush=True)

    # Load GDM details scraped from view print layouts
    gdm_scraped_db = {}
    gdm_json_path = os.path.join(DOWNLOAD_DIR, "gdm_details.json")
    if os.path.exists(gdm_json_path):
        try:
            import json
            with open(gdm_json_path, "r", encoding="utf-8") as json_f:
                gdm_scraped_db = json.load(json_f)
            print(f"Loaded {len(gdm_scraped_db)} scraped GDMs from gdm_details.json", flush=True)
        except Exception as json_err:
            print(f"Error loading gdm_details.json: {json_err}", flush=True)

    # 5. Core Reconciliation Engine
    discrepancies_funding = []
    discrepancies_paid_lrs = []
    discrepancies_gdm = []
    
    # Store branch summary details: { branch_name: { closing_balance, total_payments, recommended_topup } }
    branch_topup_summary = {}

    sheet_data_cache = {}

    def get_cached_sheet_data(ss_obj):
        s_id = ss_obj.id
        if s_id in sheet_data_cache:
            return sheet_data_cache[s_id]
            
        print(f"Loading data for spreadsheet: '{ss_obj.title}' into cache...", flush=True)
        cache_entry = {
            "title": ss_obj.title,
            "Petty Cash": [],
            "PAID LR": [],
            "GDM": [],
            "Rate": []
        }
        
        for ws_name in ["Petty Cash", "PAID LR", "GDM", "Rate"]:
            try:
                time.sleep(1.5)
                ws = ss_obj.worksheet(ws_name)
                cache_entry[ws_name] = ws.get_all_values()
            except Exception as e:
                print(f"  [Warning] Worksheet '{ws_name}' not found or failed to load in '{ss_obj.title}': {e}", flush=True)
                cache_entry[ws_name] = []
                
        sheet_data_cache[s_id] = cache_entry
        return cache_entry

    # Reconcile HO CASH transfers
    for tx_idx, tx in enumerate(transfers):
        branch_pref = tx["branch_prefix"]
        tx_date = tx["date"]
        amount = tx["amount"]
        
        matched_sheet = None
        for s in all_spreadsheets:
            title = s.title.strip()
            if title.upper().startswith(branch_pref.upper()):
                date_range = parse_date_range_from_title(title)
                if date_range:
                    sd, sm, ed, em = date_range
                    if date_falls_in_range(tx_date, sd, sm, ed, em):
                        matched_sheet = s
                        break
                        
        if not matched_sheet:
            discrepancies_funding.append({
                "Date": tx["date_str"],
                "Branch": tx["branch_pr_name"],
                "Transfer Amount": amount,
                "Status": "MISSING SPREADSHEET",
                "Details": f"No Petty Cash spreadsheet found for date range containing {tx['date_str']}"
            })
            continue

        sheet_cache = get_cached_sheet_data(matched_sheet)
        pc_rows = sheet_cache["Petty Cash"]

        matched_booking = False
        if pc_rows:
            pc_headers = [h.strip() for h in pc_rows[0]]
            date_idx = pc_headers.index("Date") if "Date" in pc_headers else 1
            type_idx = pc_headers.index("Payment / Receipt") if "Payment / Receipt" in pc_headers else 3
            receipt_idx = pc_headers.index("Receipt") if "Receipt" in pc_headers else 5
            
            for pc_row in pc_rows[1:]:
                if len(pc_row) <= max(date_idx, type_idx, receipt_idx):
                    continue
                row_date_str = pc_row[date_idx].strip()
                row_type = pc_row[type_idx].strip()
                row_receipt_str = pc_row[receipt_idx].strip()
                
                if "HO" in row_type.upper() or "CASH" in row_type.upper():
                    r_date = parse_date(row_date_str)
                    if r_date and abs((r_date - tx_date).days) <= 2:
                        try:
                            booked_amt = float(row_receipt_str.replace(',', '')) if row_receipt_str else 0.0
                        except ValueError:
                            booked_amt = 0.0
                            
                        if abs(booked_amt - amount) < 1.0: 
                            matched_booking = True
                            break
                            
        if not matched_booking:
            discrepancies_funding.append({
                "Date": tx["date_str"],
                "Branch": tx["branch_pr_name"],
                "Transfer Amount": amount,
                "Status": "UNBOOKED FUND",
                "Details": f"Fund transfer of {amount} on {tx['date_str']} is not recorded as 'HO CASH' in sheet '{matched_sheet.title}'"
            })

    # Calculate Top-up and balance stats for each branch
    for pr_name, prefix in branch_map.items():
        # Find latest sheet of this branch prefix
        branch_sheets = [s for s in all_spreadsheets if s.title.strip().upper().startswith(prefix.upper())]
        if not branch_sheets:
            branch_topup_summary[pr_name] = {
                "closing_balance": 0.0,
                "total_payments": 0.0,
                "recommended_topup": 0.0,
                "status": "Spreadsheet Missing"
            }
            continue
            
        # Select the latest sheet by parsing range or just selecting the most recently modified/highest range
        # For simplicity, we choose the one that matches today's date, or falls in range, or the first one found
        now_ist = datetime.now(timezone(timedelta(hours=5, minutes=30)))
        active_sheet = None
        for s in branch_sheets:
            dr = parse_date_range_from_title(s.title)
            if dr and date_falls_in_range(now_ist, dr[0], dr[1], dr[2], dr[3]):
                active_sheet = s
                break
        if not active_sheet:
            active_sheet = branch_sheets[0] # Fallback to first sheet
            
        sheet_cache = get_cached_sheet_data(active_sheet)
        pc_rows = sheet_cache["Petty Cash"]
        c_bal, t_pay, r_top = calculate_branch_stats(pc_rows)
        
        branch_topup_summary[pr_name] = {
            "closing_balance": c_bal,
            "total_payments": t_pay,
            "recommended_topup": r_top,
            "status": "Success",
            "sheet_title": active_sheet.title
        }

    # Reconcile PAID LRs & GDMs using cached data
    for s_id, cache in sheet_data_cache.items():
        title = cache["title"]
        print(f"Auditing details for cached sheet: {title}...", flush=True)
        
        # 1. Audit PAID LRs
        paid_rows = cache["PAID LR"]
        if len(paid_rows) > 1:
            headers = [h.strip() for h in paid_rows[0]]
            data_rows = paid_rows[1:]
            
            is_shifted = False
            first_row = data_rows[0]
            if len(first_row) > 0 and parse_date(first_row[0]):
                is_shifted = True
                print(f"  [Info] Shifted columns detected in '{title} -> PAID LR'!", flush=True)

            if is_shifted:
                lr_date_idx = 0
                lr_no_idx = 1
                branch_idx = 2
                consignee_idx = 4 
                dest_idx = 5
                lr_amt_idx = 9 
                lc_uc_idx = 10 
            else:
                lr_date_idx = headers.index("Date") if "Date" in headers else 1
                lr_no_idx = headers.index("LR No") if "LR No" in headers else 2
                branch_idx = headers.index("BRANCH") if "BRANCH" in headers else 3
                consignee_idx = headers.index("Consignee") if "Consignee" in headers else 5
                dest_idx = headers.index("Destination") if "Destination" in headers else 6
                lr_amt_idx = headers.index("Lr Amount") if "Lr Amount" in headers else 10
                lc_uc_idx = headers.index("LC/UC") if "LC/UC" in headers else 11

            for row_idx, r in enumerate(data_rows):
                if len(r) <= max(lr_no_idx, lr_amt_idx, lc_uc_idx):
                    continue
                    
                lr_no = r[lr_no_idx].strip()
                if not lr_no or lr_no.upper() in ("LR NO", "TOTAL", "SUB TOTAL", "CANCELLED", ""):
                    continue
                    
                lr_date_str = r[lr_date_idx].strip()
                
                try:
                    sheet_lr_amt = float(r[lr_amt_idx].replace(',', '')) if r[lr_amt_idx].strip() else 0.0
                    sheet_lc_uc = float(r[lc_uc_idx].replace(',', '')) if r[lc_uc_idx].strip() else 0.0
                except ValueError:
                    continue

                # Look up first in bill clearance DB, then standard LR DB
                erp_info = None
                if lr_no in bill_clear_db:
                    erp_info = bill_clear_db[lr_no]
                elif lr_no in lr_db:
                    erp_info = lr_db[lr_no]
                    
                if erp_info:
                    actual_freight = erp_info["total_fright"]
                    
                    if abs(sheet_lr_amt - actual_freight) > 2.0:
                        discrepancies_paid_lrs.append({
                            "Sheet": title,
                            "Row": row_idx + 2,
                            "LR No": lr_no,
                            "Date": lr_date_str,
                            "Sheet Lr Amount": sheet_lr_amt,
                            "ERP Actual Amount": actual_freight,
                            "Status": "AMOUNT MISMATCH",
                            "Details": f"LR amount in sheet ({sheet_lr_amt}) does not match ERP actual freight ({actual_freight})"
                        })
                        
                    # Rate check for loading/unloading
                    if sheet_lc_uc > 0:
                        rate_rows = cache["Rate"]
                        r_consignor_idx = None
                        r_consignee_idx = None
                        r_rate_idx = None
                        if rate_rows and len(rate_rows) > 0:
                            rate_headers = [h.strip() for h in rate_rows[0]]
                            rate_headers_upper = [h.upper() for h in rate_headers]
                            r_consignor_idx = next((i for i, h in enumerate(rate_headers_upper) if "CONSIGNOR" in h), None)
                            r_consignee_idx = next((i for i, h in enumerate(rate_headers_upper) if "CONSIGNEE" in h), None)
                            r_rate_idx = next((i for i, h in enumerate(rate_headers_upper) if "RATE" in h), None)
                            
                        if rate_rows and r_consignor_idx is not None and r_consignee_idx is not None and r_rate_idx is not None:
                            matched_rate = None
                            erp_consignor = erp_info["consignor"].upper()
                            erp_consignee = erp_info["consignee"].upper()
                            
                            for rate_row in rate_rows[1:]:
                                if len(rate_row) <= max(r_consignor_idx, r_consignee_idx, r_rate_idx):
                                    continue
                                row_consignor = rate_row[r_consignor_idx].strip().upper()
                                row_consignee = rate_row[r_consignee_idx].strip().upper()
                                
                                if row_consignor in erp_consignor and row_consignee in erp_consignee:
                                    try:
                                        matched_rate = float(rate_row[r_rate_idx].strip())
                                    except ValueError:
                                        matched_rate = None
                                    break
                                    
                            if matched_rate:
                                box_qty = erp_info["box_qty"]
                                allowed_lc_uc = box_qty * matched_rate
                                if sheet_lc_uc > allowed_lc_uc + 1.0: 
                                    discrepancies_paid_lrs.append({
                                        "Sheet": title,
                                        "Row": row_idx + 2,
                                        "LR No": lr_no,
                                        "Date": lr_date_str,
                                        "Sheet Lr Amount": sheet_lr_amt,
                                        "ERP Actual Amount": actual_freight,
                                        "Status": "EXCESS UNLOADING",
                                        "Details": f"Entered LC/UC ({sheet_lc_uc}) exceeds allowed rate ({matched_rate} * {box_qty} boxes = {allowed_lc_uc})"
                                    })
                else:
                    if len(lr_no) >= 4 and not lr_no.isdigit():
                        discrepancies_paid_lrs.append({
                            "Sheet": title,
                            "Row": row_idx + 2,
                            "LR No": lr_no,
                            "Date": lr_date_str,
                            "Sheet Lr Amount": sheet_lr_amt,
                            "ERP Actual Amount": "N/A",
                            "Status": "MISSING IN ERP",
                            "Details": f"LR Number '{lr_no}' was not found in the ERP raw report!"
                        })

        # 2. Audit GDMs
        gdm_rows = cache["GDM"]
        if len(gdm_rows) > 4:
            gdm_headers = [h.strip() for h in gdm_rows[3]] 
            gdm_data = gdm_rows[4:]
            
            gdm_no_idx = gdm_headers.index("GDM No") if "GDM No" in gdm_headers else 0
            to_pay_idx = gdm_headers.index("To Pay") if "To Pay" in gdm_headers else 5
            unloading_idx = gdm_headers.index("Un Loading") if "Un Loading" in gdm_headers else 7
            
            for row_idx, r in enumerate(gdm_data):
                if len(r) <= max(gdm_no_idx, to_pay_idx, unloading_idx):
                    continue
                    
                gdm_no = r[gdm_no_idx].strip()
                if not gdm_no or gdm_no.upper() in ("GDM NO", "TOTAL", "SUB TOTAL", ""):
                    continue
                    
                try:
                    sheet_to_pay = float(r[to_pay_idx].replace(',', '')) if r[to_pay_idx].strip() else 0.0
                    sheet_unloading = float(r[unloading_idx].replace(',', '')) if r[unloading_idx].strip() else 0.0
                except ValueError:
                    continue
                    
                if gdm_no in gdm_scraped_db:
                    lr_list = gdm_scraped_db[gdm_no]
                    
                    base_to_pay_sum = sum(item["topay"] for item in lr_list)
                    actual_to_pay_sum = round(base_to_pay_sum * 1.18, 2)
                    
                    # Accept either base amount or GST-inclusive amount
                    final_to_pay_sum = actual_to_pay_sum
                    if abs(sheet_to_pay - base_to_pay_sum) <= 2.0 and abs(sheet_to_pay - actual_to_pay_sum) > 2.0:
                        final_to_pay_sum = base_to_pay_sum
                    
                    allowed_unloading_sum = 0.0
                    rate_rows = cache["Rate"]
                    r_consignor_idx = None
                    r_consignee_idx = None
                    r_rate_idx = None
                    if rate_rows and len(rate_rows) > 0:
                        rate_headers = [h.strip() for h in rate_rows[0]]
                        rate_headers_upper = [h.upper() for h in rate_headers]
                        r_consignor_idx = next((i for i, h in enumerate(rate_headers_upper) if "CONSIGNOR" in h), None)
                        r_consignee_idx = next((i for i, h in enumerate(rate_headers_upper) if "CONSIGNEE" in h), None)
                        r_rate_idx = next((i for i, h in enumerate(rate_headers_upper) if "RATE" in h), None)
                        
                    for item in lr_list:
                        if rate_rows and r_consignor_idx is not None and r_consignee_idx is not None and r_rate_idx is not None:
                            matched_rate = 0.0
                            erp_consignor = item["consignor"].upper()
                            erp_consignee = item["consignee"].upper()
                            
                            for rate_row in rate_rows[1:]:
                                if len(rate_row) <= max(r_consignor_idx, r_consignee_idx, r_rate_idx):
                                    continue
                                row_consignor = rate_row[r_consignor_idx].strip().upper()
                                row_consignee = rate_row[r_consignee_idx].strip().upper()
                                
                                if row_consignor in erp_consignor and row_consignee in erp_consignee:
                                    try:
                                        matched_rate = float(rate_row[r_rate_idx].strip())
                                    except ValueError:
                                        matched_rate = 0.0
                                    break
                            allowed_unloading_sum += item["boxes"] * matched_rate
                            
                    # Audit To-Pay
                    if abs(sheet_to_pay - final_to_pay_sum) > 5.0:
                        discrepancies_gdm.append({
                            "Sheet": title,
                            "Row": row_idx + 5,
                            "GDM No": gdm_no,
                            "Type": "To-Pay Mismatch",
                            "Sheet Value": sheet_to_pay,
                            "ERP Value": final_to_pay_sum,
                            "Status": "TO-PAY MISMATCH",
                            "Details": f"To-Pay sum in sheet ({sheet_to_pay}) does not match ERP dispatches (GST-inclusive: {actual_to_pay_sum}, Base: {base_to_pay_sum})"
                        })
                        
                    # Audit Unloading
                    if sheet_unloading > allowed_unloading_sum + 5.0 and allowed_unloading_sum > 0:
                        discrepancies_gdm.append({
                            "Sheet": title,
                            "Row": row_idx + 5,
                            "GDM No": gdm_no,
                            "Type": "Excess Unloading",
                            "Sheet Value": sheet_unloading,
                            "ERP Value": allowed_unloading_sum,
                            "Status": "EXCESS UNLOADING",
                            "Details": f"Entered unloading ({sheet_unloading}) exceeds allowed limit ({allowed_unloading_sum})"
                        })
                        
                elif gdm_no in gdm_lrs:
                    lrs_in_gdm = gdm_lrs[gdm_no]
                    
                    actual_to_pay_sum = 0.0
                    allowed_unloading_sum = 0.0
                    
                    rate_rows = cache["Rate"]
                    r_consignor_idx = None
                    r_consignee_idx = None
                    r_rate_idx = None
                    if rate_rows and len(rate_rows) > 0:
                        rate_headers = [h.strip() for h in rate_rows[0]]
                        rate_headers_upper = [h.upper() for h in rate_headers]
                        r_consignor_idx = next((i for i, h in enumerate(rate_headers_upper) if "CONSIGNOR" in h), None)
                        r_consignee_idx = next((i for i, h in enumerate(rate_headers_upper) if "CONSIGNEE" in h), None)
                        r_rate_idx = next((i for i, h in enumerate(rate_headers_upper) if "RATE" in h), None)
                        
                    for lr_no in lrs_in_gdm:
                        erp_info = None
                        if lr_no in bill_clear_db:
                            erp_info = bill_clear_db[lr_no]
                        elif lr_no in lr_db:
                            erp_info = lr_db[lr_no]
                            
                        if erp_info:
                            is_to_pay = False
                            if "topay" in erp_info:
                                is_to_pay = erp_info["topay"] > 0.0
                                freight_amt = erp_info["topay"]
                            else:
                                is_to_pay = erp_info["status"].upper() == "TO PAY" or "TO PAY" in erp_info["status"].upper()
                                freight_amt = erp_info["total_fright"]
                                
                            if is_to_pay:
                                actual_to_pay_sum += freight_amt
                                
                            if rate_rows and r_consignor_idx is not None and r_consignee_idx is not None and r_rate_idx is not None:
                                matched_rate = 0.0
                                erp_consignor = erp_info["consignor"].upper()
                                erp_consignee = erp_info["consignee"].upper()
                                
                                for rate_row in rate_rows[1:]:
                                    if len(rate_row) <= max(r_consignor_idx, r_consignee_idx, r_rate_idx):
                                        continue
                                    row_consignor = rate_row[r_consignor_idx].strip().upper()
                                    row_consignee = rate_row[r_consignee_idx].strip().upper()
                                    
                                    if row_consignor in erp_consignor and row_consignee in erp_consignee:
                                        try:
                                            matched_rate = float(rate_row[r_rate_idx].strip())
                                        except ValueError:
                                            matched_rate = 0.0
                                        break
                                allowed_unloading_sum += erp_info["box_qty"] * matched_rate
                                
                    actual_to_pay_sum_gst = round(actual_to_pay_sum * 1.18, 2)
                    final_to_pay_sum = actual_to_pay_sum_gst
                    if abs(sheet_to_pay - actual_to_pay_sum) <= 2.0 and abs(sheet_to_pay - actual_to_pay_sum_gst) > 2.0:
                        final_to_pay_sum = actual_to_pay_sum
                        
                    if abs(sheet_to_pay - final_to_pay_sum) > 5.0: 
                        discrepancies_gdm.append({
                            "Sheet": title,
                            "Row": row_idx + 5,
                            "GDM No": gdm_no,
                            "Type": "To-Pay Mismatch",
                            "Sheet Value": sheet_to_pay,
                            "ERP Value": final_to_pay_sum,
                            "Status": "TO-PAY MISMATCH",
                            "Details": f"To-Pay sum in sheet ({sheet_to_pay}) does not match ERP dispatches (GST-inclusive: {actual_to_pay_sum_gst}, Base: {actual_to_pay_sum})"
                        })
                        
                    if sheet_unloading > allowed_unloading_sum + 5.0 and allowed_unloading_sum > 0:
                        discrepancies_gdm.append({
                            "Sheet": title,
                            "Row": row_idx + 5,
                            "GDM No": gdm_no,
                            "Type": "Excess Unloading",
                            "Sheet Value": sheet_unloading,
                            "ERP Value": allowed_unloading_sum,
                            "Status": "EXCESS UNLOADING",
                            "Details": f"Entered unloading ({sheet_unloading}) exceeds allowed limit ({allowed_unloading_sum})"
                        })
                else:
                    discrepancies_gdm.append({
                        "Sheet": title,
                        "Row": row_idx + 5,
                        "GDM No": gdm_no,
                        "Type": "GDM Missing in ERP",
                        "Sheet Value": sheet_to_pay,
                        "ERP Value": "N/A",
                        "Status": "GDM NOT IN ERP",
                        "Details": f"GDM Number '{gdm_no}' was not found in the ERP dispatches report!"
                    })

    # 6. Generate Excel Audit Report
    report_file_name = f"Petty_Cash_Audit_Report_{datetime.now().strftime('%Y-%m-%d')}.xlsx"
    report_path = os.path.join(BASE_DIR, report_file_name)
    
    print(f"Generating audit report Excel at {report_path}...", flush=True)
    wb_out = openpyxl.Workbook()
    
    header_fill = PatternFill(start_color="1F497D", end_color="1F497D", fill_type="solid")
    header_font = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
    data_font = Font(name="Calibri", size=11)
    title_font = Font(name="Calibri", size=14, bold=True, color="1F497D")
    
    mismatch_fill = PatternFill(start_color="FCE4D6", end_color="FCE4D6", fill_type="solid") 
    missing_fill = PatternFill(start_color="FFF2CC", end_color="FFF2CC", fill_type="solid") 
    
    border_side = Side(style='thin', color='D9D9D9')
    cell_border = Border(left=border_side, right=border_side, top=border_side, bottom=border_side)
    
    # 6a. Overview Sheet
    ws_dash = wb_out.active
    ws_dash.title = "Overview Dashboard"
    ws_dash.views.sheetView[0].showGridLines = True
    
    ws_dash.append([])
    ws_dash.append(["PETTY CASH AUDITING SYSTEM - DAILY REPORT"])
    ws_dash.cell(2, 1).font = title_font
    ws_dash.append([f"Report Generated: {datetime.now().strftime('%Y-%m-%d %I:%M %p')}"])
    ws_dash.append([])
    
    # Add Branch Top-up Summary Table
    ws_dash.append(["Branch Fund Status & Top-up Summary"])
    ws_dash.cell(5, 1).font = Font(name="Calibri", size=12, bold=True)
    
    topup_headers = ["Branch Name", "Active Sheet", "Closing Balance", "Total Payments (Spent)", "Recommended Top-up"]
    ws_dash.append(topup_headers)
    for col in range(1, len(topup_headers) + 1):
        ws_dash.cell(6, col).fill = header_fill
        ws_dash.cell(6, col).font = header_font
        
    for b_name, stats in branch_topup_summary.items():
        active_title = stats.get("sheet_title", stats.get("status", ""))
        ws_dash.append([
            b_name,
            active_title,
            stats["closing_balance"],
            stats["total_payments"],
            stats["recommended_topup"]
        ])
        curr_row = ws_dash.max_row
        ws_dash.cell(curr_row, 3).number_format = '#,##0.00'
        ws_dash.cell(curr_row, 4).number_format = '#,##0.00'
        ws_dash.cell(curr_row, 5).number_format = '#,##0.00'
        # Highlight top-up required in red bold
        if stats["recommended_topup"] > 0:
            ws_dash.cell(curr_row, 5).font = Font(name="Calibri", size=11, bold=True, color="C00000")
            
    ws_dash.append([])
    
    ws_dash.append(["Summary of Discrepancies Found"])
    ws_dash.cell(ws_dash.max_row, 1).font = Font(name="Calibri", size=12, bold=True)
    
    ws_dash.append(["Category", "Number of Issues Found", "Status"])
    curr_header_row = ws_dash.max_row
    for col in range(1, 4):
        ws_dash.cell(curr_header_row, col).fill = header_fill
        ws_dash.cell(curr_header_row, col).font = header_font
        
    dash_stats = [
        ("Unbooked/Incorrect Branch Funding", len(discrepancies_funding), "Requires Review" if len(discrepancies_funding) > 0 else "Clear"),
        ("Paid LRs Mismatches/Missing", len(discrepancies_paid_lrs), "Requires Review" if len(discrepancies_paid_lrs) > 0 else "Clear"),
        ("GDM To-Pay/Unloading Mismatches", len(discrepancies_gdm), "Requires Review" if len(discrepancies_gdm) > 0 else "Clear"),
    ]
    
    for row_val in dash_stats:
        ws_dash.append(row_val)
        curr_row = ws_dash.max_row
        ws_dash.cell(curr_row, 1).font = data_font
        ws_dash.cell(curr_row, 2).font = data_font
        ws_dash.cell(curr_row, 3).font = Font(name="Calibri", size=11, bold=True)
        if row_val[1] > 0:
            ws_dash.cell(curr_row, 3).font = Font(name="Calibri", size=11, bold=True, color="FF0000")
            
    for col in ws_dash.columns:
        max_len = max(len(str(cell.value or '')) for cell in col)
        col_letter = openpyxl.utils.get_column_letter(col[0].column)
        ws_dash.column_dimensions[col_letter].width = max(max_len + 3, 12)

    # 6b. Funding Sheet
    ws_fund = wb_out.create_sheet("Branch Funding Audit")
    ws_fund.views.sheetView[0].showGridLines = True
    
    fund_headers = ["Date", "Branch Name", "Transfer Amount", "Status", "Details"]
    ws_fund.append(fund_headers)
    for col in range(1, len(fund_headers) + 1):
        ws_fund.cell(1, col).fill = header_fill
        ws_fund.cell(1, col).font = header_font
        
    for issue in discrepancies_funding:
        ws_fund.append([issue["Date"], issue["Branch"], issue["Transfer Amount"], issue["Status"], issue["Details"]])
        curr_row = ws_fund.max_row
        ws_fund.cell(curr_row, 3).number_format = '#,##0.00'
        fill = mismatch_fill if issue["Status"] == "UNBOOKED FUND" else missing_fill
        for c in range(1, len(fund_headers) + 1):
            ws_fund.cell(curr_row, c).fill = fill
            ws_fund.cell(curr_row, c).border = cell_border
            
    for col in ws_fund.columns:
        max_len = max(len(str(cell.value or '')) for cell in col)
        col_letter = openpyxl.utils.get_column_letter(col[0].column)
        ws_fund.column_dimensions[col_letter].width = max(max_len + 3, 12)

    # 6c. Paid LRs Sheet
    ws_paid = wb_out.create_sheet("Paid LRs Audit")
    ws_paid.views.sheetView[0].showGridLines = True
    
    paid_headers = ["Sheet Name", "Row No", "LR Number", "Date", "Sheet Amount", "ERP Actual Amount", "Status", "Details"]
    ws_paid.append(paid_headers)
    for col in range(1, len(paid_headers) + 1):
        ws_paid.cell(1, col).fill = header_fill
        ws_paid.cell(1, col).font = header_font
        
    for issue in discrepancies_paid_lrs:
        ws_paid.append([issue["Sheet"], issue["Row"], issue["LR No"], issue["Date"], issue["Sheet Lr Amount"], issue["ERP Actual Amount"], issue["Status"], issue["Details"]])
        curr_row = ws_paid.max_row
        ws_paid.cell(curr_row, 5).number_format = '#,##0.00'
        if isinstance(issue["ERP Actual Amount"], (int, float)):
            ws_paid.cell(curr_row, 6).number_format = '#,##0.00'
        fill = mismatch_fill if issue["Status"] == "AMOUNT MISMATCH" else missing_fill
        for c in range(1, len(paid_headers) + 1):
            ws_paid.cell(curr_row, c).fill = fill
            ws_paid.cell(curr_row, c).border = cell_border
            
    for col in ws_paid.columns:
        max_len = max(len(str(cell.value or '')) for cell in col)
        col_letter = openpyxl.utils.get_column_letter(col[0].column)
        ws_paid.column_dimensions[col_letter].width = max(max_len + 3, 12)

    # 6d. GDM Sheet
    ws_gdm = wb_out.create_sheet("GDMs Audit")
    ws_gdm.views.sheetView[0].showGridLines = True
    
    gdm_headers = ["Sheet Name", "Row No", "GDM Number", "Discrepancy Type", "Sheet Value", "ERP Value", "Status", "Details"]
    ws_gdm.append(gdm_headers)
    for col in range(1, len(gdm_headers) + 1):
        ws_gdm.cell(1, col).fill = header_fill
        ws_gdm.cell(1, col).font = header_font
        
    for issue in discrepancies_gdm:
        ws_gdm.append([issue["Sheet"], issue["Row"], issue["GDM No"], issue["Type"], issue["Sheet Value"], issue["ERP Value"], issue["Status"], issue["Details"]])
        curr_row = ws_gdm.max_row
        if isinstance(issue["Sheet Value"], (int, float)):
            ws_gdm.cell(curr_row, 5).number_format = '#,##0.00'
        if isinstance(issue["ERP Value"], (int, float)):
            ws_gdm.cell(curr_row, 6).number_format = '#,##0.00'
        fill = mismatch_fill if "MISMATCH" in issue["Status"] or "EXCESS" in issue["Status"] else missing_fill
        for c in range(1, len(gdm_headers) + 1):
            ws_gdm.cell(curr_row, c).fill = fill
            ws_gdm.cell(curr_row, c).border = cell_border
            
    for col in ws_gdm.columns:
        max_len = max(len(str(cell.value or '')) for cell in col)
        col_letter = openpyxl.utils.get_column_letter(col[0].column)
        ws_gdm.column_dimensions[col_letter].width = max(max_len + 3, 12)

    # Save Report
    wb_out.save(report_path)
    print(f"Excel report generated successfully at: {report_path}", flush=True)

    # 7. Print Terminal Summary
    print("\n" + "="*50, flush=True)
    print("RECONCILE SUMMARY:", flush=True)
    print(f" - Unbooked Funding Issues: {len(discrepancies_funding)}", flush=True)
    print(f" - Paid LRs Issues: {len(discrepancies_paid_lrs)}", flush=True)
    print(f" - GDM To-Pay/Unloading Issues: {len(discrepancies_gdm)}", flush=True)
    print("="*50 + "\n", flush=True)

    # 8. Send Email Report to Anwar and recipients list
    print("Preparing email report...", flush=True)
    
    # Compile recipients
    recipients = ["anwar@efflogistics.biz"]
    if RECEIVER_EMAIL:
        for r in RECEIVER_EMAIL.split(","):
            email_clean = r.strip()
            if email_clean and email_clean not in recipients:
                recipients.append(email_clean)
                
    if not SENDER_EMAIL or not SENDER_PASSWORD:
        print("Warning: SENDER_EMAIL or SENDER_PASSWORD environment variables not set. Skipping email dispatch.", flush=True)
        return
        
    msg = MIMEMultipart()
    msg["From"] = SENDER_EMAIL
    msg["To"] = ", ".join(recipients)
    msg["Subject"] = f"Daily Petty Cash Audit & Top-up Report - {datetime.now().strftime('%Y-%m-%d')}"
    
    # HTML Body
    html_body = f"""
    <html>
    <head>
        <style>
            body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
            h2 {{ color: #1F497D; border-bottom: 2px solid #1F497D; padding-bottom: 5px; }}
            table {{ border-collapse: collapse; width: 100%; margin-bottom: 20px; }}
            th, td {{ border: 1px solid #ddd; padding: 10px; text-align: left; }}
            th {{ background-color: #1F497D; color: white; }}
            tr:nth-child(even) {{ background-color: #f2f2f2; }}
            .highlight-red {{ color: #C00000; font-weight: bold; }}
            .card {{ background-color: #f9f9f9; border: 1px solid #e0e0e0; padding: 15px; border-radius: 5px; margin-bottom: 20px; }}
        </style>
    </head>
    <body>
        <h2>Daily Petty Cash Audit & Top-up Report</h2>
        <p>Hi Anwar,</p>
        <p>Please find the automated Petty Cash Audit and Branch Top-up report for today below. The complete detail worksheets are attached as an Excel report.</p>
        
        <h3>1. Branch Float & Top-up Summary</h3>
        <table>
            <thead>
                <tr>
                    <th>Branch Name</th>
                    <th>Active Sheet Name</th>
                    <th>Closing Balance (Rs)</th>
                    <th>Total Payments (Rs)</th>
                    <th>Recommended Top-up (Rs)</th>
                </tr>
            </thead>
            <tbody>
    """
    
    for b_name, stats in branch_topup_summary.items():
        active_title = stats.get("sheet_title", stats.get("status", ""))
        rec_top = stats["recommended_topup"]
        top_style = "class='highlight-red'" if rec_top > 0 else ""
        html_body += f"""
                <tr>
                    <td>{b_name}</td>
                    <td>{active_title}</td>
                    <td>{stats['closing_balance']:,.2f}</td>
                    <td>{stats['total_payments']:,.2f}</td>
                    <td {top_style}>{rec_top:,.2f}</td>
                </tr>
        """
        
    html_body += f"""
            </tbody>
        </table>
        
        <h3>2. Audit Mismatches Summary</h3>
        <div class="card">
            <ul>
                <li><strong>Unbooked/Incorrect Branch Funding (Purchase Register MAIN vs Branch Sheets):</strong> {len(discrepancies_funding)} issues</li>
                <li><strong>Paid LRs Amount/Status Mismatches (ERP vs Branch Sheets):</strong> {len(discrepancies_paid_lrs)} issues</li>
                <li><strong>GDM To-Pay and Unloading Mismatches (ERP vs Branch Sheets):</strong> {len(discrepancies_gdm)} issues</li>
            </ul>
        </div>
        
        <p>Regards,<br><strong>EFF Logistics Auto-Scheduler</strong></p>
    </body>
    </html>
    """
    
    msg.attach(MIMEText(html_body, "html"))
    
    # Attach Excel file
    try:
        with open(report_path, "rb") as attachment:
            part = MIMEBase("application", "octet-stream")
            part.set_payload(attachment.read())
            encode_base64(part)
            part.add_header(
                "Content-Disposition",
                f"attachment; filename= {report_file_name}",
            )
            msg.attach(part)
            print(f"Attached report to email: {report_file_name}", flush=True)
    except Exception as att_err:
        print(f"Error attaching file: {att_err}", flush=True)
        
    # Send via SMTP
    try:
        print(f"Connecting to SMTP to send email to {', '.join(recipients)}...", flush=True)
        server = smtplib.SMTP("smtp.gmail.com", 587)
        server.starttls()
        server.login(SENDER_EMAIL, SENDER_PASSWORD)
        server.send_message(msg)
        server.quit()
        print("🎉 Daily report email sent successfully!", flush=True)
    except Exception as mail_err:
        print(f"❌ Error sending email: {mail_err}", flush=True)

if __name__ == "__main__":
    main()
