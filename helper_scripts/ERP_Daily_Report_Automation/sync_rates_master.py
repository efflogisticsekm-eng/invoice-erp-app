#!/usr/bin/env python3
import os
import sys
import time
import pandas as pd

# Add local path to import libraries correctly when sandboxed
sys.path.append("/Users/anwar/Library/Python/3.9/lib/python/site-packages")
import gspread
from google.oauth2.service_account import Credentials

def sync_excel_to_google_sheet():
    excel_path = "../../EFF PARCEL FREIGHT WORKING/All Consignors - RATES Combined.xlsx"
    creds_path = "../../ERP nxt Data collection/Invoice_Extractor_Tool/credentials.json"
    
    # We will find the spreadsheet by title (the active dashboard sheet)
    sheet_title = "Topay & Paid Parcel Billing"
    
    if not os.path.exists(excel_path):
        print(f"Error: Excel Master Rates not found at: {excel_path}")
        sys.exit(1)
        
    if not os.path.exists(creds_path):
        print(f"Error: Google Credentials file not found at: {creds_path}")
        sys.exit(1)

    print(f"Reading local Excel sheets from: {excel_path}...")
    xl = pd.ExcelFile(excel_path)
    sheet_names = xl.sheet_names
    print(f"Found sheets in Excel: {sheet_names}")

    scopes = ["https://www.googleapis.com/auth/spreadsheets", "https://www.googleapis.com/auth/drive"]
    creds = Credentials.from_service_account_file(creds_path, scopes=scopes)
    client = gspread.authorize(creds)
    
    print(f"Opening Google Spreadsheet '{sheet_title}'...")
    try:
        sh = client.open(sheet_title)
    except Exception as e:
        print(f"Error: Could not open Google Sheet '{sheet_title}'. Verify sharing settings. Details: {e}")
        sys.exit(1)
        
    for name in sheet_names:
        print(f"Syncing sheet '{name}' to Google Sheets...")
        df = xl.parse(name)
        # Handle nan values
        df = df.fillna("")
        
        # Format values to string for upload compatibility
        data_to_upload = [df.columns.tolist()] + df.values.tolist()
        
        # Check if worksheet exists, if not create it
        try:
            ws = sh.worksheet(name)
            ws.clear()
        except gspread.exceptions.WorksheetNotFound:
            ws = sh.add_worksheet(title=name, rows="1000", cols="26")
            
        # Update worksheet
        ws.update("A1", data_to_upload)
        print(f"Successfully updated worksheet: '{name}'")
        time.sleep(2)
        
    print("\n✅ Rate Master sync complete! All rates are now live on Google Sheets.")

if __name__ == "__main__":
    sync_excel_to_google_sheet()
