import pandas as pd
import numpy as np
import traceback
import re
import difflib

def clean_string(val):
    if pd.isna(val):
        return ""
    import html
    s = html.unescape(str(val))
    s = s.strip().upper()
    s = re.sub(r'[^A-Z0-9\s]', ' ', s)
    s = re.sub(r'\s+', ' ', s).strip()
    return s

def fuzzy_match_row(rate_df, col_name, search_val):
    if rate_df.empty or search_val == "":
        return pd.DataFrame()
        
    search_val_clean = clean_string(search_val)
    search_tokens = set(search_val_clean.split())
    
    rate_df['__clean_col'] = rate_df[col_name].apply(clean_string)
    
    exact = rate_df[rate_df['__clean_col'] == search_val_clean]
    if not exact.empty:
        return exact
        
    def is_substring(x):
        x = str(x)
        return x in search_val_clean or search_val_clean in x
        
    sub = rate_df[rate_df['__clean_col'].apply(is_substring)]
    if not sub.empty:
        sub['__len'] = sub['__clean_col'].str.len()
        return sub.sort_values('__len', ascending=False).head(1)
        
    best_ratio = 0
    best_idx = -1
    
    for idx, val in rate_df['__clean_col'].items():
        val_str = str(val)
        val_tokens = set(val_str.split())
        if not val_tokens: continue
        
        seq_ratio = difflib.SequenceMatcher(None, search_val_clean, val_str).ratio()
        
        intersection = search_tokens.intersection(val_tokens)
        min_len = min(len(search_tokens), len(val_tokens))
        overlap_ratio = len(intersection) / min_len if min_len > 0 else 0
        
        combined = max(seq_ratio, (overlap_ratio * 0.7 + seq_ratio * 0.3))
        if overlap_ratio >= 0.6:
            combined = max(combined, 0.75 + overlap_ratio * 0.1)
            
        if combined > best_ratio:
            best_ratio = combined
            best_idx = idx
            
    if best_ratio >= 0.7:
        return rate_df.loc[[best_idx]]
        
    return pd.DataFrame()

