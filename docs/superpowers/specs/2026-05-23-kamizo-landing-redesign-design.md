# Kamizo Landing Redesign — Design Spec

**Date:** 2026-05-23
**Status:** Draft — awaiting user approval
**Owner:** Shaxzod
**Target deploy:** `kamizo.uz` (Cloudflare Worker `kamizo-landing`)

---

## 1. Context

Текущий лендинг на `kamizo.uz` живёт отдельным репо (`github.com/PalachSHAXA/kamizo-multilang`) в `~/Documents/ПРОЕКТЫ/kamizo/kamizo-site/`. Это 4030-строчный одиночный `index.html` со встроенными CSS/JS, оранжевая палитра, glass-morphism, секции hero / features / use-cases / roles / calculator / clients.

Параллельно от ИИ-агента **Kimi** есть черновик редизайна в `~/Documents/ПРОЕКТЫ/kamizo/Kimi_Agent_Камизо редизайн провал/app/` — React 19 + Vite 6 + TS + Tailwind v4 + GSAP + Lenis + shadcn (40+ компонентов). 11 секций с интерактивными анимациями. **Технически крепкий, но контент наполовину выдуман** — фейковые цифры («47 УК подключено», «12 500 жителей»), несуществующие фичи («умный дом», «GPS-трекинг», «Booking.com», «ЭЦП юр.силы», «оплата через эквайринг»).

Задача — взять Kimi как технический каркас, **переписать весь контент на правду**, добавить **полноценную локализацию RU/UZ/EN**, заменить лого, и деплой на тот же `kamizo.uz` через существующий Worker `kamizo-landing`.

## 2. Goals & non-goals

### Goals
- Лендинг честный (никаких выдуманных метрик и фич).
- Все обещаемые фичи реально работают в продукте, либо помечены `Скоро / Coming Soon`.
- Полностью локализован в трёх языках: **ru** (default), **uz**, **en**. Любая строка переведена везде.
- Анимированный, «живой»: scroll-driven GSAP анимации, интерактивный hero, AnimatedBuilding с этажами, WorkerJourney пошаговый плеер, Lenis smooth scroll.
- Деплой через тот же `wrangler deploy` в Worker `kamizo-landing` на `kamizo.uz`.
- Сохранить рабочие API эндпоинты `/api/clients`, `/api/demo-codes`, `/api/verify-demo`, `/api/demo-requests` и KV namespace `CLIENTS` — модалки демо должны продолжать работать.

### Non-goals (out of scope этого спека)
- Никаких изменений в основном SaaS приложении (`src/frontend/`, `cloudflare/src/routes/`).
- Никакого ребрендинга `app.kamizo.uz` (он остаётся как есть).
- Никаких изменений в `admin.html` Kamizo Landing (он не на главной).
- Никаких новых backend API — только статика + существующие модальные endpoints.

## 3. Architecture

### Текущее состояние
```
kamizo.uz/*  →  Worker «kamizo-landing»  →  serves /api/*  +  ASSETS (public/index.html)
                                            └ KV «CLIENTS» for demo codes/requests
```

### После redesign
```
kamizo.uz/*  →  Worker «kamizo-landing»  →  serves /api/*  +  ASSETS (Vite-built React SPA)
                                            └ KV «CLIENTS» (без изменений)
```

Структура файлов после интеграции (репо `kamizo-site/`):
```
kamizo-site/
├── worker/                ← перемещаем worker сюда чтобы не конфликтовал с Vite src/
│   └── worker.js          ← API + ASSETS fallback (был в src/worker.js)
├── src/                   ← Vite-проект (Kimi)
│   ├── main.tsx
│   ├── App.tsx
│   ├── components/
│   ├── sections/
│   ├── pages/
│   ├── hooks/
│   ├── locales/           ← НОВОЕ: ru.json, uz.json, en.json
│   └── i18n.ts            ← НОВОЕ: react-i18next config
├── public/                ← результат `npm run build` Vite-проекта
│   ├── index.html         ← новый, из Vite build (заменяет старый 4030-строчный)
│   ├── assets/            ← JS/CSS бандлы
│   ├── favicon.svg        ← новое лого (заменяет orange-square K)
│   ├── favicon.ico        ← новое
│   ├── apple-touch-icon.png
│   ├── icons/             ← скопированы из ~/kamizo/cloudflare/public/icons/
│   ├── admin.html         ← остаётся как есть, отдельная страница для админки клиентов
│   └── kamizo.svg         ← старый Canva-AI лого удаляем
├── index.html             ← Vite entry (build переносит в public/index.html)
├── wrangler.toml          ← обновляем main = "worker/worker.js"; KV биндинг CLIENTS сохранён
├── vite.config.ts
├── tailwind.config.js
├── tsconfig.json
└── package.json
```

