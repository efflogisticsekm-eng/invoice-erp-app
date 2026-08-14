import os
import sys
from playwright.sync_api import sync_playwright

def main():
    ERP_USERNAME = os.getenv("ERP_USERNAME")
    ERP_PASSWORD = os.getenv("ERP_PASSWORD")
    
    if not ERP_USERNAME or not ERP_PASSWORD:
        print("Error: ERP_USERNAME or ERP_PASSWORD not set in environment!")
        sys.exit(1)

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
        
        # 3. Print consignor options
        print("Consignor Options:")
        options = page.locator("#consignor_id option").all()
        for idx, opt in enumerate(options):
            val = opt.get_attribute("value") or ""
            text = opt.inner_text().strip()
            print(f"  [{idx}] Value: '{val}', Text: '{text}'")
            
        browser.close()

if __name__ == "__main__":
    main()
