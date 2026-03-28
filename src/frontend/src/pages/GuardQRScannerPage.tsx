import { useState, useRef, useEffect, useCallback } from 'react';
import {
  ArrowLeft, Zap, X, CheckCircle, XCircle, AlertTriangle,
  User, Keyboard, Square, Camera, Phone, MapPin, Car
} from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { useDataStore } from '../stores/dataStore';
import { useLanguageStore } from '../stores/languageStore';
import { guestCodesApi, apiRequest } from '../services/api';
import { type GuestAccessCode } from '../types';
import { Modal } from '../components/common';

interface ScanLog {
  id: string;
  code_id: string;
  scanned_by_id: string;
  scanned_by_name: string;
  scanned_by_role: string;
  action: string;
  visitor_type: string;
  resident_name: string;
  resident_apartment: string;
  scanned_at: string;
}

type ScanResult = {
  status: 'success' | 'expired' | 'used' | 'revoked' | 'invalid' | 'not_yet_valid';
  code?: GuestAccessCode;
  message: string;
};

export function GuardQRScannerPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuthStore();
  const { validateGuestAccessCode, useGuestAccessCode, guestAccessCodes } = useDataStore();
  const { language } = useLanguageStore();

  const [isScanning, setIsScanning] = useState(false);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [showManualInput, setShowManualInput] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [scanLogs, setScanLogs] = useState<ScanLog[]>([]);
  const [flashOn, setFlashOn] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationRef = useRef<number | null>(null);
  const scanningRef = useRef(false);

  const activeCodesCount = guestAccessCodes.filter(c => c.status === 'active').length;

  useEffect(() => {
    apiRequest<{ logs: ScanLog[] }>('/api/guest-codes/scan-history')
      .then(res => setScanLogs(res.logs || []))
      .catch(err => console.error('Failed to fetch scan history:', err));
  }, []);

  useEffect(() => {
    startCamera();
    return () => { stopCamera(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const processQRCode = useCallback((qrData: string) => {
    const result = validateGuestAccessCode(qrData);
    if (!result.valid) {
      let message = '';
      let status: ScanResult['status'] = 'invalid';
      switch (result.error) {
        case 'expired': status = 'expired'; message = language === 'ru' ? 'Пропуск истёк' : 'Ruxsatnoma muddati tugagan'; break;
        case 'revoked': status = 'revoked'; message = language === 'ru' ? 'Пропуск отменён' : 'Ruxsatnoma bekor qilingan'; break;
        case 'already_used': case 'max_uses_reached': status = 'used'; message = language === 'ru' ? 'Пропуск уже использован' : 'Ruxsatnoma ishlatilgan'; break;
        case 'not_yet_valid': status = 'not_yet_valid'; message = language === 'ru' ? 'Пропуск ещё не действителен' : 'Ruxsatnoma hali amal qilmaydi'; break;
        default: status = 'invalid'; message = language === 'ru' ? 'Недействительный QR-код' : 'Noto\'g\'ri QR-kod';
      }
      setScanResult({ status, code: result.code, message });
    } else {
      setScanResult({ status: 'success', code: result.code, message: language === 'ru' ? 'Пропуск найден' : 'Ruxsatnoma topildi' });
    }
  }, [validateGuestAccessCode, language]);

  const scanFrame = useCallback(async () => {
    if (!scanningRef.current || !videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx || video.readyState !== video.HAVE_ENOUGH_DATA) {
      animationRef.current = requestAnimationFrame(() => { scanFrame(); });
      return;
    }
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    try {
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const { default: jsQR } = await import('jsqr');
      const qrCode = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'dontInvert' });
      if (qrCode && qrCode.data) {
        scanningRef.current = false;
        processQRCode(qrCode.data);
        return;
      }
    } catch (e) { console.error('QR scan error:', e); }
    animationRef.current = requestAnimationFrame(() => { scanFrame(); });
  }, [processQRCode]);

  const startCamera = async () => {
    try {
      setCameraError(null);
      setIsScanning(true);
      setIsCameraReady(false);
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('Camera API not supported');
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } });
      } catch { stream = await navigator.mediaDevices.getUserMedia({ video: true }); }
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        const playVideo = async () => {
          try {
            if (videoRef.current) { await videoRef.current.play(); setIsCameraReady(true); scanningRef.current = true; scanFrame(); }
          } catch (playErr) { console.error('Play error:', playErr); setCameraError(language === 'ru' ? 'Не удалось запустить видео.' : 'Video ishga tushmadi.'); }
        };
        videoRef.current.onloadedmetadata = () => { playVideo(); };
        videoRef.current.oncanplay = () => { if (!isCameraReady) playVideo(); };
      }
    } catch (err) {
      console.error('Camera error:', err);
      setIsScanning(false);
      let msg = language === 'ru' ? 'Не удалось получить доступ к камере.' : 'Kameraga kirish imkoni bo\'lmadi.';
      if (err instanceof Error) {
        if (err.name === 'NotAllowedError') msg = language === 'ru' ? 'Доступ к камере запрещён. Разрешите в настройках.' : 'Kameraga ruxsat berilmagan.';
        else if (err.name === 'NotFoundError') msg = language === 'ru' ? 'Камера не найдена.' : 'Kamera topilmadi.';
        else if (err.name === 'NotReadableError') msg = language === 'ru' ? 'Камера занята другим приложением.' : 'Kamera boshqa dastur tomonidan ishlatilmoqda.';
        else if (err.message === 'Camera API not supported') msg = language === 'ru' ? 'Камера не поддерживается. Используйте HTTPS.' : 'Kamera qo\'llab-quvvatlanmaydi.';
      }
      setCameraError(msg);
    }
  };

  const stopCamera = useCallback(() => {
    scanningRef.current = false;
    if (animationRef.current) { cancelAnimationFrame(animationRef.current); animationRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach(track => track.stop()); streamRef.current = null; }
    if (videoRef.current) videoRef.current.srcObject = null;
    setIsScanning(false);
    setIsCameraReady(false);
  }, []);

  const toggleFlash = async () => {
    if (streamRef.current) {
      const track = streamRef.current.getVideoTracks()[0];
      if (track) { try { await (track as any).applyConstraints({ advanced: [{ torch: !flashOn }] }); setFlashOn(!flashOn); } catch {} }
    }
  };

  const handleAllowEntry = async () => {
    if (!scanResult?.code || !user) return;
    try { await guestCodesApi.use(scanResult.code.id); } catch (err) { console.error('Failed to register code use:', err); }
    useGuestAccessCode(scanResult.code.id, scanResult.code);
    setScanLogs(prev => [{ id: crypto.randomUUID(), code_id: scanResult.code!.id, scanned_by_id: user.id, scanned_by_name: user.name, scanned_by_role: user.role, action: 'entry_allowed', visitor_type: scanResult.code!.visitorType, resident_name: scanResult.code!.residentName, resident_apartment: scanResult.code!.residentApartment || '', scanned_at: new Date().toISOString() }, ...prev]);
    setScanResult(null);
    scanningRef.current = true; scanFrame();
  };

  const handleDenyEntry = () => {
    if (!scanResult?.code || !user) return;
    setScanLogs(prev => [{ id: crypto.randomUUID(), code_id: scanResult.code!.id, scanned_by_id: user.id, scanned_by_name: user.name, scanned_by_role: user.role, action: 'entry_denied', visitor_type: scanResult.code!.visitorType, resident_name: scanResult.code!.residentName, resident_apartment: scanResult.code!.residentApartment || '', scanned_at: new Date().toISOString() }, ...prev]);
    setScanResult(null);
    scanningRef.current = true; scanFrame();
  };

  const handleManualSubmit = () => {
    if (!manualCode.trim()) return;
    processQRCode(manualCode.trim());
    setManualCode('');
    setShowManualInput(false);
  };

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr.endsWith?.('Z') ? dateStr : dateStr + 'Z');
    return d.toLocaleTimeString(language === 'ru' ? 'ru-RU' : 'uz-UZ', { hour: '2-digit', minute: '2-digit' });
  };

  const getInitials = (name: string) => name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  const recentLogs = scanLogs.slice(0, 3);

  return (
    <div className="fixed inset-0 z-[100] bg-gray-50 flex flex-col overflow-hidden">

      {/* ── Header ── */}
      <div className="relative z-20 bg-white border-b border-gray-100 px-4 flex items-center justify-between" style={{ paddingTop: 'max(env(safe-area-inset-top, 12px), 12px)', paddingBottom: '10px' }}>
        <button
          onClick={() => { stopCamera(); navigate((location.state as any)?.from ?? '/guest-access'); }}
          className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center active:scale-95 transition-transform"
        >
          <ArrowLeft className="w-5 h-5 text-gray-700" />
        </button>
        <span className="text-[17px] font-extrabold text-gray-900 tracking-tight">
          {language === 'ru' ? 'Сканер QR' : 'QR skaner'}
        </span>
        <button
          onClick={toggleFlash}
          className={`w-10 h-10 rounded-xl flex items-center justify-center active:scale-95 transition-all ${
            flashOn ? 'bg-amber-100 text-amber-600' : 'bg-gray-100 text-gray-500'
          }`}
        >
          <Zap className="w-5 h-5" />
        </button>
      </div>

      {/* ── Info pill ── */}
      <div className="relative z-20 bg-white flex justify-center pb-3 pt-2">
        <div className="bg-gray-50 border border-gray-200 rounded-full px-4 py-1.5 flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <span className="text-[12px] font-bold text-gray-600">
            {language === 'ru' ? 'Сканирование активно' : 'Skanerlash faol'}
          </span>
          <span className="text-[12px] font-extrabold text-primary-600">
            · {activeCodesCount} {language === 'ru' ? (activeCodesCount === 1 ? 'пропуск' : 'пропусков') : 'ruxsatnoma'}
          </span>
        </div>
      </div>

      {/* ── Scanner area (white bg, camera only inside frame) ── */}
      <div className="flex-1 relative bg-gray-50 flex flex-col items-center justify-center overflow-hidden">
        <canvas ref={canvasRef} className="hidden" />

        {/* Scanner frame with camera inside */}
        <div className="relative w-[260px] h-[260px]">
          {/* Camera viewport — clipped to rounded rect */}
          <div className="absolute inset-2 rounded-3xl overflow-hidden bg-gray-800">
            <video
              ref={videoRef}
              className="w-full h-full object-cover"
              playsInline muted autoPlay
            />

            {/* Loading state */}
            {(!isScanning || !isCameraReady) && !cameraError && (
              <div className="absolute inset-0 bg-gray-800 flex items-center justify-center">
                <div className="w-10 h-10 border-[3px] border-primary-500 border-t-transparent rounded-full animate-spin" />
              </div>
            )}

            {/* Camera error */}
            {cameraError && (
              <div className="absolute inset-0 bg-gray-800 flex items-center justify-center p-4">
                <div className="text-center">
                  <Camera className="w-8 h-8 text-gray-500 mx-auto mb-2" />
                  <p className="text-gray-400 text-xs font-medium mb-3">{cameraError}</p>
                  <button onClick={startCamera} className="px-4 py-2 rounded-xl bg-primary-500 text-white font-bold text-[12px] active:scale-95 transition-transform">
                    {language === 'ru' ? 'Повторить' : 'Qayta'}
                  </button>
                </div>
              </div>
            )}

            {/* Scan line inside camera */}
            <div className="absolute left-3 right-3 h-0.5 bg-primary-500 rounded-full animate-qr-scan opacity-80 z-10" />
          </div>

          {/* Corner L shapes (on top of camera) */}
          {[
            'top-0 left-0',
            'top-0 right-0 -scale-x-100',
            'bottom-0 left-0 -scale-y-100',
            'bottom-0 right-0 scale-[-1]',
          ].map((pos, i) => (
            <svg key={i} className={`absolute w-9 h-9 ${pos} z-10`} viewBox="0 0 36 36">
              <path d="M4 18 L4 4 L18 4" stroke="var(--brand, #F97316)" strokeWidth="4" strokeLinecap="round" fill="none" />
            </svg>
          ))}
        </div>

        {/* Hint below frame */}
        <div className="mt-6 text-center px-8">
          <div className="text-[14px] font-bold text-gray-800">
            {language === 'ru' ? 'Наведите на QR-код гостя' : 'QR-kodga yo\'naltiring'}
          </div>
          <div className="text-[12px] text-gray-400 font-medium mt-1">
            {language === 'ru' ? 'Пропуск будет проверен автоматически' : 'Avtomatik tekshiriladi'}
          </div>
        </div>
      </div>

      {/* ── Bottom section (white) ── */}
      <div className="relative z-20 bg-white border-t border-gray-100" style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 12px), 12px)' }}>

        {/* Recent passes */}
        {recentLogs.length > 0 && (
          <div className="px-4 pt-3 pb-2">
            <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
              {language === 'ru' ? 'Последние пропуска' : 'Oxirgi ruxsatnomalar'}
            </div>
            {recentLogs.slice(0, 2).map((log) => {
              const isAllowed = log.action === 'entry_allowed' || log.action === 'scan_success';
              return (
                <div key={log.id} className="flex items-center gap-3 py-2.5 border-b border-gray-50 last:border-0">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center text-[12px] font-extrabold text-white flex-shrink-0" style={{
                    background: isAllowed ? 'linear-gradient(135deg, var(--brand, #F97316), #FB923C)' : '#9CA3AF'
                  }}>
                    {getInitials(log.resident_name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-bold text-gray-900 truncate">{log.resident_name}</div>
                    <div className="text-xs text-gray-400 font-medium">
                      {isAllowed ? (language === 'ru' ? 'Пропущен' : 'O\'tkazildi') : (language === 'ru' ? 'Отказано' : 'Rad etildi')} · {formatTime(log.scanned_at)}
                    </div>
                  </div>
                  <div className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                    isAllowed ? 'bg-green-50 text-green-600 border border-green-200' : 'bg-gray-100 text-gray-400'
                  }`}>
                    {isAllowed ? (language === 'ru' ? 'Вход' : 'Kirdi') : (language === 'ru' ? 'Отказ' : 'Rad')}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Action buttons */}
        <div className="px-4 pt-2 pb-1 flex gap-2.5">
          <button
            onClick={() => setShowManualInput(true)}
            className="flex-1 py-3.5 bg-gray-100 rounded-2xl flex items-center justify-center gap-2 text-[14px] font-bold text-gray-700 active:scale-[0.97] transition-transform"
          >
            <Keyboard className="w-4 h-4" />
            {language === 'ru' ? 'Ввести код' : 'Kod kiriting'}
          </button>
          <button
            onClick={() => { stopCamera(); navigate((location.state as any)?.from ?? '/guest-access'); }}
            className="flex-1 py-3.5 bg-red-50 rounded-2xl flex items-center justify-center gap-2 text-[14px] font-bold text-red-500 active:scale-[0.97] transition-transform border border-red-100"
          >
            <Square className="w-4 h-4" />
            {language === 'ru' ? 'Остановить' : 'To\'xtatish'}
          </button>
        </div>
      </div>

      {/* ── Manual Input Modal ── */}
      <Modal
        isOpen={showManualInput}
        onClose={() => setShowManualInput(false)}
        title={language === 'ru' ? 'Ввод кода пропуска' : 'Ruxsatnoma kodini kiriting'}
        size="md"
      >
            <input
              type="text"
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              placeholder="GA-xxxxx-xxxxx-xxxxx"
              className="w-full px-4 py-3.5 bg-gray-50 border border-gray-200 rounded-2xl text-gray-900 placeholder-gray-400 font-mono text-[15px] focus:outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100 mb-4"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleManualSubmit()}
            />
            <button
              onClick={handleManualSubmit}
              disabled={!manualCode.trim()}
              className="w-full py-3.5 rounded-2xl font-bold text-[14px] text-white bg-primary-500 hover:bg-primary-600 active:scale-[0.97] transition-all disabled:bg-gray-200 disabled:text-gray-400"
            >
              {language === 'ru' ? 'Проверить' : 'Tekshirish'}
            </button>
      </Modal>

      {/* ── Scan Result Overlay ── */}
      {scanResult && (
        <div className="absolute inset-0 z-30 bg-black/50 backdrop-blur-sm flex items-center justify-center px-5" onClick={() => { setScanResult(null); scanningRef.current = true; scanFrame(); }}>
          <div className="bg-white rounded-3xl p-6 w-full max-w-[360px] shadow-2xl" onClick={e => e.stopPropagation()}>

            {/* Status icon */}
            <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${
              scanResult.status === 'success' ? 'bg-green-50' :
              ['expired','used','not_yet_valid'].includes(scanResult.status) ? 'bg-amber-50' : 'bg-red-50'
            }`} style={{ animation: 'successPop 0.4s cubic-bezier(.34,1.56,.64,1) both' }}>
              {scanResult.status === 'success' ? (
                <CheckCircle className="w-8 h-8 text-green-500" />
              ) : ['expired','used','not_yet_valid'].includes(scanResult.status) ? (
                <AlertTriangle className="w-8 h-8 text-amber-500" />
              ) : (
                <XCircle className="w-8 h-8 text-red-500" />
              )}
            </div>

            <div className="text-[19px] font-extrabold text-gray-900 text-center mb-0.5">{scanResult.message}</div>
            <div className="text-[13px] text-gray-400 text-center mb-5 font-medium">
              {scanResult.status === 'success'
                ? (language === 'ru' ? 'Разрешить вход посетителю?' : 'Tashrif buyuruvchini kiritishmi?')
                : (language === 'ru' ? 'Доступ запрещён' : 'Kirish taqiqlangan')
              }
            </div>

            {scanResult.code && (
              <>
                {/* Visitor */}
                <div className="bg-gray-50 rounded-2xl p-3.5 flex items-center gap-3 mb-3">
                  <div className="w-11 h-11 rounded-full flex items-center justify-center text-[15px] font-extrabold text-white flex-shrink-0" style={{ background: 'linear-gradient(135deg, var(--brand, #F97316), #FB923C)' }}>
                    {scanResult.code.visitorName ? getInitials(scanResult.code.visitorName) : <User className="w-5 h-5" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[15px] font-bold text-gray-900 truncate">
                      {scanResult.code.visitorName || (language === 'ru' ? 'Посетитель' : 'Tashrif buyuruvchi')}
                    </div>
                    {scanResult.code.visitorPhone && (
                      <div className="text-[12px] text-gray-500 mt-0.5 font-medium flex items-center gap-1">
                        <Phone className="w-3 h-3" /> {scanResult.code.visitorPhone}
                      </div>
                    )}
                    {scanResult.code.visitorVehiclePlate && (
                      <div className="text-[12px] text-gray-500 mt-0.5 font-medium flex items-center gap-1">
                        <Car className="w-3 h-3" /> {scanResult.code.visitorVehiclePlate}
                      </div>
                    )}
                  </div>
                  <div className={`px-2 py-1 rounded-lg text-xs font-bold ${
                    scanResult.status === 'success' ? 'bg-green-50 text-green-600 border border-green-200' : 'bg-red-50 text-red-500 border border-red-200'
                  }`}>
                    {scanResult.status === 'success' ? (language === 'ru' ? 'Активен' : 'Faol') : (language === 'ru' ? 'Недействит.' : 'Amal qilmaydi')}
                  </div>
                </div>

                {/* Resident (who invited) */}
                <div className="bg-blue-50 rounded-2xl p-3.5 flex items-center gap-3 mb-3">
                  <div className="w-11 h-11 rounded-full flex items-center justify-center text-[15px] font-extrabold text-blue-600 bg-blue-100 flex-shrink-0">
                    {getInitials(scanResult.code.residentName)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] text-blue-400 font-bold uppercase tracking-wide">{language === 'ru' ? 'К жителю' : 'Yashovchiga'}</div>
                    <div className="text-[15px] font-bold text-gray-900 truncate">{scanResult.code.residentName}</div>
                    <div className="text-[12px] text-gray-500 mt-0.5 font-medium flex items-center gap-1">
                      <MapPin className="w-3 h-3" />
                      {scanResult.code.residentAddress ? `${scanResult.code.residentAddress}, ` : ''}{language === 'ru' ? 'кв.' : 'xona'} {scanResult.code.residentApartment}
                    </div>
                    {scanResult.code.residentPhone && (
                      <div className="text-[12px] text-gray-500 mt-0.5 font-medium flex items-center gap-1">
                        <Phone className="w-3 h-3" /> {scanResult.code.residentPhone}
                      </div>
                    )}
                  </div>
                </div>

                {/* Notes */}
                {scanResult.code.notes && (
                  <div className="bg-amber-50 rounded-xl p-2.5 mb-3 text-[12px] text-amber-700 font-medium">
                    💬 {scanResult.code.notes}
                  </div>
                )}

                {/* Meta */}
                <div className="grid grid-cols-2 gap-2 mb-5">
                  {[
                    { label: language === 'ru' ? 'Действителен до' : 'Gacha', value: `${formatTime(scanResult.code.validUntil)} ${language === 'ru' ? 'сегодня' : 'bugun'}` },
                    { label: language === 'ru' ? 'Тип пропуска' : 'Turi', value: scanResult.code.accessType === 'single_use' ? (language === 'ru' ? 'Разовый' : 'Bir martalik') : (language === 'ru' ? 'Постоянный' : 'Doimiy') },
                    { label: language === 'ru' ? 'Выдан' : 'Berilgan', value: formatTime(scanResult.code.createdAt) },
                    { label: language === 'ru' ? 'Квартира' : 'Xonadon', value: `${language === 'ru' ? 'кв.' : 'xona'} ${scanResult.code.residentApartment}` },
                  ].map((m, i) => (
                    <div key={i} className="bg-gray-50 rounded-xl p-2.5">
                      <div className="text-[10px] text-gray-400 font-bold uppercase tracking-wide mb-1">{m.label}</div>
                      <div className="text-[13px] font-bold text-gray-800">{m.value}</div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Buttons */}
            {scanResult.status === 'success' ? (
              <div className="flex gap-2.5">
                <button onClick={handleDenyEntry} className="flex-1 py-3.5 rounded-2xl text-[14px] font-bold bg-red-50 text-red-500 border border-red-100 active:scale-[0.97] transition-transform">
                  ✕ {language === 'ru' ? 'Отказать' : 'Rad etish'}
                </button>
                <button onClick={handleAllowEntry} className="flex-1 py-3.5 rounded-2xl text-[14px] font-bold text-white bg-green-500 active:scale-[0.97] transition-transform shadow-lg shadow-green-200/50">
                  ✓ {language === 'ru' ? 'Пропустить' : 'O\'tkazish'}
                </button>
              </div>
            ) : (
              <button onClick={() => { setScanResult(null); scanningRef.current = true; scanFrame(); }} className="w-full py-3.5 rounded-2xl bg-gray-100 text-[14px] font-bold text-gray-700 active:scale-[0.97] transition-transform">
                {language === 'ru' ? 'Сканировать ещё' : 'Yana skanerlash'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
