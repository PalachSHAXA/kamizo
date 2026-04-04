# KAMIZO — МЕГА-ПРОМТ ДЛЯ РЕФАКТОРИНГА

> Этот промт даёт Claude полный контекст проекта и пошаговый план разбиения на модули ≤200 строк.
> Копируй целиком в начало разговора с Claude Code / Cowork.

---

## КОНТЕКСТ ПРОЕКТА

**Kamizo** — платформа управления ЖКХ (UK-CRM).
- **Frontend**: React + Vite + TypeScript → `src/frontend/`
- **Backend**: Cloudflare Workers → `cloudflare/src/`
- **БД**: Cloudflare D1 (SQLite) → `cloudflare/schema.sql` (2,004 строк, 80 таблиц)
- **Деплой**: `wrangler deploy` из `cloudflare/`

---

## ТЕКУЩЕЕ СОСТОЯНИЕ (ПРОБЛЕМА)

### Бэкенд — файлы-монстры:

| Файл | Строк | Что внутри |
|---|---|---|
| `index.ts` | **17,142** | 332 инлайн-роута + миграции + хелперы + main handler. ВСЁ живое! |
| `routes/meetings.ts` | 3,320 | CRUD + голосование + протоколы + повестка + OTP |
| `routes/buildings.ts` | 2,825 | Здания + подъезды + квартиры + владельцы + счётчики + показания |
| `routes/marketplace.ts` | 2,192 | Реклама + купоны + товары + корзина + заказы |
| `routes/users.ts` | 1,905 | Пользователи + команда + исполнители + статистика |
| `routes/misc.ts` | 1,637 | WebSocket + объявления + рейтинги + оплата + настройки |
| `routes/requests.ts` | 1,512 | Заявки + назначение + workflow + категории |
| `routes/rentals.ts` | 1,200 | Аренда + гостевой доступ + QR + обмен валют |
| `routes/finance.ts` | 1,191 | Сметы + начисления + расходы + материалы |
| `routes/training.ts` | 1,070 | Тренинги + голосование + регистрация + фидбэк |
| `routes/notifications.ts` | 1,004 | Push + подписки + файлы + рассылки |

**КРИТИЧЕСКАЯ ПРОБЛЕМА:** `index.ts` содержит 332 роута, а `routes/*.ts` содержат ТЕ ЖЕ роуты в параллельной реализации. Обе версии ЖИВЫЕ. Это дублирование. Нужно оставить ОДНУ версию — в модулях.

### Фронтенд — файлы-монстры:

| Файл | Строк | Что внутри |
|---|---|---|
| `DirectorDashboard.tsx` | 1,979 | Дашборд + 10+ виджетов + графики + статистика |
| `MeetingsPage.tsx` | 1,940 | Список + создание + голосование + протокол — всё в одном |
| `TrainingsPage.tsx` | 1,523 | CRUD + голосование + регистрация |
| `meetingStore.ts` | 1,429 | Вся логика собраний в одном сторе |
| `ResidentMeetingsPage.tsx` | 1,423 | Собрания для жителей |
| `ResidentVehiclesPage.tsx` | 1,393 | Транспорт жителей |
| `TeamPage.tsx` | 1,379 | Управление командой |
| `VehicleSearchPage.tsx` | 1,379 | Поиск транспорта |
| `AnnouncementsPage.tsx` | 1,336 | Объявления |
| `ReportsPage.tsx` | 1,334 | Отчёты |
| `ChatPage.tsx` | 1,269 | Чат |
| `SettingsPage.tsx` | 1,215 | Настройки |
| `requestStore.ts` | 1,174 | Стор заявок |
| `languageStore.ts` | 1,092 | Переводы ru/uz |

**Общий объём:** ~81,500 строк фронтенда + ~45,000 строк бэкенда = **126,500 строк**.

---

## ЦЕЛЕВАЯ СТРУКТУРА (после рефакторинга)

