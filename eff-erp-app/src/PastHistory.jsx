import React, { useState, useEffect } from 'react';
import { supabase } from './supabase';
import { ArrowLeft, Clock, FileText, Camera, CheckCircle, XCircle } from 'lucide-react';

export default function PastHistory({ user, profile, onBack }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState(null);

  useEffect(() => {
    fetchPastHistory();
  }, [profile]);

  const fetchPastHistory = async () => {
    try {
      setLoading(true);
      if (!profile) return;

      // Fetch all requests that are Approved or Rejected
      const { data, error } = await supabase
        .from('expense_requests')
        .select(`
          *,
          profiles:user_id (full_name)
        `)
        .in('status', ['Approved', 'Rejected'])
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Show VM requests only to owner or higher-level approvers
      const vmCategories = ['Vehicle Rent', 'Vehicle Rent Balance Payment', 'Vehicle Maintenance'];
      const filtered = (data || []).filter(req => {
        const isVM = vmCategories.includes(req.category);
        if (!isVM) return true;
        // Owner can always see their own request
        if (req.user_id === user.id) return true;
        // Higher-level approvers can see VM past history
        return ['FM', 'RM', 'CEO', 'MD'].includes(profile.role);
      });

      setRequests(filtered);
    } catch (err) {
      console.error('Error fetching past history:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRetrySync = async (req) => {
    try {
      const webhookUrl = import.meta.env.VITE_GOOGLE_WEBHOOK_URL || localStorage.getItem('google_webhook_url');
      if (!webhookUrl) {
        alert("Webhook URL is not set.");
        return;
      }
      
      const payload = {
        id: req.id,
        category: req.category,
        sub_category: req.sub_category,
        amount: req.amount,
        gst_amount: req.gst_amount,
        total_amount: req.total_amount,
        user_role: req.profiles?.full_name || 'User',
        branch: req.branch || 'HO',
        status: req.status,
        details: req.details || {}
      };

      const res = await fetch(webhookUrl, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      
      if (!res.ok) throw new Error('Network response was not ok');

      const updatedDetails = { ...(req.details || {}), sheetSync: 'Success' };
      await supabase.from('expense_requests').update({ details: updatedDetails }).eq('id', req.id);
      
      alert("Synced to Google Sheet successfully!");
      fetchPastHistory();
    } catch (err) {
      alert("Still failed to sync: " + err.message);
    }
  };

  return (
    <div style={{ padding: '20px' }}>
      <button 
        onClick={onBack} 
        style={{ 
          background: 'none', 
          border: 'none', 
          color: 'var(--primary)', 
          marginBottom: '20px', 
          fontWeight: 'bold',
          display: 'flex',
          alignItems: 'center',
          gap: '5px',
          cursor: 'pointer'
        }}
      >
        <ArrowLeft size={18} /> Back to Dashboard
      </button>

      <h2 style={{ marginBottom: '5px', fontSize: '20px' }}>Past History</h2>
      <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '20px' }}>
        Track requests that have been fully approved or rejected.
      </p>

      {loading ? (
        <p>Loading...</p>
      ) : requests.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '30px' }}>
          <p>No past history found.</p>
        </div>
      ) : (
        requests.map(req => (
          <div key={req.id} className="card" style={{ marginBottom: '10px', padding: '15px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
              <strong style={{ fontSize: '15px' }}>{req.profiles?.full_name || 'Unknown'}</strong>
              <span style={{ color: 'var(--primary)', fontWeight: 'bold', fontSize: '16px' }}>₹{req.total_amount}</span>
            </div>
            
            <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: '0 0 10px 0' }}>
              Category: {req.category} {req.sub_category ? `(${req.sub_category})` : ''} | Date: {new Date(req.created_at).toLocaleDateString()}
            </p>

            {/* Status Badge */}
            <div style={{ 
              display: 'inline-flex', 
              alignItems: 'center', 
              gap: '6px', 
              background: req.status === 'Approved' ? '#dcfce7' : '#fee2e2', 
              color: req.status === 'Approved' ? '#166534' : '#991b1b', 
              padding: '6px 12px', 
              borderRadius: '20px', 
              fontSize: '12px', 
              fontWeight: 'bold',
              marginBottom: '10px',
              border: `1px solid ${req.status === 'Approved' ? '#bbf7d0' : '#fecaca'}`
            }}>
              {req.status === 'Approved' ? <CheckCircle size={14} /> : <XCircle size={14} />} 
              {req.status}
            </div>

            {/* Sync Retry Button */}
            {req.status === 'Approved' && req.details?.sheetSync !== 'Success' && (
              <button 
                onClick={() => handleRetrySync(req)}
                style={{
                  background: '#ef4444',
                  color: 'white',
                  border: 'none',
                  borderRadius: '20px',
                  padding: '6px 12px',
                  fontSize: '12px',
                  fontWeight: 'bold',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  cursor: 'pointer',
                  marginLeft: '10px',
                  marginBottom: '10px',
                  boxShadow: '0 2px 4px rgba(239,68,68,0.3)'
                }}
              >
                ⚠️ Sync Failed - Click to Retry
              </button>
            )}

            {/* Compact Details Box */}
            {req.details && (
              <div style={{ background: '#f8f9fa', padding: '10px', borderRadius: '6px', fontSize: '12px', border: '1px solid #eef2ff' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 10px' }}>
                  {req.details.vehicleNo && <div><strong>Vehicle No:</strong> {req.details.vehicleNo}</div>}
                  {req.details.odometerReading && <div><strong>Odometer:</strong> {req.details.odometerReading}</div>}
                  {req.details.workshopName && <div style={{ gridColumn: 'span 2' }}><strong>Workshop:</strong> {req.details.workshopName}</div>}
                  {req.details.vendor && <div style={{ gridColumn: 'span 2' }}><strong>Vendor:</strong> {req.details.vendor}</div>}
                  {req.details.toWhom && <div style={{ gridColumn: 'span 2' }}><strong>To Whom:</strong> {req.details.toWhom}</div>}
                  {req.details.paymentType && <div><strong>Payment:</strong> {req.details.paymentType}</div>}
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
                {req.details.tdsDeduction && (
                  <div style={{ marginTop: '5px', borderTop: '1px solid #eee', paddingTop: '5px', color: '#166534' }}>
                    <strong>TDS Deduction:</strong> ₹{req.details.tdsDeduction}
                  </div>
                )}
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
            
            {/* Remarks History */}
            {req.details?.remarksHistory && req.details.remarksHistory.length > 0 && (
              <div style={{ marginTop: '10px', background: '#fffbeb', padding: '10px', borderRadius: '6px', border: '1px solid #fef3c7', fontSize: '11px' }}>
                <h4 style={{ margin: '0 0 4px 0', color: '#b45309' }}>Remarks History</h4>
                {req.details.remarksHistory.map((rem, i) => (
                  <div key={i} style={{ borderBottom: i < req.details.remarksHistory.length - 1 ? '1px solid #fde68a' : 'none', paddingBottom: '2px', marginBottom: '2px' }}>
                    <strong>{rem.name} ({rem.role}):</strong> {rem.type} - {rem.text}
                  </div>
                ))}
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
