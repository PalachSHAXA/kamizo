-- Products flagged as on_demand render in the shop's "под заказ" tab
-- with «Цена по запросу», don't require stock_quantity, and don't
-- decrement stock when ordered.
ALTER TABLE marketplace_products ADD COLUMN is_on_demand INTEGER DEFAULT 0;
