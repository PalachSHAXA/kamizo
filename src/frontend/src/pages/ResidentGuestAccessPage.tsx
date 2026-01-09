import { useState, useRef, useEffect } from 'react';
import {
  QrCode, Plus, X, Clock, Package, Users, Car, User,
  Share2, Download, Copy, ChevronRight, ArrowLeft, Calendar,
  AlertTriangle, Trash2
} from 'lucide-react';
import { generateQRCodeCanvas } from '../components/LazyQRCode';
import { useAuthStore } from '../stores/authStore';
import { useDataStore } from '../stores/dataStore';
import { useLanguageStore } from '../stores/languageStore';
import {
  VISITOR_TYPE_LABELS, ACCESS_TYPE_LABELS, GUEST_ACCESS_STATUS_LABELS,
  type GuestAccessCode, type VisitorType, type AccessType
} from '../types';

// QR Code display component
function QRCodeDisplay({ codeId, onClose }: { codeId: string; onClose: () => void }) {
  const { language } = useLanguageStore();
  const { guestAccessCodes } = useDataStore();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [copied, setCopied] = useState(false);

  // Get latest code from store to ensure updated values (like currentUses)
  const code = guestAccessCodes.find(c => c.id === codeId);

  if (!code) {
    return null;
  }

  useEffect(() => {
    if (canvasRef.current) {
      generateQRCodeCanvas(canvasRef.current, code.qrToken, {
        width: 280,
        margin: 2,
        color: { dark: '#000000', light: '#ffffff' }
      });
    }
  }, [code.qrToken]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code.qrToken);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleDownload = () => {
    if (canvasRef.current) {
      const link = document.createElement('a');
      link.download = `guest-pass-${code.id}.png`;
      link.href = canvasRef.current.toDataURL('image/png');
      link.click();
    }
  };

  // Create combined image with QR code and caption text
  const createImageWithCaption = async (): Promise<Blob | null> => {
    if (!canvasRef.current) return null;

    const qrCanvas = canvasRef.current;
    const qrSize = qrCanvas.width;

    // Create new canvas with extra space for text
    const combinedCanvas = document.createElement('canvas');
    const ctx = combinedCanvas.getContext('2d');
    if (!ctx) return null;

    const padding = 30;
    const textAreaHeight = 160;
    combinedCanvas.width = qrSize + padding * 2;
    combinedCanvas.height = qrSize + padding * 2 + textAreaHeight;

    // White background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, combinedCanvas.width, combinedCanvas.height);

    // Draw QR code
    ctx.drawImage(qrCanvas, padding, padding);

    // Add text below QR code
    ctx.fillStyle = '#1f2937';
    ctx.textAlign = 'center';
    const centerX = combinedCanvas.width / 2;
    let y = qrSize + padding + 30;

    // Title
    ctx.font = 'bold 18px system-ui, -apple-system, sans-serif';
    ctx.fillText(language === 'ru' ? 'Пропуск для гостя' : 'Mehmon uchun ruxsatnoma', centerX, y);
    y += 28;

    // Address
    ctx.font = '14px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = '#4b5563';
    const addressText = `${code.residentAddress}, ${language === 'ru' ? 'кв.' : 'xon.'} ${code.residentApartment}`;
    ctx.fillText(addressText, centerX, y);
    y += 24;

    // Resident name
    ctx.fillText(code.residentName, centerX, y);
    y += 28;

    // Valid until
    ctx.font = 'bold 14px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = '#059669';
    const validUntil = new Date(code.validUntil).toLocaleString(language === 'ru' ? 'ru-RU' : 'uz-UZ');
    ctx.fillText(`${language === 'ru' ? 'Действует до:' : 'Gacha:'} ${validUntil}`, centerX, y);

    return new Promise((resolve) => {
      combinedCanvas.toBlob(resolve, 'image/png');
    });
  };

  const handleShare = async () => {
    // Create combined image with QR code and info
    const combinedBlob = await createImageWithCaption();

    if (!combinedBlob) {
      handleDownload();
      return;
    }

    const file = new File([combinedBlob], `guest-pass-${code.id}.png`, { type: 'image/png' });

    // Check if Web Share API is available and supports files
    if (navigator.share) {
      try {
        const shareData = { files: [file] };

        // Check if we can share files
        if (navigator.canShare && navigator.canShare(shareData)) {
          await navigator.share(shareData);
          return;
        }
      } catch (err) {
        // If user cancelled, don't fallback
        if ((err as Error).name === 'AbortError') {
          return;
        }
        console.log('File sharing failed:', err);
      }
    }

    // Desktop fallback: copy image to clipboard
    try {
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': combinedBlob })
      ]);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);

      // Show alert that image was copied
      alert(language === 'ru'
        ? 'QR-код скопирован в буфер обмена. Вставьте его в чат (Ctrl+V)'
        : 'QR-kod buferga nusxalandi. Chatga qo\'ying (Ctrl+V)');
    } catch (clipErr) {
      console.log('Clipboard failed, downloading instead');
      // Final fallback: download the image
      handleDownload();
    }
  };

  const visitorLabel = VISITOR_TYPE_LABELS[code.visitorType];
  const accessLabel = ACCESS_TYPE_LABELS[code.accessType];
  const statusLabel = GUEST_ACCESS_STATUS_LABELS[code.status];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-bold">
            {language === 'ru' ? 'QR-код пропуска' : 'Ruxsatnoma QR-kodi'}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* QR Code */}
        <div className="p-6 flex flex-col items-center">
          <div className="bg-white p-4 rounded-2xl shadow-lg border-2 border-gray-100">
            <canvas ref={canvasRef} />
          </div>

          {/* Status badge */}
          <div className={`mt-4 px-4 py-2 rounded-full text-sm font-medium ${
            code.status === 'active' ? 'bg-green-100 text-green-700' :
            code.status === 'used' ? 'bg-blue-100 text-blue-700' :
            code.status === 'expired' ? 'bg-gray-100 text-gray-700' :
            'bg-red-100 text-red-700'
          }`}>
            {language === 'ru' ? statusLabel.label : statusLabel.labelUz}
          </div>

          {/* Info */}
          <div className="mt-4 w-full space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">{language === 'ru' ? 'Тип' : 'Turi'}:</span>
              <span className="font-medium flex items-center gap-1">
                {visitorLabel.icon} {language === 'ru' ? visitorLabel.label : visitorLabel.labelUz}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">{language === 'ru' ? 'Срок' : 'Muddat'}:</span>
              <span className="font-medium">{language === 'ru' ? accessLabel.label : accessLabel.labelUz}</span>
            </div>
            {code.visitorName && (
              <div className="flex justify-between">
                <span className="text-gray-500">{language === 'ru' ? 'Гость' : 'Mehmon'}:</span>
                <span className="font-medium">{code.visitorName}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-gray-500">{language === 'ru' ? 'Действует до' : 'Gacha amal qiladi'}:</span>
              <span className="font-medium">{new Date(code.validUntil).toLocaleString(language === 'ru' ? 'ru-RU' : 'uz-UZ')}</span>
            </div>
            {code.accessType !== 'single_use' && (
              <div className="flex justify-between">
                <span className="text-gray-500">{language === 'ru' ? 'Использовано' : 'Ishlatilgan'}:</span>
                <span className="font-medium">{code.currentUses} / {code.maxUses === 999 ? '∞' : code.maxUses}</span>
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="p-4 border-t grid grid-cols-3 gap-2">
          <button
            onClick={handleShare}
            className="flex flex-col items-center gap-1 p-3 bg-blue-50 hover:bg-blue-100 rounded-xl transition-colors"
          >
            <Share2 className="w-5 h-5 text-blue-600" />
            <span className="text-xs text-blue-700">{language === 'ru' ? 'Поделиться' : 'Ulashish'}</span>
          </button>
          <button
            onClick={handleDownload}
            className="flex flex-col items-center gap-1 p-3 bg-green-50 hover:bg-green-100 rounded-xl transition-colors"
          >
            <Download className="w-5 h-5 text-green-600" />
            <span className="text-xs text-green-700">{language === 'ru' ? 'Сохранить' : 'Saqlash'}</span>
          </button>
          <button
            onClick={handleCopy}
            className="flex flex-col items-center gap-1 p-3 bg-purple-50 hover:bg-purple-100 rounded-xl transition-colors"
          >
            <Copy className="w-5 h-5 text-purple-600" />
            <span className="text-xs text-purple-700">
              {copied ? (language === 'ru' ? 'Скопировано!' : 'Nusxa olindi!') : (language === 'ru' ? 'Код' : 'Kod')}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

// Create pass form component
function CreatePassForm({ onClose, onCreated }: { onClose: () => void; onCreated: (code: GuestAccessCode) => void }) {
  const { user } = useAuthStore();
  const { createGuestAccessCode } = useDataStore();
  const { language } = useLanguageStore();

  const [step, setStep] = useState(1);
  const [visitorType, setVisitorType] = useState<VisitorType | null>(null);
  const [accessType, setAccessType] = useState<AccessType | null>(null);
  const [visitorName, setVisitorName] = useState('');
  const [visitorPhone, setVisitorPhone] = useState('');
  const [visitorVehiclePlate, setVisitorVehiclePlate] = useState('');
  const [customDate, setCustomDate] = useState('');
  const [notes, setNotes] = useState('');

  const visitorTypes: { type: VisitorType; icon: React.ReactNode }[] = [
    { type: 'courier', icon: <Package className="w-8 h-8" /> },
    { type: 'guest', icon: <Users className="w-8 h-8" /> },
    { type: 'taxi', icon: <Car className="w-8 h-8" /> },
    { type: 'other', icon: <User className="w-8 h-8" /> },
  ];

  const accessTypes: AccessType[] = ['single_use', 'day', 'week', 'custom'];

  const [isCreating, setIsCreating] = useState(false);

  const handleCreate = async () => {
    if (!visitorType || !accessType || !user || isCreating) {
      console.error('Missing required data:', { visitorType, accessType, user });
      return;
    }

    setIsCreating(true);

    let validUntil: string | undefined;
    if (accessType === 'custom' && customDate) {
      validUntil = new Date(customDate).toISOString();
    }

    console.log('Creating guest access code with:', {
      residentId: user.id,
      residentName: user.name,
      residentPhone: user.phone || 'Не указан',
      residentApartment: user.apartment || '',
      residentAddress: user.address || '',
      visitorType,
      accessType,
    });

    const code = await createGuestAccessCode({
      residentId: user.id,
      residentName: user.name,
      residentPhone: user.phone || 'Не указан',
      residentApartment: user.apartment || '',
      residentAddress: user.address || '',
      visitorType,
      visitorName: visitorName || undefined,
      visitorPhone: visitorPhone || undefined,
      visitorVehiclePlate: visitorVehiclePlate || undefined,
      accessType,
      validUntil,
      notes: notes || undefined,
    });

    setIsCreating(false);

    if (code) {
      console.log('Created code:', code);
      onCreated(code);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-2">
            {step > 1 && (
              <button onClick={() => setStep(step - 1)} className="p-2 hover:bg-gray-100 rounded-xl">
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}
            <h2 className="text-lg font-bold">
              {language === 'ru' ? 'Создать пропуск' : 'Ruxsatnoma yaratish'}
            </h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Progress */}
        <div className="px-4 pt-4">
          <div className="flex items-center gap-2">
            {[1, 2, 3].map((s) => (
              <div key={s} className="flex-1 flex items-center">
                <div className={`w-full h-1.5 rounded-full ${s <= step ? 'bg-primary-500' : 'bg-gray-200'}`} />
              </div>
            ))}
          </div>
          <div className="text-xs text-gray-500 mt-2 text-center">
            {language === 'ru' ? `Шаг ${step} из 3` : `${step}-qadam 3 dan`}
          </div>
        </div>

        <div className="p-4">
          {/* Step 1: Visitor Type */}
          {step === 1 && (
            <div className="space-y-4">
              <h3 className="font-medium text-center">
                {language === 'ru' ? 'Кого ожидаете?' : 'Kimni kutayapsiz?'}
              </h3>
              <div className="grid grid-cols-2 gap-3">
                {visitorTypes.map(({ type, icon }) => {
                  const label = VISITOR_TYPE_LABELS[type];
                  return (
                    <button
                      key={type}
                      onClick={() => {
                        setVisitorType(type);
                        setStep(2);
                      }}
                      className={`p-4 rounded-xl border-2 flex flex-col items-center gap-2 transition-all ${
                        visitorType === type
                          ? 'border-primary-500 bg-primary-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className={visitorType === type ? 'text-primary-600' : 'text-gray-600'}>
                        {icon}
                      </div>
                      <span className="font-medium text-sm">
                        {language === 'ru' ? label.label : label.labelUz}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Step 2: Access Type */}
          {step === 2 && (
            <div className="space-y-4">
              <h3 className="font-medium text-center">
                {language === 'ru' ? 'На какой срок?' : 'Qancha muddatga?'}
              </h3>
              <div className="space-y-2">
                {accessTypes.map((type) => {
                  const label = ACCESS_TYPE_LABELS[type];
                  return (
                    <button
                      key={type}
                      onClick={() => {
                        setAccessType(type);
                        setStep(3);
                      }}
                      className={`w-full p-4 rounded-xl border-2 flex items-center gap-3 transition-all text-left ${
                        accessType === type
                          ? 'border-primary-500 bg-primary-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                        accessType === type ? 'bg-primary-500 text-white' : 'bg-gray-100 text-gray-600'
                      }`}>
                        {type === 'single_use' && <span className="text-lg font-bold">1</span>}
                        {type === 'day' && <Clock className="w-5 h-5" />}
                        {type === 'week' && <Calendar className="w-5 h-5" />}
                        {type === 'custom' && <Calendar className="w-5 h-5" />}
                      </div>
                      <div className="flex-1">
                        <div className="font-medium">
                          {language === 'ru' ? label.label : label.labelUz}
                        </div>
                        <div className="text-sm text-gray-500">
                          {language === 'ru' ? label.description : label.descriptionUz}
                        </div>
                      </div>
                      <ChevronRight className="w-5 h-5 text-gray-400" />
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Step 3: Details */}
          {step === 3 && (
            <div className="space-y-4">
              <h3 className="font-medium text-center">
                {language === 'ru' ? 'Дополнительно' : 'Qo\'shimcha'}
              </h3>

              {accessType === 'custom' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {language === 'ru' ? 'Действует до *' : 'Gacha amal qiladi *'}
                  </label>
                  <input
                    type="datetime-local"
                    value={customDate}
                    onChange={(e) => setCustomDate(e.target.value)}
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-primary-500 focus:ring-0"
                    min={new Date().toISOString().slice(0, 16)}
                  />
                </div>
              )}

              {(visitorType === 'guest' || visitorType === 'other') && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {language === 'ru' ? 'Имя гостя' : 'Mehmon ismi'}
                    </label>
                    <input
                      type="text"
                      value={visitorName}
                      onChange={(e) => setVisitorName(e.target.value)}
                      placeholder={language === 'ru' ? 'Иван Иванов' : 'Ism Familiya'}
                      className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-primary-500 focus:ring-0"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {language === 'ru' ? 'Телефон гостя' : 'Mehmon telefoni'}
                    </label>
                    <input
                      type="tel"
                      value={visitorPhone}
                      onChange={(e) => setVisitorPhone(e.target.value)}
                      placeholder="+998 90 123 45 67"
                      className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-primary-500 focus:ring-0"
                    />
                  </div>
                </>
              )}

              {visitorType === 'taxi' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {language === 'ru' ? 'Номер такси' : 'Taksi raqami'}
                  </label>
                  <input
                    type="text"
                    value={visitorVehiclePlate}
                    onChange={(e) => setVisitorVehiclePlate(e.target.value.toUpperCase())}
                    placeholder="01 A 123 BC"
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-primary-500 focus:ring-0"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {language === 'ru' ? 'Примечание' : 'Izoh'}
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={language === 'ru' ? 'Опционально...' : 'Ixtiyoriy...'}
                  rows={2}
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-primary-500 focus:ring-0 resize-none"
                />
              </div>

              <button
                onClick={handleCreate}
                disabled={(accessType === 'custom' && !customDate) || isCreating}
                className="w-full py-4 bg-primary-500 hover:bg-primary-600 disabled:bg-gray-300 text-gray-900 font-bold rounded-xl transition-colors"
              >
                {isCreating
                  ? (language === 'ru' ? 'Создание...' : 'Yaratilmoqda...')
                  : (language === 'ru' ? 'Создать пропуск' : 'Ruxsatnoma yaratish')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Main page component
export function ResidentGuestAccessPage() {
  const { user } = useAuthStore();
  const { guestAccessCodes, fetchGuestCodes, revokeGuestAccessCode, isLoadingGuestCodes } = useDataStore();
  const { language } = useLanguageStore();

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [selectedCode, setSelectedCode] = useState<GuestAccessCode | null>(null);
  const [filter, setFilter] = useState<'all' | 'active' | 'used' | 'expired'>('all');
  const [showRevokeConfirm, setShowRevokeConfirm] = useState<GuestAccessCode | null>(null);

  // Fetch codes on mount
  useEffect(() => {
    fetchGuestCodes();
  }, [fetchGuestCodes]);

  const allCodes = guestAccessCodes;

  // Update expired status
  const now = new Date();
  const codes = allCodes.map(c => {
    if (c.status === 'active' && now > new Date(c.validUntil)) {
      return { ...c, status: 'expired' as const };
    }
    return c;
  });

  const filteredCodes = filter === 'all'
    ? codes
    : codes.filter(c => c.status === filter);

  const activeCodes = codes.filter(c => c.status === 'active');

  const handleCreated = (code: GuestAccessCode) => {
    setShowCreateForm(false);
    setSelectedCode(code);
  };

  const handleRevoke = async () => {
    if (!showRevokeConfirm || !user) return;
    await revokeGuestAccessCode(
      showRevokeConfirm.id,
      user.id,
      user.name,
      user.role,
      language === 'ru' ? 'Отменено жителем' : 'Turar joy egasi tomonidan bekor qilindi'
    );
    setShowRevokeConfirm(null);
  };

  return (
    <div className="space-y-4 md:space-y-6 pb-20 md:pb-0">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-900">
            {language === 'ru' ? 'Гостевой доступ' : 'Mehmon kirishi'}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {language === 'ru'
              ? 'Создавайте QR-пропуска для гостей и курьеров'
              : 'Mehmonlar va kuryerlar uchun QR-ruxsatnomalar yarating'}
          </p>
        </div>
        <button
          onClick={() => setShowCreateForm(true)}
          className="px-4 py-2.5 bg-primary-500 hover:bg-primary-600 text-gray-900 font-medium rounded-xl flex items-center gap-2 transition-colors shadow-sm"
        >
          <Plus className="w-5 h-5" />
          <span className="hidden sm:inline">{language === 'ru' ? 'Создать' : 'Yaratish'}</span>
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="glass-card p-4">
          <div className="text-2xl font-bold text-green-600">{activeCodes.length}</div>
          <div className="text-sm text-gray-500">{language === 'ru' ? 'Активных' : 'Faol'}</div>
        </div>
        <div className="glass-card p-4">
          <div className="text-2xl font-bold text-blue-600">
            {codes.filter(c => c.status === 'used').length}
          </div>
          <div className="text-sm text-gray-500">{language === 'ru' ? 'Использовано' : 'Ishlatilgan'}</div>
        </div>
        <div className="glass-card p-4">
          <div className="text-2xl font-bold text-gray-600">
            {codes.filter(c => c.status === 'expired').length}
          </div>
          <div className="text-sm text-gray-500">{language === 'ru' ? 'Истекло' : 'Muddati tugagan'}</div>
        </div>
        <div className="glass-card p-4">
          <div className="text-2xl font-bold text-purple-600">{codes.length}</div>
          <div className="text-sm text-gray-500">{language === 'ru' ? 'Всего' : 'Jami'}</div>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 md:mx-0 md:px-0">
        {[
          { id: 'all' as const, label: language === 'ru' ? 'Все' : 'Barchasi' },
          { id: 'active' as const, label: language === 'ru' ? 'Активные' : 'Faol' },
          { id: 'used' as const, label: language === 'ru' ? 'Использованные' : 'Ishlatilgan' },
          { id: 'expired' as const, label: language === 'ru' ? 'Истекшие' : 'Muddati tugagan' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setFilter(tab.id)}
            className={`px-4 py-2 rounded-xl font-medium whitespace-nowrap transition-colors ${
              filter === tab.id
                ? 'bg-primary-500 text-gray-900'
                : 'bg-white/50 text-gray-600 hover:bg-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Codes list */}
      {isLoadingGuestCodes ? (
        <div className="glass-card p-8 text-center">
          <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center animate-pulse">
            <QrCode className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="font-medium text-gray-500">
            {language === 'ru' ? 'Загрузка...' : 'Yuklanmoqda...'}
          </h3>
        </div>
      ) : filteredCodes.length === 0 ? (
        <div className="glass-card p-8 text-center">
          <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
            <QrCode className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="font-medium text-gray-900 mb-1">
            {language === 'ru' ? 'Пропусков нет' : 'Ruxsatnomalar yo\'q'}
          </h3>
          <p className="text-sm text-gray-500 mb-4">
            {language === 'ru'
              ? 'Создайте первый пропуск для гостя или курьера'
              : 'Mehmon yoki kuryer uchun birinchi ruxsatnomani yarating'}
          </p>
          <button
            onClick={() => setShowCreateForm(true)}
            className="px-4 py-2 bg-primary-500 hover:bg-primary-600 text-gray-900 font-medium rounded-xl inline-flex items-center gap-2"
          >
            <Plus className="w-5 h-5" />
            {language === 'ru' ? 'Создать пропуск' : 'Ruxsatnoma yaratish'}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredCodes.map((code) => {
            const visitorLabel = VISITOR_TYPE_LABELS[code.visitorType];
            const statusLabel = GUEST_ACCESS_STATUS_LABELS[code.status];
            const isExpired = code.status === 'expired';
            const isRevoked = code.status === 'revoked';
            const isUsed = code.status === 'used';

            return (
              <div
                key={code.id}
                className={`glass-card p-4 ${
                  isExpired || isRevoked ? 'opacity-60' : ''
                }`}
              >
                <div className="flex items-start gap-3">
                  {/* Icon */}
                  <button
                    onClick={() => setSelectedCode(code)}
                    className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${
                      code.status === 'active' ? 'bg-green-100 text-green-600' :
                      isUsed ? 'bg-blue-100 text-blue-600' :
                      isRevoked ? 'bg-red-100 text-red-600' :
                      'bg-gray-100 text-gray-600'
                    }`}
                  >
                    <QrCode className="w-6 h-6" />
                  </button>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-lg">{visitorLabel.icon}</span>
                      <span className="font-medium">
                        {language === 'ru' ? visitorLabel.label : visitorLabel.labelUz}
                      </span>
                      <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${
                        code.status === 'active' ? 'bg-green-100 text-green-700' :
                        isUsed ? 'bg-blue-100 text-blue-700' :
                        isRevoked ? 'bg-red-100 text-red-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {language === 'ru' ? statusLabel.label : statusLabel.labelUz}
                      </span>
                    </div>

                    {code.visitorName && (
                      <div className="text-sm text-gray-600 flex items-center gap-1">
                        <User className="w-3.5 h-3.5" />
                        {code.visitorName}
                      </div>
                    )}

                    <div className="text-sm text-gray-500 flex items-center gap-1 mt-0.5">
                      <Clock className="w-3.5 h-3.5" />
                      {language === 'ru' ? 'до' : 'gacha'} {new Date(code.validUntil).toLocaleString(language === 'ru' ? 'ru-RU' : 'uz-UZ', {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </div>

                    {code.accessType !== 'single_use' && !isExpired && !isRevoked && (
                      <div className="text-xs text-gray-400 mt-1">
                        {language === 'ru' ? 'Использований' : 'Ishlatilgan'}: {code.currentUses}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1">
                    {code.status === 'active' && (
                      <button
                        onClick={() => setShowRevokeConfirm(code)}
                        className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        title={language === 'ru' ? 'Отменить' : 'Bekor qilish'}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={() => setSelectedCode(code)}
                      className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                      <ChevronRight className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modals */}
      {showCreateForm && (
        <CreatePassForm
          onClose={() => setShowCreateForm(false)}
          onCreated={handleCreated}
        />
      )}

      {selectedCode && (
        <QRCodeDisplay
          codeId={selectedCode.id}
          onClose={() => setSelectedCode(null)}
        />
      )}

      {/* Revoke confirmation */}
      {showRevokeConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6">
            <div className="text-center mb-4">
              <div className="w-16 h-16 mx-auto mb-4 bg-red-100 rounded-full flex items-center justify-center">
                <AlertTriangle className="w-8 h-8 text-red-600" />
              </div>
              <h3 className="text-lg font-bold mb-2">
                {language === 'ru' ? 'Отменить пропуск?' : 'Ruxsatnomani bekor qilasizmi?'}
              </h3>
              <p className="text-gray-600 text-sm">
                {language === 'ru'
                  ? 'Пропуск будет деактивирован и не сможет быть использован'
                  : 'Ruxsatnoma o\'chiriladi va ishlatib bo\'lmaydi'}
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowRevokeConfirm(null)}
                className="flex-1 py-3 border-2 border-gray-200 rounded-xl font-medium hover:bg-gray-50"
              >
                {language === 'ru' ? 'Нет' : 'Yo\'q'}
              </button>
              <button
                onClick={handleRevoke}
                className="flex-1 py-3 bg-red-500 hover:bg-red-600 text-white rounded-xl font-medium"
              >
                {language === 'ru' ? 'Да, отменить' : 'Ha, bekor qilish'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
