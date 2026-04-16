import { useState, useEffect } from 'react';
import {
  Smartphone, Share, Plus, MoreVertical, Bell, BellRing,
  CheckCircle, Sparkles
} from 'lucide-react';

// Detect platform
function getDevicePlatform(): 'ios' | 'android' | 'desktop' {
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'desktop';
}

function isStandaloneMode(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true;
}

// Role-specific benefit1 text
const ROLE_BENEFIT1: Record<string, { ru: string; uz: string }> = {
  executor:  { ru: 'Мгновенные уведомления о новых заявках прямо в поле', uz: 'Yangi arizalar haqida darhol bildirishnomalar' },
  security:  { ru: 'Уведомления о гостевых пропусках и QR-сканировании',  uz: 'Mehmon ruxsatlari va QR-skanerlash haqida xabarlar' },
  manager:   { ru: 'Срочные уведомления об эскалированных заявках',       uz: 'Muhim arizalar haqida shoshilinch bildirishnomalar' },
  director:  { ru: 'KPI и отчёты в режиме реального времени',             uz: 'KPI va hisobotlar real vaqtda' },
  admin:     { ru: 'Системные оповещения и уведомления о сбоях',          uz: 'Tizim ogohlantirishlari va nosozliklar haqida xabar' },
  dispatcher:{ ru: 'Новые заявки и назначения в реальном времени',        uz: 'Yangi arizalar va tayinlovlar real vaqtda' },
  department_head: { ru: 'Отчёты отдела и срочные задачи',                uz: 'Bo\'lim hisobotlari va shoshilinch vazifalar' },
  resident:  { ru: 'Статус заявок и объявления в реальном времени',       uz: 'Arizalar holati va e\'lonlar real vaqtda' },
};

