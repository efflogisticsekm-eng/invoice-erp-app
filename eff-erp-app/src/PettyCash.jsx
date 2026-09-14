import React, { useState, useEffect } from 'react';
import { supabase } from './supabase';
import { ArrowLeft } from 'lucide-react';

const CATEGORIES = {
  "Travel & Conveyance": [
    { head: "Conveyance", subheads: ["Travelling Exp", "Petrol Expense"] },
    { head: "Toll & Parking Charge" },
    { head: "Fast Tag Recharge" }
  ],
  "Operations": [
    { head: "Batta", subheads: ["Collection Batta", "Route Batta"] },
    { head: "Loading" },
    { head: "Unloading" },
    { head: "Courier Charges" },
    { head: "GDM Advance Payment" },
    { head: "GDM Addtl Advance" },
    { head: "GDM Balance Receivable", type: "Receipt" },
    { head: "GDM Balance Payment", type: "Payment" },
    { head: "Pending To-Pay Received", type: "Receipt" }
  ],
  "Vehicle Maintenance": [
    { head: "Vehicle Maintenance", subheads: ["Greasing", "Air Filling", "Tyre Puncher", "Tyre Refilling"] },
    { head: "Vehicle Statutory Exp", subheads: ["Tax", "Insurance", "Pollution (PUC)"] }
  ],
  "Fines": [
    { head: "Fines", subheads: ["Police Fine", "Overload Fine", "RTO Fine"] }
  ],
  "Statutory & Compliance": [
    { head: "Statutory Exp", subheads: ["Licence Fee", "Professional Tax", "Other"] }
  ],
  "Rent & Utilities": [
    { head: "Rent" },
    { head: "Electricity Charges", subheads: ["Godown Electricity", "Staff Room Electricity"] },
    { head: "Telephone & Internet", subheads: ["Telephone Charge", "Internet Charge"] },
    { head: "Godown Maintenance" }
  ],
  "Asset & Equipment Maintenance": [
    { head: "Asset Maintenance", subheads: ["Loading Equipment", "Camera / CCTV", "Weighing Scale", "Generator / Inverter", "Trolley / Hand Truck", "Computer / Laptop", "Other"] }
  ],
  "Admin & Office": [
    { head: "Printing & Stationery", subheads: ["Printing Charge", "Stationery Purchase", "Barcode Sticker Purchase", "Cartridge Refilling"] },
    { head: "Advertisement" },
    { head: "Donation" }
  ],
  "Food & Refreshment": [
    { head: "Food Exp", subheads: ["Drinking Water Charge", "Food Exp", "Refreshment"] }
  ],
  "Cash & HO Transactions": [
    { head: "HO Cash Receipt", type: "Receipt" },
    { head: "Paid LR Receipts", type: "Receipt" }
  ],
  "Staff": [
    { head: "Staff Medical Expense" },
    { head: "Casual Labour" },
    { head: "Salary" },
    { head: "Salary Advance Returned", type: "Receipt" }
  ],
  "Balance": [
    { head: "Opening Balance", type: "Receipt" }
  ]
};

