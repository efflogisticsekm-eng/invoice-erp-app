import gspread
import os
import json
from datetime import datetime, timedelta, timezone

def trim_sheet(client, sheet_name, tab_name, date_col_name, cutoff_date):
    try:
        sh = client.open(sheet_name)
        ws = sh.worksheet(tab_name)
        all_data = ws.get_all_values()
        if not all_data or len(all_data) < 2:
            return
            
        headers = all_data[0]
        headers_upper = [h.strip().upper() for h in headers]
        target_col = date_col_name.strip().upper()
        
        if target_col in headers_upper:
            col_idx = headers_upper.index(target_col)
            
            new_rows = [headers]
            trimmed_count = 0
            
            for row in all_data[1:]:
                if len(row) > col_idx:
                    date_str = row[col_idx]
                    try:
                        import pandas as pd
                        row_date = pd.to_datetime(date_str, format="%Y-%m-%d")
                        if row_date >= pd.Timestamp(cutoff_date):
                            new_rows.append(row)
                        else:
                            trimmed_count += 1
                    except Exception:
                        new_rows.append(row)
                else:
                    new_rows.append(row)
            
            if trimmed_count > 0:
                print(f"Trimming {trimmed_count} old rows from '{tab_name}'...")
                ws.clear()
                # Update in chunks
                chunk_size = 5000
                for i in range(0, len(new_rows), chunk_size):
                    chunk = new_rows[i:i+chunk_size]
                    start_row = i + 1
                    ws.update(range_name=f"A{start_row}", values=chunk)
                print(f"✅ Successfully trimmed '{tab_name}'.")
            else:
                print(f"No old rows to trim in '{tab_name}'.")
        else:
            print(f"⚠️ Column '{date_col_name}' not found in '{tab_name}'.")
    except Exception as e:
        print(f"Error trimming '{tab_name}': {e}")

def main():
    creds_path = "ERP nxt Data collection/Invoice_Extractor_Tool/credentials.json"
    scopes = ["https://www.googleapis.com/auth/spreadsheets", "https://www.googleapis.com/auth/drive"]
    google_creds_env = os.getenv("GOOGLE_CREDENTIALS_JSON")
    
    if google_creds_env:
        creds_dict = json.loads(google_creds_env)
        from google.oauth2.service_account import Credentials
        creds = Credentials.from_service_account_info(creds_dict, scopes=scopes)
    elif os.path.exists(creds_path):
        from google.oauth2.service_account import Credentials
        creds = Credentials.from_service_account_file(creds_path, scopes=scopes)
    else:
        print("No credentials found!")
        return

    client = gspread.authorize(creds)
    
    ist = timezone(timedelta(hours=5, minutes=30))
    today = datetime.now(ist)
    cutoff_date = today - timedelta(days=52)
    cutoff_date = cutoff_date.replace(hour=0, minute=0, second=0, microsecond=0)
    print(f"Cutoff Date for trimming: {cutoff_date.strftime('%Y-%m-%d')}")
    
    # Trim appended sheets (All Data, Topay, Paid, Reconciled Audit)
    trim_sheet(client, "Topay & Paid Parcel Billing", "All Data", "Date", cutoff_date)
    trim_sheet(client, "Topay & Paid Parcel Billing", "Topay", "Date", cutoff_date)
    trim_sheet(client, "Topay & Paid Parcel Billing", "Paid", "Date", cutoff_date)
    trim_sheet(client, "Topay & Paid Parcel Billing", "Reconciled Audit", "Date", cutoff_date)

if __name__ == "__main__":
    main()
