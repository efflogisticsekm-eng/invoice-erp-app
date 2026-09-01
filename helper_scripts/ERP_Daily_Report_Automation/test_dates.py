import gspread
from oauth2client.service_account import ServiceAccountCredentials
import pandas as pd

scope = ["https://spreadsheets.google.com/feeds", "https://www.googleapis.com/auth/drive"]
creds_path = "../../ERP nxt Data collection/Invoice_Extractor_Tool/credentials.json"
creds = ServiceAccountCredentials.from_json_keyfile_name(creds_path, scope)
client = gspread.authorize(creds)
sh = client.open("Topay & Paid Parcel Billing")
ws = sh.worksheet("All Data")
data = ws.get_all_values()
df = pd.DataFrame(data[1:], columns=data[0])
date_col = next(c for c in df.columns if 'DATE' in c.upper())
print("Unique dates from All Data last 500 rows:")
print(df[date_col].tail(500).unique())
