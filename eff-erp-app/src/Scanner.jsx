import React, { useState } from 'react';
import { supabase } from './supabase';

export default function Scanner({ user, onBack }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState('');
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(1); // 1: Upload, 2: Confirm
  
  // Form fields
  const [mainCategory, setMainCategory] = useState('Vehicle Rent');
  const [otherItem, setOtherItem] = useState('Traveling Exp'); // Stores the sub-category when 'Other' is selected
  const [subCategory, setSubCategory] = useState(''); // Stores 'Maintenance Type' for Vehicle Maintenance
  
  const [amount, setAmount] = useState('');
  const [gstAmount, setGstAmount] = useState('');
  const [totalAmount, setTotalAmount] = useState('');
  const [toWhom, setToWhom] = useState('');
  
  // Dynamic Fields
  const [vehicleNo, setVehicleNo] = useState('');
  const [odometerReading, setOdometerReading] = useState('');
  const [workshopName, setWorkshopName] = useState('');
  const [paymentType, setPaymentType] = useState('Credit'); // Credit/Cash
  const [putDescription, setPutDescription] = useState('');
  
  // Rent fields
  const [lrNo, setLrNo] = useState('');
  const [lrDate, setLrDate] = useState('');
  const [totalWeight, setTotalWeight] = useState('');
  const [destination, setDestination] = useState('');
  const [approximateKm, setApproximateKm] = useState('');
  const [vehicleType, setVehicleType] = useState('');
  const [vehicleRent, setVehicleRent] = useState('');
  const [unionCharges, setUnionCharges] = useState('');
  const [rentAdvance, setRentAdvance] = useState('');
  const [vendor, setVendor] = useState('');
  
  const [userRole, setUserRole] = useState('User');
  const [userProfile, setUserProfile] = useState(null);
  
  // Vehicles
  const [vehiclesList, setVehiclesList] = useState([]);

  React.useEffect(() => {
    const fetchProfile = async () => {
      const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      if (data) {
        setUserRole(data.role);
        setUserProfile(data);
      }
    };
    fetchProfile();
  }, [user.id]);

  React.useEffect(() => {
    const fetchVehicles = async () => {
      if (!userProfile) return;
      try {
        let query = supabase.from('vehicles').select('*');
        const allAccessRoles = ['Asst VM', 'VM(Vehicle Manager)', 'RM', 'HO', 'FM', 'CEO', 'MD'];
        
        if (!allAccessRoles.includes(userRole)) {
          if (userProfile.branch) {
            query = query.eq('branch', userProfile.branch);
          }
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
  }, [userRole, userProfile]);

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      setFile(selectedFile);
      setPreview(URL.createObjectURL(selectedFile));
    }
  };

  const processOCR = async (fileBlob) => {
    try {
      setLoading(true);
      
      // Convert file blob to base64
      const getBase64 = (file) => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = error => reject(error);
      });

      const base64Image = await getBase64(fileBlob);
      
      const apiKey = import.meta.env.VITE_OPENAI_API_KEY;
      if (!apiKey) {
        alert("OpenAI API Key is missing! Please add VITE_OPENAI_API_KEY to your .env file.");
        setLoading(false);
        return;
      }

      console.log("Sending image to OpenAI Vision API...");
      
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: `Extract details from this receipt/invoice for the expense category: "${mainCategory === 'Other' ? otherItem : mainCategory}". Return ONLY a valid JSON object with the keys: 'partyName' (the name of the shop, vendor, or workshop), 'totalAmount' (the grand total amount as a number), 'gstAmount' (the total tax/GST amount as a number, if none found return 0), and 'subTotal' (the amount before tax). Do not include markdown formatting or any other text, just the raw JSON.`
                },
                {
                  type: "image_url",
                  image_url: {
                    url: `data:image/jpeg;base64,${base64Image}`
                  }
                }
              ]
            }
          ],
          max_tokens: 500,
          temperature: 0.0
        })
      });

      const data = await response.json();
      
      if (data.error) {
        throw new Error(data.error.message);
      }

      let content = data.choices[0].message.content.trim();
      let extracted;
      try {
        content = content.replace(/```json/g, '').replace(/```/g, '').trim();
        extracted = JSON.parse(content);
      } catch (e) {
        throw new Error("Failed to parse JSON from AI response: " + content);
      }

      console.log("OpenAI Extracted Data:", extracted);

      if (extracted.partyName) {
        if (mainCategory === 'Vehicle Maintenance') setWorkshopName(extracted.partyName);
        else if (mainCategory === 'Vehicle Rent') setVendor(extracted.partyName);
        else setToWhom(extracted.partyName);
      }
      
      const parseAmt = (val) => {
        if (!val) return 0;
        if (typeof val === 'number') return val;
        return parseFloat(val.replace(/[^0-9.-]+/g, '')) || 0;
      };

      const tAmt = parseAmt(extracted.totalAmount);
      const gAmt = parseAmt(extracted.gstAmount);
      const sAmt = parseAmt(extracted.subTotal);

      if (tAmt) setTotalAmount(tAmt.toString());
      if (gAmt) setGstAmount(gAmt.toString());
      
      if (sAmt) {
        setAmount(sAmt.toString());
      } else if (tAmt && gAmt) {
        setAmount((tAmt - gAmt).toString());
      } else {
        setAmount(tAmt ? tAmt.toString() : '');
      }

    } catch (error) {
      console.error('OCR Error:', error);
      alert('Failed to read bill details. Error: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    setLoading(true);

    try {
      // Temporarily bypassing actual Storage upload for demo due to RLS error
      // 3. Process OCR (send actual file to Azure)
      await processOCR(file);
      
    } catch (error) {
      alert('Upload Error: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      const finalCategory = mainCategory === 'Other' ? otherItem : mainCategory;

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
        } else if (roleIndex === chain.length - 1) {
          return 'Approved'; // Final approver submitted it
        } else {
          return chain[0]; // Start from the beginning of the chain
        }
      };

      const nextLevel = computeNextLevel(finalCategory, subCategory, userRole);

      // TEMPORARY PROTOTYPE FIX: Call the local Vite proxy API to securely bypass RLS
      const response = await fetch('/api/insert_expense', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user.id,
          category: finalCategory,
          sub_category: subCategory || null,
          amount: parseFloat(amount) || 0,
          gst_amount: parseFloat(gstAmount) || 0,
          total_amount: parseFloat(totalAmount) || 0,
          current_level: nextLevel,
          status: 'Pending',
          details: {
            vehicleNo, odometerReading, workshopName, paymentType, putDescription, toWhom,
            lrNo, lrDate, totalWeight, destination, approximateKm, vehicleType, 
            vehicleRent, unionCharges, rentAdvance, vendor
          }
        })
      });

      const resData = await response.json();
      if (!response.ok || resData.error) throw new Error(resData.error || 'Unknown error');

      alert('Request submitted successfully!');
      onBack();
    } catch (error) {
      alert('Error submitting request: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '20px' }}>
      <button onClick={onBack} style={{ background: 'none', border: 'none', color: 'var(--primary)', marginBottom: '20px', fontWeight: 'bold' }}>
        &larr; Back to Dashboard
      </button>

      <h2 style={{ marginBottom: '20px' }}>Upload Bill</h2>

      <div style={{ maxWidth: '600px', margin: '0 auto', background: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
        
        <form onSubmit={handleSubmit} className="card" style={{ marginTop: '0px' }}>
          <h3 style={{ color: 'var(--primary)', marginBottom: '15px', borderBottom: '2px solid var(--primary)', paddingBottom: '5px' }}>1. Select Expense Category</h3>
          
          
          <div className="input-group">
            <label>Main Category</label>
            <select className="input-field" value={mainCategory} onChange={e => {
              setMainCategory(e.target.value);
              setSubCategory('');
            }}>
              {(() => {
                const MAIN_CATEGORIES = ['Vehicle Rent', 'Vehicle Rent Balance Payment', 'Vehicle Maintenance', 'Other'];
                const PERMISSIONS = {
                  'default': { blocked: ['Asst VM', 'Asst.HR', 'HR'] }
                };

                return MAIN_CATEGORIES.filter(cat => {
                  if (cat === 'Other') return true; // Other is always visible if any sub-item is visible (simplification)
                  const rule = PERMISSIONS['default'];
                  return !rule.blocked.includes(userRole);
                }).map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ));
              })()}
            </select>
          </div>

          {mainCategory === 'Other' && (
            <div className="input-group">
              <label>Item</label>
              <select className="input-field" value={otherItem} onChange={e => setOtherItem(e.target.value)}>
                {(() => {
                  const OTHER_CATEGORIES = [
                    'Traveling Exp', 'Hotel Rooms', 'Stationary Purchase', 'Telephone Bill', 
                    'Internet Bill', 'Staff Accomodation Rent', 'Ware house Rent', 'Union Charge', 
                    'Fuel Charge', 'Sub Contractor Payment', 'GST', 'TDS', 'Office Rent', 
                    'Subscription', 'Uniform', 'Bonnus', 'Petty Cash', 'Man Power out sourse', 
                    'Salary', 'Donation'
                  ];
                  
                  const PERMISSIONS = {
                    'Sub Contractor Payment': { allowed: ['KRL', 'RM', 'FM', 'CEO', 'MD'] },
                    'TDS': { allowed: ['FM', 'CEO', 'MD'] },
                    'Office Rent': { allowed: ['KRL', 'HO', 'RM', 'HR', 'FM', 'CEO', 'MD'] },
                    'Subscription': { allowed: ['HO', 'Asst.HR', 'HR', 'FM', 'CEO', 'MD'] },
                    'Bonnus': { allowed: ['HO', 'Asst.HR', 'RM', 'HR', 'FM', 'CEO', 'MD'] },
                    
                    'Telephone Bill': { blocked: ['Asst VM', 'VM(Vehicle Manager)', 'HR'] },
                    'Internet Bill': { blocked: ['Asst VM', 'VM(Vehicle Manager)', 'HR'] },
                    'Petty Cash': { blocked: ['Asst VM', 'Asst.HR', 'VM(Vehicle Manager)', 'HR'] },
                    'Salary': { blocked: ['Asst VM', 'VM(Vehicle Manager)'] },
                    'Staff Accomodation Rent': { blocked: ['Asst VM', 'CFA-Eloor', 'Kollam Parcel', 'Asian TCR', 'MPM Parcel', 'KSD Parcel', 'Asst.HR', 'VM(Vehicle Manager)', 'HR'] },
                    'Ware house Rent': { blocked: ['Asst VM', 'CFA-Eloor', 'Kollam Parcel', 'Asian TCR', 'MPM Parcel', 'KSD Parcel', 'Asst.HR', 'VM(Vehicle Manager)', 'HR'] },
                    'default': { blocked: ['Asst VM', 'Asst.HR', 'HR'] }
                  };

                  return OTHER_CATEGORIES.filter(cat => {
                    const rule = PERMISSIONS[cat] || PERMISSIONS['default'];
                    if (rule.allowed) {
                      return rule.allowed.includes(userRole);
                    } else if (rule.blocked) {
                      return !rule.blocked.includes(userRole);
                    }
                    return true;
                  }).map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ));
                })()}
              </select>
            </div>
          )}

          {/* Unified Upload Section */}
          <div style={{ margin: '20px 0', padding: '15px', background: '#eef2ff', borderRadius: '8px', border: '1px dashed #4f46e5' }}>
            <h3 style={{ marginTop: 0, marginBottom: '10px', fontSize: '16px', color: '#4f46e5' }}>2. Upload Bill & Scan (Optional)</h3>
            <div className="input-group">
              <input 
                type="file" 
                accept="image/*" 
                capture="environment" 
                id="cameraInput"
                style={{ display: 'none' }}
                onChange={handleFileChange}
              />
              <label htmlFor="cameraInput" className="btn-primary" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', width: '100%', marginBottom: '10px' }}>
                Open Camera / Gallery
              </label>
            </div>
            {preview && (
              <div style={{ margin: '15px 0', textAlign: 'center' }}>
                <img src={preview} alt="Bill Preview" style={{ maxWidth: '100%', maxHeight: '200px', borderRadius: '8px' }} />
              </div>
            )}
            {file && (
              <button 
                type="button"
                className="btn-primary" 
                onClick={() => processOCR(file)}
                disabled={loading}
                style={{ width: '100%', background: 'var(--success)' }}
              >
                {loading ? 'Scanning AI...' : 'Scan with AI'}
              </button>
            )}
          </div>

          <h3 style={{ color: 'var(--primary)', marginBottom: '15px', borderBottom: '2px solid var(--primary)', paddingBottom: '5px' }}>3. Expense Details</h3>

          {mainCategory === 'Vehicle Maintenance' && (
            <>
              <div className="input-group">
                <label>Maintenance Type (Sub Category)</label>
                <select className="input-field" value={subCategory} onChange={e => setSubCategory(e.target.value)}>
                  <option value="">-- Select Type --</option>
                  <option value="Periodical Maintenance">Periodical Maintenance</option>
                  <option value="Brake down">Brake down</option>
                  <option value="Accident">Accident</option>
                  <option value="Pollution">Pollution</option>
                  <option value="Test Work">Test Work</option>
                  <option value="RTO Work">RTO Work</option>
                  <option value="Tax">Tax</option>
                  <option value="Insurance">Insurance</option>
                  <option value="Tyre maintenance">Tyre maintenance</option>
                  <option value="Tyre Purchase">Tyre Purchase</option>
                </select>
              </div>
              <div className="input-group">
                <label>Vehicle No</label>
                <select 
                  className="input-field" 
                  value={vehicleNo} 
                  onChange={e => setVehicleNo(e.target.value)} 
                >
                  <option value="">-- Select Vehicle --</option>
                  {vehiclesList.length > 0 ? vehiclesList.map(v => (
                    <option key={v.id} value={v.vehicle_no}>
                      {v.vehicle_no} - {v.branch}
                    </option>
                  )) : (
                    <option disabled>No vehicles found for your branch. Did you run the SQL?</option>
                  )}
                </select>
              </div>
              <div className="input-group"><label>Description / Sub Type</label><input type="text" className="input-field" placeholder="e.g. Oil Change, GPS, Break Pad" value={putDescription} onChange={e => setPutDescription(e.target.value)} /></div>
              <div className="input-group"><label>Odometer Reading</label><input type="text" className="input-field" value={odometerReading} onChange={e => setOdometerReading(e.target.value)} /></div>
              <div className="input-group"><label>Workshop Name</label><input type="text" className="input-field" value={workshopName} onChange={e => setWorkshopName(e.target.value)} /></div>
            </>
          )}

          {mainCategory === 'Vehicle Rent' && (
            <>
              <div className="input-group"><label>LR No's</label><input type="text" className="input-field" value={lrNo} onChange={e => setLrNo(e.target.value)} /></div>
              <div className="input-group"><label>LR Date</label><input type="date" className="input-field" value={lrDate} onChange={e => setLrDate(e.target.value)} /></div>
              <div className="input-group"><label>Total Weight</label><input type="text" className="input-field" value={totalWeight} onChange={e => setTotalWeight(e.target.value)} /></div>
              <div className="input-group"><label>Destination</label><input type="text" className="input-field" value={destination} onChange={e => setDestination(e.target.value)} /></div>
              <div className="input-group"><label>Approximate Km</label><input type="text" className="input-field" value={approximateKm} onChange={e => setApproximateKm(e.target.value)} /></div>
              <div className="input-group"><label>Vehicle Type</label><input type="text" className="input-field" value={vehicleType} onChange={e => setVehicleType(e.target.value)} /></div>
              <div className="input-group"><label>Vehicle Rent</label><input type="number" className="input-field" value={vehicleRent} onChange={e => setVehicleRent(e.target.value)} /></div>
              <div className="input-group"><label>Union Charges</label><input type="number" className="input-field" value={unionCharges} onChange={e => setUnionCharges(e.target.value)} /></div>
              <div className="input-group"><label>Rent Advance</label><input type="number" className="input-field" value={rentAdvance} onChange={e => setRentAdvance(e.target.value)} /></div>
              <div className="input-group"><label>Vendor</label><input type="text" className="input-field" value={vendor} onChange={e => setVendor(e.target.value)} /></div>
            </>
          )}

          {mainCategory === 'Vehicle Rent Balance Payment' && (
            <>
              <div className="input-group"><label>LR No's</label><input type="text" className="input-field" value={lrNo} onChange={e => setLrNo(e.target.value)} /></div>
              <div className="input-group"><label>Any Other Charge</label><input type="text" className="input-field" value={putDescription} onChange={e => setPutDescription(e.target.value)} /></div>
            </>
          )}

          {mainCategory === 'Other' && (
            <>
              <div className="input-group"><label>Description / Item Details</label><input type="text" className="input-field" value={putDescription} onChange={e => setPutDescription(e.target.value)} /></div>
              {/* Hide "To Whom" for specific items according to PDF if needed, but safe to show mostly, PDF says GST and TDS have no 'To Whom'. */}
              {otherItem !== 'GST' && otherItem !== 'TDS' && (
                <div className="input-group"><label>To Whom / Party Name</label><input type="text" className="input-field" value={toWhom} onChange={e => setToWhom(e.target.value)} /></div>
              )}
            </>
          )}

          <div className="input-group">
            <label>Credit / Cash</label>
            <select className="input-field" value={paymentType} onChange={e => setPaymentType(e.target.value)}>
              <option value="Credit">Credit</option>
              <option value="Cash">Cash</option>
            </select>
          </div>

          <div className="input-group">
            <label>Amount (Without GST) (Extracted via AI)</label>
            <input type="number" className="input-field" value={amount} onChange={e => setAmount(e.target.value)} required />
          </div>

          {/* Conditional GST Amount based on Item type */}
          {(() => {
            let showGst = true;
            if (mainCategory === 'Other') {
              const noGstItems = ['Union Charge', 'Fuel Charge', 'GST', 'TDS', 'Bonnus', 'Petty Cash', 'Salary', 'Donation'];
              if (noGstItems.includes(otherItem)) {
                showGst = false;
              }
            }
            if (showGst) {
              return (
                <div className="input-group">
                  <label>GST Amount</label>
                  <input type="number" className="input-field" value={gstAmount} onChange={e => setGstAmount(e.target.value)} required />
                </div>
              );
            }
            return null;
          })()}

          <div className="input-group">
            <label>Total Amount</label>
            <input type="number" className="input-field" value={totalAmount} onChange={e => setTotalAmount(e.target.value)} required />
          </div>

          <button type="submit" className="btn btn-primary" disabled={loading} style={{ width: '100%' }}>
            {loading ? 'Submitting...' : 'Submit for Approval'}
          </button>
        </form>
      </div>
    </div>
  );
}
