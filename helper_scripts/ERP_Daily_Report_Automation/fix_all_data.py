import gspread
from oauth2client.service_account import ServiceAccountCredentials
import pandas as pd

def fix_all_data():
    scope = ["https://spreadsheets.google.com/feeds", "https://www.googleapis.com/auth/drive"]
    creds_path = "../../ERP nxt Data collection/Invoice_Extractor_Tool/credentials.json"
    creds = ServiceAccountCredentials.from_json_keyfile_name(creds_path, scope)
    client = gspread.authorize(creds)
    
    sh = client.open("Topay & Paid Parcel Billing")
    tabs = ["All Data", "Topay", "Paid", "Reconciled Audit", "Despatch Data", "LR Data"]
    for tab in tabs:
        try:
            ws = sh.worksheet(tab)
            data = ws.get_all_values()
            if not data: continue
            df = pd.DataFrame(data[1:], columns=data[0])
            initial_len = len(df)
            
            # Find date column
            date_cols = [c for c in df.columns if 'DATE' in c.upper()]
            if not date_cols:
                continue
            date_col = date_cols[0]
            
            df = df[~df[date_col].isin(["28/08/26", "28/08/2026", "28-08-2026", "2026-08-28"])]
            final_len = len(df)
            
            print(f"Removed {initial_len - final_len} rows from 28/08/2026 in '{tab}'.")
            if initial_len != final_len:
                ws.clear()
                ws.update([df.columns.values.tolist()] + df.values.tolist())
                print(f"Updated '{tab}'.")
        except Exception as e:
            print(f"Error on {tab}: {e}")

    print("Done!")
    
    print("Cleanup Complete!")

if __name__ == "__main__":
    fix_all_data()
