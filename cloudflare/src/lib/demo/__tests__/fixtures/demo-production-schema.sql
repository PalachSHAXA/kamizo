-- Read-only snapshot of production sqlite_master contracts, 2026-08-17.
PRAGMA foreign_keys = ON;

CREATE TABLE tenants (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, slug TEXT UNIQUE NOT NULL, url TEXT NOT NULL,
  admin_url TEXT, color TEXT DEFAULT '#6366f1', color_secondary TEXT DEFAULT '#a855f7',
  plan TEXT DEFAULT 'basic', features TEXT DEFAULT '["requests","votes","qr"]',
  admin_email TEXT, admin_phone TEXT, users_count INTEGER DEFAULT 0,
  requests_count INTEGER DEFAULT 0, votes_count INTEGER DEFAULT 0, qr_count INTEGER DEFAULT 0,
  revenue TEXT DEFAULT '0', is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')),
  logo TEXT, contract_template TEXT, is_demo INTEGER DEFAULT 0,
  show_useful_contacts_banner INTEGER DEFAULT 1, show_marketplace_banner INTEGER DEFAULT 1,
  contract_r2_key TEXT, contract_filename TEXT, contract_uploaded_at TEXT, contract_uploaded_by TEXT
);

CREATE TABLE users (
  id TEXT PRIMARY KEY, login TEXT NOT NULL, phone TEXT, password_hash TEXT NOT NULL,
  name TEXT NOT NULL, role TEXT NOT NULL, specialization TEXT, email TEXT, avatar_url TEXT,
  address TEXT, apartment TEXT, building_id TEXT, entrance TEXT, floor TEXT, branch TEXT,
  building TEXT, language TEXT DEFAULT 'ru', is_active INTEGER DEFAULT 1, qr_code TEXT,
  contract_signed_at TEXT, agreed_to_terms_at TEXT, contract_number TEXT,
  contract_start_date TEXT, contract_end_date TEXT, contract_type TEXT DEFAULT 'standard',
  password_changed_at TEXT, total_area REAL, created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP, account_type TEXT, status TEXT DEFAULT 'offline',
  tenant_id TEXT, last_login_at TEXT, password_plain TEXT, personal_account TEXT
);
CREATE UNIQUE INDEX idx_users_login_tenant ON users(login, COALESCE(tenant_id, ''));

CREATE TABLE buildings (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, address TEXT NOT NULL, zone TEXT,
  cadastral_number TEXT, branch_code TEXT DEFAULT 'YS', building_number TEXT, branch_id TEXT,
  floors INTEGER, entrances_count INTEGER DEFAULT 1, apartments_count INTEGER, total_area REAL,
  living_area REAL, common_area REAL, land_area REAL, year_built INTEGER, year_renovated INTEGER,
  building_type TEXT DEFAULT 'monolith', roof_type TEXT DEFAULT 'flat', wall_material TEXT,
  foundation_type TEXT, has_elevator INTEGER DEFAULT 0, elevator_count INTEGER DEFAULT 0,
  has_gas INTEGER DEFAULT 0, heating_type TEXT DEFAULT 'central', has_hot_water INTEGER DEFAULT 0,
  water_supply_type TEXT DEFAULT 'central', sewerage_type TEXT DEFAULT 'central',
  has_intercom INTEGER DEFAULT 0, has_video_surveillance INTEGER DEFAULT 0,
  has_concierge INTEGER DEFAULT 0, has_parking_lot INTEGER DEFAULT 0,
  parking_spaces INTEGER DEFAULT 0, has_playground INTEGER DEFAULT 0,
  manager_id TEXT, manager_name TEXT, management_start_date TEXT, contract_number TEXT,
  contract_end_date TEXT, monthly_budget INTEGER DEFAULT 0, reserve_fund INTEGER DEFAULT 0,
  total_debt INTEGER DEFAULT 0, collection_rate REAL DEFAULT 0, residents_count INTEGER DEFAULT 0,
  owners_count INTEGER DEFAULT 0, tenants_count INTEGER DEFAULT 0, vacant_apartments INTEGER DEFAULT 0,
  active_requests_count INTEGER DEFAULT 0, latitude REAL, longitude REAL,
  created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')),
  tenant_id TEXT, has_pumps INTEGER DEFAULT 0, residential_area REAL DEFAULT 0
);

