# Role-Based Routing, Sidebar Menus, and Dashboard Analysis - Kamizo

## Executive Summary

The Kamizo application implements **13 distinct user roles** with different access levels, dashboard views, and navigation menus. Each role has a specific set of features and responsibilities:

1. **super_admin** - Platform administrator (manages tenants)
2. **admin** - Building management company administrator
3. **director** - Executive leadership
4. **manager** - Operations manager
5. **department_head** - Department head (limited manager)
6. **executor** - Field workers (plumbers, electricians, couriers, etc.)
7. **security** - Security/guard role
8. **resident** - Building resident
9. **tenant** - Property rental owner
10. **commercial_owner** - Commercial space owner
11. **advertiser** - Platform advertiser
12. **dispatcher** - Dispatcher role
13. **marketplace_manager** - Marketplace manager

---

## Route Definitions & Access Control

### Route Protection Mechanism
- **File**: `src/frontend/src/components/ProtectedRoute.tsx`
- **Logic**: Routes check `allowedRoles` array. If user's role not in array, redirects to home `/`
- **Authentication**: Checks for valid token and user object; redirects to `/login` if missing

### Core Route Tree
(From `src/frontend/src/components/layout/Layout.tsx`)

| Route | Component | Protected | Allowed Roles |
|-------|-----------|-----------|---------------|
| `/` | getDashboard() | Yes | All (role-based) |
| `/login` | LoginPage | No | All |
| `/requests` | RequestsPage | Yes | admin, manager, director, department_head |
| `/residents` | ResidentsPage | Yes | admin, manager, director, department_head |
| `/executors` | ExecutorsPage | Yes | admin, manager, director, department_head |
| `/rentals` | RentalsPage | Yes | admin, manager, director |
| `/buildings` | BuildingsPage | Yes | admin, manager, director, department_head |
| `/work-orders` | WorkOrdersPage | Yes | admin, manager, director, department_head, executor |
| `/meetings` | MeetingsPage (dynamic) | Yes | All |
| `/announcements` | AnnouncementsPage (dynamic) | Yes | All |
| `/schedule` | ExecutorSchedulePage | Yes | executor |
| `/my-stats` | ExecutorStatsPage | Yes | executor |
| `/rate-employees` | ResidentRateEmployeesPage | Yes | resident |
| `/vehicles` | ResidentVehiclesPage | Yes | resident |
| `/vehicle-search` | VehicleSearchPage | Yes | admin, manager, director, security |
| `/guest-access` | GuestAccessPage (dynamic) | Yes | All |
| `/qr-scanner` | GuardQRScannerPage | Yes | security |
| `/chat` | ChatPage | Yes | admin, manager, director, department_head, executor, security, resident |
| `/profile` | ProfilePage (dynamic) | Yes | All |
| `/contract` | ResidentContractPage | Yes | resident |
| `/useful-contacts` | ResidentUsefulContactsPage | Yes | resident |
| `/colleagues` | ColleaguesSection | Yes | All |
| `/notepad` | NotepadPage | Yes | All |
| `/trainings` | TrainingsPage | Yes | All |
| `/team` | TeamPage | Yes | admin, director |
| `/reports` | ReportsPage | Yes | admin, director, manager |
| `/settings` | SettingsPage | Yes | admin, director, manager |
| `/monitoring` | MonitoringPage | Yes | admin |
| `/marketplace` | MarketplacePage | Yes | All |
| `/marketplace-orders` | MarketplaceOrdersPage | Yes | All |
| `/marketplace-products` | MarketplaceManagerDashboard | Yes | All |

---

## Dashboard Assignments by Role

### 1. SUPER_ADMIN (Platform Administrator)
**File**: `src/frontend/src/pages/admin/SuperAdminDashboard.tsx`

| Aspect | Details |
|--------|---------|
| **Default Route** | `/` → SuperAdminDashboard |
| **Sidebar Visible** | No (has separate super admin interface) |
| **Key Features** | Tenant management, analytics, billing, feature control |
| **Navigation** | No sidebar; manages via separate interface |
| **Chat Access** | No |
| **Impersonation** | Can impersonate any tenant (super admin mode banner shown) |

**Sidebar Menu Items** (if visible):
- Управляющие компании (Managing Companies)
- Настройки (Settings)

---

### 2. ADMIN (Building Management Administrator)
**File**: `src/frontend/src/pages/AdminDashboard.tsx`

