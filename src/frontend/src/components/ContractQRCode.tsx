import { useState, useEffect } from 'react';
import { Download, FileText, Eye, EyeOff, Loader2 } from 'lucide-react';
import { generateQRCode } from './LazyQRCode';
import { generateContractDocx } from '../utils/contractGenerator';
import { useAuthStore } from '../stores/authStore';
import { ContractPreview } from './ContractPreview';

interface ContractQRCodeProps {
  language: 'ru' | 'uz';
}

export function ContractQRCode({ language }: ContractQRCodeProps) {
  // Use user from store directly to get updates when contract is signed
  const { user, markContractSigned } = useAuthStore();
  const [showContract, setShowContract] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('');
  const [isDownloading, setIsDownloading] = useState(false);

  // Check if contract is already signed - using store user for reactivity
  const isContractSigned = !!user?.contractSignedAt;

  // Generate QR code with resident's personal data
  useEffect(() => {
    if (!user) return;

    const generateQR = async () => {
      // Compact format with Cyrillic - no decorative symbols
      const residentData = [
        `ФИО: ${user.name || 'Собственник'}`,
        `Л/С: ${user.login}`,
        user.address ? `Адрес: ${user.address}` : null,
        user.apartment ? `Кв: ${user.apartment}` : null,
        user.phone ? `Тел: ${user.phone}` : null,
      ].filter(Boolean).join('\n');

      const url = await generateQRCode(residentData, {
        width: 300,
        margin: 1,
        errorCorrectionLevel: 'M',
        color: { dark: '#000000', light: '#ffffff' },
      });
      setQrCodeUrl(url);
    };

    generateQR();
  }, [user]);

  const handleDownloadContract = async () => {
    if (!user || !qrCodeUrl || isDownloading) return;

    setIsDownloading(true);
    try {
      await generateContractDocx(user, qrCodeUrl, language);
      // Mark contract as signed in database (persists across devices) - only if not already signed
      if (!isContractSigned) {
        await markContractSigned();
      }
    } catch (error) {
      console.error('Error generating contract:', error);
      alert(language === 'ru'
        ? 'Ошибка при генерации договора'
        : 'Shartnoma yaratishda xatolik');
    } finally {
      setIsDownloading(false);
    }
  };

  if (!user) return null;

  return (
    <div className="glass-card p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className={`w-12 h-12 bg-gradient-to-br ${isContractSigned ? 'from-green-400 to-green-500' : 'from-orange-400 to-orange-500'} rounded-xl flex items-center justify-center shadow-sm`}>
          <FileText className="w-6 h-6 text-white" />
        </div>
        <div>
          <h3 className="font-bold text-lg text-gray-900">
            {language === 'ru' ? 'Договор с УК' : 'UK bilan shartnoma'}
          </h3>
          <p className="text-sm text-gray-500">
            {isContractSigned
              ? (language === 'ru' ? `Подписан ${new Date(user.contractSignedAt!).toLocaleDateString('ru-RU')}` : `Imzolangan ${new Date(user.contractSignedAt!).toLocaleDateString('uz-UZ')}`)
              : (language === 'ru' ? 'Ваш уникальный QR-код' : 'Sizning noyob QR-kodingiz')
            }
          </p>
        </div>
      </div>

      {/* QR Code Display */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 mb-4 flex flex-col items-center">
        {qrCodeUrl ? (
          <img src={qrCodeUrl} alt="QR Code" className="w-40 h-40" />
        ) : (
          <div className="w-40 h-40 bg-gray-100 rounded animate-pulse" />
        )}
        <p className="text-sm text-gray-500 mt-3 text-center">
          {language === 'ru'
            ? 'Сканируйте для просмотра данных'
            : 'Ma\'lumotlarni ko\'rish uchun skanerlang'}
        </p>
      </div>

      {/* Resident Info */}
      <div className="bg-gray-50 rounded-xl p-3 mb-4">
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <span className="text-gray-500">{language === 'ru' ? 'Житель:' : 'Aholi:'}</span>
            <p className="font-medium text-gray-900">{user.name || '—'}</p>
          </div>
          <div>
            <span className="text-gray-500">{language === 'ru' ? 'Адрес:' : 'Manzil:'}</span>
            <p className="font-medium text-gray-900">
              {user.address ? (
                user.apartment ? `${user.address}, кв. ${user.apartment}` : user.address
              ) : (
                user.apartment ? `кв. ${user.apartment}` : '—'
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => setShowContract(!showContract)}
          className="flex items-center justify-center gap-2 px-4 py-3 bg-gray-100 hover:bg-gray-200 rounded-xl text-sm font-medium text-gray-700 transition-colors touch-manipulation"
        >
          {showContract ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          {showContract
            ? (language === 'ru' ? 'Скрыть' : 'Yashirish')
            : (language === 'ru' ? 'Посмотреть' : 'Ko\'rish')
          }
        </button>
        <button
          onClick={handleDownloadContract}
          disabled={isDownloading || !qrCodeUrl}
          className={`flex items-center justify-center gap-2 px-4 py-3 ${isContractSigned ? 'bg-green-500 hover:bg-green-600' : 'bg-orange-400 hover:bg-orange-500'} disabled:bg-gray-300 disabled:cursor-not-allowed rounded-xl text-sm font-medium text-gray-900 transition-colors touch-manipulation`}
        >
          {isDownloading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Download className="w-4 h-4" />
          )}
          {isDownloading
            ? (language === 'ru' ? 'Подготовка...' : 'Tayyorlanmoqda...')
            : isContractSigned
              ? (language === 'ru' ? 'Скачать договор' : 'Shartnomani yuklash')
              : (language === 'ru' ? 'Подписать и скачать' : 'Imzolash va yuklash')
          }
        </button>
      </div>

      {/* Full Contract Preview */}
      {showContract && (
        <div className="mt-4">
          <ContractPreview user={user} qrCodeUrl={qrCodeUrl} language={language} />
        </div>
      )}
    </div>
  );
}
