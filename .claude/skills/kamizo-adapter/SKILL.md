---
name: kamizo-adapter
description: "Мульти-девайс аудитор Kamizo. Анализирует ВСЕ устройства: iPhone SE→15 Pro Max, Samsung S10→S24, iPad, ноутбуки, десктоп. Проверяет CSS правила на каждый viewport, touch targets, safe-area, overflow, шрифты. Даёт отчёт с файлами и строками. Триггеры: 'адаптив', 'responsive', 'мобильный', 'mobile', 'PWA', 'safe-area', 'bottom bar', 'плывёт', 'съехало', 'не влезает', 'overflow', 'скролл', 'экран', 'планшет', 'tablet', 'standalone', 'устройства', 'devices'."
---

# Kamizo Multi-Device Adapter — Полный аудитор адаптивности

Ты — эксперт по адаптивности. Анализируешь CSS/JSX код и определяешь как он выглядит на КАЖДОМ устройстве без реального рендеринга.

## ПОЛНАЯ МАТРИЦА УСТРОЙСТВ (58 моделей)

### iPhone (iOS Safari + PWA)

| Модель | CSS px | Физ. px | DPR | Safe Top | Safe Bottom | Notch/Island | Год |
|--------|--------|---------|-----|----------|-------------|-------------|-----|
| iPhone SE (2nd) | 375×667 | 750×1334 | 2 | 20px | 0px | Нет | 2020 |
| iPhone SE (3rd) | 375×667 | 750×1334 | 2 | 20px | 0px | Нет | 2022 |
| iPhone 8 | 375×667 | 750×1334 | 2 | 20px | 0px | Нет | 2017 |
| iPhone X/XS | 375×812 | 1125×2436 | 3 | 44px | 34px | Notch | 2017 |
| iPhone XR/11 | 414×896 | 828×1792 | 2 | 48px | 34px | Notch | 2018 |
| iPhone 11 Pro | 375×812 | 1125×2436 | 3 | 44px | 34px | Notch | 2019 |
| iPhone 11 Pro Max | 414×896 | 1242×2688 | 3 | 44px | 34px | Notch | 2019 |
| iPhone 12 mini | 360×780 | 1080×2340 | 3 | 50px | 34px | Notch | 2020 |
| iPhone 12/12 Pro | 390×844 | 1170×2532 | 3 | 47px | 34px | Notch | 2020 |
| iPhone 12 Pro Max | 428×926 | 1284×2778 | 3 | 47px | 34px | Notch | 2020 |
| iPhone 13 mini | 375×812 | 1125×2436 | 3 | 50px | 34px | Notch | 2021 |
| iPhone 13/13 Pro | 390×844 | 1170×2532 | 3 | 47px | 34px | Notch | 2021 |
| iPhone 13 Pro Max | 428×926 | 1284×2778 | 3 | 47px | 34px | Notch | 2021 |
| iPhone 14 | 390×844 | 1170×2532 | 3 | 47px | 34px | Notch | 2022 |
| iPhone 14 Plus | 428×926 | 1284×2778 | 3 | 47px | 34px | Notch | 2022 |
| iPhone 14 Pro | 393×852 | 1179×2556 | 3 | 59px | 34px | Dynamic Island | 2022 |
| iPhone 14 Pro Max | 430×932 | 1290×2796 | 3 | 59px | 34px | Dynamic Island | 2022 |
| iPhone 15 | 393×852 | 1179×2556 | 3 | 59px | 34px | Dynamic Island | 2023 |
| iPhone 15 Plus | 430×932 | 1290×2796 | 3 | 59px | 34px | Dynamic Island | 2023 |
| iPhone 15 Pro | 393×852 | 1179×2556 | 3 | 59px | 34px | Dynamic Island | 2023 |
| iPhone 15 Pro Max | 430×932 | 1290×2796 | 3 | 59px | 34px | Dynamic Island | 2023 |
| iPhone 16 | 393×852 | 1179×2556 | 3 | 59px | 34px | Dynamic Island | 2024 |
| iPhone 16 Pro | 402×874 | 1206×2622 | 3 | 59px | 34px | Dynamic Island | 2024 |
| iPhone 16 Pro Max | 440×956 | 1320×2868 | 3 | 59px | 34px | Dynamic Island | 2024 |

### Android (Chrome + PWA)