def parse_html_excel_sheet(df, sheet_name):
    cols_upper = [str(x).strip().upper() for x in df.columns]
    
    if 'LR NO' in cols_upper:
        headers = cols_upper
        data = df.copy()
        data.columns = headers
    else:
        header_idx = -1
        for i in range(min(100, len(df))):
            row_upper = [str(x).strip().upper() for x in df.iloc[i].tolist()]
            if 'LR NO' in row_upper:
                header_idx = i
                break
                
        if header_idx == -1:
            return pd.DataFrame()
            
        headers = [str(h).strip().upper() for h in df.iloc[header_idx].tolist()]
        data = df.iloc[header_idx+1:].copy()
        data.columns = headers
    
    result = pd.DataFrame(index=data.index)
    
    if 'CONSIGNOR' in headers:
        result['CONSIGNOR'] = data['CONSIGNOR']
    else:
        result['CONSIGNOR'] = sheet_name
    
    if 'DATE' in headers or '\xa0\xa0DATE\xa0\xa0' in headers:
        date_col = next(c for c in headers if 'DATE' in c)
        result['DATE'] = data[date_col]
    else:
        result['DATE'] = ""
        
    if 'LR NO' in headers:
        result['LR NO'] = data['LR NO']
    else:
        return pd.DataFrame()
        
    result['CONSIGNEE'] = data['CONSIGNEE'] if 'CONSIGNEE' in headers else ""
    
    if 'CONSIGNEE CODE' in headers:
        code_col = next(c for c in data.columns if str(c).strip().upper() == 'CONSIGNEE CODE')
        result['CONSIGNEE CODE'] = data[code_col]
    else:
        result['CONSIGNEE CODE'] = ""
        
    result['DESTINATION'] = data['DESTINATION'] if 'DESTINATION' in headers else ""
    
    if 'INVOICE NO' in headers:
        result['INVOICE NO'] = data['INVOICE NO']
    else:
        result['INVOICE NO'] = ""
    result['WEIGHT'] = data['WEIGHT'] if 'WEIGHT' in headers else 0.0
    
    if 'BOX COUNT' in headers:
        result['BOX QTY'] = data['BOX COUNT']
    elif 'BOX QTY' in headers:
        result['BOX QTY'] = data['BOX QTY']
    else:
        result['BOX QTY'] = 0
        
    result['PAYMENT TYPE'] = data['PAYMENT TYPE'] if 'PAYMENT TYPE' in headers else ""
    
    if 'TOTAL' in headers:
        result['TOTAL FRIGHT'] = data['TOTAL']
    elif 'TOTAL FRIGHT' in headers:
        result['TOTAL FRIGHT'] = data['TOTAL FRIGHT']
    elif 'FRIGHT' in headers:
        result['TOTAL FRIGHT'] = data['FRIGHT']
    else:
        result['TOTAL FRIGHT'] = 0.0
    
    # Merge multi-row BOXES STR
    boxes_col = data['BOXES'] if 'BOXES' in headers else pd.Series([""] * len(data))
    result['BOXES STR'] = boxes_col.fillna('').astype(str)
    
    lr_clean_temp = result['LR NO'].astype(str).str.strip()
    lr_clean_temp = lr_clean_temp.mask(lr_clean_temp.isin(['', 'nan', 'None']))
    lr_filled = lr_clean_temp.ffill()
    boxes_agg = result.groupby(lr_filled)['BOXES STR'].apply(lambda x: ''.join(x)).to_dict()
    
    # Keep only main rows
    main_mask = lr_clean_temp.notna()
    result = result[main_mask].copy()
    
    # Map aggregated BOXES STR back
    result['BOXES STR'] = result['LR NO'].astype(str).str.strip().map(boxes_agg).fillna(result['BOXES STR'])
    
    result['LR NO_CLEAN'] = result['LR NO'].astype(str).str.strip().str.upper()
    
    bad_lr_words = ['TAX', 'TOTAL', 'GRAND', 'SL NO', 'LR NO']
    for bad in bad_lr_words:
        if not result.empty:
            result = result[~result['LR NO_CLEAN'].str.contains(bad, case=False, na=False)]
            
    if not result.empty:
        mask_inr = result.astype(str).apply(lambda x: x.str.contains('INR', case=False, na=False)).any(axis=1)
        result = result[~mask_inr]
            
    if not result.empty:
        exact_bad = ['0', 'NAN', 'NONE', '']
        result = result[~result['LR NO_CLEAN'].isin(exact_bad)]
        
    def is_valid_lr(x):
        x = str(x)
        return len(x) >= 3 and not x.isspace()
        
    if 'LR NO_CLEAN' in result.columns and not result.empty:
        result = result[result['LR NO_CLEAN'].apply(is_valid_lr)]
        
    if 'LR NO_CLEAN' in result.columns:
        result = result.drop(columns=['LR NO_CLEAN'], errors='ignore')
    
    def clean_num(x):
        try:
            return pd.to_numeric(str(x).replace('\xa0', '').replace('INR', '').strip(), errors='coerce')
        except:
            return 0.0
            
    result['TOTAL FRIGHT'] = result['TOTAL FRIGHT'].apply(clean_num)
    result['WEIGHT'] = result['WEIGHT'].apply(clean_num)
    result['BOX QTY'] = result['BOX QTY'].apply(clean_num)
    
    return result

def parse_boxes_string(boxes_str):
    if pd.isna(boxes_str) or str(boxes_str).strip() == "":
        return []
    
    parts = re.split(r'[,\n]+', str(boxes_str))
    parsed = []
    for p in parts:
        p = p.strip()
        if not p: continue
        match = re.match(r'(\d+)\s*[xX\*]\s*(.+)', p)
        if match:
            qty = float(match.group(1))
            btype = match.group(2).strip().upper()
            parsed.append({'qty': qty, 'type': btype})
        else:
            parsed.append({'qty': 1.0, 'type': p.upper()})
    return parsed

def find_box_rate_column(box_type, rate_columns):
    box_clean = clean_string(box_type)
    
    for col in rate_columns:
        header_parts = [clean_string(p) for p in col.split(',')]
        if box_clean in header_parts:
            return col
            
    for col in rate_columns:
        if box_clean in clean_string(col) or clean_string(col) in box_clean:
            return col
            
    return None

