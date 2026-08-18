import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error Worker tsconfig intentionally omits Node types.
import { execFileSync } from 'node:child_process';
// @ts-expect-error Worker tsconfig intentionally omits Node types.
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
// @ts-expect-error Worker tsconfig intentionally omits Node types.
import { tmpdir } from 'node:os';
// @ts-expect-error Worker tsconfig intentionally omits Node types.
import { join } from 'node:path';

const contractUrl = new URL('./fixtures/demo-production-schema.sql', import.meta.url);
let directory: string | undefined;

function pragma(dbPath: string, table: string): Array<Record<string, unknown>> {
  const output = execFileSync('sqlite3', ['-json', dbPath, `PRAGMA table_info(${table})`], { encoding: 'utf8' }).trim();
  return output ? JSON.parse(output) : [];
}

describe('checked-in demo production schema contract', () => {
  afterEach(() => {
    if (directory) rmSync(directory, { recursive: true, force: true });
    directory = undefined;
  });

  it('recreates the verified production columns and required flags', () => {
    expect(existsSync(contractUrl)).toBe(true);
    if (!existsSync(contractUrl)) return;

    directory = mkdtempSync(join(tmpdir(), 'kamizo-demo-schema-contract-'));
    const dbPath = join(directory, 'contract.db');
    execFileSync('sqlite3', [dbPath], { input: readFileSync(contractUrl, 'utf8') });

    const expected: Record<string, Array<[string, string, number]>> = {
      marketplace_reviews: [
        ['comment', 'TEXT', 0], ['images', 'TEXT', 0], ['is_verified_purchase', 'INTEGER', 0],
      ],
      ad_categories: [['name', 'TEXT', 1], ['name_ru', 'TEXT', 0], ['name_uz', 'TEXT', 0]],
      ads: [['advertiser_id', 'TEXT', 1], ['title', 'TEXT', 1], ['tenant_id', 'TEXT', 0]],
      personal_accounts: [
        ['apartment_id', 'TEXT', 1], ['account_number', 'TEXT', 0], ['balance', 'REAL', 0],
        ['last_payment_date', 'TEXT', 0], ['last_payment_amount', 'REAL', 0], ['tenant_id', 'TEXT', 0],
      ],
      finance_charges: [['status', 'TEXT', 0], ['paid_amount', 'REAL', 0]],
      finance_materials: [['quantity', 'REAL', 0]],
      meeting_eligible_voters: [
        ['id', 'TEXT', 0], ['meeting_id', 'TEXT', 1], ['user_id', 'TEXT', 1],
        ['apartment_id', 'TEXT', 0], ['voting_weight', 'REAL', 0], ['has_voted', 'INTEGER', 0],
        ['created_at', 'TEXT', 0], ['tenant_id', 'TEXT', 0],
      ],
      meeting_participated_voters: [
        ['id', 'TEXT', 0], ['meeting_id', 'TEXT', 1], ['user_id', 'TEXT', 1],
        ['participation_type', 'TEXT', 0], ['participated_at', 'TEXT', 0], ['tenant_id', 'TEXT', 0],
      ],
      meeting_vote_records: [
        ['id', 'TEXT', 0], ['meeting_id', 'TEXT', 1], ['agenda_item_id', 'TEXT', 1],
        ['user_id', 'TEXT', 1], ['vote', 'TEXT', 1], ['vote_weight', 'REAL', 0],
        ['voted_at', 'TEXT', 0], ['voter_id', 'TEXT', 0], ['choice', 'TEXT', 0],
        ['vote_hash', 'TEXT', 0], ['tenant_id', 'TEXT', 0],
      ],
      meeting_protocols: [
        ['id', 'TEXT', 0], ['meeting_id', 'TEXT', 1], ['protocol_number', 'TEXT', 0],
        ['content', 'TEXT', 0], ['decisions', 'TEXT', 0], ['created_at', 'TEXT', 0],
        ['protocol_hash', 'TEXT', 0], ['tenant_id', 'TEXT', 0],
      ],
      push_subscriptions: [
        ['id', 'TEXT', 0], ['user_id', 'TEXT', 1], ['endpoint', 'TEXT', 1],
        ['p256dh', 'TEXT', 1], ['auth', 'TEXT', 1], ['created_at', 'TEXT', 0],
        ['last_used_at', 'TEXT', 0],
      ],
    };

    for (const [table, columns] of Object.entries(expected)) {
      const actual = new Map(pragma(dbPath, table).map((column) => [
        column.name,
        [column.type, column.notnull],
      ]));
      for (const [name, type, required] of columns) {
        expect(actual.get(name), `${table}.${name}`).toEqual([type, required]);
      }
    }

    const personalAccountColumns = pragma(dbPath, 'personal_accounts').map((column) => column.name);
    expect(personalAccountColumns).not.toContain('number');
    expect(personalAccountColumns).not.toContain('building_id');
    expect(personalAccountColumns).not.toContain('current_debt');
    expect(personalAccountColumns).not.toContain('updated_at');

    const commerceColumns: Record<string, string[]> = {
      marketplace_categories: ['id','name_ru','name_uz','icon','parent_id','sort_order','is_active','created_at','tenant_id'],
      marketplace_products: ['id','category_id','name_ru','name_uz','description_ru','description_uz','price','old_price','unit','stock_quantity','min_order_quantity','max_order_quantity','weight','weight_unit','image_url','images','is_active','is_featured','rating','reviews_count','orders_count','created_by','created_at','updated_at','tenant_id','is_on_demand'],
      marketplace_orders: ['id','order_number','user_id','status','total_amount','delivery_fee','discount_amount','final_amount','delivery_address','delivery_apartment','delivery_entrance','delivery_floor','delivery_phone','delivery_notes','delivery_date','delivery_time_slot','payment_method','payment_status','assigned_to','confirmed_at','preparing_at','ready_at','delivering_at','delivered_at','cancelled_at','cancellation_reason','rating','review','created_at','updated_at','executor_id','assigned_at','tenant_id','order_type','price_offered_at','price_offered_expires_at'],
      marketplace_order_items: ['id','order_id','product_id','product_name','product_image','quantity','unit_price','total_price','created_at','tenant_id'],
      marketplace_order_history: ['id','order_id','status','comment','changed_by','created_at','tenant_id'],
      marketplace_favorites: ['id','user_id','product_id','created_at','tenant_id'],
      marketplace_reviews: ['id','product_id','user_id','order_id','rating','comment','images','is_verified_purchase','is_visible','created_at','tenant_id'],
      ad_categories: ['id','name','description','icon','is_active','created_at','tenant_id','name_ru','name_uz','sort_order'],
      ads: ['id','advertiser_id','title','description','category_id','image_url','link_url','is_active','impressions','clicks','budget','spent','start_date','end_date','created_at','updated_at','tenant_id','phone','phone2','telegram','instagram','facebook','website','address','work_hours','work_days','logo_url','photos','discount_percent','badges','target_type','target_branches','starts_at','expires_at','duration_type','status','created_by','views_count','coupons_issued','coupons_activated','target_buildings'],
      rental_apartments: ['id','name','address','apartment','owner_id','owner_type','is_active','created_at','updated_at','tenant_id'],
      rental_records: ['id','apartment_id','guest_names','passport_info','check_in_date','check_out_date','amount','currency','notes','created_by','created_at','updated_at','tenant_id'],
      rental_listings: ['id','tenant_id','publisher_user_id','source_type','state','hidden_reason','hidden_by_user_id','hidden_at','rooms','area_m2','floor','floor_total','apartment_number','entrance','building_id','price_monthly','price_currency','deposit_months','furnished','air_conditioning','internet','parking','animals_allowed','duration_type','description','phone_visible','last_confirmed_at','confirm_prompt_sent_at','created_at','updated_at'],
      rental_listing_photos: ['id','listing_id','tenant_id','sort_order','data_url','created_at'],
      vehicles: ['id','user_id','plate_number','brand','model','color','year','vehicle_type','owner_type','company_name','parking_spot','notes','is_primary','created_at','updated_at','resident_id','tenant_id'],
      guest_access_codes: ['id','user_id','resident_id','qr_token','code','visitor_type','visitor_name','visitor_phone','visitor_vehicle_plate','access_type','valid_from','valid_until','max_uses','current_uses','status','resident_name','resident_phone','resident_apartment','resident_address','notes','revoked_at','revoked_by','revoked_reason','building_id','created_at','updated_at','tenant_id'],
      guest_access_logs: ['id','code_id','action','scanned_by','scanned_at','location','notes','tenant_id','scanned_by_id','scanned_by_name','scanned_by_role','visitor_type','resident_name','resident_apartment'],
    };
    for (const [table, expectedColumns] of Object.entries(commerceColumns)) {
      expect(pragma(dbPath, table).map((column) => column.name), table).toEqual(expectedColumns);
    }

    const meetingColumns: Record<string, string[]> = {
      meeting_eligible_voters: ['id','meeting_id','user_id','apartment_id','voting_weight','has_voted','created_at','tenant_id'],
      meeting_participated_voters: ['id','meeting_id','user_id','participation_type','participated_at','tenant_id'],
      meeting_vote_records: ['id','meeting_id','agenda_item_id','user_id','vote','vote_weight','voted_at','changed_after_reconsideration','reconsideration_request_id','voter_id','choice','voter_name','apartment_id','apartment_number','ownership_share','is_revote','verification_method','otp_verified','vote_hash','previous_vote_id','tenant_id'],
      meeting_protocols: ['id','meeting_id','protocol_number','content','decisions','signed_by','signed_at','file_url','created_at','protocol_hash','signed_by_uk_user_id','signed_by_uk_name','signed_by_uk_role','signed_by_uk_at','uk_signature_hash','chairman_user_id','chairman_name','chairman_apartment','chairman_signed_at','chairman_signature_hash','secretary_user_id','secretary_name','secretary_apartment','secretary_signed_at','secretary_signature_hash','counting_commission','tenant_id'],
    };
    for (const [table, expectedColumns] of Object.entries(meetingColumns)) {
      expect(pragma(dbPath, table).map((column) => column.name), table).toEqual(expectedColumns);
    }

    const engagementColumns: Record<string, string[]> = {
      training_partners: ['id','name','description','logo_url','website','contact_email','contact_phone','is_active','created_at','tenant_id'],
      training_proposals: ['id','partner_id','title','description','category','price','duration','max_participants','start_date','end_date','location','status','created_at','tenant_id'],
      training_votes: ['id','proposal_id','user_id','vote','created_at','tenant_id'],
      training_registrations: ['id','proposal_id','user_id','status','registered_at','attended','feedback_submitted','tenant_id'],
      training_feedback: ['id','proposal_id','user_id','rating','comment','created_at','tenant_id'],
      training_notifications: ['id','proposal_id','user_id','notification_type','sent_at','is_read','tenant_id'],
      employee_ratings: ['id','executor_id','request_id','rating','comment','rated_by','created_at','tenant_id'],
      notes: ['id','user_id','title','content','tenant_id','created_at','updated_at'],
    };
    for (const [table, expectedColumns] of Object.entries(engagementColumns)) {
      expect(pragma(dbPath, table).map((column) => column.name), table).toEqual(expectedColumns);
    }
    expect(pragma(dbPath, 'training_settings')).toEqual([]);
    expect(pragma(dbPath, 'employee_thanks')).toEqual([]);

    expect(pragma(dbPath, 'apartments').map((column) => column.name)).toEqual(expect.arrayContaining([
      'property_type', 'is_commercial', 'is_basement', 'is_parking',
    ]));
  });
});
