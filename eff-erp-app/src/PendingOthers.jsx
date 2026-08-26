import React, { useState, useEffect } from 'react';
import { supabase } from './supabase';
import { ArrowLeft, Clock, FileText, Camera } from 'lucide-react';

export default function PendingOthers({ user, profile, onBack }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState(null);

  useEffect(() => {
    fetchPendingOthers();
  }, [profile]);

  const fetchPendingOthers = async () => {
    try {
      setLoading(true);
      if (!profile) return;

      // Fetch all requests that are pending but NOT at the current user's level
      const { data, error } = await supabase
        .from('expense_requests')
        .select(`
          *,
          profiles:user_id (full_name)
        `)
        .eq('status', 'Pending')
        .neq('current_level', profile.role)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setRequests(data || []);
    } catch (err) {
      console.error('Error fetching pending others:', err);
    } finally {
      setLoading(false);
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

      <h2 style={{ marginBottom: '5px', fontSize: '20px' }}>Pending with Others</h2>
      <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '20px' }}>
        Track requests currently waiting for approval from other managers.
      </p>

      {loading ? (
        <p>Loading...</p>
      ) : requests.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '30px' }}>
          <p>No requests are pending with others.</p>
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

            {/* Stuck With Badge */}
            <div style={{ 
              display: 'inline-flex', 
              alignItems: 'center', 
              gap: '6px', 
              background: '#fef3c7', 
              color: '#d97706', 
              padding: '6px 12px', 
              borderRadius: '20px', 
              fontSize: '12px', 
              fontWeight: 'bold',
              marginBottom: '10px',
              border: '1px solid #fde68a'
            }}>
              <Clock size={14} /> Pending with: {req.current_level}
            </div>

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