**Подход интеграции Kimi-кода:**
- Старый `kamizo-site/src/worker.js` переезжает в `kamizo-site/worker/worker.js`. Обновляем `wrangler.toml`: `main = "worker/worker.js"`.
- Vite-проект Kimi полностью копируется в `kamizo-site/src/` (теперь свободно).
- `npm run build` Vite → output в `dist/` (по умолчанию) → копируем `dist/*` в `public/` (или настраиваем Vite `build.outDir = 'public'`).
- `wrangler deploy` поднимает Worker: `[assets] directory = "./public"` + main worker = `./worker/worker.js`.

**Источник иконок:** копируем `~/kamizo/cloudflare/public/icons/*.png` + `favicon.ico` в `kamizo-site/public/icons/` и в корень `public/`. Это production-иконки текущего Kamizo (cream + orange + dark K).

### Стек (фиксируем)
- React 19, react-router-dom 7 (но используем только 1 страницу `/`)
- Vite 6, TypeScript 5
- Tailwind CSS v4 + @tailwindcss/vite
- GSAP 3 + @gsap/react (ScrollTrigger)
- Lenis 1 (smooth scroll)
- Lucide React (иконки)
- clsx + tailwind-merge
- **i18next** или **react-i18next** (добавляем — Kimi не имел)

## 4. Branding

### Лого
Источник истины: **`/Users/shaxzodisamahamadov/kamizo/cloudflare/public/icons/`** (это иконки текущего production-приложения). Иконка: кремовая плашка с тремя штрихами, формирующими букву «K», палитра тёмно-графит + оранжевый акцент + оранжевая точка.

Используем как лого И как фавикон:
- Header logo: PNG `favicon-192x192.png` или векторизуем в SVG (TBD на этапе плана)
- Footer logo: тот же
- Favicon: `favicon.ico` (16x16, 32x32) + apple-touch-icon

**Старый orange-square `K` свг из `kamizo-site/public/favicon.svg` — заменяем.**

### Палитра
Оранжевая, согласованная с Kimi и с оранжевым акцентом нового лого:

```css
--bg-primary:        #F8F6F3;   /* cream — основной фон */
--bg-card:           #FFFFFF;
--bg-dark:           #1A1612;   /* почти-чёрный */
--accent-orange:     #E07000;   /* основной оранжевый */
--accent-orange-deep:#D16500;
--accent-orange-light:#FF8C2A;
--text-primary:      #1E1B18;
--text-muted:        #7A7168;
--text-light:        #FFFFFF;
--border-color:      #E8E4DF;
```

### Типографика
- **Headings:** Instrument Sans (Google Fonts)
- **Body:** Noto Sans (поддерживает кириллицу + узбекскую латиницу)
- Fallback: `-apple-system, BlinkMacSystemFont, sans-serif`

## 5. Sections — финальный список и честный контент

Порядок скролла (после Header):

### 5.1 HeroSection — без изменений структурно

**Заголовок (ru):** «Цифровая экосистема для управляющих компаний»
**Подзаголовок (ru):** «Все взаимодействия УК ↔ сотрудники ↔ жители в одной системе»
**CTA:** «Попробовать демо», «Узнать больше»
**Визуал:** Dashboard mockup с реальными элементами интерфейса Kamizo (заявки, статусы, график).
**Анимация:** Stagger reveal (как у Kimi).

### 5.2 StatsCounterSection — **ВСЕ ЦИФРЫ ПЕРЕПИСАНЫ НА РЕАЛЬНЫЕ**

6 карточек со счётчиком, но не фейк, а реальные подтверждаемые цифры:

