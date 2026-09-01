import os
import sys
import subprocess
from datetime import datetime, timedelta

# Dynamically find workspace path
script_dir = os.path.dirname(os.path.abspath(__file__))
workspace_dir = os.path.abspath(os.path.join(script_dir, "..", ".."))
sys.path.append(script_dir)

# Import scraper and calculator components
from download_and_email_diesel import download_transactions, process_data, generate_excel_report, generate_email_body_html

def send_via_applescript(recipients, subject, html_body, attachment_path):
    print("Preparing AppleScript command for Mail.app...")
    escaped_html = html_body.replace('"', '\\"').replace('\n', ' ')
    
    recipient_lines = ""
    for r in recipients:
        recipient_lines += f'            make new to recipient with properties {{address:"{r}"}}\n'
        
    script = f'''
    tell application "Mail"
        set newMessage to make new outgoing message with properties {{subject:"{subject}", visible:false}}
        tell newMessage
{recipient_lines}
            set html content to "{escaped_html}"
            make new attachment with properties {{file name:POSIX file "{attachment_path}"}} at after the last paragraph
            send
        end tell
    end tell
    '''
    
    process = subprocess.run(['osascript', '-e', script], capture_output=True, text=True)
    if process.returncode == 0:
        print("🎉 Email successfully sent via macOS Mail.app!")
    else:
        print(f"❌ Failed to send email via Mail.app: {process.stderr}")
        raise RuntimeError(process.stderr)

async def main_orchestrator():
    # Targets yesterday's transactions
    target_date = datetime.now() - timedelta(days=1)
    date_str = target_date.strftime("%Y-%m-%d")
    print(f"Target execution date: {date_str}")
    
    temp_dir = os.path.join(workspace_dir, "temp_reports")
    os.makedirs(temp_dir, exist_ok=True)
    
    # 1. Download statements via Playwright (from your local connection)
    username = "EFFLOGISKRL"
    password = "Eff@2026Logis"
    
    print("Starting local Playwright download flow...")
    try:
        raw_csv_path = await download_transactions(username, password, temp_dir)
    except Exception as e:
        print(f"❌ Scraper failed: {e}")
        return
        
    # 2. Process data and generate sheets
    print(f"Processing downloaded transactions from: {raw_csv_path}...")
    processed_df = process_data(raw_csv_path, target_date)
    
    # Generate Monthly Excel Report
    excel_filename = f"IOC_Diesel_Monthly_Grid_{target_date.strftime('%Y_%m')}.xlsx"
    excel_path = os.path.join(temp_dir, excel_filename)
    print(f"Generating monthly grid Excel report: {excel_path}...")
    generate_excel_report(processed_df, target_date, excel_path)
    
    # 3. Generate HTML body and send
    print("Generating Email Body HTML grouped by Branch...")
    html_body = generate_email_body_html(processed_df, target_date)
    
    subject = f"Daily IOC Xtrapower Diesel Mileage & Amount Report - {target_date.strftime('%d/%m/%Y')}"
    recipients = ["anwar@efflogistics.biz", "shajahan@efflogistics.biz", "salim@efflogistics.biz"]
    send_via_applescript(recipients, subject, html_body, excel_path)
    
    # 4. Archive raw data file
    archive_dir = os.path.join(script_dir, "archive")
    os.makedirs(archive_dir, exist_ok=True)
    archive_path = os.path.join(archive_dir, f"ioc_raw_transactions_{date_str}.xlsx")
    os.rename(raw_csv_path, archive_path)
    print(f"Raw data file archived to: {archive_path}")
    print("All tasks completed successfully!")

if __name__ == "__main__":
    import asyncio
    asyncio.run(main_orchestrator())
