# 🏢 UK CRM - Система управления жилым комплексом

Полнофункциональная система управления для жилых комплексов с веб и мобильными приложениями.

## 📦 Состав проекта

```
UK/
├── src/
│   ├── frontend/          # 🌐 Веб-приложение (React + TypeScript)
│   └── backend/           # ⚙️ API (Cloudflare Workers)
├── mobile/                # 📱 Мобильное приложение (React Native + Expo)
├── docs/                  # 📚 Документация
├── scripts/               # 🔧 Скрипты
└── deploy.sh             # 🚀 Деплой скрипт
```

## 🚀 Быстрый старт

### 1️⃣ Веб-приложение

```bash
# Установка зависимостей
cd src/frontend
npm install

# Запуск в режиме разработки
npm run dev

# Сборка для production
npm run build
```

**Доступ:** http://localhost:5173

### 2️⃣ Мобильное приложение

```bash
# Установка зависимостей
cd mobile
npm install

# Запуск на телефоне через Expo Go
npx expo start
```

**Установите Expo Go:**
- iOS: [App Store](https://apps.apple.com/app/expo-go/id982107779)
- Android: [Google Play](https://play.google.com/store/apps/details?id=host.exp.exponent)

### 3️⃣ Деплой на Cloudflare

```bash
# Из корневой директории
bash deploy.sh
```

## 🌐 Продакшн

**Веб:** https://uk-crm-api.shaxzod.workers.dev

**API:** https://uk-crm-api.shaxzod.workers.dev/api

## ✨ Основные функции

### Веб-приложение

- ✅ Авторизация с ролями (админ, менеджер, исполнитель, житель)
- ✅ Дашборды для каждой роли
- ✅ Управление заявками
- ✅ Управление исполнителями
- ✅ Управление жителями и домами
- ✅ Собрания жильцов с голосованием
- ✅ Объявления
- ✅ **Мои коллеги** - система взаимной оценки сотрудников
- ✅ Статистика и отчёты
- ✅ Мультиязычность (Русский / O'zbek)

### Мобильное приложение

- ✅ Авторизация
- ✅ **Мои коллеги** - оценка сотрудников
- ✅ Быстрая благодарность
- ✅ Адаптивный дизайн
- ✅ Поддержка iOS и Android
- ✅ Связь с веб-API

## 👥 Система "Мои коллеги"

### Функционал:

1. **Оценка коллег** (10 критериев, 1-5 звёзд)
   - Профессиональные знания
   - Знание законодательства
   - Аналитические способности
   - Качество работы
   - Исполнительность
   - Надёжность
   - Командность
   - Коммуникация
   - Инициативность
   - Человечность

2. **Быстрая благодарность**
   - Помог с задачей
   - Поддержал в сложный момент
   - Научил чему-то новому
   - Выручил в дедлайн
   - Просто спасибо

3. **Профили сотрудников**
   - Средние оценки по критериям
   - Общий рейтинг
   - Полученные благодарности
   - Бейджи/достижения

4. **Топ коллег месяца**
   - Топ-3 сотрудника
   - Лидеры по категориям

### Доступ:

- **Веб:** Левая панель → "Мои коллеги"
- **Мобильное:** Вкладка "Коллеги" 👥

## 🎨 Дизайн

- **Основной цвет:** `#F59E0B` (желтый)
- **Стиль:** Glass-morphism
- **Адаптивность:** Desktop, Tablet, Mobile

## 🔐 Тестовые данные

```
Админ:
Логин: admin
Пароль: admin123

Менеджер:
Логин: manager
Пароль: manager123

Исполнитель:
Логин: executor1
Пароль: executor123
```

## 📱 Структура мобильного приложения

```
mobile/
├── src/
│   ├── api/              # API клиент
│   ├── components/       # UI компоненты
│   │   ├── Button.tsx
│   │   ├── Card.tsx
│   │   └── Input.tsx
│   ├── screens/          # Экраны
│   │   ├── LoginScreen.tsx
│   │   └── ColleaguesScreen.tsx
│   ├── navigation/       # Навигация
│   ├── stores/          # State management (Zustand)
│   └── types/           # TypeScript типы
└── App.tsx
```

## 🛠 Технологии

### Веб

- React 18 + TypeScript
- Vite
- Tailwind CSS
- Zustand (state management)
- React Router

### Мобильное

- React Native
- Expo
- TypeScript
- React Navigation
- Zustand
- Axios

### Бэкенд

- Cloudflare Workers
- D1 Database (SQLite)
- Hono (web framework)

## 📚 Документация

- [Веб-приложение](./src/frontend/README.md)
- [Мобильное приложение](./mobile/README.md)
- [Руководство по мобильному](./MOBILE_SETUP.md)
- [API документация](./docs/)

## 🚀 Команды

### Веб-разработка

```bash
cd src/frontend
npm run dev          # Запуск в режиме разработки
npm run build        # Сборка для production
npm run preview      # Предпросмотр production build
```

### Мобильная разработка

```bash
cd mobile
npx expo start       # Запуск Expo
npm run ios          # Запуск на iOS (требуется macOS)
npm run android      # Запуск на Android
npm run web          # Запуск в браузере
```

### Деплой

```bash
bash deploy.sh       # Полный деплой в production (миграции + сборка + deploy)
```

### Staging

Staging окружение деплоится автоматически при push в ветку `develop`, или вручную:

```bash
bash scripts/deploy-staging.sh
```

**Первоначальная настройка staging:**

```bash
# 1. Создать D1 базу
wrangler d1 create kamizo-staging-db
# → Вставить database_id в cloudflare/wrangler.staging.toml

# 2. Создать KV namespace
wrangler kv namespace create RATE_LIMITER
# → Вставить id в cloudflare/wrangler.staging.toml

# 3. Установить секреты
wrangler secret put ENCRYPTION_KEY --config cloudflare/wrangler.staging.toml
wrangler secret put JWT_SECRET --config cloudflare/wrangler.staging.toml

# 4. Применить схему БД
cd cloudflare
wrangler d1 execute kamizo-staging-db --file=schema.sql --remote
```

**URL:** `https://kamizo-staging.workers.dev`

## 📄 Лицензия

© 2024 UK CRM. Все права защищены.

## 🤝 Поддержка

Для вопросов и поддержки обращайтесь к команде разработки.

---

**🎉 Проект готов к использованию!**

Запустите веб: `cd src/frontend && npm run dev`

Запустите мобильное: `cd mobile && npx expo start`
