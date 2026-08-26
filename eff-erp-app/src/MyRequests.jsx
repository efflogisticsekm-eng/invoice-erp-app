import React, { useState, useEffect } from 'react';
import { supabase } from './supabase';
import { ArrowLeft, Clock, CheckCircle, XCircle, AlertTriangle, Send, Camera } from 'lucide-react';

export default function MyRequests({ user, profile, onBack }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState(null);
  
  // Re-submit state
  const [resubmittingReq, setResubmittingReq] = useState(null);
  const [replyText, setReplyText] = useState('');
  const [newFile, setNewFile] = useState(null);
  const [newPreview, setNewPreview] = useState(null);
  const [submittingReply, setSubmittingReply] = useState(false);

  useEffect(() => {
    fetchMyRequests();
  }, []);

  const fetchMyRequests = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('expense_requests')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setRequests(data || []);
    } catch (err) {
      console.error('Error fetching my requests:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setNewFile(file);
      setNewPreview(URL.createObjectURL(file));
    }
  };

  const handleResubmit = async (e) => {
    e.preventDefault();
    if (!replyText.trim()) {
      alert('Please enter your justification remarks.');
      return;
    }

    setSubmittingReply(true);
    try {
      let finalImageUrl = resubmittingReq.image_url;

      // Compress and convert to base64 if a new image was selected
      if (newFile) {
        const compressAndGetBase64 = (fileObj) => {
          return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (event) => {
              const img = new Image();
              img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 800;
                let width = img.width;
                let height = img.height;

                if (width > MAX_WIDTH) {
                  height = Math.round((height * MAX_WIDTH) / width);
                  width = MAX_WIDTH;
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', 0.6));
              };
              img.src = event.target.result;
            };
            reader.readAsDataURL(fileObj);
          });
        };
        finalImageUrl = await compressAndGetBase64(newFile);
      }

      const targetLevel = resubmittingReq.details?.clarifiedBy || 'VM';
      const updatedDetails = {
        ...(resubmittingReq.details || {}),
        remarksHistory: [
          ...(resubmittingReq.details?.remarksHistory || []),
          {
            role: profile?.role || 'BM',
            name: profile?.full_name || user.email,
            date: new Date().toISOString(),
            type: 'Justification',
            text: replyText
          }
        ]
      };

      const { error } = await supabase
        .from('expense_requests')
        .update({
          status: 'Pending',
          current_level: targetLevel,
          image_url: finalImageUrl,
          details: updatedDetails
        })
        .eq('id', resubmittingReq.id);

      if (error) throw error;

      alert('Clarification reply submitted successfully!');
      setResubmittingReq(null);
      setReplyText('');
      setNewFile(null);
      setNewPreview(null);
      fetchMyRequests();
    } catch (err) {
      alert('Error submitting reply: ' + err.message);
    } finally {
      setSubmittingReply(false);
    }
  };

  const getStatusBadge = (req) => {
    if (req.status === 'Approved') {
      return (
        <span style={{ background: '#dcfce7', color: '#15803d', padding: '4px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '3px' }}>
          <CheckCircle size={12} /> Approved
        </span>
      );
    }
    if (req.status === 'Rejected') {
      return (
        <span style={{ background: '#fee2e2', color: '#b91c1c', padding: '4px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '3px' }}>
          <XCircle size={12} /> Rejected
        </span>
      );
    }
    if (req.status === 'Clarification') {
      return (
        <span style={{ background: '#ffedd5', color: '#ea580c', padding: '4px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '3px' }}>
          <AlertTriangle size={12} /> Clarification Needed
        </span>
      );
    }
    return (
      <span style={{ background: '#dbeafe', color: '#1d4ed8', padding: '4px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '3px' }}>
        <Clock size={12} /> Pending ({req.current_level})
      </span>
    );
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

      <h2 style={{ marginBottom: '5px', fontSize: '20px' }}>My Requests</h2>
      <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '20px' }}>
        Track your submitted expense requests and respond to clarifications.
      </p>

      {loading ? (
        <p>Loading...</p>
      ) : requests.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '30px' }}>
          <p>You have not submitted any requests yet.</p>
        </div>
      ) : (
        requests.map(req => (
          <div key={req.id} className="card" style={{ marginBottom: '12px', padding: '15px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>ID: #{req.id.substring(0, 8)}</span>
              {getStatusBadge(req)}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
              <div>
                <strong style={{ fontSize: '16px', color: '#111827' }}>{req.category}</strong>
                {req.sub_category && <div style={{ fontSize: '13px', color: '#4b5563' }}>({req.sub_category})</div>}
              </div>
              <span style={{ color: 'var(--primary)', fontWeight: 'bold', fontSize: '18px' }}>₹{req.total_amount}</span>
            </div>

            <p style={{ color: 'var(--text-muted)', fontSize: '12px', margin: '0 0 10px 0' }}>
              Submitted on: {new Date(req.created_at).toLocaleString()}
            </p>

            {/* Details Box */}
            {req.details && (
              <div style={{ background: '#f9fafb', padding: '10px', borderRadius: '6px', fontSize: '12px', border: '1px solid #f3f4f6', marginBottom: '10px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 10px' }}>
                  {req.details.vehicleNo && <div><strong>Vehicle No:</strong> {req.details.vehicleNo}</div>}
                  {req.details.odometerReading && <div><strong>Odometer:</strong> {req.details.odometerReading}</div>}
                  {req.details.workshopName && <div style={{ gridColumn: 'span 2' }}><strong>Workshop:</strong> {req.details.workshopName}</div>}
                  {req.details.vendor && <div style={{ gridColumn: 'span 2' }}><strong>Vendor:</strong> {req.details.vendor}</div>}
                  {req.details.toWhom && <div style={{ gridColumn: 'span 2' }}><strong>To Whom:</strong> {req.details.toWhom}</div>}
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

            {/* Remarks History Audit Log */}
            {req.details?.remarksHistory && req.details.remarksHistory.length > 0 && (
              <div style={{ background: '#fffbeb', padding: '10px', borderRadius: '6px', border: '1px solid #fef3c7', marginBottom: '10px', fontSize: '12px' }}>
                <h4 style={{ margin: '0 0 6px 0', fontSize: '12px', color: '#b45309' }}>History of Remarks</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {req.details.remarksHistory.map((rem, i) => (
                    <div key={i} style={{ borderBottom: i < req.details.remarksHistory.length - 1 ? '1px solid #fde68a' : 'none', paddingBottom: '5px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: '#92400e', fontWeight: 'bold' }}>
                        <span>{rem.name} ({rem.role})</span>
                        <span style={{ fontSize: '10px', fontWeight: 'normal' }}>{new Date(rem.date).toLocaleDateString()}</span>
                      </div>
                      <div style={{ fontStyle: rem.type === 'Justification' ? 'italic' : 'normal', color: '#4b5563', marginTop: '2px' }}>
                        <strong>{rem.type}:</strong> {rem.text}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Re-submit Button for Clarification status */}
            {req.status === 'Clarification' && (
              <button 
                type="button"
                className="btn btn-primary"
                style={{ width: '100%', background: '#ea580c', border: 'none', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '10px', fontSize: '13px' }}
                onClick={() => setResubmittingReq(req)}
              >
                <Send size={15} /> Submit Clarification Response
              </button>
            )}
          </div>
        ))
      )}

      {/* Re-submit Modal overlay */}
      {resubmittingReq && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: '15px' }}>
          <form 
            onSubmit={handleResubmit}
            style={{ background: 'white', borderRadius: '12px', padding: '20px', width: '100%', maxWidth: '450px', boxShadow: '0 4px 15px rgba(0,0,0,0.2)' }}
            onClick={e => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 10px 0', fontSize: '18px', color: '#ea580c' }}>Clarification Response</h3>
            
            <div style={{ background: '#fffbeb', padding: '10px', borderRadius: '6px', border: '1px solid #fef3c7', fontSize: '13px', marginBottom: '15px', color: '#92400e' }}>
              <strong>Last Remark:</strong> {(() => {
                const history = resubmittingReq.details?.remarksHistory || [];
                const last = history[history.length - 1];
                return last ? `"${last.text}" - by ${last.name} (${last.role})` : 'None';
              })()}
            </div>

            <div className="input-group" style={{ marginBottom: '15px' }}>
              <label style={{ fontSize: '13px', fontWeight: 'bold', display: 'block', marginBottom: '5px' }}>Your Justification / Reply</label>
              <textarea 
                className="input-field" 
                rows="4" 
                value={replyText} 
                onChange={e => setReplyText(e.target.value)} 
                placeholder="Explain the changes or provide the requested information..."
                required
                style={{ width: '100%', boxSizing: 'border-box', padding: '10px', border: '1px solid #ccc', borderRadius: '6px', resize: 'vertical' }}
              />
            </div>

            {/* Optional photo replacement */}
            <div style={{ margin: '15px 0', padding: '12px', background: '#f3f4f6', borderRadius: '8px', border: '1px dashed #d1d5db' }}>
              <label style={{ fontSize: '13px', fontWeight: 'bold', display: 'block', marginBottom: '5px', color: '#4b5563' }}>Replace Bill Photo (Optional)</label>
              <input type="file" accept="image/*" id="replaceFileInput" onChange={handleFileChange} style={{ display: 'none' }} />
              <label htmlFor="replaceFileInput" className="btn" style={{ display: 'block', textAlign: 'center', background: 'white', border: '1px solid #ccc', padding: '6px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}>
                Choose New Image
              </label>
              {newPreview && (
                <div style={{ marginTop: '10px', textAlign: 'center' }}>
                  <img src={newPreview} alt="Replacement Bill Preview" style={{ maxWidth: '100%', maxHeight: '100px', borderRadius: '4px' }} />
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
              <button 
                type="submit" 
                disabled={submittingReply}
                style={{ flex: 1, padding: '12px', background: '#ea580c', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}
              >
                {submittingReply ? 'Submitting...' : 'Submit Response'}
              </button>
              <button 
                type="button" 
                onClick={() => {
                  setResubmittingReq(null);
                  setReplyText('');
                  setNewFile(null);
                  setNewPreview(null);
                }}
                style={{ flex: 1, padding: '12px', background: '#e5e7eb', color: '#374151', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
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