### Принцип: один файл ≤ 200 строк, один файл = одна ответственность

---

### БЭКЕНД: `cloudflare/src/`

```
cloudflare/src/
├── index.ts                          # ≤100 строк: импорты + main handler + asset serving
├── router.ts                         # ≤50 строк: создание роутера + registerAllRoutes()
├── types.ts                          # Общие типы бэкенда
│
├── middleware/                        # ✅ УЖЕ ОК (файлы по 30-105 строк)
│   ├── auth.ts                       # 94 строк — JWT верификация
│   ├── tenant.ts                     # 105 строк — multi-tenancy
│   ├── cors.ts                       # 64 строки
│   ├── rateLimit.ts                  # 67 строк
│   └── index.ts                      # barrel
│
├── utils/                             # ✅ УЖЕ ОК (файлы по 27-201 строк)
│   ├── crypto.ts                     # 201 строк — хеширование, JWT
│   ├── helpers.ts                    # 101 строка — isManagement, isAdminLevel
│   ├── logger.ts                     # 80 строк
│   └── ...
│
├── routes/                            # ⚠️ НУЖЕН РЕФАКТОРИНГ
│   ├── index.ts                      # ≤50 строк: registerAllRoutes() — barrel
│   │
│   ├── auth/                          # Было: auth.ts (599 строк)
│   │   ├── login.ts                  # ≤150: POST /api/auth/login
│   │   ├── register.ts              # ≤150: POST /api/auth/register + seed
│   │   ├── password.ts              # ≤150: PUT /api/auth/password, reset
│   │   ├── token.ts                 # ≤100: POST /api/auth/refresh
│   │   └── index.ts                 # ≤30: barrel registerAuthRoutes()
│   │
│   ├── meetings/                      # Было: meetings.ts (3,320 строк) → 10+ файлов
│   │   ├── crud.ts                   # ≤200: GET/POST/PUT/DELETE meetings
│   │   ├── workflow.ts              # ≤200: start-voting, close-voting, complete
│   │   ├── voting.ts                # ≤200: POST vote, GET results, vote hash
│   │   ├── agenda.ts                # ≤200: CRUD пунктов повестки дня
│   │   ├── comments.ts             # ≤150: комментарии к пунктам
│   │   ├── protocol.ts             # ≤200: генерация протокола
│   │   ├── schedule.ts             # ≤200: schedule poll options
│   │   ├── otp.ts                   # ≤100: генерация/валидация OTP
│   │   ├── reconsideration.ts      # ≤150: повторное рассмотрение
│   │   ├── stats.ts                 # ≤150: статистика собраний
│   │   └── index.ts                 # ≤30: barrel registerMeetingRoutes()
│   │
│   ├── buildings/                     # Было: buildings.ts (2,825 строк) → 8+ файлов
│   │   ├── branches.ts              # ≤150: CRUD филиалов
│   │   ├── districts.ts            # ≤100: CRUD районов
│   │   ├── buildings.ts            # ≤200: CRUD зданий
│   │   ├── entrances.ts            # ≤150: подъезды + документы
│   │   ├── apartments.ts           # ≤200: квартиры + баланс + статистика
│   │   ├── owners.ts               # ≤200: владельцы + привязка
│   │   ├── accounts.ts             # ≤150: лицевые счета
│   │   ├── meters.ts               # ≤200: счётчики + показания
│   │   ├── residents.ts            # ≤200: CRM жители
│   │   └── index.ts                 # ≤30: barrel
│   │
│   ├── marketplace/                   # Было: marketplace.ts (2,192 строки) → 6+ файлов
│   │   ├── ads.ts                   # ≤200: рекламные объявления
│   │   ├── categories.ts          # ≤100: категории
│   │   ├── coupons.ts             # ≤200: купоны
│   │   ├── products.ts            # ≤200: товары
│   │   ├── orders.ts              # ≤200: заказы + корзина
│   │   ├── stats.ts               # ≤100: аналитика
│   │   └── index.ts                # ≤30: barrel
│   │
│   ├── users/                         # Было: users.ts (1,905 строк) → 5+ файлов
│   │   ├── crud.ts                  # ≤200: CRUD пользователей
│   │   ├── team.ts                 # ≤200: управление командой
│   │   ├── executors.ts           # ≤200: исполнители + рейтинг + зоны
│   │   ├── stats.ts               # ≤150: статистика
│   │   └── index.ts                # ≤30: barrel
│   │
│   ├── announcements/                 # Было: часть misc.ts → отдельный модуль
│   │   ├── crud.ts                  # ≤200: создание/редактирование объявлений
│   │   ├── delivery.ts            # ≤150: фильтрация по аудитории + push
│   │   └── index.ts                # ≤30: barrel
│   │
│   ├── requests/                      # Было: requests.ts (1,512 строк) → 5 файлов
│   │   ├── crud.ts                  # ≤200: CRUD заявок
│   │   ├── workflow.ts            # ≤200: accept/decline/start/complete/pause
│   │   ├── assignment.ts         # ≤150: назначение исполнителей
│   │   ├── categories.ts         # ≤100: категории заявок
│   │   ├── work-orders.ts        # ≤200: наряды
│   │   └── index.ts               # ≤30: barrel
│   │
│   ├── finance/                       # Было: finance.ts (1,191 строк) → 5 файлов
│   │   ├── estimates.ts            # ≤200: сметы
│   │   ├── charges.ts             # ≤200: начисления
│   │   ├── payments.ts            # ≤200: оплаты
│   │   ├── materials.ts           # ≤200: материалы
│   │   ├── expenses.ts            # ≤200: расходы
│   │   └── index.ts               # ≤30: barrel
│   │
│   ├── training/                      # Было: training.ts (1,070 строк) → 4 файла
│   │   ├── crud.ts                  # ≤200: CRUD тренингов + партнёры
│   │   ├── voting.ts              # ≤200: голосование за предложения
│   │   ├── registration.ts       # ≤200: регистрация + фидбэк
│   │   └── index.ts               # ≤30: barrel
│   │
│   ├── chat/                          # ✅ chat.ts уже 452 строки — разбить на 2
│   │   ├── channels.ts            # ≤200: CRUD каналов
│   │   ├── messages.ts            # ≤200: сообщения + прочитано
│   │   └── index.ts               # ≤30: barrel
│   │
│   ├── notifications/                 # Было: notifications.ts (1,004 строки) → 3 файла
│   │   ├── push.ts                  # ≤200: sendPushNotification + подписки
│   │   ├── uploads.ts             # ≤200: загрузка файлов
│   │   ├── broadcast.ts          # ≤200: массовые рассылки
│   │   └── index.ts               # ≤30: barrel
│   │
│   ├── guest-access/                  # ✅ guest-access.ts 432 строки — разбить на 2
│   │   ├── codes.ts               # ≤200: CRUD кодов
│   │   ├── scanner.ts            # ≤200: QR сканирование + валидация
│   │   └── index.ts               # ≤30: barrel
│   │
│   ├── vehicles.ts                    # ✅ УЖЕ ОК (211 строк)
│   ├── rentals.ts                     # ≤200: аренда (выделить из rentals 1,200)
│   │
│   └── super-admin/                   # Было: super-admin.ts (872 строки) → 3 файла
│       ├── tenants.ts             # ≤200: CRUD тенантов
│       ├── banners.ts             # ≤200: баннеры + реклама
│       ├── analytics.ts          # ≤200: аналитика
│       └── index.ts               # ≤30: barrel
│
├── services/                          # НОВАЯ ПАПКА — бизнес-логика без HTTP
│   ├── meetingService.ts             # ≤200: getMeetingWithDetails, quorum calc
│   ├── voteService.ts               # ≤200: generateVoteHash, validateVote
│   ├── notificationService.ts      # ≤200: sendPushNotification wrapper
│   ├── couponService.ts            # ≤100: generateCouponCode
│   └── migrationService.ts         # ≤200: DB миграции (из index.ts 16461-16785)
│
└── db/                                # НОВАЯ ПАПКА
    └── migrations.ts                 # ≤200: ensureMigrations() вынести из index.ts
```

