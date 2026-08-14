import os
import sys
import requests
from bs4 import BeautifulSoup
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
        
        # Get cookies
        playwright_cookies = context.cookies()
        session = requests.Session()
        for cookie in playwright_cookies:
            session.cookies.set(cookie['name'], cookie['value'], domain=cookie['domain'])
            
        browser.close()

    # 2. Fetch GDM 35530 print HTML using requests
    gdm_url = "https://eff.aadhocc.in/eff_2021/main/effdespatch/view/35530"
    print(f"Fetching GDM print page via requests: {gdm_url}")
    res = session.get(gdm_url)
    if res.status_code != 200:
        print(f"Error: status code {res.status_code}")
        return
        
    soup = BeautifulSoup(res.text, "html.parser")
    
    # Let's find the table and print its rows
    table = soup.find("table")
    if not table:
        print("Error: No table found on the GDM view page!")
        return
        
    print("\nParsed GDM 35530 Table Rows:")
    rows = table.find_all("tr")
    for idx, row in enumerate(rows):
        cols = [td.get_text(strip=True) for td in row.find_all(["td", "th"])]
        print(f"  Row [{idx}]: {cols}")

if __name__ == "__main__":
    main()
