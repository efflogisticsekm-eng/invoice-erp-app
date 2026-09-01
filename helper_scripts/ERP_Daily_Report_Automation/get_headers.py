import gspread
from oauth2client.service_account import ServiceAccountCredentials

scope = ["https://spreadsheets.google.com/feeds", "https://www.googleapis.com/auth/drive"]
creds_path = "../../ERP nxt Data collection/Invoice_Extractor_Tool/credentials.json"
creds = ServiceAccountCredentials.from_json_keyfile_name(creds_path, scope)
client = gspread.authorize(creds)
sh = client.open("Topay & Paid Parcel Billing")

for tab in ["LR Data", "All Data", "Despatch Data"]:
    ws = sh.worksheet(tab)
    print(f"--- {tab} Headers ---")
    headers = ws.row_values(1)
    for i, h in enumerate(headers):
        print(f"Col {i+1} ({chr(65+i) if i < 26 else chr(64+(i//26)) + chr(65+(i%26))}): {h}")
