import React, { useState, useRef } from 'react';
import { Camera, Loader2, CheckCircle, RotateCcw, Box, Ruler, AlertCircle, ChevronRight, Save, Edit3 } from 'lucide-react';
import axios from 'axios';

// Volumetric weight formula used in Indian logistics industry
const calcVolumetric = (l, w, h) => {
  if (!l || !w || !h) return 0;
  return ((parseFloat(l) * parseFloat(w) * parseFloat(h)) / 5000).toFixed(2);
};

const calcChargeable = (actual, volumetric) => {
  const a = parseFloat(actual) || 0;
  const v = parseFloat(volumetric) || 0;
  return Math.max(a, v).toFixed(2);
};

export default function VolumeCalculator({ onBack }) {
  const [step, setStep] = useState('GUIDE'); // GUIDE → CAPTURE → PROCESSING → RESULT → EDIT
  const [image, setImage] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);

  const [dims, setDims] = useState({ length: '', width: '', height: '' });
  const [actualWeight, setActualWeight] = useState('');
  const [confidence, setConfidence] = useState('');
  const [isEditing, setIsEditing] = useState(false);

  const fileInputRef = useRef(null);

  const volumetric = calcVolumetric(dims.length, dims.width, dims.height);
  const chargeable = calcChargeable(actualWeight, volumetric);

  // ── Step 1: Compress + store photo ────────────────────────────────────────
  const handleCapture = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setError(null);
    setPreview(URL.createObjectURL(file));

    const reader = new FileReader();
    reader.onload = (evt) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX = 1400;
        let w = img.width, h = img.height;
        if (w > MAX) { h = (h * MAX) / w; w = MAX; }
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        canvas.toBlob(
          (blob) => setImage(new File([blob], file.name, { type: 'image/jpeg' })),
          'image/jpeg', 0.82
        );
      };
      img.src = evt.target.result;
    };
    reader.readAsDataURL(file);
    setStep('CAPTURE');
  };

  // ── Step 2: Send to Gemini AI API ─────────────────────────────────────────
  const handleAnalyse = async () => {
    if (!image) return;
    setLoading(true);
    setError(null);
    setStep('PROCESSING');

    const formData = new FormData();
    formData.append('box_photo', image);

    try {
      const isProd = import.meta.env.PROD;
      const baseUrl = isProd ? '' : 'http://localhost:3001';
      const res = await axios.post(`${baseUrl}/api/measure-volume`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 30000,
      });

      const { length_cm, width_cm, height_cm, confidence: conf } = res.data;
      setDims({ length: String(length_cm), width: String(width_cm), height: String(height_cm) });
      setConfidence(conf || 'medium');
      setStep('RESULT');
    } catch (err) {
      const msg = err.response?.data?.error || err.message || 'AI analysis failed';
      setError(msg);
      setStep('CAPTURE');
    } finally {
      setLoading(false);
    }
  };

  // ── Step 3: Save to Supabase ───────────────────────────────────────────────
  const handleSave = async () => {
    setLoading(true);
    try {
      const isProd = import.meta.env.PROD;
      const baseUrl = isProd ? '' : 'http://localhost:3001';
      await axios.post(`${baseUrl}/api/save-volume`, {
        length_cm: dims.length,
        width_cm: dims.width,
        height_cm: dims.height,
        actual_weight_kg: actualWeight || null,
        volumetric_weight_kg: volumetric,
        chargeable_weight_kg: chargeable,
      });
      setSaved(true);
    } catch (err) {
      setError('Save failed: ' + (err.response?.data?.error || err.message));
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setStep('GUIDE');
    setImage(null);
    setPreview(null);
    setDims({ length: '', width: '', height: '' });
    setActualWeight('');
    setConfidence('');
    setError(null);
    setSaved(false);
    setIsEditing(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // ─────────────────────────────────────────────────────────────────────────
  // GUIDE SCREEN
  // ─────────────────────────────────────────────────────────────────────────
  if (step === 'GUIDE') {
    return (
      <div className="space-y-5">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-5 text-white">
            <div className="flex items-center gap-3 mb-1">
              <Box size={24} />
              <h2 className="text-lg font-bold">Box Volume Scanner</h2>
            </div>
            <p className="text-indigo-100 text-sm">AI ഉപയോഗിച്ച് Volumetric Weight auto-calculate ചെയ്യുന്നു</p>
          </div>

          {/* Steps */}
          <div className="p-5 space-y-4">
            <p className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Photo എടുക്കുന്ന വിധം</p>

            <div className="flex gap-4 items-start">
              <div className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-700 font-bold flex items-center justify-center flex-shrink-0 text-sm">1</div>
              <div>
                <p className="font-semibold text-slate-800">30cm Scale → Box-ന്റെ TOP-ൽ flat ആയി വെക്കുക</p>
                <p className="text-sm text-slate-500 mt-0.5">Scale box-ന്റെ ഒരു edge-ൽ align ചെയ്ത് വെക്കണം</p>
              </div>
            </div>

            <div className="flex gap-4 items-start">
              <div className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-700 font-bold flex items-center justify-center flex-shrink-0 text-sm">2</div>
              <div>
                <p className="font-semibold text-slate-800">ഫോൺ 45° diagonal ആയി hold ചെയ്ത് Photo എടുക്കുക</p>
                <p className="text-sm text-slate-500 mt-0.5">Box-ന്റെ 3 sides കാണണം — Top, Front, Side</p>
              </div>
            </div>

            {/* Visual diagram */}
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 font-mono text-xs text-slate-600 leading-relaxed">
              <p className="text-center text-slate-400 text-[10px] mb-2">📷 Camera Position (45° angle)</p>
              <pre className="text-center">{`
     📷
      ↘
    ╔══[══30cm══]══╗  ← Scale on TOP
   ╱║              ║
  ╱ ║    BOX       ║ ← Side = Height
 ╱  ╚══════════════╝
                      ↑
                   Front = Width`}
              </pre>
            </div>

            <div className="flex gap-3 p-3 bg-amber-50 border border-amber-200 rounded-xl">
              <AlertCircle size={18} className="text-amber-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-amber-800">
                <strong>ശ്രദ്ധിക്കുക:</strong> Photo-യിൽ Scale-ഉം Box-ന്റെ 3 sides-ഉം clearly കാണണം. Good lighting ഉറപ്പാക്കുക.
              </p>
            </div>
          </div>

          {/* Camera Button */}
          <div className="px-5 pb-5">
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleCapture}
              className="hidden"
              ref={fileInputRef}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-4 rounded-xl font-semibold flex items-center justify-center gap-2 shadow-lg shadow-indigo-200 active:scale-[0.98] transition-all"
            >
              <Camera size={22} />
              <span>Camera തുറക്കുക</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // CAPTURE SCREEN (preview + analyse button)
  // ─────────────────────────────────────────────────────────────────────────
  if (step === 'CAPTURE') {
    return (
      <div className="space-y-4">
        <input
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleCapture}
          className="hidden"
          ref={fileInputRef}
        />

        {preview && (
          <div className="relative w-full aspect-[4/3] bg-slate-100 rounded-2xl overflow-hidden border-2 border-indigo-200 shadow-sm">
            <img src={preview} alt="Box preview" className="w-full h-full object-cover" />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="absolute top-3 right-3 bg-black/60 text-white px-3 py-1.5 rounded-full text-xs backdrop-blur-sm flex items-center gap-1"
            >
              <RotateCcw size={12} /> Retake
            </button>
          </div>
        )}

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm flex gap-2 items-start">
            <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
            {error}
          </div>
        )}

        <button
          onClick={handleAnalyse}
          disabled={!image}
          className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-4 rounded-xl font-semibold flex items-center justify-center gap-2 shadow-lg shadow-indigo-200 active:scale-[0.98] transition-all disabled:opacity-50"
        >
          <Ruler size={20} />
          <span>AI-കൊണ്ട് Measure ചെയ്യുക</span>
        </button>

        <button onClick={reset} className="w-full py-3 text-sm text-slate-500 font-medium hover:text-slate-700 transition">
          ← Back
        </button>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PROCESSING SCREEN
  // ─────────────────────────────────────────────────────────────────────────
  if (step === 'PROCESSING') {
    return (
      <div className="flex flex-col items-center justify-center py-16 space-y-5">
        <div className="relative">
          <div className="w-20 h-20 rounded-full bg-indigo-100 flex items-center justify-center">
            <Box size={36} className="text-indigo-600" />
          </div>
          <div className="absolute inset-0 rounded-full border-4 border-indigo-400 border-t-transparent animate-spin" />
        </div>
        <div className="text-center">
          <p className="font-semibold text-slate-800 text-lg">AI Analysing...</p>
          <p className="text-slate-500 text-sm mt-1">30cm Scale detect ചെയ്ത് Box dimensions കണ്ടെത്തുന്നു</p>
        </div>
        <div className="flex gap-2 text-xs text-slate-400">
          <Loader2 size={14} className="animate-spin" />
          <span>Gemini Vision Processing</span>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RESULT SCREEN
  // ─────────────────────────────────────────────────────────────────────────
  if (step === 'RESULT') {
    const confColor = confidence === 'high' ? 'text-green-600 bg-green-50 border-green-200'
      : confidence === 'medium' ? 'text-amber-600 bg-amber-50 border-amber-200'
      : 'text-red-600 bg-red-50 border-red-200';

    return (
      <div className="space-y-4">
        {/* Success header */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="bg-gradient-to-r from-green-500 to-emerald-600 p-5 text-white flex items-center gap-3">
            <CheckCircle size={28} />
            <div>
              <h2 className="font-bold text-lg">Measurement Complete!</h2>
              <p className="text-green-100 text-sm">AI analysis successful</p>
            </div>
            <span className={`ml-auto text-xs font-semibold px-2.5 py-1 rounded-full border ${confColor} capitalize`}>
              {confidence} confidence
            </span>
          </div>

          {/* Preview thumbnail */}
          {preview && (
            <div className="w-full h-40 overflow-hidden border-b border-slate-100">
              <img src={preview} alt="Box" className="w-full h-full object-cover" />
            </div>
          )}

          {/* Dimensions */}
          <div className="p-5 space-y-3">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Box Dimensions</p>

            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Length', key: 'length', icon: '↔' },
                { label: 'Width', key: 'width', icon: '↕' },
                { label: 'Height', key: 'height', icon: '↨' },
              ].map(({ label, key, icon }) => (
                <div key={key} className="bg-indigo-50 rounded-xl p-3 text-center border border-indigo-100">
                  <p className="text-xs text-indigo-400 font-medium">{icon} {label}</p>
                  {isEditing ? (
                    <input
                      type="number"
                      value={dims[key]}
                      onChange={(e) => setDims(d => ({ ...d, [key]: e.target.value }))}
                      className="w-full text-center text-lg font-bold text-indigo-700 bg-white border border-indigo-300 rounded-lg mt-1 p-1 outline-none"
                    />
                  ) : (
                    <p className="text-xl font-bold text-indigo-700 mt-1">{dims[key]}</p>
                  )}
                  <p className="text-xs text-indigo-400 mt-0.5">cm</p>
                </div>
              ))}
            </div>

            {/* Weight section */}
            <div className="border-t border-slate-100 pt-3 space-y-3 mt-1">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Weight Details</p>

              <div className="flex items-center justify-between bg-slate-50 rounded-xl p-3 border border-slate-200">
                <div>
                  <p className="text-xs text-slate-400 font-medium">Volumetric Weight</p>
                  <p className="text-2xl font-bold text-slate-800">{volumetric} <span className="text-sm font-medium text-slate-500">kg</span></p>
                  <p className="text-[10px] text-slate-400 mt-0.5">({dims.length} × {dims.width} × {dims.height}) ÷ 5000</p>
                </div>
                <Box size={32} className="text-slate-300" />
              </div>

              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <label className="text-xs text-slate-400 font-medium block mb-1">Actual Weight (kg)</label>
                  <input
                    type="number"
                    placeholder="0.00"
                    value={actualWeight}
                    onChange={(e) => setActualWeight(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 text-slate-800 font-semibold"
                  />
                </div>
                <ChevronRight size={16} className="text-slate-300 mt-5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-xs text-slate-400 font-medium mb-1">Chargeable Weight</p>
                  <div className="px-3 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold text-center">
                    {chargeable} kg
                  </div>
                  <p className="text-[10px] text-center text-slate-400 mt-0.5">max(actual, vol.)</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm flex gap-2">
            <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
            {error}
          </div>
        )}

        {/* Action buttons */}
        {!saved ? (
          <div className="flex gap-3">
            <button
              onClick={() => setIsEditing(!isEditing)}
              className="flex-1 py-3.5 rounded-xl border-2 border-indigo-200 text-indigo-700 font-semibold flex items-center justify-center gap-2 active:bg-indigo-50 transition"
            >
              <Edit3 size={18} />
              {isEditing ? 'Done' : 'Edit'}
            </button>
            <button
              onClick={handleSave}
              disabled={loading}
              className="flex-[2] bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-3.5 rounded-xl font-semibold flex items-center justify-center gap-2 shadow-lg shadow-indigo-200 active:scale-[0.98] transition-all disabled:opacity-60"
            >
              {loading ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
              {loading ? 'Saving...' : 'Save to ERP'}
            </button>
          </div>
        ) : (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
            <CheckCircle size={28} className="text-green-500 mx-auto mb-2" />
            <p className="font-bold text-green-800">Saved Successfully!</p>
            <p className="text-sm text-green-600 mt-0.5">ERP-ൽ record ചേർത്തു ✅</p>
          </div>
        )}

        <button onClick={reset} className="w-full py-3 text-sm text-slate-500 font-medium hover:text-slate-700 transition">
          🔄 New Scan
        </button>
      </div>
    );
  }

  return null;
}