| Цифра | Подпись | Источник истины |
|---|---|---|
| **13** | ролей пользователей | `cloudflare/src/types.ts` (роли) |
| **2** | языка интерфейса (3-й — EN — для лендинга) | `languageStore` (ru, uz) |
| **45+** | страниц / экранов | `src/frontend/src/pages/` |
| **8** | модулей платформы | requests, meetings, marketplace, rentals, buildings, misc, users, advertiser |
| **Real-time** | чаты и уведомления | WebSocket Durable Object |
| **24/7** | работа без выходных | infrastructure |

Можно ещё добавить (на выбор): «5 000+ жителей у первого клиента My Helper», «3 уровня иерархии (директор/менеджер/исполнитель)», «безопасное multi-tenant хранилище».

Числа не фантомные — каждое можно открыть в коде и показать.

### 5.3 AnimatedBuildingSection — **очищаем от выдуманных этажей**

Из 8 «этажей» Kimi выкидываем 3 несуществующих, оставляем 5 реальных + 3 переделанных «Скоро».

**Реальные этажи (5):**
1. **Заявки** — автоназначение, фото до/после, оценка
2. **Коммуникация** — чат по подъездам, объявления, опросы
3. **Пропуска** — QR гостям, охрана сканирует
4. **Парковка** — поиск авто по номеру (ручной ввод)
5. **Документы** — авто-протоколы ОСС (генерация Word без юридической ЭЦП)

**«Скоро» этажи (3) — помечены бейджем `Скоро`:**
6. **Эквайринг** — оплата ЖКХ Click/Payme/Halyk (в разработке)
7. **Бухгалтерия + 1С** — экспорт/синхронизация (в разработке)
8. **Умные счётчики IoT** — автосбор показаний (в разработке)

Этажи `Скоро` визуально приглушены (`opacity: 0.6`) с угловым бейджем `Скоро` оранжевого цвета. Клик показывает «Эта функция в разработке. Записаться в early access».

### 5.4 WhyChooseSection — 6 карточек, все реальные

| # | Название | Описание (правда) |
|---|---|---|
| 01 | Умные заявки | Автоназначение по специализации/загрузке. Фото до/после. Оценка качества. ~~GPS-трекинг~~ |
| 02 | QR-пропуска | Гостевые/одноразовые QR. Сканер у охраны. История доступа. |
| 03 | Поиск авто | По номеру — контакт владельца через чат/звонок. (Без распознавания — ручной ввод) |
| 04 | Собрания собственников | Голосование с учётом площади. OTP-верификация. Протокол Word. ~~Юр. ЭЦП~~ |
| 05 | Маркетплейс | Каталог товаров и услуг для жителей. Заказы прямо в приложении. |
| 06 | Чат и push | Real-time чат по подъездам. Объявления, опросы, рассылки. |

Карточек 6, не 7 — `Электронные подписи` и `Аренда+Booking` убираются. Аренда есть, но без OTA-интеграций — она уезжает в FeatureDetailsSection.

### 5.5 WorkerJourneySection — рефразим шаги

Убираем «GPS-трекинг», «ETA на карте», «на пути / положение». Оставляем 6 реальных шагов (вместо 7):

1. **Заявка создана** — житель, фото, описание, приоритет
2. **Назначен исполнитель** — система выбирает по специализации/загрузке/рейтингу
3. **В работе** — таймер, статус «принято»
4. **Фото-отчёт** — до/после
5. **Одобрено** — менеджер проверяет
6. **Оценка** — 5 звёзд + комментарий

Таймер шкалы оставляем (визуально интересно), но называем «средний цикл», не «GPS реал-тайм».

### 5.6 FeatureDetailsSection — 3 блока, все реальные

1. **Прозрачность процесса** — житель видит весь путь заявки, статусы, исполнителя
2. **Объявления и коммуникация** — таргетинг по домам/подъездам, чат, опросы
3. **Аренда квартир** — учёт жильцов, документы (без Booking-интеграции, без авто check-in)

### 5.7 HowItWorksSection — без изменений

Два сценария интерактивных оставляем:
- «Кто заблокировал выезд?» — поиск авто по номеру
- «Гостевой доступ» — генерация QR

Оба реально работают в продукте, нет изменений.

### 5.8 RolesSection — 3 main + 1 блок «и ещё»

