/**
 * Правовые константы для расчёта смет ЖКХ (Узбекистан).
 *
 * Источники (проверять при каждой ревизии):
 *   - Приказ Минюст №3501 «Мин. тариф» (ставки с 01.05.2024) — lex.uz/docs/6840346
 *   - ЗРУ-581 «Об управлении МКД» (07.11.2019) — lex.uz/acts/4586287 (ст.16, 21, 22, 28, 29)
 *   - ПКМ №930 (21.11.2019) — тревожная кнопка НЕ обязательна для жилых МКД
 *
 * Ревизия: 2026-Q3 (обновить когда Минюст выпустит новую редакцию).
 * Меняется коммитом + деплоем — админ-панели для редактирования нет
 * (обосновано в плане: правовые нормы меняются реже раза в квартал).
 */

/**
 * Минимальный тариф жилого м² по этажности здания (Ташкент).
 * Источник: приказ Минюст №3501, приложение по ставкам.
 * Ключ 'default' используется когда floors неизвестен.
 * '10plus' покрывает 10+ этажей.
 */
export const TASHKENT_MIN_TARIFF: Record<string, number> = {
  '2': 1148,
  '3': 1304,
  '4': 1516,
  '5': 1513,
  '6': 1711,
  '7': 1706,
  '8': 1704,
  '9': 1703,
  '10plus': 1829,
  default: 1148, // консервативный минимум если floors не задан
};

/** Получить min тариф по этажности здания. */
export function getMinTariff(floors: number | undefined | null): number {
  if (!floors || floors < 2) return TASHKENT_MIN_TARIFF.default;
  if (floors >= 10) return TASHKENT_MIN_TARIFF['10plus'];
  return TASHKENT_MIN_TARIFF[String(floors)] ?? TASHKENT_MIN_TARIFF.default;
}

/**
 * 16 обязательных услуг (смета обязана их покрывать) — §3.2 ТЗ.
 * legal_code проставляется на finance_estimate_items для машинной проверки.
 * label — читаемое имя для UI (ru).
 * conditional — код проверяется только когда флаг true в объекте
 *   (например electricity_common всегда обязателен; elevator_if_present —
 *    только когда buildings.has_elevator = 1).
 */
export interface MandatoryService {
  code: string;
  label_ru: string;
  label_uz: string;
  conditional?: 'has_elevator' | 'has_pumps';
}

export const MANDATORY_SERVICES: MandatoryService[] = [
  { code: 'electricity_common', label_ru: 'Электроснабжение МОП', label_uz: 'Umumiy joylar elektri' },
  { code: 'elevator_if_present', label_ru: 'Обслуживание лифта', label_uz: 'Lift xizmati', conditional: 'has_elevator' },
  { code: 'facades_entrances', label_ru: 'Фасады и подъезды', label_uz: 'Fasadlar va podyezdlar' },
  { code: 'pumps_if_present', label_ru: 'Насосное оборудование', label_uz: 'Nasos uskunasi', conditional: 'has_pumps' },
  { code: 'roof_waterproofing', label_ru: 'Гидроизоляция кровли', label_uz: 'Tom gidroizolyatsiyasi' },
  { code: 'basement_shaft_networks', label_ru: 'Сети подвала/шахты', label_uz: 'Yerto\'la/shaxta tarmoqlari' },
  { code: 'gutters', label_ru: 'Водостоки', label_uz: 'Suv oqizgichlar' },
  { code: 'stairwell_lift_cleaning_weekly', label_ru: 'Уборка подъездов/лифтов (≥1/нед)', label_uz: 'Podyezd/lift tozalash (haftada 1)' },
  { code: 'territory_cleaning', label_ru: 'Уборка территории', label_uz: 'Hudud tozaligi' },
  { code: 'sanitation_disinfection', label_ru: 'Санитария и дезинфекция', label_uz: 'Sanitariya va dezinfektsiya' },
  { code: 'fire_safety', label_ru: 'Пожарная безопасность', label_uz: 'Yong\'in xavfsizligi' },
  { code: 'heating_season_prep', label_ru: 'Подготовка к отопительному сезону', label_uz: 'Isitish mavsumiga tayyorgarlik' },
  { code: 'greenery', label_ru: 'Озеленение', label_uz: 'Ko\'kalamzorlashtirish' },
  { code: 'playgrounds', label_ru: 'Детские площадки', label_uz: 'Bolalar maydonchalari' },
  { code: 'paths_parking', label_ru: 'Дорожки и парковка', label_uz: 'Yo\'laklar va avtoturargoh' },
  { code: 'cctv_intercom_dispatch', label_ru: 'Видеонаблюдение/домофон + диспетчер 24/7', label_uz: 'Videokuzatuv/domofon + dispetcher 24/7' },
];

/**
 * Статусные флаги — §3.3 ТЗ.
 * MANDATORY — включать всегда, без обсуждения.
 * ASSEMBLY_DECISION — только при явном решении общего собрания собственников.
 * RISK — включать НЕ рекомендуется (пример: тревожная кнопка Миллий Гвардия
 * для жилого МКД не обязательна per ПКМ №930, но иногда включают ошибочно).
 */
export const SERVICE_STATUS_FLAGS = {
  MANDATORY: [
    'elevator_service_annual_inspection',
    'cleaning',
    'disinfection',
    'waste_removal',
    'dispatch_24_7',
    'social_tax',
  ],
  ASSEMBLY_DECISION: [
    'security_guard',
    'concierge',
    'reserve_fund',
    'company_service_organization',
  ],
  RISK: [
    'milliy_gvardiya_panic_button_for_residential_MKD',
  ],
} as const;

export type ServiceStatusFlag = keyof typeof SERVICE_STATUS_FLAGS;
