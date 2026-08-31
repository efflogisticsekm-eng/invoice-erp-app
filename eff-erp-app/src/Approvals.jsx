import React, { useState, useEffect } from 'react';
import { supabase } from './supabase';
import { CheckCircle, XCircle, Camera, HelpCircle } from 'lucide-react';

export default function Approvals({ user, profile, onBack }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState(null);
  const [activeRemarksReq, setActiveRemarksReq] = useState(null);
  const [remarksText, setRemarksText] = useState('');

  useEffect(() => {
    fetchRequests();
  }, []);

  const fetchRequests = async () => {
    try {
      setLoading(true);
      // Fetch requests where current_level matches the user's role
      const { data, error } = await supabase
        .from('expense_requests')
        .select(`
          *,
          profiles:user_id (full_name)
        `)
        .eq('current_level', profile.role)
        .eq('status', 'Pending');
        
      if (error) throw error;
      setRequests(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Compute next level based on Approval Matrix
  const computeNextLevel = (cat, subCat, role) => {
    let chain = [];
    if (cat === 'Vehicle Maintenance') {
      if (subCat === 'Accident' || subCat === 'Brake down') {
        chain = ['VM', 'FM', 'CEO', 'MD'];
      } else {
        chain = ['VM', 'FM', 'MD'];
      }
    } else if (cat === 'Vehicle Rent' || cat === 'Vehicle Rent Balance Payment') {
      chain = ['RM', 'FM', 'MD'];
    } else if (cat === 'Traveling Exp' || cat === 'Hotel Rooms' || cat === 'Uniform' || cat === 'Bonnus' || cat === 'Man Power out sourse') {
      chain = ['RM', 'HR', 'FM', 'CEO', 'MD'];
    } else if (cat === 'Stationary Purchase' || cat === 'Telephone Bill' || cat === 'Internet Bill' || cat === 'Staff Accomodation Rent' || cat === 'Ware house Rent' || cat === 'Union Charge' || cat === 'Petty Cash') {
      chain = ['RM', 'FM', 'CEO', 'MD'];
    } else if (cat === 'Office Rent' || cat === 'Subscription' || cat === 'Salary') {
      chain = ['FM', 'CEO', 'MD'];
    } else if (cat === 'Fuel Charge' || cat === 'Sub Contractor Payment' || cat === 'GST' || cat === 'TDS') {
      chain = ['FM', 'MD'];
    } else {
      chain = ['MD'];
    }
  
    const roleIndex = chain.indexOf(role);
    if (roleIndex !== -1 && roleIndex < chain.length - 1) {
      return chain[roleIndex + 1];
    } else {
      return 'Approved'; // Final approver submitted it
    }
  };

  const handleApprove = async (request) => {
    try {
      const nextLevelRaw = computeNextLevel(request.category, request.sub_category, profile.role);
      
      let nextLevel = 'Approved';
      let newStatus = 'Pending';
      
      if (nextLevelRaw === 'Approved') {
        newStatus = 'Approved';
      } else {
        nextLevel = nextLevelRaw;
      }

      // Update the request - only update current_level if it's not fully approved
      const updatedDetails = { ...(request.details || {}) };
      if (!updatedDetails.approvalChain) {
        updatedDetails.approvalChain = [];
      }
      updatedDetails.approvalChain.push(`${profile.full_name} (${profile.role})`);

      const updateData = { status: newStatus, details: updatedDetails };
      if (newStatus !== 'Approved') {
        updateData.current_level = nextLevel;
      }
      
      const { error } = await supabase
        .from('expense_requests')
        .update(updateData)
        .eq('id', request.id);

      if (error) throw error;

      // Log the approval
      await supabase.from('approvals').insert({
        request_id: request.id,
        approver_id: user.id,
        status: 'Approved'
      });
      
      // TRIGGER WEBHOOK IF FULLY APPROVED
      if (newStatus === 'Approved') {
        let syncStatus = 'Failed';
        try {
          const webhookUrl = import.meta.env.VITE_GOOGLE_WEBHOOK_URL || localStorage.getItem('google_webhook_url');
          if (webhookUrl) {
            const res = await fetch(webhookUrl, {
              method: 'POST',
              body: JSON.stringify({
                id: request.id,
                category: request.category,
                sub_category: request.sub_category,
                amount: request.amount,
                gst_amount: request.gst_amount,
                total_amount: request.total_amount,
                user_role: request.profiles?.full_name || 'User',
                branch: request.branch || 'HO',
                status: 'Approved',
                details: updatedDetails
              })
            });
            if (res.ok) syncStatus = 'Success';
          } else {
            console.warn('Google Webhook URL not set in localStorage');
          }
        } catch (e) {
          console.error('Webhook failed', e);
        }

        updatedDetails.sheetSync = syncStatus;
        await supabase.from('expense_requests').update({ details: updatedDetails }).eq('id', request.id);
      }

      alert(newStatus === 'Approved' ? 'Request Fully Approved!' : `Approved! Forwarded to ${nextLevel}`);
      fetchRequests();
    } catch (err) {
      alert('Error: ' + err.message);
    }
  };

  const handleReject = async (request, remarks) => {
    try {
      const updatedDetails = {
        ...(request.details || {}),
        remarksHistory: [
          ...(request.details?.remarksHistory || []),
          {
            role: profile.role,
            name: profile.full_name,
            date: new Date().toISOString(),
            type: 'Reject',
            text: remarks
          }
        ]
      };

      const { error } = await supabase
        .from('expense_requests')
        .update({ 
          status: 'Rejected',
          details: updatedDetails
        })
        .eq('id', request.id);

      if (error) throw error;

      await supabase.from('approvals').insert({
        request_id: request.id,
        approver_id: user.id,
        status: 'Rejected'
      });

      alert('Request Rejected');
      fetchRequests();
    } catch (err) {
      alert('Error: ' + err.message);
    }
  };

  const handleClarification = async (request, remarks) => {
    try {
      const computePreviousLevel = (cat, subCat, currentRole) => {
        let chain = [];
        if (cat === 'Vehicle Maintenance') {
          if (subCat === 'Accident' || subCat === 'Brake down') {
            chain = ['VM', 'FM', 'CEO', 'MD'];
          } else {
            chain = ['VM', 'FM', 'MD'];
          }
        } else if (cat === 'Vehicle Rent' || cat === 'Vehicle Rent Balance Payment') {
          chain = ['RM', 'FM', 'MD'];
        } else if (cat === 'Traveling Exp' || cat === 'Hotel Rooms' || cat === 'Uniform' || cat === 'Bonnus' || cat === 'Man Power out sourse') {
          chain = ['RM', 'HR', 'FM', 'CEO', 'MD'];
        } else if (cat === 'Stationary Purchase' || cat === 'Telephone Bill' || cat === 'Internet Bill' || cat === 'Staff Accomodation Rent' || cat === 'Ware house Rent' || cat === 'Union Charge' || cat === 'Petty Cash') {
          chain = ['RM', 'FM', 'CEO', 'MD'];
        } else if (cat === 'Office Rent' || cat === 'Subscription' || cat === 'Salary') {
          chain = ['FM', 'CEO', 'MD'];
        } else if (cat === 'Fuel Charge' || cat === 'Sub Contractor Payment' || cat === 'GST' || cat === 'TDS') {
          chain = ['FM', 'MD'];
        } else {
          chain = ['MD'];
        }

        const roleIndex = chain.indexOf(currentRole);
        if (roleIndex > 0) {
          return chain[roleIndex - 1]; // Go back to previous approver
        } else {
          return 'BM'; // Go back to submitter (BM)
        }
      };

      const prevLevel = computePreviousLevel(request.category, request.sub_category, profile.role);
      
      const updatedDetails = {
        ...(request.details || {}),
        clarifiedBy: profile.role, // Track who requested clarification
        remarksHistory: [
          ...(request.details?.remarksHistory || []),
          {
            role: profile.role,
            name: profile.full_name,
            date: new Date().toISOString(),
            type: 'Clarification',
            text: remarks
          }
        ]
      };

      // Set status to Clarification, current_level to prevLevel
      const { error } = await supabase
        .from('expense_requests')
        .update({
          status: 'Clarification',
          current_level: prevLevel,
          details: updatedDetails
        })
        .eq('id', request.id);

      if (error) throw error;

      alert(`Request sent back for clarification to ${prevLevel}`);
      fetchRequests();
    } catch (err) {
      alert('Error: ' + err.message);
    }
  };

  return (
    <div style={{ padding: '20px' }}>
      <button onClick={onBack} style={{ background: 'none', border: 'none', color: 'var(--primary)', marginBottom: '20px', fontWeight: 'bold' }}>
        &larr; Back to Dashboard
      </button>

      <h2 style={{ marginBottom: '20px' }}>Pending Approvals</h2>

      {loading ? (
        <p>Loading...</p>
      ) : requests.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
          <p>No pending approvals for you.</p>
        </div>
      ) : (
        requests.map(req => (
          <div key={req.id} className="card" style={{ marginBottom: '10px', padding: '15px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
              <strong style={{ fontSize: '16px' }}>{req.profiles?.full_name || 'Unknown'}</strong>
              <span style={{ color: 'var(--primary)', fontWeight: 'bold', fontSize: '18px' }}>₹{req.total_amount}</span>
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: '0 0 10px 0' }}>
              Category: {req.category} {req.sub_category ? `(${req.sub_category})` : ''} | Date: {new Date(req.created_at).toLocaleDateString()}
            </p>

            {/* Expense details block */}
            {req.details && (
              <div style={{ background: '#f8f9fa', padding: '10px', borderRadius: '6px', marginBottom: '10px', fontSize: '13px', border: '1px solid #eef2ff' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 10px' }}>
                  {req.details.vehicleNo && <div><strong>Vehicle No:</strong> {req.details.vehicleNo}</div>}
                  {req.details.odometerReading && <div><strong>Odometer:</strong> {req.details.odometerReading}</div>}
                  {req.details.workshopName && <div style={{ gridColumn: 'span 2' }}><strong>Workshop:</strong> {req.details.workshopName}</div>}
                  {req.details.vendor && <div style={{ gridColumn: 'span 2' }}><strong>Vendor:</strong> {req.details.vendor}</div>}
                  {req.details.toWhom && <div style={{ gridColumn: 'span 2' }}><strong>To Whom:</strong> {req.details.toWhom}</div>}
                  {req.details.paymentType && <div><strong>Payment:</strong> {req.details.paymentType}</div>}
                  {req.details.lrNo && <div><strong>LR No:</strong> {req.details.lrNo}</div>}
                  {req.details.lrDate && <div><strong>LR Date:</strong> {req.details.lrDate}</div>}
                  {req.details.totalWeight && <div><strong>Total Weight:</strong> {req.details.totalWeight}</div>}
                  {req.details.destination && <div><strong>Destination:</strong> {req.details.destination}</div>}
                  {req.details.approximateKm && <div><strong>Approximate Km:</strong> {req.details.approximateKm}</div>}
                  {req.details.vehicleType && <div><strong>Vehicle Type:</strong> {req.details.vehicleType}</div>}
                  {req.details.vehicleRent && <div><strong>Vehicle Rent:</strong> ₹{req.details.vehicleRent}</div>}
                  {req.details.unionCharges && <div><strong>Union Charges:</strong> ₹{req.details.unionCharges}</div>}
                  {req.details.rentAdvance && <div><strong>Rent Advance:</strong> ₹{req.details.rentAdvance}</div>}
                </div>
                {req.details.putDescription && (
                  <div style={{ marginTop: '5px', borderTop: '1px solid #eee', paddingTop: '5px' }}>
                    <strong>Description:</strong> {req.details.putDescription}
                  </div>
                )}
                {/* GST breakdown */}
                {(req.details.cgstAmount > 0 || req.details.sgstAmount > 0 || req.details.igstAmount > 0) && (
                  <div style={{ marginTop: '5px', borderTop: '1px solid #eee', paddingTop: '5px', display: 'flex', gap: '15px', color: '#666', fontSize: '11px' }}>
                    {req.details.cgstAmount > 0 && <span><strong>CGST:</strong> ₹{req.details.cgstAmount}</span>}
                    {req.details.sgstAmount > 0 && <span><strong>SGST:</strong> ₹{req.details.sgstAmount}</span>}
                    {req.details.igstAmount > 0 && <span><strong>IGST:</strong> ₹{req.details.igstAmount}</span>}
                  </div>
                )}

                {/* View Bill Photo Button inside the Details block */}
                {req.image_url && (
                  <div style={{ marginTop: '8px', borderTop: '1px solid #eee', paddingTop: '8px' }}>
                    <button 
                      type="button" 
                      onClick={() => setSelectedImage(req.image_url)}
                      style={{
                        background: '#eff6ff',
                        color: '#2563eb',
                        border: '1px solid #bfdbfe',
                        borderRadius: '4px',
                        padding: '4px 8px',
                        fontSize: '11px',
                        fontWeight: 'bold',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        cursor: 'pointer'
                      }}
                    >
                      <Camera size={14} /> View Bill Photo
                    </button>
                  </div>
                )}
              </div>
            )}
            {/* Remarks History Audit Log */}
            {req.details?.remarksHistory && req.details.remarksHistory.length > 0 && (
              <div style={{ background: '#fffbeb', padding: '10px', borderRadius: '6px', border: '1px solid #fef3c7', marginBottom: '10px', fontSize: '12px' }}>
                <h4 style={{ margin: '0 0 6px 0', fontSize: '12px', color: '#b45309', fontWeight: 'bold' }}>History of Remarks</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {req.details.remarksHistory.map((rem, i) => (
                    <div key={i} style={{ borderBottom: i < req.details.remarksHistory.length - 1 ? '1px solid #fde68a' : 'none', paddingBottom: '4px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: '#92400e', fontWeight: 'bold' }}>
                        <span>{rem.name} ({rem.role})</span>
                        <span style={{ fontSize: '9px', fontWeight: 'normal' }}>{new Date(rem.date).toLocaleDateString()}</span>
                      </div>
                      <div style={{ fontStyle: rem.type === 'Justification' ? 'italic' : 'normal', color: '#4b5563', marginTop: '2px' }}>
                        <strong>{rem.type}:</strong> {rem.text}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Inline Remarks Input for Clarification or Rejection */}
            {activeRemarksReq && activeRemarksReq.id === req.id ? (
              <div style={{ marginTop: '5px', background: '#fef2f2', padding: '10px', borderRadius: '6px', border: '1px solid #fee2e2' }}>
                <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#991b1b', display: 'block', marginBottom: '4px' }}>
                  Remarks for {activeRemarksReq.type === 'Reject' ? 'Rejection' : 'Clarification'}:
                </label>
                <textarea
                  style={{ width: '100%', boxSizing: 'border-box', padding: '8px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '12px', resize: 'vertical' }}
                  rows="2"
                  value={remarksText}
                  onChange={e => setRemarksText(e.target.value)}
                  placeholder="Enter reason or questions..."
                  required
                />
                <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                  <button
                    onClick={() => {
                      if (!remarksText.trim()) {
                        alert('Remarks are required!');
                        return;
                      }
                      if (activeRemarksReq.type === 'Reject') {
                        handleReject(req, remarksText);
                      } else {
                        handleClarification(req, remarksText);
                      }
                      setActiveRemarksReq(null);
                      setRemarksText('');
                    }}
                    style={{ flex: 1, padding: '8px', background: activeRemarksReq.type === 'Reject' ? '#dc2626' : '#ea580c', border: 'none', color: 'white', fontWeight: 'bold', borderRadius: '4px', fontSize: '11px', cursor: 'pointer' }}
                  >
                    Submit
                  </button>
                  <button
                    onClick={() => {
                      setActiveRemarksReq(null);
                      setRemarksText('');
                    }}
                    style={{ flex: 1, padding: '8px', background: '#e5e7eb', border: 'none', color: '#374151', fontWeight: 'bold', borderRadius: '4px', fontSize: '11px', cursor: 'pointer' }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: '5px', marginTop: '5px' }}>
                <button 
                  className="btn btn-primary" 
                  style={{ flex: 1.2, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '4px', padding: '10px 8px', fontSize: '12px' }}
                  onClick={() => handleApprove(req)}
                >
                  <CheckCircle size={15} /> Approve
                </button>
                
                <button 
                  className="btn" 
                  style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '4px', background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', padding: '10px 8px', fontSize: '12px' }}
                  onClick={() => {
                    setActiveRemarksReq({ id: req.id, type: 'Clarification' });
                    setRemarksText('');
                  }}
                >
                  <HelpCircle size={15} /> Clarify
                </button>

                <button 
                  className="btn" 
                  style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '4px', background: '#fee2e2', color: '#dc2626', border: 'none', padding: '10px 8px', fontSize: '12px' }}
                  onClick={() => {
                    setActiveRemarksReq({ id: req.id, type: 'Reject' });
                    setRemarksText('');
                  }}
                >
                  <XCircle size={15} /> Reject
                </button>
              </div>
            )}
          </div>
        ))
      )}

      {/* Full Screen Image Modal */}
      {selectedImage && (
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.9)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 9999,
            padding: '10px'
          }}
          onClick={() => setSelectedImage(null)}
        >
          <div style={{ position: 'relative', maxWidth: '100%', maxHeight: '95%' }} onClick={e => e.stopPropagation()}>
            <img 
              src={selectedImage} 
              alt="Enlarged Bill" 
              style={{ maxWidth: '100vw', maxHeight: '85vh', borderRadius: '4px', boxShadow: '0 4px 20px rgba(0,0,0,0.8)', objectFit: 'contain' }} 
            />
            <button 
              onClick={() => setSelectedImage(null)}
              style={{
                position: 'absolute',
                top: '-45px',
                right: '10px',
                background: 'white',
                border: 'none',
                borderRadius: '50%',
                width: '35px',
                height: '35px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 'bold',
                fontSize: '18px',
                cursor: 'pointer',
                boxShadow: '0 2px 5px rgba(0,0,0,0.3)'
              }}
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