**3 основные вкладки:**
- **Директору** — KPI, статистика, отчёты (есть DirectorDashboard)
- **Менеджеру** — распределение заявок, проверка качества, рассылки
- **Жителю** — заявки за 30 секунд, голосование, QR-пропуска, поиск авто, маркетплейс

**Под ними блок «Также для:»** — мини-плитки с иконками:
- Исполнитель / мастер
- Охрана
- Магазин (маркетплейс-менеджер)
- Диспетчер
- Глава отдела
- Арендатор
- Администратор (super_admin)
- Advertiser

Это честно: 13 ролей в коде, показываем все, основные акцентируем.

### 5.9 CalculatorSection — без изменений в логике, перевод

Цены: $1.19/квартира помесячно, $0.99/квартира годовая (-17%). Подтверждены пользователем. Калькулятор уже считает корректно.

### 5.10 ClientsSection — **читаем из `CLIENTS` KV в рантайме**

Источник истины — `GET /api/clients` Worker'а (читает из KV ключ `all`). Никакого хардкода клиентов в коде лендинга. Что лежит в KV — то и показываем.

**Текущее состояние KV:** в админке `admin.html` пользователь уже добавил настоящего клиента **My Helper** с реальными данными (5 000+ жителей, отзыв, рейтинг — то что лежит в KV сейчас). Эти данные подтянутся автоматически.

**В коде лендинга:**
```ts
const { data: clients } = useSWR('/api/clients');
// рендерим карточку для каждого клиента где isDefault === false
// (фейковых defaults Мегаполис/Солнечный/etc. фильтруем — это маркетинговые заглушки)
```

**Карточка клиента отображает:**
- `name` — название УК/ЖК
- `role` — тип («Управляющая компания», «Жилой комплекс», и т.п.)
- `quote` — отзыв (если пусто или `TBA` — поле скрываем)
- `rating` — звёзды (если пусто/null — поле скрываем)
- `residents` — количество жителей
- `appLink` — ссылка на их инстанс
- `icon` — Font Awesome класс или имя Lucide-иконки

**Fallback:** если массив клиентов пуст (или содержит только `isDefault: true`-заглушки) — показываем секцию «Скоро здесь будут наши клиенты» с CTA на форму демо.

Под карточкой — приглашение «Станьте следующим» с CTA на демо.

**Чистка KV:** одной из задач плана будет вызвать `DELETE /api/clients` через админку (или прямо `wrangler kv key delete`) для фейковых 5 УК (Мегаполис, Солнечный, Комфорт+, Премьер, Городской) — чтобы они не выводились на новом лендинге.

### 5.11 NEW: ComingSoonSection — **новая секция, добавляем**

Между ClientsSection и Footer. Прозрачно показываем что в разработке:

**Заголовок (ru):** «В ближайших обновлениях»
**Подзаголовок:** «Эти функции команда сейчас строит. Подписывайтесь — расскажем как только запустим.»

**Карточки 6 штук, каждая с бейджем `Скоро`:**
1. **Эквайринг** (Click / Payme / Halyk Bank Uz)
2. **Бухгалтерия + 1С** (экспорт начислений, сверка платежей)
3. **Юридически значимые ЭЦП** (для протоколов ОСС)
4. **Распознавание номеров авто** (автозаполнение в поиске)
5. **Умные счётчики IoT** (MQTT, авто-сбор показаний)
6. **Полноценные push** (web push + iOS/Android когда выйдет мобилка)

**CTA:** «Получать обновления» — форма с одним полем (email + опц. имя/компания) → `POST /api/demo-requests` с `type: 'early-access'` и `featureInterest: '<название карточки>'`. **Не создаём новый эндпоинт.** Заявка приходит в ту же KV-таблицу что и обычные демо-заявки, видна в `admin.html` (в админке нужно будет добавить фильтр/колонку `type`, чтобы early-access отделить от demo-запросов — это маленькая правка в `admin.html`, делаем заодно).

### 5.12 Footer — без структурных изменений, контент переводится

Логотип + «project by AXELION» + три колонки ссылок + соцсети + копирайт.

## 6. Internationalization (i18n)

### Языки
- **`ru`** — русский (default)
- **`uz`** — узбекский (латиница)
- **`en`** — английский (для маркетинга на внешний рынок)

