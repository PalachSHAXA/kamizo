import { useRef } from 'react';
import { Lock, Sparkles, ArrowUpRight, MessageCircle, Phone } from 'lucide-react';
import { useLanguageStore } from '../stores/languageStore';
import { useTenantStore } from '../stores/tenantStore';
import { useAuthStore } from '../stores/authStore';
import { useModalPresence } from '../stores/modalStore';

// Один источник истины для sales-контакта. Меняется в одном месте.
const SALES_EMAIL = 'sales@kamizo.uz';

// Feature registry: key → { name, description, plan }.
// plan значения выровнены с PLAN_FEATURES в admin/components/types.ts —
// показываем минимальный тариф, в котором эта фича появляется.
const FEATURE_REGISTRY: Record<string, { ru: { name: string; desc: string }; uz: { name: string; desc: string }; plan: string }> = {
  // ── Basic-фичи (доступны на всех тарифах) ─────────────────────
  qr: {
    ru: { name: 'QR-доступ', desc: 'Пропуска для гостей по QR-коду' },
    uz: { name: 'QR-o\'tish', desc: 'Mehmonlar uchun QR-kod bo\'yicha o\'tkazmalar' },
    plan: 'Basic',
  },
  notepad: {
    ru: { name: 'Заметки', desc: 'Личные заметки и напоминания' },
    uz: { name: 'Yozuvlar', desc: 'Shaxsiy yozuvlar va eslatmalar' },
    plan: 'Basic',
  },

  // ── Pro-фичи ───────────────────────────────────────────────────
  marketplace: {
    ru: { name: 'Маркет УК', desc: 'Заказывайте товары для дома с быстрой доставкой прямо в приложении' },
    uz: { name: 'BK marketi', desc: 'Uyga tovarlarni tez yetkazib berish bilan ilovadan to\'g\'ridan-to\'g\'ri buyurtma qiling' },
    plan: 'Pro',
  },
  chat: {
    ru: { name: 'Чат', desc: 'Общение с управляющей компанией в реальном времени' },
    uz: { name: 'Chat', desc: 'Boshqarish kompaniyasi bilan real vaqtda muloqot' },
    plan: 'Pro',
  },
  meetings: {
    ru: { name: 'Собрания жильцов', desc: 'Онлайн-голосования и протоколы собраний жильцов' },
    uz: { name: 'Uy egalari yig\'ilishlari', desc: 'Onlayn ovoz berish va uy egalari yig\'ilishlari bayonnomalari' },
    plan: 'Pro',
  },
  announcements: {
    ru: { name: 'Объявления', desc: 'Новости и объявления от управляющей компании' },
    uz: { name: 'E\'lonlar', desc: 'Boshqaruv kompaniyasidan yangiliklar va e\'lonlar' },
    plan: 'Pro',
  },
  vehicles: {
    ru: { name: 'Транспорт', desc: 'Учёт автомобилей жильцов и парковочных мест' },
    uz: { name: 'Transport', desc: 'Yashovchilarning avtomobillari va turargohlarni hisobga olish' },
    plan: 'Pro',
  },
  'useful-contacts': {
    ru: { name: 'Полезное рядом', desc: 'Аптеки, магазины и сервисы вашего района' },
    uz: { name: 'Foydali xizmatlar', desc: 'Yaqin atrofdagi dorixona, do\'kon va xizmatlar' },
    plan: 'Pro',
  },
  communal: {
    ru: { name: 'Коммунальные платежи', desc: 'Показания счётчиков и квитанции' },
    uz: { name: 'Kommunal to\'lovlar', desc: 'Hisoblagichlar ko\'rsatkichlari va kvitansiyalar' },
    plan: 'Pro',
  },
  reports: {
    ru: { name: 'Отчёты', desc: 'Аналитика по заявкам, платежам и работе УК' },
    uz: { name: 'Hisobotlar', desc: 'Arizalar, to\'lovlar va boshqaruv ishi bo\'yicha analitika' },
    plan: 'Pro',
  },

  // ── Enterprise-фичи ───────────────────────────────────────────
  rentals: {
    ru: { name: 'Договоры краткосрочной аренды', desc: 'Посуточная аренда: гости, паспорта, платежи и история заездов' },
    uz: { name: 'Qisqa muddatli ijara shartnomalari', desc: 'Kunlik ijara: mehmonlar, pasport, to\'lovlar va kirish tarixi' },
    plan: 'Enterprise',
  },
  trainings: {
    ru: { name: 'Обучение сотрудников', desc: 'Онлайн-курсы и тренинги для вашей команды' },
    uz: { name: 'Xodimlarni o\'qitish', desc: 'Jamoangiz uchun onlayn kurslar va treninglar' },
    plan: 'Enterprise',
  },
  colleagues: {
    ru: { name: 'Сотрудники', desc: 'Управление командой и правами доступа' },
    uz: { name: 'Xodimlar', desc: 'Jamoani va kirish huquqlarini boshqarish' },
    plan: 'Enterprise',
  },
  advertiser: {
    ru: { name: 'Реклама', desc: 'Размещение рекламы для локального бизнеса' },
    uz: { name: 'Reklama', desc: 'Mahalliy biznes uchun reklama joylashtirish' },
    plan: 'Enterprise',
  },
};