---

### ФРОНТЕНД: `src/frontend/src/`

```
src/frontend/src/
├── App.tsx                            # ≤50: маршрутизация
├── main.tsx                           # ≤30: точка входа
│
├── components/
│   ├── layout/                        # ✅ УЖЕ ЕСТЬ — требует рефакторинга
│   │   ├── Header.tsx                # 790 строк → разбить:
│   │   │   ├── Header.tsx           # ≤200: основной компонент
│   │   │   ├── HeaderSearch.tsx     # ≤100: поиск
│   │   │   ├── HeaderNotifications.tsx # ≤150: уведомления
│   │   │   └── HeaderProfile.tsx    # ≤100: профиль
│   │   ├── Sidebar.tsx               # 685 строк → разбить:
│   │   │   ├── Sidebar.tsx          # ≤200: основной компонент + роутинг по ролям
│   │   │   ├── SidebarMenu.tsx     # ≤200: список меню
│   │   │   └── SidebarItem.tsx     # ≤100: один элемент меню
│   │   ├── BottomBar.tsx             # 333 строк → разбить:
│   │   │   ├── BottomBar.tsx        # ≤150: контейнер + safe-area
│   │   │   └── BottomBarTab.tsx    # ≤100: один таб
│   │   ├── MobileHeader.tsx          # 336 строк → ≤200 (удалить дублирование с Header)
│   │   └── Layout.tsx                # 494 строк → ≤200 (вынести ProtectedRoute)
│   │
│   ├── common/                        # ✅ УЖЕ ОК (файлы по 30-200 строк)
│   └── modals/                        # ✅ УЖЕ ОК
│
├── pages/
│   ├── meetings/                      # Было: MeetingsPage.tsx (1,940 строк) → 8 файлов
│   │   ├── MeetingsPage.tsx          # ≤200: контейнер + список
│   │   ├── MeetingCard.tsx          # ≤150: карточка собрания
│   │   ├── MeetingCreateForm.tsx   # ≤200: форма создания
│   │   ├── MeetingVoting.tsx       # ≤200: интерфейс голосования
│   │   ├── MeetingAgenda.tsx       # ≤200: повестка дня
│   │   ├── MeetingProtocol.tsx     # ≤200: просмотр протокола
│   │   ├── MeetingSchedulePoll.tsx # ≤150: голосование за дату
│   │   └── hooks/
│   │       └── useMeetingActions.ts # ≤200: хуки для действий
│   │
│   ├── dashboard/                     # Было: DirectorDashboard.tsx (1,979 строк) → 8 файлов
│   │   ├── DirectorDashboard.tsx     # ≤200: контейнер + layout
│   │   ├── widgets/
│   │   │   ├── RequestsWidget.tsx   # ≤150
│   │   │   ├── FinanceWidget.tsx    # ≤150
│   │   │   ├── ResidentsWidget.tsx  # ≤150
│   │   │   ├── StaffWidget.tsx      # ≤150
│   │   │   ├── MeetingsWidget.tsx   # ≤150
│   │   │   ├── AnnouncementsWidget.tsx # ≤150
│   │   │   └── ChartsWidget.tsx     # ≤200
│   │   └── hooks/
│   │       └── useDashboardData.ts  # ≤200
│   │
│   ├── announcements/                 # Было: AnnouncementsPage.tsx (1,336 строк)
│   │   ├── AnnouncementsPage.tsx     # ≤200: список
│   │   ├── AnnouncementCard.tsx     # ≤150: карточка
│   │   ├── AnnouncementForm.tsx    # ≤200: форма создания
│   │   ├── AnnouncementAudience.tsx # ≤150: выбор аудитории
│   │   └── hooks/
│   │       └── useAnnouncements.ts  # ≤150
│   │
│   ├── requests/                      # Было: RequestsPage.tsx (958 строк)
│   │   ├── RequestsPage.tsx          # ≤200: список
│   │   ├── RequestCard.tsx          # ≤150
│   │   ├── RequestForm.tsx         # ≤200
│   │   ├── RequestWorkflow.tsx     # ≤200: кнопки статуса
│   │   └── hooks/
│   │       └── useRequestActions.ts # ≤200
│   │
│   ├── chat/                          # Было: ChatPage.tsx (1,269 строк)
│   │   ├── ChatPage.tsx              # ≤200: layout каналы + сообщения
│   │   ├── ChannelList.tsx         # ≤200
│   │   ├── MessageList.tsx         # ≤200
│   │   ├── MessageInput.tsx        # ≤150
│   │   └── hooks/
│   │       └── useChatMessages.ts   # ≤200
│   │
│   ├── finance/                       # ✅ УЖЕ отдельные файлы — но большие
│   │   ├── EstimatesPage.tsx         # 878 строк → разбить на 3
│   │   ├── ChargesPage.tsx          # 617 строк → разбить на 2
│   │   └── ...
│   │
│   ├── training/                      # Было: TrainingsPage.tsx (1,523 строки)
│   │   ├── TrainingsPage.tsx         # ≤200
│   │   ├── TrainingCard.tsx         # ≤150
│   │   ├── TrainingForm.tsx        # ≤200
│   │   ├── TrainingVoting.tsx      # ≤200
│   │   └── hooks/
│   │       └── useTrainingActions.ts # ≤200
│   │
│   └── ... (аналогично для других страниц)
│
├── stores/                            # ⚠️ НУЖЕН РЕФАКТОРИНГ
│   ├── auth/
│   │   └── authStore.ts              # ✅ УЖЕ ОК (315 строк)
│   │
│   ├── meetings/                      # Было: meetingStore.ts (1,429 строк) → 4 файла
│   │   ├── meetingStore.ts           # ≤200: основной стор (список, CRUD)
│   │   ├── meetingVotingStore.ts   # ≤200: голосование
│   │   ├── meetingAgendaStore.ts   # ≤200: повестка дня
│   │   └── meetingProtocolStore.ts # ≤200: протоколы
│   │
│   ├── requests/                      # Было: requestStore.ts (1,174 строки) → 3 файла
│   │   ├── requestStore.ts           # ≤200: список + фильтры
│   │   ├── requestWorkflowStore.ts # ≤200: workflow действия
│   │   └── requestCategoriesStore.ts # ≤150: категории
│   │
│   ├── language/                      # Было: languageStore.ts (1,092 строки)
│   │   ├── languageStore.ts          # ≤100: переключатель + хук
│   │   ├── translations/
│   │   │   ├── ru.ts                # ≤200: русские строки (по модулям)
│   │   │   └── uz.ts               # ≤200: узбекские строки
│   │   └── index.ts                  # barrel
│   │
│   └── ... (остальные сторы ≤400 строк — ОК пока)
│
├── services/api/                      # ✅ УЖЕ ХОРОШО РАЗБИТЫ (14 модулей)
│   └── ... (файлы по 38-573 строк — meetings.ts разбить)
│
├── types/                             # ✅ УЖЕ ОК
│
└── hooks/                             # НОВАЯ ПАПКА — общие хуки
    ├── useDebounce.ts                # ≤30
    ├── useMediaQuery.ts             # ≤30
    ├── useSafeArea.ts               # ≤50: safe-area-inset для PWA
    └── useStandaloneMode.ts        # ≤30: определение PWA standalone
```

