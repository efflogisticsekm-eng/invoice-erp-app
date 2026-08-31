import gspread
from oauth2client.service_account import ServiceAccountCredentials
import pandas as pd

scope = ["https://spreadsheets.google.com/feeds", "https://www.googleapis.com/auth/drive"]
creds_path = "/Users/anwar/Antigravity-Related/ERP nxt Data collection/Invoice_Extractor_Tool/credentials.json"
creds = ServiceAccountCredentials.from_json_keyfile_name(creds_path, scope)
client = gspread.authorize(creds)
sh = client.open("Topay & Paid Parcel Billing")

for tab in ["LR Data", "Despatch Data"]:
    print(f"Sorting {tab}...")
    ws = sh.worksheet(tab)
    data = ws.get_all_values()
    if len(data) < 2:
        continue
    
    headers = data[0]
    df = pd.DataFrame(data[1:], columns=headers)
    
    date_cols = [c for c in df.columns if 'DATE' in c.upper()]
    if date_cols:
        date_col = date_cols[0]
        # Parse date and sort
        df['_parsed_date'] = pd.to_datetime(df[date_col], dayfirst=True, errors='coerce')
        df = df.sort_values(by='_parsed_date', ascending=True, na_position='first')
        df = df.drop(columns=['_parsed_date'])
        
        # Clear and update
        ws.clear()
        ws.update([headers] + df.values.tolist(), value_input_option='USER_ENTERED')
        print(f"✅ {tab} sorted by {date_col}.")
    else:
        print(f"No date column found in {tab}.")

print("Finished sorting sheets.")
