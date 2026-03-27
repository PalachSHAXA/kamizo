import { useRef } from 'react';
import {
  X, Check, FileSpreadsheet, AlertCircle, Loader2
} from 'lucide-react';
import type { ExcelRow, BuildingFull } from './types';

interface UploadModalProps {
  uploadedData: ExcelRow[];
  uploadError: string;
  isCreating: boolean;
  selectedBuilding: BuildingFull | null;
  defaultPassword: string;
  onClose: () => void;
  onFileUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onClearData: () => void;
  onCreateAccounts: () => void;
  extractApartmentFromAddress: (address: string) => string;
  calculateEntranceAndFloor: (apartment: string) => { entrance: string; floor: string };
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  language: string;
}

export function UploadModal({
  uploadedData,
  uploadError,
  isCreating,
  selectedBuilding,
  defaultPassword,
  onClose,
  onFileUpload,
  onClearData,
  onCreateAccounts,
  extractApartmentFromAddress,
  calculateEntranceAndFloor,
  fileInputRef,
  language,
}: UploadModalProps) {
  return (
    <div className="modal-backdrop items-end sm:items-center">
      <div className="modal-content p-4 sm:p-6 w-full max-w-2xl sm:mx-4 rounded-t-2xl sm:rounded-2xl max-h-[90dvh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold">{language === 'ru' ? 'Загрузка данных жителей' : 'Yashovchilar ma\'lumotlarini yuklash'}</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/30 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {uploadedData.length === 0 ? (
          <>
            <div
              className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:border-primary-400 transition-colors cursor-pointer"
              onClick={() => fileInputRef.current?.click()}
            >
              <FileSpreadsheet className="w-12 h-12 mx-auto mb-4 text-gray-400" />
              <h3 className="font-semibold text-gray-700 mb-2">
                {language === 'ru' ? 'Загрузите XLS/XLSX файл' : 'XLS/XLSX faylni yuklang'}
              </h3>
              <p className="text-sm text-gray-500 mb-4">
                {language === 'ru'
                  ? <>Файл должен содержать столбцы: <strong>Л/С</strong>, <strong>ФИО абонента</strong>, <strong>Адрес</strong>, <strong>Площадь (кв.м)</strong></>
                  : <>Faylda ustunlar bo'lishi kerak: <strong>Sh/H</strong>, <strong>F.I.O.</strong>, <strong>Manzil</strong>, <strong>Maydon (kv.m)</strong></>
                }
              </p>
              <button className="btn-primary" onClick={() => fileInputRef.current?.click()}>
                {language === 'ru' ? 'Выбрать файл' : 'Faylni tanlash'}
              </button>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={onFileUpload}
              className="hidden"
            />

            {uploadError && (
              <div className="mt-4 p-3 bg-red-50 text-red-700 rounded-lg flex items-center gap-2">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                {uploadError}
              </div>
            )}

            <div className="mt-6 p-4 bg-gray-50 rounded-xl">
              <h4 className="font-medium text-gray-700 mb-2">{language === 'ru' ? 'Пример формата файла:' : 'Fayl formati namunasi:'}</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2">{language === 'ru' ? 'Л/С' : 'Sh/H'}</th>
                      <th className="text-left p-2">{language === 'ru' ? 'ФИО абонента' : 'Abonent F.I.O.'}</th>
                      <th className="text-left p-2">{language === 'ru' ? 'Адрес' : 'Manzil'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="p-2">12345678</td>
                      <td className="p-2">{language === 'ru' ? 'Иванов Иван Иванович' : 'Ivanov Ivan Ivanovich'}</td>
                      <td className="p-2">{language === 'ru' ? 'ул. Мустакиллик, 15, кв. 42' : 'Mustaqillik ko\'ch., 15, xon. 42'}</td>
                    </tr>
                    <tr>
                      <td className="p-2">12345679</td>
                      <td className="p-2">{language === 'ru' ? 'Петрова Анна Сергеевна' : 'Petrova Anna Sergeyevna'}</td>
                      <td className="p-2">{language === 'ru' ? 'ул. Мустакиллик, 15, кв. 18' : 'Mustaqillik ko\'ch., 15, xon. 18'}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold">
                  {language === 'ru' ? 'Найдено записей' : 'Topilgan yozuvlar'}: {uploadedData.length}
                </h3>
                <button
                  onClick={onClearData}
                  className="text-sm text-gray-500 hover:text-gray-700"
                >
                  {language === 'ru' ? 'Загрузить другой файл' : 'Boshqa fayl yuklash'}
                </button>
              </div>

              {/* Entrance distribution preview */}
              {(() => {
                const dist: Record<string, number> = {};
                uploadedData.forEach(row => {
                  const apt = extractApartmentFromAddress(row.address);
                  const { entrance: calcE } = calculateEntranceAndFloor(apt);
                  const ent = row.entrance || calcE || (language === 'ru' ? 'без подъезда' : 'kirish yo\'q');
                  dist[ent] = (dist[ent] || 0) + 1;
                });
                const entries = Object.entries(dist).sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }));
                if (entries.length <= 1) return null;
                return (
                  <div className="mb-3 p-3 bg-blue-50 rounded-xl text-sm">
                    <span className="font-semibold text-blue-700">{language === 'ru' ? 'Распределение по подъездам:' : 'Kirish bo\'yicha taqsimot:'} </span>
                    {entries.map(([k, v]) => (
                      <span key={k} className="inline-block mr-2 text-blue-600">
                        {language === 'ru' ? `пд.${k}` : `kir.${k}`}: <strong>{v}</strong>
                      </span>
                    ))}
                  </div>
                );
              })()}

              <div className="max-h-64 overflow-y-auto border rounded-xl">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr className="border-b">
                      <th className="text-left p-3">{language === 'ru' ? 'Л/С' : 'Sh/H'}</th>
                      <th className="text-left p-3">{language === 'ru' ? 'ФИО абонента' : 'Abonent F.I.O.'}</th>
                      <th className="text-left p-3">{language === 'ru' ? 'Кв.' : 'Xon.'}</th>
                      <th className="text-left p-3">{language === 'ru' ? 'Пд.' : 'Kir.'}</th>
                      <th className="text-left p-3">{language === 'ru' ? 'м²' : 'm²'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {uploadedData.slice(0, 20).map((row, idx) => {
                      const apt = extractApartmentFromAddress(row.address);
                      const { entrance: calcE } = calculateEntranceAndFloor(apt);
                      const ent = row.entrance || calcE || '—';
                      return (
                        <tr key={idx} className="border-b last:border-b-0">
                          <td className="p-3 text-xs text-gray-500">{row.personalAccount}</td>
                          <td className="p-3">{row.fullName}</td>
                          <td className="p-3 font-mono">{apt || '—'}</td>
                          <td className="p-3 font-semibold text-blue-600">{ent}</td>
                          <td className="p-3">{row.totalArea ? row.totalArea : '—'}</td>
                        </tr>
                      );
                    })}
                    {uploadedData.length > 20 && (
                      <tr>
                        <td colSpan={5} className="p-3 text-center text-gray-500">
                          {language === 'ru' ? `и еще ${uploadedData.length - 20} записей...` : `va yana ${uploadedData.length - 20} ta yozuv...`}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="p-3 bg-primary-50 text-primary-700 rounded-xl mb-4 text-sm">
              {selectedBuilding?.branchCode && selectedBuilding?.buildingNumber ? (
                <>
                  <strong>{language === 'ru' ? 'Формат пароля' : 'Parol formati'}:</strong> {selectedBuilding.branchCode}/{selectedBuilding.buildingNumber}/{language === 'ru' ? '[номер квартиры]' : '[xonadon raqami]'}
                  <br />
                  <span className="text-primary-600">
                    {language === 'ru'
                      ? `Например: ${selectedBuilding.branchCode}/${selectedBuilding.buildingNumber}/23 для квартиры 23`
                      : `Masalan: ${selectedBuilding.branchCode}/${selectedBuilding.buildingNumber}/23 — 23-xonadon uchun`}
                  </span>
                </>
              ) : (
                <>
                  <strong>{language === 'ru' ? 'Пароль по умолчанию' : 'Standart parol'}:</strong> {defaultPassword}
                  <br />
                  <span className="text-primary-600">
                    {language === 'ru' ? 'Жители смогут изменить пароль в личном кабинете' : 'Yashovchilar parolni shaxsiy kabinetda o\'zgartira oladi'}
                  </span>
                </>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={onClearData}
                className="btn-secondary flex-1"
              >
                {language === 'ru' ? 'Отмена' : 'Bekor qilish'}
              </button>
              <button
                onClick={onCreateAccounts}
                disabled={isCreating}
                className="btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isCreating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {language === 'ru' ? 'Создание...' : 'Yaratilmoqda...'}
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    {language === 'ru' ? `Создать ${uploadedData.length} аккаунтов` : `${uploadedData.length} ta akkaunt yaratish`}
                  </>
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