def process_freight_data(lr_file, rates_file):
    pd.options.mode.chained_assignment = None
    
    # Load LR file which might be a CSV disguised as an XLSX
    # We will use the robust helper loader
    def load_lr_df(file_path):
        import csv
        import io
        with open(file_path, "rb") as f:
            head = f.read(4)
        if head == b"PK\x03\x04" or head == b"\xd0\xcf\x11\xe0":
            xl = pd.ExcelFile(file_path)
            sheets_data = {s: xl.parse(s) for s in xl.sheet_names}
            return sheets_data
        else:
            # It is a CSV text file from ERP download
            cleaned_rows = []
            for enc in ["utf-8", "latin1", "utf-8-sig"]:
                try:
                    with open(file_path, "r", encoding=enc) as f_csv:
                        reader = csv.reader(f_csv)
                        header = next(reader)
                        num_cols = len(header)
                        cleaned_rows.append(header)
                        for row in reader:
                            if len(row) > num_cols:
                                last_col_val = ",".join(row[num_cols-1:])
                                cleaned_row = row[:num_cols-1] + [last_col_val]
                                cleaned_rows.append(cleaned_row)
                            else:
                                cleaned_row = row + [""] * (num_cols - len(row))
                                cleaned_rows.append(cleaned_row)
                    output = io.StringIO()
                    writer = csv.writer(output)
                    writer.writerows(cleaned_rows)
                    output.seek(0)
                    df_csv = pd.read_csv(output)
                    # For CSV, treat it as a single sheet named 'LR Data'
                    return {"Whole LR nos": df_csv, "LR Data": df_csv}
                except Exception:
                    continue
            # Fallback
            df_fallback = pd.read_csv(file_path, on_bad_lines='skip')
            return {"Whole LR nos": df_fallback, "LR Data": df_fallback}

    lr_data_dict = load_lr_df(lr_file)
    lr_sheets = list(lr_data_dict.keys())
    
    cancelled_lrs = set()
    df_whole = pd.DataFrame()
    if 'Whole LR nos' in lr_sheets:
        df_whole = lr_data_dict['Whole LR nos']
        if 'LR STATUS' in df_whole.columns and 'LR NO' in df_whole.columns:
            cancelled_mask = df_whole['LR STATUS'].astype(str).str.upper() == 'DESPATCHED FROM BRANCH'
            cancelled_lrs = set(df_whole.loc[cancelled_mask, 'LR NO'].astype(str).str.strip().str.upper())
            
    manual_rates = {}
    if 'Manual Rate Added Lrs' in lr_sheets:
        try:
            df_manual = lr_data_dict['Manual Rate Added Lrs']
            for idx, r in df_manual.iterrows():
                if pd.notna(r.get('LR NO')) and pd.notna(r.get('Freight Amount')):
                    manual_rates[str(r['LR NO']).strip().upper()] = float(r['Freight Amount'])
        except Exception as e:
            print(f"Error parsing Manual Rate sheet: {e}")
            
    combined_dfs = []
    for s in lr_sheets:
        if s in ['Whole LR nos', 'Manual Rate Added Lrs']: continue
        try:
            raw_df = lr_data_dict[s]
            parsed_df = parse_html_excel_sheet(raw_df, s)
            if not parsed_df.empty:
                combined_dfs.append(parsed_df)
        except Exception as e:
            print(f"Error parsing sheet {s}: {e}")
            
    if not combined_dfs:
        raise ValueError("Could not extract any valid data from individual sheets.")
        
    df_lr = pd.concat(combined_dfs, ignore_index=True)
    
    df_lr['__lr_upper'] = df_lr['LR NO'].astype(str).str.strip().str.upper()
    df_lr = df_lr[~df_lr['__lr_upper'].isin(cancelled_lrs)].copy()
    df_lr = df_lr.drop(columns=['__lr_upper'])
        
    xl_rates = pd.ExcelFile(rates_file)
    sheet_names = xl_rates.sheet_names
    
    df_lr['Calculated Amount'] = 0.0
    df_lr['Calculated Min LR Amount'] = 0.0
    df_lr['Calculated Stationary Charge'] = 0.0
    df_lr['Calculated Unloading Charge'] = 0.0
    df_lr['Master Rate'] = ""
    df_lr['Remarks'] = ""
    df_lr['Finded Reason'] = ""
    df_lr['Discrepancy Status'] = "Match"
    df_lr['Existing ERP Total'] = df_lr['TOTAL FRIGHT']
    
    df_lr['Account Pay'] = 0.0
    df_lr['To Pay'] = 0.0
    df_lr['Paid'] = 0.0

    consignor_sheet_map = {}
    for s in sheet_names:
        consignor_sheet_map[clean_string(s)] = s
        
    rates_cache = {}

    for index, row in df_lr.iterrows():
        lr_no_upper = str(row.get('LR NO', '')).strip().upper()
        ptype = str(row.get('PAYMENT TYPE', '')).strip().upper()
        
        if lr_no_upper in manual_rates:
            # Manual Rate Logic
            manual_freight = manual_rates[lr_no_upper]
            df_lr.at[index, 'Finded Reason'] = 'Manual Rate Added Lr'
            df_lr.at[index, 'Calculated Amount'] = np.nan
            df_lr.at[index, 'Calculated Min LR Amount'] = np.nan
            df_lr.at[index, 'Calculated Stationary Charge'] = np.nan
            df_lr.at[index, 'Calculated Unloading Charge'] = np.nan
            
            # Put amount in proper payment bucket
            if 'ACCOUNT' in ptype:
                df_lr.at[index, 'Account Pay'] = manual_freight
            elif 'TO PAY' in ptype:
                df_lr.at[index, 'To Pay'] = manual_freight
            else:
                df_lr.at[index, 'Paid'] = manual_freight
                
            continue # Skip rest of calculations
        
        # LR BATA / DRIVER BATA & EFF Branch internal transfers - adjustment LRs for bata tracking, skip from audit
        consignor_raw = str(row.get('CONSIGNOR', '')).strip().upper()
        consignee_raw = str(row.get('CONSIGNEE', '')).strip().upper()
        invoice_no = str(row.get('INVOICE NO', '')).strip().upper()
        
        is_bata_invoice = any(kw in invoice_no for kw in ['DRIVER BATA', 'DRIVAR BATA', 'DRIVER BETA', 'DRIVAR BETA', 'LR BATA', 'LR BETA'])
        is_eff_branch = consignor_raw.startswith('EFF ') or consignee_raw.startswith('EFF ')
        
        if is_bata_invoice or is_eff_branch:
            df_lr.at[index, 'Remarks'] = "LR Bata / Branch Entry - Not Audited"
            df_lr.at[index, 'Discrepancy Status'] = "Skipped"
            df_lr.at[index, 'Finded Reason'] = "LR Bata Adjustment"
            continue
        
        # Unloading charge adjustment entry (invoice = "unloading")
        if 'UNLOADING' in invoice_no and invoice_no.replace(' ', '') in ['UNLOADING', 'UNLOADING.', 'UNLOADING"']:
            erp_total = row.get('TOTAL FRIGHT', 0)
            if pd.isna(erp_total): erp_total = 0.0
            df_lr.at[index, 'Remarks'] = "Unloading Charge"
            df_lr.at[index, 'Finded Reason'] = "Unloading Charge Adjustment"
            df_lr.at[index, 'Calculated Amount'] = erp_total
            df_lr.at[index, 'Discrepancy Status'] = "Unloading Adj"
            # Put amount in proper payment bucket
            if 'ACCOUNT' in ptype:
                df_lr.at[index, 'Account Pay'] = erp_total
            elif 'TO PAY' in ptype:
                df_lr.at[index, 'To Pay'] = erp_total
            else:
                df_lr.at[index, 'Paid'] = erp_total
            continue
            
        consignor = clean_string(row.get('CONSIGNOR', ''))
        consignee = clean_string(row.get('CONSIGNEE', ''))
        destination = clean_string(row.get('DESTINATION', ''))
        weight = row.get('WEIGHT', 0)
        box_qty_total = row.get('BOX QTY', 0)
        boxes_str = row.get('BOXES STR', "")
        lr_no_upper = str(row.get('LR NO', '')).strip().upper()
        
        if lr_no_upper in cancelled_lrs:
            df_lr.at[index, 'Remarks'] = "Cancelled LR"
            df_lr.at[index, 'Discrepancy Status'] = "Cancelled"
            continue
            

        consignor_no_space = consignor.replace(' ', '')
        matched_sheet = None
        for key in consignor_sheet_map:
            key_no_space = key.replace(' ', '')
            if key_no_space in consignor_no_space or consignor_no_space in key_no_space:
                matched_sheet = consignor_sheet_map[key]
                break
                
        if not matched_sheet:
            df_lr.at[index, 'Remarks'] = "Rate sheet not found for Consignor"
            df_lr.at[index, 'Discrepancy Status'] = "Error"
            continue
            
        if matched_sheet not in rates_cache:
            rates_cache[matched_sheet] = xl_rates.parse(matched_sheet)
            rates_cache[matched_sheet].columns = [str(c).strip() for c in rates_cache[matched_sheet].columns]
            
        rate_df = rates_cache[matched_sheet]
        
        calculated_amount = 0.0
        min_lr = 0.0
        stationery = 0.0
        unloading = 0.0
        calc_remarks = []
        has_error = False
        
        dest_col = next((c for c in rate_df.columns if 'DESTINATION' in c.upper()), None)
        cons_col = next((c for c in rate_df.columns if 'CONSIGNEE' in c.upper() and 'CODE' not in c.upper()), None)
        code_col = next((c for c in rate_df.columns if 'CONSIGNEE CODE' in c.upper()), None)
        
        if 'UNIVERSAL' in consignor:
            dest_col = None
            cons_col = None
            code_col = None
            
        matched_row = pd.DataFrame()
        
        if code_col and 'CONSIGNEE CODE' in row and pd.notna(row['CONSIGNEE CODE']) and str(row['CONSIGNEE CODE']).strip():
            target_code = str(row['CONSIGNEE CODE']).strip().replace('.0', '')
            rate_df['__clean_code'] = rate_df[code_col].astype(str).str.replace(r'\.0$', '', regex=True).str.strip()
            matched_row = rate_df[rate_df['__clean_code'] == target_code]
            if matched_row.empty:
                df_lr.at[index, 'Remarks'] = f"Consignee Code '{target_code}' not found in rate sheet"
                has_error = True
        elif dest_col:
            matched_row = fuzzy_match_row(rate_df, dest_col, destination)
            if matched_row.empty:
                all_dest_row = rate_df[rate_df[dest_col].astype(str).str.upper().str.contains('ALL DEST', na=False)]
                if not all_dest_row.empty:
                    matched_row = all_dest_row.head(1)
                else:
                    df_lr.at[index, 'Remarks'] = f"Destination '{destination}' not found in rate sheet"
                    has_error = True
        elif cons_col:
            matched_row = fuzzy_match_row(rate_df, cons_col, consignee)
            if matched_row.empty:
                all_cons_row = rate_df[rate_df[cons_col].astype(str).str.upper().str.contains('ALL CONS', na=False)]
                if not all_cons_row.empty:
                    matched_row = all_cons_row.head(1)
                else:
                    df_lr.at[index, 'Remarks'] = f"Consignee '{consignee}' not found in rate sheet"
                    has_error = True
        else:
            matched_row = rate_df.head(1)
            
        if not matched_row.empty and not has_error:
            m_row = matched_row.iloc[0]
            
            kg_col = next((c for c in rate_df.columns if 'KILOGRAM' in c.upper() or 'KG' in c.upper()), None)
            exclude_cols = [dest_col, cons_col, code_col, '__clean_dest', '__clean_cons', '__clean_col', '__clean_code', 'Min lr amount', 'Stationary Charge', 'UL Charge', 'U/L Charge', 'Consignor ', 'Consignor']
            avail_rate_cols = [c for c in rate_df.columns if c not in exclude_cols and 'Unnamed' not in c]
            if kg_col in avail_rate_cols:
                avail_rate_cols.remove(kg_col)
                
            boxes_parsed = parse_boxes_string(boxes_str)
            billed_by_box = False
            
            # 1. Try to bill by box types FIRST
            if boxes_parsed and avail_rate_cols:
                # Check if ANY parsed box matches a column
                any_match = any(find_box_rate_column(b['type'], avail_rate_cols) for b in boxes_parsed)
                if any_match:
                    billed_by_box = True
                    for b in boxes_parsed:
                        b_type = b['type']
                        b_qty = b['qty']
                        
                        if 'KILOGRAM' in b_type or 'KG' in b_type:
                            if kg_col and weight > 0:
                                kg_rate = pd.to_numeric(m_row[kg_col], errors='coerce')
                                if not pd.isna(kg_rate):
                                    kg_total = weight * kg_rate
                                    calculated_amount += kg_total
                                    calc_remarks.append(f"Kilogram ({weight}kg) X Rate ({kg_rate}) = {kg_total}")
                                    df_lr.at[index, 'Master Rate'] = str(kg_rate)
                                else:
                                    calc_remarks.append("RATE NOT ADDED IN MASTER for KILOGRAM")
                                    has_error = True
                            else:
                                calc_remarks.append("WEIGHT NOT ADDED IN LR")
                                has_error = True
                            continue
                            
                        matched_col = find_box_rate_column(b_type, avail_rate_cols)
                        
                        if matched_col:
                            b_rate = pd.to_numeric(m_row[matched_col], errors='coerce')
                            if not pd.isna(b_rate):
                                b_total = b_qty * b_rate
                                calculated_amount += b_total
                                calc_remarks.append(f"({b_qty} x {b_type}) X Box Rate ({b_rate}) = {b_total}")
                                curr_rate = str(df_lr.at[index, 'Master Rate'])
                                df_lr.at[index, 'Master Rate'] = curr_rate + f"{b_rate}," if curr_rate else str(b_rate)
                            else:
                                calc_remarks.append(f"RATE NOT ADDED IN MASTER for {b_type}")
                                has_error = True
                        else:
                            # If only one general box rate exists, use it as fallback
                            if len(avail_rate_cols) == 1:
                                b_rate = pd.to_numeric(m_row[avail_rate_cols[0]], errors='coerce')
                                if not pd.isna(b_rate):
                                    b_total = b_qty * b_rate
                                    calculated_amount += b_total
                                    calc_remarks.append(f"({b_qty} x {b_type}) X Fallback Rate ({b_rate}) = {b_total}")
                                    curr_rate = str(df_lr.at[index, 'Master Rate'])
                                    df_lr.at[index, 'Master Rate'] = curr_rate + f"{b_rate}," if curr_rate else str(b_rate)
                                else:
                                    calc_remarks.append(f"RATE NOT ADDED IN MASTER for {b_type}")
                                    has_error = True
                            else:
                                calc_remarks.append(f"RATE NOT ADDED IN MASTER for {b_type}")
                                has_error = True
                                
            # 2. If no boxes matched, but we have KG rate and weight, use KG
            if not billed_by_box:
                if kg_col and weight > 0:
                    rate_val = pd.to_numeric(m_row[kg_col], errors='coerce')
                    if not pd.isna(rate_val):
                        calculated_amount = weight * rate_val
                        calc_remarks.append(f"Kilogram ({weight}kg) X Rate ({rate_val}) = {calculated_amount}")
                        df_lr.at[index, 'Master Rate'] = str(rate_val)
                    else:
                        calc_remarks.append("RATE NOT ADDED IN MASTER")
                        has_error = True
                elif not boxes_parsed and box_qty_total > 0 and avail_rate_cols:
                    # Generic box qty fallback
                    box_rate = pd.to_numeric(m_row[avail_rate_cols[0]], errors='coerce')
                    if not pd.isna(box_rate):
                        calculated_amount = box_qty_total * box_rate
                        calc_remarks.append(f"Box Qty ({box_qty_total}) X Rate ({box_rate}) = {calculated_amount}")
                        df_lr.at[index, 'Master Rate'] = str(box_rate)
                    else:
                        calc_remarks.append("RATE NOT ADDED IN MASTER")
                        has_error = True
                else:
                    if kg_col and weight <= 0:
                        rate_val = pd.to_numeric(m_row[kg_col], errors='coerce')
                        if not pd.isna(rate_val):
                            df_lr.at[index, 'Master Rate'] = str(rate_val)
                        calc_remarks.append("WEIGHT NOT ADDED IN LR")
                        has_error = True
                    else:
                        calc_remarks.append("NO MATCHING BOX TYPES OR KG FOUND")
                        has_error = True
            
            if 'Min lr amount' in rate_df.columns:
                min_lr = pd.to_numeric(m_row['Min lr amount'], errors='coerce')
            if 'Stationary Charge' in rate_df.columns:
                stationery = pd.to_numeric(m_row['Stationary Charge'], errors='coerce')
            if 'U/L Charge' in rate_df.columns:
                ul_rate = pd.to_numeric(m_row['U/L Charge'], errors='coerce')
                unloading = ul_rate * box_qty_total if not pd.isna(ul_rate) else 0.0
            elif 'UL Charge' in rate_df.columns:
                ul_rate = pd.to_numeric(m_row['UL Charge'], errors='coerce')
                unloading = ul_rate * box_qty_total if not pd.isna(ul_rate) else 0.0
                
        if pd.isna(calculated_amount): calculated_amount = 0.0
        if pd.isna(min_lr): min_lr = 0.0
        if pd.isna(stationery): stationery = 0.0
        if pd.isna(unloading): unloading = 0.0
        
        df_lr.at[index, 'Calculated Amount'] = calculated_amount
        df_lr.at[index, 'Calculated Min LR Amount'] = min_lr
        df_lr.at[index, 'Calculated Stationary Charge'] = stationery
        df_lr.at[index, 'Calculated Unloading Charge'] = unloading
        
        current_remarks = df_lr.at[index, 'Remarks']
        if not current_remarks:
            df_lr.at[index, 'Remarks'] = " | ".join(calc_remarks)
            
        if has_error:
            df_lr.at[index, 'Discrepancy Status'] = "Error"

    df_lr['DATE_STR'] = df_lr['DATE'].astype(str)
    grouped = df_lr.groupby(['CONSIGNOR', 'CONSIGNEE', 'DATE_STR'])
    
    for name, group in grouped:
        total_calc = group['Calculated Amount'].sum()
        max_min_lr = group['Calculated Min LR Amount'].max()
        
        if total_calc < max_min_lr and max_min_lr > 0:
            count = len(group)
            split_min = max_min_lr / count
            for idx in group.index:
                df_lr.at[idx, 'Calculated Amount'] = split_min
                df_lr.at[idx, 'Remarks'] = df_lr.at[idx, 'Remarks'] + f" | [Min LR Applied: {max_min_lr} / {count}]"
                
    df_lr['Calculated Total Freight'] = df_lr['Calculated Amount'] + df_lr['Calculated Stationary Charge']
    df_lr['Grand Total with UL'] = df_lr['Calculated Total Freight'] + df_lr['Calculated Unloading Charge']
    
    for index, row in df_lr.iterrows():
        # Check if it's manual rate
        if df_lr.at[index, 'Finded Reason'] == 'Manual Rate Added Lr':
            manual_amount = df_lr.at[index, 'Account Pay'] or df_lr.at[index, 'To Pay'] or df_lr.at[index, 'Paid']
            if pd.isna(manual_amount) or manual_amount == 0:
                # Need to find which bucket was used
                for pt in ['Account Pay', 'To Pay', 'Paid']:
                    if not pd.isna(df_lr.at[index, pt]) and df_lr.at[index, pt] > 0:
                        manual_amount = df_lr.at[index, pt]
                        break
                        
            df_lr.at[index, 'Grand Total with UL'] = manual_amount
            # difference calculation for manual rates
            erp_total = row.get('Existing ERP Total', 0)
            df_lr.at[index, 'Amount Difference'] = erp_total - manual_amount
            df_lr.at[index, 'Discrepancy Status'] = "Match" if abs(erp_total - manual_amount) <= 1.0 else "Mismatch"
            continue
            
        calc_total = row['Calculated Total Freight']
        grand_total = row['Grand Total with UL']
        erp_total = row.get('Existing ERP Total', 0)
        unloading_charge = row.get('Calculated Unloading Charge', 0)
        
        ptype = str(row.get('PAYMENT TYPE', '')).strip().upper()
        if 'TO PAY' in ptype or 'TOPAY' in ptype:
            df_lr.at[index, 'To Pay'] = grand_total
        elif 'PAID' in ptype:
            df_lr.at[index, 'Paid'] = grand_total
        else:
            df_lr.at[index, 'Account Pay'] = grand_total
            
        diff_base = erp_total - calc_total
        diff_grand = erp_total - grand_total
        
        if row['Discrepancy Status'] not in ["Error", "Cancelled", "Skipped", "Unloading Adj"]:
            df_lr.at[index, 'Amount Difference'] = diff_grand
            if abs(diff_grand) <= 1.0:
                df_lr.at[index, 'Discrepancy Status'] = "Match"
            else:
                df_lr.at[index, 'Discrepancy Status'] = "Mismatch"
                
        reason = str(df_lr.at[index, 'Finded Reason']) if pd.notna(df_lr.at[index, 'Finded Reason']) else ""
        if df_lr.at[index, 'Discrepancy Status'] == "Mismatch":
            try:
                box_qty = float(row.get('BOX QTY', 0))
            except:
                box_qty = 0
                
            if box_qty == 0:
                reason = "Box Qty not added in Lr Data"
            elif not str(row.get('BOXES STR', '')).strip() or str(row.get('BOXES STR', '')).strip().lower() == "nan":
                reason = "Not selected Box type"
            elif df_lr.at[index, 'Calculated Amount'] == 0:
                reason = "Rate not added in master"
            else:
                stationery = df_lr.at[index, 'Calculated Stationary Charge']
                if abs(diff_base) <= 1.0 and unloading_charge > 0:
                    reason = "may be the reason is U/L Charge not added in Existing ERP"
                elif abs(erp_total - (grand_total - stationery)) <= 1.0 and stationery > 0:
                    reason = "may be the reason is Stationary Charge not added in Existing ERP"
                elif abs(erp_total - (calc_total - stationery)) <= 1.0 and unloading_charge > 0 and stationery > 0:
                    reason = "may be the reason is U/L and Stationary Charge not added in Existing ERP"
                
        df_lr.at[index, 'Finded Reason'] = reason
                
    if 'DATE' in df_lr.columns:
        df_lr['DATE'] = pd.to_datetime(df_lr['DATE'], errors='coerce').dt.strftime('%d/%m/%Y').fillna(df_lr['DATE'])
        
    df_lr = df_lr.drop(columns=['DATE_STR', 'TOTAL FRIGHT'])
    
    cols_order = ['DATE', 'LR NO', 'CONSIGNOR', 'CONSIGNEE', 'DESTINATION', 'INVOICE NO', 'WEIGHT', 'BOXES STR', 'BOX QTY', 'PAYMENT TYPE',
                  'Master Rate', 'Existing ERP Total', 'Calculated Total Freight', 'Account Pay', 'To Pay', 'Paid', 
                  'Calculated Stationary Charge', 'Calculated Unloading Charge', 'Grand Total with UL', 'Amount Difference', 'Discrepancy Status', 'Finded Reason', 'Remarks']
                  
    num_cols = ['WEIGHT', 'Existing ERP Total', 'Calculated Total Freight', 'Account Pay', 'To Pay', 'Paid', 
                'Calculated Stationary Charge', 'Calculated Unloading Charge', 'Grand Total with UL', 'Amount Difference']
    for nc in num_cols:
        if nc in df_lr.columns:
            df_lr[nc] = pd.to_numeric(df_lr[nc], errors='coerce').round(2)
            
    final_cols = [c for c in cols_order if c in df_lr.columns]
    df_lr = df_lr[final_cols]
            
    summary = {
        'total_processed': len(df_lr),
        'matches': len(df_lr[df_lr['Discrepancy Status'] == 'Match']),
        'discrepancies': len(df_lr[df_lr['Discrepancy Status'] == 'Mismatch']),
        'errors': len(df_lr[df_lr['Discrepancy Status'] == 'Error']),
        'cancelled': len(df_lr[df_lr['Discrepancy Status'] == 'Cancelled']),
        'skipped': len(df_lr[df_lr['Discrepancy Status'] == 'Skipped']),
        'unloading_adj': len(df_lr[df_lr['Discrepancy Status'] == 'Unloading Adj'])
    }
            
    return df_lr, summary, df_whole