| Модель | CSS px | DPR | Nav Bar | Safe Area Bottom | Год |
|--------|--------|-----|---------|-----------------|-----|
| Samsung Galaxy S10 | 360×760 | 3 | 56px | 0px | 2019 |
| Samsung Galaxy S20 | 360×800 | 3 | 48px | 0px | 2020 |
| Samsung Galaxy S21 | 360×800 | 3 | 48px | 0px | 2021 |
| Samsung Galaxy S22 | 360×780 | 3 | 48px | 0px | 2022 |
| Samsung Galaxy S23 | 360×780 | 3 | 48px | 0px | 2023 |
| Samsung Galaxy S24 | 360×780 | 3 | 48px | 0px | 2024 |
| Samsung Galaxy S24 Ultra | 384×824 | 3 | 48px | 0px | 2024 |
| Samsung Galaxy A54 | 360×800 | 2.625 | 48px | 0px | 2023 |
| Samsung Galaxy A14 | 384×854 | 1.5 | 48px | 0px | 2023 |
| Xiaomi Redmi Note 12 | 393×851 | 2.75 | 48px | 0px | 2023 |
| Xiaomi 14 | 393×873 | 2.75 | 48px | 0px | 2024 |
| Google Pixel 7 | 412×915 | 2.625 | 48px | 0px | 2022 |
| Google Pixel 8 | 412×915 | 2.625 | 48px | 0px | 2023 |
| Huawei P60 | 360×780 | 3 | 48px | 0px | 2023 |
| OnePlus 12 | 412×915 | 3.5 | 48px | 0px | 2024 |

**ВАЖНО Android:** `env(safe-area-inset-bottom)` = 0px ВСЕГДА. Navigation bar (48-56px) НЕ входит в safe-area. Viewport (`vh`) уже ИСКЛЮЧАЕТ nav bar.

### iPad (iPadOS)

| Модель | CSS px | DPR | Safe Area | Год |
|--------|--------|-----|-----------|-----|
| iPad (10th gen) | 820×1180 | 2 | Нет | 2022 |
| iPad Air (M2) | 820×1180 | 2 | Нет | 2024 |
| iPad mini (6th) | 744×1133 | 2 | Нет | 2021 |
| iPad Pro 11" | 834×1194 | 2 | Нет | 2022 |
| iPad Pro 12.9" | 1024×1366 | 2 | Нет | 2022 |
| iPad Pro 13" (M4) | 1032×1376 | 2 | Нет | 2024 |

### Ноутбуки / Десктоп

| Устройство | CSS px | DPR | Особенности |
|-----------|--------|-----|-------------|
| MacBook Air 13" | 1440×900 | 2 | Retina |
| MacBook Pro 14" | 1512×982 | 2 | Retina, notch |
| MacBook Pro 16" | 1728×1117 | 2 | Retina, notch |
| Windows Laptop 14" | 1366×768 | 1 | Стандарт |
| Windows Laptop 15.6" | 1920×1080 | 1.25 | Full HD |
| Desktop 24" | 1920×1080 | 1 | Full HD |
| Desktop 27" 4K | 3840×2160 | 2 | 4K Retina |

---

## АЛГОРИТМ АУДИТА

### Шаг 1: Собрать все CSS правила

```bash
# Все breakpoints
grep -rn "@media" src/frontend/src/index.css | head -30

# Все fixed/sticky элементы  
grep -rn "position.*fixed\|position.*sticky" src/frontend/src/ --include="*.css" --include="*.tsx" | head -20

# Все safe-area использования
grep -rn "safe-area\|env(" src/frontend/src/ --include="*.css" --include="*.tsx" | head -20

# Все vh/dvh/svh использования
grep -rn "100vh\|100dvh\|100svh\|100%.*height\|fill-available" src/frontend/src/ --include="*.css" | head -20

# Body/html/root background
grep -rn "background.*#\|background.*white\|background.*rgb" src/frontend/src/index.css | head -10
```

### Шаг 2: Для КАЖДОГО viewport размера проверить

Для каждого устройства из матрицы:

**Layout check:**
- `height: X` — помещается ли весь layout? (header + content + bottombar)
- Общая высота chrome: header_h + bottombar_h + safe_top + safe_bottom
- Доступная высота контента: viewport_h - chrome
- Если доступная высота < 400px → ПРОБЛЕМА (контент не влезает)

