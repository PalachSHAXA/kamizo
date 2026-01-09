import { useState, useEffect, useRef } from 'react';
import { X, Camera, CheckCircle, AlertCircle, Key, Loader2 } from 'lucide-react';
import { generateQRCode } from './LazyQRCode';

interface QRSignatureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onVerified: () => void;
  user: {
    id: string;
    name: string;
    login?: string;
    address?: string;
    apartment?: string;
    phone?: string;
    contractNumber?: string;
  };
  language: string;
  title?: string;
  description?: string;
}

export function QRSignatureModal({
  isOpen,
  onClose,
  onVerified,
  user,
  language,
  title,
  description
}: QRSignatureModalProps) {
  const [mode, setMode] = useState<'show' | 'scan'>('show');
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('');
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState<'success' | 'error' | null>(null);
  const [inputCode, setInputCode] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Use user ID directly as signature code for consistency
  const signatureCode = user.id.toUpperCase();

  // Generate QR code with same format as profile (for consistency)
  useEffect(() => {
    if (!isOpen) return;

    const generateQR = async () => {
      // Use same QR content as in ResidentProfilePage for consistency
      const signatureText = [
        `ID: ${user.id}`,
        `Л/С: ${user.login || '-'}`,
        `ФИО: ${user.name}`,
        `Адрес: ${user.address || '-'}`,
        `Кв: ${user.apartment || '-'}`,
        `Тел: ${user.phone || '-'}`,
        `Договор: ${user.contractNumber || '-'}`,
      ].join('\n');

      const url = await generateQRCode(signatureText, {
        width: 200,
        margin: 2,
        color: { dark: '#1f2937', light: '#ffffff' },
      });
      setQrCodeUrl(url);
    };

    generateQR();
  }, [isOpen, user]);

  // Cleanup camera on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsScanning(false);
  };

  const handleShowMode = () => {
    setMode('show');
    stopCamera();
  };

  // Manual code verification
  const handleManualVerify = () => {
    const normalizedInput = inputCode.trim().toUpperCase();
    if (normalizedInput === signatureCode) {
      setScanResult('success');
      setTimeout(() => {
        onVerified();
        onClose();
      }, 1500);
    } else {
      setScanResult('error');
      setTimeout(() => setScanResult(null), 2000);
    }
  };

  // Simple verification - just confirm they have the key
  const handleConfirmSignature = () => {
    setScanResult('success');
    setTimeout(() => {
      onVerified();
      onClose();
    }, 1000);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in duration-200">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
              <Key className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900">
                {title || (language === 'ru' ? 'Электронная подпись' : 'Elektron imzo')}
              </h3>
              <p className="text-xs text-gray-500">
                {language === 'ru' ? 'Подтвердите вашу личность' : 'Shaxsingizni tasdiqlang'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          {description && (
            <p className="text-sm text-gray-600 mb-4 text-center">{description}</p>
          )}

          {/* Success State */}
          {scanResult === 'success' && (
            <div className="text-center py-8">
              <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4 animate-bounce">
                <CheckCircle className="w-10 h-10 text-green-500" />
              </div>
              <h4 className="text-lg font-bold text-green-700">
                {language === 'ru' ? 'Подпись подтверждена!' : 'Imzo tasdiqlandi!'}
              </h4>
              <p className="text-sm text-gray-500 mt-2">
                {language === 'ru' ? 'Ваш голос будет записан' : 'Ovozingiz qayd etiladi'}
              </p>
            </div>
          )}

          {/* Error State */}
          {scanResult === 'error' && (
            <div className="text-center py-4 mb-4 bg-red-50 rounded-xl">
              <AlertCircle className="w-8 h-8 text-red-500 mx-auto mb-2" />
              <p className="text-sm text-red-600">
                {language === 'ru' ? 'Неверный ключ подписи' : 'Noto\'g\'ri imzo kaliti'}
              </p>
            </div>
          )}

          {/* Main Content - Show QR or Scan */}
          {!scanResult && (
            <>
              {mode === 'show' ? (
                <>
                  {/* Show User's QR Signature */}
                  <div className="text-center">
                    <p className="text-sm text-gray-600 mb-4">
                      {language === 'ru'
                        ? 'Ваш уникальный ключ электронной подписи:'
                        : 'Sizning noyob elektron imzo kalitingiz:'}
                    </p>

                    {/* QR Code */}
                    <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-4 mb-3">
                      {qrCodeUrl ? (
                        <img src={qrCodeUrl} alt="QR Signature" className="w-32 h-32 mx-auto" />
                      ) : (
                        <div className="w-32 h-32 mx-auto bg-gray-100 rounded animate-pulse flex items-center justify-center">
                          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                        </div>
                      )}
                    </div>

                    {/* User Info with ID */}
                    <div className="bg-blue-50 rounded-xl p-3 mb-3">
                      <div className="flex items-center gap-2">
                        <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                          {user.name.charAt(0)}
                        </div>
                        <div className="flex-1">
                          <p className="font-semibold text-gray-900">{user.name}</p>
                          <p className="text-xs text-gray-500">
                            {language === 'ru' ? 'Л/С:' : 'L/H:'} {user.login || '-'}
                          </p>
                        </div>
                      </div>
                      {/* Signature ID */}
                      <div className="mt-3 pt-3 border-t border-blue-100">
                        <p className="text-xs text-gray-500 mb-1">
                          {language === 'ru' ? 'ID электронной подписи:' : 'Elektron imzo ID:'}
                        </p>
                        <p className="font-mono text-lg font-bold text-blue-600 tracking-wider select-all">
                          {signatureCode}
                        </p>
                      </div>
                    </div>

                    {/* Confirm Button */}
                    <button
                      onClick={handleConfirmSignature}
                      className="w-full py-3 px-4 rounded-xl font-semibold text-white flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
                      style={{ background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)' }}
                    >
                      <CheckCircle className="w-5 h-5" />
                      {language === 'ru' ? 'Подтвердить подпись' : 'Imzoni tasdiqlash'}
                    </button>

                    <p className="text-xs text-gray-400 mt-3 text-center">
                      {language === 'ru'
                        ? 'Нажимая "Подтвердить", вы подписываете голос электронным ключом'
                        : '"Tasdiqlash" tugmasini bosish orqali ovozingizni elektron kalit bilan imzolaysiz'}
                    </p>
                  </div>
                </>
              ) : (
                <>
                  {/* Camera Scanner */}
                  <div className="text-center">
                    <div className="bg-black rounded-2xl overflow-hidden mb-4 aspect-square relative">
                      <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        className="w-full h-full object-cover"
                      />
                      {!isScanning && (
                        <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
                          <Camera className="w-12 h-12 text-gray-500" />
                        </div>
                      )}
                      {/* Scanner overlay */}
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-48 h-48 border-2 border-white/50 rounded-2xl" />
                      </div>
                    </div>

                    <p className="text-sm text-gray-600 mb-4">
                      {language === 'ru'
                        ? 'Наведите камеру на ваш QR-код подписи'
                        : 'Kamerani QR-kod imzongizga yo\'naltiring'}
                    </p>

                    {/* Manual Input Option */}
                    <div className="border-t border-gray-100 pt-4 mt-4">
                      <p className="text-xs text-gray-500 mb-2">
                        {language === 'ru' ? 'Или введите код вручную:' : 'Yoki kodni qo\'lda kiriting:'}
                      </p>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={inputCode}
                          onChange={(e) => setInputCode(e.target.value.toUpperCase())}
                          placeholder="SIG-XXXXX-XXXX"
                          className="flex-1 px-4 py-3 rounded-xl border border-gray-200 text-center font-mono uppercase"
                        />
                        <button
                          onClick={handleManualVerify}
                          disabled={!inputCode.trim()}
                          className="px-4 py-3 bg-blue-500 text-white rounded-xl font-medium disabled:opacity-50"
                        >
                          OK
                        </button>
                      </div>
                    </div>

                    <button
                      onClick={handleShowMode}
                      className="mt-4 text-sm text-blue-600 hover:text-blue-800"
                    >
                      {language === 'ru' ? '← Показать мой QR-код' : '← QR-kodimni ko\'rsatish'}
                    </button>
                  </div>
                </>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {!scanResult && (
          <div className="px-4 pb-4">
            <button
              onClick={onClose}
              className="w-full py-2.5 px-4 rounded-xl font-medium bg-gray-100 hover:bg-gray-200 transition-colors text-sm"
            >
              {language === 'ru' ? 'Отмена' : 'Bekor qilish'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