CREATE TABLE apartments (
  id TEXT PRIMARY KEY, building_id TEXT NOT NULL, entrance_id TEXT, number TEXT NOT NULL,
  floor INTEGER, total_area REAL, living_area REAL, kitchen_area REAL, balcony_area REAL,
  rooms INTEGER, has_balcony INTEGER DEFAULT 0, has_loggia INTEGER DEFAULT 0, ceiling_height REAL,
  window_view TEXT, ownership_type TEXT DEFAULT 'private', ownership_share REAL DEFAULT 1.0,
  cadastral_number TEXT, status TEXT DEFAULT 'occupied', is_commercial INTEGER DEFAULT 0,
  primary_owner_id TEXT, personal_account_id TEXT, created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')), tenant_id TEXT,
  property_type TEXT DEFAULT 'commercial', is_basement INTEGER DEFAULT 0,
  is_parking INTEGER DEFAULT 0, UNIQUE(building_id, number)
);

CREATE TABLE requests (
  id TEXT PRIMARY KEY, number INTEGER, request_number TEXT, resident_id TEXT NOT NULL,
  category_id TEXT NOT NULL, title TEXT NOT NULL, description TEXT, priority TEXT DEFAULT 'medium',
  status TEXT DEFAULT 'new', executor_id TEXT, assigned_by TEXT, access_info TEXT, photos TEXT,
  scheduled_at TEXT, started_at TEXT, completed_at TEXT, closed_at TEXT,
  is_paused INTEGER DEFAULT 0, paused_at TEXT, total_paused_time INTEGER DEFAULT 0,
  rating INTEGER, feedback TEXT, rejection_reason TEXT, rejection_count INTEGER DEFAULT 0,
  building_id TEXT, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')),
  tenant_id TEXT, pause_reason TEXT
);

CREATE TABLE entrances (
  id TEXT PRIMARY KEY, building_id TEXT NOT NULL, number INTEGER NOT NULL,
  floors_from INTEGER DEFAULT 1, floors_to INTEGER, apartments_from INTEGER, apartments_to INTEGER,
  has_elevator INTEGER DEFAULT 0, elevator_id TEXT, intercom_type TEXT, intercom_code TEXT,
  cleaning_schedule TEXT, responsible_id TEXT, last_inspection TEXT, notes TEXT,
  created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')),
  tenant_id TEXT, UNIQUE(building_id, number)
);

CREATE TABLE categories (
  id TEXT PRIMARY KEY, name_ru TEXT NOT NULL, name_uz TEXT NOT NULL, icon TEXT,
  specialization TEXT NOT NULL, is_active INTEGER DEFAULT 1, tenant_id TEXT
);

CREATE TABLE meetings (
  id TEXT PRIMARY KEY, number INTEGER, building_id TEXT NOT NULL, building_address TEXT,
  description TEXT, organizer_type TEXT DEFAULT 'uk', organizer_id TEXT, organizer_name TEXT,
  format TEXT DEFAULT 'offline', status TEXT DEFAULT 'draft', schedule_poll_ends_at TEXT,
  schedule_poll_opened_at TEXT, schedule_confirmed_at TEXT, confirmed_date_time TEXT,
  location TEXT, voting_unit TEXT DEFAULT 'apartment', quorum_percent INTEGER DEFAULT 50,
  allow_revote INTEGER DEFAULT 1, require_otp INTEGER DEFAULT 1,
  show_intermediate_results INTEGER DEFAULT 0, total_area REAL DEFAULT 0, voted_area REAL DEFAULT 0,
  total_eligible_count INTEGER DEFAULT 0, participated_count INTEGER DEFAULT 0,
  quorum_reached INTEGER DEFAULT 0, participation_percent REAL DEFAULT 0,
  voting_opened_at TEXT, voting_closed_at TEXT, results_published_at TEXT, protocol_id TEXT,
  protocol_generated_at TEXT, protocol_approved_at TEXT, moderated_at TEXT, moderated_by TEXT,
  cancelled_at TEXT, cancellation_reason TEXT, materials TEXT, notification_logs TEXT,
  reminders_sent TEXT, created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')), tenant_id TEXT
);

