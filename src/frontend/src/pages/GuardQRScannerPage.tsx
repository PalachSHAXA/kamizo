import { useState, useRef, useEffect, useCallback } from 'react';
import {
  QrCode, Camera, CheckCircle, XCircle, AlertTriangle, Clock,
  User, MapPin, Phone, Car, Package, Users, History, X,
  Keyboard
} from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { useDataStore } from '../stores/dataStore';
import { useLanguageStore } from '../stores/languageStore';
import {
  VISITOR_TYPE_LABELS,
  type GuestAccessCode
} from '../types';

type ScanResult = {
  status: 'success' | 'expired' | 'used' | 'revoked' | 'invalid' | 'not_yet_valid';
  code?: GuestAccessCode;
  message: string;
};

export function GuardQRScannerPage() {
  const { user } = useAuthStore();
  const { validateGuestAccessCode, useGuestAccessCode, addGuestAccessLog, getGuestAccessLogs, guestAccessCodes } = useDataStore();
  const { language } = useLanguageStore();

  // Debug: log available codes on mount
  useEffect(() => {
    console.log('=== GUARD QR SCANNER MOUNT ===');
    console.log('Available guest access codes:', guestAccessCodes);
    console.log('Codes count:', guestAccessCodes.length);
    guestAccessCodes.forEach(c => {
      console.log(`  Code: ${c.id}, token: ${c.qrToken}, status: ${c.status}`);
    });
  }, [guestAccessCodes]);

  const [isScanning, setIsScanning] = useState(false);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [showManualInput, setShowManualInput] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationRef = useRef<number | null>(null);
  const scanningRef = useRef(false);

  const recentLogs = getGuestAccessLogs().slice(0, 20);

  const processQRCode = useCallback((qrData: string) => {
    console.log('Processing QR code:', qrData);
    const result = validateGuestAccessCode(qrData);
    console.log('Validation result:', result);

    if (!result.valid) {
      let message = '';
      let status: ScanResult['status'] = 'invalid';

      switch (result.error) {
        case 'expired':
          status = 'expired';
          message = language === 'ru' ? 'Пропуск истёк' : 'Ruxsatnoma muddati tugagan';
          break;
        case 'revoked':
          status = 'revoked';
          message = language === 'ru' ? 'Пропуск отменён' : 'Ruxsatnoma bekor qilingan';
          break;
        case 'already_used':
        case 'max_uses_reached':
          status = 'used';
          message = language === 'ru' ? 'Пропуск уже использован' : 'Ruxsatnoma ishlatilgan';
          break;
        case 'not_yet_valid':
          status = 'not_yet_valid';
          message = language === 'ru' ? 'Пропуск ещё не действителен' : 'Ruxsatnoma hali amal qilmaydi';
          break;
        default:
          status = 'invalid';
          message = language === 'ru' ? 'Недействительный QR-код' : 'Noto\'g\'ri QR-kod';
      }

      setScanResult({ status, code: result.code, message });

      // Log the scan attempt
      if (user && result.code) {
        addGuestAccessLog({
          accessCodeId: result.code.id,
          scannedById: user.id,
          scannedByName: user.name,
          scannedByRole: user.role,
          action: status === 'expired' ? 'scan_expired' :
                  status === 'used' ? 'scan_used' :
                  status === 'revoked' ? 'scan_revoked' : 'scan_invalid',
          visitorType: result.code.visitorType,
          residentName: result.code.residentName,
          residentApartment: result.code.residentApartment,
        });
      }
    } else {
      setScanResult({
        status: 'success',
        code: result.code,
        message: language === 'ru' ? 'Пропуск действителен' : 'Ruxsatnoma amal qiladi'
      });
    }
  }, [validateGuestAccessCode, addGuestAccessLog, user, language]);

  const scanFrame = useCallback(async () => {
    if (!scanningRef.current || !videoRef.current || !canvasRef.current) {
      return;
    }

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

      // Lazy load jsQR library
      const { default: jsQR } = await import('jsqr');

      const qrCode = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: 'dontInvert'
      });

      if (qrCode && qrCode.data) {
        scanningRef.current = false;
        processQRCode(qrCode.data);
        stopCamera();
        return;
      }
    } catch (e) {
      console.error('QR scan error:', e);
    }

    animationRef.current = requestAnimationFrame(() => { scanFrame(); });
  }, [processQRCode]);

  const startCamera = async () => {
    try {
      setCameraError(null);
      setIsScanning(true);
      setIsCameraReady(false);

      // Check if mediaDevices is available
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera API not supported');
      }

      console.log('Requesting camera access...');

      // Try to get camera with environment facing first
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 }
          }
        });
      } catch {
        // Fallback to any camera
        console.log('Environment camera failed, trying any camera...');
        stream = await navigator.mediaDevices.getUserMedia({
          video: true
        });
      }

      console.log('Camera stream obtained:', stream.getVideoTracks().length, 'video tracks');

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;

        // Use both onloadedmetadata and oncanplay for better compatibility
        const playVideo = async () => {
          try {
            if (videoRef.current) {
              console.log('Playing video...');
              await videoRef.current.play();
              console.log('Video playing successfully');
              setIsCameraReady(true);
              scanningRef.current = true;
              scanFrame();
            }
          } catch (playErr) {
            console.error('Play error:', playErr);
            setCameraError(language === 'ru'
              ? 'Не удалось запустить видео. Нажмите на экран.'
              : 'Video ishga tushmadi. Ekranga bosing.');
          }
        };

        videoRef.current.onloadedmetadata = () => {
          console.log('Video metadata loaded');
          playVideo();
        };

        // Also try oncanplay as fallback
        videoRef.current.oncanplay = () => {
          if (!isCameraReady) {
            console.log('Video can play');
            playVideo();
          }
        };
      }
    } catch (err) {
      console.error('Camera error:', err);
      setIsScanning(false);

      // Provide more specific error messages
      let errorMessage = language === 'ru'
        ? 'Не удалось получить доступ к камере.'
        : 'Kameraga kirish imkoni bo\'lmadi.';

      if (err instanceof Error) {
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          errorMessage = language === 'ru'
            ? 'Доступ к камере запрещён. Разрешите доступ в настройках браузера.'
            : 'Kameraga ruxsat berilmagan. Brauzer sozlamalarida ruxsat bering.';
        } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
          errorMessage = language === 'ru'
            ? 'Камера не найдена на устройстве.'
            : 'Qurilmada kamera topilmadi.';
        } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
          errorMessage = language === 'ru'
            ? 'Камера используется другим приложением.'
            : 'Kamera boshqa dastur tomonidan ishlatilmoqda.';
        } else if (err.message === 'Camera API not supported') {
          errorMessage = language === 'ru'
            ? 'Камера не поддерживается. Убедитесь, что используете HTTPS.'
            : 'Kamera qo\'llab-quvvatlanmaydi. HTTPS ishlatilayotganiga ishonch hosil qiling.';
        }
      }

      setCameraError(errorMessage);
    }
  };

  const stopCamera = useCallback(() => {
    scanningRef.current = false;

    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setIsScanning(false);
    setIsCameraReady(false);
  }, []);

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  const handleAllowEntry = () => {
    if (!scanResult?.code || !user) return;

    // Mark as used - pass full code for self-contained tokens
    useGuestAccessCode(scanResult.code.id, scanResult.code);

    // Log the entry
    addGuestAccessLog({
      accessCodeId: scanResult.code.id,
      scannedById: user.id,
      scannedByName: user.name,
      scannedByRole: user.role,
      action: 'entry_allowed',
      visitorType: scanResult.code.visitorType,
      residentName: scanResult.code.residentName,
      residentApartment: scanResult.code.residentApartment,
    });

    setScanResult(null);
  };

  const handleDenyEntry = () => {
    if (!scanResult?.code || !user) return;

    // Log the denial
    addGuestAccessLog({
      accessCodeId: scanResult.code.id,
      scannedById: user.id,
      scannedByName: user.name,
      scannedByRole: user.role,
      action: 'entry_denied',
      visitorType: scanResult.code.visitorType,
      residentName: scanResult.code.residentName,
      residentApartment: scanResult.code.residentApartment,
    });

    setScanResult(null);
  };

  const handleManualSubmit = () => {
    if (!manualCode.trim()) return;
    processQRCode(manualCode.trim());
    setManualCode('');
    setShowManualInput(false);
  };

  const getVisitorIcon = (type: string) => {
    switch (type) {
      case 'courier': return <Package className="w-6 h-6" />;
      case 'guest': return <Users className="w-6 h-6" />;
      case 'taxi': return <Car className="w-6 h-6" />;
      default: return <User className="w-6 h-6" />;
    }
  };

  return (
    <div className="space-y-4 md:space-y-6 pb-20 md:pb-0">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-900">
            {language === 'ru' ? 'Сканер QR' : 'QR skaner'}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {language === 'ru'
              ? 'Сканируйте пропуска посетителей'
              : 'Tashrif buyuruvchilar ruxsatnomalarini skanerlang'}
          </p>
          {/* Debug: show codes count */}
          <p className="text-xs text-blue-500 mt-1">
            {language === 'ru' ? 'Активных пропусков' : 'Faol ruxsatnomalar'}: {guestAccessCodes.filter(c => c.status === 'active').length} / {guestAccessCodes.length}
          </p>
        </div>
        <button
          onClick={() => setShowHistory(!showHistory)}
          className={`p-2.5 rounded-xl transition-colors ${
            showHistory ? 'bg-primary-500 text-gray-900' : 'bg-white/50 text-gray-600 hover:bg-white'
          }`}
        >
          <History className="w-5 h-5" />
        </button>
      </div>

      {/* Main scanner area */}
      {!showHistory && !scanResult && (
        <div className="glass-card overflow-hidden">
          {isScanning ? (
            <div className="relative bg-black" style={{ minHeight: '300px' }}>
              <video
                ref={videoRef}
                className="w-full h-auto"
                style={{ minHeight: '300px', maxHeight: '70vh', objectFit: 'cover' }}
                playsInline
                muted
                autoPlay
              />
              <canvas ref={canvasRef} className="hidden" />

              {/* Loading indicator */}
              {!isCameraReady && (
                <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
                  <div className="text-center text-white">
                    <div className="w-12 h-12 border-4 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                    <p>{language === 'ru' ? 'Загрузка камеры...' : 'Kamera yuklanmoqda...'}</p>
                  </div>
                </div>
              )}

              {/* Scanning overlay */}
              {isCameraReady && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-64 h-64 border-2 border-white/50 rounded-2xl relative">
                    <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-primary-500 rounded-tl-xl" />
                    <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-primary-500 rounded-tr-xl" />
                    <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-primary-500 rounded-bl-xl" />
                    <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-primary-500 rounded-br-xl" />

                    {/* Scanning line animation */}
                    <div className="absolute inset-x-2 h-0.5 bg-primary-500 animate-bounce" style={{ top: '50%' }} />
                  </div>
                </div>
              )}

              {/* Stop button */}
              <button
                onClick={stopCamera}
                className="absolute bottom-4 left-1/2 -translate-x-1/2 px-6 py-3 bg-red-500 hover:bg-red-600 text-white font-medium rounded-xl flex items-center gap-2 z-10"
              >
                <X className="w-5 h-5" />
                {language === 'ru' ? 'Остановить' : 'To\'xtatish'}
              </button>
            </div>
          ) : (
            <div className="p-8 text-center">
              <div className="w-24 h-24 mx-auto mb-6 bg-primary-100 rounded-full flex items-center justify-center">
                <QrCode className="w-12 h-12 text-primary-600" />
              </div>

              {cameraError ? (
                <div className="mb-6">
                  <div className="text-red-500 mb-2">{cameraError}</div>
                  <p className="text-sm text-gray-500">
                    {language === 'ru'
                      ? 'Попробуйте снова или используйте ручной ввод кода'
                      : 'Qayta urinib ko\'ring yoki qo\'lda kod kiriting'}
                  </p>
                </div>
              ) : (
                <p className="text-gray-600 mb-6">
                  {language === 'ru'
                    ? 'Нажмите кнопку, чтобы начать сканирование'
                    : 'Skanerlashni boshlash uchun tugmani bosing'}
                </p>
              )}

              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <button
                  onClick={startCamera}
                  className="px-6 py-4 bg-primary-500 hover:bg-primary-600 text-gray-900 font-bold rounded-xl flex items-center justify-center gap-2"
                >
                  <Camera className="w-5 h-5" />
                  {language === 'ru' ? 'Сканировать QR' : 'QR skanerlash'}
                </button>
                <button
                  onClick={() => setShowManualInput(true)}
                  className="px-6 py-4 border-2 border-gray-200 hover:border-gray-300 rounded-xl font-medium flex items-center justify-center gap-2"
                >
                  <Keyboard className="w-5 h-5" />
                  {language === 'ru' ? 'Ввести код' : 'Kod kiriting'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Manual input modal */}
      {showManualInput && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold">
                {language === 'ru' ? 'Ввод кода' : 'Kod kiriting'}
              </h3>
              <button onClick={() => setShowManualInput(false)} className="p-2 hover:bg-gray-100 rounded-xl">
                <X className="w-5 h-5" />
              </button>
            </div>

            <input
              type="text"
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              placeholder="GA-xxxxx-xxxxx-xxxxx"
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-primary-500 focus:ring-0 mb-4 font-mono"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleManualSubmit()}
            />

            <button
              onClick={handleManualSubmit}
              disabled={!manualCode.trim()}
              className="w-full py-3 bg-primary-500 hover:bg-primary-600 disabled:bg-gray-300 text-gray-900 font-bold rounded-xl"
            >
              {language === 'ru' ? 'Проверить' : 'Tekshirish'}
            </button>
          </div>
        </div>
      )}

      {/* Scan result */}
      {scanResult && (
        <div className="glass-card overflow-hidden">
          {/* Status header */}
          <div className={`p-6 text-center ${
            scanResult.status === 'success' ? 'bg-green-500' :
            scanResult.status === 'expired' || scanResult.status === 'used' ? 'bg-amber-500' :
            'bg-red-500'
          }`}>
            <div className="w-20 h-20 mx-auto mb-4 bg-white/20 rounded-full flex items-center justify-center">
              {scanResult.status === 'success' ? (
                <CheckCircle className="w-10 h-10 text-white" />
              ) : scanResult.status === 'expired' || scanResult.status === 'used' || scanResult.status === 'not_yet_valid' ? (
                <AlertTriangle className="w-10 h-10 text-white" />
              ) : (
                <XCircle className="w-10 h-10 text-white" />
              )}
            </div>
            <h2 className="text-xl font-bold text-white mb-1">{scanResult.message}</h2>
            {scanResult.code && (
              <p className="text-white/80">
                {VISITOR_TYPE_LABELS[scanResult.code.visitorType].icon}{' '}
                {language === 'ru'
                  ? VISITOR_TYPE_LABELS[scanResult.code.visitorType].label
                  : VISITOR_TYPE_LABELS[scanResult.code.visitorType].labelUz}
              </p>
            )}
          </div>

          {/* Visitor details */}
          {scanResult.code && (
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-xl">
                <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center text-blue-600">
                  {getVisitorIcon(scanResult.code.visitorType)}
                </div>
                <div className="flex-1">
                  {scanResult.code.visitorName && (
                    <div className="font-medium text-lg">{scanResult.code.visitorName}</div>
                  )}
                  {scanResult.code.visitorPhone && (
                    <div className="text-gray-500 flex items-center gap-1">
                      <Phone className="w-4 h-4" />
                      {scanResult.code.visitorPhone}
                    </div>
                  )}
                  {scanResult.code.visitorVehiclePlate && (
                    <div className="text-gray-500 flex items-center gap-1">
                      <Car className="w-4 h-4" />
                      {scanResult.code.visitorVehiclePlate}
                    </div>
                  )}
                </div>
              </div>

              {/* Resident info */}
              <div className="p-4 border-2 border-gray-100 rounded-xl">
                <div className="text-sm text-gray-500 mb-2">
                  {language === 'ru' ? 'Идёт к жителю' : 'Quyidagi turar joy egasiga'}
                </div>
                <div className="font-medium text-lg">{scanResult.code.residentName}</div>
                <div className="text-gray-600 flex items-center gap-1 mt-1">
                  <MapPin className="w-4 h-4" />
                  {scanResult.code.residentAddress}, {language === 'ru' ? 'кв.' : 'xona'} {scanResult.code.residentApartment}
                </div>
                <div className="text-gray-500 flex items-center gap-1 mt-1">
                  <Phone className="w-4 h-4" />
                  {scanResult.code.residentPhone}
                </div>
              </div>

              {/* Time info */}
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Clock className="w-4 h-4" />
                {language === 'ru' ? 'Действует до' : 'Gacha amal qiladi'}:{' '}
                {new Date(scanResult.code.validUntil).toLocaleString(language === 'ru' ? 'ru-RU' : 'uz-UZ')}
              </div>

              {scanResult.code.notes && (
                <div className="p-3 bg-blue-50 rounded-xl text-sm text-blue-700">
                  <strong>{language === 'ru' ? 'Примечание' : 'Izoh'}:</strong> {scanResult.code.notes}
                </div>
              )}

              {/* Actions */}
              {scanResult.status === 'success' ? (
                <div className="flex gap-3 pt-4">
                  <button
                    onClick={handleDenyEntry}
                    className="flex-1 py-4 border-2 border-red-200 text-red-600 hover:bg-red-50 rounded-xl font-bold flex items-center justify-center gap-2"
                  >
                    <XCircle className="w-5 h-5" />
                    {language === 'ru' ? 'Отказать' : 'Rad etish'}
                  </button>
                  <button
                    onClick={handleAllowEntry}
                    className="flex-1 py-4 bg-green-500 hover:bg-green-600 text-white rounded-xl font-bold flex items-center justify-center gap-2"
                  >
                    <CheckCircle className="w-5 h-5" />
                    {language === 'ru' ? 'Пропустить' : 'O\'tkazish'}
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setScanResult(null)}
                  className="w-full py-4 bg-gray-100 hover:bg-gray-200 rounded-xl font-bold"
                >
                  {language === 'ru' ? 'Сканировать ещё' : 'Yana skanerlash'}
                </button>
              )}
            </div>
          )}

          {/* No code data - just invalid */}
          {!scanResult.code && (
            <div className="p-6">
              <p className="text-center text-gray-600 mb-4">
                {language === 'ru'
                  ? 'QR-код не является пропуском или повреждён'
                  : 'QR-kod ruxsatnoma emas yoki buzilgan'}
              </p>
              <button
                onClick={() => setScanResult(null)}
                className="w-full py-4 bg-gray-100 hover:bg-gray-200 rounded-xl font-bold"
              >
                {language === 'ru' ? 'Сканировать ещё' : 'Yana skanerlash'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* History */}
      {showHistory && (
        <div className="glass-card">
          <div className="p-4 border-b flex items-center justify-between">
            <h3 className="font-bold">
              {language === 'ru' ? 'История сканирований' : 'Skanerlash tarixi'}
            </h3>
            <button
              onClick={() => setShowHistory(false)}
              className="p-2 hover:bg-gray-100 rounded-xl"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {recentLogs.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              {language === 'ru' ? 'История пуста' : 'Tarix bo\'sh'}
            </div>
          ) : (
            <div className="divide-y">
              {recentLogs.map((log) => {
                const isAllowed = log.action === 'entry_allowed' || log.action === 'scan_success';
                const isDenied = log.action === 'entry_denied';

                return (
                  <div key={log.id} className="p-4 flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                      isAllowed ? 'bg-green-100 text-green-600' :
                      isDenied ? 'bg-red-100 text-red-600' :
                      'bg-amber-100 text-amber-600'
                    }`}>
                      {isAllowed ? <CheckCircle className="w-5 h-5" /> :
                       isDenied ? <XCircle className="w-5 h-5" /> :
                       <AlertTriangle className="w-5 h-5" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{VISITOR_TYPE_LABELS[log.visitorType].icon}</span>
                        <span className="font-medium truncate">
                          {log.residentName}
                        </span>
                      </div>
                      <div className="text-sm text-gray-500">
                        {language === 'ru' ? 'кв.' : 'xona'} {log.residentApartment}
                      </div>
                      <div className="text-xs text-gray-400 mt-1">
                        {new Date(log.timestamp).toLocaleString(language === 'ru' ? 'ru-RU' : 'uz-UZ')}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
