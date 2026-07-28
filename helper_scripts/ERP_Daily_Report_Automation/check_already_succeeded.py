import sys
import subprocess
import json
import os
from datetime import datetime, timedelta, timezone

def get_runs():
    try:
        # Run gh CLI command to fetch runs
        cmd = ["gh", "run", "list", "--workflow", "daily_report.yml", "--json", "conclusion,createdAt,status,displayTitle,databaseId"]
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        return json.loads(result.stdout)
    except Exception as e:
        print(f"Error fetching runs: {e}", file=sys.stderr)
        return []

def main():
    runs = get_runs()
    
    # Define IST timezone (UTC+5:30)
    ist = timezone(timedelta(hours=5, minutes=30))
    now_ist = datetime.now(ist)
    # Determine the target reporting date for the current execution
    # If running before 12:00 PM (noon) IST, treat it as a delayed run for the previous calendar day.
    if now_ist.hour < 12:
        current_target_date = (now_ist - timedelta(days=1)).strftime("%Y-%m-%d")
    else:
        current_target_date = now_ist.strftime("%Y-%m-%d")
    
    # Current run's databaseId can be obtained from the GITHUB_RUN_ID environment variable
    current_run_id = os.getenv("GITHUB_RUN_ID")
    if current_run_id:
        try:
            current_run_id = int(current_run_id)
        except ValueError:
            current_run_id = None
            
    for run in runs:
        # Skip current running run
        if current_run_id and run.get("databaseId") == current_run_id:
            continue
            
        if run.get("status") == "completed" and run.get("conclusion") == "success":
            # Parse createdAt timestamp (e.g. "2026-07-25T17:27:41Z")
            created_at_utc_str = run.get("createdAt")
            try:
                # Convert Z to +00:00 for python's fromisoformat
                if created_at_utc_str.endswith("Z"):
                    created_at_utc_str = created_at_utc_str[:-1] + "+00:00"
                created_at_utc = datetime.fromisoformat(created_at_utc_str)
                created_at_ist = created_at_utc.astimezone(ist)
                
                # Determine target reporting date for the historical run
                if created_at_ist.hour < 12:
                    run_target_date = (created_at_ist - timedelta(days=1)).strftime("%Y-%m-%d")
                else:
                    run_target_date = created_at_ist.strftime("%Y-%m-%d")
                
                # Check if the historical run was for the same target reporting date
                if run_target_date == current_target_date:
                    # Also check if it was daily_evening_report mode
                    title = run.get("displayTitle", "")
                    # If displayTitle does not specify another mode, we assume it's daily_evening_report (default)
                    if "Mode:morning" not in title and "Mode:afternoon_open_lrs" not in title:
                        print("skip")
                        return
            except Exception as e:
                print(f"Error parsing date for run {run.get('databaseId')}: {e}", file=sys.stderr)
                
    print("proceed")

if __name__ == "__main__":
    main()