CREATE TABLE meeting_agenda_items (
  id TEXT PRIMARY KEY, meeting_id TEXT NOT NULL, item_order INTEGER NOT NULL, title TEXT NOT NULL,
  description TEXT, duration_minutes INTEGER DEFAULT 15, presenter TEXT,
  created_at TEXT DEFAULT (datetime('now')), threshold TEXT DEFAULT 'simple_majority',
  is_approved INTEGER DEFAULT 0, votes_for_area REAL DEFAULT 0, votes_against_area REAL DEFAULT 0,
  votes_abstain_area REAL DEFAULT 0, tenant_id TEXT, attachments TEXT, description_extended TEXT
);

CREATE TABLE meeting_eligible_voters (
  id TEXT PRIMARY KEY, meeting_id TEXT NOT NULL, user_id TEXT NOT NULL, apartment_id TEXT,
  voting_weight REAL DEFAULT 1, has_voted INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')), tenant_id TEXT
);

CREATE TABLE meeting_participated_voters (
  id TEXT PRIMARY KEY, meeting_id TEXT NOT NULL, user_id TEXT NOT NULL,
  participation_type TEXT DEFAULT 'online', participated_at TEXT DEFAULT (datetime('now')),
  tenant_id TEXT
);
CREATE UNIQUE INDEX idx_meeting_participated_unique ON meeting_participated_voters(meeting_id, user_id);
CREATE INDEX idx_meeting_participated_voters_tenant ON meeting_participated_voters(tenant_id);

CREATE TABLE meeting_vote_records (
  id TEXT PRIMARY KEY, meeting_id TEXT NOT NULL, agenda_item_id TEXT NOT NULL,
  user_id TEXT NOT NULL, vote TEXT NOT NULL, vote_weight REAL DEFAULT 1,
  voted_at TEXT DEFAULT (datetime('now')), changed_after_reconsideration INTEGER DEFAULT 0,
  reconsideration_request_id TEXT, voter_id TEXT, choice TEXT, voter_name TEXT,
  apartment_id TEXT, apartment_number TEXT, ownership_share REAL, is_revote INTEGER DEFAULT 0,
  verification_method TEXT, otp_verified INTEGER DEFAULT 0, vote_hash TEXT,
  previous_vote_id TEXT, tenant_id TEXT
);
CREATE INDEX idx_vote_records_meeting_revote ON meeting_vote_records(meeting_id, is_revote);
CREATE INDEX idx_votes_meeting_agenda ON meeting_vote_records(meeting_id, agenda_item_id);

CREATE TABLE meeting_protocols (
  id TEXT PRIMARY KEY, meeting_id TEXT NOT NULL UNIQUE, protocol_number TEXT, content TEXT,
  decisions TEXT, signed_by TEXT, signed_at TEXT, file_url TEXT,
  created_at TEXT DEFAULT (datetime('now')), protocol_hash TEXT, signed_by_uk_user_id TEXT,
  signed_by_uk_name TEXT, signed_by_uk_role TEXT, signed_by_uk_at TEXT, uk_signature_hash TEXT,
  chairman_user_id TEXT, chairman_name TEXT, chairman_apartment TEXT, chairman_signed_at TEXT,
  chairman_signature_hash TEXT, secretary_user_id TEXT, secretary_name TEXT,
  secretary_apartment TEXT, secretary_signed_at TEXT, secretary_signature_hash TEXT,
  counting_commission TEXT, tenant_id TEXT
);

CREATE TABLE announcements (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, content TEXT NOT NULL, type TEXT NOT NULL,
  target_type TEXT, target_building_id TEXT, target_entrance TEXT, target_floor TEXT,
  target_logins TEXT, priority TEXT DEFAULT 'normal', is_active INTEGER DEFAULT 1,
  expires_at TEXT, attachments TEXT, created_by TEXT, created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')), target_branch TEXT, tenant_id TEXT, personalized_data TEXT
);

CREATE TABLE chat_channels (
  id TEXT PRIMARY KEY, type TEXT NOT NULL, name TEXT NOT NULL, description TEXT,
  building_id TEXT, resident_id TEXT, created_by TEXT, created_at TEXT DEFAULT (datetime('now')),
  tenant_id TEXT, assigned_to TEXT, resolved_at TEXT, resolved_by TEXT, updated_at TEXT
);

CREATE TABLE chat_messages (
  id TEXT PRIMARY KEY, channel_id TEXT NOT NULL, sender_id TEXT NOT NULL,
  content TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now')), tenant_id TEXT
);

