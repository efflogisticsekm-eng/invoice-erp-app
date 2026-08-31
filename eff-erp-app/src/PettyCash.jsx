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
    { head: "GDM Bal Receipt", type: "Receipt" },
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
  const [loading, setLoading] = useState(false);

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
    if (needsVehicleNumber && formData.vehicleNumber) extraDetails.vehicleNumber = formData.vehicleNumber;
    if (needsGdmNumber && formData.gdmNumber) extraDetails.gdmNumber = formData.gdmNumber;
    if (needsRouteName && formData.routeName) extraDetails.routeName = formData.routeName;
    if (needsPartyName && formData.partyName) extraDetails.partyName = formData.partyName;
    if (isFine) {
        extraDetails.debitTo = formData.debitTo;
        if (formData.debitTo === 'Driver') extraDetails.driverName = formData.driverName;
    }

    try {
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
      
      // Google Sheets Webhook Sync
      try {
        const webhookUrl = import.meta.env.VITE_GOOGLE_WEBHOOK_URL || localStorage.getItem('google_webhook_url');
        if (webhookUrl) {
            await fetch(webhookUrl, {
                method: 'POST',
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
                    extraDetails: extraDetails,
                    submittedBy: profile?.full_name || user.email
                })
            });
        }
      } catch (webhookError) {
        console.error('Webhook sync failed:', webhookError);
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
  const needsGdmNumber = ["Unloading", "GDM Advance Payment", "GDM Addtl Advance", "GDM Bal Receipt"].includes(formData.head) || formData.subhead === "Route Batta";
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

        {needsVehicleNumber && (
          <div>
            <label>Vehicle Number</label>
            <input type="text" name="vehicleNumber" value={formData.vehicleNumber} onChange={handleChange} placeholder="e.g. KL 07 AB 1234" style={inputStyle} required />
          </div>
        )}

        {needsGdmNumber && (
          <div>
            <label>GDM Number <small style={{color: '#666'}}>(To be validated with live data)</small></label>
            <input type="text" name="gdmNumber" value={formData.gdmNumber} onChange={handleChange} placeholder="Enter GDM Number" style={inputStyle} required />
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
