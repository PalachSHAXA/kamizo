-- Special-delivery items don't reference a marketplace_products row
-- (the item doesn't exist in the catalog). Make product_id nullable
-- so those rows can be inserted with product_id = NULL and only
-- product_name + unit_price filled in by hand by the manager.

PRAGMA foreign_keys = OFF;

BEGIN TRANSACTION;

CREATE TABLE marketplace_order_items__new (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES marketplace_orders(id) ON DELETE CASCADE,
  product_id TEXT REFERENCES marketplace_products(id),  -- was NOT NULL
  product_name TEXT NOT NULL,
  product_image TEXT,
  quantity INTEGER NOT NULL,
  unit_price REAL NOT NULL,
  total_price REAL NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  tenant_id TEXT
);

INSERT INTO marketplace_order_items__new (
  id, order_id, product_id, product_name, product_image,
  quantity, unit_price, total_price, created_at, tenant_id
)
SELECT
  id, order_id, product_id, product_name, product_image,
  quantity, unit_price, total_price, created_at, tenant_id
FROM marketplace_order_items;

DROP TABLE marketplace_order_items;
ALTER TABLE marketplace_order_items__new RENAME TO marketplace_order_items;

CREATE INDEX idx_marketplace_order_items_order ON marketplace_order_items(order_id);
CREATE INDEX idx_marketplace_order_items_tenant ON marketplace_order_items(tenant_id);

COMMIT;

PRAGMA foreign_keys = ON;
