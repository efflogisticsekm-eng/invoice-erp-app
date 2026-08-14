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
        
        # 2. Search for GDM 35530 on effdespatch page
        despatch_url = "https://eff.aadhocc.in/eff_2021/main/effdespatch?despatch_number=35530&location_id=&lr_number=&from_date=&to_date=&delivery_staff_search="
        print(f"Navigating to GDM search: {despatch_url}")
        page.goto(despatch_url)
        page.wait_for_load_state("load")
        page.wait_for_timeout(4000)
        
        # Save screenshot
        page.screenshot(path="./effdespatch_search_35530.png")
        print("Saved search screenshot to effdespatch_search_35530.png")
        
        # Print table HTML links
        print("\nLinks in search results table:")
        links = page.locator("table tbody a").all()
        for idx, lnk in enumerate(links):
            text = lnk.inner_text().strip()
            href = lnk.get_attribute("href") or ""
            id_val = lnk.get_attribute("id") or ""
            class_val = lnk.get_attribute("class") or ""
            print(f"  [{idx}] Text: '{text}', ID: {id_val}, Class: {class_val}, Href: {href}")
            
        browser.close()

if __name__ == "__main__":
    main()
