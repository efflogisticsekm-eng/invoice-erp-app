import React, { useState, useEffect } from 'react';
import { ArrowLeft, Search, Save } from 'lucide-react';

export default function GdmExpenseEntry({ user, profile, onBack }) {
  const [gdmNumber, setGdmNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetchTimer, setFetchTimer] = useState(0);
  const [rows, setRows] = useState([]);
  
  // Global Inputs
  const [globalRa, setGlobalRa] = useState('');
  const [globalAddlRa, setGlobalAddlRa] = useState('');
  const [globalBata, setGlobalBata] = useState('');
  const [globalReceivedCash, setGlobalReceivedCash] = useState('');
  
  const isManager = profile && ['RM', 'FM', 'CEO', 'MD'].includes(profile.role);
  
  useEffect(() => {
    const rootEl = document.getElementById('root');
    if (rootEl) {
      const originalMaxWidth = rootEl.style.maxWidth;
      rootEl.style.maxWidth = '100%';
      return () => {
        rootEl.style.maxWidth = originalMaxWidth || '480px';
      };
    }
  }, []);
  
  const fetchApiUrl = localStorage.getItem('gdm_read_api_url') || prompt("Enter the new Google Apps Script Web App URL for Reading GDM Data (Topay & Paid Parcel Billing):");
  if (fetchApiUrl) localStorage.setItem('gdm_read_api_url', fetchApiUrl.trim());

  const saveApiUrl = import.meta.env.VITE_GOOGLE_WEBHOOK_URL || localStorage.getItem('google_webhook_url');

  const handleSearch = async () => {
    if (!gdmNumber) return;
    setLoading(true);
    setFetchTimer(0);
    const interval = setInterval(() => {
      setFetchTimer(prev => prev + 1);
    }, 1000);
    try {
      const branchParam = profile?.branch || 'HO';
      const res = await fetch(`${fetchApiUrl}?gdmNumber=${encodeURIComponent(gdmNumber)}&branch=${encodeURIComponent(branchParam)}`);
      const data = await res.json();
      
      if (data.status === 'success') {
        const processedRows = data.data.map(item => ({
          ...item,
          noOfBoxes: item.boxes ? String(item.boxes).split('-')[0].trim() : '',
          ulCharge: item.ulCharge || 0,
          actualUlCharge: '',
          bonusParkingFee: ''
        }));
        setRows(processedRows);
        setGlobalRa('');
        setGlobalAddlRa('');
        setGlobalBata('');
        setGlobalReceivedCash('');
      } else {
        alert(data.error || "GDM Number not found");
        setRows([]);
      }
    } catch (err) {
      console.error(err);
      alert("Error: " + err.message + "\n\nURL Tried: " + fetchApiUrl + "\n\nPlease ensure the URL is correct.");
    } finally {
      clearInterval(interval);
      setLoading(false);
    }
  };

  const handleInputChange = (index, field, value) => {
    const newRows = [...rows];
    let val = value === '' ? '' : parseFloat(value);
    
    if (field === 'actualUlCharge' && val !== '') {
      if (val > newRows[index].ulCharge) {
        alert(`Actual UL Charge cannot exceed the original UL Charge (${newRows[index].ulCharge})`);
        val = newRows[index].ulCharge;
      }
    }
    
    newRows[index][field] = val;
    setRows(newRows);
  };

  // Calculations
  const sumTotalFreight = rows.reduce((acc, row) => acc + (parseFloat(row.totalFreight) || 0), 0);
  const sumTopay = rows.reduce((acc, row) => acc + (parseFloat(row.topay) || 0), 0);
  const sumTopayGst = rows.reduce((acc, row) => acc + ((parseFloat(row.topay) || 0) * 0.18), 0);
  const sumActualUl = rows.reduce((acc, row) => acc + (parseFloat(row.actualUlCharge) || 0), 0);
  const sumBonus = rows.reduce((acc, row) => acc + (parseFloat(row.bonusParkingFee) || 0), 0);
  
  const totalRcble = (parseFloat(globalRa) || 0) + (parseFloat(globalAddlRa) || 0) + sumTopay + sumTopayGst;
  const totalExp = sumBonus + sumActualUl + (parseFloat(globalBata) || 0);
  const netBalance = totalRcble - totalExp;

  const handleSave = async () => {
    if (rows.length === 0) return;
    setLoading(true);
    try {
      const finalRows = rows.map((row, idx) => {
        return {
          ...row,
          topayGst: (parseFloat(row.topay) || 0) * 0.18,
          // Save global values on the first row only
          ra: idx === 0 ? (parseFloat(globalRa) || 0) : 0,
          addlRa: idx === 0 ? (parseFloat(globalAddlRa) || 0) : 0,
          bata: idx === 0 ? (parseFloat(globalBata) || 0) : 0,
          receivedCash: idx === 0 ? (parseFloat(globalReceivedCash) || 0) : 0,
          topayGstTotal: idx === 0 ? sumTopayGst : 0,
          totalRcble: idx === 0 ? totalRcble : 0,
          totalExp: idx === 0 ? totalExp : 0,
          netAmount: idx === 0 ? netBalance : 0
        };
      });

      const res = await fetch(saveApiUrl, {
        method: 'POST',
        body: JSON.stringify({
          source: 'GdmExpenseEntry',
          branch: profile?.branch || 'HO',
          submittedBy: profile?.full_name || user.email,
          rows: finalRows
        })
      });
      if (res.ok) {
        alert('Saved successfully to Google Sheet!');
        setRows([]);
        setGdmNumber('');
      } else {
        alert('Failed to save to sheet');
      }
    } catch (err) {
      console.error(err);
      alert('Error saving data');
    } finally {
      setLoading(false);
    }
  };

  const thStyle = { padding: '8px', border: '1px solid #ccc', backgroundColor: '#f0f0f0', whiteSpace: 'nowrap', fontSize: '12px' };
  const tdStyle = { padding: '4px', border: '1px solid #ccc', whiteSpace: 'nowrap', fontSize: '13px', textAlign: 'center' };
  const inputStyle = { width: '80px', padding: '4px', fontSize: '13px', textAlign: 'right' };
  const smallInputStyle = { width: '60px', padding: '4px', fontSize: '13px', textAlign: 'right' };
  const headerStyle = { ...thStyle, backgroundColor: '#10507A', color: 'white', fontWeight: 'bold' }; 
  
  return (
    <div style={{ padding: '20px', width: '100%', boxSizing: 'border-box', margin: '0', fontFamily: 'Arial, sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '20px', gap: '15px' }}>
        <button onClick={onBack} type="button" style={{ background: 'none', border: 'none', marginRight: '15px', cursor: 'pointer' }}>
          <ArrowLeft />
        </button>
        <h2 style={{ fontSize: '20px', margin: 0 }}>GDM Expense Entry</h2>
      </div>

      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
        <input 
          type="text" 
          placeholder="Enter GDM Number" 
          value={gdmNumber} 
          onChange={(e) => setGdmNumber(e.target.value)}
          style={{ padding: '8px', width: '150px', border: '1px solid #ccc', borderRadius: '4px' }}
        />
        <button 
          onClick={handleSearch} 
          disabled={loading}
          style={{ padding: '8px 15px', backgroundColor: 'var(--primary)', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}
        >
          <Search size={16} /> {loading ? `Fetching... ${fetchTimer}s` : 'Fetch Data'}
        </button>
        {isManager && (
          <button 
            onClick={() => {
              localStorage.removeItem('gdm_read_api_url');
              alert("URL Reset successfully! Click Fetch Data again to enter the correct URL.");
            }} 
            style={{ padding: '8px 15px', backgroundColor: '#dc3545', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px' }}
          >
            Reset URL
          </button>
        )}
      </div>

      {rows.length > 0 && (
        <div style={{ overflowX: 'auto', marginBottom: '20px', paddingBottom: '10px' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: '1000px' }}>
            <thead>
              <tr>
                <th style={headerStyle}>GDM Number</th>
                <th style={headerStyle}>Delivery Driver</th>
                <th style={headerStyle}>Lr Number</th>
                <th style={headerStyle}>Consignor</th>
                <th style={headerStyle}>Consignee</th>
                <th style={headerStyle}>Destination</th>
                <th style={headerStyle}>No of Boxes</th>
                <th style={headerStyle}>Boxes</th>
                <th style={headerStyle}>Weight</th>
                <th style={headerStyle}>Total Freight</th>
                <th style={headerStyle}>Topay</th>
                <th style={headerStyle}>Topay GST (18%)</th>
                {isManager && <th style={headerStyle}>UL Charge</th>}
                <th style={headerStyle}>Actual UL Charge</th>
                <th style={headerStyle}>Bonnus/ Parking Fee</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr key={idx}>
                  <td style={tdStyle}>{row.gdmNumber}</td>
                  <td style={tdStyle}>{row.deliveryDriver}</td>
                  <td style={tdStyle}>{row.lrNumber}</td>
                  <td style={tdStyle}>{row.consignor}</td>
                  <td style={tdStyle}>{row.consignee}</td>
                  <td style={tdStyle}>{row.destination}</td>
                  <td style={tdStyle}>
                    <input type="text" value={row.noOfBoxes} onChange={(e) => {
                      const newRows = [...rows];
                      newRows[idx].noOfBoxes = e.target.value;
                      setRows(newRows);
                    }} style={{...inputStyle, width: '40px', textAlign: 'center'}} />
                  </td>
                  <td style={tdStyle}>{row.boxes}</td>
                  <td style={tdStyle}>{row.weight}</td>
                  <td style={tdStyle}>{row.totalFreight}</td>
                  <td style={tdStyle}>{row.topay}</td>
                  <td style={tdStyle}>{((parseFloat(row.topay) || 0) * 0.18).toFixed(2)}</td>
                  {isManager && <td style={tdStyle}>{row.ulCharge}</td>}
                  <td style={tdStyle}>
                    <input 
                      type="number" 
                      value={row.actualUlCharge} 
                      onChange={(e) => handleInputChange(idx, 'actualUlCharge', e.target.value)} 
                      style={smallInputStyle} 
                    />
                  </td>
                  <td style={tdStyle}>
                    <input 
                      type="number" 
                      value={row.bonusParkingFee} 
                      onChange={(e) => handleInputChange(idx, 'bonusParkingFee', e.target.value)} 
                      style={smallInputStyle} 
                    />
                  </td>
                </tr>
              ))}
              
              {/* Summary Row */}
              <tr style={{ backgroundColor: '#10507A', color: 'white', fontWeight: 'bold' }}>
                <td colSpan={9} style={{ ...tdStyle, textAlign: 'left', paddingLeft: '10px' }}>Total</td>
                <td style={tdStyle}>{sumTotalFreight}</td>
                <td style={tdStyle}>{sumTopay}</td>
                <td style={tdStyle}>{sumTopayGst.toFixed(2)}</td>
                {isManager && <td style={tdStyle}></td>}
                <td style={tdStyle}>{sumActualUl}</td>
                <td style={tdStyle}>{sumBonus}</td>
              </tr>
            </tbody>
          </table>
          
          {/* Bottom Grid Layout based on Screenshot */}
          <div style={{ display: 'flex', marginTop: '20px', gap: '40px', justifyContent: 'center' }}>
            
            {/* Left Box Container */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <table style={{ borderCollapse: 'collapse', width: '350px' }}>
                <tbody>
                  <tr>
                    <td style={{ ...tdStyle, fontWeight: 'bold', textAlign: 'left', width: '150px' }}>RA</td>
                    <td style={tdStyle}>
                      <input type="number" value={globalRa} onChange={(e) => setGlobalRa(e.target.value)} style={{ ...inputStyle, width: '100px' }} />
                    </td>
                    <td rowSpan={3} style={{ ...tdStyle, fontWeight: 'bold', verticalAlign: 'middle', width: '100px' }}>
                      RA+ Total<br/>Topay<br/>+ GST
                    </td>
                  </tr>
                  <tr>
                    <td style={{ ...tdStyle, fontWeight: 'bold', textAlign: 'left' }}>Addl RA</td>
                    <td style={tdStyle}>
                      <input type="number" value={globalAddlRa} onChange={(e) => setGlobalAddlRa(e.target.value)} style={{ ...inputStyle, width: '100px' }} />
                    </td>
                  </tr>
                  <tr>
                    <td style={{ ...tdStyle, fontWeight: 'bold', textAlign: 'left' }}>Topay GST (18%)</td>
                    <td style={{ ...tdStyle, backgroundColor: '#f0f0f0' }}>{sumTopayGst.toFixed(2)}</td>
                  </tr>
                  <tr>
                    <td style={{ ...tdStyle, fontWeight: 'bold', textAlign: 'left' }}>Total Rcble</td>
                    <td colSpan={2} style={{ ...tdStyle, fontWeight: 'bold', backgroundColor: '#f0f0f0', textAlign: 'center', color: '#10507A' }}>
                      {totalRcble.toFixed(2)}
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* Net Balance */}
              <table style={{ borderCollapse: 'collapse', width: '350px' }}>
                <tbody>
                  <tr>
                    <td style={{ ...tdStyle, backgroundColor: '#10507A', color: 'white', fontWeight: 'bold', textAlign: 'left', width: '150px' }}>Net Balance</td>
                    <td style={{ ...tdStyle, backgroundColor: '#10507A', color: 'white', fontWeight: 'bold', textAlign: 'center', fontSize: '11px' }}>
                      *Total Rcble - Total Exp
                    </td>
                  </tr>
                  <tr>
                    <td colSpan={2} style={{ ...tdStyle, fontSize: '20px', fontWeight: 'bold', color: netBalance >= 0 ? 'green' : 'red', padding: '10px', textAlign: 'center' }}>
                      {netBalance.toFixed(2)}
                    </td>
                  </tr>
                  <tr>
                    <td style={{ ...tdStyle, fontWeight: 'bold', textAlign: 'left', width: '150px' }}>Recieved Cash from Driver</td>
                    <td style={tdStyle}>
                      <input type="number" value={globalReceivedCash} onChange={(e) => setGlobalReceivedCash(e.target.value)} style={{ ...inputStyle, width: '150px', textAlign: 'center' }} />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Right Box Container */}
            <div>
              <table style={{ borderCollapse: 'collapse', width: '400px' }}>
                <tbody>
                  <tr>
                    <td style={{ ...tdStyle, fontWeight: 'bold', textAlign: 'left', width: '180px' }}>Bonnus/ Parking Fee</td>
                    <td style={{ ...tdStyle, backgroundColor: '#f0f0f0', width: '100px' }}>{sumBonus}</td>
                    <td rowSpan={2} style={{ border: 'none' }}></td>
                  </tr>
                  <tr>
                    <td style={{ ...tdStyle, fontWeight: 'bold', textAlign: 'left' }}>UL Charge</td>
                    <td style={{ ...tdStyle, backgroundColor: '#f0f0f0' }}>{sumActualUl}</td>
                  </tr>
                  <tr>
                    <td style={{ ...tdStyle, fontWeight: 'bold', textAlign: 'left' }}>Bata</td>
                    <td style={tdStyle}>
                      <input type="number" value={globalBata} onChange={(e) => setGlobalBata(e.target.value)} style={{ ...inputStyle, width: '100px' }} />
                    </td>
                    <td rowSpan={2} style={{ ...tdStyle, fontSize: '11px', fontStyle: 'italic', verticalAlign: 'middle', width: '120px' }}>
                      *Bonnus/ Parking Fee<br/>+Actual UL Charge+Bata
                    </td>
                  </tr>
                  <tr>
                    <td style={{ ...tdStyle, fontWeight: 'bold', textAlign: 'left' }}>Total Exp</td>
                    <td style={{ ...tdStyle, fontWeight: 'bold', backgroundColor: '#f0f0f0', color: 'red' }}>{totalExp.toFixed(2)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          
        </div>
      )}

      {rows.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '40px' }}>
          <button 
            onClick={handleSave} 
            disabled={loading}
            style={{ padding: '12px 30px', backgroundColor: '#28a745', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '16px', fontWeight: 'bold' }}
          >
            <Save size={20} /> {loading ? 'Saving...' : 'Save GDM Expenses'}
          </button>
        </div>
      )}
    </div>
  );
}