---

## ПРАВИЛА РЕФАКТОРИНГА

### 1. Порядок работы

```
ШАГИ ДЛЯ КАЖДОГО МОДУЛЯ:
1. Прочитай исходный файл ЦЕЛИКОМ
2. Определи логические блоки (по комментариям, роутам, функциям)
3. Создай папку модуля
4. Перенеси код блок за блоком
5. Создай index.ts barrel
6. Обнови импорты в родительском файле
7. Проверь TypeScript: npx tsc --noEmit
8. Проверь что старый файл можно удалить
```

### 2. Паттерн barrel-файла (index.ts)

```typescript
// routes/meetings/index.ts
import { Router } from '../../router';

import { registerMeetingCrud } from './crud';
import { registerMeetingWorkflow } from './workflow';
import { registerMeetingVoting } from './voting';
import { registerMeetingAgenda } from './agenda';
import { registerMeetingProtocol } from './protocol';

export function registerMeetingRoutes(router: Router) {
  registerMeetingCrud(router);
  registerMeetingWorkflow(router);
  registerMeetingVoting(router);
  registerMeetingAgenda(router);
  registerMeetingProtocol(router);
}
```

### 3. Паттерн route-файла (≤200 строк)

```typescript
// routes/meetings/voting.ts
import { Router } from '../../router';
import { getUser } from '../../middleware/auth';
import { getTenantId } from '../../middleware/tenant';
import { generateVoteHash } from '../../services/voteService';

export function registerMeetingVoting(router: Router) {

  // POST /api/meetings/:id/vote
  router.post('/api/meetings/:id/vote', async (request, env) => {
    const authUser = await getUser(request, env);
    const tenantId = getTenantId(request);
    // ... логика голосования ≤50 строк
  });

  // GET /api/meetings/:id/vote-results
  router.get('/api/meetings/:id/vote-results', async (request, env) => {
    // ... ≤50 строк
  });
}
```

