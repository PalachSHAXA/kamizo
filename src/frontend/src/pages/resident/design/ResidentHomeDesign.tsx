/* Resident home — ported 1:1 from Claude Design §01-glavnaya (kamizo-home.jsx).
   Verbatim structure/styles from the mockup; the dynamic parts (name, address,
   active count, swipe cards, approval, reschedule, meeting, announcements) are
   wired to real data via props. Includes the design's own floating TabBar — the
   global BottomBar is hidden for residents on this screen to avoid a double nav. */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  IBell, IPin, IWrench, IQR, ICard, ICar, ILock, ICheck, IClock, IChevronR,
  IUsers, IBolt, IUmbrella, IDownload, IHome, IDoc, IChat, IUser, IPlus, IStar, IPhone,
  SwipeCardStack,
} from './kamizoDesign';

const ru = (language: string, r: string, u: string) => (language === 'ru' ? r : u);

function HomeHero({ name, apt, activeCount, language, onMenu, onBell, bellOpen, unread }: any) {
  return (
    <div style={{ position: 'relative', background: 'linear-gradient(160deg, #4A3B30 0%, #34291F 55%, #2A2018 100%)', borderRadius: '0 0 28px 28px', padding: '52px 18px 26px', overflow: 'hidden', color: 'var(--text-on-dark)' }}>
      <div style={{ position: 'absolute', inset: 0, opacity: 0.55, background: 'radial-gradient(90% 70% at 88% -10%, rgba(251,146,60,0.5) 0%, transparent 55%), radial-gradient(70% 60% at 0% 110%, rgba(217,119,6,0.18) 0%, transparent 60%)' }} />
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
        <button onClick={onMenu} style={{ width: 44, height: 44, borderRadius: 14, background: 'rgba(244,240,232,0.12)', border: '1px solid rgba(244,240,232,0.14)', display: 'grid', placeItems: 'center', cursor: 'pointer' }} aria-label="Меню">
          <svg width="22" height="15" viewBox="0 0 22 15"><rect y="0" width="22" height="3" rx="1.5" fill="#FDBA74"/><rect y="6" width="15" height="3" rx="1.5" fill="#FDBA74"/><rect y="12" width="22" height="3" rx="1.5" fill="#FDBA74"/></svg>
        </button>
        <button onClick={onBell} style={{ position: 'relative', width: 44, height: 44, borderRadius: 14, background: bellOpen ? 'var(--brand)' : 'rgba(244,240,232,0.12)', border: '1px solid rgba(244,240,232,0.14)', display: 'grid', placeItems: 'center', cursor: 'pointer', color: bellOpen ? '#fff' : 'var(--text-on-dark)' }} aria-label="Уведомления">
          <IBell size={20} />
          {unread > 0 && <span style={{ position: 'absolute', top: 8, right: 9, minWidth: 16, height: 16, padding: '0 4px', borderRadius: 999, background: 'var(--status-critical)', color: '#fff', fontSize: 10, fontWeight: 800, display: 'grid', placeItems: 'center', border: '2px solid #34291F' }}>{unread}</span>}
        </button>
      </div>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 14 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'rgba(244,240,232,0.7)' }}>{ru(language, 'Добрый день', 'Hayrli kun')} 👋</div>
          <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.05, marginTop: 3 }}>{name}</div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, marginTop: 14, padding: '8px 13px', background: 'rgba(244,240,232,0.12)', border: '1px solid rgba(244,240,232,0.14)', backdropFilter: 'blur(8px)', borderRadius: 13, fontSize: 13.5, fontWeight: 600, color: 'var(--text-on-dark)' }}>
            <IPin size={15} style={{ color: 'var(--brand-light)' }} />{apt}
          </div>
        </div>
        <div style={{ flex: '0 0 auto', padding: '8px 12px', borderRadius: 13, background: 'rgba(249,115,22,0.18)', border: '1px solid rgba(249,115,22,0.3)', textAlign: 'center' }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#FDBA74', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{activeCount}</div>
          <div style={{ fontSize: 10.5, fontWeight: 600, color: 'rgba(244,240,232,0.7)', marginTop: 3 }}>{ru(language, 'активные', 'faol')}<br/>{ru(language, 'заявки', 'arizalar')}</div>
        </div>
      </div>
    </div>
  );
}

