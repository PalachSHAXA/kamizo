-- Rebuild marketplace_orders to (1) extend the status CHECK with 6 new
-- special-delivery states, (2) add order_type discriminator, (3) add two
-- price-negotiation timestamps for the 24h ответ-жителя timer.
--
-- SQLite doesn't support ALTER TABLE ... ADD/MODIFY CHECK, so full
-- rebuild. FKs off during rename to keep marketplace_order_items,
-- marketplace_order_history and marketplace_reviews (which reference
-- marketplace_orders(id)) from firing constraint checks mid-flight.

PRAGMA foreign_keys = OFF;

BEGIN TRANSACTION;

CREATE TABLE marketplace_orders__new (
  id TEXT PRIMARY KEY,
  order_number TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL REFERENCES users(id),
  status TEXT DEFAULT 'new' CHECK (status IN (
    -- Existing 7 stock-order states — unchanged
    'new', 'confirmed', 'preparing', 'ready', 'delivering', 'delivered', 'cancelled',
    -- New 6 on-demand (special-delivery) states
    'awaiting_price',    -- resident submitted request, УК hasn't picked it up yet
    'price_pending',     -- УК is checking market price
    'price_offered',     -- УК named the price, waiting resident response (24h)
    'price_accepted',    -- resident agreed → moves into normal fulfillment
    'price_declined',    -- resident said no → terminal
    'unavailable'        -- УК couldn't source the item → terminal
  )),
  total_amount REAL NOT NULL,
  delivery_fee REAL DEFAULT 0,
  discount_amount REAL DEFAULT 0,
  final_amount REAL NOT NULL,
  delivery_address TEXT,
  delivery_apartment TEXT,
  delivery_entrance TEXT,
  delivery_floor TEXT,
  delivery_phone TEXT,
  delivery_notes TEXT,
  delivery_date TEXT,
  delivery_time_slot TEXT,
  payment_method TEXT DEFAULT 'cash' CHECK (payment_method IN ('cash', 'card', 'transfer')),
  payment_status TEXT DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'refunded')),
  assigned_to TEXT,
  confirmed_at TEXT,
  preparing_at TEXT,
  ready_at TEXT,
  delivering_at TEXT,
  delivered_at TEXT,
  cancelled_at TEXT,
  cancellation_reason TEXT,
  rating INTEGER,
  review TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  executor_id TEXT,
  assigned_at TEXT,
  tenant_id TEXT,
  -- ── New columns ────────────────────────────────────────────────
  order_type TEXT DEFAULT 'stock' CHECK (order_type IN ('stock', 'on_demand')),
  price_offered_at TEXT,             -- when УК called the price
  price_offered_expires_at TEXT      -- deadline for resident to accept/decline
);

-- Copy every existing row. Explicit column list — no *; new columns
-- take their DEFAULTs ('stock' for order_type, NULL for timestamps).
INSERT INTO marketplace_orders__new (
  id, order_number, user_id, status,
  total_amount, delivery_fee, discount_amount, final_amount,
  delivery_address, delivery_apartment, delivery_entrance, delivery_floor,
  delivery_phone, delivery_notes, delivery_date, delivery_time_slot,
  payment_method, payment_status, assigned_to,
  confirmed_at, preparing_at, ready_at, delivering_at, delivered_at,
  cancelled_at, cancellation_reason, rating, review,
  created_at, updated_at, executor_id, assigned_at, tenant_id
)
SELECT
  id, order_number, user_id, status,
  total_amount, delivery_fee, discount_amount, final_amount,
  delivery_address, delivery_apartment, delivery_entrance, delivery_floor,
  delivery_phone, delivery_notes, delivery_date, delivery_time_slot,
  payment_method, payment_status, assigned_to,
  confirmed_at, preparing_at, ready_at, delivering_at, delivered_at,
  cancelled_at, cancellation_reason, rating, review,
  created_at, updated_at, executor_id, assigned_at, tenant_id
FROM marketplace_orders;

DROP TABLE marketplace_orders;
ALTER TABLE marketplace_orders__new RENAME TO marketplace_orders;

-- Recreate ALL 6 indexes (keeping the tenant/tenant_id duplicate as-is).
CREATE INDEX idx_marketplace_orders_user ON marketplace_orders(user_id);
CREATE INDEX idx_marketplace_orders_status ON marketplace_orders(status);
CREATE INDEX idx_marketplace_orders_number ON marketplace_orders(order_number);
CREATE INDEX idx_marketplace_orders_executor ON marketplace_orders(executor_id);
CREATE INDEX idx_marketplace_orders_tenant ON marketplace_orders(tenant_id);
CREATE INDEX idx_marketplace_orders_tenant_id ON marketplace_orders(tenant_id);

COMMIT;

PRAGMA foreign_keys = ON;

-- Sanity check that the FKs still resolve — run manually after apply.
-- Expected: 0 rows.
-- PRAGMA foreign_key_check;