CREATE TABLE marketplace_categories (
  id TEXT PRIMARY KEY, name_ru TEXT NOT NULL, name_uz TEXT NOT NULL, icon TEXT,
  parent_id TEXT REFERENCES marketplace_categories(id), sort_order INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1, created_at TEXT DEFAULT (datetime('now')), tenant_id TEXT
);

CREATE TABLE marketplace_products (
  id TEXT PRIMARY KEY, category_id TEXT NOT NULL REFERENCES marketplace_categories(id),
  name_ru TEXT NOT NULL, name_uz TEXT NOT NULL, description_ru TEXT, description_uz TEXT,
  price REAL NOT NULL, old_price REAL, unit TEXT DEFAULT 'шт', stock_quantity INTEGER DEFAULT 0,
  min_order_quantity INTEGER DEFAULT 1, max_order_quantity INTEGER, weight REAL,
  weight_unit TEXT DEFAULT 'кг', image_url TEXT, images TEXT, is_active INTEGER DEFAULT 1,
  is_featured INTEGER DEFAULT 0, rating REAL DEFAULT 0, reviews_count INTEGER DEFAULT 0,
  orders_count INTEGER DEFAULT 0, created_by TEXT, created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')), tenant_id TEXT, is_on_demand INTEGER DEFAULT 0
);

CREATE TABLE marketplace_orders (
  id TEXT PRIMARY KEY, order_number TEXT NOT NULL UNIQUE, user_id TEXT NOT NULL REFERENCES users(id),
  status TEXT DEFAULT 'new' CHECK (status IN (
    'new','confirmed','preparing','ready','delivering','delivered','cancelled',
    'awaiting_price','price_pending','price_offered','price_accepted','price_declined','unavailable'
  )),
  total_amount REAL NOT NULL, delivery_fee REAL DEFAULT 0, discount_amount REAL DEFAULT 0,
  final_amount REAL NOT NULL, delivery_address TEXT, delivery_apartment TEXT,
  delivery_entrance TEXT, delivery_floor TEXT, delivery_phone TEXT, delivery_notes TEXT,
  delivery_date TEXT, delivery_time_slot TEXT,
  payment_method TEXT DEFAULT 'cash' CHECK (payment_method IN ('cash','card','transfer')),
  payment_status TEXT DEFAULT 'pending' CHECK (payment_status IN ('pending','paid','refunded')),
  assigned_to TEXT, confirmed_at TEXT, preparing_at TEXT, ready_at TEXT, delivering_at TEXT,
  delivered_at TEXT, cancelled_at TEXT, cancellation_reason TEXT, rating INTEGER, review TEXT,
  created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')),
  executor_id TEXT, assigned_at TEXT, tenant_id TEXT,
  order_type TEXT DEFAULT 'stock' CHECK (order_type IN ('stock','on_demand')),
  price_offered_at TEXT, price_offered_expires_at TEXT
);

CREATE TABLE marketplace_order_items (
  id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES marketplace_orders(id) ON DELETE CASCADE,
  product_id TEXT REFERENCES marketplace_products(id), product_name TEXT NOT NULL, product_image TEXT,
  quantity INTEGER NOT NULL, unit_price REAL NOT NULL, total_price REAL NOT NULL,
  created_at TEXT DEFAULT (datetime('now')), tenant_id TEXT
);

CREATE TABLE marketplace_order_history (
  id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES marketplace_orders(id) ON DELETE CASCADE,
  status TEXT NOT NULL, comment TEXT, changed_by TEXT,
  created_at TEXT DEFAULT (datetime('now')), tenant_id TEXT
);

CREATE TABLE marketplace_favorites (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
  product_id TEXT NOT NULL REFERENCES marketplace_products(id),
  created_at TEXT DEFAULT (datetime('now')), tenant_id TEXT, UNIQUE(user_id, product_id)
);

CREATE TABLE marketplace_reviews (
  id TEXT PRIMARY KEY, product_id TEXT NOT NULL REFERENCES marketplace_products(id),
  user_id TEXT NOT NULL REFERENCES users(id), order_id TEXT REFERENCES marketplace_orders(id),
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5), comment TEXT, images TEXT,
  is_verified_purchase INTEGER DEFAULT 0, is_visible INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')), tenant_id TEXT
);

