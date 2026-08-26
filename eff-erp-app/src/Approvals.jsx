import React, { useState, useEffect } from 'react';
import { supabase } from './supabase';
import { CheckCircle, XCircle } from 'lucide-react';

export default function Approvals({ user, profile, onBack }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);

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
      
      let nextLevel = null;
      let newStatus = 'Pending';
      
      if (nextLevelRaw === 'Approved') {
        newStatus = 'Approved';
      } else {
        nextLevel = nextLevelRaw;
      }

      // Update the request
      const { error } = await supabase
        .from('expense_requests')
        .update({ 
          current_level: nextLevel,
          status: newStatus
        })
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
        try {
          // Send to local proxy API or directly. Since this is client side, we can just fetch the Google script directly
          // Assuming the user will deploy the App Script and paste the URL here. 
          // For now, we mock the fetch or use a placeholder URL.
          const webhookUrl = localStorage.getItem('google_webhook_url');
          if (webhookUrl) {
            await fetch(webhookUrl, {
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
                details: request.details || {}
              })
            });
          } else {
            console.warn('Google Webhook URL not set in localStorage');
          }
        } catch (e) {
          console.error('Webhook failed', e);
        }
      }

      alert(newStatus === 'Approved' ? 'Request Fully Approved!' : `Approved! Forwarded to ${nextLevel}`);
      fetchRequests();
    } catch (err) {
      alert('Error: ' + err.message);
    }
  };

  const handleReject = async (request) => {
    try {
      const { error } = await supabase
        .from('expense_requests')
        .update({ status: 'Rejected' })
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
          <div key={req.id} className="card" style={{ marginBottom: '15px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
              <strong style={{ fontSize: '18px' }}>{req.profiles?.full_name || 'Unknown'}</strong>
              <span style={{ color: 'var(--primary)', fontWeight: 'bold' }}>₹{req.total_amount}</span>
            </div>
             <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginBottom: '15px' }}>
              Category: {req.category} {req.sub_category ? `(${req.sub_category})` : ''}<br/>
              Requested on: {new Date(req.created_at).toLocaleDateString()}
            </p>

            {/* Expense details block */}
            {req.details && (
              <div style={{ background: '#f8f9fa', padding: '12px', borderRadius: '8px', marginBottom: '15px', fontSize: '14px', border: '1px solid #eef2ff' }}>
                <h4 style={{ margin: '0 0 8px 0', fontSize: '13px', color: 'var(--primary)' }}>Details</h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 15px' }}>
                  {req.details.vehicleNo && <div><strong>Vehicle No:</strong> {req.details.vehicleNo}</div>}
                  {req.details.odometerReading && <div><strong>Odometer:</strong> {req.details.odometerReading}</div>}
                  {req.details.workshopName && <div><strong>Workshop:</strong> {req.details.workshopName}</div>}
                  {req.details.vendor && <div><strong>Vendor:</strong> {req.details.vendor}</div>}
                  {req.details.toWhom && <div><strong>To Whom:</strong> {req.details.toWhom}</div>}
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
                  <div style={{ marginTop: '8px', borderTop: '1px solid #eee', paddingTop: '8px' }}>
                    <strong>Description:</strong> {req.details.putDescription}
                  </div>
                )}
                {/* GST breakdown */}
                {(req.details.cgstAmount > 0 || req.details.sgstAmount > 0 || req.details.igstAmount > 0) && (
                  <div style={{ marginTop: '8px', borderTop: '1px solid #eee', paddingTop: '8px', display: 'flex', gap: '15px', color: '#666', fontSize: '12px' }}>
                    {req.details.cgstAmount > 0 && <span><strong>CGST:</strong> ₹{req.details.cgstAmount}</span>}
                    {req.details.sgstAmount > 0 && <span><strong>SGST:</strong> ₹{req.details.sgstAmount}</span>}
                    {req.details.igstAmount > 0 && <span><strong>IGST:</strong> ₹{req.details.igstAmount}</span>}
                  </div>
                )}
              </div>
            )}

            {/* Bill Photo Preview */}
            {req.image_url && (
              <div style={{ marginBottom: '15px', textAlign: 'center' }}>
                <a href={req.image_url} target="_blank" rel="noopener noreferrer">
                  <img 
                    src={req.image_url} 
                    alt="Bill Document" 
                    style={{ maxWidth: '100%', maxHeight: '200px', borderRadius: '6px', border: '1px solid #ddd', cursor: 'zoom-in' }} 
                  />
                </a>
                <p style={{ margin: '5px 0 0 0', fontSize: '11px', color: 'var(--text-muted)' }}>Click image to zoom/view</p>
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px' }}>
              <button 
                className="btn btn-primary" 
                style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '5px' }}
                onClick={() => handleApprove(req)}
              >
                <CheckCircle size={18} /> Approve
              </button>
              <button 
                className="btn" 
                style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '5px', background: '#fee2e2', color: '#dc2626', border: 'none' }}
                onClick={() => handleReject(req)}
              >
                <XCircle size={18} /> Reject
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
