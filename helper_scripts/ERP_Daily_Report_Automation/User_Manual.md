# ERP Daily Reporting Automation - User Manual

## Overview
This folder contains the automated script (`download_and_email.py`) responsible for downloading Dispatch and LR (Lorry Receipt) reports from the ERP system, processing the data, generating interactive Excel reports & dashboard images, and automatically sending them via Email and WhatsApp.

## Folder Structure
* `download_and_email.py`: The main Python script that drives the entire automation.
* `User_Manual.md`: This documentation file.

## Workflows
The automation runs in two modes (scheduled via GitHub Actions):

### 1. Evening Flow
* **When**: Daily at 7:13 PM IST.
* **Action**: Logs into the ERP, downloads the end-of-day **Despatch Report**, and uploads it to the Supabase database (`daily_despatch_snapshot` table).
* **Purpose**: This creates a permanent snapshot of all LRs that went out for delivery on that specific day.

### 2. Morning Flow
* **When**: Daily at 6:15 AM IST (to capture delivery updates from the previous day up until 7 AM today).
* **Action**:
  1. Fetches yesterday's Despatch Snapshot from Supabase.
  2. Downloads the latest **LR Report** from the ERP.
  3. Compares the two datasets to determine the final status of yesterday's dispatches.
* **Output generation**:
  * Calculates aging (delays).
  * Calculates unique delivery points per dispatch and driver.
  * Finds the 1st and Last delivery time for each dispatch.
  * Segregates LRs into **Delivered**, **Despatched (Returned)**, and **Open**.
* **Delivery**:
  * Generates an Interactive Excel Report with 4 sheets: Daily Summary, Despatch Snapshot, Open LRs, and **Despatch Summary**.
  * Creates a visual Pillow Dashboard Image.
  * Sends the complete package via Email and a text summary via WhatsApp to stakeholders.

## Technical Details
* **Libraries Used**: `playwright` (Headless browser automation for ERP login and export), `pandas` & `openpyxl` (Excel processing), `Pillow` (Dashboard image generation), `requests` (Supabase & WhatsApp APIs).
* **Environment Variables**: The system relies on GitHub Secrets for secure execution (ERP credentials, Supabase keys, Email/WhatsApp credentials). When running locally, it attempts to read from a local `.env` file.
* **GitHub Action**: Located at `.github/workflows/daily_report.yml`. This orchestrates the cron schedules and manual triggers.

## Recent Updates
* Added detailed Driver/Despatch level summaries including total LRs, unique delivery points, 1st delivery time, last delivery time, and explicit counts for Delivered vs. Despatched (Returned) LRs.
* Added a dedicated "Despatch Summary" sheet in the Excel output.