| Aspect | Details |
|--------|---------|
| **Default Route** | `/` → AdminDashboard |
| **Dashboard Focus** | System monitoring, requests overview, marketplace reports, platform ads |
| **Key Stats** | Pending approvals, stale approvals (24h+), marketplace metrics |
| **Tabs** | Overview, Marketplace, Platform Ads |

**Sidebar Menu Items** (9 sections, 19 items):
- **Операции** (Operations)
  - Мониторинг (Monitoring) [Monitoring Page]
  - Заявки (Requests)
  - Работные заказы (Work Orders)
  - Чаты (Chat)
- **Люди** (People)
  - Персонал (Team)
  - Жители (Residents)
- **Объекты** (Objects)
  - Здания (Buildings)
  - Поиск авто (Vehicle Search)
  - Гостевые пропуска (Guest Access)
  - Аренда (Rentals)
- **Коммуникации** (Communications)
  - Объявления (Announcements)
  - Собрания (Meetings)
  - Тренинги (Trainings)
- **Управление** (Management)
  - Отчеты (Reports)
  - Настройки (Settings)

---

### 3. DIRECTOR (Executive/Company Director)
**File**: `src/frontend/src/pages/DirectorDashboard.tsx`

| Aspect | Details |
|--------|---------|
| **Default Route** | `/` → DirectorDashboard |
| **Dashboard Focus** | Company overview, team performance, team data with modals |
| **Key Stats** | Team members, managers, department heads, executors |
| **Extended Features** | Team analytics, marketplace reports, performance tracking |

**Sidebar Menu Items** (8 sections, 17 items):
- **Обзор** (Overview)
  - Обзор компании (Company Overview)
  - Отчеты (Reports)
  - Заявки (Requests)
  - Чаты (Chat)
- **Люди** (People)
  - Сотрудники (Team)
  - Жители (Residents)
- **Объекты** (Objects)
  - Здания (Buildings)
  - Поиск авто (Vehicle Search)
  - Гостевые пропуска (Guest Access)
  - Аренда (Rental)
- **Коммуникации** (Communications)
  - Объявления (Announcements)
  - Собрания (Meetings)
- **Прочее** (Other)
  - Блокнот (Notepad)
  - Настройки (Settings)

---

### 4. MANAGER (Operations Manager)
**File**: `src/frontend/src/pages/ManagerDashboard.tsx`

| Aspect | Details |
|--------|---------|
| **Default Route** | `/` → ManagerDashboard |
| **Dashboard Focus** | Request management, executor stats, reschedule requests, ratings |
| **Key Metrics** | New/assigned requests, executor performance, pending reschedules |
| **Tabs** | Overview, Ratings |
| **Chat Unread Count** | Yes |

**Sidebar Menu Items** (7 sections, 18 items):
- **Операции** (Operations)
  - Дашборд (Dashboard)
  - Заявки (Requests)
  - Работные заказы (Work Orders)
  - Чаты (Chat)
- **Люди** (People)
  - Специалисты (Executors)
  - Жители (Residents)
  - Мои коллеги (My Colleagues)
- **Объекты** (Objects)
  - Здания (Buildings)
  - Поиск авто (Vehicle Search)
  - Гостевые пропуска (Guest Access)
  - Аренда (Rentals)
- **Коммуникации** (Communications)
  - Объявления (Announcements)
  - Собрания (Meetings)
  - Тренинги (Trainings)
- **Маркетплейс** (Marketplace)
  - Заказы магазина (Store Orders)
  - Товары и склад (Products & Warehouse)
- **Управление** (Management)
  - Отчеты (Reports)
  - Заметки (Notes)
  - Настройки (Settings)

---

### 5. DEPARTMENT_HEAD (Department Head)
**File**: `src/frontend/src/pages/DepartmentHeadDashboard.tsx`

| Aspect | Details |
|--------|---------|
| **Default Route** | `/` → DepartmentHeadDashboard |
| **Dashboard Focus** | Department metrics (limited to their specialization) |
| **Key Stats** | Department requests, executors in dept, request status breakdown |
| **Filtering** | Shows only requests/executors matching their specialization |
| **Chat Unread Count** | Yes |

**Sidebar Menu Items** (3 sections, 9 items):
- **Отдел** (Department)
  - Мой отдел (My Department)
  - Заявки (Requests)
  - Сотрудники (Staff)
  - Чат (Chat)
