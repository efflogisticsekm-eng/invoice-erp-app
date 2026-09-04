import gspread
import os
import json
from oauth2client.service_account import ServiceAccountCredentials

def sort_sheet(client, sheet_name, tab_name, date_col_name):
    try:
        sh = client.open(sheet_name)
        ws = sh.worksheet(tab_name)
        headers = ws.row_values(1)
        headers_upper = [h.strip().upper() for h in headers]
        
        target_col = date_col_name.strip().upper()
        if target_col in headers_upper:
            col_idx = headers_upper.index(target_col) + 1  # 1-indexed for gspread
            print(f"Sorting '{tab_name}' by '{target_col}' (Column {col_idx})...")
            
            # gspread sort takes range or defaults to entire sheet.
            # But we want to preserve header row!
            # The API allows sorting a specific range. We sort from A2:Z
            # Get max rows and cols
            max_rows = ws.row_count
            max_cols = ws.col_count
            from gspread.utils import rowcol_to_a1
            end_cell = rowcol_to_a1(max_rows, max_cols)
            sort_range = f"A2:{end_cell}"
            
            # Use batch_update to sort the range
            sheet_id = ws.id
            body = {
                "requests": [
                    {
                        "sortRange": {
                            "range": {
                                "sheetId": sheet_id,
                                "startRowIndex": 1,  # 0-indexed, skips header
                                "endRowIndex": max_rows,
                                "startColumnIndex": 0,
                                "endColumnIndex": max_cols
                            },
                            "sortSpecs": [
                                {
                                    "dimensionIndex": col_idx - 1, # 0-indexed
                                    "sortOrder": "ASCENDING"
                                }
                            ]
                        }
                    }
                ]
            }
            sh.batch_update(body)
            print(f"✅ Successfully sorted '{tab_name}'")
        else:
            print(f"⚠️ Column '{date_col_name}' not found in '{tab_name}'.")
    except Exception as e:
        print(f"Error sorting '{tab_name}': {e}")

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
    
    # Sort All Data and LR Data by Date
    sort_sheet(client, "Topay & Paid Parcel Billing", "LR Data", "Date")
    sort_sheet(client, "Topay & Paid Parcel Billing", "All Data", "Date")
    sort_sheet(client, "Topay & Paid Parcel Billing", "Topay", "Date")
    sort_sheet(client, "Topay & Paid Parcel Billing", "Paid", "Date")

if __name__ == "__main__":
    main()
