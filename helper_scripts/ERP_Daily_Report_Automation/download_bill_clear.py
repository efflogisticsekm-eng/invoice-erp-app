import os
import sys
from datetime import datetime, timedelta, timezone
from playwright.sync_api import sync_playwright

def main():
    ERP_USERNAME = os.getenv("ERP_USERNAME")
    ERP_PASSWORD = os.getenv("ERP_PASSWORD")
    
    if not ERP_USERNAME or not ERP_PASSWORD:
        print("Error: ERP_USERNAME or ERP_PASSWORD not set in environment!")
        sys.exit(1)

    # Use a date range covering the last 60 days to match the branch sheets
    ist_tz = timezone(timedelta(hours=5, minutes=30))
    now_ist = datetime.now(ist_tz)
    from_date = (now_ist - timedelta(days=60)).strftime("%d-%m-%Y")
    to_date = now_ist.strftime("%d-%m-%Y")

    print(f"Target date range for bill_clear: {from_date} to {to_date}")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()
        
        # 1. Login
        login_url = "https://eff.aadhocc.in/eff_2021/login"
        print(f"Navigating to login: {login_url}")
        page.goto(login_url)
        page.wait_for_load_state("load")
        
        page.fill("#login_user_id", ERP_USERNAME)
        page.fill("#login_password", ERP_PASSWORD)
        
        page.locator("button[type='submit']").click()
        page.wait_for_timeout(3000)
        
        print("Logged in. Current URL:", page.url)
        
        # 2. Go to bill_clear
        bill_clear_url = "https://eff.aadhocc.in/eff_2021/main/bill_clear/"
        print(f"Navigating to: {bill_clear_url}")
        page.goto(bill_clear_url)
        page.wait_for_load_state("load")
        page.wait_for_timeout(3000)
        
        # 3. Fill in Dates
        print(f"Filling From Date={from_date}, To Date={to_date}")
        page.fill("#fromDate", from_date)
        page.fill("#toDate", to_date)
        page.wait_for_timeout(1000)
        
        # 4. Trigger Download by clicking Excel button (ID: excel_new)
        print("Clicking Excel export button...")
        excel_btn = page.locator("#excel_new")
        
        try:
            with page.expect_download(timeout=60000) as download_info:
                excel_btn.click(no_wait_after=True)
            download = download_info.value
            download_path = "./bill_clear_raw.xlsx"
            download.save_as(download_path)
            print("Download successful! File saved to:", download_path)
        except Exception as e:
            print("Download failed or timed out:", e)
            # Take screenshot on failure
            page.screenshot(path="./bill_clear_fail.png")
            print("Saved failure screenshot to bill_clear_fail.png")
            
        browser.close()

if __name__ == "__main__":
    main()