- **Прочее** (Other)
  - Поиск авто (Vehicle Search)
  - Объявления (Announcements)
  - Обучение (Trainings)
  - Коллеги (Colleagues)
  - Блокнот (Notepad)
  - Настройки (Settings)

---

### 6. EXECUTOR (Field Worker / Specialist)
**File**: `src/frontend/src/pages/ExecutorDashboard.tsx`

| Aspect | Details |
|--------|---------|
| **Default Route** | `/` → ExecutorDashboard |
| **Dashboard Focus** | My requests, marketplace orders (if courier specialization) |
| **Tabs** | Available, Assigned, In Progress, Completed, (Marketplace, Delivered for couriers) |
| **Default Tab for Couriers** | Marketplace (not Available) |
| **Stats** | Completion stats, ratings, delivery times |
| **Chat Unread Count** | Yes |

**Sidebar Menu Items** (4 sections, 10 items):
- **Работа** (Work)
  - Заявки/Заказы (Requests/Orders - depends on specialization)
  - Расписание (Schedule)
  - Статистика (Statistics)
- **Инструменты** (Tools)
  - [If Security] QR сканер (QR Scanner) / Поиск авто (Vehicle Search)
  - [If Not Security] Поиск авто (Vehicle Search)
  - Чат (Chat)
- **Прочее** (Other)
  - Объявления (Announcements)
  - Тренинги (Trainings)
  - Коллеги (Colleagues)
  - Заметки (Notes)

---

### 7. SECURITY (Guard/Security Worker)
**File**: Redirects to `/qr-scanner` (no separate dashboard)

| Aspect | Details |
|--------|---------|
| **Default Route** | `/` → Redirects to `/qr-scanner` |
| **Primary Tool** | QR Scanner for access control |
| **Dashboard** | None (direct tool access) |
| **Chat Access** | Yes |
| **Chat Unread Count** | Yes |

**Sidebar Menu Items** (same as Executor):
- **Работа** (Work)
  - Заявки (Requests)
  - Расписание (Schedule)
  - Статистика (Statistics)
- **Инструменты** (Tools)
  - QR сканер (QR Scanner)
  - Поиск авто (Vehicle Search)
  - Чат (Chat)
- **Прочее** (Other)
  - Объявления (Announcements)
  - Тренинги (Trainings)
  - Коллеги (Colleagues)
  - Заметки (Notes)

---

### 8. RESIDENT (Building Resident)
**File**: `src/frontend/src/pages/ResidentDashboard.tsx`

| Aspect | Details |
|--------|---------|
| **Default Route** | `/` → ResidentDashboard |
| **Dashboard Focus** | My requests, announcements, meetings, quick actions |
| **Key Features** | Request creation (modal), reschedule requests, rating |
| **Custom Header** | Yes (different from standard Header) |
| **Chat Unread Count** | Yes |
| **Theme** | Resident-specific styling (sidebar-item-resident) |

**Sidebar Menu Items** (4 sections, 11 items):
- **Дом** (Home)
  - Услуги (Services/Dashboard)
  - Чат с УК (Chat with Management)
  - Объявления (Announcements)
  - Собрания (Meetings)
- **Доступ и имущество** (Access & Property)
  - Мои авто (My Vehicles)
  - Гостевой доступ (Guest Access)
  - Договор (Contract)
- **Информация** (Information)
  - Полезные контакты (Useful Contacts)
  - Маркет для дома (Home Marketplace)
  - Оценить УК (Rate Management Company)

---

### 9. TENANT (Commercial Property Owner)
**File**: `src/frontend/src/pages/tenant/TenantDashboard.tsx`

| Aspect | Details |
|--------|---------|
| **Default Route** | `/` → TenantDashboard |
| **Dashboard Focus** | My apartment rentals, guest bookings, earnings |
| **Key Metrics** | Total earnings, active bookings, guest count |
| **Features** | Rental calendar, booking records, income tracking |
| **Theme** | Resident-specific styling |

**Sidebar Menu Items** (1 section, 1 item):
- My Apartments (Key icon)

---

### 10. COMMERCIAL_OWNER (Commercial Space Owner)
**File**: Same as Tenant (TenantDashboard.tsx)

