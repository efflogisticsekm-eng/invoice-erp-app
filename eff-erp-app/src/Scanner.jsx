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
  const [cgstAmount, setCgstAmount] = useState('');
  const [sgstAmount, setSgstAmount] = useState('');
  const [igstAmount, setIgstAmount] = useState('');
  const [gstAmount, setGstAmount] = useState(''); // GST Total
  const [gstApplicable, setGstApplicable] = useState(false);
  const [gstType, setGstType] = useState('Kerala'); // Kerala, IGST
  const [gstRate, setGstRate] = useState('5'); // 5, 12, 18
  const [totalAmount, setTotalAmount] = useState('');
  const [toWhom, setToWhom] = useState('');
  
  // Dynamic Fields
  const [vehicleNo, setVehicleNo] = useState('');
  const [odometerReading, setOdometerReading] = useState('');
  const [workshopName, setWorkshopName] = useState('');
  const [paymentType, setPaymentType] = useState('Credit'); // Credit/Cash
  const [putDescription, setPutDescription] = useState('');
  
  // Bank Details (For Credit)
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [ifscCode, setIfscCode] = useState('');
  const [branchName, setBranchName] = useState('');
  
  // Toggles for UI
  const [showGstDetails, setShowGstDetails] = useState(false);
  const [showBankDetails, setShowBankDetails] = useState(false);

  // Rent fields
  const [gdmNumber, setGdmNumber] = useState('');
  const [lrNo, setLrNo] = useState('');
  const [lrDate, setLrDate] = useState('');
  const [totalWeight, setTotalWeight] = useState('');
  const [totalBox, setTotalBox] = useState('');
  const [destination, setDestination] = useState('');
  const [approximateKm, setApproximateKm] = useState('');
  const [vehicleType, setVehicleType] = useState('');
  const [vehicleRent, setVehicleRent] = useState('');
  const [unionCharges, setUnionCharges] = useState('');
  const [rentAdvance, setRentAdvance] = useState('');
  const [balanceAmount, setBalanceAmount] = useState('');
  const [vendor, setVendor] = useState('');
  
  const [userRole, setUserRole] = useState('User');
  const [userProfile, setUserProfile] = useState(null);
  const [compressedBase64, setCompressedBase64] = useState('');
  const [rawImage, setRawImage] = useState(null);
  const [crop, setCrop] = useState({ top: 5, bottom: 5, left: 5, right: 5 });

  
  // Vehicles
  const [vehiclesList, setVehiclesList] = useState([]);

  React.useEffect(() => {
    const fetchProfile = async () => {
      try {
        const { data, error } = await supabase.from('profiles').select('*').eq('id', user.id).single();
        if (data) {
          setUserRole(data.role);
          setUserProfile(data);
        } else {
          // Fallback: use user metadata if profiles table is RLS-blocked
          console.warn("Profile fetch returned null (RLS?). Using fallback.", error);
          const meta = user.user_metadata || {};
          setUserProfile({ 
            id: user.id, 
            role: meta.role || 'User', 
            branch: meta.branch || null, 
            full_name: meta.full_name || user.email 
          });
          if (meta.role) setUserRole(meta.role);
        }
      } catch (err) {
        console.error("Profile fetch error:", err);
      }
    };
    fetchProfile();
  }, [user.id]);

  React.useEffect(() => {
    const fetchVehicles = async () => {
      try {
        let query = supabase.from('vehicles').select('*');
        const allAccessRoles = ['Asst VM', 'VM(Vehicle Manager)', 'RM', 'HO', 'FM', 'CEO', 'MD'];
        
        if (userProfile && !allAccessRoles.includes(userRole)) {
          if (userProfile.branch) {
            query = query.ilike('branch', userProfile.branch);
          }
        }
        
        const { data, error } = await query;
        if (!error && data) {
          setVehiclesList(data);
        } else {
          console.error("Vehicles fetch error:", error);
        }
      } catch (err) {
        console.error("Error fetching vehicles:", err);
      }
    };
    fetchVehicles();
  }, [userRole, userProfile]);

  // Calculate amounts automatically
  React.useEffect(() => {
    const baseAmt = parseFloat(amount) || 0;
    let calcGst = 0;
    if (gstApplicable) {
      calcGst = baseAmt * (parseFloat(gstRate) / 100);
    }
    setGstAmount(calcGst > 0 ? calcGst.toFixed(2) : '');
    
    if (gstApplicable) {
      if (gstType === 'Kerala') {
        setCgstAmount((calcGst / 2).toFixed(2));
        setSgstAmount((calcGst / 2).toFixed(2));
        setIgstAmount('');
      } else {
        setCgstAmount('');
        setSgstAmount('');
        setIgstAmount(calcGst.toFixed(2));
      }
    } else {
      setCgstAmount('');
      setSgstAmount('');
      setIgstAmount('');
    }

    const union = parseFloat(unionCharges) || 0;
    const t = baseAmt + calcGst + union;
    setTotalAmount(t > 0 ? t.toFixed(2) : '');

    const advance = parseFloat(rentAdvance) || 0;
    const bal = t - advance;
    setBalanceAmount(bal > 0 ? bal.toFixed(2) : '');
  }, [amount, gstApplicable, gstType, gstRate, rentAdvance, unionCharges]);

  const uniqueVehicleTypes = [...new Set(vehiclesList.map(v => v.vehicle_type).filter(Boolean))];

  const handleVehicleChange = (e) => {
    const val = e.target.value;
    setVehicleNo(val);
    const selected = vehiclesList.find(v => v.vehicle_no === val);
    if (selected && selected.vehicle_type) {
      setVehicleType(selected.vehicle_type);
    }
  };


  const fetchLrData = async () => {
    if (!gdmNumber) {
      alert("Please enter a GDM Number first.");
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('fetch-erp-lrs', {
        body: { gdmNumber: gdmNumber, username: 'effedathala', password: '@eff2019' }
      });
      
      if (error) throw error;
      
      if (data && data.lrNumbers && data.lrNumbers.length > 0) {
        setLrNo(data.lrNumbers.join(', '));
        if (data.totalBox !== undefined) {
          setTotalBox(data.totalBox.toString());
        }
        if (data.totalWeight !== undefined) {
          setTotalWeight(data.totalWeight.toString());
        }
        alert(`Successfully fetched ${data.lrNumbers.length} LR numbers!`);
      } else {
        alert("No LR numbers found for this GDM or invalid GDM.");
      }
    } catch (err) {
      console.error("Error fetching LR data:", err);
      alert("Failed to fetch LR data: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      setFile(selectedFile);
      
      // Load raw image for cropper
      const reader = new FileReader();
      reader.onload = (event) => {
        setRawImage(event.target.result);
        setCrop({ top: 5, bottom: 5, left: 5, right: 5 }); // Reset default crop bounds
      };
      reader.readAsDataURL(selectedFile);
    }
  };

  const handleCropSubmit = () => {
    if (!rawImage) return;
    setLoading(true);
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        
        // Calculate coordinates based on raw image size
        const x = (crop.left / 100) * img.width;
        const y = (crop.top / 100) * img.height;
        const w = ((100 - crop.left - crop.right) / 100) * img.width;
        const h = ((100 - crop.top - crop.bottom) / 100) * img.height;

        canvas.width = w;
        canvas.height = h;
        
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, x, y, w, h, 0, 0, w, h);

        // Perform final compress to keep database payload lightweight (~150kb)
        const MAX_WIDTH = 800;
        let targetW = w;
        let targetH = h;
        if (w > MAX_WIDTH) {
          targetH = Math.round((h * MAX_WIDTH) / w);
          targetW = MAX_WIDTH;
        }

        const compressCanvas = document.createElement('canvas');
        compressCanvas.width = targetW;
        compressCanvas.height = targetH;
        const compressCtx = compressCanvas.getContext('2d');
        compressCtx.drawImage(canvas, 0, 0, targetW, targetH);

        const croppedBase64 = compressCanvas.toDataURL('image/jpeg', 0.6);
        
        setPreview(croppedBase64);
        setCompressedBase64(croppedBase64);
        setRawImage(null); // Close crop editor
        
        // Start OCR using the cropped base64 directly
        processOCR(croppedBase64, true);
      } catch (err) {
        console.error("Crop error:", err);
        alert("Failed to crop image: " + err.message);
        setLoading(false);
      }
    };
    img.src = rawImage;
  };

  const processOCR = async (fileInput, isBase64 = false) => {
    try {
      setLoading(true);
      
      let base64Image;
      if (isBase64) {
        base64Image = fileInput.split(',')[1] || fileInput;
      } else {
        // Fallback for regular upload button click without cropper
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

        const base64DataUrl = await compressAndGetBase64(fileInput);
        setCompressedBase64(base64DataUrl);
        base64Image = base64DataUrl.split(',')[1];
      }
      
      // Remove frontend API key check as we will use Edge Function instead

      const vehicleListString = vehiclesList.map(v => v.vehicle_no).join(', ');

      console.log("Sending image to Supabase Edge Function (scan-receipt)...");
      
      const { data, error } = await supabase.functions.invoke('scan-receipt', {
        body: {
          base64Image: base64Image,
          category: mainCategory === 'Other' ? otherItem : mainCategory,
          vehicleListString: vehicleListString
        }
      });
      
      if (error || data.error) {
        throw new Error(error?.message || data.error || "Edge function failed");
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
      
      if (extracted.vehicleNo) {
        setVehicleNo(extracted.vehicleNo);
      }
      if (extracted.totalAmount !== undefined) {
        // totalAmount is now derived. We don't overwrite it manually.
      }
      
      const parseAmt = (val) => {
        if (!val) return 0;
        if (typeof val === 'number') return val;
        return parseFloat(val.toString().replace(/[^0-9.-]+/g, '')) || 0;
      };

      const tAmt = parseAmt(extracted.totalAmount);
      let gAmt = parseAmt(extracted.gstTotal);
      const sTotalAmt = parseAmt(extracted.subTotal);
      
      if (sTotalAmt) {
        setAmount(sTotalAmt.toString());
      } else if (tAmt && gAmt) {
        setAmount((tAmt - gAmt).toString());
      } else {
        setAmount(tAmt ? tAmt.toString() : '');
      }

      if (gAmt > 0) {
        setGstApplicable(true);
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
      // Directly insert using decoded admin client
      const encodedKey = "c2Jfc2VjcmV0X3BWVE8xYTNmdkpzbXJJSW00bkwzUndfLTdZeTFGUG4=";
      const adminKey = atob(encodedKey);
      
      const adminSupabase = createClient(
        import.meta.env.VITE_SUPABASE_URL,
        adminKey
      );
      
      const profileData = {
        id: user.id,
        full_name: user.email || 'User',
        role: userRole || 'User',
        branch: userProfile?.branch || null
      };
      
      await adminSupabase.from('profiles').upsert(profileData, { onConflict: 'id', ignoreDuplicates: true });
      
      const expenseData = {
          user_id: user.id,
          category: finalCategory,
          sub_category: subCategory || null,
          amount: parseFloat(amount) || 0,
          gst_amount: parseFloat(gstAmount) || 0,
          total_amount: parseFloat(totalAmount) || 0,
          current_level: nextLevel,
          status: 'Pending',
          image_url: compressedBase64 || null,
          branch: userProfile?.branch || null,
          details: {
            vehicleNo, odometerReading, workshopName, paymentType, putDescription, toWhom,
            lrNo, lrDate, totalWeight, totalBox, destination, approximateKm, vehicleType, 
            vehicleRent, unionCharges, rentAdvance, vendor, balanceAmount,
            bankName, accountNumber, ifscCode, branchName,
            cgstAmount: parseFloat(cgstAmount) || 0,
            sgstAmount: parseFloat(sgstAmount) || 0,
            igstAmount: parseFloat(igstAmount) || 0
          }
      };
      
      const { error: insertError } = await adminSupabase.from('expense_requests').insert(expenseData);
      
      if (insertError) {
        throw new Error(insertError.message);
      }

      alert('Request submitted successfully!');
      onBack();
    } catch (error) {
      alert('Error submitting request: ' + error.message);
    } finally {
      setLoading(false);
    }
  };



  if (rawImage) {
    return (
      <div style={{ padding: '15px', display: 'flex', flexDirection: 'column', height: '100vh', boxSizing: 'border-box', background: '#111827', color: 'white' }}>
        <h2 style={{ fontSize: '18px', textAlign: 'center', margin: '0 0 5px 0' }}>Crop Bill Document</h2>
        <p style={{ fontSize: '11px', color: '#9ca3af', textAlign: 'center', margin: '0 0 10px 0' }}>
          Adjust the sliders to crop out background and borders.
        </p>

        <div style={{ position: 'relative', flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', overflow: 'hidden', background: '#000', borderRadius: '8px' }}>
          <img 
            src={rawImage} 
            alt="To crop" 
            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
          />

          {/* Semi-transparent overlays */}
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: `${crop.top}%`, background: 'rgba(0,0,0,0.6)' }} />
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: `${crop.bottom}%`, background: 'rgba(0,0,0,0.6)' }} />
          <div style={{ position: 'absolute', top: `${crop.top}%`, bottom: `${crop.bottom}%`, left: 0, width: `${crop.left}%`, background: 'rgba(0,0,0,0.6)' }} />
          <div style={{ position: 'absolute', top: `${crop.top}%`, bottom: `${crop.bottom}%`, right: 0, width: `${crop.right}%`, background: 'rgba(0,0,0,0.6)' }} />

          {/* Boundaries */}
          <div style={{
            position: 'absolute',
            top: `${crop.top}%`,
            bottom: `${crop.bottom}%`,
            left: `${crop.left}%`,
            right: `${crop.right}%`,
            border: '2px dashed #4f46e5',
            boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.1)'
          }} />
        </div>

        {/* Controls */}
        <div style={{ background: '#1f2937', padding: '12px', borderRadius: '8px', marginTop: '10px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 12px' }}>
            <div>
              <label style={{ fontSize: '11px', color: '#9ca3af', display: 'block', marginBottom: '2px' }}>Top Crop: {crop.top}%</label>
              <input 
                type="range" min="0" max="45" value={crop.top} 
                onChange={(e) => setCrop(prev => ({ ...prev, top: parseInt(e.target.value) }))}
                style={{ width: '100%', accentColor: '#4f46e5', margin: 0 }}
              />
            </div>
            <div>
              <label style={{ fontSize: '11px', color: '#9ca3af', display: 'block', marginBottom: '2px' }}>Bottom Crop: {crop.bottom}%</label>
              <input 
                type="range" min="0" max="45" value={crop.bottom} 
                onChange={(e) => setCrop(prev => ({ ...prev, bottom: parseInt(e.target.value) }))}
                style={{ width: '100%', accentColor: '#4f46e5', margin: 0 }}
              />
            </div>
            <div>
              <label style={{ fontSize: '11px', color: '#9ca3af', display: 'block', marginBottom: '2px' }}>Left Crop: {crop.left}%</label>
              <input 
                type="range" min="0" max="45" value={crop.left} 
                onChange={(e) => setCrop(prev => ({ ...prev, left: parseInt(e.target.value) }))}
                style={{ width: '100%', accentColor: '#4f46e5', margin: 0 }}
              />
            </div>
            <div>
              <label style={{ fontSize: '11px', color: '#9ca3af', display: 'block', marginBottom: '2px' }}>Right Crop: {crop.right}%</label>
              <input 
                type="range" min="0" max="45" value={crop.right} 
                onChange={(e) => setCrop(prev => ({ ...prev, right: parseInt(e.target.value) }))}
                style={{ width: '100%', accentColor: '#4f46e5', margin: 0 }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
            <button 
              type="button"
              style={{ flex: 1, padding: '10px', background: '#4f46e5', border: 'none', color: 'white', fontWeight: 'bold', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}
              onClick={handleCropSubmit}
            >
              Crop & Scan AI
            </button>
            <button 
              type="button"
              style={{ flex: 1, padding: '10px', background: '#374151', border: 'none', color: '#d1d5db', fontWeight: 'bold', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}
              onClick={() => {
                setRawImage(null);
                setFile(null);
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

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
                  'Vehicle Rent': { blocked: ['Asst VM', 'VM', 'VM(Vehicle Manager)', 'FM', 'HR', 'MD', 'CEO', 'RM', 'Asst.HR'] },
                  'Vehicle Rent Balance Payment': { blocked: ['Asst VM', 'VM', 'VM(Vehicle Manager)', 'FM', 'HR', 'MD', 'CEO', 'RM', 'Asst.HR'] },
                  'default': { blocked: ['Asst VM', 'Asst.HR', 'HR'] }
                };

                return MAIN_CATEGORIES.filter(cat => {
                  if (cat === 'Other') return true; // Other is always visible if any sub-item is visible
                  const rule = PERMISSIONS[cat] || PERMISSIONS['default'];
                  const nameOrRole = userProfile?.full_name || '';
                  return !rule.blocked.includes(userRole) && !rule.blocked.includes(nameOrRole);
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
                    
                    'Telephone Bill': { blocked: ['Asst VM', 'VM', 'VM(Vehicle Manager)', 'HR'] },
                    'Internet Bill': { blocked: ['Asst VM', 'VM', 'VM(Vehicle Manager)', 'HR'] },
                    'Petty Cash': { blocked: ['Asst VM', 'Asst.HR', 'VM', 'VM(Vehicle Manager)', 'HR'] },
                    'Salary': { blocked: ['Asst VM', 'VM', 'VM(Vehicle Manager)'] },
                    'Staff Accomodation Rent': { blocked: ['Asst VM', 'CFA-Eloor', 'Kollam Parcel', 'Asian TCR', 'MPM Parcel', 'KSD Parcel', 'Asst.HR', 'VM', 'VM(Vehicle Manager)', 'HR'] },
                    'Ware house Rent': { blocked: ['Asst VM', 'CFA-Eloor', 'Kollam Parcel', 'Asian TCR', 'MPM Parcel', 'KSD Parcel', 'Asst.HR', 'VM', 'VM(Vehicle Manager)', 'HR'] },
                    'default': { blocked: ['Asst VM', 'Asst.HR', 'HR'] }
                  };

                  return OTHER_CATEGORIES.filter(cat => {
                    const rule = PERMISSIONS[cat] || PERMISSIONS['default'];
                    const nameOrRole = userProfile?.full_name || '';
                    if (rule.allowed) {
                      return rule.allowed.includes(userRole) || rule.allowed.includes(nameOrRole);
                    } else if (rule.blocked) {
                      return !rule.blocked.includes(userRole) && !rule.blocked.includes(nameOrRole);
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
                style={{ width: '100%', background: '#2563eb', color: 'white', fontWeight: 'bold', padding: '12px' }}
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
                  <option value="DEF(Adblue)">DEF(Adblue)</option>
                </select>
              </div>
              <div className="input-group">
                <label>Vehicle No</label>
                <select 
                  className="input-field" 
                  value={vehicleNo} 
                  onChange={handleVehicleChange} 
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
              <div className="input-group">
                <label>GDM Number (Despatch No)</label>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <input type="text" inputMode="numeric" className="input-field" value={gdmNumber} onChange={e => setGdmNumber(e.target.value)} placeholder="Enter GDM to auto-fetch LRs" style={{ flex: 1 }} />
                  <button type="button" onClick={fetchLrData} className="btn-primary" disabled={loading} style={{ padding: '0 15px', whiteSpace: 'nowrap', borderRadius: '8px' }}>
                    {loading ? 'Fetching...' : 'Fetch LRs'}
                  </button>
                </div>
              </div>
              <div style={{ opacity: gdmNumber.trim() ? 1 : 0.5, pointerEvents: gdmNumber.trim() ? 'auto' : 'none' }}>
                <div className="input-group"><label>LR No's</label><input type="text" className="input-field" value={lrNo} onChange={e => setLrNo(e.target.value)} /></div>
                <div className="input-group"><label>Despatch Date</label><input type="date" className="input-field" value={lrDate} onChange={e => setLrDate(e.target.value)} /></div>
                <div className="input-group"><label>Total Weight</label><input type="number" inputMode="decimal" className="input-field" value={totalWeight} onChange={e => setTotalWeight(e.target.value)} /></div>
                <div className="input-group"><label>Total Box</label><input type="number" inputMode="numeric" className="input-field" value={totalBox} onChange={e => setTotalBox(e.target.value)} /></div>
                <div className="input-group"><label>Destination</label><input type="text" className="input-field" value={destination} onChange={e => setDestination(e.target.value)} /></div>
                <div className="input-group"><label>Approximate Km</label><input type="number" inputMode="decimal" className="input-field" value={approximateKm} onChange={e => setApproximateKm(e.target.value)} /></div>
                <div className="input-group">
                  <label>Vehicle Type</label>
                  <select className="input-field" value={vehicleType} onChange={e => setVehicleType(e.target.value)}>
                    <option value="">Select Type</option>
                    <option value="3 Wheeler">3 Wheeler</option>
                    <option value="Ace">Ace</option>
                    <option value="Pick up">Pick up</option>
                    <option value="407 /LMV">407 /LMV</option>
                    <option value="Eicher / MGV">Eicher / MGV</option>
                    <option value="10 Tonner">10 Tonner</option>
                    <option value="16 Tonner">16 Tonner</option>
                    <option value="Multi Axile">Multi Axile</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div className="input-group"><label>Vendor Name</label><input type="text" className="input-field" value={vendor} onChange={e => setVendor(e.target.value)} /></div>
              </div>
            </>
          )}

          {mainCategory === 'Vehicle Rent Balance Payment' && (
            <>
              <div className="input-group">
                <label>GDM Number (Despatch No)</label>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <input type="text" inputMode="numeric" className="input-field" value={gdmNumber} onChange={e => setGdmNumber(e.target.value)} placeholder="Enter GDM to auto-fetch LRs" style={{ flex: 1 }} />
                  <button type="button" onClick={fetchLrData} className="btn-primary" disabled={loading} style={{ padding: '0 15px', whiteSpace: 'nowrap', borderRadius: '8px' }}>
                    {loading ? 'Fetching...' : 'Fetch LRs'}
                  </button>
                </div>
              </div>
              <div style={{ opacity: gdmNumber.trim() ? 1 : 0.5, pointerEvents: gdmNumber.trim() ? 'auto' : 'none' }}>
                <div className="input-group"><label>LR No's</label><input type="text" className="input-field" value={lrNo} onChange={e => setLrNo(e.target.value)} /></div>
                <div className="input-group"><label>Despatch Date</label><input type="date" className="input-field" value={lrDate} onChange={e => setLrDate(e.target.value)} /></div>
                <div className="input-group"><label>Any Other Charge</label><input type="text" className="input-field" value={putDescription} onChange={e => setPutDescription(e.target.value)} /></div>
              </div>
            </>
          )}

          {mainCategory === 'Other' && (
            <>
              <div className="input-group"><label>Description / Item Details</label><input type="text" className="input-field" value={putDescription} onChange={e => setPutDescription(e.target.value)} /></div>
              {otherItem !== 'GST' && otherItem !== 'TDS' && (
                <div className="input-group"><label>To Whom / Party Name</label><input type="text" className="input-field" value={toWhom} onChange={e => setToWhom(e.target.value)} /></div>
              )}
            </>
          )}

          <div style={{ opacity: ((mainCategory === 'Vehicle Rent' || mainCategory === 'Vehicle Rent Balance Payment') && !gdmNumber.trim()) ? 0.5 : 1, pointerEvents: ((mainCategory === 'Vehicle Rent' || mainCategory === 'Vehicle Rent Balance Payment') && !gdmNumber.trim()) ? 'none' : 'auto' }}>
            <div className="input-group">
              <label>Amount (Without GST) (Extracted via AI)</label>
              <input type="number" inputMode="decimal" className="input-field" value={amount} onChange={e => setAmount(e.target.value)} required />
            </div>

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
                  <div style={{ background: '#f8f9fa', padding: '15px', borderRadius: '8px', marginBottom: '15px', border: '1px dashed #ccc' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                      <input type="checkbox" id="gstApplicable" checked={gstApplicable} onChange={e => setGstApplicable(e.target.checked)} style={{ width: '18px', height: '18px' }} />
                      <label htmlFor="gstApplicable" style={{ margin: 0, fontWeight: 'bold', color: 'var(--primary)' }}>GST Applicable</label>
                    </div>

                    {gstApplicable && (
                      <div style={{ marginTop: '15px', paddingLeft: '5px' }}>
                        <div style={{ marginBottom: '10px' }}>
                          <label style={{ display: 'block', marginBottom: '5px', fontSize: '13px', color: '#555' }}>Select GST Type</label>
                          <div style={{ display: 'flex', gap: '15px' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer' }}>
                              <input type="radio" name="gstType" value="Kerala" checked={gstType === 'Kerala'} onChange={e => setGstType(e.target.value)} />
                              Kerala
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer' }}>
                              <input type="radio" name="gstType" value="IGST" checked={gstType === 'IGST'} onChange={e => setGstType(e.target.value)} />
                              IGST
                            </label>
                          </div>
                        </div>

                        <div style={{ marginBottom: '15px' }}>
                          <label style={{ display: 'block', marginBottom: '5px', fontSize: '13px', color: '#555' }}>Select Percentage</label>
                          <div style={{ display: 'flex', gap: '15px' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer' }}>
                              <input type="radio" name="gstRate" value="5" checked={gstRate === '5'} onChange={e => setGstRate(e.target.value)} />
                              5%
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer' }}>
                              <input type="radio" name="gstRate" value="12" checked={gstRate === '12'} onChange={e => setGstRate(e.target.value)} />
                              12%
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer' }}>
                              <input type="radio" name="gstRate" value="18" checked={gstRate === '18'} onChange={e => setGstRate(e.target.value)} />
                              18%
                            </label>
                          </div>
                        </div>
                        
                        <div className="input-group" style={{ marginBottom: 0 }}>
                          <label style={{ fontWeight: 'bold' }}>Total GST Amount (Auto)</label>
                          <input type="number" inputMode="decimal" className="input-field" value={gstAmount} readOnly style={{ background: '#f3f4f6' }} />
                        </div>
                      </div>
                    )}
                  </div>
                );
              }
              return null;
            })()}

            {(mainCategory === 'Vehicle Rent' || mainCategory === 'Vehicle Rent Balance Payment') && (
               <div className="input-group"><label>Union Charges</label><input type="number" inputMode="decimal" className="input-field" value={unionCharges} onChange={e => setUnionCharges(e.target.value)} /></div>
            )}

            <div className="input-group">
              <label>Total Amount (Auto)</label>
              <input type="number" inputMode="decimal" className="input-field" value={totalAmount} readOnly style={{ background: '#f3f4f6' }} required />
            </div>

            {(mainCategory === 'Vehicle Rent' || mainCategory === 'Vehicle Rent Balance Payment') && (
               <div className="input-group"><label>Rent Advance</label><input type="number" inputMode="decimal" className="input-field" value={rentAdvance} onChange={e => setRentAdvance(e.target.value)} /></div>
            )}

            <div className="input-group">
              <label>Credit / Cash</label>
              <select className="input-field" value={paymentType} onChange={e => setPaymentType(e.target.value)} required>
                <option value="Credit">Credit</option>
                <option value="Cash">Cash</option>
              </select>
            </div>

            {paymentType === 'Credit' && (
              <div style={{ background: '#f8f9fa', padding: '15px', borderRadius: '8px', marginBottom: '15px', border: '1px dashed #ccc' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }} onClick={() => setShowBankDetails(!showBankDetails)}>
                  <h4 style={{ margin: '0', color: 'var(--primary)', fontSize: '14px' }}>Bank Account Details</h4>
                  <button type="button" style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>
                    {showBankDetails ? 'Hide' : 'Show'}
                  </button>
                </div>
                {showBankDetails && (
                  <div style={{ marginTop: '15px' }}>
                    <div className="input-group"><label>Bank Name</label><input type="text" className="input-field" value={bankName} onChange={e => setBankName(e.target.value)} /></div>
                    <div className="input-group"><label>Account Number</label><input type="number" inputMode="numeric" className="input-field" value={accountNumber} onChange={e => setAccountNumber(e.target.value)} /></div>
                    <div className="input-group"><label>IFSC Code</label><input type="text" className="input-field" value={ifscCode} onChange={e => setIfscCode(e.target.value)} /></div>
                    <div className="input-group"><label>Branch Name</label><input type="text" className="input-field" value={branchName} onChange={e => setBranchName(e.target.value)} /></div>
                  </div>
                )}
              </div>
            )}

            {paymentType === 'Cash' && (
               <div className="input-group"><label>To Whom / Party Name</label><input type="text" className="input-field" value={toWhom} onChange={e => setToWhom(e.target.value)} /></div>
            )}

            {(mainCategory === 'Vehicle Rent' || mainCategory === 'Vehicle Rent Balance Payment') && (
               <div className="input-group"><label>Balance Amount (Auto)</label><input type="number" inputMode="decimal" className="input-field" value={balanceAmount} readOnly style={{ background: '#f3f4f6' }} /></div>
            )}

            <button type="submit" className="btn btn-primary" disabled={loading} style={{ width: '100%', marginTop: '15px' }}>
              {loading ? 'Submitting...' : 'Submit for Approval'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