const PLAN_COLORS: Record<string, string> = {
  Basic: 'from-slate-500 to-slate-600',
  Pro: 'from-violet-500 to-purple-600',
  Enterprise: 'from-amber-500 to-orange-600',
};

const PLAN_BADGE_COLORS: Record<string, string> = {
  Basic: 'bg-slate-100 text-slate-700',
  Pro: 'bg-violet-100 text-violet-700',
  Enterprise: 'bg-amber-100 text-amber-700',
};

interface FeatureLockedModalProps {
  isOpen: boolean;
  onClose: () => void;
  featureName?: string;
  featureKey?: string;
}

export function FeatureLockedModal({ isOpen, onClose, featureName, featureKey }: FeatureLockedModalProps) {
  // Hide the global BottomBar while open (shared modal-presence registry).
  useModalPresence(isOpen);

  const { language } = useLanguageStore();
  const { config } = useTenantStore();
  const { user } = useAuthStore();
  const tenantName = config?.tenant?.name || 'УК';
  const tenantPhone = config?.tenant?.admin_phone || null;
  const hasChatFeature = config?.features.includes('chat') ?? false;
  const swipeRef = useRef<{ startY: number; startX: number } | null>(null);

  if (!isOpen) return null;

  const t = (ru: string, uz: string) => language === 'ru' ? ru : uz;

  const handleTouchStart = (e: React.TouchEvent) => {
    swipeRef.current = { startY: e.touches[0].clientY, startX: e.touches[0].clientX };
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!swipeRef.current) return;
    const diffY = e.changedTouches[0].clientY - swipeRef.current.startY;
    const diffX = Math.abs(e.changedTouches[0].clientX - swipeRef.current.startX);
    if (diffY > 60 && diffX < diffY) {
      onClose();
    }
    swipeRef.current = null;
  };

  const isResidentRole = user?.role === 'resident' || user?.role === 'tenant' || user?.role === 'commercial_owner';
  const isAdminRole = ['director', 'admin', 'manager', 'department_head'].includes(user?.role || '');

  // Look up feature info from registry
  const registryEntry = featureKey ? FEATURE_REGISTRY[featureKey] : null;
  const featureInfo = registryEntry
    ? { name: language === 'ru' ? registryEntry.ru.name : registryEntry.uz.name, desc: language === 'ru' ? registryEntry.ru.desc : registryEntry.uz.desc, plan: registryEntry.plan }
    : null;

  const displayName = featureInfo?.name || featureName || t('Функция', 'Funksiya');
  const plan = featureInfo?.plan;
  const gradientClass = plan ? (PLAN_COLORS[plan] || PLAN_COLORS.Pro) : null;
  const badgeClass = plan ? (PLAN_BADGE_COLORS[plan] || PLAN_BADGE_COLORS.Pro) : null;

  // Резидентский CTA: чат → tel → nothing.
  const residentCta: 'chat' | 'phone' | null =
    hasChatFeature ? 'chat' : (tenantPhone ? 'phone' : null);

  const handleContactUK = () => {
    onClose();
    if (residentCta === 'chat') {
      window.location.hash = '/chat';
    } else if (residentCta === 'phone' && tenantPhone) {
      window.location.href = `tel:${tenantPhone}`;
    }
  };

  // Админский CTA: mailto с готовым письмом. Открывается почтовый
  // клиент (нативный mail, gmail в вебе, etc.) с заполненным to/subject/body.
  const mailtoUpgrade = (() => {
    if (!featureInfo) return null;
    const subject = `Подключение раздела «${featureInfo.name}»`;
    const body =
      `Здравствуйте!\n\n` +
      `Компания: ${tenantName}\n` +
      `Хотим подключить раздел «${featureInfo.name}» (тариф ${featureInfo.plan}).\n\n` +
      `Свяжитесь с нами.`;
    return `mailto:${SALES_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  })();

  return (
    <div
      className="fixed inset-0 bg-black/40 z-[110] flex items-end sm:items-center justify-center"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-[400px] bg-white rounded-t-[24px] sm:rounded-[24px] overflow-hidden shadow-2xl animate-[slide-up_0.25s_ease-out]"
        onClick={e => e.stopPropagation()}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        style={{ paddingBottom: 'max(0px, env(safe-area-inset-bottom, 0px))' }}
      >
        {/* Gradient header */}
        {gradientClass ? (
          <div className={`bg-gradient-to-br ${gradientClass} px-6 pt-6 pb-5`}>
            {/* Handle (mobile) */}
            <div className="flex justify-center mb-4 sm:hidden">
              <div className="w-10 h-1 rounded-full bg-white/30" />
            </div>
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center flex-shrink-0">
                <Sparkles className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <div className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold mb-2 ${badgeClass} bg-white/20 text-white`}>
                  <Sparkles className="w-3 h-3" />
                  {t(`Доступно на плане ${plan}`, `${plan} rejasida mavjud`)}
                </div>
                <h3 className="text-[18px] font-bold text-white leading-tight">{displayName}</h3>
              </div>
            </div>
          </div>
        ) : (
          <div className="px-6 pt-6 pb-4">
            {/* Handle (mobile) */}
            <div className="flex justify-center mb-4 sm:hidden">
              <div className="w-10 h-1 rounded-full bg-gray-200" />
            </div>
            <div className="flex justify-center mb-4">
              <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center">
                <Lock className="w-7 h-7 text-gray-400" />
              </div>
            </div>
            <h3 className="text-[18px] font-bold text-gray-900 text-center">{displayName}</h3>
          </div>
        )}

        {/* Body */}
        <div className="px-6 py-4">
          {featureInfo?.desc ? (
            <p className="text-[14px] text-gray-600 leading-relaxed mb-5">{featureInfo.desc}</p>
          ) : (
            <p className="text-[14px] text-gray-500 text-center leading-relaxed mb-5">
              {t(
                `Эта функция ещё не активирована для вашего дома. Обратитесь к ${tenantName} для подключения.`,
                `Bu funksiya sizning uyingiz uchun hali faollashtirilmagan. Ulash uchun ${tenantName}ga murojaat qiling.`
              )}
            </p>
          )}

          {/* CTA buttons */}
          <div className="flex flex-col gap-2.5 pb-2">
            {isResidentRole && featureInfo && residentCta && (
              <>
                <p className="text-[12px] text-gray-400 text-center -mb-1">
                  {t(`Попросите ${tenantName} повысить план`, `${tenantName}dan rejani yangilashni so'rang`)}
                </p>
                <button
                  onClick={handleContactUK}
                  className="w-full py-3.5 bg-primary-500 text-white font-semibold rounded-[14px] flex items-center justify-center gap-2 active:scale-[0.97] transition-all touch-manipulation"
                >
                  {residentCta === 'chat' ? (
                    <>
                      <MessageCircle className="w-4 h-4" />
                      {t('Написать в УК', 'UK ga yozish')}
                    </>
                  ) : (
                    <>
                      <Phone className="w-4 h-4" />
                      {t('Позвонить в УК', 'UKga qo\'ng\'iroq qilish')}
                    </>
                  )}
                </button>
              </>
            )}

            {isAdminRole && featureInfo && mailtoUpgrade && (
              <a
                href={mailtoUpgrade}
                onClick={onClose}
                className={`w-full py-3.5 bg-gradient-to-r ${gradientClass || 'from-primary-500 to-primary-600'} text-white font-semibold rounded-[14px] flex items-center justify-center gap-2 active:scale-[0.97] transition-all touch-manipulation`}
              >
                <Sparkles className="w-4 h-4" />
                {t('Повысить план', 'Rejani yangilash')}
                <ArrowUpRight className="w-4 h-4" />
              </a>
            )}

            <button
              onClick={onClose}
              className="w-full py-3 bg-gray-100 text-gray-600 font-medium rounded-[14px] active:scale-[0.97] transition-all touch-manipulation text-[14px]"
            >
              {t('Закрыть', 'Yopish')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
