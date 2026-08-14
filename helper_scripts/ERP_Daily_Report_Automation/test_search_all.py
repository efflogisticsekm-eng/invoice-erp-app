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

    # Use a date range covering the last 60 days
    ist_tz = timezone(timedelta(hours=5, minutes=30))
    now_ist = datetime.now(ist_tz)
    from_date = (now_ist - timedelta(days=60)).strftime("%d-%m-%Y")
    to_date = now_ist.strftime("%d-%m-%Y")

    print(f"Testing search for all consignors from {from_date} to {to_date}")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()
        
        # 1. Login
        login_url = "https://eff.aadhocc.in/eff_2021/login"
        page.goto(login_url)
        page.wait_for_load_state("load")
        
        page.fill("#login_user_id", ERP_USERNAME)
        page.fill("#login_password", ERP_PASSWORD)
        page.locator("button[type='submit']").click()
        page.wait_for_timeout(3000)
        
        # 2. Go to bill_clear
        bill_clear_url = "https://eff.aadhocc.in/eff_2021/main/bill_clear/"
        page.goto(bill_clear_url)
        page.wait_for_load_state("load")
        page.wait_for_timeout(3000)
        
        # 3. Fill in Dates
        page.fill("#fromDate", from_date)
        page.fill("#toDate", to_date)
        page.wait_for_timeout(1000)
        
        # 4. Click Search first
        print("Clicking Search button...")
        # There are two inputs with ID 'search', let's click the search button specifically
        search_btn = page.locator("input[type='submit'][name='search']").first
        search_btn.click()
        page.wait_for_timeout(5000) # Wait for table to load
        
        # Print table row count if present
        rows_count = page.locator("table tbody tr").count()
        print(f"Table rows found: {rows_count}")
        
        # Save screenshot of the search results
        page.screenshot(path="./bill_clear_search_results.png")
        print("Saved search results screenshot to bill_clear_search_results.png")
        
        # 5. Try downloading Excel
        print("Clicking Excel export button...")
        excel_btn = page.locator("#excel_new")
        try:
            with page.expect_download(timeout=60000) as download_info:
                excel_btn.click(no_wait_after=True)
            download = download_info.value
            download_path = "./bill_clear_all_populated.xlsx"
            download.save_as(download_path)
            print("Download successful! File saved to:", download_path)
        except Exception as e:
            print("Download failed or timed out:", e)
            
        browser.close()

if __name__ == "__main__":
    main()