CREATE TABLE ad_categories (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT, icon TEXT,
  is_active INTEGER DEFAULT 1, created_at TEXT DEFAULT (datetime('now')),
  tenant_id TEXT, name_ru TEXT, name_uz TEXT, sort_order INTEGER DEFAULT 0
);

CREATE TABLE ads (
  id TEXT PRIMARY KEY, advertiser_id TEXT NOT NULL, title TEXT NOT NULL, description TEXT,
  category_id TEXT, image_url TEXT, link_url TEXT, is_active INTEGER DEFAULT 1,
  impressions INTEGER DEFAULT 0, clicks INTEGER DEFAULT 0, budget REAL DEFAULT 0,
  spent REAL DEFAULT 0, start_date TEXT, end_date TEXT, created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')), tenant_id TEXT, phone TEXT, phone2 TEXT,
  telegram TEXT, instagram TEXT, facebook TEXT, website TEXT, address TEXT, work_hours TEXT,
  work_days TEXT, logo_url TEXT, photos TEXT, discount_percent REAL DEFAULT 0, badges TEXT,
  target_type TEXT DEFAULT 'all', target_branches TEXT, starts_at TEXT, expires_at TEXT,
  duration_type TEXT DEFAULT 'month', status TEXT DEFAULT 'active', created_by TEXT,
  views_count INTEGER DEFAULT 0, coupons_issued INTEGER DEFAULT 0,
  coupons_activated INTEGER DEFAULT 0, target_buildings TEXT
);

CREATE TABLE rental_apartments (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, address TEXT NOT NULL, apartment TEXT,
  owner_id TEXT NOT NULL, owner_type TEXT DEFAULT 'tenant', is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')), tenant_id TEXT
);

CREATE TABLE rental_records (
  id TEXT PRIMARY KEY, apartment_id TEXT NOT NULL, guest_names TEXT NOT NULL, passport_info TEXT,
  check_in_date TEXT NOT NULL, check_out_date TEXT NOT NULL, amount REAL NOT NULL,
  currency TEXT DEFAULT 'UZS', notes TEXT, created_by TEXT,
  created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')), tenant_id TEXT
);

