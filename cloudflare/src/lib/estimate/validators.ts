// Warnings-валидаторы для сметы. Работают на выходе computeEstimate().
//
// Три типа предупреждений:
//   BELOW_MIN_TARIFF        — тариф ниже гос. минимума по этажности
//   MISSING_MANDATORY_SERVICE — не покрыта одна из 16 обязательных услуг
//   REQUIRES_ASSEMBLY_DECISION — статья требует решения общего собрания
//
// НЕ блокируют сохранение сметы — только показывают менеджеру риски.

import type { EstimateInput, EstimateResult } from './compute';
import {
  MANDATORY_SERVICES,
  SERVICE_STATUS_FLAGS,
  LEGACY_SERVICE_CODE_MAP,
  getMinTariff,
} from './legal-constants';

export type WarningSeverity = 'error' | 'warning' | 'info';

export interface EstimateWarning {
  code: 'BELOW_MIN_TARIFF' | 'MISSING_MANDATORY_SERVICE' | 'REQUIRES_ASSEMBLY_DECISION' | 'RISK_UNNECESSARY' | 'MISSING_AREA';
  severity: WarningSeverity;
  message_ru: string;
  message_uz: string;
  meta?: Record<string, unknown>;
}

export interface BuildingFacts {
  floors?: number;
  has_elevator?: boolean;
  has_pumps?: boolean;
  // 'unassigned' — черновик ещё не привязан к объекту (migration 066).
  // Площади у него нет по определению, и это не ошибка составителя.
  scope_level?: string;
}

/**
 * Прогнать все правила против input+result и вернуть список предупреждений.
 * Пустой массив = проверка прошла.
 */
export function validate(
  input: EstimateInput,
  result: EstimateResult,
  building: BuildingFacts,
): EstimateWarning[] {
  const warnings: EstimateWarning[] = [];

  // 0) Жилая площадь не заполнена — тариф считать не от чего (делим на ~0),
  // получаются нули или абсурдные суммы. Явно предупреждаем.
  const area = input.object.residential_area;
  if (!area || area <= 0) {
    // У черновика без объекта площади нет по определению — это ожидаемое
    // состояние, а не ошибка: тариф посчитается при привязке к объекту.
    // Отправлять составителя «в Комплексы» тут бессмысленно.
    const unassigned = building.scope_level === 'unassigned';
    warnings.push({
      code: 'MISSING_AREA',
      severity: unassigned ? 'info' : 'error',
      message_ru: unassigned
        ? 'Черновик без объекта: тариф посчитается после привязки к объекту — тогда подставится его жилая площадь. Расходы и штат можно заполнять уже сейчас.'
        : 'Не заполнена жилая площадь дома — тариф рассчитать невозможно. Укажите площадь в разделе «Комплексы».',
      message_uz: unassigned
        ? "Obyektsiz qoralama: tarif obyektga bog'langandan keyin hisoblanadi. Xarajat va xodimlarni hozir kiritsa bo'ladi."
        : 'Uyning turar joy maydoni kiritilmagan — tarifni hisoblab bo\'lmaydi. «Komplekslar» bo\'limida maydonni kiriting.',
      meta: { residential_area: area, scope_level: building.scope_level },
    });
  }

  // 1) Минимальный тариф по этажности
  const minTariff = getMinTariff(building.floors);
  if (result.tariff_effective > 0 && result.tariff_effective < minTariff) {
    warnings.push({
      code: 'BELOW_MIN_TARIFF',
      severity: 'error',
      message_ru: `Тариф ${result.tariff_effective} сум/м² ниже государственного минимума ${minTariff} сум/м² для ${building.floors ?? '?'}-этажного дома (приказ Минюст №3501).`,
      message_uz: `Tarif ${result.tariff_effective} so'm/m² davlat minimumidan (${minTariff} so'm/m²) past (${building.floors ?? '?'} qavatli uy).`,
      meta: { tariff: result.tariff_effective, min: minTariff, floors: building.floors },
    });
  }

  // 2) Обязательные услуги — проверяем по legal_code в статьях расходов.
  // Старый объединённый код facades_entrances разворачиваем в новые
  // facades+entrances для обратной совместимости.
  const expenseCodes = new Set<string>();
  for (const e of input.expenses) {
    if (!e.legal_code) continue;
    expenseCodes.add(e.legal_code);
    const mapped = LEGACY_SERVICE_CODE_MAP[e.legal_code];
    if (mapped) mapped.forEach(c => expenseCodes.add(c));
  }

  for (const svc of MANDATORY_SERVICES) {
    // Пропускаем условные (лифт/насосы) если соответствующий факт зданию false
    if (svc.conditional === 'has_elevator' && !building.has_elevator) continue;
    if (svc.conditional === 'has_pumps' && !building.has_pumps) continue;
    // Опциональные (гидроизоляция и т.п.) не обязательны — не ругаемся, если нет.
    if (svc.optional) continue;

    if (!expenseCodes.has(svc.code)) {
      warnings.push({
        code: 'MISSING_MANDATORY_SERVICE',
        severity: 'warning',
        message_ru: `В смете нет обязательной услуги: ${svc.label_ru}`,
        message_uz: `Smetada majburiy xizmat yo'q: ${svc.label_uz}`,
        meta: { legal_code: svc.code, label: svc.label_ru },
      });
    }
  }

  // 3) Статьи, требующие решения собрания (ASSEMBLY_DECISION)
  //    Ловим по legal_code — менеджер должен пометить статью решением собрания
  //    (в UI будет отдельный флаг у строки; здесь просто напоминание).
  const assemblyCodes = new Set(SERVICE_STATUS_FLAGS.ASSEMBLY_DECISION as readonly string[]);
  for (const item of input.expenses) {
    if (item.legal_code && assemblyCodes.has(item.legal_code)) {
      warnings.push({
        code: 'REQUIRES_ASSEMBLY_DECISION',
        severity: 'info',
        message_ru: `Статья «${item.name}» требует утверждения общим собранием собственников.`,
        message_uz: `«${item.name}» moddasi umumiy yig'ilish qarori bilan tasdiqlanishi kerak.`,
        meta: { legal_code: item.legal_code, name: item.name },
      });
    }
  }

  // 4) Статьи из группы RISK — предупреждаем что не обязательны
  const riskCodes = new Set(SERVICE_STATUS_FLAGS.RISK as readonly string[]);
  for (const item of input.expenses) {
    if (item.legal_code && riskCodes.has(item.legal_code)) {
      warnings.push({
        code: 'RISK_UNNECESSARY',
        severity: 'warning',
        message_ru: `Статья «${item.name}» не обязательна для жилого МКД по действующим нормам — рассмотрите исключение.`,
        message_uz: `«${item.name}» moddasi yashash MKD uchun majburiy emas — chiqarib tashlashni ko'rib chiqing.`,
        meta: { legal_code: item.legal_code, name: item.name },
      });
    }
  }

  return warnings;
}