function QuickTiles({ onNewRequest, navigate, language }: any) {
  const tiles = [
    { Icon: IWrench, label: ru(language, 'Заявка', 'Ariza'), onClick: onNewRequest },
    { Icon: IQR, label: ru(language, 'Пропуск', 'Ruxsat'), onClick: () => navigate('/guest-access') },
    { Icon: ICard, label: ru(language, 'Оплата', 'To\'lov'), soon: true },
    { Icon: ICar, label: ru(language, 'Авто', 'Avto'), onClick: () => navigate('/vehicles') },
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
      {tiles.map((t, i) => (
        <button key={i} onClick={t.onClick} style={{ position: 'relative', background: 'var(--surface)', border: '1px solid var(--border-c)', borderRadius: 20, padding: '14px 8px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, cursor: 'pointer', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ width: 46, height: 46, borderRadius: 999, background: 'var(--brand-tint)', color: 'var(--brand-dark)', display: 'grid', placeItems: 'center' }}><t.Icon size={22} stroke={1.9} /></div>
          <span style={{ fontSize: 12.5, fontWeight: 650, color: 'var(--text-primary)' }}>{t.label}</span>
          {t.soon && <span style={{ position: 'absolute', top: 12, right: 12, color: 'var(--text-muted)' }}><ILock size={12} /></span>}
        </button>
      ))}
    </div>
  );
}

function ApprovalCard({ req, language, onApprove, onDetails }: any) {
  return (
    <div style={{ background: 'linear-gradient(135deg, #FFF3EA 0%, #FFE6D2 100%)', border: '1px solid var(--brand-200)', borderRadius: 20, padding: 16, boxShadow: 'var(--shadow-sm)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ width: 44, height: 44, borderRadius: 13, background: '#fff', color: 'var(--brand-dark)', display: 'grid', placeItems: 'center', flex: '0 0 auto', boxShadow: '0 0 0 4px rgba(249,115,22,0.12)' }}><ICheck size={22} stroke={2.4} /></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: '0.04em', color: 'var(--brand-dark)', textTransform: 'uppercase' }}>{ru(language, 'Ждёт вашей оценки', 'Bahoyingiz kutilmoqda')}</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginTop: 2 }}>{req.title} · #{req.number}</div>
          {req.executorName && <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>{req.executorName}</div>}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button onClick={onApprove} style={{ flex: 1, padding: 12, borderRadius: 14, background: 'var(--brand)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 700, boxShadow: 'var(--sh-brand)' }}>{ru(language, 'Принять работу', 'Ishni qabul qilish')}</button>
        <button onClick={onDetails} style={{ padding: '12px 16px', borderRadius: 14, background: 'var(--surface)', color: 'var(--text-primary)', border: '1px solid var(--border-c)', cursor: 'pointer', fontSize: 14, fontWeight: 650 }}>{ru(language, 'Подробнее', 'Batafsil')}</button>
      </div>
    </div>
  );
}

function MeetingWidget({ meeting, language, onOpen }: any) {
  return (
    <button onClick={onOpen} style={{ width: '100%', textAlign: 'left', background: 'var(--surface)', border: '1px solid var(--border-c)', borderRadius: 20, padding: 16, cursor: 'pointer', boxShadow: 'var(--shadow-sm)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 10.5, fontWeight: 800, letterSpacing: '0.04em', padding: '4px 9px', borderRadius: 999, background: 'var(--status-active-bg)', color: 'var(--status-active)', textTransform: 'uppercase' }}>
          <span style={{ width: 6, height: 6, borderRadius: 999, background: 'var(--status-active)' }} />{ru(language, 'Голосование', 'Ovoz berish')}
        </span>
        <IUsers size={18} style={{ marginLeft: 'auto', color: 'var(--text-muted)' }} />
      </div>
      <div style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.25 }}>{meeting.title || ru(language, 'Собрание жильцов', 'Yig\'ilish')}</div>
      <div style={{ marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13, fontWeight: 700, color: 'var(--brand-dark)' }}>{ru(language, 'Перейти к голосованию', 'Ovoz berishga')} <IChevronR size={16} /></div>
    </button>
  );
}

function BalanceCard({ language }: any) {
  const month = new Date().toLocaleDateString(language === 'ru' ? 'ru-RU' : 'uz-UZ', { month: 'long' });
  return (
    <div style={{ background: 'var(--dark-surface)', borderRadius: 20, padding: 18, color: 'var(--text-on-dark)', position: 'relative', overflow: 'hidden', boxShadow: 'var(--shadow-md)' }}>
      <div style={{ position: 'absolute', right: -30, top: -30, width: 130, height: 130, borderRadius: 999, background: 'rgba(249,115,22,0.16)' }} />
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.04em', color: 'rgba(244,240,232,0.6)', textTransform: 'uppercase' }}>{ru(language, `Оплата ЖКУ · ${month}`, `To'lov · ${month}`)}</div>
        <span style={{ fontSize: 10.5, fontWeight: 800, padding: '3px 9px', borderRadius: 999, background: 'rgba(244,240,232,0.12)', color: 'rgba(244,240,232,0.8)', textTransform: 'uppercase' }}>{ru(language, 'Скоро', 'Tez')}</span>
      </div>
      <div style={{ position: 'relative', fontSize: 13.5, color: 'rgba(244,240,232,0.7)', marginTop: 12 }}>{ru(language, 'Онлайн-оплата и счётчики — в разработке', 'Onlayn to\'lov — ishlanmoqda')}</div>
      <button disabled style={{ position: 'relative', width: '100%', marginTop: 14, padding: 12, borderRadius: 14, border: 'none', cursor: 'not-allowed', background: 'var(--brand)', color: '#fff', fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: 0.6 }}>
        {ru(language, 'Оплатить онлайн', 'Onlayn to\'lash')} <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 7px', borderRadius: 999, background: 'rgba(255,255,255,0.25)' }}>{ru(language, 'СКОРО', 'TEZ')}</span>
      </button>
    </div>
  );
}

function AnnMini({ items, language, onOpen }: any) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border-c)', borderRadius: 20, boxShadow: 'var(--shadow-sm)', overflow: 'hidden' }}>
      {items.slice(0, 2).map((a: any, i: number) => {
        const urgent = a.priority === 'urgent';
        const time = a.createdAt ? new Date(a.createdAt).toLocaleDateString(language === 'ru' ? 'ru-RU' : 'uz-UZ', { day: 'numeric', month: 'short' }) : '';
        return (
          <button key={a.id || i} onClick={onOpen} style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12, padding: '13px 14px', border: 'none', background: 'transparent', cursor: 'pointer', borderBottom: i < Math.min(items.length, 2) - 1 ? '1px solid var(--hairline)' : 'none' }}>
            <div style={{ width: 38, height: 38, borderRadius: 11, background: urgent ? 'var(--status-critical-bg)' : 'var(--status-info-bg)', color: urgent ? 'var(--status-critical)' : 'var(--status-info)', display: 'grid', placeItems: 'center', flex: '0 0 auto' }}>{urgent ? <IBolt size={18} /> : <IUmbrella size={18} />}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 650, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.title}</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 1 }}>{time}{urgent ? ru(language, ' · срочно', ' · shoshilinch') : ''}</div>
            </div>
            <IChevronR size={16} style={{ color: 'var(--text-muted)' }} />
          </button>
        );
      })}
    </div>
  );
}

function PWABanner({ language }: any) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 20, background: 'var(--surface-2)', border: '1px dashed var(--border-strong)' }}>
      <div style={{ width: 38, height: 38, borderRadius: 11, background: 'var(--brand-tint)', color: 'var(--brand-dark)', display: 'grid', placeItems: 'center', flex: '0 0 auto' }}><IDownload size={18} /></div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700 }}>{ru(language, 'Установите Kamizo на экран', 'Kamizo\'ni ekranga o\'rnating')}</div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{ru(language, 'Быстрый доступ как у приложения', 'Ilovadek tez kirish')}</div>
      </div>
    </div>
  );
}

function TabBar({ navigate, onNewRequest, onTab, language }: any) {
  const left = [{ id: 'home', Icon: IHome, label: ru(language, 'Главная', 'Bosh'), active: true, onClick: () => onTab('home') }, { id: 'requests', Icon: IDoc, label: ru(language, 'Заявки', 'Arizalar'), onClick: () => onTab('requests') }];
  const right = [{ id: 'chat', Icon: IChat, label: ru(language, 'Чат', 'Chat'), onClick: () => navigate('/chat') }, { id: 'profile', Icon: IUser, label: ru(language, 'Профиль', 'Profil'), onClick: () => navigate('/profile') }];
  const item = (t: any) => (
    <button key={t.id} onClick={t.onClick} style={{ background: t.active ? 'var(--brand-tint)' : 'transparent', border: 'none', cursor: 'pointer', borderRadius: 999, display: 'flex', alignItems: 'center', gap: 7, padding: t.active ? '9px 15px' : '9px 11px', color: t.active ? 'var(--brand-dark)' : 'var(--text-muted)' }}>
      <t.Icon size={22} stroke={t.active ? 2.3 : 1.9} />{t.active && <span style={{ fontSize: 13, fontWeight: 750, whiteSpace: 'nowrap' }}>{t.label}</span>}
    </button>
  );
  return (
    <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 40, padding: '0 14px calc(14px + env(safe-area-inset-bottom))', pointerEvents: 'none' }}>
      <div style={{ pointerEvents: 'auto', maxWidth: 480, margin: '0 auto', background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(16px) saturate(180%)', WebkitBackdropFilter: 'blur(16px) saturate(180%)', border: '1px solid rgba(255,255,255,0.7)', borderRadius: 26, boxShadow: '0 10px 30px rgba(28,25,23,0.14), 0 2px 6px rgba(28,25,23,0.06)', padding: '8px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>{left.map(item)}</div>
        <button onClick={onNewRequest} aria-label={ru(language, 'Новая заявка', 'Yangi ariza')} style={{ width: 52, height: 52, borderRadius: 999, flex: '0 0 auto', background: 'linear-gradient(135deg, #FB923C, #EA580C)', border: 'none', cursor: 'pointer', display: 'grid', placeItems: 'center', color: '#fff', boxShadow: '0 6px 16px rgba(249,115,22,0.45)' }}><IPlus size={25} stroke={2.6} /></button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>{right.map(item)}</div>
      </div>
    </div>
  );
}

interface Props {
  language: string;
  name: string;
  apt: string;
  activeCount: number;
  pendingApproval: any[];
  pendingReschedules: any[];
  meeting: any | null;
  announcements: any[];
  unread?: number;
  onNewRequest: () => void;
  onTab: (tab: 'home' | 'requests') => void;
  onMenu: () => void;
  onApprove: (req: any) => void;
  onOpenRequest: (req: any) => void;
}

export function ResidentHomeDesign(props: Props) {
  const { language, name, apt, activeCount, pendingApproval, pendingReschedules, meeting, announcements, unread = 0, onNewRequest, onTab, onMenu, onApprove, onOpenRequest } = props;
  const navigate = useNavigate();
  const [bell, setBell] = useState(false);
  void bell;

  const cards = [
    { id: 'voting', Icon: IUsers, silhouette: 'people', badge: ru(language, 'Голосование', 'Ovoz'), title: ru(language, 'Идёт голосование', 'Ovoz berish'), sub: ru(language, 'Ваш голос важен', 'Ovozingiz muhim'), cta: ru(language, 'Проголосовать →', 'Ovoz berish →'), gradient: 'linear-gradient(150deg, #FB923C 0%, #EA580C 100%)', shadow: 'rgba(249,115,22,0.5)', onClick: () => navigate('/meetings') },
    { id: 'guest', Icon: IQR, silhouette: 'qr', badge: 'QR', title: ru(language, 'Гостевой пропуск', 'Mehmon ruxsati'), sub: ru(language, 'QR для гостя или доставки', 'Mehmon yoki yetkazib berish uchun'), cta: ru(language, 'Создать →', 'Yaratish →'), gradient: 'linear-gradient(150deg, #34D399 0%, #15A06E 100%)', shadow: 'rgba(21,160,110,0.5)', onClick: () => navigate('/guest-access') },
    { id: 'rate', Icon: IStar, silhouette: 'star', badge: ru(language, 'Оценка', 'Baho'), title: ru(language, 'Оцените УК', 'Boshqaruvni baholang'), sub: ru(language, 'Раз в месяц · 30 секунд', 'Oyiga bir marta'), cta: ru(language, 'Оценить →', 'Baholash →'), gradient: 'linear-gradient(150deg, #A78BFA 0%, #7C3AED 100%)', shadow: 'rgba(124,58,237,0.5)', onClick: () => navigate('/rate-employees') },
    { id: 'contacts', Icon: IPhone, silhouette: 'phone', badge: ru(language, 'Контакты', 'Kontaktlar'), title: ru(language, 'Полезные контакты', 'Foydali kontaktlar'), sub: ru(language, 'Экстренные службы и мастера', 'Favqulodda xizmatlar'), cta: ru(language, 'Открыть →', 'Ochish →'), gradient: 'linear-gradient(150deg, #60A5FA 0%, #2F77C2 100%)', shadow: 'rgba(47,119,194,0.5)', onClick: () => navigate('/useful-contacts') },
    { id: 'find-car', Icon: ICar, silhouette: 'car', badge: ru(language, 'Авто', 'Avto'), title: ru(language, 'Найти владельца авто', 'Avto egasini topish'), sub: ru(language, 'Поиск соседа по номеру', 'Raqam bo\'yicha qidirish'), cta: ru(language, 'Найти →', 'Topish →'), gradient: 'linear-gradient(150deg, #FBBF24 0%, #D97706 100%)', shadow: 'rgba(217,119,6,0.5)', onClick: () => navigate('/vehicles') },
  ];

  const section: React.CSSProperties = { padding: '0 16px', marginTop: 16 };
  const secLabel: React.CSSProperties = { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '0 4px', marginBottom: 10 };
  const secTitle: React.CSSProperties = { fontSize: 13, fontWeight: 700, letterSpacing: '0.02em', color: 'var(--text-secondary)', textTransform: 'uppercase' };
  const secMore: React.CSSProperties = { fontSize: 13, fontWeight: 700, color: 'var(--brand-dark)' };
  const topApproval = pendingApproval && pendingApproval.length > 0 ? pendingApproval[0] : null;
  const reschedule = pendingReschedules && pendingReschedules.length > 0 ? pendingReschedules[0] : null;

  return (
    <div className="kz-screen" style={{ minHeight: '100%', background: 'var(--app-bg)', paddingBottom: 110, margin: 0 }}>
      <HomeHero name={name} apt={apt} activeCount={activeCount} language={language} unread={unread} onMenu={onMenu} onBell={() => setBell((b) => !b)} bellOpen={bell} />

      <div style={{ ...section, marginTop: 18 }}>
        <SwipeCardStack cards={cards as any} height={210} />
      </div>

      <div style={section}>
        <QuickTiles onNewRequest={onNewRequest} navigate={navigate} language={language} />
      </div>

      {topApproval && (
        <div style={section}>
          <ApprovalCard req={topApproval} language={language} onApprove={() => onApprove(topApproval)} onDetails={() => onOpenRequest(topApproval)} />
        </div>
      )}

      {reschedule && (
        <div style={section}>
          <button onClick={() => onTab('requests')} style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12, padding: '13px 14px', borderRadius: 20, background: 'var(--status-pending-bg)', border: '1px solid rgba(245,158,11,0.3)', cursor: 'pointer' }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(245,158,11,0.18)', color: '#B45309', display: 'grid', placeItems: 'center', flex: '0 0 auto' }}><IClock size={20} /></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14.5, fontWeight: 700, color: '#92400E' }}>{ru(language, 'Запрос на перенос визита', 'Tashrifni ko\'chirish')}</div>
              <div style={{ fontSize: 12.5, color: '#A16207', marginTop: 1 }}>{reschedule.proposedDate ? `${reschedule.proposedDate} ${reschedule.proposedTime || ''}` : ru(language, 'Нажмите, чтобы ответить', 'Javob berish uchun bosing')}</div>
            </div>
            <IChevronR size={18} style={{ color: '#B45309' }} />
          </button>
        </div>
      )}

      {meeting && (
        <div style={section}>
          <div style={secLabel}><span style={secTitle}>{ru(language, 'Собрание', 'Yig\'ilish')}</span><span style={secMore} onClick={() => navigate('/meetings')}>{ru(language, 'Все →', 'Barchasi →')}</span></div>
          <MeetingWidget meeting={meeting} language={language} onOpen={() => navigate('/meetings')} />
        </div>
      )}

      <div style={section}>
        <div style={secLabel}><span style={secTitle}>{ru(language, 'Оплата', 'To\'lov')}</span></div>
        <BalanceCard language={language} />
      </div>

      {announcements && announcements.length > 0 && (
        <div style={section}>
          <div style={secLabel}><span style={secTitle}>{ru(language, 'Объявления', 'E\'lonlar')}</span><span style={secMore} onClick={() => navigate('/announcements')}>{ru(language, 'Все →', 'Barchasi →')}</span></div>
          <AnnMini items={announcements} language={language} onOpen={() => navigate('/announcements')} />
        </div>
      )}

      <div style={section}>
        <PWABanner language={language} />
      </div>

      <TabBar navigate={navigate} onNewRequest={onNewRequest} onTab={onTab} language={language} />
    </div>
  );
}