CREATE TABLE rental_listings (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL DEFAULT '',
  publisher_user_id TEXT NOT NULL REFERENCES users(id),
  source_type TEXT NOT NULL CHECK (source_type IN ('resident','uk')),
  state TEXT NOT NULL DEFAULT 'active' CHECK (state IN ('active','rented','archived','hidden')),
  hidden_reason TEXT, hidden_by_user_id TEXT REFERENCES users(id), hidden_at TEXT,
  rooms INTEGER NOT NULL CHECK (rooms BETWEEN 0 AND 4), area_m2 REAL NOT NULL CHECK (area_m2 > 0),
  floor INTEGER NOT NULL CHECK (floor > 0), floor_total INTEGER NOT NULL CHECK (floor_total >= floor),
  apartment_number TEXT, entrance TEXT, building_id TEXT REFERENCES buildings(id),
  price_monthly INTEGER NOT NULL CHECK (price_monthly >= 0), price_currency TEXT NOT NULL DEFAULT 'UZS',
  deposit_months REAL, furnished INTEGER NOT NULL DEFAULT 0,
  air_conditioning INTEGER NOT NULL DEFAULT 0, internet INTEGER NOT NULL DEFAULT 0,
  parking INTEGER NOT NULL DEFAULT 0, animals_allowed INTEGER NOT NULL DEFAULT 0,
  duration_type TEXT NOT NULL DEFAULT 'long' CHECK (duration_type IN ('short','long','flexible')),
  description TEXT NOT NULL DEFAULT '', phone_visible INTEGER NOT NULL DEFAULT 1,
  last_confirmed_at TEXT NOT NULL DEFAULT (datetime('now')), confirm_prompt_sent_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE rental_listing_photos (
  id TEXT PRIMARY KEY, listing_id TEXT NOT NULL REFERENCES rental_listings(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL DEFAULT '', sort_order INTEGER NOT NULL DEFAULT 0,
  data_url TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE vehicles (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, plate_number TEXT NOT NULL, brand TEXT, model TEXT,
  color TEXT, year INTEGER, vehicle_type TEXT DEFAULT 'car', owner_type TEXT DEFAULT 'individual',
  company_name TEXT, parking_spot TEXT, notes TEXT, is_primary INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')),
  resident_id TEXT, tenant_id TEXT
);
CREATE UNIQUE INDEX idx_vehicles_plate ON vehicles(plate_number, tenant_id);

CREATE TABLE guest_access_codes (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, resident_id TEXT, qr_token TEXT UNIQUE NOT NULL,
  code TEXT, visitor_type TEXT DEFAULT 'guest', visitor_name TEXT, visitor_phone TEXT,
  visitor_vehicle_plate TEXT, access_type TEXT DEFAULT 'single_use',
  valid_from TEXT DEFAULT (datetime('now')), valid_until TEXT, max_uses INTEGER DEFAULT 1,
  current_uses INTEGER DEFAULT 0, status TEXT DEFAULT 'active', resident_name TEXT,
  resident_phone TEXT, resident_apartment TEXT, resident_address TEXT, notes TEXT,
  revoked_at TEXT, revoked_by TEXT, revoked_reason TEXT, building_id TEXT,
  created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')), tenant_id TEXT
);

CREATE TABLE guest_access_logs (
  id TEXT PRIMARY KEY, code_id TEXT NOT NULL, action TEXT NOT NULL, scanned_by TEXT,
  scanned_at TEXT DEFAULT (datetime('now')), location TEXT, notes TEXT, tenant_id TEXT,
  scanned_by_id TEXT, scanned_by_name TEXT, scanned_by_role TEXT, visitor_type TEXT,
  resident_name TEXT, resident_apartment TEXT
);

CREATE TABLE push_subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  last_used_at TEXT
);

CREATE TABLE finance_estimates (
  id TEXT PRIMARY KEY, building_id TEXT NOT NULL, period TEXT NOT NULL, title TEXT,
  total_amount REAL NOT NULL DEFAULT 0, commercial_rate_per_sqm REAL DEFAULT 0,
  non_commercial_rate_per_sqm REAL DEFAULT 0, non_commercial_coefficient REAL DEFAULT 1.5,
  uk_profit_percent REAL DEFAULT 10, show_profit_to_residents INTEGER DEFAULT 0,
  show_debtor_status_to_residents INTEGER DEFAULT 0,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft','active','archived')),
  created_by TEXT, created_at TEXT DEFAULT (datetime('now')), tenant_id TEXT DEFAULT '',
  effective_date TEXT, enterprise_profit_percent REAL DEFAULT 9, commercial_rate REAL DEFAULT 0,
  basement_rate REAL DEFAULT 0, parking_rate REAL DEFAULT 0,
  model TEXT DEFAULT 'legacy' CHECK (model IN ('legacy','TARIFF_CALCULATED','TARIFF_MANUAL','TARIFF_FLAT')),
  commercial_income REAL DEFAULT 0, basement_income REAL DEFAULT 0, parking_income REAL DEFAULT 0,
  telecom_income REAL DEFAULT 0, residential_area REAL DEFAULT 0, payroll_tax_rate REAL DEFAULT 0.24,
  fot_gross REAL DEFAULT 0, payroll_tax REAL DEFAULT 0, fot_total REAL DEFAULT 0,
  self_cost_resident REAL DEFAULT 0, base_per_m2 REAL DEFAULT 0, with_profit_per_m2 REAL DEFAULT 0,
  telecom_comp_per_m2 REAL DEFAULT 0, tariff_resident REAL DEFAULT 0, tariff_approved REAL,
  jami_tushum_year REAL DEFAULT 0, umumiy_year REAL DEFAULT 0, deficit_year REAL DEFAULT 0,
  periodic_enabled INTEGER DEFAULT 1, vat_enabled INTEGER DEFAULT 0, vat_rate REAL DEFAULT 0.12,
  scope_level TEXT DEFAULT 'building', branch_code TEXT, allocation_base TEXT DEFAULT 'area'
);

CREATE TABLE finance_estimate_buildings (
  id TEXT PRIMARY KEY, estimate_id TEXT NOT NULL, building_id TEXT NOT NULL,
  residential_area REAL DEFAULT 0, sort_order INTEGER DEFAULT 0, tenant_id TEXT DEFAULT ''
);

CREATE TABLE finance_estimate_staff (
  id TEXT PRIMARY KEY, estimate_id TEXT NOT NULL, title TEXT NOT NULL,
  units REAL NOT NULL DEFAULT 1, salary REAL NOT NULL DEFAULT 0, monthly REAL DEFAULT 0,
  sort_order INTEGER DEFAULT 0, tenant_id TEXT NOT NULL DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')), vacation_days REAL DEFAULT 0
);

CREATE TABLE finance_estimate_items (
  id TEXT PRIMARY KEY, estimate_id TEXT NOT NULL, name TEXT NOT NULL,
  category TEXT DEFAULT 'maintenance', amount REAL NOT NULL DEFAULT 0, description TEXT,
  sort_order INTEGER DEFAULT 0, tenant_id TEXT DEFAULT '', monthly_amount REAL DEFAULT 0,
  kind TEXT DEFAULT 'expense' CHECK (kind IN ('expense','income')),
  section TEXT DEFAULT 'production' CHECK (section IN ('production','periodic')),
  unit TEXT DEFAULT 'flat' CHECK (unit IN ('flat','per_sqm','per_apt','per_meter','staff_computed')),
  linked_to_staff INTEGER DEFAULT 0, legal_code TEXT, building_id TEXT
);

CREATE TABLE finance_charges (
  id TEXT PRIMARY KEY, apartment_id TEXT NOT NULL, estimate_id TEXT, period TEXT NOT NULL,
  amount REAL NOT NULL DEFAULT 0, amount_breakdown TEXT,
  property_type TEXT DEFAULT 'commercial' CHECK (property_type IN ('commercial','non_commercial')),
  area_sqm REAL DEFAULT 0, rate_per_sqm REAL DEFAULT 0,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','paid','partial','overdue')),
  due_date TEXT, paid_amount REAL DEFAULT 0, created_at TEXT DEFAULT (datetime('now')),
  tenant_id TEXT DEFAULT ''
);

CREATE TABLE finance_payments (
  id TEXT PRIMARY KEY, charge_id TEXT, apartment_id TEXT NOT NULL, amount REAL NOT NULL,
  payment_date TEXT DEFAULT (datetime('now')),
  payment_type TEXT DEFAULT 'cash' CHECK (payment_type IN ('cash','card','transfer','online')),
  receipt_number TEXT, description TEXT, received_by TEXT, tenant_id TEXT DEFAULT ''
);

CREATE TABLE personal_accounts (
  id TEXT PRIMARY KEY, apartment_id TEXT NOT NULL, account_number TEXT UNIQUE,
  balance REAL DEFAULT 0, last_payment_date TEXT, last_payment_amount REAL,
  created_at TEXT DEFAULT (datetime('now')), tenant_id TEXT
);

CREATE TABLE finance_penalty_settings (
  tenant_id TEXT PRIMARY KEY, enabled INTEGER DEFAULT 0, daily_rate REAL DEFAULT 0.001,
  grace_days INTEGER DEFAULT 30, max_multiplier REAL DEFAULT 1.0,
  updated_by TEXT, updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE finance_penalties (
  id TEXT PRIMARY KEY, charge_id TEXT NOT NULL, apartment_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL DEFAULT '', principal_amount REAL NOT NULL,
  penalty_rate REAL NOT NULL, days_overdue INTEGER NOT NULL, penalty_amount REAL NOT NULL,
  status TEXT DEFAULT 'accrued' CHECK (status IN ('accrued','paid','waived','cancelled')),
  paid_amount REAL DEFAULT 0, calculated_at TEXT DEFAULT (datetime('now')),
  waived_by TEXT, waived_reason TEXT
);

CREATE TABLE finance_income_categories (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, is_default INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1, tenant_id TEXT DEFAULT ''
);

CREATE TABLE finance_income (
  id TEXT PRIMARY KEY, category_id TEXT, amount REAL NOT NULL, period TEXT, description TEXT,
  source_type TEXT, source_id TEXT, created_by TEXT,
  created_at TEXT DEFAULT (datetime('now')), tenant_id TEXT DEFAULT ''
);

CREATE TABLE finance_expenses (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL DEFAULT '', building_id TEXT,
  estimate_id TEXT, estimate_item_id TEXT, estimate_item_name TEXT, amount REAL NOT NULL,
  expense_date TEXT NOT NULL, description TEXT, document_url TEXT, request_id TEXT,
  created_by TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE finance_materials (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, unit TEXT DEFAULT 'шт', quantity REAL DEFAULT 0,
  price_per_unit REAL DEFAULT 0, min_quantity REAL DEFAULT 0, building_id TEXT,
  tenant_id TEXT DEFAULT ''
);

CREATE TABLE finance_material_usage (
  id TEXT PRIMARY KEY, material_id TEXT NOT NULL, quantity REAL NOT NULL, request_id TEXT,
  estimate_item_id TEXT, used_by TEXT, description TEXT,
  used_at TEXT DEFAULT (datetime('now')), tenant_id TEXT DEFAULT ''
);

CREATE TABLE finance_access (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL,
  access_level TEXT DEFAULT 'view_only' CHECK (access_level IN ('full','payments_only','view_only')),
  granted_by TEXT, granted_at TEXT DEFAULT (datetime('now')), tenant_id TEXT DEFAULT ''
);

CREATE TABLE finance_claims (
  id TEXT PRIMARY KEY, apartment_id TEXT NOT NULL,
  claim_type TEXT DEFAULT 'reconciliation' CHECK (claim_type IN ('reconciliation','pretension')),
  total_debt REAL DEFAULT 0, period_from TEXT, period_to TEXT, deadline_days INTEGER DEFAULT 14,
  file_url TEXT, generated_by TEXT, generated_at TEXT DEFAULT (datetime('now')), tenant_id TEXT DEFAULT ''
);

CREATE TABLE finance_fact_reports (
  id TEXT PRIMARY KEY, building_id TEXT NOT NULL, period_from TEXT NOT NULL,
  period_to TEXT NOT NULL, rows_json TEXT, uk_income_plan REAL DEFAULT 0,
  uk_income_fact REAL DEFAULT 0, generated_by TEXT,
  generated_at TEXT DEFAULT (datetime('now')), tenant_id TEXT NOT NULL DEFAULT ''
);

CREATE TABLE training_partners (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT, logo_url TEXT, website TEXT,
  contact_email TEXT, contact_phone TEXT, is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')), tenant_id TEXT
);

CREATE TABLE training_proposals (
  id TEXT PRIMARY KEY, partner_id TEXT NOT NULL, title TEXT NOT NULL, description TEXT,
  category TEXT, price REAL, duration TEXT, max_participants INTEGER, start_date TEXT,
  end_date TEXT, location TEXT, status TEXT DEFAULT 'pending',
  created_at TEXT DEFAULT (datetime('now')), tenant_id TEXT
);

CREATE TABLE training_votes (
  id TEXT PRIMARY KEY, proposal_id TEXT NOT NULL, user_id TEXT NOT NULL, vote INTEGER NOT NULL,
  created_at TEXT DEFAULT (datetime('now')), tenant_id TEXT, UNIQUE(proposal_id, user_id)
);

CREATE TABLE training_registrations (
  id TEXT PRIMARY KEY, proposal_id TEXT NOT NULL, user_id TEXT NOT NULL,
  status TEXT DEFAULT 'registered', registered_at TEXT DEFAULT (datetime('now')),
  attended INTEGER DEFAULT 0, feedback_submitted INTEGER DEFAULT 0, tenant_id TEXT
);

CREATE TABLE training_feedback (
  id TEXT PRIMARY KEY, proposal_id TEXT NOT NULL, user_id TEXT NOT NULL, rating INTEGER NOT NULL,
  comment TEXT, created_at TEXT DEFAULT (datetime('now')), tenant_id TEXT
);

CREATE TABLE training_notifications (
  id TEXT PRIMARY KEY, proposal_id TEXT NOT NULL, user_id TEXT NOT NULL,
  notification_type TEXT NOT NULL, sent_at TEXT DEFAULT (datetime('now')),
  is_read INTEGER DEFAULT 0, tenant_id TEXT DEFAULT ''
);

CREATE TABLE employee_ratings (
  id TEXT PRIMARY KEY, executor_id TEXT NOT NULL, request_id TEXT, rating INTEGER NOT NULL,
  comment TEXT, rated_by TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now')),
  tenant_id TEXT DEFAULT ''
);

CREATE TABLE notes (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, title TEXT NOT NULL, content TEXT DEFAULT '',
  tenant_id TEXT, created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
