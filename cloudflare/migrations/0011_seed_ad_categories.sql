-- Add missing columns to ad_categories (actual table has: id, name, description, icon, is_active, created_at, tenant_id)
-- Schema expects: name_ru, name_uz, sort_order
ALTER TABLE ad_categories ADD COLUMN name_ru TEXT;
ALTER TABLE ad_categories ADD COLUMN name_uz TEXT;
ALTER TABLE ad_categories ADD COLUMN sort_order INTEGER DEFAULT 0;

-- Seed ad_categories with initial data
INSERT OR IGNORE INTO ad_categories (id, name, name_ru, name_uz, icon, sort_order) VALUES
  ('cleaning', 'Уборка', 'Уборка', 'Tozalash', 'cleaning', 1),
  ('renovation', 'Ремонт квартир', 'Ремонт квартир', 'Kvartira tamiri', 'renovation', 2),
  ('minor_repair', 'Мелкий ремонт', 'Мелкий ремонт', 'Mayda tamirlash', 'minor_repair', 3),
  ('electrical', 'Электрика (частники)', 'Электрика (частники)', 'Elektrika (xususiy)', 'electrical', 4),
  ('plumbing', 'Сантехника (частники)', 'Сантехника (частники)', 'Santexnika (xususiy)', 'plumbing', 5),
  ('moving', 'Переезды и грузчики', 'Переезды и грузчики', 'Kochish va yukchilar', 'moving', 6),
  ('auto', 'Авто-услуги', 'Авто-услуги', 'Avto-xizmatlar', 'auto', 7),
  ('construction', 'Строительные работы', 'Строительные работы', 'Qurilish ishlari', 'construction', 8),
  ('ac', 'Кондиционеры', 'Кондиционеры', 'Konditsionerlar', 'ac', 9),
  ('beauty', 'Красота и здоровье', 'Красота и здоровье', 'Gozallik va salomatlik', 'beauty', 10),
  ('tailoring', 'Швейные / обувные работы', 'Швейные / обувные работы', 'Tikuvchilik / oyoq kiyimlari', 'tailoring', 11),
  ('it', 'IT-мастера', 'IT-мастера', 'IT-ustalar', 'it', 12),
  ('domestic', 'Повар / домработница / няня', 'Повар / домработница / няня', 'Oshpaz / uy xodimlari / enaga', 'domestic', 13),
  ('pest_control', 'Дезинфекция', 'Дезинфекция', 'Dezinfeksiya', 'pest_control', 14),
  ('dry_cleaning', 'Химчистка', 'Химчистка', 'Kimyoviy tozalash', 'dry_cleaning', 15),
  ('delivery', 'Доставка / курьеры', 'Доставка / курьеры', 'Yetkazib berish / kuryerlar', 'delivery', 16),
  ('other', 'Другое', 'Другое', 'Boshqa', 'other', 17);
