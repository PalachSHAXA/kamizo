import { demoId } from './ids';
import { findDemoRole } from './manifest';
import type {
  DemoDomainSeeder,
  DemoEntityCounter,
  DemoProvisionContext,
  DemoProvisionResult,
  DemoResultCounters,
} from './types';

export { demoCommerceExpectedOrderStatuses } from './order-statuses.mjs';

const BATCH_SIZE = 100;

function iso(now: Date, days: number, hours = 0): string {
  return new Date(now.getTime() + (days * 24 + hours) * 60 * 60 * 1000).toISOString();
}

function dateOnly(now: Date, days: number): string {
  return iso(now, days).slice(0, 10);
}

async function runBatches(db: D1Database, statements: D1PreparedStatement[]): Promise<void> {
  for (let index = 0; index < statements.length; index += BATCH_SIZE) {
    await db.batch(statements.slice(index, index + BATCH_SIZE));
  }
}

async function existingIds(
  context: DemoProvisionContext,
  table: string,
  ids: string[],
): Promise<Set<string>> {
  const existing = new Set<string>();
  for (let index = 0; index < ids.length; index += BATCH_SIZE) {
    const batch = ids.slice(index, index + BATCH_SIZE);
    const placeholders = batch.map(() => '?').join(',');
    const result = await context.db.prepare(
      `SELECT id FROM ${table} WHERE tenant_id = ? AND id IN (${placeholders})`,
    ).bind(context.tenantId, ...batch).all<{ id: string }>();
    for (const row of result.results) existing.add(row.id);
  }
  return existing;
}

async function upsertEntity(
  context: DemoProvisionContext,
  table: string,
  ids: string[],
  statements: D1PreparedStatement[],
): Promise<DemoEntityCounter> {
  const existing = await existingIds(context, table, ids);
  await runBatches(context.db, statements);
  return { created: ids.length - existing.size, updated: existing.size };
}

function roleLogin(roleKey: string): string {
  const role = findDemoRole(roleKey);
  if (!role) throw new Error(`Demo role not found: ${roleKey}`);
  return role.login;
}

function gapassToken(data: Record<string, unknown>): string {
  const bytes = new TextEncoder().encode(JSON.stringify(data));
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');
  return `GAPASS:${btoa(binary)}`;
}

