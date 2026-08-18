import { afterEach, beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error Worker tsconfig intentionally omits Node types.
import { execFileSync } from 'node:child_process';
// @ts-expect-error Worker tsconfig intentionally omits Node types.
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
// @ts-expect-error Worker tsconfig intentionally omits Node types.
import { tmpdir } from 'node:os';
// @ts-expect-error Worker tsconfig intentionally omits Node types.
import { join } from 'node:path';

import { provisionDemoCommerce, demoCommerceSeeder } from '../commerce';
import { demoId } from '../ids';

const schema = readFileSync(new URL('./fixtures/demo-production-schema.sql', import.meta.url), 'utf8');

function quote(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return String(value);
  return `'${String(value).replaceAll("'", "''")}'`;
}

function bindSql(sql: string, params: unknown[]): string {
  let index = 0;
  return sql.replace(/\?/g, () => quote(params[index++]));
}

function sqliteJson(dbPath: string, sql: string): any[] {
  const output = execFileSync('sqlite3', ['-json', dbPath, sql], { encoding: 'utf8' }).trim();
  return output ? JSON.parse(output) : [];
}

function createDb(dbPath: string, sqlLog: string[], batchSizes: number[]): D1Database {
  const prepare = (sql: string) => {
    let params: unknown[] = [];
    const statement = {
      bind(...values: unknown[]) { params = values; return statement; },
      async first() {
        sqlLog.push(sql);
        return sqliteJson(dbPath, bindSql(sql, params))[0] ?? null;
      },
      async all() {
        sqlLog.push(sql);
        return { results: sqliteJson(dbPath, bindSql(sql, params)), success: true, meta: {} };
      },
      async run() {
        sqlLog.push(sql);
        const result = sqliteJson(dbPath, `${bindSql(sql, params)}; SELECT changes() AS changes;`);
        return { success: true, meta: { changes: Number(result.at(-1)?.changes ?? 0) } };
      },
    };
    return statement;
  };
  return {
    prepare,
    async batch(statements: any[]) {
      batchSizes.push(statements.length);
      if (statements.length > 100) throw new Error('Demo batch exceeded 100 statements');
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      return results;
    },
  } as unknown as D1Database;
}

function run(dbPath: string, sql: string): void {
  execFileSync('sqlite3', [dbPath], { input: sql });
}

function rows(dbPath: string, sql: string): any[] {
  return sqliteJson(dbPath, sql);
}

const countSql = `
  SELECT 'marketplaceCategories' entity, COUNT(*) count FROM marketplace_categories WHERE tenant_id='tenant-demo'
  UNION ALL SELECT 'marketplaceProducts',COUNT(*) FROM marketplace_products WHERE tenant_id='tenant-demo'
  UNION ALL SELECT 'marketplaceOrders',COUNT(*) FROM marketplace_orders WHERE tenant_id='tenant-demo'
  UNION ALL SELECT 'marketplaceOrderItems',COUNT(*) FROM marketplace_order_items WHERE tenant_id='tenant-demo'
  UNION ALL SELECT 'marketplaceOrderHistory',COUNT(*) FROM marketplace_order_history WHERE tenant_id='tenant-demo'
  UNION ALL SELECT 'marketplaceFavorites',COUNT(*) FROM marketplace_favorites WHERE tenant_id='tenant-demo'
  UNION ALL SELECT 'marketplaceReviews',COUNT(*) FROM marketplace_reviews WHERE tenant_id='tenant-demo'
  UNION ALL SELECT 'adCategories',COUNT(*) FROM ad_categories WHERE tenant_id='tenant-demo'
  UNION ALL SELECT 'ads',COUNT(*) FROM ads WHERE tenant_id='tenant-demo'
  UNION ALL SELECT 'rentalApartments',COUNT(*) FROM rental_apartments WHERE tenant_id='tenant-demo'
  UNION ALL SELECT 'rentalRecords',COUNT(*) FROM rental_records WHERE tenant_id='tenant-demo'
  UNION ALL SELECT 'rentalListings',COUNT(*) FROM rental_listings WHERE tenant_id='tenant-demo'
  UNION ALL SELECT 'rentalListingPhotos',COUNT(*) FROM rental_listing_photos WHERE tenant_id='tenant-demo'
  UNION ALL SELECT 'vehicles',COUNT(*) FROM vehicles WHERE tenant_id='tenant-demo'
  UNION ALL SELECT 'guestAccessCodes',COUNT(*) FROM guest_access_codes WHERE tenant_id='tenant-demo'
  UNION ALL SELECT 'guestAccessLogs',COUNT(*) FROM guest_access_logs WHERE tenant_id='tenant-demo'
`;

describe('provisionDemoCommerce SQLite integration', () => {
  let directory: string;
  let dbPath: string;
  let sqlLog: string[];
  let batchSizes: number[];

  beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), 'kamizo-demo-commerce-'));
    dbPath = join(directory, 'fixture.db');
    sqlLog = [];
    batchSizes = [];
    const [buildingOne, buildingTwo] = await Promise.all([
      demoId('tenant-demo', 'building:caravan'),
      demoId('tenant-demo', 'building:mirzo'),
    ]);
    run(dbPath, schema + `
      INSERT INTO tenants (id,name,slug,url) VALUES
        ('tenant-demo','Demo','demo','https://demo.kamizo.uz'),
        ('tenant-other','Other','other','https://other.kamizo.uz');
      INSERT INTO users (id,login,password_hash,name,role,phone,address,apartment,tenant_id) VALUES
        ('resident-demo','98765432','hash','Demo Resident','resident','+998901200030','ул. Бобура, 24','49','tenant-demo'),
        ('manager-demo','demo-manager','hash','Demo Manager','manager','+998901200020',NULL,NULL,'tenant-demo'),
        ('market-manager-demo','demo-shop','hash','Demo Shop Manager','marketplace_manager','+998901200060',NULL,NULL,'tenant-demo'),
        ('courier-demo','demo-courier','hash','Demo Courier','executor','+998901200110',NULL,NULL,'tenant-demo'),
        ('tenant-user-demo','demo-tenant','hash','Demo Tenant','tenant','+998901200120','ул. Бобура, 24','52','tenant-demo'),
        ('advertiser-demo','demo-advertiser','hash','Demo Advertiser','advertiser','+998901200130',NULL,NULL,'tenant-demo'),
        ('security-demo','demo-security','hash','Demo Security','security','+998901200050',NULL,NULL,'tenant-demo'),
        ('other-resident','98765000','hash','Other Resident','resident','+998900000000','Other','1','tenant-other');
      INSERT INTO buildings (id,name,address,tenant_id) VALUES
        (${quote(buildingOne)},'Caravan','ул. Бобура, 24','tenant-demo'),
        (${quote(buildingTwo)},'Mirzo','ул. Мирзо Улугбека, 55','tenant-demo'),
        ('other-building','Other','Other address','tenant-other');
      INSERT INTO marketplace_categories (id,name_ru,name_uz,tenant_id) VALUES
        ('existing-category','Existing','Existing','tenant-demo'),
        ('other-category','Other','Other','tenant-other');
      INSERT INTO marketplace_products
        (id,category_id,name_ru,name_uz,price,stock_quantity,image_url,tenant_id)
      VALUES
        ('existing-product','existing-category','Existing product','Existing product',1,1,'/existing.svg','tenant-demo'),
        ('other-product','other-category','Other product','Other product',2,2,'/other.svg','tenant-other');
    `);
  });

  afterEach(() => rmSync(directory, { recursive: true, force: true }));

  it('rejects every tenant except the exact demo slug before writing', async () => {
    const db = createDb(dbPath, sqlLog, batchSizes);
    const countsBefore = rows(dbPath, countSql);
    await expect(provisionDemoCommerce({
      db,
      tenantId: 'tenant-demo',
      tenantSlug: 'other' as 'demo',
      now: new Date('2026-08-16T12:00:00.000Z'),
      createPasswordHash: async () => 'unused',
    })).rejects.toThrow('exact demo slug');
    expect(rows(dbPath, countSql)).toEqual(countsBefore);
  });

  it('seeds a tenant-valid presentation dataset and is stable on rerun', async () => {
    const db = createDb(dbPath, sqlLog, batchSizes);
    const context = {
      db,
      tenantId: 'tenant-demo',
      tenantSlug: 'demo' as const,
      now: new Date('2026-08-16T12:00:00.000Z'),
      createPasswordHash: async () => 'unused',
    };
    const unrelatedBefore = rows(dbPath, `
      SELECT id,name_ru,price,stock_quantity,image_url,tenant_id FROM marketplace_products
      WHERE id IN ('existing-product','other-product') ORDER BY id
    `);

    const first = await provisionDemoCommerce(context);
    const countsAfterFirst = rows(dbPath, countSql);
    const second = await demoCommerceSeeder.seed(context);
    const countsAfterSecond = rows(dbPath, countSql);

    expect(demoCommerceSeeder.phase).toBe('commerce');
    expect(first.phase).toBe('commerce');
    expect(first.counters).toMatchObject({
      marketplaceCategories: { created: 4 }, marketplaceProducts: { created: 8 },
      marketplaceOrders: { created: 6 }, marketplaceOrderItems: { created: 6 },
      marketplaceOrderHistory: { created: 22 }, marketplaceFavorites: { created: 1 },
      marketplaceReviews: { created: 1 }, adCategories: { created: 1 }, ads: { created: 1 },
      rentalApartments: { created: 2 }, rentalRecords: { created: 4 },
      rentalListings: { created: 5 }, rentalListingPhotos: { created: 15 },
      vehicles: { created: 5 }, guestAccessCodes: { created: 5 }, guestAccessLogs: { created: 3 },
    });
    expect(Object.values(second.counters).every((counter) => counter.created === 0)).toBe(true);
    expect(countsAfterSecond).toEqual(countsAfterFirst);
    expect(batchSizes.every((size) => size <= 100)).toBe(true);

    expect(rows(dbPath, `
      SELECT COUNT(*) count FROM marketplace_products
      WHERE tenant_id='tenant-demo' AND image_url LIKE '/demo/%' AND is_active=1
    `)[0].count).toBe(8);
    expect(rows(dbPath, `SELECT COUNT(*) count FROM marketplace_products WHERE tenant_id='tenant-demo' AND is_featured=1`)[0].count).toBeGreaterThan(0);
    expect(rows(dbPath, `SELECT COUNT(*) count FROM marketplace_products WHERE tenant_id='tenant-demo' AND old_price > price`)[0].count).toBeGreaterThan(0);
    expect(rows(dbPath, `SELECT COUNT(*) count FROM marketplace_products WHERE tenant_id='tenant-demo' AND price=0`)[0].count).toBeGreaterThan(0);
    expect(rows(dbPath, `SELECT COUNT(*) count FROM marketplace_products WHERE tenant_id='tenant-demo' AND stock_quantity=0`)[0].count).toBeGreaterThan(0);
    expect(rows(dbPath, `SELECT status FROM marketplace_orders WHERE tenant_id='tenant-demo' ORDER BY status`).map((row) => row.status)).toEqual([
      'delivered', 'delivering', 'new', 'preparing', 'price_offered', 'ready',
    ]);
    const commerceContract = await import('../commerce') as unknown as {
      demoCommerceExpectedOrderStatuses?: readonly string[];
    };
    expect(commerceContract.demoCommerceExpectedOrderStatuses).toEqual([
      'new', 'preparing', 'ready', 'delivering', 'delivered', 'price_offered',
    ]);
    expect(rows(dbPath, `SELECT COUNT(*) count FROM marketplace_orders WHERE tenant_id='tenant-demo' AND order_number LIKE 'DEMO-%'`)[0].count).toBe(6);
    expect(rows(dbPath, `SELECT COUNT(DISTINCT order_number) count FROM marketplace_orders WHERE tenant_id='tenant-demo'`)[0].count).toBe(6);
    expect(rows(dbPath, `SELECT order_number FROM marketplace_orders WHERE tenant_id='tenant-demo'`).every((row) => row.order_number.length === 37)).toBe(true);
    expect(rows(dbPath, `SELECT COUNT(*) count FROM marketplace_orders WHERE tenant_id='tenant-demo' AND rating IS NOT NULL AND review IS NOT NULL`)[0].count).toBe(1);
    expect(rows(dbPath, `SELECT COUNT(*) count FROM marketplace_orders WHERE tenant_id='tenant-demo' AND order_type='on_demand' AND status='price_offered' AND price_offered_at IS NOT NULL`)[0].count).toBe(1);

    const histories = rows(dbPath, `
      SELECT o.status order_status,o.created_at,o.assigned_at,o.confirmed_at,o.preparing_at,
        o.ready_at,o.delivering_at,o.delivered_at,o.price_offered_at,
        GROUP_CONCAT(h.status, ',') history_statuses,GROUP_CONCAT(h.created_at, ',') history_dates
      FROM marketplace_orders o JOIN marketplace_order_history h
        ON h.order_id=o.id AND h.tenant_id=o.tenant_id
      WHERE o.tenant_id='tenant-demo'
      GROUP BY o.id ORDER BY o.status
    `);
    const expectedTransitions: Record<string, string[]> = {
      new: ['new'],
      preparing: ['new', 'confirmed', 'preparing'],
      ready: ['new', 'confirmed', 'preparing', 'ready'],
      delivering: ['new', 'confirmed', 'preparing', 'ready', 'delivering'],
      delivered: ['new', 'confirmed', 'preparing', 'ready', 'delivering', 'delivered'],
      price_offered: ['awaiting_price', 'price_pending', 'price_offered'],
    };
    for (const history of histories) {
      const statuses = String(history.history_statuses).split(',');
      const dates = String(history.history_dates).split(',');
      expect(statuses).toEqual(expectedTransitions[history.order_status]);
      expect(dates).toEqual([...dates].sort());
      const timestamps: Record<string, string> = {
        new: history.created_at,
        awaiting_price: history.created_at,
        price_pending: history.assigned_at,
        confirmed: history.confirmed_at,
        preparing: history.preparing_at,
        ready: history.ready_at,
        delivering: history.delivering_at,
        delivered: history.delivered_at,
        price_offered: history.price_offered_at,
      };
      expect(dates).toEqual(statuses.map((status) => timestamps[status]));
    }

    expect(rows(dbPath, `
      SELECT COUNT(*) orphan_count FROM marketplace_order_items i
      LEFT JOIN marketplace_orders o ON o.id=i.order_id AND o.tenant_id=i.tenant_id
      LEFT JOIN marketplace_products p ON p.id=i.product_id AND p.tenant_id=i.tenant_id
      WHERE i.tenant_id='tenant-demo' AND (o.id IS NULL OR p.id IS NULL)
    `)[0].orphan_count).toBe(0);
    expect(rows(dbPath, `
      SELECT COUNT(*) orphan_count FROM marketplace_order_history h
      LEFT JOIN marketplace_orders o ON o.id=h.order_id AND o.tenant_id=h.tenant_id
      LEFT JOIN users u ON u.id=h.changed_by AND u.tenant_id=h.tenant_id
      WHERE h.tenant_id='tenant-demo' AND (o.id IS NULL OR u.id IS NULL)
    `)[0].orphan_count).toBe(0);
    expect(rows(dbPath, `
      SELECT COUNT(*) orphan_count FROM marketplace_reviews r
      LEFT JOIN marketplace_products p ON p.id=r.product_id AND p.tenant_id=r.tenant_id
      LEFT JOIN marketplace_orders o ON o.id=r.order_id AND o.tenant_id=r.tenant_id
      LEFT JOIN users u ON u.id=r.user_id AND u.tenant_id=r.tenant_id
      WHERE r.tenant_id='tenant-demo' AND (p.id IS NULL OR o.id IS NULL OR u.id IS NULL)
    `)[0].orphan_count).toBe(0);

    expect(rows(dbPath, `
      SELECT COUNT(*) invalid_count FROM rental_apartments a
      LEFT JOIN users u ON u.id=a.owner_id AND u.tenant_id=a.tenant_id
      WHERE a.tenant_id='tenant-demo' AND (u.id IS NULL OR u.role!='tenant' OR a.owner_type!='tenant')
    `)[0].invalid_count).toBe(0);
    expect(rows(dbPath, `
      SELECT state,COUNT(*) count FROM rental_listings WHERE tenant_id='tenant-demo'
      GROUP BY state ORDER BY state
    `)).toEqual([{ state: 'active', count: 3 }, { state: 'hidden', count: 1 }, { state: 'rented', count: 1 }]);
    expect(rows(dbPath, `
      SELECT l.id,COUNT(p.id) photo_count,COUNT(CASE WHEN p.data_url LIKE '/demo/%' THEN 1 END) local_count
      FROM rental_listings l LEFT JOIN rental_listing_photos p
        ON p.listing_id=l.id AND p.tenant_id=l.tenant_id
      WHERE l.tenant_id='tenant-demo' GROUP BY l.id
    `).every((row) => row.photo_count === 3 && row.local_count === 3)).toBe(true);
    expect(rows(dbPath, `
      SELECT COUNT(*) invalid_count FROM rental_listings l
      LEFT JOIN users u ON u.id=l.publisher_user_id AND u.tenant_id=l.tenant_id
      LEFT JOIN buildings b ON b.id=l.building_id AND b.tenant_id=l.tenant_id
      WHERE l.tenant_id='tenant-demo' AND (
        u.id IS NULL OR b.id IS NULL OR
        (l.source_type='resident' AND u.role!='resident') OR
        (l.source_type='uk' AND u.role NOT IN ('manager','director','admin'))
      )
    `)[0].invalid_count).toBe(0);

    expect(rows(dbPath, `SELECT plate_number FROM vehicles WHERE tenant_id='tenant-demo'`).every((row) => /^[A-Z0-9]{4,12}$/.test(row.plate_number))).toBe(true);
    expect(rows(dbPath, `
      SELECT COUNT(*) orphan_count FROM vehicles v LEFT JOIN users u
        ON u.id=v.user_id AND u.tenant_id=v.tenant_id
      WHERE v.tenant_id='tenant-demo' AND u.id IS NULL
    `)[0].orphan_count).toBe(0);

    const guestCodes = rows(dbPath, `SELECT id,qr_token,status,access_type FROM guest_access_codes WHERE tenant_id='tenant-demo' ORDER BY status,access_type`);
    expect(guestCodes.map((row) => row.status)).toEqual(['active', 'active', 'expired', 'revoked', 'used']);
    expect(guestCodes.some((row) => row.access_type === 'day')).toBe(true);
    for (const code of guestCodes) {
      expect(code.qr_token.startsWith('GAPASS:')).toBe(true);
      const bytes = Uint8Array.from(atob(code.qr_token.slice(7)), (character) => character.charCodeAt(0));
      const decoded = JSON.parse(new TextDecoder().decode(bytes));
      expect(decoded.i).toBe(code.id);
    }
    expect(rows(dbPath, `
      SELECT COUNT(*) invalid_count FROM guest_access_logs l
      LEFT JOIN guest_access_codes c ON c.id=l.code_id AND c.tenant_id=l.tenant_id
      LEFT JOIN users u ON u.id=l.scanned_by_id AND u.tenant_id=l.tenant_id
      WHERE l.tenant_id='tenant-demo' AND (c.id IS NULL OR u.role!='security')
    `)[0].invalid_count).toBe(0);

    expect(rows(dbPath, `SELECT COUNT(*) count FROM ads WHERE tenant_id='tenant-demo' AND status='active'`)[0].count).toBe(1);
    expect(rows(dbPath, `
      SELECT COUNT(*) orphan_count FROM ads a
      LEFT JOIN ad_categories c ON c.id=a.category_id AND c.tenant_id=a.tenant_id
      LEFT JOIN users u ON u.id=a.created_by AND u.tenant_id=a.tenant_id
      WHERE a.tenant_id='tenant-demo' AND (c.id IS NULL OR u.role!='advertiser')
    `)[0].orphan_count).toBe(0);

    expect(rows(dbPath, `
      SELECT id,name_ru,price,stock_quantity,image_url,tenant_id FROM marketplace_products
      WHERE id IN ('existing-product','other-product') ORDER BY id
    `)).toEqual(unrelatedBefore);
    expect(sqlLog.filter((sql) => /^(\s*)(SELECT|INSERT|UPDATE)/i.test(sql)).every((sql) => /tenant_id|tenants/i.test(sql))).toBe(true);
  }, 60_000);

  it('preserves mutable commerce lifecycle state on rerun', async () => {
    const context = {
      db: createDb(dbPath, sqlLog, batchSizes), tenantId: 'tenant-demo', tenantSlug: 'demo' as const,
      now: new Date('2026-08-16T12:00:00.000Z'), createPasswordHash: async () => 'unused',
    };
    await provisionDemoCommerce(context);

    const order = rows(dbPath, `SELECT id FROM marketplace_orders WHERE tenant_id='tenant-demo' AND status='new'`)[0];
    const listing = rows(dbPath, `SELECT id FROM rental_listings WHERE tenant_id='tenant-demo' AND state='active' ORDER BY id LIMIT 1`)[0];
    const pass = rows(dbPath, `SELECT id FROM guest_access_codes WHERE tenant_id='tenant-demo' AND status='active' ORDER BY id LIMIT 1`)[0];
    const review = rows(dbPath, `SELECT id FROM marketplace_reviews WHERE tenant_id='tenant-demo'`)[0];
    const log = rows(dbPath, `SELECT id FROM guest_access_logs WHERE tenant_id='tenant-demo' ORDER BY id LIMIT 1`)[0];
    const category = rows(dbPath, `SELECT id FROM marketplace_categories WHERE tenant_id='tenant-demo' ORDER BY id LIMIT 1`)[0];
    const product = rows(dbPath, `SELECT id FROM marketplace_products WHERE tenant_id='tenant-demo' ORDER BY id LIMIT 1`)[0];
    const ad = rows(dbPath, `SELECT id FROM ads WHERE tenant_id='tenant-demo'`)[0];
    const rentalApartment = rows(dbPath, `SELECT id FROM rental_apartments WHERE tenant_id='tenant-demo' ORDER BY id LIMIT 1`)[0];
    const photo = rows(dbPath, `SELECT id FROM rental_listing_photos WHERE tenant_id='tenant-demo' ORDER BY id LIMIT 1`)[0];
    const vehicle = rows(dbPath, `SELECT id FROM vehicles WHERE tenant_id='tenant-demo' ORDER BY id LIMIT 1`)[0];
    run(dbPath, `
      UPDATE marketplace_orders SET status='cancelled',cancelled_at='2026-08-17T10:00:00.000Z',
        cancellation_reason='Resident changed plans',rating=2,review='Lifecycle review'
        WHERE id=${quote(order.id)} AND tenant_id='tenant-demo';
      INSERT INTO marketplace_order_history (id,order_id,status,comment,changed_by,created_at,tenant_id)
        VALUES ('manual-order-history',${quote(order.id)},'cancelled','Manual progress','resident-demo','2026-08-17T10:00:00.000Z','tenant-demo');
      UPDATE rental_listings SET state='rented',hidden_reason=NULL,hidden_by_user_id=NULL,hidden_at=NULL,
        last_confirmed_at='2026-08-17T09:00:00.000Z' WHERE id=${quote(listing.id)} AND tenant_id='tenant-demo';
      UPDATE guest_access_codes SET status='used',current_uses=1,updated_at='2026-08-17T08:00:00.000Z'
        WHERE id=${quote(pass.id)} AND tenant_id='tenant-demo';
      UPDATE marketplace_reviews SET rating=3,comment='Resident edited review',is_visible=0
        WHERE id=${quote(review.id)} AND tenant_id='tenant-demo';
      UPDATE guest_access_logs SET action='manual_review',notes='Security annotated log'
        WHERE id=${quote(log.id)} AND tenant_id='tenant-demo';
      INSERT INTO guest_access_logs (id,code_id,action,notes,tenant_id)
        VALUES ('manual-guest-log',${quote(pass.id)},'manual_entry','Manual log','tenant-demo');
      UPDATE marketplace_categories SET is_active=0 WHERE id=${quote(category.id)} AND tenant_id='tenant-demo';
      UPDATE marketplace_products SET stock_quantity=3,orders_count=999,is_active=0
        WHERE id=${quote(product.id)} AND tenant_id='tenant-demo';
      UPDATE ads SET status='paused',views_count=777,
        starts_at='2026-08-01T00:00:00.000Z',expires_at='2027-08-01T00:00:00.000Z',
        updated_at='2026-08-17T07:00:00.000Z'
        WHERE id=${quote(ad.id)} AND tenant_id='tenant-demo';
      UPDATE rental_apartments SET is_active=0 WHERE id=${quote(rentalApartment.id)} AND tenant_id='tenant-demo';
      UPDATE rental_listings SET price_monthly=1234567 WHERE id=${quote(listing.id)} AND tenant_id='tenant-demo';
      UPDATE rental_listing_photos SET sort_order=9,data_url='/demo/resident-photo.svg'
        WHERE id=${quote(photo.id)} AND tenant_id='tenant-demo';
      UPDATE vehicles SET is_primary=0,parking_spot='USER-42' WHERE id=${quote(vehicle.id)} AND tenant_id='tenant-demo';
    `);
    const lifecycleBefore = {
      order: rows(dbPath, `SELECT status,cancelled_at,cancellation_reason,rating,review FROM marketplace_orders WHERE id=${quote(order.id)}`),
      listing: rows(dbPath, `SELECT state,last_confirmed_at FROM rental_listings WHERE id=${quote(listing.id)}`),
      pass: rows(dbPath, `SELECT status,current_uses,updated_at FROM guest_access_codes WHERE id=${quote(pass.id)}`),
      review: rows(dbPath, `SELECT rating,comment,is_visible FROM marketplace_reviews WHERE id=${quote(review.id)}`),
      log: rows(dbPath, `SELECT action,notes FROM guest_access_logs WHERE id=${quote(log.id)}`),
      history: rows(dbPath, `SELECT status,comment,created_at FROM marketplace_order_history WHERE id='manual-order-history'`),
      logCount: rows(dbPath, `SELECT COUNT(*) count FROM guest_access_logs WHERE tenant_id='tenant-demo'`),
      category: rows(dbPath, `SELECT is_active FROM marketplace_categories WHERE id=${quote(category.id)}`),
      product: rows(dbPath, `SELECT stock_quantity,orders_count,is_active FROM marketplace_products WHERE id=${quote(product.id)}`),
      ad: rows(dbPath, `SELECT status,views_count,starts_at,expires_at,updated_at FROM ads WHERE id=${quote(ad.id)}`),
      rentalApartment: rows(dbPath, `SELECT is_active FROM rental_apartments WHERE id=${quote(rentalApartment.id)}`),
      listingPrice: rows(dbPath, `SELECT price_monthly FROM rental_listings WHERE id=${quote(listing.id)}`),
      photo: rows(dbPath, `SELECT sort_order,data_url FROM rental_listing_photos WHERE id=${quote(photo.id)}`),
      vehicle: rows(dbPath, `SELECT is_primary,parking_spot FROM vehicles WHERE id=${quote(vehicle.id)}`),
    };

    await provisionDemoCommerce({ ...context, now: new Date('2026-09-16T12:00:00.000Z') });

    expect(rows(dbPath, `SELECT status,cancelled_at,cancellation_reason,rating,review FROM marketplace_orders WHERE id=${quote(order.id)}`)).toEqual(lifecycleBefore.order);
    expect(rows(dbPath, `SELECT state,last_confirmed_at FROM rental_listings WHERE id=${quote(listing.id)}`)).toEqual(lifecycleBefore.listing);
    expect(rows(dbPath, `SELECT status,current_uses,updated_at FROM guest_access_codes WHERE id=${quote(pass.id)}`)).toEqual(lifecycleBefore.pass);
    expect(rows(dbPath, `SELECT rating,comment,is_visible FROM marketplace_reviews WHERE id=${quote(review.id)}`)).toEqual(lifecycleBefore.review);
    expect(rows(dbPath, `SELECT action,notes FROM guest_access_logs WHERE id=${quote(log.id)}`)).toEqual(lifecycleBefore.log);
    expect(rows(dbPath, `SELECT status,comment,created_at FROM marketplace_order_history WHERE id='manual-order-history'`)).toEqual(lifecycleBefore.history);
    expect(rows(dbPath, `SELECT COUNT(*) count FROM guest_access_logs WHERE tenant_id='tenant-demo'`)).toEqual(lifecycleBefore.logCount);
    expect(rows(dbPath, `SELECT is_active FROM marketplace_categories WHERE id=${quote(category.id)}`)).toEqual(lifecycleBefore.category);
    expect(rows(dbPath, `SELECT stock_quantity,orders_count,is_active FROM marketplace_products WHERE id=${quote(product.id)}`)).toEqual(lifecycleBefore.product);
    expect(rows(dbPath, `SELECT status,views_count,starts_at,expires_at,updated_at FROM ads WHERE id=${quote(ad.id)}`)).toEqual(lifecycleBefore.ad);
    expect(rows(dbPath, `SELECT is_active FROM rental_apartments WHERE id=${quote(rentalApartment.id)}`)).toEqual(lifecycleBefore.rentalApartment);
    expect(rows(dbPath, `SELECT price_monthly FROM rental_listings WHERE id=${quote(listing.id)}`)).toEqual(lifecycleBefore.listingPrice);
    expect(rows(dbPath, `SELECT sort_order,data_url FROM rental_listing_photos WHERE id=${quote(photo.id)}`)).toEqual(lifecycleBefore.photo);
    expect(rows(dbPath, `SELECT is_primary,parking_spot FROM vehicles WHERE id=${quote(vehicle.id)}`)).toEqual(lifecycleBefore.vehicle);
  }, 60_000);
});
