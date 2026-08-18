// Мастер создания акта приёма-передачи (модалка).
// Собирает основание/опции/ячейки → создаёт ячейки (bulk) → сохраняет акт →
// генерирует PDF. Также используется при онбординге нового дома.
import { useState } from 'react';
import { X } from 'lucide-react';
import { actsApi } from '../../services/api';
import { useToastStore } from '../../stores/toastStore';
import type { BuildingAct, TechDocKey } from '../../types/acts';
import { generateHandoverActPdf } from '../../utils/generateHandoverAct';

interface BuildingLike {
  id: string; name?: string; address?: string;
  totalArea?: number; livingArea?: number; floors?: number; entrances?: number;
  hasParkingLot?: boolean;
}

const TECH_DOCS: Array<{ key: TechDocKey; ru: string; uz: string; def?: boolean }> = [
  { key: 'tech_passport', ru: 'Техпаспорт дома', uz: 'Uy texpasporti', def: true },
  { key: 'floor_plans', ru: 'Поэтажные планы', uz: 'Qavat rejalari', def: true },
  { key: 'engineering_schemes', ru: 'Схемы инженерных сетей', uz: 'Muhandislik tarmoqlari', def: true },
  { key: 'elevator_passports', ru: 'Паспорта лифтов', uz: 'Lift pasportlari' },
  { key: 'cadastral', ru: 'Кадастровые документы', uz: 'Kadastr hujjatlari' },
  { key: 'keys', ru: 'Ключи от МОП', uz: 'MOP kalitlari', def: true },
  { key: 'equipment', ru: 'Оборудование', uz: 'Uskunalar' },
];

function NumField({ value, onChange, placeholder }: { value: number; onChange: (n: number) => void; placeholder?: string }) {
  return (
    <input
      type="text" inputMode="numeric"
      value={value === 0 ? '' : String(value)}
      placeholder={placeholder}
      onChange={(e) => { const raw = e.target.value.replace(/[^\d]/g, ''); onChange(raw === '' ? 0 : Number(raw)); }}
      className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-right outline-none focus:ring-2 focus:ring-primary-500"
    />
  );
}

