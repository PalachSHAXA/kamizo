-- Create marketplace_reviews table.
--
-- Background: GET /api/marketplace/products/:id LEFT JOIN-s
-- marketplace_reviews to attach the top-10 visible reviews to a product.
-- The table was never created — every product detail request was failing
-- with a SQL error on fresh tenants. This migration adds the empty table
-- with the columns the route already expects: id, product_id, user_id,
-- rating (1-5 with CHECK), text, is_visible, created_at, tenant_id.
--
-- Indexes mirror the typical lookup: by product (for the join), by user
-- (for "my reviews" later), by tenant (multi-tenancy).
CREATE TABLE IF NOT EXISTS marketplace_reviews (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  order_id TEXT,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  text TEXT,
  is_visible INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  tenant_id TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_marketplace_reviews_product
  ON marketplace_reviews(product_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_reviews_user
  ON marketplace_reviews(user_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_reviews_tenant
  ON marketplace_reviews(tenant_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_reviews_visible_created
  ON marketplace_reviews(is_visible, created_at DESC);
