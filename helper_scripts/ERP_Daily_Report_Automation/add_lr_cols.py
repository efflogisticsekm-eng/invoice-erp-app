import gspread
from oauth2client.service_account import ServiceAccountCredentials
import pandas as pd

scope = ["https://spreadsheets.google.com/feeds", "https://www.googleapis.com/auth/drive"]
creds_path = "/Users/anwar/Antigravity-Related/ERP nxt Data collection/Invoice_Extractor_Tool/credentials.json"
creds = ServiceAccountCredentials.from_json_keyfile_name(creds_path, scope)
client = gspread.authorize(creds)
sh = client.open("Topay & Paid Parcel Billing")
ws = sh.worksheet("LR Data")

# 1. Add headers
ws.update('R1:S1', [['In All Data', 'In Despatch Data']], value_input_option='USER_ENTERED')

# 2. Add ArrayFormulas to R2 and S2
f_all_data = '=ARRAYFORMULA(IF(E2:E="", "", IF(ISNA(MATCH(E2:E, \'All Data\'!D:D, 0)), "No", "Yes")))'
f_despatch = '=ARRAYFORMULA(IF(E2:E="", "", IF(ISNA(MATCH(E2:E, \'Despatch Data\'!E:E, 0)), "No", "Yes")))'
ws.update('R2:S2', [[f_all_data, f_despatch]], value_input_option='USER_ENTERED')

print("Formulas added.")

# 3. Add Conditional Formatting via batchUpdate
sheet_id = ws.id

requests = [
    # Clear existing conditional formatting on columns R and S to prevent duplicates
    {
        "deleteConditionalFormatRule": {
            "index": 0,
            "sheetId": sheet_id
        }
    }
]

# Note: We can't easily delete all existing rules without knowing how many there are, 
# so we will just append our new rule to index 0 (highest priority)

rule_all_data = {
    "addConditionalFormatRule": {
        "rule": {
            "ranges": [
                {
                    "sheetId": sheet_id,
                    "startRowIndex": 1, # Row 2 (0-indexed)
                    "startColumnIndex": 17, # Col R (17)
                    "endColumnIndex": 18 # Col R
                }
            ],
            "booleanRule": {
                "condition": {
                    "type": "CUSTOM_FORMULA",
                    "values": [
                        {
                            "userEnteredValue": '=AND(R2="No", ISERR(SEARCH("EFF", $B2)), ISERR(SEARCH("CANCEL", UPPER($F2))))'
                        }
                    ]
                },
                "format": {
                    "backgroundColor": {
                        "red": 1.0,
                        "green": 0.8,
                        "blue": 0.8
                    },
                    "textFormat": {
                        "foregroundColor": {
                            "red": 0.8,
                            "green": 0.0,
                            "blue": 0.0
                        },
                        "bold": True
                    }
                }
            }
        },
        "index": 0
    }
}

rule_despatch_data = {
    "addConditionalFormatRule": {
        "rule": {
            "ranges": [
                {
                    "sheetId": sheet_id,
                    "startRowIndex": 1, # Row 2
                    "startColumnIndex": 18, # Col S (18)
                    "endColumnIndex": 19 # Col S
                }
            ],
            "booleanRule": {
                "condition": {
                    "type": "CUSTOM_FORMULA",
                    "values": [
                        {
                            "userEnteredValue": '=AND(S2="No", ISERR(SEARCH("EFF", $B2)), ISERR(SEARCH("CANCEL", UPPER($F2))))'
                        }
                    ]
                },
                "format": {
                    "backgroundColor": {
                        "red": 1.0,
                        "green": 0.8,
                        "blue": 0.8
                    },
                    "textFormat": {
                        "foregroundColor": {
                            "red": 0.8,
                            "green": 0.0,
                            "blue": 0.0
                        },
                        "bold": True
                    }
                }
            }
        },
        "index": 0
    }
}

sh.batch_update({"requests": [rule_all_data, rule_despatch_data]})
print("Conditional formatting added.")
