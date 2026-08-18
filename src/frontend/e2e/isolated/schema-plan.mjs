const DEMO_PRESENTATION_MIGRATIONS = [
  '054_marketplace_orders_add_order_type.sql',
  '055_marketplace_products_add_is_on_demand.sql',
  '056_marketplace_order_items_nullable_product_id.sql',
  '057_rental_listings.sql',
];

export function migrationFiles(baseMigrations, demoPresentation) {
  return demoPresentation
    ? [...baseMigrations, ...DEMO_PRESENTATION_MIGRATIONS]
    : [...baseMigrations];
}
