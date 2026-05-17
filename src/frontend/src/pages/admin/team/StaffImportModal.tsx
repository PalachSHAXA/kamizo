import { type RefObject } from 'react';
import { Upload, X, Loader2, CheckCircle, AlertCircle } from 'lucide-react';

// Sprint 17: extracted from TeamPage. Bulk-import staff from a .json
// file. Displays the result summary (created / updated / skipped) when
// the upload completes.

interface ImportResult {
  success: boolean;
  stats?: Record<string, number>;
  error?: string;
}

interface StaffImportModalProps {
  language: string;
  onClose: () => void;
  fileInputRef: RefObject<HTMLInputElement>;
  importFile: File | null;
  onFileSelect: (file: File | null) => void;
  importResult: ImportResult | null;
  importLoading: boolean;
  onImport: () => void;
}

export function StaffImportModal({
  language,
  onClose,
  fileInputRef,
  importFile,
  onFileSelect,
  importResult,
  importLoading,
  onImport,
}: StaffImportModalProps) {
  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90dvh] overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="text-[18px] font-extrabold">
              {language === 'ru' ? 'Импорт персонала' : 'Xodimlarni import qilish'}
            </h3>
            <p className="text-[13px] text-gray-400 mt-0.5">
              {language === 'ru'
                ? 'Загрузите .json файл с данными сотрудников'
                : "Xodimlar ma'lumotlari bilan .json faylni yuklang"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="min-w-[44px] min-h-[44px] rounded-lg flex items-center justify-center hover:bg-gray-100"
            aria-label={language === 'ru' ? 'Закрыть' : 'Yopish'}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-all"
        >
          <Upload className="w-8 h-8 mx-auto mb-3 text-gray-300" />
          {importFile ? (
            <div>
              <p className="text-[14px] font-bold text-gray-700">{importFile.name}</p>
              <p className="text-[12px] text-gray-400 mt-1">{(importFile.size / 1024).toFixed(1)} KB</p>
            </div>
          ) : (
            <div>
              <p className="text-[14px] font-bold text-gray-600">
                {language === 'ru' ? 'Выберите файл' : 'Faylni tanlang'}
              </p>
              <p className="text-[12px] text-gray-400 mt-1">
                {language === 'ru' ? 'Поддерживается .json формат' : ".json format qo'llab-quvvatlanadi"}
              </p>
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFileSelect(f);
            }}
          />
        </div>

        {importResult && (
          <div
            className={`mt-4 p-4 rounded-xl ${
              importResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
            }`}
          >
            {importResult.success ? (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle className="w-4 h-4 text-green-600" />
                  <span className="text-[14px] font-bold text-green-700">
                    {language === 'ru' ? 'Импорт успешен!' : 'Import muvaffaqiyatli!'}
                  </span>
                </div>
                <div className="flex gap-4">
                  {(importResult.stats?.created ?? 0) > 0 && (
                    <div className="text-center">
                      <div className="text-[22px] font-extrabold text-green-600">
                        {importResult.stats?.created}
                      </div>
                      <div className="text-xs text-gray-400">
                        {language === 'ru' ? 'Создано' : 'Yaratildi'}
                      </div>
                    </div>
                  )}
                  {(importResult.stats?.updated ?? 0) > 0 && (
                    <div className="text-center">
                      <div className="text-[22px] font-extrabold text-blue-600">
                        {importResult.stats?.updated}
                      </div>
                      <div className="text-xs text-gray-400">
                        {language === 'ru' ? 'Обновлено' : 'Yangilandi'}
                      </div>
                    </div>
                  )}
                  {(importResult.stats?.skipped ?? 0) > 0 && (
                    <div className="text-center">
                      <div className="text-[22px] font-extrabold text-gray-400">
                        {importResult.stats?.skipped}
                      </div>
                      <div className="text-xs text-gray-400">
                        {language === 'ru' ? 'Пропущено' : "O'tkazib yuborildi"}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                <span className="text-[13px] text-red-600">{importResult.error}</span>
              </div>
            )}
          </div>
        )}

        <div className="flex gap-3 mt-5">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-gray-200 text-[14px] font-bold text-gray-600 hover:bg-gray-50 transition-all"
          >
            {language === 'ru' ? 'Закрыть' : 'Yopish'}
          </button>
          <button
            onClick={onImport}
            disabled={!importFile || importLoading}
            className="flex-1 py-2.5 rounded-xl bg-blue-500 text-white text-[14px] font-bold flex items-center justify-center gap-2 hover:bg-blue-600 transition-all disabled:opacity-50"
          >
            {importLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {language === 'ru' ? 'Импортировать' : 'Import qilish'}
          </button>
        </div>
      </div>
    </div>
  );
}