export function ActWizardModal({ building, tenantName, language, onClose, onCreated }: {
  building: BuildingLike; tenantName: string; language: 'ru' | 'uz';
  onClose: () => void; onCreated: () => void;
}) {
  const isRu = language === 'ru';
  const t = (ru: string, uz: string) => (isRu ? ru : uz);
  const addToast = useToastStore((s) => s.addToast);

  const [actNumber, setActNumber] = useState('');
  const [actDate, setActDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [meetingNo, setMeetingNo] = useState('');
  const [meetingDate, setMeetingDate] = useState('');
  const [contractNo, setContractNo] = useState('');
  const [contractDate, setContractDate] = useState('');
  const [hasParking, setHasParking] = useState(!!building.hasParkingLot);
  const [hasNonRes, setHasNonRes] = useState(false);
  const [techDocs, setTechDocs] = useState<TechDocKey[]>(TECH_DOCS.filter((d) => d.def).map((d) => d.key));
  const [funds, setFunds] = useState(0);
  const [resCells, setResCells] = useState(0);
  const [parkCells, setParkCells] = useState(0);
  const [comCells, setComCells] = useState(0);
  const [freeText, setFreeText] = useState('');
  const [transferor, setTransferor] = useState('');
  const [receiverSig, setReceiverSig] = useState('');
  const [saving, setSaving] = useState(false);

  const toggleDoc = (k: TechDocKey) =>
    setTechDocs((prev) => prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]);

  const handleSubmit = async () => {
    setSaving(true);
    try {
      // 1) Создать ячейки по типам (bulk).
      const mk = (n: number, prefix: string, flags: Record<string, boolean>) =>
        Array.from({ length: n }, (_, i) => ({ number: `${prefix}${i + 1}`, ...flags }));
      const batches: Array<Array<any>> = [];
      if (resCells > 0) batches.push(mk(resCells, '', {}));
      if (parkCells > 0) batches.push(mk(parkCells, 'П-', { is_parking: true }));
      if (comCells > 0) batches.push(mk(comCells, 'Н-', { is_commercial: true, is_basement: false }));
      for (const batch of batches) {
        await actsApi.bulkCells(building.id, batch);
      }

      const options = {
        has_parking: hasParking, has_nonresidential: hasNonRes,
        tech_docs: techDocs, funds_amount: funds || undefined,
        free_text: freeText || undefined,
        transferor: transferor || undefined, receiver_signatory: receiverSig || undefined,
      };
      const basis = {
        meeting_decision_no: meetingNo || undefined, meeting_decision_date: meetingDate || undefined,
        contract_no: contractNo || undefined, contract_date: contractDate || undefined,
      };
      const snapshot = {
        building_name: building.name, address: building.address,
        total_area: building.totalArea, living_area: building.livingArea,
        floors: building.floors, entrances: building.entrances,
        cells: { residential: resCells, parking: parkCells, commercial: comCells },
      };

      // 2) Сохранить акт.
      const { id } = await actsApi.create(building.id, {
        act_type: 'handover', act_number: actNumber || undefined, act_date: actDate || undefined,
        basis, options, snapshot,
      });

      // 3) Сгенерировать PDF из локальных данных (без повторной загрузки).
      const act: BuildingAct = {
        id, building_id: building.id, act_type: 'handover',
        act_number: actNumber || undefined, act_date: actDate || undefined,
        basis, options, snapshot,
      };
      generateHandoverActPdf(act, tenantName, language);

      addToast('success', t('Акт создан', 'Akt yaratildi'));
      onCreated();
    } catch (e: any) {
      addToast('error', e?.message || t('Ошибка создания акта', 'Akt yaratishda xatolik'));
    } finally {
      setSaving(false);
    }
  };

  const inp = 'w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm outline-none focus:ring-2 focus:ring-primary-500';
  const lbl = 'block text-xs font-medium text-gray-600 mb-1';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white">
          <h2 className="text-lg font-bold">{t('Акт приёма-передачи', 'Qabul-topshirish akti')} — {String(building.name || '')}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <div><label className={lbl}>{t('№ акта', 'Akt №')}</label><input className={inp} value={actNumber} onChange={(e) => setActNumber(e.target.value)} placeholder="1" /></div>
            <div><label className={lbl}>{t('Дата акта', 'Akt sanasi')}</label><input type="date" className={inp} value={actDate} onChange={(e) => setActDate(e.target.value)} /></div>
          </div>

          <div>
            <div className="text-sm font-semibold mb-2">{t('Основание', 'Asos')}</div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className={lbl}>{t('Решение собрания №', 'Yig\'ilish qarori №')}</label><input className={inp} value={meetingNo} onChange={(e) => setMeetingNo(e.target.value)} /></div>
              <div><label className={lbl}>{t('Дата решения', 'Qaror sanasi')}</label><input type="date" className={inp} value={meetingDate} onChange={(e) => setMeetingDate(e.target.value)} /></div>
              <div><label className={lbl}>{t('Договор управления №', 'Boshqaruv shartnomasi №')}</label><input className={inp} value={contractNo} onChange={(e) => setContractNo(e.target.value)} /></div>
              <div><label className={lbl}>{t('Дата договора', 'Shartnoma sanasi')}</label><input type="date" className={inp} value={contractDate} onChange={(e) => setContractDate(e.target.value)} /></div>
            </div>
          </div>

          <div className="flex flex-wrap gap-4">
            <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={hasParking} onChange={(e) => setHasParking(e.target.checked)} className="rounded border-gray-300 text-primary-500" />
              {t('Есть парковка', 'Avtoturargoh bor')}
            </label>
            <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={hasNonRes} onChange={(e) => setHasNonRes(e.target.checked)} className="rounded border-gray-300 text-primary-500" />
              {t('Есть нежилые/коммерческие', 'Noturar/tijoriy bor')}
            </label>
          </div>

          <div>
            <div className="text-sm font-semibold mb-2">{t('Передаётся (техдокументация)', 'Topshiriladi')}</div>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {TECH_DOCS.map((d) => (
                <label key={d.key} className="inline-flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={techDocs.includes(d.key)} onChange={() => toggleDoc(d.key)} className="rounded border-gray-300 text-primary-500" />
                  {t(d.ru, d.uz)}
                </label>
              ))}
            </div>
            <div className="mt-3 w-56"><label className={lbl}>{t('Остаток средств, сум', 'Mablag\' qoldig\'i')}</label><NumField value={funds} onChange={setFunds} placeholder="0" /></div>
          </div>

          <div>
            <div className="text-sm font-semibold mb-2">{t('Создать ячейки (помещения)', 'Yacheykalar yaratish')}</div>
            <div className="grid grid-cols-3 gap-3">
              <div><label className={lbl}>{t('Жилых', 'Turar')}</label><NumField value={resCells} onChange={setResCells} placeholder="0" /></div>
              <div><label className={lbl}>{t('Парковка', 'Avtoturargoh')}</label><NumField value={parkCells} onChange={setParkCells} placeholder="0" /></div>
              <div><label className={lbl}>{t('Нежилых', 'Noturar')}</label><NumField value={comCells} onChange={setComCells} placeholder="0" /></div>
            </div>
            <p className="text-[11px] text-gray-400 mt-1">{t('Ячейки создаются в доме как помещения (apartments) с нужными признаками.', 'Yacheykalar apartments sifatida yaratiladi.')}</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div><label className={lbl}>{t('Передающая сторона', 'Topshiruvchi tomon')}</label><input className={inp} value={transferor} onChange={(e) => setTransferor(e.target.value)} placeholder={t('Собственники / прежняя УК', 'Mulkdorlar / avvalgi BT')} /></div>
            <div><label className={lbl}>{t('Подписант собственников', 'Mulkdorlar imzolovchisi')}</label><input className={inp} value={receiverSig} onChange={(e) => setReceiverSig(e.target.value)} placeholder={t('Председатель совета дома', 'Uy kengashi raisi')} /></div>
          </div>

          <div>
            <label className={lbl}>{t('Дополнительные положения (свободный текст)', 'Qo\'shimcha qoidalar')}</label>
            <textarea className={inp + ' min-h-[70px]'} value={freeText} onChange={(e) => setFreeText(e.target.value)} />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-100 sticky bottom-0 bg-white">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-gray-600 hover:bg-gray-100">{t('Отмена', 'Bekor')}</button>
          <button onClick={handleSubmit} disabled={saving} className="px-5 py-2.5 rounded-xl bg-primary-500 text-white font-semibold hover:bg-primary-600 disabled:opacity-50">
            {saving ? '…' : t('Создать и скачать PDF', 'Yaratish va PDF')}
          </button>
        </div>
      </div>
    </div>
  );
}
