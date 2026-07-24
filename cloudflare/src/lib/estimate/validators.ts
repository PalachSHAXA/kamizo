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
  getMinTariff,
} from './legal-constants';

export type WarningSeverity = 'error' | 'warning' | 'info';

export interface EstimateWarning {
  code: 'BELOW_MIN_TARIFF' | 'MISSING_MANDATORY_SERVICE' | 'REQUIRES_ASSEMBLY_DECISION' | 'RISK_UNNECESSARY';
  severity: WarningSeverity;
  message_ru: string;
  message_uz: string;
  meta?: Record<string, unknown>;
}

export interface BuildingFacts {
  floors?: number;
  has_elevator?: boolean;
  has_pumps?: boolean;
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

  // 2) Обязательные 16 услуг — проверяем по legal_code в статьях расходов
  const expenseCodes = new Set(
    input.expenses
      .map(e => e.legal_code)
      .filter((c): c is string => !!c)
  );

  for (const svc of MANDATORY_SERVICES) {
    // Пропускаем условные (лифт/насосы) если соответствующий факт зданию false
    if (svc.conditional === 'has_elevator' && !building.has_elevator) continue;
    if (svc.conditional === 'has_pumps' && !building.has_pumps) continue;

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
