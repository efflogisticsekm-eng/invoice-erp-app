import React, { useState, useEffect } from 'react';
import { supabase } from './supabase';
import { LogOut, Camera, FileText, CheckSquare } from 'lucide-react';
import Scanner from './Scanner';
import Approvals from './Approvals';
import PendingOthers from './PendingOthers';
import MyRequests from './MyRequests';
import PastHistory from './PastHistory';

export default function Dashboard({ user, onLogout }) {
  const [profile, setProfile] = useState(null);
  const [view, setView] = useState(() => sessionStorage.getItem('currentView') || 'dashboard'); // 'dashboard', 'scanner', 'approvals', 'pending_others', 'my_requests', 'past_history'
  
  useEffect(() => {
    sessionStorage.setItem('currentView', view);
  }, [view]);

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
    if (data) {
      setProfile(data);
    } else {
      const meta = user.user_metadata || {};
      setProfile({
        id: user.id,
        full_name: meta.full_name || user.email,
        role: meta.role || 'User',
        permission: meta.permission || 'User',
        branch: meta.branch || null
      });
    }
  };

  if (view === 'scanner') {
    return <Scanner user={user} onBack={() => setView('dashboard')} />;
  }
  if (view === 'approvals') {
    return <Approvals user={user} profile={profile} onBack={() => setView('dashboard')} />;
  }
  if (view === 'pending_others') {
    return <PendingOthers user={user} profile={profile} onBack={() => setView('dashboard')} />;
  }
  if (view === 'my_requests') {
    return <MyRequests user={user} profile={profile} onBack={() => setView('dashboard')} />;
  }
  if (view === 'past_history') {
    return <PastHistory user={user} profile={profile} onBack={() => setView('dashboard')} />;
  }

  return (
    <div>
      <div className="app-header">
        <div>
          <h2 style={{ fontSize: '18px' }}>Welcome back,</h2>
          <h1 style={{ fontSize: '24px', color: 'var(--primary)' }}>
            {profile ? profile.full_name : user.email}
          </h1>
          <p style={{ color: 'var(--text-muted)' }}>Role: {profile ? profile.role : 'Manager'}</p>
        </div>
        <button onClick={onLogout} style={{ background: 'none', border: 'none', color: 'var(--text-muted)' }}>
          <LogOut />
        </button>
      </div>

      <div style={{ padding: '20px' }}>
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: '1fr 1fr', 
          gap: '15px', 
          marginTop: '40px' 
        }}>
          {/* Top Left: New Expence */}
          <button 
            className="dashboard-grid-btn"
            onClick={() => setView('scanner')} 
          >
            New Expence
          </button>
          
          {/* Top Right: Pending Approval */}
          <button 
            className="dashboard-grid-btn"
            onClick={() => {
              if (profile?.permission === 'User/Approver') {
                setView('approvals');
              } else {
                alert('You do not have approval permissions.');
              }
            }} 
          >
            Pending Approval
          </button>

          {/* Bottom Left: Pending with Others */}
          <button 
            className="dashboard-grid-btn"
            onClick={() => setView('pending_others')}
          >
            Pending with Others
          </button>
          
          {/* Bottom Right: Past History */}
          <button 
            className="dashboard-grid-btn"
            onClick={() => setView('past_history')}
          >
            Past History
          </button>
          
          {/* Fifth button spanning 2 columns: My Requests */}
          <button 
            className="dashboard-grid-btn"
            style={{ gridColumn: 'span 2' }}
            onClick={() => setView('my_requests')}
          >
            My Requests
          </button>
        </div>
      </div>
    </div>
  );
}
