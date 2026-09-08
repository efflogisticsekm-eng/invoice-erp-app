import os
import sys
import gspread
from google.oauth2.service_account import Credentials
import pandas as pd
import json

def test_fetch():
    creds_path = "/Users/anwar/Desktop/Antigravity-Related/Apps_and_Dashboards/invoice-erp-app/ERP nxt Data collection/Invoice_Extractor_Tool/credentials.json"
    scopes = ["https://www.googleapis.com/auth/spreadsheets", "https://www.googleapis.com/auth/drive"]
    
    google_creds_env = os.getenv("GOOGLE_CREDENTIALS_JSON")
    if google_creds_env:
        creds_dict = json.loads(google_creds_env)
        creds = Credentials.from_service_account_info(creds_dict, scopes=scopes)
    else:
        creds = Credentials.from_service_account_file(creds_path, scopes=scopes)
    
    client = gspread.authorize(creds)
    
    # Audit Data Sheet ID
    sheet_id = "1kZYGIOJxMRn-TOhDs7Q3rEfkNPpXbGsNDcGAphL5kWQ"
    print(f"Connecting to sheet ID: {sheet_id}...")
    sh = client.open_by_key(sheet_id)
    
    tabs_to_fetch = ["All LR", "LR Data", "Despatch Data", "All Data"]
    
    for tab in tabs_to_fetch:
        try:
            ws = sh.worksheet(tab)
            data = ws.get_all_values() # use get_all_values to avoid dict issues with duplicate headers
            if data:
                df = pd.DataFrame(data[1:], columns=data[0])
                print(f"✅ Fetched {len(df)} rows from '{tab}'")
            else:
                print(f"⚠️ '{tab}' is empty")
        except Exception as e:
            print(f"❌ Error fetching '{tab}': {e}")

if __name__ == "__main__":
    test_fetch()
