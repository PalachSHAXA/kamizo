# ПОЛНЫЙ АУДИТ СИСТЕМЫ UK CRM
**Дата:** 31 декабря 2025
**Версия:** Production (kamizo.uz)

---

## КРАТКОЕ РЕЗЮМЕ

| Категория | Статус | Критичность |
|-----------|--------|-------------|
| **Безопасность** | 🔴 КРИТИЧНО | Требует немедленного исправления |
| **Загрузка данных** | 🟠 ПРОБЛЕМЫ | Здания не загружаются автоматически |
| **Изоляция отделов** | 🟠 ЧАСТИЧНО | Frontend фильтрует, Backend - нет |
| **Управление персоналом** | 🟡 РАБОТАЕТ | Но есть ограничения |
| **Жители** | 🟢 РАБОТАЕТ | Функционал полный |

---

## 1. КРИТИЧЕСКИЕ ПРОБЛЕМЫ БЕЗОПАСНОСТИ

### 1.1 🔴 POST /api/auth/register - ОТКРЫТЫЙ ENDPOINT
**Файл:** `cloudflare/src/index.ts:676`

**Проблема:** Любой может создать пользователя с ЛЮБОЙ ролью, включая admin!

```javascript
// EXPLOIT:
POST /api/auth/register
{
  "login": "hacker",
  "password": "password123",
  "name": "Hacker Admin",
  "role": "admin"  // ← Можно передать любую роль!
}
```

**Решение:**
```typescript
route('POST', '/api/auth/register', async (request, env) => {
  const authUser = await getUser(request, env);

  // Только admin/manager могут создавать пользователей
  if (!authUser || !['admin', 'manager'].includes(authUser.role)) {
    return error('Manager access required', 403);
  }

  // Ограничить создание admin только для admin
  if (body.role === 'admin' && authUser.role !== 'admin') {
    return error('Only admin can create admin accounts', 403);
  }
  // ...
});
```

---

### 1.2 🔴 GET /api/executors - НЕТ АВТОРИЗАЦИИ
**Файл:** `cloudflare/src/index.ts:1623`

**Проблема:** Любой может получить полный список всех исполнителей с телефонами.

**Решение:**
```typescript
route('GET', '/api/executors', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  let whereClause = "WHERE role = 'executor'";

  // Department head видит только своих
  if (user.role === 'department_head') {
    whereClause += ` AND specialization = '${user.specialization}'`;
  }
  // ...
});
```

---

### 1.3 🔴 GET /api/requests - Department Head видит ВСЕ заявки
**Файл:** `cloudflare/src/index.ts:3303-3310`

**Проблема:** Фильтр есть только для resident и executor, но НЕ для department_head.

**Решение:**
```typescript
else if (user.role === 'department_head') {
  whereClause += ' AND r.category_id IN (SELECT id FROM categories WHERE specialization = ?)';
  params.push(user.specialization);
}
```

---

### 1.4 🟠 PATCH /api/team/:id - Пароль НЕ хэшируется
**Файл:** `cloudflare/src/index.ts:1598`

**Проблема:** При обновлении пароля через админку он сохраняется как plain text.

```typescript
// СЕЙЧАС (НЕПРАВИЛЬНО):
if (body.password) {
  updates.push('password_hash = ?');
  values.push(body.password);  // ← Plain text!
}

// НУЖНО:
if (body.password) {
  updates.push('password_hash = ?');
  values.push(await hashPassword(body.password));
}
```

---

## 2. ПРОБЛЕМЫ ЗАГРУЗКИ ДАННЫХ

### 2.1 🔴 Здания НЕ загружаются автоматически
**Файл:** `src/frontend/src/pages/BuildingsPage.tsx`

**Проблема:** Страница зданий показывает пустой список, потому что нет `useEffect` для загрузки.

```typescript
// СЕЙЧАС:
export function BuildingsPage() {
  const { buildings } = useCRMStore();  // ← Всегда пустой массив []
  // НЕТ useEffect для fetchBuildings()!
}

// НУЖНО:
export function BuildingsPage() {
  const { buildings, fetchBuildings, isLoadingBuildings } = useCRMStore();

  useEffect(() => {
    fetchBuildings();
  }, []);

  if (isLoadingBuildings) return <Loading />;
  // ...
}
```

---

### 2.2 🟠 Лимит localStorage - только 20 зданий
**Файл:** `src/frontend/src/stores/crmStore.ts:1331`

```typescript
partialize: (state) => ({
  buildings: state.buildings.slice(0, 20),  // ← Ограничение!
})
```

При перезагрузке страницы загружаются максимум 20 зданий из кэша.

---

## 3. УПРАВЛЕНИЕ ПЕРСОНАЛОМ

### 3.1 Текущая архитектура ролей

```
ADMIN
  ├── Может добавлять: manager, department_head, executor, resident
  ├── Может редактировать всех
  └── Полный доступ

MANAGER
  ├── Может добавлять: department_head, executor, resident
  ├── Может редактировать не-admin
  └── Управляет всеми отделами

DEPARTMENT_HEAD (Глава отдела)
  ├── Видит только свой отдел (specialization)
  ├── ❌ НЕ может добавлять исполнителей через UI
  └── ⚠️ Может обойти через открытый API

EXECUTOR (Исполнитель)
  ├── Видит только свои заявки
  └── Только выполнение работ
```

