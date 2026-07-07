import React, { useState, useRef, useEffect } from 'react';
import { Camera, Upload, Loader2, CheckCircle, ChevronRight, Download, LogIn, Truck, FileText, User, BarChart, Box, Layers, Database, FileSpreadsheet, Coins } from 'lucide-react';
import axios from 'axios';
import DeliveryDashboard from './components/DeliveryDashboard';
import VolumeCalculator from './components/VolumeCalculator';
import PayrollProcessor from './components/PayrollProcessor';
import DatabaseExplorer from './components/DatabaseExplorer';
import FreightCalculator from './components/FreightCalculator';
import IncentiveCalculator from './components/IncentiveCalculator';
import EFFPayrollAuditor from './components/EFFPayrollAuditor';

function App() {
  const [mode, setMode] = useState('HOME'); // 'HOME', 'LR_CREATION', 'POD_SCAN', 'LR_DASHBOARD', 'VOLUME_CALC'
  const [user, setUser] = useState(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [activeDelivery, setActiveDelivery] = useState(null);
  
  const [image, setImage] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [scanTime, setScanTime] = useState(null);
  const [consignorType, setConsignorType] = useState('GENERAL');
  const [countdownSeconds, setCountdownSeconds] = useState(15);
  const fileInputRef = useRef(null);

  // Security Access Control for Admin Features
  const [isAdmin, setIsAdmin] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  const [pendingMode, setPendingMode] = useState(null);
  const [showPinModal, setShowPinModal] = useState(false);

  const handleSecuredNavigation = (targetMode) => {
    if (isAdmin) {
      setMode(targetMode);
    } else {
      setPendingMode(targetMode);
      setShowPinModal(true);
      setPinInput('');
      setPinError('');
    }
  };

  const handlePinSubmit = (e) => {
    e.preventDefault();
    if (pinInput === '2026' || pinInput === 'KRL2026') {
      setIsAdmin(true);
      setMode(pendingMode);
      setShowPinModal(false);
    } else {
      setPinError('Invalid PIN! Access Denied.');
    }
  };

  const renderPinModal = () => {
    if (!showPinModal) return null;
    return (
      <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-sm shadow-2xl p-6 space-y-6">
          <div className="text-center space-y-2">
            <div className="mx-auto w-12 h-12 bg-amber-500/10 text-amber-500 border border-amber-500/20 rounded-full flex items-center justify-center">
              <Layers size={24} />
            </div>
            <h3 className="text-lg font-bold text-white">Security Access PIN</h3>
            <p className="text-xs text-slate-400">Please enter the administrator PIN to view this module.</p>
          </div>
          
          <form onSubmit={handlePinSubmit} className="space-y-4">
            <input 
              type="password"
              placeholder="Enter PIN (e.g. 2026)"
              value={pinInput}
              onChange={e => setPinInput(e.target.value)}
              className="w-full bg-slate-950 text-white border border-slate-800 rounded-xl px-4 py-3 text-center font-bold tracking-widest text-lg focus:border-primary outline-none"
              autoFocus
            />
            
            {pinError && (
              <p className="text-red-500 text-xs font-semibold text-center">{pinError}</p>
            )}

            <div className="flex space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setShowPinModal(false)}
                className="w-1/2 py-3 bg-slate-800 hover:bg-slate-750 text-slate-350 font-bold text-sm rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="w-1/2 py-3 bg-primary text-slate-950 font-black text-sm rounded-xl cursor-pointer"
              >
                Unlock
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  };

  useEffect(() => {
    let interval = null;
    if (loading) {
      setCountdownSeconds(15);
      interval = setInterval(() => {
        setCountdownSeconds((prev) => {
          if (prev <= 1) {
            return 1;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      clearInterval(interval);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [loading]);

  const mockDeliveries = [
    { id: 'DEL-001', consignee: 'MALABAR LAB SOLUTIONS', status: 'Pending' },
    { id: 'DEL-002', consignee: 'HEME DIAMED LLP', status: 'Pending' }
  ];

  const handleLogin = (e) => {
    e.preventDefault();
    if (username && password) {
      setUser({ name: username, role: 'driver' });
    }
  };

  const handleLogout = () => {
    setUser(null);
    setUsername('');
    setPassword('');
    setActiveDelivery(null);
    resetForm();
  };

  const handleCapture = (e) => {
    const file = e.target.files[0];
    if (file) {
      setPreview(URL.createObjectURL(file));
      setError(null);
      setResult(null);

      // Compress image to speed up upload and AI processing
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 1200;
          const MAX_HEIGHT = 1600;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          
          canvas.toBlob((blob) => {
            const compressedFile = new File([blob], file.name, {
              type: 'image/jpeg',
              lastModified: Date.now(),
            });
            setImage(compressedFile);
          }, 'image/jpeg', 0.7); // 70% quality JPEG
        };
        img.src = event.target.result;
      };
      reader.readAsDataURL(file);
    }
  };

  const handleUpload = async () => {
    if (!image) return;
    setLoading(true);
    setError(null);
    setScanTime(null);
    setCountdownSeconds(15);
    const startTime = Date.now();

    const formData = new FormData();
    formData.append('invoice', image);
    formData.append('consignor_type', consignorType);

    try {
      const isProd = import.meta.env.PROD;
      const baseUrl = isProd ? '' : 'http://localhost:3001';
      const endpoint = mode === 'LR_CREATION' ? '/api/extract-invoice' : '/api/extract-pod';
      const response = await axios.post(`${baseUrl}${endpoint}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setResult(response.data?.extracted_data || response.data);
      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      setScanTime(duration);
    } catch (err) {
      console.error(err);
      if (err.response && err.response.data && err.response.data.error) {
        setError(err.response.data.error);
      } else {
        setError(err.message || 'Something went wrong connecting to backend.');
      }
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setImage(null);
    setPreview(null);
    setResult(null);
    setError(null);
    setScanTime(null);
    if (mode === 'POD_SCAN') setActiveDelivery(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  if (mode === 'HOME') {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center p-4">
        <div className="w-full max-w-md bg-white p-8 rounded-2xl shadow-sm border border-slate-100 space-y-6">
          <div className="flex justify-center mb-2">
            <div className="p-4 bg-primary/10 rounded-full text-primary">
              <FileText size={40} />
            </div>
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold text-slate-800">India ERP App</h1>
            <p className="text-slate-500 mt-1">Select your workflow</p>
          </div>
          
          <div className="space-y-4 pt-4">
            <button 
              onClick={() => setMode('LR_CREATION')}
              className="w-full bg-slate-50 border-2 border-slate-200 hover:border-primary text-slate-700 py-4 px-4 rounded-xl font-semibold flex items-center justify-between transition group"
            >
              <div className="flex items-center space-x-3">
                <FileText className="text-primary" />
                <span className="text-left">
                  <span className="block">Scan Invoice</span>
                  <span className="block text-xs text-slate-400 font-normal">Pre-delivery (LR Creation)</span>
                </span>
              </div>
              <ChevronRight className="text-slate-400 group-hover:text-primary transition" />
            </button>

            <button 
              onClick={() => setMode('POD_SCAN')}
              className="w-full bg-slate-50 border-2 border-slate-200 hover:border-primary text-slate-700 py-4 px-4 rounded-xl font-semibold flex items-center justify-between transition group"
            >
              <div className="flex items-center space-x-3">
                <Truck className="text-primary" />
                <span className="text-left">
                  <span className="block">Driver Login</span>
                  <span className="block text-xs text-slate-400 font-normal">Post-delivery (POD Scan)</span>
                </span>
              </div>
              <ChevronRight className="text-slate-400 group-hover:text-primary transition" />
            </button>

            <button 
              onClick={() => handleSecuredNavigation('LR_DASHBOARD')}
              className="w-full bg-slate-50 border-2 border-slate-200 hover:border-primary text-slate-700 py-4 px-4 rounded-xl font-semibold flex items-center justify-between transition group"
            >
              <div className="flex items-center space-x-3">
                <BarChart className="text-primary" />
                <span className="text-left">
                  <span className="block">Reports & Dashboard</span>
                  <span className="block text-xs text-slate-400 font-normal">View LR delivery delays</span>
                </span>
              </div>
              <ChevronRight className="text-slate-400 group-hover:text-primary transition" />
            </button>

            <button 
              onClick={() => setMode('VOLUME_CALC')}
              className="w-full bg-gradient-to-r from-indigo-50 to-purple-50 border-2 border-indigo-200 hover:border-indigo-500 text-slate-700 py-4 px-4 rounded-xl font-semibold flex items-center justify-between transition group"
            >
              <div className="flex items-center space-x-3">
                <Box className="text-indigo-600" />
                <span className="text-left">
                  <span className="block text-indigo-700">Box Volume Scanner</span>
                  <span className="block text-xs text-indigo-400 font-normal">AI camera – Volumetric weight</span>
                </span>
              </div>
              <ChevronRight className="text-indigo-300 group-hover:text-indigo-600 transition" />
            </button>

            <button 
              onClick={() => handleSecuredNavigation('PAYROLL')}
              className="w-full bg-gradient-to-r from-emerald-50 to-teal-50 border-2 border-emerald-200 hover:border-emerald-500 text-slate-700 py-4 px-4 rounded-xl font-semibold flex items-center justify-between transition group"
            >
              <div className="flex items-center space-x-3">
                <Layers className="text-emerald-600" />
                <span className="text-left">
                  <span className="block text-emerald-700 font-bold">Passenger Contract Payroll</span>
                  <span className="block text-xs text-emerald-450 font-normal">Statement calculations & Grid editor</span>
                </span>
              </div>
              <ChevronRight className="text-emerald-300 group-hover:text-emerald-600 transition" />
            </button>

            <button 
              onClick={() => handleSecuredNavigation('DATABASE_EXPLORER')}
              className="w-full bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-200 hover:border-blue-500 text-slate-700 py-4 px-4 rounded-xl font-semibold flex items-center justify-between transition group"
            >
              <div className="flex items-center space-x-3">
                <Database className="text-blue-600" />
                <span className="text-left">
                  <span className="block text-blue-700 font-bold">Database Explorer</span>
                  <span className="block text-xs text-blue-450 font-normal">View & edit scanned invoices & POD data</span>
                </span>
              </div>
              <ChevronRight className="text-blue-300 group-hover:text-blue-600 transition" />
            </button>

            <button 
              onClick={() => handleSecuredNavigation('FREIGHT_AUDIT')}
              className="w-full bg-gradient-to-r from-violet-50 to-purple-50 border-2 border-violet-200 hover:border-violet-500 text-slate-700 py-4 px-4 rounded-xl font-semibold flex items-center justify-between transition group"
            >
              <div className="flex items-center space-x-3">
                <FileSpreadsheet className="text-violet-600" />
                <span className="text-left">
                  <span className="block text-violet-755 font-bold">Freight Billing Auditor</span>
                  <span className="block text-xs text-violet-450 font-normal">Audit ERP freight records against master rates</span>
                </span>
              </div>
              <ChevronRight className="text-violet-300 group-hover:text-violet-600 transition" />
            </button>

            <button 
              onClick={() => handleSecuredNavigation('INCENTIVE_CALC')}
              className="w-full bg-gradient-to-r from-amber-50 to-orange-50 border-2 border-amber-200 hover:border-amber-500 text-slate-700 py-4 px-4 rounded-xl font-semibold flex items-center justify-between transition group"
            >
              <div className="flex items-center space-x-3">
                <Coins className="text-amber-650" />
                <span className="text-left">
                  <span className="block text-amber-700 font-bold">Staff Incentive Calculator</span>
                  <span className="block text-xs text-amber-450 font-normal">Calculate dynamic incentives based on LR freight</span>
                </span>
              </div>
              <ChevronRight className="text-amber-300 group-hover:text-amber-600 transition" />
            </button>

            <button 
              onClick={() => handleSecuredNavigation('EFF_PAYROLL_AUDIT')}
              className="w-full bg-gradient-to-r from-red-50 to-rose-50 border-2 border-red-200 hover:border-red-500 text-slate-700 py-4 px-4 rounded-xl font-semibold flex items-center justify-between transition group"
            >
              <div className="flex items-center space-x-3">
                <FileSpreadsheet className="text-red-650" />
                <span className="text-left">
                  <span className="block text-red-750 font-bold">EFF Payroll Auditor</span>
                  <span className="block text-xs text-red-450 font-normal">Audit EFF Salary Payroll for errors & statutory compliance</span>
                </span>
              </div>
              <ChevronRight className="text-red-300 group-hover:text-red-650 transition" />
            </button>
          </div>
        </div>
        {renderPinModal()}
      </div>
    );
  }

  if (mode === 'POD_SCAN' && !user) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center p-4">
        <div className="w-full max-w-md bg-white p-8 rounded-2xl shadow-sm border border-slate-100">
          <div className="flex justify-center mb-6">
            <div className="p-4 bg-primary/10 rounded-full text-primary">
              <Truck size={40} />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-center text-slate-800 mb-2">Driver Portal</h1>
          <p className="text-center text-slate-500 mb-8">Login to manage your deliveries</p>
          
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Username</label>
              <input 
                type="text" 
                value={username}
                onChange={e => setUsername(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition"
                placeholder="Enter your driver ID"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
              <input 
                type="password" 
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition"
                placeholder="Enter password"
              />
            </div>
            <button 
              type="submit"
              className="w-full bg-primary text-white py-3.5 rounded-xl font-semibold flex items-center justify-center space-x-2 shadow-md hover:bg-primary/90 transition"
            >
              <LogIn size={20} />
              <span>Login</span>
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-secondary pb-12">
      <header className="bg-primary text-white p-4 shadow-md sticky top-0 z-10 flex justify-between items-center">
        <div>
          <h1 className="text-xl font-bold">
            {mode === 'LR_CREATION' ? 'LR Creation Scanner' : 
             mode === 'POD_SCAN' ? 'Driver POD Scanner' :
             mode === 'VOLUME_CALC' ? 'Box Volume Scanner' :
             mode === 'PAYROLL' ? 'Passenger Contract Payroll' :
             mode === 'DATABASE_EXPLORER' ? 'Database Explorer' :
             mode === 'FREIGHT_AUDIT' ? 'Freight Billing Auditor' :
             mode === 'INCENTIVE_CALC' ? 'Staff Incentive Calculator' :
             mode === 'EFF_PAYROLL_AUDIT' ? 'EFF Salary Payroll Auditor' :
             'Analytics Dashboard'}
          </h1>
          {user && <p className="text-xs text-blue-100 mt-0.5">Welcome, {user.name}</p>}
        </div>
        <div className="flex space-x-2">
          {mode === 'POD_SCAN' && user && (
            <button onClick={handleLogout} className="p-2 bg-white/10 rounded-full hover:bg-white/20 transition">
              <User size={20} />
            </button>
          )}
          <button onClick={() => { setMode('HOME'); resetForm(); }} className="px-3 py-1.5 bg-white/10 rounded-full hover:bg-white/20 transition text-xs font-semibold">
            Home
          </button>
        </div>
      </header>

      <main className={`mx-auto p-4 mt-4 space-y-6 ${(mode === 'LR_DASHBOARD' || mode === 'PAYROLL' || mode === 'DATABASE_EXPLORER' || mode === 'FREIGHT_AUDIT' || mode === 'INCENTIVE_CALC' || mode === 'EFF_PAYROLL_AUDIT') ? 'max-w-[98%]' : 'max-w-md'}`}>
        {mode === 'DATABASE_EXPLORER' && (
          <DatabaseExplorer />
        )}
        {mode === 'PAYROLL' && (
          <PayrollProcessor />
        )}
        {mode === 'FREIGHT_AUDIT' && (
          <FreightCalculator onBack={() => { setMode('HOME'); }} />
        )}
        {mode === 'INCENTIVE_CALC' && (
          <IncentiveCalculator onBack={() => { setMode('HOME'); }} />
        )}
        {mode === 'EFF_PAYROLL_AUDIT' && (
          <EFFPayrollAuditor onBack={() => { setMode('HOME'); }} />
        )}
        {mode === 'LR_DASHBOARD' && (
          <DeliveryDashboard />
        )}
        {mode === 'VOLUME_CALC' && (
          <VolumeCalculator onBack={() => { setMode('HOME'); }} />
        )}
        {mode === 'POD_SCAN' && !activeDelivery && !result && (
          <div className="space-y-4">
            <h2 className="font-semibold text-slate-800 text-lg">My Active Deliveries</h2>
            {mockDeliveries.map(del => (
              <div key={del.id} onClick={() => setActiveDelivery(del)} className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 cursor-pointer hover:border-primary transition flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-slate-800">{del.id}</h3>
                  <p className="text-sm text-slate-500">{del.consignee}</p>
                </div>
                <div className="p-2 bg-slate-50 text-slate-400 rounded-full">
                  <ChevronRight size={20} />
                </div>
              </div>
            ))}
          </div>
        )}

        {((mode === 'POD_SCAN' && activeDelivery && !result) || (mode === 'LR_CREATION' && !result)) && (
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col items-center space-y-4">
            {mode === 'LR_CREATION' && (
              <div className="w-full text-left space-y-1.5 mb-2 pb-2 border-b border-slate-100">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Select Consignor</label>
                <select 
                  value={consignorType}
                  onChange={(e) => setConsignorType(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none bg-white font-semibold text-slate-700 transition"
                >
                  <option value="GENERAL">🔍 Auto-Detect Consignor</option>
                  <option value="ACMATEX">🎨 Acmatex Coating Pvt Ltd</option>
                  <option value="ALLIED_COATING">🎨 Allied Coating Industries</option>
                  <option value="AMPLE_TRADE">📦 Ample Trade Incorporates Kannur</option>
                  <option value="ASIAN_PAINTS">🎨 Asian Paints Ltd</option>
                  <option value="ASTRAL_PAINTS">🖌️ Astral / Gem Paints</option>
                  <option value="BIRLA_OPUS">🎨 Birla Opus</option>
                  <option value="CERA">🚽 Cera Sanitaryware Ltd</option>
                  <option value="CRI_PUMPS">💧 CRI Pumps Pvt Ltd</option>
                  <option value="DURAMETAL">⚙️ Durametal Systems Pvt Ltd</option>
                  <option value="FINOLEX">🔌 Finolex Cables Ltd</option>
                  <option value="FORTUNE">📦 Fortune Business Corp</option>
                  <option value="HEME_DIAMED">🔬 Heme Diamed LLP</option>
                  <option value="IDEMITSU">🔋 Idemitsu Lube India Pvt Ltd</option>
                  <option value="IRA_CHEM">🧪 Ira Chem</option>
                  <option value="ISOCHEM">🧪 Isochem Laboratory</option>
                  <option value="JJ_CHEMICALS">🧪 J J Chemicals</option>
                  <option value="KEI">⚡ KEI Industries Limited</option>
                  <option value="LUMINOUS">🔋 Luminous Power</option>
                  <option value="MICOLUBE">🔋 Micolube India Ltd</option>
                  <option value="MIRAS">📦 Miras Traders</option>
                  <option value="NICE_CHEMICALS">🧪 Nice Chemicals (P) Ltd</option>
                  <option value="PIDILITE">🧪 Pidilite Industries Ltd</option>
                  <option value="SAYEGH">🎨 Sayegh Paint Factories India Pvt Ltd</option>
                  <option value="SEEKEN">🔌 Seeken Electronics India Pvt Ltd</option>
                  <option value="SMILE_COAT">🎨 Smile Coat</option>
                  <option value="SPECTRUM">🧪 Spectrum Reagents and Chemicals Pvt Ltd</option>
                  <option value="SPEED_AWAY">🚗 Speed A Way Private Ltd</option>
                  <option value="TORMAC">💧 Tormac Pumps</option>
                  <option value="TRACO_CABLE">🔌 Traco Cable Company Ltd</option>
                  <option value="UNIVERSAL">📦 Universal Corporation Limited</option>
                </select>
              </div>
            )}
            {mode === 'POD_SCAN' && activeDelivery && (
              <div className="w-full pb-4 mb-2 border-b border-slate-100 flex justify-between items-center">
                <div>
                  <p className="text-xs text-slate-500 font-medium">Scanning POD for</p>
                  <h3 className="font-bold text-primary">{activeDelivery.id}</h3>
                </div>
                <button onClick={() => setActiveDelivery(null)} className="text-xs font-semibold text-slate-400 bg-slate-50 px-3 py-1.5 rounded-full">Cancel</button>
              </div>
            )}
            <input 
              type="file" 
              accept="image/*" 
              capture="environment"
              onChange={handleCapture}
              className="hidden"
              ref={fileInputRef}
            />
            
            {preview ? (
              <div className="relative w-full aspect-[3/4] bg-slate-100 rounded-xl overflow-hidden border border-slate-200 shadow-inner">
                <img src={preview} alt="Invoice preview" className="w-full h-full object-cover" />
                {loading && (
                  <div className="absolute inset-0 bg-slate-950/90 flex flex-col items-center justify-center text-white space-y-4 p-6 transition-all duration-300">
                    <div className="relative flex items-center justify-center">
                      <div className="absolute w-16 h-16 bg-blue-500/20 rounded-full animate-ping" />
                      <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500/20 border-t-blue-400 relative z-10"></div>
                    </div>
                    <div className="text-center space-y-2 relative z-10">
                      <p className="font-bold text-lg tracking-wide text-white">Analyzing Document...</p>
                      <p className="text-xs text-blue-200 bg-blue-500/10 border border-blue-500/20 px-3 py-1 rounded-full inline-block font-mono">
                        {countdownSeconds > 1 
                          ? `Extracting data in ${countdownSeconds}s` 
                          : "Finalizing details..."}
                      </p>
                    </div>
                  </div>
                )}
                {!loading && (
                  <button 
                    onClick={resetForm}
                    className="absolute top-3 right-3 bg-slate-900/80 text-white px-3 py-1.5 rounded-full text-xs hover:bg-slate-900 transition"
                  >
                    Retake
                  </button>
                )}
              </div>
            ) : (
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="w-full aspect-[3/4] bg-slate-50 border-2 border-dashed border-slate-300 rounded-xl flex flex-col items-center justify-center text-slate-500 hover:bg-slate-100 transition-colors"
              >
                <div className="p-4 bg-white rounded-full shadow-sm border border-slate-100 mb-4">
                  <Camera size={40} className="text-primary" />
                </div>
                <span className="font-semibold text-lg text-slate-700">Tap to Scan Invoice</span>
                <span className="text-sm mt-1 text-slate-400">Take a clear photo in good light</span>
              </button>
            )}

            {image && (
              <button 
                onClick={handleUpload}
                disabled={loading}
                className="w-full bg-primary text-white py-4 px-4 rounded-xl font-semibold flex items-center justify-center space-x-2 shadow-lg shadow-primary/30 active:scale-[0.98] transition-all disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <div className="flex flex-col items-center justify-center space-y-1">
                    <div className="flex items-center space-x-2">
                      <div className="animate-spin rounded-full h-5 w-5 border-2 border-white/20 border-t-white"></div>
                      <span>Processing with AI...</span>
                    </div>
                    <span className="text-[11px] text-blue-200 font-medium">
                      {countdownSeconds > 1 
                        ? `Estimated time remaining: ${countdownSeconds} seconds` 
                        : "Finishing up, please wait..."}
                    </span>
                  </div>
                ) : (
                  <>
                    <Upload size={22} />
                    <span>{mode === 'LR_CREATION' ? 'Extract Consignee Data' : 'Verify POD & Remarks'}</span>
                  </>
                )}
              </button>
            )}

            {error && (
              <div className="w-full p-4 bg-red-50 text-red-600 rounded-xl text-sm text-center border border-red-100">
                {error}
              </div>
            )}
          </div>
        )}

        {result && (
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 space-y-6">
            <div className="flex flex-col items-center justify-center space-y-2 text-accent">
              <CheckCircle size={48} className="drop-shadow-sm" />
              <h2 className="text-xl font-bold text-slate-800">Extraction Success</h2>
              {scanTime && (
                <div className="inline-flex items-center space-x-1.5 px-3 py-1 bg-indigo-50 text-indigo-700 text-xs font-semibold rounded-full border border-indigo-100 mt-1">
                  <span>⚡ Scan Completed in {scanTime} seconds</span>
                </div>
              )}
            </div>
            
            <div className="space-y-4 pt-2 max-h-[50vh] overflow-y-auto px-1 scrollbar-thin">
              {(() => {
                const lrLabels = {
                  consignor: "Consignor Name",
                  invoice_no: "Invoice Number",
                  ship_to_party_consignee: "Consignee Name",
                  consignee_code: "Consignee Code",
                  ship_to_party_consignee_gstin: "Consignee GSTIN",
                  place: "Place",
                  area: "Area",
                  address: "Address",
                  invoice_value_total: "Invoice Value Total (₹)",
                  invoice_item_total_count: "Invoice Item Total Count",
                  item_wise_count: "Item-wise Count"
                };

                const podLabels = {
                  invoice_no: "Invoice Number",
                  ship_to_party_consignee: "Consignee Name",
                  remarks: "Remarks / Details",
                  remarks_from_consignee: "Remarks from Consignee",
                  seal_ok: "Seal OK",
                  sign_ok: "Signature OK",
                  date_ok: "Date OK",
                  consignee_seal_matched: "Consignee Seal Matched"
                };

                const labels = mode === 'LR_CREATION' ? lrLabels : podLabels;
                
                return Object.keys(labels).map((key) => {
                  const val = result[key];
                  if (mode === 'POD_SCAN' && ['remarks', 'remarks_from_consignee'].includes(key) && !val) {
                    return null;
                  }
                  
                  return (
                    <div key={key} className="p-3 bg-slate-50 rounded-xl border border-slate-100 shadow-sm text-left">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{labels[key]}</span>
                      <p className="font-semibold text-slate-800 mt-1 text-sm whitespace-pre-wrap">{val || '-'}</p>
                    </div>
                  );
                });
              })()}
            </div>

            <div className="flex flex-col gap-3">
              <button 
                onClick={resetForm}
                className="w-full bg-slate-100 text-slate-700 py-4 px-4 rounded-xl font-semibold flex items-center justify-center space-x-2 hover:bg-slate-200 transition-colors shadow-sm"
              >
                <span>{mode === 'LR_CREATION' ? 'Scan Next Invoice' : 'Scan Next POD'}</span>
                <ChevronRight size={20} />
              </button>
            </div>
          </div>
        )}
      </main>

      {/* PIN Modal Overlay */}
      {renderPinModal()}
    </div>
  );
}

export default App;