### 4. Паттерн фронтенд-страницы (≤200 строк)

```tsx
// pages/meetings/MeetingsPage.tsx
import { useMeetingStore } from '../../stores/meetings/meetingStore';
import { MeetingCard } from './MeetingCard';
import { MeetingCreateForm } from './MeetingCreateForm';

export function MeetingsPage() {
  const { meetings, loading } = useMeetingStore(s => ({
    meetings: s.meetings,  // ТОЧЕЧНАЯ подписка!
    loading: s.loading,
  }));

  // UI логика ≤150 строк
}
```

### 5. Паттерн store (≤200 строк)

```typescript
// stores/meetings/meetingVotingStore.ts
import { create } from 'zustand';
import { meetingsApi } from '../../services/api/meetings';

interface MeetingVotingState {
  voting: boolean;
  results: VoteResult[];
  submitVote: (meetingId: string, agendaItemId: string, vote: string) => Promise<void>;
  fetchResults: (meetingId: string) => Promise<void>;
}

export const useMeetingVotingStore = create<MeetingVotingState>((set) => ({
  voting: false,
  results: [],
  submitVote: async (meetingId, agendaItemId, vote) => {
    // ...
  },
  fetchResults: async (meetingId) => {
    // ...
  },
}));
```

---

## ПРИОРИТЕТ РЕФАКТОРИНГА

