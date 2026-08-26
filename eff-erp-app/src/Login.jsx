import React, { useState } from 'react';
import { supabase } from './supabase';

export default function Login({ onLogin }) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState('BM');
  const [branch, setBranch] = useState('EDATHALA');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleAuth = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    try {
      if (isSignUp) {
        // Sign up
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email,
          password,
        });

        if (authError) throw authError;

        // Create profile
        const { error: profileError } = await supabase.from('profiles').insert([
          { 
            id: authData.user.id, 
            email, 
            full_name: fullName, 
            role, 
            permission: role === 'BM' ? 'User' : 'User/Approver',
            branch: branch
          }
        ]);

        if (profileError) throw profileError;
        alert('Test Account Created! You can now login.');
        setIsSignUp(false);
      } else {
        // Login
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        onLogin(data.user);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '20px', marginTop: '40px' }}>
      <div style={{ textAlign: 'center', marginBottom: '30px' }}>
        <h1 style={{ color: 'var(--primary)' }}>EFF ERP App</h1>
        <p style={{ color: 'var(--text-muted)' }}>{isSignUp ? 'Create Test Account' : 'Login to submit and approve bills'}</p>
      </div>

      <form onSubmit={handleAuth} className="card">
        {error && <div style={{ color: 'white', background: 'var(--error)', padding: '10px', borderRadius: '8px', marginBottom: '15px', fontSize: '14px' }}>{error}</div>}
        
        {isSignUp && (
          <>
            <div className="input-group">
              <label>Full Name</label>
              <input type="text" className="input-field" value={fullName} onChange={(e) => setFullName(e.target.value)} required={isSignUp} />
            </div>
             <div className="input-group">
              <label>Role</label>
              <select className="input-field" value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="BM">Branch Manager (BM)</option>
                <option value="RM">Regional Manager (RM)</option>
                <option value="HR">HR Manager (HR)</option>
                <option value="FM">Finance Manager (FM)</option>
                <option value="CEO">CEO</option>
                <option value="MD">MD</option>
              </select>
            </div>
            <div className="input-group">
              <label>Branch</label>
              <select className="input-field" value={branch} onChange={(e) => setBranch(e.target.value)}>
                <option value="EDATHALA">EDATHALA</option>
                <option value="ASIAN KOLLAM">ASIAN KOLLAM</option>
                <option value="ASIAN THRISSUR">ASIAN THRISSUR</option>
                <option value="CALICUT">CALICUT</option>
                <option value="KANNUR">KANNUR</option>
                <option value="KASARGOD">KASARGOD</option>
                <option value="KOLLAM">KOLLAM</option>
                <option value="MALAPPURAM">MALAPPURAM</option>
                <option value="HO">Head Office (HO)</option>
              </select>
            </div>
          </>
        )}

        <div className="input-group">
          <label>Email ID</label>
          <input type="email" className="input-field" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        
        <div className="input-group">
          <label>Password</label>
          <input type="password" className="input-field" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        
        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? 'Processing...' : (isSignUp ? 'Create Account' : 'Login')}
        </button>

        <div style={{ textAlign: 'center', marginTop: '15px' }}>
          <button type="button" onClick={() => setIsSignUp(!isSignUp)} style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer' }}>
            {isSignUp ? 'Already have an account? Login' : 'Need a test account? Sign Up'}
          </button>
        </div>
      </form>
    </div>
  );
}
