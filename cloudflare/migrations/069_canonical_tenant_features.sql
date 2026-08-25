-- Канонизация tenants.features.
--
-- Проблема: строка тенанта создавалась с набором
--   ["requests","votes","qr","rentals","notepad","reports"]
-- где "votes" — ключ, которого не знает ни один гейт. Раздел «Собрания»
-- проверяет фичу "meetings" (ProtectedRoute на фронте, requireFeature на
-- бэке), не находил её и молча редиректил пользователя на главную.
--
-- Здесь только замена легаси-ключа на канонический: объём прав тенанта
-- НЕ расширяется. Включение "announcements" / "rental_listings" — это
-- отдельное решение УК (вкладка «Модули» в настройках) или супер-админа,
-- миграция за них ничего не включает.
--
-- Замена строковая: features хранится как JSON-текст, а json_* функции
-- в сборке SQLite на VPS могут отсутствовать. Кавычки в шаблоне делают
-- совпадение точным — подстрока "votes" встречается только как элемент
-- массива, ключа с таким суффиксом/префиксом в TENANT_FEATURES нет.
UPDATE tenants
SET features = REPLACE(features, '"votes"', '"meetings"'),
    updated_at = datetime('now')
WHERE features LIKE '%"votes"%'
  AND features NOT LIKE '%"meetings"%';

-- Тенанты, где уже есть и "votes", и "meetings": просто выкидываем легаси-ключ
-- вместе с запятой, не плодя дубль.
UPDATE tenants
SET features = REPLACE(REPLACE(features, '"votes",', ''), ',"votes"', ''),
    updated_at = datetime('now')
WHERE features LIKE '%"votes"%'
  AND features LIKE '%"meetings"%';