### 3.2 Как добавить главу отдела

**Способ 1: TeamPage (Админ)**
- Путь: `/admin/team`
- Нажать "Редактировать" на пользователе
- Изменить роль на `department_head`
- Выбрать специализацию (plumber, electrician, etc.)

**Способ 2: Bulk Import (Excel)**
- POST /api/auth/register-bulk
- Указать `role: 'department_head'` и `specialization`

### 3.3 ❌ Глава отдела НЕ может добавлять исполнителей

**Причина:** UI скрывает кнопку добавления:
```typescript
// ExecutorsPage.tsx:131
{!isDepartmentHead && (
  <button onClick={() => setShowAddModal(true)}>
    + Добавить исполнителя
  </button>
)}
```

**Рекомендация:** Разрешить department_head добавлять исполнителей СВОЕГО отдела.

---

## 4. ИЗОЛЯЦИЯ ДАННЫХ ПО ОТДЕЛАМ

### 4.1 ✅ Frontend - РАБОТАЕТ

| Страница | Фильтрация |
|----------|-----------|
| ExecutorsPage | `executors.filter(e => e.specialization === userSpec)` |
| RequestsPage | `requests.filter(r => r.category === userSpec)` |
| DepartmentHeadDashboard | `requests.filter(r => r.category === depSpec)` |

### 4.2 ❌ Backend - НЕ РАБОТАЕТ

| Endpoint | Проблема |
|----------|----------|
| GET /api/executors | Возвращает ВСЕХ |
| GET /api/requests | Возвращает ВСЕ для department_head |

**Риск:** Глава отдела сантехников может через API увидеть:
- Всех электриков, охранников, уборщиков
- Все заявки по электрике, уборке и т.д.
- Приватные данные жителей из других зданий

---

## 5. СИСТЕМА ЖИТЕЛЕЙ

### 5.1 ✅ Что работает хорошо

| Функция | Статус |
|---------|--------|
| Загрузка жителей по зданию | ✅ |
| Bulk import из Excel | ✅ |
| Парсинг Л/С, ФИО, Адреса | ✅ |
| Генерация паролей (YS/8A/42) | ✅ |
| Поиск по имени/телефону | ✅ |
| Связь со зданиями | ✅ |

### 5.2 🟡 Особенности

- **Две системы жителей:** `users` таблица (для логина) и `crm_residents` таблица (для CRM)
- **Формат пароля:** `ФИЛИАЛ/НОМ_ДОМА/КВАРТИРА` (пример: YS/8A/42)
- **Авто-расчёт:** Подъезд и этаж вычисляются из номера квартиры

---

## 6. РЕКОМЕНДАЦИИ ПО ПРИОРИТЕТУ

### 🔴 СРОЧНО (до запуска в production)

1. **Закрыть POST /api/auth/register**
   - Добавить авторизацию admin/manager
   - Ограничить создание admin только для admin

2. **Добавить авторизацию к GET /api/executors**
   - Фильтровать по specialization для department_head

3. **Добавить фильтр для GET /api/requests**
   - Department head видит только свои категории

4. **Хэшировать пароль при PATCH /api/team/:id**

### 🟠 ВАЖНО (в ближайшее время)

5. **Добавить useEffect в BuildingsPage**
   - Вызывать fetchBuildings() при загрузке

6. **Увеличить лимит localStorage**
   - С 20 до 100+ зданий

7. **Разрешить department_head добавлять исполнителей своего отдела**

### 🟡 УЛУЧШЕНИЯ (когда будет время)

8. **Синхронизировать TTL кэша**
   - Backend: 12 часов
   - Frontend: 5 минут
   - Выбрать единое значение

9. **Real-time обновления**
   - WebSocket или SSE для новых заявок/сотрудников

10. **Консолидация систем жителей**
    - Объединить users и crm_residents

---

## 7. СТАТУС ГОТОВНОСТИ К PRODUCTION

| Компонент | Готовность | Блокер |
|-----------|------------|--------|
| Авторизация | 🔴 60% | Открытые endpoints |
| Заявки | 🟢 90% | - |
| Жители | 🟢 95% | - |
| Здания | 🟠 70% | Не загружаются автоматически |
| Персонал | 🟡 80% | Department head не может добавлять |
| Чаты | 🟢 95% | Исправлено (сегодня) |
| Переключатель языка | 🟢 100% | Перенесён в sidebar |

---

## 8. ВЫВОДЫ

**Система в целом функциональна**, но имеет **критические проблемы безопасности**, которые нужно исправить ДО запуска в production:

1. ❌ Можно создать admin аккаунт без авторизации
2. ❌ Утечка данных всех исполнителей
3. ❌ Department head видит все заявки
4. ❌ Пароли могут храниться как plain text

**После исправления этих 4 пунктов** система будет готова к production с реальными пользователями.

---

*Отчёт сгенерирован: 31 декабря 2025, 06:55 UTC*