export async function provisionDemoCommerce(context: DemoProvisionContext): Promise<DemoProvisionResult> {
  if (context.tenantSlug !== 'demo') throw new Error('Demo provisioning requires the exact demo slug');

  const tenant = await context.db.prepare(
    'SELECT id FROM tenants WHERE id = ? AND slug = ?',
  ).bind(context.tenantId, context.tenantSlug).first<{ id: string }>();
  if (!tenant) throw new Error('Demo tenant not found');

  const requiredRoles = ['resident', 'manager', 'marketplace_manager', 'courier', 'tenant', 'advertiser', 'security'] as const;
  const roleLogins = requiredRoles.map(roleLogin);
  const userResult = await context.db.prepare(`
    SELECT id, login, name, role, phone, address, apartment FROM users
    WHERE tenant_id = ? AND login IN (${roleLogins.map(() => '?').join(',')})
  `).bind(context.tenantId, ...roleLogins).all<{
    id: string;
    login: string;
    name: string;
    role: string;
    phone: string | null;
    address: string | null;
    apartment: string | null;
  }>();
  const usersByLogin = new Map(userResult.results.map((user) => [user.login, user]));
  const users = Object.fromEntries(requiredRoles.map((roleKey) => {
    const descriptor = findDemoRole(roleKey)!;
    const user = usersByLogin.get(descriptor.login);
    if (!user || user.role !== descriptor.role) throw new Error(`Demo commerce prerequisite missing: ${roleKey}`);
    return [roleKey, user];
  })) as Record<(typeof requiredRoles)[number], (typeof userResult.results)[number]>;

  const buildingIds = await Promise.all([
    demoId(context.tenantId, 'building:caravan'),
    demoId(context.tenantId, 'building:mirzo'),
  ]);
  const buildingResult = await context.db.prepare(`
    SELECT id FROM buildings WHERE tenant_id = ? AND id IN (?, ?)
  `).bind(context.tenantId, ...buildingIds).all<{ id: string }>();
  if (buildingResult.results.length !== buildingIds.length) {
    throw new Error('Demo commerce prerequisites missing: buildings');
  }

  const counters: DemoResultCounters = {};
  const now = context.now;
  const nowIso = now.toISOString();

  const categorySpecs = [
    { key: 'home', ru: 'Для дома', uz: 'Uy uchun', icon: 'home' },
    { key: 'cleaning', ru: 'Чистота', uz: 'Tozalik', icon: 'sparkles' },
    { key: 'repair', ru: 'Ремонт', uz: "Ta'mirlash", icon: 'wrench' },
    { key: 'services', ru: 'Услуги', uz: 'Xizmatlar', icon: 'concierge-bell' },
  ];
  const categoryIds = await Promise.all(categorySpecs.map((item) => demoId(context.tenantId, `market-category:${item.key}`)));
  counters.marketplaceCategories = await upsertEntity(
    context,
    'marketplace_categories',
    categoryIds,
    categorySpecs.map((item, index) => context.db.prepare(`
      INSERT INTO marketplace_categories
        (id,name_ru,name_uz,icon,sort_order,is_active,created_at,tenant_id)
       VALUES (?,?,?,?,?,1,?,?)
      ON CONFLICT(id) DO UPDATE SET
        name_ru=excluded.name_ru,name_uz=excluded.name_uz,icon=excluded.icon,
        sort_order=excluded.sort_order
      WHERE marketplace_categories.tenant_id=excluded.tenant_id
    `).bind(categoryIds[index], item.ru, item.uz, item.icon, index + 1, iso(now, -120 + index), context.tenantId)),
  );

  const productSpecs = [
    { key: 'water', category: 0, ru: 'Вода 19 л', uz: '19 l suv', price: 18000, oldPrice: null, stock: 42, featured: 1, demand: 0 },
    { key: 'lamps', category: 0, ru: 'LED-лампа, 2 шт.', uz: 'LED chiroq, 2 dona', price: 28000, oldPrice: 36000, stock: 18, featured: 1, demand: 0 },
    { key: 'cleaner', category: 1, ru: 'Средство для кухни', uz: 'Oshxona tozalagichi', price: 32000, oldPrice: null, stock: 24, featured: 0, demand: 0 },
    { key: 'bags', category: 1, ru: 'Пакеты для мусора', uz: 'Chiqindi paketlari', price: 14000, oldPrice: 18000, stock: 31, featured: 0, demand: 0 },
    { key: 'sealant', category: 2, ru: 'Силиконовый герметик', uz: 'Silikon germetik', price: 39000, oldPrice: null, stock: 0, featured: 0, demand: 0 },
    { key: 'bulky', category: 3, ru: 'Вывоз крупного мусора', uz: 'Yirik chiqindini olib ketish', price: 0, oldPrice: null, stock: 999, featured: 1, demand: 0 },
    { key: 'filter', category: 2, ru: 'Фильтр питьевой воды', uz: 'Ichimlik suvi filtri', price: 245000, oldPrice: 290000, stock: 7, featured: 1, demand: 0 },
    { key: 'special', category: 3, ru: 'Товар под заказ', uz: 'Buyurtma asosida mahsulot', price: 0, oldPrice: null, stock: 0, featured: 1, demand: 1 },
  ];
  const productIds = await Promise.all(productSpecs.map((item) => demoId(context.tenantId, `market-product:${item.key}`)));
  counters.marketplaceProducts = await upsertEntity(
    context,
    'marketplace_products',
    productIds,
    productSpecs.map((item, index) => context.db.prepare(`
      INSERT INTO marketplace_products
        (id,category_id,name_ru,name_uz,description_ru,description_uz,price,old_price,unit,
          stock_quantity,image_url,is_active,is_featured,orders_count,
         created_at,updated_at,tenant_id,is_on_demand)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET
        category_id=excluded.category_id,name_ru=excluded.name_ru,name_uz=excluded.name_uz,
        description_ru=excluded.description_ru,description_uz=excluded.description_uz,
        unit=excluded.unit,image_url=excluded.image_url,is_on_demand=excluded.is_on_demand
      WHERE marketplace_products.tenant_id=excluded.tenant_id
    `).bind(
      productIds[index], categoryIds[item.category], item.ru, item.uz,
      'Проверенный товар для жителей демонстрационного дома',
      'Demo uy aholisi uchun tekshirilgan mahsulot', item.price, item.oldPrice, 'шт', item.stock,
       `/demo/product-${item.key}.svg`, 1, item.featured, index + 2,
       iso(now, -45 + index), nowIso, context.tenantId, item.demand,
    )),
  );

  const orderSpecs = [
    { key: 'new', status: 'new', transitions: ['new'], product: 0, amount: 36000, created: -1, rating: null, review: null, demand: false },
    { key: 'preparing', status: 'preparing', transitions: ['new', 'confirmed', 'preparing'], product: 1, amount: 56000, created: -2, rating: null, review: null, demand: false },
    { key: 'ready', status: 'ready', transitions: ['new', 'confirmed', 'preparing', 'ready'], product: 2, amount: 32000, created: -3, rating: null, review: null, demand: false },
    { key: 'delivering', status: 'delivering', transitions: ['new', 'confirmed', 'preparing', 'ready', 'delivering'], product: 3, amount: 28000, created: -4, rating: null, review: null, demand: false },
    { key: 'delivered', status: 'delivered', transitions: ['new', 'confirmed', 'preparing', 'ready', 'delivering', 'delivered'], product: 6, amount: 245000, created: -12, rating: 5, review: 'Быстро и аккуратно доставили', demand: false },
    { key: 'confirmed', status: 'price_offered', transitions: ['awaiting_price', 'price_pending', 'price_offered'], product: 7, amount: 185000, created: -2, rating: null, review: null, demand: true },
  ];
  const orderIds = await Promise.all(orderSpecs.map((item) => demoId(context.tenantId, `market-order:${item.key}`)));
  const orderNumbers = orderIds.map((id) => `DEMO-${id.replaceAll('-', '').toUpperCase()}`);
  counters.marketplaceOrders = await upsertEntity(
    context,
    'marketplace_orders',
    orderIds,
    orderSpecs.map((item, index) => {
      const createdAt = iso(now, item.created);
      return context.db.prepare(`
        INSERT INTO marketplace_orders
          (id,order_number,user_id,executor_id,status,total_amount,delivery_fee,final_amount,
           delivery_address,delivery_apartment,delivery_entrance,delivery_floor,delivery_phone,
           delivery_date,delivery_time_slot,delivery_notes,payment_method,
           created_at,assigned_at,confirmed_at,preparing_at,ready_at,delivering_at,delivered_at,
           cancelled_at,cancellation_reason,rating,review,updated_at,tenant_id,order_type,
           price_offered_at,price_offered_expires_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(id) DO NOTHING
      `).bind(
        orderIds[index], orderNumbers[index], users.resident.id, users.courier.id, item.status, item.amount, 0, item.amount,
        users.resident.address ?? 'ул. Бобура, 24', users.resident.apartment ?? '49', '1', '4',
        users.resident.phone ?? '+998901200030', dateOnly(now, item.created + 1), '18:00-21:00',
        'Позвонить у подъезда', 'cash', createdAt,
        item.status === 'new' ? null : iso(now, item.created, item.demand ? 3 : 1),
        item.demand || item.status === 'new' ? null : iso(now, item.created, 2),
        ['preparing', 'ready', 'delivering', 'delivered'].includes(item.status) ? iso(now, item.created, 3) : null,
        ['ready', 'delivering', 'delivered'].includes(item.status) ? iso(now, item.created, 5) : null,
        ['delivering', 'delivered'].includes(item.status) ? iso(now, item.created, 7) : null,
        item.status === 'delivered' ? iso(now, item.created, 9) : null,
        null, null, item.rating, item.review, nowIso, context.tenantId,
        item.demand ? 'on_demand' : 'stock', item.demand ? iso(now, item.created, 6) : null,
        item.demand ? iso(now, item.created + 1, 6) : null,
      );
    }),
  );

  const orderItemIds = await Promise.all(orderSpecs.map((item) => demoId(context.tenantId, `market-order-item:${item.key}`)));
  counters.marketplaceOrderItems = await upsertEntity(
    context,
    'marketplace_order_items',
    orderItemIds,
    orderSpecs.map((item, index) => context.db.prepare(`
      INSERT INTO marketplace_order_items
        (id,order_id,product_id,product_name,product_image,quantity,unit_price,total_price,tenant_id)
       VALUES (?,?,?,?,?,?,?,?,?)
      ON CONFLICT(id) DO NOTHING
    `).bind(
      orderItemIds[index], orderIds[index], productIds[item.product], productSpecs[item.product].ru,
      `/demo/product-${productSpecs[item.product].key}.svg`, item.key === 'new' || item.key === 'preparing' || item.key === 'delivering' ? 2 : 1,
      item.amount / (item.key === 'new' || item.key === 'preparing' || item.key === 'delivering' ? 2 : 1),
       item.amount, context.tenantId,
    )),
  );

  const historySpecs = orderSpecs.flatMap((order, orderIndex) => order.transitions.map((status, transitionIndex) => ({
    order,
    orderIndex,
    status,
    transitionIndex,
  })));
  const historyIds = await Promise.all(historySpecs.map((item) => demoId(
    context.tenantId,
    item.transitionIndex === item.order.transitions.length - 1
      ? `market-order-history:${item.order.key}`
      : `market-order-history:${item.order.key}:${item.status}`,
  )));
  counters.marketplaceOrderHistory = await upsertEntity(
    context,
    'marketplace_order_history',
    historyIds,
    historySpecs.map((item, index) => context.db.prepare(`
      INSERT INTO marketplace_order_history (id,order_id,status,comment,changed_by,created_at,tenant_id)
      VALUES (?,?,?,?,?,?,?)
      ON CONFLICT(id) DO NOTHING
    `).bind(
      historyIds[index], orderIds[item.orderIndex], item.status,
      item.status === 'price_offered' ? 'Менеджер предложил цену' : `Демонстрационный статус: ${item.status}`,
      item.transitionIndex === 0 ? users.resident.id : users.marketplace_manager.id,
      item.status === 'new' || item.status === 'awaiting_price' ? iso(now, item.order.created)
        : item.status === 'price_pending' ? iso(now, item.order.created, 3)
          : item.status === 'confirmed' ? iso(now, item.order.created, 2)
            : item.status === 'preparing' ? iso(now, item.order.created, 3)
              : item.status === 'ready' ? iso(now, item.order.created, 5)
                : item.status === 'delivering' ? iso(now, item.order.created, 7)
                  : item.status === 'delivered' ? iso(now, item.order.created, 9)
                    : iso(now, item.order.created, 6),
      context.tenantId,
    )),
  );

  const favoriteId = await demoId(context.tenantId, 'market-favorite:resident:water');
  counters.marketplaceFavorites = await upsertEntity(context, 'marketplace_favorites', [favoriteId], [
    context.db.prepare(`
      INSERT INTO marketplace_favorites (id,user_id,product_id,created_at,tenant_id)
      VALUES (?,?,?,?,?)
      ON CONFLICT(id) DO NOTHING
    `).bind(favoriteId, users.resident.id, productIds[0], iso(now, -3), context.tenantId),
  ]);

  const reviewId = await demoId(context.tenantId, 'market-review:resident:filter');
  counters.marketplaceReviews = await upsertEntity(context, 'marketplace_reviews', [reviewId], [
    context.db.prepare(`
      INSERT INTO marketplace_reviews
        (id,product_id,user_id,order_id,rating,comment,images,is_verified_purchase,is_visible,created_at,tenant_id)
       VALUES (?,?,?,?,?,?,NULL,1,1,?,?)
       ON CONFLICT(id) DO NOTHING
    `).bind(reviewId, productIds[6], users.resident.id, orderIds[4], 5, 'Качество отличное, установка понятная', iso(now, -2), context.tenantId),
  ]);

  const adCategoryId = await demoId(context.tenantId, 'ad-category:home-services');
  counters.adCategories = await upsertEntity(context, 'ad_categories', [adCategoryId], [
    context.db.prepare(`
      INSERT INTO ad_categories
        (id,name,description,icon,is_active,created_at,tenant_id,name_ru,name_uz,sort_order)
       VALUES (?,?,?,?,1,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET
         name=excluded.name,description=excluded.description,icon=excluded.icon,
         name_ru=excluded.name_ru,name_uz=excluded.name_uz,sort_order=excluded.sort_order
       WHERE ad_categories.tenant_id=excluded.tenant_id
    `).bind(
       adCategoryId, 'Бытовые услуги', 'Проверенные мастера рядом с домом', 'wrench',
       iso(now, -90), context.tenantId, 'Бытовые услуги', 'Maishiy xizmatlar', 1,
    ),
  ]);

  const adId = await demoId(context.tenantId, 'ad:air-conditioner-service');
  counters.ads = await upsertEntity(context, 'ads', [adId], [
    context.db.prepare(`
      INSERT INTO ads
        (id,advertiser_id,category_id,title,description,phone,logo_url,photos,discount_percent,badges,target_type,
         target_branches,target_buildings,starts_at,expires_at,duration_type,status,views_count,
         coupons_issued,coupons_activated,created_by,created_at,updated_at,tenant_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET
         advertiser_id=excluded.advertiser_id,title=excluded.title,description=excluded.description,category_id=excluded.category_id,
         phone=excluded.phone,logo_url=excluded.logo_url,photos=excluded.photos,
         discount_percent=excluded.discount_percent,badges=excluded.badges,target_type=excluded.target_type,
         target_branches=excluded.target_branches,target_buildings=excluded.target_buildings,
         duration_type=excluded.duration_type,created_by=excluded.created_by
      WHERE ads.tenant_id=excluded.tenant_id
    `).bind(
       adId, users.advertiser.id, adCategoryId, 'Сервис кондиционеров', 'Чистка и диагностика со скидкой для жителей',
       users.advertiser.phone ?? '+998901200130', '/demo/ad-service.svg',
       JSON.stringify(['/demo/ad-service.svg']), 10, JSON.stringify({ recommended: true }), 'all',
       '[]', JSON.stringify(buildingIds), iso(now, -5), iso(now, 25), 'month', 'active',
       48, 7, 2, users.advertiser.id, iso(now, -5), nowIso, context.tenantId,
    ),
  ]);

  const rentalApartmentSpecs = [
    { key: 'caravan-52', name: 'Caravan City, квартира 52', address: 'ул. Бобура, 24', apartment: '52' },
    { key: 'mirzo-18', name: 'Mirzo Residence, квартира 18', address: 'ул. Мирзо Улугбека, 55', apartment: '18' },
  ];
  const rentalApartmentIds = await Promise.all(rentalApartmentSpecs.map((item) => demoId(context.tenantId, `rental-apartment:${item.key}`)));
  counters.rentalApartments = await upsertEntity(
    context,
    'rental_apartments',
    rentalApartmentIds,
    rentalApartmentSpecs.map((item, index) => context.db.prepare(`
      INSERT INTO rental_apartments
        (id,name,address,apartment,owner_id,owner_type,is_active,created_at,updated_at,tenant_id)
      VALUES (?,?,?,?,?,'tenant',1,?,?,?)
      ON CONFLICT(id) DO UPDATE SET
        name=excluded.name,address=excluded.address,apartment=excluded.apartment
      WHERE rental_apartments.tenant_id=excluded.tenant_id
    `).bind(
      rentalApartmentIds[index], item.name, item.address, item.apartment, users.tenant.id,
      iso(now, -180 + index), nowIso, context.tenantId,
    )),
  );

  const rentalRecordSpecs = [
    { key: 'past-one', apartment: 0, guest: 'Семья Каримовых', start: -110, end: -102, amount: 3200000 },
    { key: 'past-two', apartment: 1, guest: 'Алексей и Мария', start: -75, end: -68, amount: 2900000 },
    { key: 'current', apartment: 0, guest: 'Шерзод Абдуллаев', start: -8, end: 12, amount: 5200000 },
    { key: 'future', apartment: 1, guest: 'Дилором Усманова', start: 18, end: 28, amount: 4100000 },
  ];
  const rentalRecordIds = await Promise.all(rentalRecordSpecs.map((item) => demoId(context.tenantId, `rental-record:${item.key}`)));
  counters.rentalRecords = await upsertEntity(
    context,
    'rental_records',
    rentalRecordIds,
    rentalRecordSpecs.map((item, index) => context.db.prepare(`
      INSERT INTO rental_records
        (id,apartment_id,guest_names,passport_info,check_in_date,check_out_date,amount,currency,
         notes,created_by,created_at,updated_at,tenant_id)
      VALUES (?,?,?,NULL,?,?,?,'UZS',?,?,?, ?,?)
      ON CONFLICT(id) DO NOTHING
    `).bind(
      rentalRecordIds[index], rentalApartmentIds[item.apartment], item.guest,
      dateOnly(now, item.start), dateOnly(now, item.end), item.amount,
      'Демонстрационная запись аренды', users.manager.id, iso(now, item.start - 5), nowIso, context.tenantId,
    )),
  );

  const listingSpecs = [
    { key: 'bright-two', publisher: users.resident, source: 'resident', state: 'active', rooms: 2, area: 58, floor: 4, total: 12, apartment: '49', building: 0, price: 6500000, duration: 'long' },
    { key: 'studio', publisher: users.manager, source: 'uk', state: 'active', rooms: 0, area: 34, floor: 7, total: 9, apartment: '18', building: 1, price: 4200000, duration: 'flexible' },
    { key: 'family-three', publisher: users.resident, source: 'resident', state: 'active', rooms: 3, area: 82, floor: 8, total: 12, apartment: '83', building: 0, price: 8800000, duration: 'long' },
    { key: 'rented-one', publisher: users.resident, source: 'resident', state: 'rented', rooms: 1, area: 43, floor: 3, total: 9, apartment: '12', building: 1, price: 5100000, duration: 'short' },
    { key: 'hidden-one', publisher: users.manager, source: 'uk', state: 'hidden', rooms: 2, area: 61, floor: 5, total: 12, apartment: '57', building: 0, price: 7000000, duration: 'long' },
  ];
  const listingIds = await Promise.all(listingSpecs.map((item) => demoId(context.tenantId, `rental-listing:${item.key}`)));
  counters.rentalListings = await upsertEntity(
    context,
    'rental_listings',
    listingIds,
    listingSpecs.map((item, index) => context.db.prepare(`
      INSERT INTO rental_listings
        (id,tenant_id,publisher_user_id,source_type,state,hidden_reason,hidden_by_user_id,hidden_at,
         rooms,area_m2,floor,floor_total,apartment_number,entrance,building_id,price_monthly,
         price_currency,deposit_months,furnished,air_conditioning,internet,parking,animals_allowed,
         duration_type,description,phone_visible,last_confirmed_at,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'1',? ,?,'UZS',1,1,1,1,?,0,?,?,1,?,?,?)
      ON CONFLICT(id) DO NOTHING
    `).bind(
      listingIds[index], context.tenantId, item.publisher.id, item.source, item.state,
      item.state === 'hidden' ? 'Контакты требуют уточнения' : null,
      item.state === 'hidden' ? users.manager.id : null,
      item.state === 'hidden' ? iso(now, -1) : null,
      item.rooms, item.area, item.floor, item.total, item.apartment, buildingIds[item.building], item.price,
      index % 2, item.duration, 'Светлая квартира с готовой мебелью и удобным доступом к инфраструктуре дома.',
      iso(now, -index), iso(now, -20 + index * 3), nowIso,
    )),
  );

  const photoNames = ['rental-living.svg', 'rental-kitchen.svg', 'rental-bedroom.svg'];
  const photoSpecs = listingSpecs.flatMap((listing, listingIndex) => photoNames.map((file, sortOrder) => ({
    key: `${listing.key}:${sortOrder}`,
    listingIndex,
    sortOrder,
    file,
  })));
  const photoIds = await Promise.all(photoSpecs.map((item) => demoId(context.tenantId, `rental-photo:${item.key}`)));
  counters.rentalListingPhotos = await upsertEntity(
    context,
    'rental_listing_photos',
    photoIds,
    photoSpecs.map((item, index) => context.db.prepare(`
      INSERT INTO rental_listing_photos (id,listing_id,tenant_id,sort_order,data_url,created_at)
      VALUES (?,?,?,?,?,?)
      ON CONFLICT(id) DO NOTHING
    `).bind(
      photoIds[index], listingIds[item.listingIndex], context.tenantId, item.sortOrder,
      `/demo/${item.file}`, iso(now, -20 + item.listingIndex * 3),
    )),
  );

  const vehicleSpecs = [
    { key: 'resident-one', owner: users.resident, plate: '01A123BC', brand: 'Chevrolet', model: 'Tracker', color: 'Белый', year: 2024, primary: 1 },
    { key: 'resident-two', owner: users.resident, plate: '01B456DA', brand: 'BYD', model: 'Song Plus', color: 'Синий', year: 2023, primary: 0 },
    { key: 'tenant-one', owner: users.tenant, plate: '01C789EA', brand: 'Kia', model: 'K5', color: 'Чёрный', year: 2022, primary: 1 },
    { key: 'tenant-two', owner: users.tenant, plate: '01D321FA', brand: 'Chevrolet', model: 'Cobalt', color: 'Серебристый', year: 2021, primary: 0 },
    { key: 'resident-three', owner: users.resident, plate: '01E654GA', brand: 'Hyundai', model: 'Tucson', color: 'Серый', year: 2020, primary: 0 },
  ];
  const vehicleIds = await Promise.all(vehicleSpecs.map((item) => demoId(context.tenantId, `vehicle:${item.key}`)));
  counters.vehicles = await upsertEntity(
    context,
    'vehicles',
    vehicleIds,
    vehicleSpecs.map((item, index) => context.db.prepare(`
      INSERT INTO vehicles
        (id,user_id,plate_number,brand,model,color,year,vehicle_type,owner_type,company_name,
         parking_spot,notes,is_primary,created_at,updated_at,tenant_id)
       VALUES (?,?,?,?,?,?,?,'car','individual',NULL,?,NULL,?,?,?,?)
      ON CONFLICT(id) DO NOTHING
    `).bind(
      vehicleIds[index], item.owner.id, item.plate, item.brand, item.model, item.color, item.year,
       `P-${index + 11}`, item.primary, iso(now, -100 + index), nowIso, context.tenantId,
    )),
  );

  const guestSpecs = [
    { key: 'active', status: 'active', access: 'single_use', visitor: 'Акмал Рахимов', from: -1, until: 1, uses: 0, max: 1 },
    { key: 'day', status: 'active', access: 'day', visitor: 'Курьер Uzum', from: 0, until: 1, uses: 0, max: 8 },
    { key: 'used', status: 'used', access: 'single_use', visitor: 'Нодира Алиева', from: -4, until: -3, uses: 1, max: 1 },
    { key: 'revoked', status: 'revoked', access: 'single_use', visitor: 'Старый пропуск', from: -2, until: 2, uses: 0, max: 1 },
    { key: 'expired', status: 'expired', access: 'single_use', visitor: 'Гость прошлой недели', from: -8, until: -7, uses: 0, max: 1 },
  ];
  const guestIds = await Promise.all(guestSpecs.map((item) => demoId(context.tenantId, `guest-code:${item.key}`)));
  counters.guestAccessCodes = await upsertEntity(
    context,
    'guest_access_codes',
    guestIds,
    guestSpecs.map((item, index) => {
      const validFrom = iso(now, item.from);
      const validUntil = iso(now, item.until);
      const token = gapassToken({
        i: guestIds[index], rn: users.resident.name, rp: users.resident.phone,
        ra: users.resident.apartment, rd: users.resident.address,
        vt: index === 1 ? 'courier' : 'guest', at: item.access,
        vf: new Date(validFrom).getTime(), vu: new Date(validUntil).getTime(), mx: item.max,
        vn: item.visitor, vp: '', vv: '',
      });
      return context.db.prepare(`
        INSERT INTO guest_access_codes
          (id,user_id,resident_id,qr_token,code,visitor_type,visitor_name,visitor_phone,
           visitor_vehicle_plate,access_type,valid_from,valid_until,max_uses,current_uses,status,
           resident_name,resident_phone,resident_apartment,resident_address,notes,revoked_at,
           revoked_by,revoked_reason,created_at,updated_at,tenant_id)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(id) DO NOTHING
      `).bind(
        guestIds[index], users.resident.id, users.resident.id, token, `DEMO${index + 1}`,
        index === 1 ? 'courier' : 'guest', item.visitor, null, null, item.access,
        validFrom, validUntil, item.max, item.uses, item.status, users.resident.name,
        users.resident.phone, users.resident.apartment, users.resident.address,
        'Демонстрационный пропуск', item.status === 'revoked' ? iso(now, -1) : null,
        item.status === 'revoked' ? users.manager.id : null,
        item.status === 'revoked' ? 'Отменён жителем' : null,
        iso(now, item.from), nowIso, context.tenantId,
      );
    }),
  );

  const logSpecs = [
    { key: 'allowed', code: 2, action: 'entry_allowed', scanned: -4 },
    { key: 'used', code: 2, action: 'scan_used', scanned: -3 },
    { key: 'denied', code: 3, action: 'entry_denied', scanned: -1 },
  ];
  const logIds = await Promise.all(logSpecs.map((item) => demoId(context.tenantId, `guest-log:${item.key}`)));
  counters.guestAccessLogs = await upsertEntity(
    context,
    'guest_access_logs',
    logIds,
    logSpecs.map((item, index) => context.db.prepare(`
      INSERT INTO guest_access_logs
        (id,code_id,scanned_by_id,scanned_by_name,scanned_by_role,action,visitor_type,
         resident_name,resident_apartment,scanned_at,tenant_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(id) DO NOTHING
    `).bind(
       logIds[index], guestIds[item.code], users.security.id, users.security.name,
       users.security.role, item.action, 'guest', users.resident.name,
       users.resident.apartment, iso(now, item.scanned), context.tenantId,
    )),
  );

  return { phase: 'commerce', counters };
}

export const demoCommerceSeeder: DemoDomainSeeder = {
  phase: 'commerce',
  seed: provisionDemoCommerce,
};
