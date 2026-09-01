import gspread
from oauth2client.service_account import ServiceAccountCredentials
import pandas as pd

scope = ["https://spreadsheets.google.com/feeds", "https://www.googleapis.com/auth/drive"]
creds_path = "../../ERP nxt Data collection/Invoice_Extractor_Tool/credentials.json"
creds = ServiceAccountCredentials.from_json_keyfile_name(creds_path, scope)
client = gspread.authorize(creds)
sh = client.open("Topay & Paid Parcel Billing")
ws = sh.worksheet("LR Data")
data = ws.get_all_values()
df = pd.DataFrame(data[1:], columns=data[0])

print("Unique LR STATUS:")
print(df['LR STATUS'].unique())

eff_consignors = df[df['CONSIGNOR'].str.contains('EFF', case=False, na=False)]['CONSIGNOR'].unique()
print("EFF Consignors:")
print(eff_consignors)