| Aspect | Details |
|--------|---------|
| **Default Route** | `/` → TenantDashboard |
| **Dashboard Focus** | Same as Tenant |
| **Theme** | Resident-specific styling |

**Sidebar Menu Items** (same as Tenant):
- My Apartments

---

### 11. ADVERTISER (Platform Advertiser)
**File**: `src/frontend/src/pages/AdvertiserDashboard.tsx`

| Aspect | Details |
|--------|---------|
| **Default Route** | `/` → AdvertiserDashboard |
| **Dashboard Focus** | My ads management, categories, performance metrics |
| **Key Stats** | Active ads, expired ads, draft ads, views, coupons |
| **Features** | Ad creation/editing, category selection, coupon management |

**Sidebar Menu Items** (1 section, 3 items):
- Мои объявления (My Ads)
- Объявления (Announcements)
- Настройки (Settings)

---

### 12. DISPATCHER (Dispatcher Role)
**File**: No specific dashboard (inherits from Manager logic in App.tsx)

| Aspect | Details |
|--------|---------|
| **Default Route** | `/` → ManagerDashboard |
| **Special Handling** | Loaded in fetchExecutors (line 116 of App.tsx) |
| **Status** | Role exists but minimal usage |

---

### 13. MARKETPLACE_MANAGER (Marketplace Manager)
**File**: `src/frontend/src/pages/MarketplaceManagerDashboard.tsx`

| Aspect | Details |
|--------|---------|
| **Default Route** | `/` → MarketplaceManagerDashboard |
| **Dashboard Focus** | Marketplace management and orders |

**Sidebar Menu Items** (2 items):
- Управление магазином (Manage Store) [Shopping Bag icon]
- Заказы магазина (Store Orders) [Shopping Bag icon]

---

## Sidebar Navigation Structure

### Role-Based Navigation Logic
**File**: `src/frontend/src/components/layout/Sidebar.tsx` (lines 231-390)

Function `getNavItems()` returns different menu arrays based on role:

```
if (user?.account_type === 'advertiser' || user?.role === 'advertiser') → ADVERTISER_NAV
if (user?.role === 'marketplace_manager') → MARKETPLACE_MANAGER_NAV
if (user?.role === 'executor' || user?.role === 'security') → EXECUTOR_NAV
if (user?.role === 'resident') → RESIDENT_NAV
if (user?.role === 'tenant' || user?.role === 'commercial_owner') → TENANT_NAV
if (user?.role === 'super_admin') → SUPER_ADMIN_NAV
if (user?.role === 'admin') → ADMIN_NAV
if (user?.role === 'director') → DIRECTOR_NAV
if (user?.role === 'department_head') → DEPARTMENT_HEAD_NAV
else → MANAGER_NAV (default)
```

### Feature Locking System
- **Location**: Sidebar.tsx (lines 392-426)
- **Mechanism**: Features can be disabled per tenant
- **Always Allowed**: `/, /settings, /profile, /buildings, /residents, /contract, /rate-employees, /team, /reports`
- **Feature Mapping**:
  - `requests` → `/, /requests, /executors, /work-orders, /schedule, /my-stats`
  - `meetings` → `/meetings`
  - `qr` → `/qr-scanner, /guest-access`
  - `chat` → `/chat`
  - `marketplace` → `/marketplace, /marketplace-orders, /marketplace-products`
  - `announcements` → `/announcements`
  - `trainings` → `/trainings`
  - `rentals` → `/rentals`
  - `colleagues` → `/colleagues`
  - `vehicles` → `/vehicles, /vehicle-search`
  - `useful-contacts` → `/useful-contacts`
  - `notepad` → `/notepad`

### Badge Calculation System
**Location**: Sidebar.tsx (lines 140-228)

**For Executors/Security**:
- Available new requests matching specialization
- Assigned requests waiting for action
- Unread employee announcements
- Chat unread count
- Badge on `/requests` and `/announcements`

**For Residents**:
- Active requests count → badge on `/`
- Unread announcements → badge on `/announcements`
- Upcoming meetings (within 7 days) → badge on `/meetings`
- Chat unread count → badge on `/chat`

**For Managers/Admins/Director**:
- New unassigned requests → badge on `/requests`
- Upcoming meetings (within 7 days) → badge on `/meetings`
- Chat unread count → badge on `/chat`

**Meeting Badge Colors**:
- 🔵 Blue if voting open
- 🟢 Green if confirmed/completed
- ⚪ Normal if upcoming

