// Раздел «Протоколы» — акты приёма-передачи дома в управление.
// Список актов по дому + мастер создания (модалка), генерация PDF/DOCX.
import { useEffect, useMemo, useState } from 'react';
import { ScrollText, FileText, FileDown, Trash2, Plus } from 'lucide-react';
import { useBuildingStore } from '../../stores/buildingStore';
import { useLanguageStore } from '../../stores/languageStore';
import { useToastStore } from '../../stores/toastStore';
import { useTenantStore } from '../../stores/tenantStore';
import { actsApi } from '../../services/api';
import type { BuildingAct } from '../../types/acts';
import { generateHandoverActPdf, generateHandoverActDoc } from '../../utils/generateHandoverAct';
import { ActWizardModal } from './ActWizardModal';

export function ProtocolsPage() {
  const { language } = useLanguageStore();
  const isRu = language === 'ru';
  const t = (ru: string, uz: string) => (isRu ? ru : uz);
  const addToast = useToastStore((s) => s.addToast);
  const buildings = useBuildingStore((s) => s.buildings);
  const fetchBuildings = useBuildingStore((s) => s.fetchBuildings);
  const tenantName = useTenantStore((s) => s.config?.tenant?.name) || 'Kamizo';

  const [buildingId, setBuildingId] = useState('');
  const [acts, setActs] = useState<BuildingAct[]>([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => { fetchBuildings(); }, [fetchBuildings]);
  useEffect(() => {
    if (buildings.length && !buildingId) setBuildingId(String(buildings[0].id));
  }, [buildings, buildingId]);

  const selectedBuilding = useMemo(
    () => buildings.find((b) => String(b.id) === buildingId),
    [buildings, buildingId],
  );

  const loadActs = async (id: string) => {
    if (!id) return;
    setLoading(true);
    try { setActs(await actsApi.list(id)); }
    catch { addToast('error', t('Не удалось загрузить акты', 'Aktlarni yuklab bo\'lmadi')); }
    finally { setLoading(false); }
  };
  useEffect(() => { loadActs(buildingId); /* eslint-disable-next-line */ }, [buildingId]);

  const handleDelete = async (id: string) => {
    if (!window.confirm(t('Удалить акт?', 'Aktni o\'chirasizmi?'))) return;
    await actsApi.remove(id);
    setActs((prev) => prev.filter((a) => a.id !== id));
  };

  return (
    <div className="space-y-6 pb-24 md:pb-0">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-full bg-gradient-to-br from-[#E8621A] to-[#F59E0B] flex items-center justify-center shadow-sm">
            <ScrollText className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">{t('Протоколы', 'Protokollar')}</h1>
            <p className="text-sm text-gray-500">{t('Акты приёма-передачи домов в управление', 'Uylarni boshqaruvga qabul-topshirish aktlari')}</p>
          </div>
        </div>
        <button
          onClick={() => setShowModal(true)}
          disabled={!buildingId}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary-500 text-white rounded-xl hover:bg-primary-600 disabled:opacity-50 font-medium text-sm"
        >
          <Plus className="w-4 h-4" /> {t('Создать акт', 'Akt yaratish')}
        </button>
      </div>

      <div className="bg-white/60 backdrop-blur-xl rounded-xl border border-gray-100 shadow-sm p-4">
        <label className="block text-xs font-medium text-gray-600 mb-1">{t('Дом', 'Uy')}</label>
        <select
          value={buildingId}
          onChange={(e) => setBuildingId(e.target.value)}
          className="w-full sm:w-96 px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm outline-none focus:ring-2 focus:ring-primary-500"
        >
          {buildings.map((b) => (
            <option key={String(b.id)} value={String(b.id)}>{String(b.name)}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="text-center text-gray-400 py-10 text-sm">{t('Загрузка…', 'Yuklanmoqda…')}</div>
      ) : acts.length === 0 ? (
        <div className="text-center text-gray-400 py-10 text-sm">
          {t('Актов пока нет. Нажмите «Создать акт».', 'Aktlar yo\'q. «Akt yaratish»ni bosing.')}
        </div>
      ) : (
        <div className="grid gap-3">
          {acts.map((a) => (
            <div key={a.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-center justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <div className="font-semibold text-gray-900">
                  {t('Акт приёма-передачи', 'Qabul-topshirish akti')} {a.act_number ? `№ ${a.act_number}` : ''}
                </div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {a.act_date || '—'} · {t('ячеек', 'yacheyka')}: {(a.snapshot.cells?.residential || 0) + (a.snapshot.cells?.parking || 0) + (a.snapshot.cells?.commercial || 0)}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => generateHandoverActPdf(a, tenantName, language as 'ru' | 'uz')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">
                  <FileText className="w-4 h-4" /> PDF
                </button>
                <button onClick={() => generateHandoverActDoc(a, tenantName, language as 'ru' | 'uz')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">
                  <FileDown className="w-4 h-4" /> Word
                </button>
                <button onClick={() => handleDelete(a.id)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-red-200 text-red-600 rounded-lg text-sm hover:bg-red-50">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && selectedBuilding && (
        <ActWizardModal
          building={selectedBuilding as any}
          tenantName={tenantName}
          language={language as 'ru' | 'uz'}
          onClose={() => setShowModal(false)}
          onCreated={() => { setShowModal(false); loadActs(buildingId); }}
        />
      )}
    </div>
  );
}

export default ProtocolsPage;
