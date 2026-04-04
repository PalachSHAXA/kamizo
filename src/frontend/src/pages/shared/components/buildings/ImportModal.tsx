import { useRef } from 'react';
import {
  X, Upload, Loader2, CheckCircle, AlertCircle,
} from 'lucide-react';

interface ImportModalProps {
  importFile: File | null;
  setImportFile: (file: File | null) => void;
  importLoading: boolean;
  importResult: { success: boolean; stats?: any; error?: string } | null;
  language: string;
  onClose: () => void;
  onSubmit: () => void;
}

export function ImportModal({
  importFile,
  setImportFile,
  importLoading,
  importResult,
  language,
  onClose,
  onSubmit,
}: ImportModalProps) {
  const t = (ru: string, uz: string) => language === 'ru' ? ru : uz;
  const importFileRef = useRef<HTMLInputElement>(null);

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white/90 backdrop-blur-xl rounded-2xl shadow-2xl w-full max-w-md p-6 border border-white/60">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="text-[18px] font-extrabold">{t('Импорт комплекса', 'Kompleksni import qilish')}</h3>
            <p className="text-[13px] text-gray-400 mt-0.5">{t('Загрузите .json файл экспорта', 'Eksport .json faylini yuklang')}</p>
          </div>
          <button onClick={onClose} className="min-w-[44px] min-h-[44px] rounded-lg flex items-center justify-center hover:bg-gray-100" aria-label="Закрыть">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* File Drop Zone */}
        <div
          onClick={() => importFileRef.current?.click()}
          className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center cursor-pointer hover:border-orange-400 hover:bg-orange-50 transition-all"
        >
          <Upload className="w-8 h-8 mx-auto mb-3 text-gray-300" />
          {importFile ? (
            <div>
              <p className="text-[14px] font-bold text-gray-700">{importFile.name}</p>
              <p className="text-[12px] text-gray-400 mt-1">{(importFile.size / 1024).toFixed(1)} KB</p>
            </div>
          ) : (
            <div>
              <p className="text-[14px] font-bold text-gray-600">{t('Выберите файл', 'Faylni tanlang')}</p>
              <p className="text-[12px] text-gray-400 mt-1">{t('Поддерживается .json формат', '.json format qo\'llab-quvvatlanadi')}</p>
            </div>
          )}
          <input
            ref={importFileRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) { setImportFile(f); }
            }}
          />
        </div>

        {/* Result */}
        {importResult && (
          <div className={`mt-4 p-4 rounded-xl ${importResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
            {importResult.success ? (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle className="w-4 h-4 text-green-600" />
                  <span className="text-[14px] font-bold text-green-700">{t('Импорт успешен!', 'Import muvaffaqiyatli!')}</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {Object.entries(importResult.stats || {}).map(([key, val]) => (
                    val as number > 0 && (
                      <div key={key} className="bg-white rounded-lg p-2 text-center">
                        <div className="text-[18px] font-extrabold text-green-600">{val as number}</div>
                        <div className="text-xs text-gray-400 capitalize">{key.replace('_', ' ')}</div>
                      </div>
                    )
                  ))}
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
            {t('Закрыть', 'Yopish')}
          </button>
          <button
            onClick={onSubmit}
            disabled={!importFile || importLoading}
            className="flex-1 py-2.5 rounded-xl bg-blue-500 text-white text-[14px] font-bold flex items-center justify-center gap-2 hover:bg-blue-600 transition-all disabled:opacity-50"
          >
            {importLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {t('Импортировать', 'Import qilish')}
          </button>
        </div>
      </div>
    </div>
  );
}