---

## Feature Access Control

### Feature-Based Access Restrictions
**Via**: `useTenantStore.hasFeature(feature)` function

Disabled features show lock icon in sidebar. Users cannot navigate to locked features even if they try direct URL access.

### Special Page Routing Logic

**Announcements Page**:
- `resident` → ResidentAnnouncementsPage
- `executor, security, advertiser` → ExecutorAnnouncementsPage
- Others → AnnouncementsPage

**Meetings Page**:
- `resident` → ResidentMeetingsPage
- Others → MeetingsPage

**Guest Access Page**:
- `resident` → ResidentGuestAccessPage
- Others → ManagerGuestAccessPage

**Profile Page**:
- `resident, tenant, commercial_owner` → ResidentProfilePage
- `admin, director, manager` → SettingsPage
- Others → StaffProfilePage

---

## Key Implementation Details

### Login Flow
**File**: `src/frontend/src/stores/authStore.ts`

1. User enters credentials
2. API authenticates via `authApi.login()`
3. Token stored in localStorage and Zustand state
4. User object persisted with role
5. Zustand rehydrates on page refresh
6. Auto-auth via `auto_auth` URL parameter for super admin impersonation

### Data Initialization
**File**: `src/frontend/src/App.tsx` (lines 110-133)

- Super admin: Only manages tenants (no data fetch)
- Admin/Manager/Department Head/Dispatcher: Fetch executors
- All except super_admin: Fetch buildings and requests
- Residents: Also fetch vehicles
- All: Fetch notifications and poll every 30 seconds

### Authentication Persistence
**Storage Key**: `uk-auth-storage` (Zustand persist)
**Also Synced**: `auth_token` in localStorage for API requests

---

## Navigation Badge Summary

| Role | Badge Routes | Calculation |
|------|---|---|
| Executor/Security | `/requests`, `/announcements`, `/chat` | New matching + Assigned + Unread announcements + Unread chat |
| Resident | `/`, `/announcements`, `/meetings`, `/chat` | Active requests + Unread announcements + Upcoming meetings + Unread chat |
| Manager/Admin/Director | `/requests`, `/meetings`, `/chat` | New unassigned requests + Upcoming meetings + Unread chat |
| Others | None | No badges shown |

---

## Multi-Tenant Considerations

**Super Admin Impersonation**:
- Super admin can enter any tenant's admin panel
- Impersonation banner shown (amber/orange, sticky top)
- Button to exit impersonation and return to super admin dashboard
- Metadata: origin_url, tenant_name stored in localStorage

**Tenant Config Applied**:
- Brand colors applied as CSS variables
- Features enabled/disabled per tenant
- Feature locking in sidebar navigation

---

## Summary Table: All Roles

| Role | Default Dashboard | Sidebar | Chat | Protected Routes | Key Features |
|------|---|---|---|---|---|
| super_admin | SuperAdminDashboard | No | No | None (separate interface) | Tenant management, analytics |
| admin | AdminDashboard | Yes (19 items) | Yes | /monitoring, /reports, /team, etc. | System overview, marketplace, ads |
| director | DirectorDashboard | Yes (17 items) | Yes | /reports, /team, etc. | Company overview, team performance |
| manager | ManagerDashboard | Yes (18 items) | Yes | /reports, /executors, etc. | Request/executor management |
| department_head | DepartmentHeadDashboard | Yes (9 items) | Yes | /executors, /requests | Department-scoped management |
| executor | ExecutorDashboard | Yes (10 items) | Yes | /schedule, /my-stats | Request/order fulfillment |
| security | /qr-scanner (redirect) | Yes (10 items) | Yes | /qr-scanner, /vehicle-search | Access control via QR |
| resident | ResidentDashboard | Yes (11 items) | Yes | /vehicles, /rate-employees, etc. | Request creation, meetings, ratings |
| tenant | TenantDashboard | Yes (1 item) | No | None | Rental management |
| commercial_owner | TenantDashboard | Yes (1 item) | No | None | Rental management |
| advertiser | AdvertiserDashboard | Yes (3 items) | No | None | Ad management, coupons |
| dispatcher | ManagerDashboard | Same as Manager | Yes | Same as Manager | (Minimal usage) |
| marketplace_manager | MarketplaceManagerDashboard | Yes (2 items) | No | None | Marketplace management |