export default function PettyCash({ user, profile, onBack }) {
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    category: '',
    head: '',
    subhead: '',
    type: 'Payment',
    amount: '',
    description: '',
    vehicleNumber: '',
    gdmNumber: '',
    routeName: '',
    debitTo: 'Company',
    driverName: '',
    partyName: ''
  });

  const [availableHeads, setAvailableHeads] = useState([]);

  const [availableSubheads, setAvailableSubheads] = useState([]);
  const [vehiclesList, setVehiclesList] = useState([]);
  const [loading, setLoading] = useState(false);
  
  const [paymentTo, setPaymentTo] = useState('');
  const [cachedDrivers, setCachedDrivers] = useState([]);
  const [gstApplicable, setGstApplicable] = useState(false);
  const [gstType, setGstType] = useState('Kerala');
  const [gstRate, setGstRate] = useState('18');
  const [cgstAmount, setCgstAmount] = useState('');
  const [sgstAmount, setSgstAmount] = useState('');

  const [debugInfo, setDebugInfo] = useState('');
  
  const [isLoadingDrivers, setIsLoadingDrivers] = useState(false);
  const [gdmValidationMsg, setGdmValidationMsg] = useState('');
  const [isGdmValidating, setIsGdmValidating] = useState(false);

  useEffect(() => {
    const fetchDrivers = async () => {
      try {
        const branchParam = profile?.branch || 'HO';
        const saved = localStorage.getItem(`cached_branch_drivers_${branchParam}`);
        if (saved) {
          const parsed = JSON.parse(saved);
          setCachedDrivers(parsed);
          if (parsed.length === 0) setIsLoadingDrivers(true);
        } else {
          setIsLoadingDrivers(true);
        }
        
        // Silently fetch drivers in the background to ensure list is up-to-date
        let fetchApiUrl = localStorage.getItem('gdm_read_api_url');
        if (!fetchApiUrl) {
          fetchApiUrl = prompt("Enter the new Google Apps Script Web App URL for Reading GDM Data (Topay & Paid Parcel Billing):");
          if (fetchApiUrl) localStorage.setItem('gdm_read_api_url', fetchApiUrl.trim());
        }
        if (fetchApiUrl && branchParam) {
          
          if (!saved || JSON.parse(saved).length === 0) {
              setDebugInfo('Fetching drivers from Drivers Master...');
          }

          fetch(`${fetchApiUrl}?action=getDrivers&branch=${encodeURIComponent(branchParam)}`)
            .then(res => res.json())
            .then(data => {
               setDebugInfo(''); // Clear debug info on success
               setIsLoadingDrivers(false);
               if (data.status === 'success' && data.driverList) {
                  setCachedDrivers(data.driverList);
                  try {
                    localStorage.setItem(`cached_branch_drivers_${branchParam}`, JSON.stringify(data.driverList));
                  } catch(e) {}
               }
            })
            .catch(err => {
                setDebugInfo(`API Error: ${err.message}`);
                setIsLoadingDrivers(false);
                console.error("Silent driver fetch failed:", err);
            });
        } else {
            if (!saved) setDebugInfo('No fetchApiUrl found in localStorage!');
            setIsLoadingDrivers(false);
        }
      } catch(e) {
          setDebugInfo(`Sync Error: ${e.message}`);
          setIsLoadingDrivers(false);
      }
    };
    
    fetchDrivers();
  }, [profile?.branch, formData.head]);
  const [igstAmount, setIgstAmount] = useState('');
  const [gstAmount, setGstAmount] = useState('');
  const [billingPartyGstin, setBillingPartyGstin] = useState('');

  useEffect(() => {
    let calcGst = 0;
    const baseAmt = parseFloat(formData.amount) || 0;
    if (gstApplicable) {
      calcGst = baseAmt * (parseFloat(gstRate) / 100);
    }
    setGstAmount(calcGst > 0 ? calcGst.toFixed(2) : '');
    
    if (gstApplicable) {
      if (gstType === 'Kerala') {
        setCgstAmount((calcGst / 2).toFixed(2));
        setSgstAmount((calcGst / 2).toFixed(2));
        setIgstAmount('');
      } else {
        setCgstAmount('');
        setSgstAmount('');
        setIgstAmount(calcGst.toFixed(2));
      }
    } else {
      setCgstAmount('');
      setSgstAmount('');
      setIgstAmount('');
    }
  }, [formData.amount, gstApplicable, gstType, gstRate]);


  useEffect(() => {
    const fetchVehicles = async () => {
      try {
        let query = supabase.from('vehicles').select('*');
        const allAccessRoles = ['Asst VM', 'VM(Vehicle Manager)', 'RM', 'HO', 'FM', 'CEO', 'MD', 'VM'];
        const allAccessNames = ['Arun Vehicle', 'Mohan Vehicle'];
        
        if (!allAccessRoles.includes(profile?.role) && !allAccessNames.includes(profile?.full_name)) {
          query = query.eq('branch', profile?.branch);
        }
        
        const { data, error } = await query;
        if (!error && data) {
          setVehiclesList(data);
        }
      } catch (err) {
        console.error("Error fetching vehicles:", err);
      }
    };
    fetchVehicles();
  }, [profile]);

  useEffect(() => {
    if (formData.category && CATEGORIES[formData.category]) {
      setAvailableHeads(CATEGORIES[formData.category]);
    } else {
      setAvailableHeads([]);
    }
  }, [formData.category]);

  useEffect(() => {
    const headObj = availableHeads.find(h => h.head === formData.head);
    if (headObj) {
      setFormData(prev => ({ ...prev, type: headObj.type || 'Payment' }));
      if (headObj.subheads) {
        setAvailableSubheads(headObj.subheads);
      } else {
        setAvailableSubheads([]);
      }
    } else {
      setAvailableSubheads([]);
    }
  }, [formData.head, availableHeads]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => {
        const newData = { ...prev, [name]: value };
        if (name === 'category') {
            newData.head = '';
            newData.subhead = '';
        } else if (name === 'head') {
            newData.subhead = '';
        }
        return newData;
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    

    const extraDetails = {};
    if (paymentTo) extraDetails.paymentTo = paymentTo;
    if (gstApplicable) {
        extraDetails.gstApplicable = true;
        extraDetails.gstType = gstType;
        extraDetails.gstRate = gstRate;
        extraDetails.cgstAmount = cgstAmount;
        extraDetails.sgstAmount = sgstAmount;
        extraDetails.igstAmount = igstAmount;
        extraDetails.gstAmount = gstAmount;
        extraDetails.billingPartyGstin = billingPartyGstin;
    }
    if (needsVehicleNumber && formData.vehicleNumber) extraDetails.vehicleNumber = formData.vehicleNumber;

    if (needsGdmNumber && formData.gdmNumber) extraDetails.gdmNumber = formData.gdmNumber;
    if (needsRouteName && formData.routeName) extraDetails.routeName = formData.routeName;
    if (needsPartyName && formData.partyName) extraDetails.partyName = formData.partyName;
    if (isFine) {
        extraDetails.debitTo = formData.debitTo;
        if (formData.debitTo === 'Driver') extraDetails.driverName = formData.driverName;
    }

    try {
      if (formData.category === 'Vehicle Maintenance') {
        // Route to expense_requests for VM Approval
        const { error } = await supabase
          .from('expense_requests')
          .insert([{
            user_id: user.id,
            date: formData.date,
            branch: profile?.branch || 'HO',
            user_role: profile?.role || 'User',
            category: formData.category,
            sub_category: formData.subhead,
            amount: parseFloat(formData.amount),
            total_amount: parseFloat(formData.amount),
            status: 'Pending',
            current_level: 'VM',
            details: {
              isPettyCash: true,
              head: formData.head,
              subhead: formData.subhead,
              type: formData.type,
              description: formData.description,
              extraDetails: extraDetails
            }
          }]);
        
        if (error) {
          console.error('Supabase error:', error);
          throw error;
        }
      } else {
        // Normal Petty Cash
        const { data, error } = await supabase
          .from('petty_cash_requests')
          .insert([{
            user_id: user.id,
            date: formData.date,
            category: formData.category,
            head: formData.head,
            subhead1: formData.subhead,
            type: formData.type,
            amount: parseFloat(formData.amount),
            description: formData.description,
            extra_details: extraDetails
          }]);
        
        if (error) {
          console.error('Supabase error:', error);
        }
        
        // Google Sheets Webhook Sync for non-Vehicle Maintenance
        try {
          const webhookUrl = import.meta.env.VITE_GOOGLE_WEBHOOK_URL || localStorage.getItem('google_webhook_url');
          if (webhookUrl) {
              await fetch(webhookUrl, {
                  method: 'POST',
                  mode: 'no-cors',
                  headers: {
                    'Content-Type': 'text/plain',
                  },
                  body: JSON.stringify({
                      source: 'PettyCash',
                      branch: profile?.branch || 'HO',
                      date: formData.date,
                      category: formData.category,
                      head: formData.head,
                      subhead: formData.subhead,
                      type: formData.type,
                      amount: formData.amount,
                      description: formData.description,
                      paymentTo: paymentTo,
                      gstApplicable: gstApplicable,
                      gstType: gstType,
                      gstRate: gstRate,
                      cgstAmount: cgstAmount,
                      sgstAmount: sgstAmount,
                      igstAmount: igstAmount,
                      gstAmount: gstAmount,
                      billingPartyGstin: billingPartyGstin,
                      extraDetails: extraDetails,
                      submittedBy: profile?.full_name || user.email
                  })
              });
          }
        } catch (webhookError) {
          console.error('Webhook sync failed:', webhookError);
        }
      }
      
      alert('Petty cash entry saved successfully!');
      onBack();
    } catch (error) {
      console.error('Error:', error);
      alert('Error saving entry.');
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = {
    width: '100%',
    padding: '10px',
    margin: '5px 0 15px',
    border: '1px solid #ccc',
    borderRadius: '4px',
    fontSize: '16px'
  };

  const needsVehicleNumber = ["Vehicle Maintenance", "Vehicle Statutory Exp", "Fines"].includes(formData.head) || formData.subhead === "Petrol Expense";
  const needsGdmNumber = ["Unloading", "GDM Advance Payment", "GDM Addtl Advance", "GDM Balance Receivable", "GDM Balance Payment"].includes(formData.head) || formData.subhead === "Route Batta";
  const needsRouteName = formData.head === "Loading" || formData.subhead === "Collection Batta";
  const needsPartyName = formData.head === "Fast Tag Recharge";
  const isFine = formData.head === "Fines";

  return (
    <div style={{ padding: '20px', maxWidth: '600px', margin: '0 auto', background: '#fff', borderRadius: '8px', boxShadow: '0 2px 10px rgba(0,0,0,0.1)' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '20px' }}>
        <button onClick={onBack} type="button" style={{ background: 'none', border: 'none', marginRight: '15px', cursor: 'pointer' }}>
          <ArrowLeft />
        </button>
        <h2 style={{ fontSize: '20px', margin: 0 }}>Petty Cash Entry</h2>
      </div>
      
      <form onSubmit={handleSubmit}>
        <label>Date</label>
        <input type="date" name="date" value={formData.date} onChange={handleChange} style={inputStyle} required />

        <label>Transaction Type</label>
        <select name="type" value={formData.type} onChange={handleChange} style={{...inputStyle, backgroundColor: '#f0f0f0'}} disabled>
          <option value="Payment">Payment</option>
          <option value="Receipt">Receipt</option>
        </select>

        <label>Category</label>
        <select name="category" value={formData.category} onChange={handleChange} style={inputStyle} required>
          <option value="">Select Category</option>
          {Object.keys(CATEGORIES).map(cat => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>

        <label>Expense Head</label>
        <select name="head" value={formData.head} onChange={handleChange} style={inputStyle} required disabled={!formData.category}>
          <option value="">Select Head</option>
          {availableHeads.map(h => (
            <option key={h.head} value={h.head}>{h.head}</option>
          ))}
        </select>

        {availableSubheads.length > 0 && (
          <div>
            <label>Sub-Head</label>
            <select name="subhead" value={formData.subhead} onChange={handleChange} style={inputStyle} required>
              <option value="">Select Sub-Head</option>
              {availableSubheads.map(sub => (
                <option key={sub} value={sub}>{sub}</option>
              ))}
            </select>
          </div>
        )}

        
        <div style={{ marginBottom: '15px' }}>
          <label>{(formData.head === 'GDM Advance Payment' || formData.head === 'GDM Addtl Advance') ? 'Delivery Driver Name' : 'Payment To / From'}</label>
          {(formData.head === 'GDM Advance Payment' || formData.head === 'GDM Addtl Advance') ? (
            <select
              value={paymentTo}
              onChange={(e) => setPaymentTo(e.target.value)}
              style={inputStyle}
              required
              disabled={isLoadingDrivers}
            >
              <option value="">Select Delivery Driver</option>
              {cachedDrivers.map((d, i) => (
                <option key={i} value={d}>{d}</option>
              ))}
            </select>
          ) : (
            <input type="text" value={paymentTo} onChange={(e) => setPaymentTo(e.target.value)} placeholder="Name of person receiving/giving cash" style={inputStyle} required />
          )}
          {(formData.head === 'GDM Advance Payment' || formData.head === 'GDM Addtl Advance') && isLoadingDrivers && <div style={{color: 'orange', fontSize: '11px', marginTop: '4px'}}>Loading drivers...</div>}
          {debugInfo && <div style={{color: 'red', fontSize: '11px', marginTop: '4px'}}>{debugInfo}</div>}
        </div>

        {needsVehicleNumber && (

            <div className="input-group">
              <label>Vehicle Number</label>
              <select className="input-field" name="vehicleNumber" value={formData.vehicleNumber} onChange={handleChange} style={inputStyle} required>
                <option value="">Select Vehicle</option>
                {vehiclesList.map(v => (
                  <option key={v.id} value={v.vehicle_no}>{v.vehicle_no}</option>
                ))}
              </select>
            </div>
          )}

        {needsGdmNumber && (
          <div style={{ marginBottom: '15px' }}>
            <label>GDM Number <small style={{color: '#666'}}>(To be validated with live data)</small></label>
            <input 
              type="text" 
              name="gdmNumber" 
              value={formData.gdmNumber} 
              onChange={handleChange} 
              onBlur={async (e) => {
                const val = e.target.value.trim();
                if (!val) { setGdmValidationMsg(''); return; }
                setIsGdmValidating(true);
                setGdmValidationMsg('Validating...');
                try {
                  let fetchApiUrl = localStorage.getItem('gdm_read_api_url');
                  if (!fetchApiUrl) {
                    fetchApiUrl = prompt("Enter the new Google Apps Script Web App URL for Reading GDM Data (Topay & Paid Parcel Billing):");
                    if (fetchApiUrl) localStorage.setItem('gdm_read_api_url', fetchApiUrl.trim());
                  }
                  if (!fetchApiUrl) { setGdmValidationMsg('API URL not set'); setIsGdmValidating(false); return; }
                  const res = await fetch(`${fetchApiUrl}?action=validate&gdmNumber=${encodeURIComponent(val)}`);
                  const data = await res.json();
                  if (data.status === 'success') {
                    setGdmValidationMsg('✅ ' + data.message);
                  } else {
                    setGdmValidationMsg('❌ ' + data.message);
                  }
                } catch (err) {
                  setGdmValidationMsg('❌ Validation failed');
                }
                setIsGdmValidating(false);
              }}
              placeholder="Enter GDM Number" 
              style={{...inputStyle, borderColor: gdmValidationMsg.includes('❌') ? 'red' : gdmValidationMsg.includes('✅') ? 'green' : '#ddd'}} 
              required 
            />
            {gdmValidationMsg && (
              <div style={{color: gdmValidationMsg.includes('❌') ? 'red' : gdmValidationMsg.includes('✅') ? 'green' : 'orange', fontSize: '11px', marginTop: '4px'}}>
                {gdmValidationMsg}
              </div>
            )}
          </div>
        )}

        {needsRouteName && (
          <div>
            <label>{formData.head === 'Loading' ? 'Route Name / LR Nos' : 'Collection Route Name'}</label>
            <input type="text" name="routeName" value={formData.routeName} onChange={handleChange} placeholder="Enter Route or LR Nos" style={inputStyle} required />
          </div>
        )}

        {needsPartyName && (
          <div>
            <label>Credit To (Party Name)</label>
            <input type="text" name="partyName" value={formData.partyName} onChange={handleChange} placeholder="Enter Party Name" style={inputStyle} required />
          </div>
        )}

        {isFine && (
          <div style={{ padding: '10px', background: '#f8f9fa', border: '1px solid #ddd', borderRadius: '4px', marginBottom: '15px' }}>
            <label style={{ fontWeight: 'bold' }}>Debit To (Who pays for the fine?)</label>
            <div style={{ display: 'flex', gap: '15px', margin: '10px 0' }}>
              <label>
                <input type="radio" name="debitTo" value="Company" checked={formData.debitTo === 'Company'} onChange={handleChange} /> Company
              </label>
              <label>
                <input type="radio" name="debitTo" value="Driver" checked={formData.debitTo === 'Driver'} onChange={handleChange} /> Driver (Driver's mistake)
              </label>
            </div>
            
            {formData.debitTo === 'Driver' && (
              <div style={{ marginTop: '10px' }}>
                <label>Driver Name</label>
                <input type="text" name="driverName" value={formData.driverName} onChange={handleChange} placeholder="Enter Driver Name" style={inputStyle} required />
              </div>
            )}
          </div>
        )}

        
        <label>Amount (₹)</label>
        <input type="number" name="amount" value={formData.amount} onChange={handleChange} step="0.01" style={inputStyle} required />

        <div style={{ background: '#f8f9fa', padding: '15px', borderRadius: '8px', marginBottom: '15px', border: '1px dashed #ccc' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
            <input type="checkbox" id="gstApplicable" checked={gstApplicable} onChange={e => setGstApplicable(e.target.checked)} style={{ width: '18px', height: '18px' }} />
            <label htmlFor="gstApplicable" style={{ margin: 0, fontWeight: 'bold', color: 'var(--primary)' }}>GST Applicable</label>
          </div>

          {gstApplicable && (
            <div style={{ marginTop: '15px', paddingLeft: '5px' }}>
              <div style={{ marginBottom: '10px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontSize: '13px', color: '#555' }}>Select GST Type</label>
                <div style={{ display: 'flex', gap: '15px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer' }}>
                    <input type="radio" name="gstType" value="Kerala" checked={gstType === 'Kerala'} onChange={e => setGstType(e.target.value)} />
                    Kerala
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer' }}>
                    <input type="radio" name="gstType" value="IGST" checked={gstType === 'IGST'} onChange={e => setGstType(e.target.value)} />
                    IGST
                  </label>
                </div>
              </div>
              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontSize: '13px', color: '#555' }}>Select Percentage</label>
                <div style={{ display: 'flex', gap: '15px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer' }}>
                    <input type="radio" name="gstRate" value="5" checked={gstRate === '5'} onChange={e => setGstRate(e.target.value)} /> 5%
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer' }}>
                    <input type="radio" name="gstRate" value="12" checked={gstRate === '12'} onChange={e => setGstRate(e.target.value)} /> 12%
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer' }}>
                    <input type="radio" name="gstRate" value="18" checked={gstRate === '18'} onChange={e => setGstRate(e.target.value)} /> 18%
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer' }}>
                    <input type="radio" name="gstRate" value="28" checked={gstRate === '28'} onChange={e => setGstRate(e.target.value)} /> 28%
                  </label>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                {gstType === 'Kerala' ? (
                  <>
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: '13px', color: '#555' }}>CGST Amount</label>
                      <input type="text" value={cgstAmount} readOnly style={{ ...inputStyle, backgroundColor: '#e9ecef', margin: '5px 0' }} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: '13px', color: '#555' }}>SGST Amount</label>
                      <input type="text" value={sgstAmount} readOnly style={{ ...inputStyle, backgroundColor: '#e9ecef', margin: '5px 0' }} />
                    </div>
                  </>
                ) : (
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '13px', color: '#555' }}>IGST Amount</label>
                    <input type="text" value={igstAmount} readOnly style={{ ...inputStyle, backgroundColor: '#e9ecef', margin: '5px 0' }} />
                  </div>
                )}
              </div>
              <div style={{ marginBottom: '10px' }}>
                <label style={{ fontSize: '13px', color: '#555', fontWeight: 'bold' }}>Total GST Amount</label>
                <input type="text" value={gstAmount} readOnly style={{ ...inputStyle, backgroundColor: '#e9ecef', margin: '5px 0', fontWeight: 'bold' }} />
              </div>
              <div>
                <label style={{ fontSize: '13px', color: '#555' }}>Billing Party GSTIN</label>
                <input type="text" value={billingPartyGstin} onChange={e => setBillingPartyGstin(e.target.value.toUpperCase())} placeholder="e.g. 32AAGCE4200M1ZY" style={{ ...inputStyle, margin: '5px 0' }} />
              </div>
            </div>
          )}
        </div>


        <label>Description / Note</label>
        <textarea name="description" value={formData.description} onChange={handleChange} rows="3" style={inputStyle}></textarea>

        <button 
          type="submit" 
          disabled={loading}
          style={{
            width: '100%',
            padding: '12px',
            backgroundColor: 'var(--primary, #007bff)',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            fontSize: '16px',
            fontWeight: 'bold',
            cursor: 'pointer',
            marginTop: '10px'
          }}
        >
          {loading ? 'Saving...' : `Save ${formData.type}`}
        </button>
      </form>
    </div>
  );
}