### Реализация
- Библиотека: `react-i18next` + `i18next-browser-languagedetector`
- Переводы в JSON: `src/locales/{ru,uz,en}.json`
- Структура ключей: namespace по секциям (`hero.*`, `stats.*`, `building.*`)
- Переключатель в Header (3 кнопки RU / UZ / EN, текущий подсвечен)
- Сохранение выбора в `localStorage` (ключ `kamizo-lang`)
- Автоопределение языка браузера на первом визите

### Покрытие
**Каждая** строка лендинга идёт через `t('key')`. Запрет на хардкод RU/UZ/EN текста в JSX-разметке. **Включая:**
- Тексты в формах модалок демо
- Сообщения валидации
- Названия этажей AnimatedBuilding
- Шаги WorkerJourney
- Названия ролей в RolesSection
- Заголовки карточек ComingSoon
- Тексты в SVG-иконках если они есть
- `alt` атрибуты картинок

### Качество переводов
Узбекский и английский — **проверим вручную** прежде чем деплоить. Никакого machine translation без ревью.

## 7. Animations & interactivity

Сохраняем всё что Kimi уже сделал:
- Hero stagger reveal (GSAP timeline)
- Stats counter (отскок + count-up при scroll into view)
- AnimatedBuilding — клик по этажу, светящиеся окна
- WorkerJourney — авто-плейер шагов (play/pause)
- Why/Feature/Roles — hover lift, на scroll масштаб
- Calculator — плавное обновление чисел, debounced
- Smooth scroll Lenis для всего сайта
- Card hover scale/lift
- Reduce motion: `@media (prefers-reduced-motion: reduce)` — все scrub-анимации отключаются, остаются мгновенные fade'ы

## 8. Forms & API integration

Worker `worker.js` уже отдаёт `/api/clients` (GET список из KV), `/api/demo-codes` (admin), `/api/verify-demo` (POST {code}), `/api/demo-requests` (POST forma). **Не трогаем эти эндпоинты.**

В Kimi нужно подключить:
- **Toast (Demo form):** POST в `/api/demo-requests` с {name, phone, email, company, residents}
- **Try Demo (с кодом):** POST в `/api/verify-demo` с {code} → редирект на `https://demo.kamizo.uz` если ок
- **ClientsSection:** GET `/api/clients` опционально, для динамической карточки. Иначе hardcode My Helper.

Email-подписка ComingSoonSection: **отдельный мини-вопрос пользователю** — куда слать (новый endpoint, Mailchimp, или просто `mailto:`)? Пока в спеке: `mailto:hello@kamizo.uz`.

## 9. Deploy plan

**Граница ответственности:** Claude доводит до состояния «локально всё работает через `wrangler dev`, всё закоммичено в feature-ветку». **Сам `wrangler deploy` запускает пользователь** — он хочет лично проверить прежде чем пускать в продакшен на `kamizo.uz`.

### Что делает Claude
1. `cd ~/Documents/ПРОЕКТЫ/kamizo/kamizo-site/`
2. `git checkout -b feat/redesign-kimi-adapt` (новая ветка в репо лендинга)
3. Перенести `src/worker.js` → `worker/worker.js`, обновить `wrangler.toml` (`main = "worker/worker.js"`)
4. Скопировать Kimi `src/`, `index.html`, `vite.config.ts`, `tailwind.config.js`, `tsconfig*.json`, `postcss.config.js` в `kamizo-site/`
5. Слить `package.json` (Vite-зависимости Kimi + `wrangler` старый)
6. Установить i18n библиотеки (`npm i react-i18next i18next i18next-browser-languagedetector`)
7. Установить SWR или fetcher для `/api/clients`
8. Адаптировать контент по этому спеку — переписать секции на правду
9. Реализовать i18n RU/UZ/EN, перевести все строки
10. Сменить лого: скопировать иконки из `~/kamizo/cloudflare/public/icons/` в `kamizo-site/public/`, обновить `<Header>` и `<Footer>`
11. Заменить `kamizo-site/public/favicon.svg` (старый orange-square) и удалить `kamizo.svg` с Canva-AI метаданными
12. Добавить мини-правку в `admin.html`: фильтр/колонка по `type` для отделения `early-access` от полных демо-заявок
13. Настроить Vite: `build.outDir = 'public'` (или скрипт копирования `dist/` → `public/`), при этом **не затирая** `admin.html`, `worker/`, и серверные API-маршруты
14. `npm run build` → проверить что собирается без TS-ошибок и без варнингов про размер бандла > 1MB
15. **Локальная проверка:** `wrangler dev` → открыть `http://localhost:8787`:
    - Все секции прокручиваются
    - Анимации работают (GSAP, Lenis)
    - Переключение языков RU ↔ UZ ↔ EN — каждая строка переводится
    - Модалка «Try Demo» с кодом → `palach27` → редирект на `demo.kamizo.uz`
    - Модалка «Заказать демо» → форма → POST `/api/demo-requests` → 200
    - ComingSoon форма → POST `/api/demo-requests` с `type: 'early-access'` → видно в `admin.html`
    - `/api/clients` отдаёт реальные данные (My Helper), фейк-defaults отфильтрованы
    - На мобильном (DevTools 375px) ничего не плывёт