export function InstallAppSection({ language, roleContext }: { language: string; roleContext?: string }) {
  const platform = getDevicePlatform();
  const isInstalled = isStandaloneMode();
  const [activeTab, setActiveTab] = useState<'ios' | 'android'>(platform === 'ios' ? 'ios' : 'android');
  const [notifPermission, setNotifPermission] = useState<string>('default');

  useEffect(() => {
    if (!('Notification' in window)) return;
    const read = () => setNotifPermission(Notification.permission);
    read();
    // Re-check when tab becomes visible (user may have changed permission in browser settings)
    const onVisibility = () => { if (document.visibilityState === 'visible') read(); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  const handleEnableNotifications = async () => {
    if ('Notification' in window) {
      const permission = await Notification.requestPermission();
      setNotifPermission(permission);
      if (permission === 'granted' && 'serviceWorker' in navigator && 'PushManager' in window) {
        try {
          const { pushNotifications } = await import('../services/pushNotifications');
          await pushNotifications.subscribe();
        } catch {}
      }
    }
  };

  const t = language === 'uz' ? {
    title: 'Ilovani o\'rnatish',
    installed: 'Ilova o\'rnatilgan',
    installedDesc: 'Siz Kamizo dan to\'liq foydalanmoqdasiz.',
    ios: 'iPhone / iPad',
    android: 'Android',
    iosSteps: [
      { icon: Share, text: 'Safari brauzerida pastdagi "Ulashish" tugmasini bosing' },
      { icon: Plus, text: '"Bosh ekranga qo\'shish" ni tanlang' },
      { icon: CheckCircle, text: '"Qo\'shish" ni bosing - tayyor!' },
    ],
    androidSteps: [
      { icon: MoreVertical, text: 'Chrome da yuqoridagi  \u22ee  tugmasini bosing' },
      { icon: Smartphone, text: '"Bosh ekranga qo\'shish" ni tanlang' },
      { icon: CheckCircle, text: '"O\'rnatish" ni bosing - tayyor!' },
    ],
    whyInstall: 'Nima uchun o\'rnatish kerak?',
    benefit1: (roleContext && ROLE_BENEFIT1[roleContext]?.uz) || 'Push-bildirishnomalar real vaqtda',
    benefit2: 'Tezkor ishga tushirish',
    benefit3: 'Bosh ekrandan bir bosishda',
    notifications: 'Bildirishnomalar',
    notifGranted: 'Yoqilgan',
    notifEnable: 'Yoqish',
    notifDenied: 'Bloklangan. Brauzer sozlamalaridan yoqing.',
    notifNote: 'Avval ilovani o\'rnating',
  } : {
    title: 'Установить приложение',
    installed: 'Приложение установлено',
    installedDesc: 'Вы используете Kamizo как полноценное приложение.',
    ios: 'iPhone / iPad',
    android: 'Android',
    iosSteps: [
      { icon: Share, text: 'В Safari нажмите кнопку "Поделиться" внизу экрана' },
      { icon: Plus, text: 'Выберите "На экран «Домой»"' },
      { icon: CheckCircle, text: 'Нажмите "Добавить" - готово!' },
    ],
    androidSteps: [
      { icon: MoreVertical, text: 'В Chrome нажмите  \u22ee  вверху справа' },
      { icon: Smartphone, text: 'Выберите "Установить приложение" или "На главный экран"' },
      { icon: CheckCircle, text: 'Нажмите "Установить" - готово!' },
    ],
    whyInstall: 'Зачем устанавливать?',
    benefit1: (roleContext && ROLE_BENEFIT1[roleContext]?.ru) || 'Push-уведомления в реальном времени',
    benefit2: 'Мгновенный запуск',
    benefit3: 'Одно нажатие с домашнего экрана',
    notifications: 'Уведомления',
    notifGranted: 'Включены',
    notifEnable: 'Включить',
    notifDenied: 'Заблокированы. Включите в настройках браузера.',
    notifNote: 'Сначала установите приложение',
  };

  if (isInstalled) return null;

  return (
    <div className="bg-white rounded-[18px] shadow-[0_2px_10px_rgba(0,0,0,0.06)] overflow-hidden">
      <div className="px-4 pt-4 pb-2">
        <h2 className="text-[15px] font-bold text-gray-900 flex items-center gap-2">
          <Smartphone className="w-4 h-4 text-primary-500" />
          {t.title}
        </h2>
      </div>

      <div className="px-4 pb-4">
        <>
            {/* iOS / Android tab switcher */}
            <div className="flex gap-1 p-1 bg-gray-100 rounded-[10px] mb-3">
              <button
                onClick={() => setActiveTab('ios')}
                className={`flex-1 py-2 rounded-[8px] text-[13px] font-semibold transition-all touch-manipulation ${
                  activeTab === 'ios'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 active:bg-gray-200'
                }`}
              >
                {t.ios}
              </button>
              <button
                onClick={() => setActiveTab('android')}
                className={`flex-1 py-2 rounded-[8px] text-[13px] font-semibold transition-all touch-manipulation ${
                  activeTab === 'android'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 active:bg-gray-200'
                }`}
              >
                {t.android}
              </button>
            </div>

            {/* Step-by-step instructions */}
            <div className="space-y-2">
              {(activeTab === 'ios' ? t.iosSteps : t.androidSteps).map((step, i) => (
                <div key={i} className="flex items-center gap-3 p-2.5 bg-gray-50 rounded-[12px]">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ background: 'linear-gradient(135deg, rgba(var(--brand-rgb), 0.15), rgba(var(--brand-rgb), 0.05))' }}
                  >
                    <step.icon className="w-4 h-4 text-primary-500" />
                  </div>
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span
                      className="w-5 h-5 rounded-full text-xs font-bold flex items-center justify-center flex-shrink-0 text-white"
                      style={{ background: 'rgb(var(--brand-rgb))' }}
                    >
                      {i + 1}
                    </span>
                    <span className="text-[13px] text-gray-700 leading-tight">{step.text}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Benefits */}
            <div className="mt-3 p-3 rounded-[12px]" style={{ background: 'linear-gradient(135deg, rgba(var(--brand-rgb), 0.08), rgba(var(--brand-rgb), 0.03))' }}>
              <p className="text-[12px] font-semibold text-primary-700 mb-1.5">{t.whyInstall}</p>
              <div className="space-y-1">
                <p className="text-[12px] text-primary-600 flex items-center gap-1.5">
                  <BellRing className="w-3.5 h-3.5 flex-shrink-0" /> {t.benefit1}
                </p>
                <p className="text-[12px] text-primary-600 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 flex-shrink-0" /> {t.benefit2}
                </p>
                <p className="text-[12px] text-primary-600 flex items-center gap-1.5">
                  <Smartphone className="w-3.5 h-3.5 flex-shrink-0" /> {t.benefit3}
                </p>
              </div>
            </div>
        </>

        {/* Notification status & toggle */}
        <div className="mt-3 pt-3 border-t border-gray-100">
          <div className="flex items-center justify-between min-h-[36px]">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-gray-400" />
              <span className="text-[13px] font-medium text-gray-700">{t.notifications}</span>
            </div>
            {notifPermission === 'granted' ? (
              <span className="text-[12px] text-green-600 font-semibold flex items-center gap-1 px-2.5 py-1 bg-green-50 rounded-full">
                <CheckCircle className="w-3.5 h-3.5" /> {t.notifGranted}
              </span>
            ) : notifPermission === 'denied' ? (
              <span className="text-xs text-red-500 text-right max-w-[180px]">{t.notifDenied}</span>
            ) : platform === 'ios' && !isInstalled ? (
              <span className="text-xs text-amber-600 font-medium">{t.notifNote}</span>
            ) : (
              <button
                onClick={handleEnableNotifications}
                className="px-3.5 py-1.5 text-white text-[12px] font-semibold rounded-full active:opacity-80 transition-all touch-manipulation shadow-sm"
                style={{ background: 'rgb(var(--brand-rgb))' }}
              >
                {t.notifEnable}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
