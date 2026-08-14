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
        print(f"Navigating to login: {login_url}")
        page.goto(login_url)
        page.wait_for_load_state("load")
        
        page.fill("#login_user_id", ERP_USERNAME)
        page.fill("#login_password", ERP_PASSWORD)
        
        # Click login button
        page.locator("button[type='submit']").click()
        page.wait_for_timeout(3000)
        
        print("Logged in. Current URL:", page.url)
        
        # 2. Go to bill_clear
        bill_clear_url = "https://eff.aadhocc.in/eff_2021/main/bill_clear/"
        print(f"Navigating to: {bill_clear_url}")
        page.goto(bill_clear_url)
        page.wait_for_load_state("load")
        page.wait_for_timeout(4000)
        
        print("Arrived at bill_clear. Current URL:", page.url)
        
        # Save screenshot
        ss_path = "./bill_clear_screenshot.png"
        page.screenshot(path=ss_path)
        print(f"Screenshot saved to: {ss_path}")
        
        # Print form inputs and tables found on page
        print("\nForm inputs found on bill_clear:")
        inputs = page.locator("input, select").all()
        for idx, el in enumerate(inputs):
            name = el.get_attribute("name") or ""
            id_val = el.get_attribute("id") or ""
            placeholder = el.get_attribute("placeholder") or ""
            type_val = el.get_attribute("type") or ""
            print(f"  [{idx}] Type: {type_val}, Name: {name}, ID: {id_val}, Placeholder: {placeholder}")
            
        print("\nButtons / Links found on bill_clear:")
        buttons = page.locator("button, a").all()
        for idx, el in enumerate(buttons):
            text = el.inner_text().strip()
            class_val = el.get_attribute("class") or ""
            id_val = el.get_attribute("id") or ""
            href = el.get_attribute("href") or ""
            if text or id_val or "export" in class_val or "excel" in class_val:
                print(f"  [{idx}] Text: '{text}', ID: {id_val}, Class: {class_val}, Href: {href}")
                
        browser.close()

if __name__ == "__main__":
    main()