16. Финальный коммит, push в `feat/redesign-kimi-adapt`, написать короткий отчёт в чат: что сделано, как проверить, что осталось пользователю.

### Что делает пользователь после Claude
17. Просматривает изменения локально, ходит по `wrangler dev`
18. Если ок — `wrangler deploy` сам
19. `wrangler kv key delete --binding=CLIENTS all` (опционально, чтобы вычистить фейковых defaults и заново положить только реальных клиентов через `admin.html`)
20. Smoke check на проде: `curl -I https://kamizo.uz`, открыть в браузере
21. Если что-то не так — `wrangler rollback`

## 10. Risks & mitigations

| Риск | Mitigation |
|---|---|
| Vite-build > 1 MB и Worker отдаёт медленно | Code-split GSAP, lazy-load секций под фолдом, prefetch для крупных секций |
| KV `CLIENTS` сейчас держит старые тестовые данные с фейковыми УК | После деплоя — почистить через `wrangler kv key delete` и заполнить только My Helper |
| Узбекский / английский переводы кривые | Ревью обоих языков с пользователем перед деплоем. EN можно опубликовать `coming soon`-stub если не успеваем. |
| Скриншот лого не векторный, при scale-up пикселит в Header | Векторизуем PNG в SVG, или используем 192px PNG `srcset` + 2x retina |
| Bundle GSAP большой | `gsap.registerPlugin(ScrollTrigger)` импортить только нужное, не весь пакет |
| После деплоя `app.kamizo.uz` падает | Мы НЕ трогаем основной SaaS Worker, только отдельный `kamizo-landing`. Деплои изолированы. |

## 11. Open questions — RESOLVED

1. **My Helper рейтинг/отзыв** → **читаем из `CLIENTS` KV** через `GET /api/clients`. Что лежит в админке — то и показываем. Фейковые `isDefault: true` заглушки фильтруем на фронте + чистим KV отдельной задачей в плане.
2. **Email-подписка в ComingSoon** → **переиспользуем `/api/demo-requests`** с полем `type: 'early-access'`. Заявки приходят в ту же админку (`admin.html`), добавляем туда мини-правку: колонку/фильтр по `type` чтобы отделить early-access от полных демо-заявок.
3. **EN-переводы** → **делаем сразу**, не откладываем post-deploy. RU + UZ + EN все три языка готовы к моменту первого деплоя.

Дополнительный constraint от пользователя:
- **Технический стек не раскрывать в публичной части лендинга** — никаких «Powered by React / Vite / GSAP», никаких упоминаний Kimi в комментариях HTML/JS, никаких внутренних кодовых имён в public-facing текстах. Спек и комментарии внутри кода — норм, public meta-описания и видимые тексты — нет.

## 12. Out of scope (явно)

- Никаких изменений в основном Kamizo SaaS (`/Users/shaxzodisamahamadov/kamizo/`).
- Никакого изменения `admin.html` лендинга — он остаётся как есть.
- Никаких новых backend-эндпоинтов кроме того что Worker уже отдаёт.
- Никакого SSR — лендинг остаётся SPA + статика.
- Никакого SEO-аудита и редиректов — оставляем как есть.
- Никаких A/B-тестов или аналитики (Google Analytics / Plausible) — это отдельный спек если понадобится.