### Фаза 1: Убить монолит index.ts (КРИТИЧНО)

```
1. Создать cloudflare/src/db/migrations.ts ← вынести миграции (строки 16461-16785)
2. Создать cloudflare/src/services/meetingService.ts ← вынести getMeetingWithDetails()
3. Создать cloudflare/src/services/voteService.ts ← вынести generateVoteHash, OTP
4. Убедиться что ВСЕ 332 роута из index.ts имеют аналог в routes/*.ts
5. Удалить инлайн-роуты из index.ts
6. Оставить в index.ts ТОЛЬКО: main handler + asset serving + error handling (~100 строк)
7. Протестировать: wrangler dev → проверить все эндпоинты
8. Деплой: wrangler deploy
```

### Фаза 2: Разбить крупные route-файлы

```
1. meetings.ts (3,320) → meetings/ (10 файлов по ≤200)
2. buildings.ts (2,825) → buildings/ (9 файлов по ≤200)
3. marketplace.ts (2,192) → marketplace/ (6 файлов по ≤200)
4. users.ts (1,905) → users/ (5 файлов по ≤200)
5. misc.ts (1,637) → announcements/ + ratings/ + settings/ + websocket/
6. requests.ts (1,512) → requests/ (5 файлов по ≤200)
```

### Фаза 3: Разбить фронтенд-страницы

