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
        
        # 2. Navigate to GDM 35530 view page
        gdm_url = "https://eff.aadhocc.in/eff_2021/main/effdespatch/view/35530"
        print(f"Navigating to GDM print view: {gdm_url}")
        page.goto(gdm_url)
        page.wait_for_load_state("load")
        page.wait_for_timeout(4000)
        
        # Save screenshot
        page.screenshot(path="./gdm_35530_view.png")
        print("Saved GDM print view screenshot to gdm_35530_view.png")
        
        # Parse tables on the page
        tables = page.locator("table").all()
        print(f"Number of tables found: {len(tables)}")
        
        for t_idx, table in enumerate(tables):
            print(f"\n--- Table {t_idx} ---")
            rows = table.locator("tr").all()
            for r_idx, row in enumerate(rows):
                cols = row.locator("td, th").all()
                col_texts = [c.inner_text().strip() for c in cols]
                print(f"  Row [{r_idx}]: {col_texts}")
                
        browser.close()

if __name__ == "__main__":
    main()
