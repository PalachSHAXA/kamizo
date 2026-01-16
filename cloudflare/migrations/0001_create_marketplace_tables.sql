-- ==================== MARKETPLACE TABLES ====================

-- Marketplace categories
CREATE TABLE IF NOT EXISTS marketplace_categories (
  id TEXT PRIMARY KEY,
  name_ru TEXT NOT NULL,
  name_uz TEXT NOT NULL,
  icon TEXT,
  sort_order INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Marketplace products
CREATE TABLE IF NOT EXISTS marketplace_products (
  id TEXT PRIMARY KEY,
  category_id TEXT NOT NULL,
  name_ru TEXT NOT NULL,
  name_uz TEXT NOT NULL,
  description_ru TEXT,
  description_uz TEXT,
  price REAL NOT NULL,
  old_price REAL,
  unit TEXT DEFAULT 'шт',
  stock_quantity INTEGER DEFAULT 0,
  image_url TEXT,
  is_active INTEGER DEFAULT 1,
  is_featured INTEGER DEFAULT 0,
  orders_count INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Marketplace cart
CREATE TABLE IF NOT EXISTS marketplace_cart (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  added_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, product_id)
);

-- Marketplace orders
CREATE TABLE IF NOT EXISTS marketplace_orders (
  id TEXT PRIMARY KEY,
  order_number TEXT UNIQUE NOT NULL,
  user_id TEXT NOT NULL,
  executor_id TEXT,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'confirmed', 'preparing', 'ready', 'delivering', 'delivered', 'cancelled')),
  total_amount REAL NOT NULL,
  delivery_fee REAL DEFAULT 0,
  final_amount REAL NOT NULL,

  -- Delivery info
  delivery_address TEXT,
  delivery_apartment TEXT,
  delivery_entrance TEXT,
  delivery_floor TEXT,
  delivery_phone TEXT,
  delivery_date TEXT,
  delivery_time_slot TEXT,
  delivery_notes TEXT,

  -- Payment
  payment_method TEXT DEFAULT 'cash',

  -- Status timestamps
  created_at TEXT DEFAULT (datetime('now')),
  assigned_at TEXT,
  confirmed_at TEXT,
  preparing_at TEXT,
  ready_at TEXT,
  delivering_at TEXT,
  delivered_at TEXT,
  cancelled_at TEXT,
  cancellation_reason TEXT,

  -- Rating
  rating INTEGER,
  review TEXT,

  updated_at TEXT DEFAULT (datetime('now'))
);

-- Marketplace order items
CREATE TABLE IF NOT EXISTS marketplace_order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  product_name TEXT NOT NULL,
  product_image TEXT,
  quantity INTEGER NOT NULL,
  unit_price REAL NOT NULL,
  total_price REAL NOT NULL
);

-- Marketplace order history
CREATE TABLE IF NOT EXISTS marketplace_order_history (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  status TEXT NOT NULL,
  comment TEXT,
  changed_by TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Marketplace favorites
CREATE TABLE IF NOT EXISTS marketplace_favorites (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, product_id)
);

-- Indexes for marketplace
CREATE INDEX IF NOT EXISTS idx_marketplace_products_category ON marketplace_products(category_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_products_active ON marketplace_products(is_active);
CREATE INDEX IF NOT EXISTS idx_marketplace_cart_user ON marketplace_cart(user_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_orders_user ON marketplace_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_orders_executor ON marketplace_orders(executor_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_orders_status ON marketplace_orders(status);
CREATE INDEX IF NOT EXISTS idx_marketplace_orders_number ON marketplace_orders(order_number);
CREATE INDEX IF NOT EXISTS idx_marketplace_order_items_order ON marketplace_order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_favorites_user ON marketplace_favorites(user_id);

-- Initial marketplace categories
INSERT OR IGNORE INTO marketplace_categories (id, name_ru, name_uz, icon, sort_order) VALUES
  ('cat_groceries', 'Бакалея', 'Oziq-ovqat', '🛒', 1),
  ('cat_dairy', 'Молочные продукты', 'Sut mahsulotlari', '🥛', 2),
  ('cat_meat', 'Мясо и птица', 'Go''sht va parranda', '🥩', 3),
  ('cat_bakery', 'Хлеб и выпечка', 'Non va qandolat', '🍞', 4),
  ('cat_fruits', 'Фрукты и овощи', 'Meva va sabzavotlar', '🍎', 5),
  ('cat_beverages', 'Напитки', 'Ichimliklar', '🥤', 6),
  ('cat_household', 'Бытовая химия', 'Maishiy kimyo', '🧹', 7),
  ('cat_personal', 'Личная гигиена', 'Shaxsiy gigiena', '🧴', 8),
  ('cat_baby', 'Детские товары', 'Bolalar uchun', '👶', 9),
  ('cat_pets', 'Зоотовары', 'Hayvonlar uchun', '🐾', 10),
  ('cat_frozen', 'Замороженные продукты', 'Muzlatilgan mahsulotlar', '❄️', 11),
  ('cat_snacks', 'Снеки и сладости', 'Gazak va shirinliklar', '🍿', 12);