**Overflow check:**
- Есть ли элементы с `width > viewport_width`?
- Таблицы без `overflow-x: auto`?
- Изображения без `max-width: 100%`?
- Текст без `word-break: break-word`?

**Touch target check:**
- Все кнопки ≥ 44×44px (CSS px)?
- Отступы между кнопками ≥ 8px?
- Input fields ≥ 44px высота?

**Font size check:**
- Input fields ≥ 16px (iOS zoom prevention)?
- Body text ≥ 14px?
- Labels ≥ 12px?

**Safe area check (iPhone only):**
- `env(safe-area-inset-top)` применяется к header/statusbar?
- `env(safe-area-inset-bottom)` применяется к bottombar?
- НЕ дублируется (только в одном месте)?
- В PWA standalone mode safe-area правильная?

**Android PWA check:**
- `safe-area-inset-bottom = 0px` — не полагаться на safe-area
- body background видим через Android nav bar?
- theme-color в manifest.json совпадает с UI?
- Нет зазора между content и screen edge?

### Шаг 3: Формат отчёта

```
## МУЛЬТИ-ДЕВАЙС АУДИТ: [компонент/страница]

### 📱 iPhone SE (375×667, без notch)
| Элемент | Статус | Проблема | Фикс |
|---------|--------|----------|------|
| Header | ✅ | — | — |
| Content | ⚠️ | Карточки обрезаются | Уменьшить padding |
| BottomBar | ✅ | — | — |
| Touch targets | ❌ | Кнопки 32px | min-height: 44px |

### 📱 iPhone 14 Pro (393×852, Dynamic Island)  
| Элемент | Статус | Проблема | Фикс |
|...

### 📱 Samsung S24 (360×780, Android navbar 48px)
| Элемент | Статус | Проблема | Фикс |
|...
| BottomBar зазор | ❌ | safe-area=0, body bg видно | background:white на body |

### 📱 Samsung Galaxy A14 (384×854, бюджетный)
| Элемент | Статус | Проблема | Фикс |
|...

### 📱 iPad (820×1180)
| Элемент | Статус | Проблема | Фикс |
|...

### 💻 MacBook Air (1440×900)
| Элемент | Статус | Проблема | Фикс |
|...

### 💻 Windows 14" (1366×768)
| Элемент | Статус | Проблема | Фикс |
|...

## СВОДКА
- Критичные проблемы: X (на Y устройствах)  
- Средние: X
- Мелкие: X
- Файлы для исправления: [список]
```

### Шаг 4: Расчёт доступной высоты контента

Для каждого устройства:
```
available_h = viewport_h - header_h - bottombar_h - safe_top - safe_bottom

Kamizo values:
  header_h = 52px
  bottombar_h = 52px  
  safe_top = device.safe_top
  safe_bottom = device.safe_bottom (0 for Android)

Example iPhone 14 Pro:
  available = 852 - 52 - 52 - 59 - 34 = 655px ✅

Example iPhone SE:
  available = 667 - 52 - 52 - 20 - 0 = 543px ⚠️ (tight!)

Example Samsung S10:
  available = 760 - 52 - 52 - 0 - 0 = 656px ✅
  BUT: Android navbar 56px is OUTSIDE viewport, body bg shows through
```

---

## ИЗВЕСТНЫЕ ПРОБЛЕМЫ KAMIZO

### Android PWA — зазор под BottomBar
**Причина:** `env(safe-area-inset-bottom) = 0px` на Android. Между viewport bottom (793px) и screen bottom (852px) = 59px Android navbar. Body background (#fff7ed gradient) просвечивает.
**Фикс:** `body { background: white }` на мобилке. `theme-color: #FFFFFF` в manifest.

### iPhone PWA — BottomBar плывёт
**Причина:** `height: 100%` вместо `100dvh` в CSS. PWA standalone viewport != browser viewport.
**Фикс:** `height: 100%` (наследует от html, которая fixed). BottomBar: `position: fixed; bottom: 0`.

### iOS input zoom
**Причина:** Inputs с font-size < 16px вызывают zoom в Safari.
**Фикс:** `input, select, textarea { font-size: max(16px, 1em) }`

---

## ПОСЛЕ КАЖДОГО ФИКСА

```bash
cd src/frontend && npx tsc --noEmit   # 0 ошибок
npm run build                          # успешная сборка
cd cloudflare && npx wrangler deploy   # деплой (с подтверждения)
```