```
1. DirectorDashboard.tsx (1,979) → dashboard/ (8 файлов)
2. MeetingsPage.tsx (1,940) → meetings/ (8 файлов)
3. meetingStore.ts (1,429) → meetings/ (4 стора)
4. TrainingsPage.tsx (1,523) → training/ (5 файлов)
5. AnnouncementsPage.tsx (1,336) → announcements/ (5 файлов)
6. ChatPage.tsx (1,269) → chat/ (5 файлов)
7. requestStore.ts (1,174) → requests/ (3 стора)
8. languageStore.ts (1,092) → language/ (стор + 2 файла переводов)
```

### Фаза 4: Компоненты layout

```
1. Header.tsx (790) → Header + HeaderSearch + HeaderNotifications + HeaderProfile
2. Sidebar.tsx (685) → Sidebar + SidebarMenu + SidebarItem
3. Layout.tsx (494) → Layout + ProtectedRoute
4. BottomBar.tsx (333) → BottomBar + BottomBarTab
```

---

## БАГИ КОТОРЫЕ НУЖНО ИСПРАВИТЬ ВО ВРЕМЯ РЕФАКТОРИНГА

При переносе кода в модули — ОДНОВРЕМЕННО фиксить:

### Объявления (misc.ts → announcements/crud.ts)
- [ ] Убрать `personalized_data` из INSERT или добавить миграцию

### PWA BottomBar (index.css + BottomBar.tsx)
- [ ] Заменить `height: 100%` на `height: 100dvh` в @media (max-width: 768px)
- [ ] Добавить `@media (display-mode: standalone)` стили
- [ ] Убрать двойной safe-area-inset-bottom

### Аутентификация (auth.ts → auth/login.ts)
- [ ] Добавить `AND is_active = 1` в login query
- [ ] Добавить `AND is_active = 1` в refresh query
- [ ] Исправить `!== 10000` → `!== 50000` в rehash
- [ ] Реализовать миграцию старых хешей

### Безопасность (все route-файлы)
- [ ] Проверить tenant_id фильтрацию в КАЖДОМ SELECT/UPDATE/DELETE
- [ ] Убрать plaintext пароль из register response
- [ ] Маскировать SQL ошибки

---

## ЧЕКЛИСТ ПОСЛЕ КАЖДОГО МОДУЛЯ

```
□ Файл ≤ 200 строк
□ Одна ответственность
□ Все импорты работают
□ npx tsc --noEmit — 0 ошибок
□ Barrel index.ts обновлён
□ Старый код удалён (не дублируется!)
□ tenant_id фильтрация проверена
□ authUser проверка на месте
□ Деплой проверен (wrangler deploy / npm run build)
```

---

## КАК ИСПОЛЬЗОВАТЬ ЭТОТ ПРОМТ

1. **Скопируй целиком** в начало разговора с Claude
2. **Скажи**: "Начни с Фазы 1, шаг 1: вынеси миграции из index.ts в db/migrations.ts"
3. Claude прочитает нужные строки index.ts, создаст новый файл, обновит импорты
4. **Проверь**: `npx tsc --noEmit` и `wrangler dev`
5. **Далее**: "Следующий шаг: вынеси getMeetingWithDetails в services/"
6. **Продолжай** пока index.ts не станет ≤100 строк
7. **Переходи** к Фазе 2, 3, 4
