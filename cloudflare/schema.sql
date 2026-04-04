-- UK CRM Database Schema for Cloudflare D1

-- Users table (all user types)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  login TEXT NOT NULL,
  phone TEXT,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('super_admin', 'admin', 'director', 'manager', 'department_head', 'dispatcher', 'executor', 'resident', 'advertiser', 'coupon_checker', 'tenant', 'commercial_owner')),
  specialization TEXT CHECK (specialization IN ('plumber', 'electrician', 'elevator', 'intercom', 'cleaning', 'security', 'carpenter', 'boiler', 'ac', 'gardener', 'other', NULL)),
  email TEXT,
  avatar_url TEXT,
  address TEXT,
  apartment TEXT,
  building_id TEXT REFERENCES buildings(id),
  entrance TEXT,
  floor TEXT,
  branch TEXT,
  building TEXT,
  language TEXT DEFAULT 'ru' CHECK (language IN ('ru', 'uz')),
  is_active INTEGER DEFAULT 1,

  -- Contract fields (for residents)
  qr_code TEXT,                    -- Unique QR code for contract signing
  contract_signed_at TEXT,         -- Date when contract was signed
  agreed_to_terms_at TEXT,         -- Date when terms were accepted
  contract_number TEXT,            -- Contract number (e.g., ДОГ-2024-00001)
  contract_start_date TEXT,        -- Contract start date
  contract_end_date TEXT,          -- Contract end date (NULL = indefinite)
  contract_type TEXT DEFAULT 'standard' CHECK (contract_type IN ('standard', 'commercial', 'temporary')),

  password_changed_at TEXT,            -- Date when password was last changed by user
  last_login_at TEXT,                  -- Date when user last logged in

  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  tenant_id TEXT DEFAULT ''
);

-- Buildings table (extended for CRM)
CREATE TABLE IF NOT EXISTS buildings (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  zone TEXT,
  cadastral_number TEXT,
  branch_code TEXT DEFAULT 'YS',
  building_number TEXT,
  branch_id TEXT REFERENCES branches(id),

  -- Technical specs
  floors INTEGER,
  entrances_count INTEGER DEFAULT 1,
  apartments_count INTEGER,
  total_area REAL,
  living_area REAL,
  common_area REAL,
  land_area REAL,
  year_built INTEGER,
  year_renovated INTEGER,
  building_type TEXT DEFAULT 'monolith' CHECK (building_type IN ('panel', 'brick', 'monolith', 'block', 'wooden', 'mixed')),
  roof_type TEXT DEFAULT 'flat' CHECK (roof_type IN ('flat', 'pitched', 'combined')),
  wall_material TEXT,
  foundation_type TEXT,

  -- Engineering systems
  has_elevator INTEGER DEFAULT 0,
  elevator_count INTEGER DEFAULT 0,
  has_gas INTEGER DEFAULT 0,
  heating_type TEXT DEFAULT 'central' CHECK (heating_type IN ('central', 'individual', 'autonomous')),
  has_hot_water INTEGER DEFAULT 0,
  water_supply_type TEXT DEFAULT 'central' CHECK (water_supply_type IN ('central', 'autonomous')),
  sewerage_type TEXT DEFAULT 'central' CHECK (sewerage_type IN ('central', 'autonomous')),
  has_intercom INTEGER DEFAULT 0,
  has_video_surveillance INTEGER DEFAULT 0,
  has_concierge INTEGER DEFAULT 0,
  has_parking_lot INTEGER DEFAULT 0,
  parking_spaces INTEGER DEFAULT 0,
  has_playground INTEGER DEFAULT 0,

  -- Management
  manager_id TEXT,
  manager_name TEXT,
  management_start_date TEXT,
  contract_number TEXT,
  contract_end_date TEXT,

  -- Financial
  monthly_budget INTEGER DEFAULT 0,
  reserve_fund INTEGER DEFAULT 0,
  total_debt INTEGER DEFAULT 0,
  collection_rate REAL DEFAULT 0,

  -- Stats (cached, updated periodically)
  residents_count INTEGER DEFAULT 0,
  owners_count INTEGER DEFAULT 0,
  tenants_count INTEGER DEFAULT 0,
  vacant_apartments INTEGER DEFAULT 0,
  active_requests_count INTEGER DEFAULT 0,

  -- Geo
  latitude REAL,
  longitude REAL,

  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  tenant_id TEXT DEFAULT ''
);

-- Entrances table (подъезды)
CREATE TABLE IF NOT EXISTS entrances (
  id TEXT PRIMARY KEY,
  building_id TEXT NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
  number INTEGER NOT NULL,
  floors_from INTEGER DEFAULT 1,
  floors_to INTEGER,
  apartments_from INTEGER,
  apartments_to INTEGER,
  has_elevator INTEGER DEFAULT 0,
  elevator_id TEXT,
  intercom_type TEXT CHECK (intercom_type IN ('audio', 'video', 'smart', 'none')),
  intercom_code TEXT,
  cleaning_schedule TEXT,
  responsible_id TEXT,
  last_inspection TEXT,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  tenant_id TEXT DEFAULT '',
  UNIQUE(building_id, number)
);

-- Building documents
CREATE TABLE IF NOT EXISTS building_documents (
  id TEXT PRIMARY KEY,
  building_id TEXT NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT DEFAULT 'other' CHECK (type IN ('contract', 'act', 'protocol', 'passport', 'license', 'certificate', 'other')),
  file_url TEXT NOT NULL,
  file_size INTEGER DEFAULT 0,
  uploaded_at TEXT DEFAULT (datetime('now')),
  uploaded_by TEXT,
  expires_at TEXT,
  is_active INTEGER DEFAULT 1,
  tenant_id TEXT DEFAULT ''
);

-- Apartments table (extended for CRM)
CREATE TABLE IF NOT EXISTS apartments (
  id TEXT PRIMARY KEY,
  building_id TEXT NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
  entrance_id TEXT REFERENCES entrances(id) ON DELETE SET NULL,
  number TEXT NOT NULL,
  floor INTEGER,

  -- Areas
  total_area REAL,
  living_area REAL,
  kitchen_area REAL,
  balcony_area REAL,
  rooms INTEGER,

  -- Features
  has_balcony INTEGER DEFAULT 0,
  has_loggia INTEGER DEFAULT 0,
  ceiling_height REAL,
  window_view TEXT CHECK (window_view IN ('street', 'yard', 'both')),

  -- Ownership
  ownership_type TEXT DEFAULT 'private' CHECK (ownership_type IN ('private', 'municipal', 'state', 'commercial')),
  ownership_share REAL DEFAULT 1.0,
  cadastral_number TEXT,

  -- Status
  status TEXT DEFAULT 'occupied' CHECK (status IN ('occupied', 'vacant', 'rented', 'renovation', 'commercial')),
  is_commercial INTEGER DEFAULT 0,
  property_type TEXT DEFAULT 'commercial' CHECK (property_type IN ('commercial','non_commercial')),

  -- References
  primary_owner_id TEXT,
  personal_account_id TEXT,

  -- Timestamps
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  tenant_id TEXT DEFAULT '',
  UNIQUE(building_id, number)
);

-- Owners table (property owners)
CREATE TABLE IF NOT EXISTS owners (
  id TEXT PRIMARY KEY,

  -- Type
  type TEXT DEFAULT 'individual' CHECK (type IN ('individual', 'legal_entity', 'government')),

  -- Personal info (for individuals)
  last_name TEXT,
  first_name TEXT,
  middle_name TEXT,
  full_name TEXT NOT NULL,

  -- Company info (for legal entities)
  company_name TEXT,
  inn TEXT,
  ogrn TEXT,
  legal_address TEXT,

  -- Contact
  phone TEXT,
  email TEXT,
  preferred_contact TEXT DEFAULT 'phone' CHECK (preferred_contact IN ('phone', 'email', 'sms', 'app')),

  -- Documents
  passport_series TEXT,
  passport_number TEXT,
  passport_issued_by TEXT,
  passport_issued_date TEXT,
  registration_address TEXT,

  -- Ownership details
  ownership_type TEXT DEFAULT 'owner' CHECK (ownership_type IN ('owner', 'co_owner', 'tenant', 'representative')),
  ownership_share REAL DEFAULT 100,
  ownership_start_date TEXT,
  ownership_document TEXT,
  ownership_document_number TEXT,
  ownership_document_date TEXT,

  -- Status
  is_active INTEGER DEFAULT 1,
  is_verified INTEGER DEFAULT 0,
  verified_at TEXT,
  verified_by TEXT,

  -- Notes
  notes TEXT,

  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  tenant_id TEXT DEFAULT ''
);

-- Owner-Apartment relationship (many-to-many)
CREATE TABLE IF NOT EXISTS owner_apartments (
  owner_id TEXT NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  apartment_id TEXT NOT NULL REFERENCES apartments(id) ON DELETE CASCADE,
  ownership_share REAL DEFAULT 100,
  is_primary INTEGER DEFAULT 0,
  start_date TEXT,
  end_date TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  tenant_id TEXT DEFAULT '',
  PRIMARY KEY (owner_id, apartment_id)
);

-- Personal accounts (лицевые счета)
CREATE TABLE IF NOT EXISTS personal_accounts (
  id TEXT PRIMARY KEY,
  number TEXT NOT NULL UNIQUE,
  apartment_id TEXT NOT NULL REFERENCES apartments(id) ON DELETE CASCADE,
  building_id TEXT NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
  primary_owner_id TEXT REFERENCES owners(id) ON DELETE SET NULL,

  -- Info
  owner_name TEXT,
  apartment_number TEXT,
  address TEXT,
  total_area REAL,
  residents_count INTEGER DEFAULT 0,
  registered_count INTEGER DEFAULT 0,

  -- Financial
  balance INTEGER DEFAULT 0,
  current_debt INTEGER DEFAULT 0,
  penalty_amount INTEGER DEFAULT 0,
  last_payment_date TEXT,
  last_payment_amount INTEGER,

  -- Benefits
  has_subsidy INTEGER DEFAULT 0,
  subsidy_amount INTEGER DEFAULT 0,
  subsidy_end_date TEXT,
  has_discount INTEGER DEFAULT 0,
  discount_percent REAL DEFAULT 0,
  discount_reason TEXT,

  -- Status
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'closed', 'debt_collection')),

  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  tenant_id TEXT DEFAULT ''
);

-- CRM Residents table (жители квартир - расширенная версия)
CREATE TABLE IF NOT EXISTS crm_residents (
  id TEXT PRIMARY KEY,
  apartment_id TEXT NOT NULL REFERENCES apartments(id) ON DELETE CASCADE,
  owner_id TEXT REFERENCES owners(id) ON DELETE SET NULL,

  -- Personal info
  last_name TEXT,
  first_name TEXT,
  middle_name TEXT,
  full_name TEXT NOT NULL,
  birth_date TEXT,

  -- Type
  resident_type TEXT DEFAULT 'owner' CHECK (resident_type IN ('owner', 'family_member', 'tenant', 'subtenant', 'temporary', 'employee')),
  relation_to_owner TEXT,

  -- Registration
  registration_type TEXT DEFAULT 'permanent' CHECK (registration_type IN ('permanent', 'temporary', 'none')),
  registration_date TEXT,
  registration_end_date TEXT,

  -- Contact
  phone TEXT,
  additional_phone TEXT,
  email TEXT,

  -- Status
  is_active INTEGER DEFAULT 1,
  moved_in_date TEXT,
  moved_out_date TEXT,
  moved_out_reason TEXT,

  -- Documents
  passport_series TEXT,
  passport_number TEXT,

  -- Notes
  notes TEXT,

  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  tenant_id TEXT DEFAULT ''
);

-- Meters table (счётчики)
CREATE TABLE IF NOT EXISTS meters (
  id TEXT PRIMARY KEY,
  apartment_id TEXT REFERENCES apartments(id) ON DELETE CASCADE,
  building_id TEXT REFERENCES buildings(id) ON DELETE CASCADE,

  -- Type
  type TEXT NOT NULL CHECK (type IN ('cold_water', 'hot_water', 'electricity', 'gas', 'heating')),
  is_common INTEGER DEFAULT 0,

  -- Info
  serial_number TEXT NOT NULL,
  model TEXT,
  brand TEXT,

  -- Installation
  install_date TEXT,
  install_location TEXT,
  initial_value REAL DEFAULT 0,

  -- Verification
  verification_date TEXT,
  next_verification_date TEXT,
  seal_number TEXT,
  seal_date TEXT,

  -- Status
  is_active INTEGER DEFAULT 1,
  current_value REAL DEFAULT 0,
  last_reading_date TEXT,
  decommissioned_at TEXT,
  decommissioned_reason TEXT,

  -- Tariff
  tariff_zone TEXT DEFAULT 'single' CHECK (tariff_zone IN ('single', 'day_night', 'peak')),

  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  tenant_id TEXT DEFAULT ''
);

-- Meter readings table (показания счётчиков)
CREATE TABLE IF NOT EXISTS meter_readings (
  id TEXT PRIMARY KEY,
  meter_id TEXT NOT NULL REFERENCES meters(id) ON DELETE CASCADE,

  -- Reading info
  value REAL NOT NULL,
  previous_value REAL,
  consumption REAL,
  reading_date TEXT NOT NULL,

  -- Source
  source TEXT DEFAULT 'resident' CHECK (source IN ('resident', 'inspector', 'auto', 'estimated')),
  submitted_by TEXT,
  submitted_at TEXT DEFAULT (datetime('now')),

  -- Verification
  is_verified INTEGER DEFAULT 0,
  verified_by TEXT,
  verified_at TEXT,

  -- Photo proof
  photo_url TEXT,

  -- Status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'corrected')),
  rejection_reason TEXT,

  -- Billing
  is_billed INTEGER DEFAULT 0,
  billed_at TEXT,
  billing_period TEXT,

  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  tenant_id TEXT DEFAULT ''
);

-- =====================================================
-- TRAINING SYSTEM TABLES (Система обучения сотрудников)
-- =====================================================

-- Training partners (лекторы/старшие партнёры)
CREATE TABLE IF NOT EXISTS training_partners (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  position TEXT,
  specialization TEXT,
  email TEXT,
  phone TEXT,
  bio TEXT,
  avatar_url TEXT,
  is_active INTEGER DEFAULT 1,
  trainings_conducted INTEGER DEFAULT 0,
  average_rating REAL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  tenant_id TEXT DEFAULT ''
);

-- Training proposals (предложения тренингов)
CREATE TABLE IF NOT EXISTS training_proposals (
  id TEXT PRIMARY KEY,

  -- Topic
  topic TEXT NOT NULL,
  description TEXT,

  -- Author
  author_id TEXT NOT NULL,
  author_name TEXT NOT NULL,
  is_author_anonymous INTEGER DEFAULT 0,

  -- Partner (lecturer)
  partner_id TEXT NOT NULL REFERENCES training_partners(id) ON DELETE CASCADE,
  partner_name TEXT NOT NULL,

  -- Format
  format TEXT DEFAULT 'offline' CHECK (format IN ('online', 'offline', 'any')),
  preferred_time_slots TEXT, -- JSON array: ['morning', 'afternoon', 'evening', 'weekend']

  -- Voting
  vote_threshold INTEGER DEFAULT 5,

  -- Status
  status TEXT DEFAULT 'voting' CHECK (status IN ('voting', 'review', 'approved', 'scheduled', 'completed', 'rejected', 'cancelled')),

  -- Partner response
  partner_response TEXT CHECK (partner_response IN ('accepted', 'rejected', NULL)),
  partner_response_at TEXT,
  partner_response_note TEXT,

  -- Scheduling (when approved)
  scheduled_date TEXT,
  scheduled_time TEXT,
  scheduled_location TEXT,
  scheduled_link TEXT, -- for online trainings
  max_participants INTEGER,

  -- Completion
  completed_at TEXT,
  actual_participants_count INTEGER,

  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  tenant_id TEXT DEFAULT ''
);

-- Training votes (голоса за предложения)
CREATE TABLE IF NOT EXISTS training_votes (
  id TEXT PRIMARY KEY,
  proposal_id TEXT NOT NULL REFERENCES training_proposals(id) ON DELETE CASCADE,
  voter_id TEXT NOT NULL,
  voter_name TEXT NOT NULL,
  participation_intent TEXT DEFAULT 'definitely' CHECK (participation_intent IN ('definitely', 'maybe', 'support_only')),
  is_anonymous INTEGER DEFAULT 0,
  voted_at TEXT DEFAULT (datetime('now')),
  tenant_id TEXT DEFAULT '',
  UNIQUE(proposal_id, voter_id)
);

-- Training registrations (регистрации на тренинг)
CREATE TABLE IF NOT EXISTS training_registrations (
  id TEXT PRIMARY KEY,
  proposal_id TEXT NOT NULL REFERENCES training_proposals(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  user_name TEXT,
  registered_at TEXT DEFAULT (datetime('now')),
  attended INTEGER DEFAULT 0,
  attendance_confirmed_at TEXT,
  tenant_id TEXT DEFAULT '',
  UNIQUE(proposal_id, user_id)
);

-- Training feedback (отзывы после тренинга)
CREATE TABLE IF NOT EXISTS training_feedback (
  id TEXT PRIMARY KEY,
  proposal_id TEXT NOT NULL REFERENCES training_proposals(id) ON DELETE CASCADE,
  reviewer_id TEXT NOT NULL,
  reviewer_name TEXT NOT NULL,
  is_anonymous INTEGER DEFAULT 0,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  content_rating INTEGER CHECK (content_rating >= 1 AND content_rating <= 5),
  presenter_rating INTEGER CHECK (presenter_rating >= 1 AND presenter_rating <= 5),
  usefulness_rating INTEGER CHECK (usefulness_rating >= 1 AND usefulness_rating <= 5),
  comment TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  tenant_id TEXT DEFAULT '',
  UNIQUE(proposal_id, reviewer_id)
);

-- Training notifications (уведомления системы обучения)
CREATE TABLE IF NOT EXISTS training_notifications (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('new_proposal', 'threshold_reached', 'partner_response', 'training_scheduled', 'training_reminder', 'feedback_request', 'training_completed')),
  proposal_id TEXT REFERENCES training_proposals(id) ON DELETE CASCADE,
  recipient_id TEXT NOT NULL, -- can be 'all', 'admin', or specific user_id
  recipient_role TEXT CHECK (recipient_role IN ('admin', 'partner', 'employee', 'all')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  is_read INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  tenant_id TEXT DEFAULT ''
);

-- Training settings (настройки системы обучения)
CREATE TABLE IF NOT EXISTS training_settings (
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  description TEXT,
  updated_at TEXT DEFAULT (datetime('now')),
  tenant_id TEXT DEFAULT '',
  PRIMARY KEY (key, tenant_id)
);

-- Legacy Residents table (for backward compatibility with existing requests system)
CREATE TABLE IF NOT EXISTS residents (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  apartment_id TEXT NOT NULL REFERENCES apartments(id),
  is_owner INTEGER DEFAULT 0,
  mening_uyim_account TEXT,
  balance INTEGER DEFAULT 0,
  access_info TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  tenant_id TEXT DEFAULT ''
);

-- Executors table (extends users for executors)
CREATE TABLE IF NOT EXISTS executors (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  specialization TEXT NOT NULL CHECK (specialization IN ('plumber', 'electrician', 'elevator', 'intercom', 'cleaning', 'other')),
  is_senior INTEGER DEFAULT 0,
  status TEXT DEFAULT 'offline' CHECK (status IN ('available', 'busy', 'offline')),
  rating REAL DEFAULT 5.0,
  completed_count INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  tenant_id TEXT DEFAULT ''
);

-- Executor zones (many-to-many)
CREATE TABLE IF NOT EXISTS executor_zones (
  executor_id TEXT NOT NULL REFERENCES executors(id),
  building_id TEXT NOT NULL REFERENCES buildings(id),
  tenant_id TEXT DEFAULT '',
  PRIMARY KEY (executor_id, building_id)
);

-- Request categories
CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name_ru TEXT NOT NULL,
  name_uz TEXT NOT NULL,
  icon TEXT,
  specialization TEXT NOT NULL,
  is_active INTEGER DEFAULT 1,
  tenant_id TEXT DEFAULT ''
);

-- Requests table (no FK constraints for flexibility with users/residents)
CREATE TABLE IF NOT EXISTS requests (
  id TEXT PRIMARY KEY,
  number INTEGER,
  request_number TEXT,  -- Formatted number with branch prefix (e.g., YS-1001)
  resident_id TEXT NOT NULL,
  category_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  status TEXT DEFAULT 'new' CHECK (status IN ('new', 'accepted', 'assigned', 'in_progress', 'waiting', 'pending_approval', 'completed', 'closed', 'cancelled')),
  executor_id TEXT,
  assigned_by TEXT,
  access_info TEXT,
  photos TEXT,
  scheduled_at TEXT,
  started_at TEXT,
  completed_at TEXT,
  closed_at TEXT,
  is_paused INTEGER DEFAULT 0,
  paused_at TEXT,
  pause_reason TEXT,
  total_paused_time INTEGER DEFAULT 0,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  feedback TEXT,
  rejection_reason TEXT,
  rejection_count INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  tenant_id TEXT DEFAULT ''
);

-- Request history/log
CREATE TABLE IF NOT EXISTS request_history (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES requests(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  action TEXT NOT NULL,
  old_status TEXT,
  new_status TEXT,
  comment TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  tenant_id TEXT DEFAULT ''
);

-- Reschedule requests (запросы на перенос времени)
CREATE TABLE IF NOT EXISTS reschedule_requests (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  initiator TEXT NOT NULL CHECK (initiator IN ('resident', 'executor')),
  initiator_id TEXT NOT NULL,
  initiator_name TEXT NOT NULL,
  recipient_id TEXT NOT NULL,
  recipient_name TEXT,
  recipient_role TEXT NOT NULL CHECK (recipient_role IN ('resident', 'executor')),
  current_date TEXT,
  current_time TEXT,
  proposed_date TEXT NOT NULL,
  proposed_time TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('busy_time', 'emergency', 'not_at_home', 'need_preparation', 'other')),
  reason_text TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'expired')),
  response_note TEXT,
  responded_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  tenant_id TEXT DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_reschedule_request ON reschedule_requests(request_id);
CREATE INDEX IF NOT EXISTS idx_reschedule_status ON reschedule_requests(status);
CREATE INDEX IF NOT EXISTS idx_reschedule_recipient ON reschedule_requests(recipient_id);

-- Rental apartments (for tenant/commercial owner accounts)
CREATE TABLE IF NOT EXISTS rental_apartments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  apartment TEXT,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  owner_type TEXT DEFAULT 'tenant' CHECK (owner_type IN ('tenant', 'commercial_owner')),
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  tenant_id TEXT DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_rental_apartments_owner ON rental_apartments(owner_id);

-- Rental records (guest stays, payments)
CREATE TABLE IF NOT EXISTS rental_records (
  id TEXT PRIMARY KEY,
  apartment_id TEXT NOT NULL REFERENCES rental_apartments(id) ON DELETE CASCADE,
  guest_names TEXT NOT NULL,
  passport_info TEXT,
  check_in_date TEXT NOT NULL,
  check_out_date TEXT NOT NULL,
  amount REAL NOT NULL,
  currency TEXT DEFAULT 'UZS',
  notes TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  tenant_id TEXT DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_rental_records_apartment ON rental_records(apartment_id);
CREATE INDEX IF NOT EXISTS idx_rental_records_dates ON rental_records(check_in_date, check_out_date);

-- Messages (three-way chat)
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES requests(id),
  sender_id TEXT NOT NULL REFERENCES users(id),
  content TEXT NOT NULL,
  attachments TEXT,
  is_read INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  tenant_id TEXT DEFAULT ''
);

-- Notifications
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  data TEXT,
  is_read INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  tenant_id TEXT DEFAULT ''
);

-- Settings
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT DEFAULT (datetime('now')),
  tenant_id TEXT DEFAULT ''
);

-- Vehicles table
CREATE TABLE IF NOT EXISTS vehicles (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  plate_number TEXT NOT NULL,
  brand TEXT,
  model TEXT,
  color TEXT,
  year INTEGER,
  vehicle_type TEXT DEFAULT 'car' CHECK (vehicle_type IN ('car', 'suv', 'truck', 'motorcycle', 'other')),
  owner_type TEXT DEFAULT 'individual' CHECK (owner_type IN ('individual', 'legal_entity', 'service')),
  company_name TEXT,
  parking_spot TEXT,
  notes TEXT,
  is_primary INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  tenant_id TEXT DEFAULT ''
);

-- Guest access codes (extended)
CREATE TABLE IF NOT EXISTS guest_access_codes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  resident_id TEXT,
  qr_token TEXT UNIQUE NOT NULL,
  code TEXT,
  visitor_type TEXT DEFAULT 'guest' CHECK (visitor_type IN ('guest', 'courier', 'taxi', 'service', 'other')),
  visitor_name TEXT,
  visitor_phone TEXT,
  visitor_vehicle_plate TEXT,
  access_type TEXT DEFAULT 'single_use' CHECK (access_type IN ('single_use', 'day', 'week', 'month', 'custom')),
  valid_from TEXT DEFAULT (datetime('now')),
  valid_until TEXT,
  max_uses INTEGER DEFAULT 1,
  current_uses INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'used', 'expired', 'revoked')),
  resident_name TEXT,
  resident_phone TEXT,
  resident_apartment TEXT,
  resident_address TEXT,
  notes TEXT,
  revoked_at TEXT,
  revoked_by TEXT,
  revoked_reason TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  tenant_id TEXT DEFAULT ''
);

-- Guest access usage logs (track each scan)
CREATE TABLE IF NOT EXISTS guest_access_logs (
  id TEXT PRIMARY KEY,
  code_id TEXT NOT NULL,
  scanned_by_id TEXT,
  scanned_by_name TEXT,
  scanned_by_role TEXT,
  action TEXT NOT NULL CHECK (action IN ('entry_allowed', 'entry_denied', 'scan_expired', 'scan_used', 'scan_revoked', 'scan_invalid')),
  visitor_type TEXT,
  resident_name TEXT,
  resident_apartment TEXT,
  scanned_at TEXT DEFAULT (datetime('now')),
  tenant_id TEXT DEFAULT ''
);

-- Chat channels
CREATE TABLE IF NOT EXISTS chat_channels (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('uk_general', 'building_general', 'admin_support', 'private_support')),
  name TEXT NOT NULL,
  description TEXT,
  building_id TEXT REFERENCES buildings(id),
  resident_id TEXT,  -- user.id for private_support channels (no FK to allow flexibility)
  created_by TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  tenant_id TEXT DEFAULT ''
);

-- Chat channel participants
CREATE TABLE IF NOT EXISTS chat_participants (
  channel_id TEXT NOT NULL REFERENCES chat_channels(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  joined_at TEXT DEFAULT (datetime('now')),
  tenant_id TEXT DEFAULT '',
  PRIMARY KEY (channel_id, user_id)
);

-- Chat messages
CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL REFERENCES chat_channels(id),
  sender_id TEXT NOT NULL REFERENCES users(id),
  content TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  tenant_id TEXT DEFAULT ''
);

-- Chat message read status
CREATE TABLE IF NOT EXISTS chat_message_reads (
  message_id TEXT NOT NULL REFERENCES chat_messages(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  read_at TEXT DEFAULT (datetime('now')),
  tenant_id TEXT DEFAULT '',
  PRIMARY KEY (message_id, user_id)
);

-- Chat channel reads (for tracking when user last read a channel)
CREATE TABLE IF NOT EXISTS chat_channel_reads (
  channel_id TEXT NOT NULL REFERENCES chat_channels(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_read_at TEXT DEFAULT (datetime('now')),
  tenant_id TEXT DEFAULT '',
  PRIMARY KEY (channel_id, user_id)
);

-- Notes (personal notepad for users)
CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  tenant_id TEXT DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_notes_user_id ON notes(user_id);
CREATE INDEX IF NOT EXISTS idx_notes_updated_at ON notes(updated_at);

-- Announcements
CREATE TABLE IF NOT EXISTS announcements (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('residents', 'employees', 'all')),
  target_type TEXT CHECK (target_type IN ('all', 'branch', 'building', 'entrance', 'floor', 'custom')),
  target_branch TEXT,
  target_building_id TEXT REFERENCES buildings(id),
  target_entrance TEXT,
  target_floor TEXT,
  target_logins TEXT,
  priority TEXT DEFAULT 'normal' CHECK (priority IN ('normal', 'important', 'urgent')),
  is_active INTEGER DEFAULT 1,
  expires_at TEXT,
  attachments TEXT, -- JSON array of {name, url, type, size}
  created_by TEXT REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  tenant_id TEXT DEFAULT ''
);

-- Announcement views (for tracking who viewed which announcement)
CREATE TABLE IF NOT EXISTS announcement_views (
  id TEXT PRIMARY KEY,
  announcement_id TEXT NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  viewed_at TEXT DEFAULT (datetime('now')),
  tenant_id TEXT DEFAULT '',
  UNIQUE(announcement_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_announcement_views_announcement ON announcement_views(announcement_id);
CREATE INDEX IF NOT EXISTS idx_announcement_views_user ON announcement_views(user_id);

-- =====================================================
-- MEETING SYSTEM TABLES (Система собраний собственников)
-- =====================================================

-- Meetings (extended for full OSS workflow)
CREATE TABLE IF NOT EXISTS meetings (
  id TEXT PRIMARY KEY,
  number INTEGER,
  building_id TEXT NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
  building_address TEXT,
  description TEXT, -- Обоснование/описание собрания

  -- Organizer
  organizer_type TEXT DEFAULT 'uk' CHECK (organizer_type IN ('uk', 'resident', 'initiative_group')),
  organizer_id TEXT,
  organizer_name TEXT,

  -- Format
  format TEXT DEFAULT 'offline' CHECK (format IN ('online', 'offline', 'hybrid')),

  -- Status (state machine)
  status TEXT DEFAULT 'draft' CHECK (status IN (
    'draft', 'pending_moderation', 'schedule_poll_open', 'schedule_confirmed',
    'voting_open', 'voting_closed', 'results_published',
    'protocol_generated', 'protocol_approved', 'cancelled'
  )),

  -- Schedule poll
  schedule_poll_ends_at TEXT,
  schedule_poll_opened_at TEXT,
  schedule_confirmed_at TEXT,

  -- Confirmed schedule
  confirmed_date_time TEXT,
  location TEXT,

  -- Voting settings
  voting_unit TEXT DEFAULT 'apartment' CHECK (voting_unit IN ('apartment', 'share', 'person')),
  quorum_percent INTEGER DEFAULT 50,
  allow_revote INTEGER DEFAULT 1,
  require_otp INTEGER DEFAULT 1,
  show_intermediate_results INTEGER DEFAULT 0,

  -- Participation tracking (по площади согласно закону РУз)
  total_area REAL DEFAULT 0, -- Общая площадь помещений дома (кв.м)
  voted_area REAL DEFAULT 0, -- Площадь проголосовавших собственников (кв.м)
  total_eligible_count INTEGER DEFAULT 0, -- Количество правомочных голосующих
  participated_count INTEGER DEFAULT 0, -- Количество проголосовавших
  quorum_reached INTEGER DEFAULT 0,
  participation_percent REAL DEFAULT 0,

  -- Voting timestamps
  voting_opened_at TEXT,
  voting_closed_at TEXT,
  results_published_at TEXT,

  -- Protocol
  protocol_id TEXT,
  protocol_generated_at TEXT,
  protocol_approved_at TEXT,

  -- Moderation
  moderated_at TEXT,
  moderated_by TEXT,

  -- Cancellation
  cancelled_at TEXT,
  cancellation_reason TEXT,

  -- Materials (JSON array of file references)
  materials TEXT,

  -- Notification logs (JSON array)
  notification_logs TEXT,
  reminders_sent TEXT,

  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  tenant_id TEXT DEFAULT ''
);

-- Meeting schedule options (for schedule poll)
CREATE TABLE IF NOT EXISTS meeting_schedule_options (
  id TEXT PRIMARY KEY,
  meeting_id TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  date_time TEXT NOT NULL,
  votes_by_share REAL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  tenant_id TEXT DEFAULT ''
);

-- Meeting schedule votes
CREATE TABLE IF NOT EXISTS meeting_schedule_votes (
  id TEXT PRIMARY KEY,
  meeting_id TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  option_id TEXT NOT NULL REFERENCES meeting_schedule_options(id) ON DELETE CASCADE,
  voter_id TEXT NOT NULL,
  voter_name TEXT,
  vote_weight REAL DEFAULT 50, -- Вес голоса = площадь квартиры (кв.м), default 50 sq.m
  voted_at TEXT DEFAULT (datetime('now')),
  tenant_id TEXT DEFAULT '',
  UNIQUE(meeting_id, voter_id)
);

-- Meeting agenda items (вопросы повестки дня)
CREATE TABLE IF NOT EXISTS meeting_agenda_items (
  id TEXT PRIMARY KEY,
  meeting_id TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  item_order INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  description_extended TEXT, -- Расширенное описание для жителей
  attachments TEXT, -- JSON array: [{name, url, type, size}] — фото/документы к вопросу
  threshold TEXT DEFAULT 'simple_majority' CHECK (threshold IN (
    'simple_majority', 'qualified_majority', 'two_thirds', 'three_quarters', 'unanimous'
  )),
  -- Результаты голосования по площади (кв.м)
  votes_for_area REAL DEFAULT 0, -- Сумма голосов «ЗА» (кв.м)
  votes_against_area REAL DEFAULT 0, -- Сумма голосов «ПРОТИВ» (кв.м)
  votes_abstain_area REAL DEFAULT 0, -- Сумма «ВОЗДЕРЖАЛСЯ» (кв.м)
  is_approved INTEGER,
  decision TEXT CHECK (decision IN ('approved', 'rejected', 'no_quorum')),
  created_at TEXT DEFAULT (datetime('now')),
  tenant_id TEXT DEFAULT ''
);

-- Meeting vote records (юридически значимые голоса)
CREATE TABLE IF NOT EXISTS meeting_vote_records (
  id TEXT PRIMARY KEY,
  meeting_id TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  agenda_item_id TEXT NOT NULL REFERENCES meeting_agenda_items(id) ON DELETE CASCADE,

  -- Voter info
  voter_id TEXT NOT NULL,
  voter_name TEXT NOT NULL,
  apartment_id TEXT,
  apartment_number TEXT,
  ownership_share REAL,

  -- Vote
  choice TEXT NOT NULL CHECK (choice IN ('for', 'against', 'abstain')),
  vote_weight REAL DEFAULT 1, -- Вес голоса = площадь квартиры (кв.м) согласно закону РУз

  -- Verification
  verification_method TEXT DEFAULT 'login' CHECK (verification_method IN ('login', 'otp', 'in_person', 'proxy')),
  ip_address TEXT, -- IP адрес устройства для аудита
  user_agent TEXT, -- Данные браузера/устройства для аудита
  otp_verified INTEGER DEFAULT 0,

  -- Audit trail
  voted_at TEXT DEFAULT (datetime('now')),
  vote_hash TEXT NOT NULL,
  is_revote INTEGER DEFAULT 0,
  previous_vote_id TEXT,
  tenant_id TEXT DEFAULT '',
  UNIQUE(meeting_id, agenda_item_id, voter_id)
);

-- OTP records for vote verification
CREATE TABLE IF NOT EXISTS meeting_otp_records (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  phone TEXT NOT NULL,
  code TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN ('schedule_vote', 'agenda_vote', 'protocol_sign')),
  meeting_id TEXT REFERENCES meetings(id) ON DELETE CASCADE,
  agenda_item_id TEXT,
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  is_used INTEGER DEFAULT 0,
  verified_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  tenant_id TEXT DEFAULT ''
);

-- Meeting protocols
CREATE TABLE IF NOT EXISTS meeting_protocols (
  id TEXT PRIMARY KEY,
  meeting_id TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  protocol_number TEXT NOT NULL,
  content TEXT NOT NULL,
  protocol_hash TEXT NOT NULL,

  -- Attachments (JSON array)
  attachments TEXT,

  -- UK signature
  signed_by_uk_user_id TEXT,
  signed_by_uk_name TEXT,
  signed_by_uk_role TEXT,
  signed_by_uk_at TEXT,
  uk_signature_hash TEXT,

  -- Initiative group signature (for resident-initiated)
  signed_by_group_user_id TEXT,
  signed_by_group_name TEXT,
  signed_by_group_at TEXT,
  group_signature_hash TEXT,

  generated_at TEXT DEFAULT (datetime('now')),
  tenant_id TEXT DEFAULT ''
);

-- Voting units (квартиры с правом голоса)
CREATE TABLE IF NOT EXISTS meeting_voting_units (
  id TEXT PRIMARY KEY,
  building_id TEXT NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
  apartment_id TEXT REFERENCES apartments(id) ON DELETE CASCADE,
  apartment_number TEXT NOT NULL,
  owner_id TEXT,
  owner_name TEXT,
  co_owner_ids TEXT, -- JSON array
  ownership_share REAL DEFAULT 100,
  total_area REAL,
  is_verified INTEGER DEFAULT 0,
  verified_at TEXT,
  verified_by TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  tenant_id TEXT DEFAULT ''
);

-- Building meeting settings
CREATE TABLE IF NOT EXISTS meeting_building_settings (
  building_id TEXT PRIMARY KEY REFERENCES buildings(id) ON DELETE CASCADE,
  voting_unit TEXT DEFAULT 'apartment' CHECK (voting_unit IN ('apartment', 'share', 'person')),
  default_quorum_percent INTEGER DEFAULT 50,
  schedule_poll_duration_days INTEGER DEFAULT 3,
  voting_duration_hours INTEGER DEFAULT 48,
  allow_resident_initiative INTEGER DEFAULT 1,
  require_moderation INTEGER DEFAULT 1,
  default_meeting_time TEXT DEFAULT '19:00',
  reminder_hours_before TEXT DEFAULT '[48, 2]', -- JSON array
  notification_channels TEXT DEFAULT '["in_app", "push"]', -- JSON array
  updated_at TEXT DEFAULT (datetime('now')),
  tenant_id TEXT DEFAULT ''
);

-- Meeting eligible voters (many-to-many)
CREATE TABLE IF NOT EXISTS meeting_eligible_voters (
  meeting_id TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  apartment_id TEXT,
  ownership_share REAL DEFAULT 100,
  tenant_id TEXT DEFAULT '',
  PRIMARY KEY (meeting_id, user_id)
);

-- Meeting participated voters (tracking)
CREATE TABLE IF NOT EXISTS meeting_participated_voters (
  meeting_id TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  first_vote_at TEXT DEFAULT (datetime('now')),
  tenant_id TEXT DEFAULT '',
  PRIMARY KEY (meeting_id, user_id)
);

-- Meeting agenda comments (комментарии/доводы к вопросам повестки дня)
-- Согласно ТЗ: Каждый участник может оставить комментарий/довод к вопросу
CREATE TABLE IF NOT EXISTS meeting_agenda_comments (
  id TEXT PRIMARY KEY,
  agenda_item_id TEXT NOT NULL REFERENCES meeting_agenda_items(id) ON DELETE CASCADE,
  meeting_id TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  resident_id TEXT NOT NULL,
  resident_name TEXT NOT NULL,
  apartment_number TEXT,
  content TEXT NOT NULL,
  comment_type TEXT DEFAULT 'comment' CHECK (comment_type IN ('comment', 'objection', 'counter_proposal')),
  counter_proposal TEXT, -- Альтернативное предложение (при голосовании ПРОТИВ)
  include_in_protocol INTEGER DEFAULT 1, -- Флаг "Включить в протокол"
  tenant_id TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Индекс для быстрого поиска комментариев по вопросу
CREATE INDEX IF NOT EXISTS idx_meeting_comments_agenda ON meeting_agenda_comments(agenda_item_id);
CREATE INDEX IF NOT EXISTS idx_meeting_comments_resident ON meeting_agenda_comments(resident_id);

-- Employee ratings
CREATE TABLE IF NOT EXISTS employee_ratings (
  id TEXT PRIMARY KEY,
  executor_id TEXT NOT NULL REFERENCES executors(id),
  resident_id TEXT NOT NULL REFERENCES residents(id),
  quality INTEGER CHECK (quality >= 1 AND quality <= 5),
  speed INTEGER CHECK (speed >= 1 AND speed <= 5),
  politeness INTEGER CHECK (politeness >= 1 AND politeness <= 5),
  comment TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  tenant_id TEXT DEFAULT ''
);

-- UK (management company) satisfaction ratings - monthly
CREATE TABLE IF NOT EXISTS uk_satisfaction_ratings (
  id TEXT PRIMARY KEY,
  resident_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  period TEXT NOT NULL, -- YYYY-MM format
  overall INTEGER NOT NULL CHECK (overall >= 1 AND overall <= 5),
  cleanliness INTEGER CHECK (cleanliness >= 1 AND cleanliness <= 5),
  responsiveness INTEGER CHECK (responsiveness >= 1 AND responsiveness <= 5),
  communication INTEGER CHECK (communication >= 1 AND communication <= 5),
  comment TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(resident_id, tenant_id, period)
);

CREATE INDEX IF NOT EXISTS idx_uk_ratings_resident ON uk_satisfaction_ratings(resident_id);
CREATE INDEX IF NOT EXISTS idx_uk_ratings_period ON uk_satisfaction_ratings(period);
CREATE INDEX IF NOT EXISTS idx_uk_ratings_tenant ON uk_satisfaction_ratings(tenant_id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_login ON users(login);
CREATE INDEX IF NOT EXISTS idx_requests_status ON requests(status);
CREATE INDEX IF NOT EXISTS idx_requests_resident ON requests(resident_id);
CREATE INDEX IF NOT EXISTS idx_requests_executor ON requests(executor_id);
CREATE INDEX IF NOT EXISTS idx_messages_request ON messages(request_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_user ON vehicles(user_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_plate ON vehicles(plate_number);
CREATE INDEX IF NOT EXISTS idx_guest_codes_resident ON guest_access_codes(resident_id);
CREATE INDEX IF NOT EXISTS idx_guest_codes_code ON guest_access_codes(code);
CREATE INDEX IF NOT EXISTS idx_chat_messages_channel ON chat_messages(channel_id);
CREATE INDEX IF NOT EXISTS idx_announcements_type ON announcements(type);
CREATE INDEX IF NOT EXISTS idx_entrances_building ON entrances(building_id);
CREATE INDEX IF NOT EXISTS idx_building_docs_building ON building_documents(building_id);
CREATE INDEX IF NOT EXISTS idx_buildings_branch ON buildings(branch_code);
CREATE INDEX IF NOT EXISTS idx_apartments_building ON apartments(building_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_apartments_building_number ON apartments(building_id, number);
CREATE INDEX IF NOT EXISTS idx_apartments_entrance ON apartments(entrance_id);
CREATE INDEX IF NOT EXISTS idx_apartments_owner ON apartments(primary_owner_id);
CREATE INDEX IF NOT EXISTS idx_owners_phone ON owners(phone);
CREATE INDEX IF NOT EXISTS idx_owners_type ON owners(type);
CREATE INDEX IF NOT EXISTS idx_owner_apartments_owner ON owner_apartments(owner_id);
CREATE INDEX IF NOT EXISTS idx_owner_apartments_apartment ON owner_apartments(apartment_id);
CREATE INDEX IF NOT EXISTS idx_personal_accounts_apartment ON personal_accounts(apartment_id);
CREATE INDEX IF NOT EXISTS idx_personal_accounts_building ON personal_accounts(building_id);
CREATE INDEX IF NOT EXISTS idx_personal_accounts_number ON personal_accounts(number);
CREATE INDEX IF NOT EXISTS idx_crm_residents_apartment ON crm_residents(apartment_id);
CREATE INDEX IF NOT EXISTS idx_crm_residents_owner ON crm_residents(owner_id);
CREATE INDEX IF NOT EXISTS idx_crm_residents_active ON crm_residents(is_active);
CREATE INDEX IF NOT EXISTS idx_meters_apartment ON meters(apartment_id);
CREATE INDEX IF NOT EXISTS idx_meters_building ON meters(building_id);
CREATE INDEX IF NOT EXISTS idx_meters_type ON meters(type);
CREATE INDEX IF NOT EXISTS idx_meters_active ON meters(is_active);
CREATE INDEX IF NOT EXISTS idx_meter_readings_meter ON meter_readings(meter_id);
CREATE INDEX IF NOT EXISTS idx_meter_readings_date ON meter_readings(reading_date);
CREATE INDEX IF NOT EXISTS idx_meter_readings_status ON meter_readings(status);

-- Training System indexes
CREATE INDEX IF NOT EXISTS idx_training_partners_active ON training_partners(is_active);
CREATE INDEX IF NOT EXISTS idx_training_proposals_status ON training_proposals(status);
CREATE INDEX IF NOT EXISTS idx_training_proposals_partner ON training_proposals(partner_id);
CREATE INDEX IF NOT EXISTS idx_training_proposals_author ON training_proposals(author_id);
CREATE INDEX IF NOT EXISTS idx_training_votes_proposal ON training_votes(proposal_id);
CREATE INDEX IF NOT EXISTS idx_training_votes_voter ON training_votes(voter_id);
CREATE INDEX IF NOT EXISTS idx_training_registrations_proposal ON training_registrations(proposal_id);
CREATE INDEX IF NOT EXISTS idx_training_registrations_user ON training_registrations(user_id);
CREATE INDEX IF NOT EXISTS idx_training_feedback_proposal ON training_feedback(proposal_id);
CREATE INDEX IF NOT EXISTS idx_training_notifications_recipient ON training_notifications(recipient_id);
CREATE INDEX IF NOT EXISTS idx_training_notifications_proposal ON training_notifications(proposal_id);
CREATE INDEX IF NOT EXISTS idx_training_notifications_read ON training_notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_training_partners_tenant ON training_partners(tenant_id);
CREATE INDEX IF NOT EXISTS idx_training_proposals_tenant ON training_proposals(tenant_id);
CREATE INDEX IF NOT EXISTS idx_training_votes_tenant ON training_votes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_training_registrations_tenant ON training_registrations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_training_feedback_tenant ON training_feedback(tenant_id);
CREATE INDEX IF NOT EXISTS idx_training_notifications_tenant ON training_notifications(tenant_id);
CREATE INDEX IF NOT EXISTS idx_training_settings_tenant ON training_settings(tenant_id);

-- Meeting System indexes
CREATE INDEX IF NOT EXISTS idx_meetings_building ON meetings(building_id);
CREATE INDEX IF NOT EXISTS idx_meetings_status ON meetings(status);
CREATE INDEX IF NOT EXISTS idx_meetings_organizer ON meetings(organizer_id);
CREATE INDEX IF NOT EXISTS idx_meeting_schedule_opts_meeting ON meeting_schedule_options(meeting_id);
CREATE INDEX IF NOT EXISTS idx_meeting_schedule_votes_meeting ON meeting_schedule_votes(meeting_id);
CREATE INDEX IF NOT EXISTS idx_meeting_schedule_votes_voter ON meeting_schedule_votes(voter_id);
CREATE INDEX IF NOT EXISTS idx_meeting_agenda_meeting ON meeting_agenda_items(meeting_id);
CREATE INDEX IF NOT EXISTS idx_meeting_vote_records_meeting ON meeting_vote_records(meeting_id);
CREATE INDEX IF NOT EXISTS idx_meeting_vote_records_agenda ON meeting_vote_records(agenda_item_id);
CREATE INDEX IF NOT EXISTS idx_meeting_vote_records_voter ON meeting_vote_records(voter_id);
CREATE INDEX IF NOT EXISTS idx_meeting_otp_user ON meeting_otp_records(user_id);
CREATE INDEX IF NOT EXISTS idx_meeting_otp_meeting ON meeting_otp_records(meeting_id);
CREATE INDEX IF NOT EXISTS idx_meeting_protocols_meeting ON meeting_protocols(meeting_id);
CREATE INDEX IF NOT EXISTS idx_meeting_voting_units_building ON meeting_voting_units(building_id);
CREATE INDEX IF NOT EXISTS idx_meeting_voting_units_owner ON meeting_voting_units(owner_id);
CREATE INDEX IF NOT EXISTS idx_meeting_eligible_meeting ON meeting_eligible_voters(meeting_id);
CREATE INDEX IF NOT EXISTS idx_meeting_participated_meeting ON meeting_participated_voters(meeting_id);

-- CRITICAL INDEXES FOR PRODUCTION (5000+ users)

-- Composite indexes for common dashboard queries
CREATE INDEX IF NOT EXISTS idx_requests_status_created ON requests(status, created_at DESC);
-- FIXME: column missing
-- CREATE INDEX IF NOT EXISTS idx_requests_building_status ON requests(building_id, status);
CREATE INDEX IF NOT EXISTS idx_requests_resident_status ON requests(resident_id, status);
CREATE INDEX IF NOT EXISTS idx_requests_executor_status ON requests(executor_id, status);
CREATE INDEX IF NOT EXISTS idx_requests_category_status ON requests(category_id, status);

-- User isolation and building-scoped queries
CREATE INDEX IF NOT EXISTS idx_users_building ON users(building_id);
CREATE INDEX IF NOT EXISTS idx_users_role_active ON users(role, is_active);
CREATE INDEX IF NOT EXISTS idx_users_building_role ON users(building_id, role);

-- Guest access (frequently queried by security)
CREATE INDEX IF NOT EXISTS idx_guest_codes_status ON guest_access_codes(status);
CREATE INDEX IF NOT EXISTS idx_guest_codes_valid_until ON guest_access_codes(valid_until);
-- FIXME: column missing
-- CREATE INDEX IF NOT EXISTS idx_guest_codes_building ON guest_access_codes(building_id);
CREATE INDEX IF NOT EXISTS idx_guest_codes_resident_status ON guest_access_codes(resident_id, status);

-- Announcements targeting
CREATE INDEX IF NOT EXISTS idx_announcements_created ON announcements(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_announcements_expires ON announcements(expires_at);
CREATE INDEX IF NOT EXISTS idx_announcements_building ON announcements(target_building_id);

-- Meetings optimization
CREATE INDEX IF NOT EXISTS idx_meetings_building_status ON meetings(building_id, status);
CREATE INDEX IF NOT EXISTS idx_meetings_created ON meetings(created_at DESC);

-- Chat optimization
CREATE INDEX IF NOT EXISTS idx_chat_messages_created ON chat_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_channels_type ON chat_channels(type);

-- Notifications priority
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC);

-- Vehicles for security search
-- FIXME: column missing
-- CREATE INDEX IF NOT EXISTS idx_vehicles_building ON vehicles(building_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_created ON vehicles(created_at DESC);

-- CRM residents for filtering
-- FIXME: column missing
-- CREATE INDEX IF NOT EXISTS idx_crm_residents_building ON crm_residents(building_id);
-- FIXME: column missing
-- CREATE INDEX IF NOT EXISTS idx_crm_residents_building_active ON crm_residents(building_id, is_active);

-- ADDITIONAL INDEXES FOR 5000+ USERS (added during optimization audit)

-- Users: onboarding and password tracking
CREATE INDEX IF NOT EXISTS idx_users_password_changed ON users(password_changed_at);
CREATE INDEX IF NOT EXISTS idx_users_contract_signed ON users(contract_signed_at);

-- Requests: executor workload queries
-- FIXME: column missing
-- CREATE INDEX IF NOT EXISTS idx_requests_assigned_at ON requests(assigned_at DESC);
CREATE INDEX IF NOT EXISTS idx_requests_completed_at ON requests(completed_at DESC);
CREATE INDEX IF NOT EXISTS idx_requests_rating ON requests(executor_id, rating) WHERE rating IS NOT NULL;

-- Chat: message reads optimization (for unread counts)
CREATE INDEX IF NOT EXISTS idx_chat_message_reads_user ON chat_message_reads(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_sender ON chat_messages(sender_id);

-- Guest codes: user codes listing
CREATE INDEX IF NOT EXISTS idx_guest_codes_user_created ON guest_access_codes(user_id, created_at DESC);

-- Vehicles: search optimization
-- FIXME: column missing
-- CREATE INDEX IF NOT EXISTS idx_vehicles_resident ON vehicles(resident_id);

-- Reschedule requests: pending approvals
CREATE INDEX IF NOT EXISTS idx_reschedule_status ON reschedule_requests(status);
CREATE INDEX IF NOT EXISTS idx_reschedule_request ON reschedule_requests(request_id);

-- Personal accounts: debt collection queries
CREATE INDEX IF NOT EXISTS idx_personal_accounts_status ON personal_accounts(status);
CREATE INDEX IF NOT EXISTS idx_personal_accounts_debt ON personal_accounts(current_debt DESC) WHERE current_debt > 0;

-- Initial data
INSERT OR IGNORE INTO settings (key, value) VALUES
  ('routing_mode', 'hybrid'),
  ('auto_close_hours', '48'),
  ('company_name', 'ТСЖ Юнусабад');

INSERT OR IGNORE INTO categories (id, name_ru, name_uz, icon, specialization) VALUES
  ('plumber', 'Сантехника', 'Santexnika', '🔧', 'plumber'),
  ('electrician', 'Электрика', 'Elektrika', '💡', 'electrician'),
  ('elevator', 'Лифт', 'Lift', '🛗', 'elevator'),
  ('intercom', 'Домофон', 'Domofon', '🔔', 'intercom'),
  ('cleaning', 'Уборка', 'Tozalash', '🧹', 'cleaning'),
  ('security', 'Охрана', 'Qorovul', '🛡️', 'security'),
  ('carpenter', 'Столярные работы', 'Duradgorlik', '🪚', 'other'),
  ('boiler', 'Котёл', 'Qozon', '🔥', 'other'),
  ('ac', 'Кондиционер', 'Konditsioner', '❄️', 'other'),
  ('other', 'Другое', 'Boshqa', '📋', 'other');

-- Training system initial settings
INSERT OR IGNORE INTO training_settings (key, value, description) VALUES
  ('vote_threshold', '5', 'Минимальное количество голосов для отправки на рассмотрение'),
  ('allow_anonymous_proposals', 'true', 'Разрешить анонимные предложения'),
  ('allow_anonymous_votes', 'true', 'Разрешить анонимное голосование'),
  ('allow_anonymous_feedback', 'true', 'Разрешить анонимные отзывы'),
  ('notify_all_on_new_proposal', 'true', 'Уведомлять всех о новых предложениях'),
  ('auto_close_after_days', '30', 'Автоматически закрывать неактивные предложения через N дней');

-- ============================================================
-- ADVERTISING PLATFORM - Рекламная платформа "Полезные контакты"
-- ===============================================================
-- Жители только смотрят рекламу и получают купоны
-- ukreklama - создаёт объявления, видит статистику
-- ukchek - проверяет и активирует купоны

-- Ad categories (external commercial services)
CREATE TABLE IF NOT EXISTS ad_categories (
  id TEXT PRIMARY KEY,
  name_ru TEXT NOT NULL,
  name_uz TEXT NOT NULL,
  icon TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  tenant_id TEXT DEFAULT ''
);

-- Advertisements (рекламные объявления)
CREATE TABLE IF NOT EXISTS ads (
  id TEXT PRIMARY KEY,
  category_id TEXT NOT NULL REFERENCES ad_categories(id),

  -- Basic info
  title TEXT NOT NULL,                         -- Заголовок
  description TEXT,                            -- Описание услуг

  -- Contact info
  phone TEXT NOT NULL,                         -- Телефон
  phone2 TEXT,                                 -- Дополнительный телефон
  telegram TEXT,                               -- Telegram username
  instagram TEXT,                              -- Instagram username
  facebook TEXT,                               -- Facebook page
  website TEXT,                                -- Веб-сайт
  address TEXT,                                -- Адрес
  work_hours TEXT,                             -- Часы работы
  work_days TEXT,                              -- Дни работы

  -- Media (URLs to images stored externally or base64)
  logo_url TEXT,                               -- Логотип
  photos TEXT,                                 -- JSON array of photo URLs (до 5)

  -- Promotion settings
  discount_percent INTEGER DEFAULT 0,          -- Процент скидки по купону
  badges TEXT,                                 -- JSON: {"recommended": true, "new": true, "hot": false}

  -- Targeting
  target_type TEXT DEFAULT 'all' CHECK (target_type IN ('all', 'branches', 'buildings')),
  target_branches TEXT,                        -- JSON array of branch codes (если target_type = 'branches')
  target_buildings TEXT,                       -- JSON array of building IDs (если target_type = 'buildings')

  -- Timing
  starts_at TEXT NOT NULL,                     -- Дата начала показа
  expires_at TEXT NOT NULL,                    -- Дата окончания показа
  duration_type TEXT DEFAULT 'month' CHECK (duration_type IN ('week', '2weeks', 'month', '3months', '6months', 'year')),

  -- Status
  status TEXT DEFAULT 'active' CHECK (status IN ('draft', 'active', 'paused', 'expired', 'archived')),

  -- Stats (cached, updated on view/coupon)
  views_count INTEGER DEFAULT 0,               -- Просмотры
  coupons_issued INTEGER DEFAULT 0,            -- Выдано купонов
  coupons_activated INTEGER DEFAULT 0,         -- Активировано купонов

  -- Meta
  created_by TEXT NOT NULL REFERENCES users(id),  -- ukreklama user
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  tenant_id TEXT DEFAULT ''
);

-- Coupons (купоны выданные жителям)
CREATE TABLE IF NOT EXISTS ad_coupons (
  id TEXT PRIMARY KEY,
  ad_id TEXT NOT NULL REFERENCES ads(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),  -- Житель получивший купон

  -- Coupon details
  code TEXT NOT NULL UNIQUE,                   -- Уникальный 6-символьный код (буквы+цифры)
  discount_percent INTEGER NOT NULL,           -- Процент скидки

  -- Status
  status TEXT DEFAULT 'issued' CHECK (status IN ('issued', 'activated', 'expired', 'cancelled')),

  -- Timestamps
  issued_at TEXT DEFAULT (datetime('now')),    -- Когда выдан
  expires_at TEXT,                             -- Когда истекает (копируется из ad.expires_at)
  activated_at TEXT,                           -- Когда активирован
  activated_by TEXT REFERENCES users(id),      -- ukchek user который активировал

  -- Activation details (заполняется при активации)
  activation_amount REAL,                      -- Сумма покупки
  discount_amount REAL                         -- Сумма скидки,
  tenant_id TEXT DEFAULT ''
);

-- Ad views tracking (для статистики)
CREATE TABLE IF NOT EXISTS ad_views (
  id TEXT PRIMARY KEY,
  ad_id TEXT NOT NULL REFERENCES ads(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  viewed_at TEXT DEFAULT (datetime('now')),

  -- Unique constraint: один просмотр в день от одного пользователя,
  tenant_id TEXT DEFAULT '',
  UNIQUE(ad_id, user_id)
);

-- Indexes for ads
CREATE INDEX IF NOT EXISTS idx_ads_category ON ads(category_id);
CREATE INDEX IF NOT EXISTS idx_ads_status ON ads(status);
CREATE INDEX IF NOT EXISTS idx_ads_dates ON ads(starts_at, expires_at);
CREATE INDEX IF NOT EXISTS idx_ads_created_by ON ads(created_by);

-- Indexes for coupons
CREATE INDEX IF NOT EXISTS idx_ad_coupons_ad ON ad_coupons(ad_id);
CREATE INDEX IF NOT EXISTS idx_ad_coupons_user ON ad_coupons(user_id);
CREATE INDEX IF NOT EXISTS idx_ad_coupons_code ON ad_coupons(code);
CREATE INDEX IF NOT EXISTS idx_ad_coupons_status ON ad_coupons(status);

-- Indexes for views
CREATE INDEX IF NOT EXISTS idx_ad_views_ad ON ad_views(ad_id);
CREATE INDEX IF NOT EXISTS idx_ad_views_user ON ad_views(user_id);

-- Platform ad → tenant assignments (super admin assigns one ad to many tenants)
CREATE TABLE IF NOT EXISTS ad_tenant_assignments (
  id TEXT PRIMARY KEY,
  ad_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  assigned_at TEXT DEFAULT (datetime('now')),
  UNIQUE(ad_id, tenant_id)
);
CREATE INDEX IF NOT EXISTS idx_ata_ad_id ON ad_tenant_assignments(ad_id);
CREATE INDEX IF NOT EXISTS idx_ata_tenant_id ON ad_tenant_assignments(tenant_id, enabled);

-- Initial categories for ads
INSERT OR IGNORE INTO ad_categories (id, name_ru, name_uz, icon, sort_order) VALUES
  ('cleaning', 'Уборка', 'Tozalash', 'cleaning', 1),
  ('renovation', 'Ремонт квартир', 'Kvartira ta''miri', 'renovation', 2),
  ('minor_repair', 'Мелкий ремонт', 'Mayda ta''mirlash', 'minor_repair', 3),
  ('electrical', 'Электрика (частники)', 'Elektrika (xususiy)', 'electrical', 4),
  ('plumbing', 'Сантехника (частники)', 'Santexnika (xususiy)', 'plumbing', 5),
  ('moving', 'Переезды и грузчики', 'Ko''chish va yukchilar', 'moving', 6),
  ('auto', 'Авто-услуги', 'Avto-xizmatlar', 'auto', 7),
  ('construction', 'Строительные работы', 'Qurilish ishlari', 'construction', 8),
  ('ac', 'Кондиционеры', 'Konditsionerlar', 'ac', 9),
  ('beauty', 'Красота и здоровье', 'Go''zallik va salomatlik', 'beauty', 10),
  ('tailoring', 'Швейные / обувные работы', 'Tikuvchilik / oyoq kiyimlari', 'tailoring', 11),
  ('it', 'IT-мастера', 'IT-ustalar', 'it', 12),
  ('domestic', 'Повар / домработница / няня', 'Oshpaz / uy xodimlari / enaga', 'domestic', 13),
  ('pest_control', 'Дезинфекция', 'Dezinfeksiya', 'pest_control', 14),
  ('dry_cleaning', 'Химчистка', 'Kimyoviy tozalash', 'dry_cleaning', 15),
  ('delivery', 'Доставка / курьеры', 'Yetkazib berish / kuryerlar', 'delivery', 16),
  ('other', 'Другое', 'Boshqa', 'other', 17);

-- ==================== MARKETPLACE TABLES ====================

-- Marketplace categories
CREATE TABLE IF NOT EXISTS marketplace_categories (
  id TEXT PRIMARY KEY,
  name_ru TEXT NOT NULL,
  name_uz TEXT NOT NULL,
  icon TEXT,
  sort_order INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  tenant_id TEXT DEFAULT ''
);

-- Marketplace products
CREATE TABLE IF NOT EXISTS marketplace_products (
  id TEXT PRIMARY KEY,
  category_id TEXT NOT NULL REFERENCES marketplace_categories(id),
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
  updated_at TEXT DEFAULT (datetime('now')),
  tenant_id TEXT DEFAULT ''
);

-- Marketplace cart
CREATE TABLE IF NOT EXISTS marketplace_cart (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES marketplace_products(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 1,
  added_at TEXT DEFAULT (datetime('now')),
  tenant_id TEXT DEFAULT '',
  UNIQUE(user_id, product_id)
);

-- Marketplace orders
CREATE TABLE IF NOT EXISTS marketplace_orders (
  id TEXT PRIMARY KEY,
  order_number TEXT UNIQUE NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id),
  executor_id TEXT REFERENCES users(id),
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

  updated_at TEXT DEFAULT (datetime('now')),
  tenant_id TEXT DEFAULT ''
);

-- Marketplace order items
CREATE TABLE IF NOT EXISTS marketplace_order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES marketplace_orders(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES marketplace_products(id),
  product_name TEXT NOT NULL,
  product_image TEXT,
  quantity INTEGER NOT NULL,
  unit_price REAL NOT NULL,
  total_price REAL NOT NULL,
  tenant_id TEXT DEFAULT ''
);

-- Marketplace order history
CREATE TABLE IF NOT EXISTS marketplace_order_history (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES marketplace_orders(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  comment TEXT,
  changed_by TEXT REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now')),
  tenant_id TEXT DEFAULT ''
);

-- Marketplace favorites
CREATE TABLE IF NOT EXISTS marketplace_favorites (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES marketplace_products(id) ON DELETE CASCADE,
  created_at TEXT DEFAULT (datetime('now')),
  tenant_id TEXT DEFAULT '',
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


-- Tenant ID indexes for multi-tenancy performance
CREATE INDEX IF NOT EXISTS idx_users_tenant_id ON users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_buildings_tenant_id ON buildings(tenant_id);
CREATE INDEX IF NOT EXISTS idx_apartments_tenant_id ON apartments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_requests_tenant_id ON requests(tenant_id);
CREATE INDEX IF NOT EXISTS idx_notifications_tenant_id ON notifications(tenant_id);
CREATE INDEX IF NOT EXISTS idx_meetings_tenant_id ON meetings(tenant_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_products_tenant_id ON marketplace_products(tenant_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_orders_tenant_id ON marketplace_orders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_chat_channels_tenant_id ON chat_channels(tenant_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_tenant_id ON chat_messages(tenant_id);

-- Payments table (оплаты)
CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  apartment_id TEXT,
  resident_id TEXT,
  amount REAL NOT NULL,
  payment_type TEXT DEFAULT 'cash',
  period TEXT,
  description TEXT,
  receipt_number TEXT,
  paid_by TEXT,
  created_by TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  tenant_id TEXT DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_payments_apartment ON payments(apartment_id);
CREATE INDEX IF NOT EXISTS idx_payments_resident ON payments(resident_id);
CREATE INDEX IF NOT EXISTS idx_payments_tenant_id ON payments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_payments_period ON payments(period);


-- ==================== FINANCE MODULE ====================

-- Расходная смета
CREATE TABLE IF NOT EXISTS finance_estimates (
  id TEXT PRIMARY KEY,
  building_id TEXT NOT NULL,
  period TEXT NOT NULL,
  title TEXT,
  total_amount REAL NOT NULL DEFAULT 0,
  commercial_rate_per_sqm REAL DEFAULT 0,
  non_commercial_rate_per_sqm REAL DEFAULT 0,
  non_commercial_coefficient REAL DEFAULT 1.5,
  uk_profit_percent REAL DEFAULT 10,
  show_profit_to_residents INTEGER DEFAULT 0,
  show_debtor_status_to_residents INTEGER DEFAULT 0,
  effective_date TEXT,
  enterprise_profit_percent REAL DEFAULT 9,
  commercial_rate REAL DEFAULT 0,
  basement_rate REAL DEFAULT 0,
  parking_rate REAL DEFAULT 0,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft','active','archived')),
  created_by TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  tenant_id TEXT DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_finance_estimates_tenant ON finance_estimates(tenant_id);
CREATE INDEX IF NOT EXISTS idx_finance_estimates_building_period ON finance_estimates(building_id, period);

-- Статьи сметы
CREATE TABLE IF NOT EXISTS finance_estimate_items (
  id TEXT PRIMARY KEY,
  estimate_id TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT DEFAULT 'maintenance',
  amount REAL NOT NULL DEFAULT 0,
  monthly_amount REAL DEFAULT 0,
  description TEXT,
  sort_order INTEGER DEFAULT 0,
  tenant_id TEXT DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_finance_estimate_items_tenant ON finance_estimate_items(tenant_id);
CREATE INDEX IF NOT EXISTS idx_finance_estimate_items_estimate ON finance_estimate_items(estimate_id);

-- Начисления на квартиры
CREATE TABLE IF NOT EXISTS finance_charges (
  id TEXT PRIMARY KEY,
  apartment_id TEXT NOT NULL,
  estimate_id TEXT,
  period TEXT NOT NULL,
  amount REAL NOT NULL DEFAULT 0,
  amount_breakdown TEXT,
  property_type TEXT DEFAULT 'commercial' CHECK (property_type IN ('commercial','non_commercial')),
  area_sqm REAL DEFAULT 0,
  rate_per_sqm REAL DEFAULT 0,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','paid','partial','overdue')),
  due_date TEXT,
  paid_amount REAL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  tenant_id TEXT DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_finance_charges_tenant ON finance_charges(tenant_id);
CREATE INDEX IF NOT EXISTS idx_finance_charges_apartment_period ON finance_charges(apartment_id, period);
CREATE INDEX IF NOT EXISTS idx_finance_charges_status ON finance_charges(status);
CREATE INDEX IF NOT EXISTS idx_finance_charges_estimate ON finance_charges(estimate_id);

-- Оплаты
CREATE TABLE IF NOT EXISTS finance_payments (
  id TEXT PRIMARY KEY,
  charge_id TEXT,
  apartment_id TEXT NOT NULL,
  amount REAL NOT NULL,
  payment_date TEXT DEFAULT (datetime('now')),
  payment_type TEXT DEFAULT 'cash' CHECK (payment_type IN ('cash','card','transfer','online')),
  receipt_number TEXT,
  description TEXT,
  received_by TEXT,
  tenant_id TEXT DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_finance_payments_tenant ON finance_payments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_finance_payments_apartment ON finance_payments(apartment_id);
CREATE INDEX IF NOT EXISTS idx_finance_payments_charge ON finance_payments(charge_id);
CREATE INDEX IF NOT EXISTS idx_finance_payments_date ON finance_payments(payment_date);

-- Доходы УК
CREATE TABLE IF NOT EXISTS finance_income (
  id TEXT PRIMARY KEY,
  category_id TEXT,
  amount REAL NOT NULL,
  period TEXT,
  description TEXT,
  source_type TEXT,
  source_id TEXT,
  created_by TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  tenant_id TEXT DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_finance_income_tenant ON finance_income(tenant_id);
CREATE INDEX IF NOT EXISTS idx_finance_income_period ON finance_income(period);
CREATE INDEX IF NOT EXISTS idx_finance_income_category ON finance_income(category_id);

-- Категории доходов
CREATE TABLE IF NOT EXISTS finance_income_categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  is_default INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  tenant_id TEXT DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_finance_income_categories_tenant ON finance_income_categories(tenant_id);

-- Склад расходных материалов
CREATE TABLE IF NOT EXISTS finance_materials (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  unit TEXT DEFAULT 'шт',
  quantity REAL DEFAULT 0,
  price_per_unit REAL DEFAULT 0,
  min_quantity REAL DEFAULT 0,
  building_id TEXT,
  tenant_id TEXT DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_finance_materials_tenant ON finance_materials(tenant_id);
CREATE INDEX IF NOT EXISTS idx_finance_materials_building ON finance_materials(building_id);

-- Списание материалов
-- Logical FK: material_id -> finance_materials.id (enforced at application level, SQLite cannot add FK to existing tables)
CREATE TABLE IF NOT EXISTS finance_material_usage (
  id TEXT PRIMARY KEY,
  material_id TEXT NOT NULL,
  quantity REAL NOT NULL,
  request_id TEXT,
  estimate_item_id TEXT,
  used_by TEXT,
  description TEXT,
  used_at TEXT DEFAULT (datetime('now')),
  tenant_id TEXT DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_finance_material_usage_tenant ON finance_material_usage(tenant_id);
CREATE INDEX IF NOT EXISTS idx_finance_material_usage_request ON finance_material_usage(request_id);
CREATE INDEX IF NOT EXISTS idx_finance_material_usage_material ON finance_material_usage(material_id);

-- Акты сверки и претензии
CREATE TABLE IF NOT EXISTS finance_claims (
  id TEXT PRIMARY KEY,
  apartment_id TEXT NOT NULL,
  resident_id TEXT,
  claim_type TEXT DEFAULT 'reconciliation' CHECK (claim_type IN ('reconciliation','pretension')),
  total_debt REAL DEFAULT 0,
  period_from TEXT,
  period_to TEXT,
  deadline_days INTEGER DEFAULT 14,
  file_url TEXT,
  generated_by TEXT,
  generated_at TEXT DEFAULT (datetime('now')),
  tenant_id TEXT DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_finance_claims_tenant ON finance_claims(tenant_id);
CREATE INDEX IF NOT EXISTS idx_finance_claims_apartment ON finance_claims(apartment_id);

-- Контроль доступа к финансам
CREATE TABLE IF NOT EXISTS finance_access (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  access_level TEXT DEFAULT 'view_only' CHECK (access_level IN ('full','payments_only','view_only')),
  granted_by TEXT,
  granted_at TEXT DEFAULT (datetime('now')),
  tenant_id TEXT DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_finance_access_tenant ON finance_access(tenant_id);
CREATE INDEX IF NOT EXISTS idx_finance_access_user ON finance_access(user_id);

-- Seed: дефолтные категории доходов
INSERT OR IGNORE INTO finance_income_categories (id, name, is_default, is_active, tenant_id) VALUES
  ('fic_office_rent', 'Аренда офисов', 1, 1, ''),
  ('fic_basement_rent', 'Аренда подвалов', 1, 1, ''),
  ('fic_apartment_rent', 'Аренда квартир (через платформу)', 1, 1, ''),
  ('fic_advertising', 'Реклама в подъездах', 1, 1, ''),
  ('fic_parking', 'Парковка', 1, 1, ''),
  ('fic_other', 'Прочее', 1, 1, '');

-- Лог изменений данных жителей (с обязательным документальным основанием)
CREATE TABLE IF NOT EXISTS resident_changes_log (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT '',
  resident_id TEXT NOT NULL,
  changed_by TEXT NOT NULL,
  change_type TEXT NOT NULL,
  field_name TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  reason TEXT NOT NULL,
  document_number TEXT,
  document_date TEXT,
  comment TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_rcl_tenant ON resident_changes_log(tenant_id);
CREATE INDEX IF NOT EXISTS idx_rcl_resident ON resident_changes_log(resident_id);
CREATE INDEX IF NOT EXISTS idx_rcl_changed_by ON resident_changes_log(changed_by);

-- Finance expenses
CREATE TABLE IF NOT EXISTS finance_expenses (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT '',
  building_id TEXT,
  estimate_id TEXT,
  estimate_item_id TEXT,
  estimate_item_name TEXT,
  amount REAL NOT NULL,
  expense_date TEXT NOT NULL,
  description TEXT,
  document_url TEXT,
  request_id TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_fe_tenant ON finance_expenses(tenant_id);
CREATE INDEX IF NOT EXISTS idx_fe_building ON finance_expenses(building_id);
CREATE INDEX IF NOT EXISTS idx_fe_estimate ON finance_expenses(estimate_id);
-- Logical FK: estimate_item_id -> finance_estimate_items.id (enforced at application level)

-- Missing tenant_id indexes for frequently queried tables
CREATE INDEX IF NOT EXISTS idx_announcements_tenant_id ON announcements(tenant_id);
CREATE INDEX IF NOT EXISTS idx_guest_codes_tenant_id ON guest_access_codes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_tenant_id ON vehicles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ads_tenant_id ON ads(tenant_id);

-- Audit log for sensitive operations (user deactivation, password changes, role changes)
CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  tenant_id TEXT,
  actor_id TEXT NOT NULL,
  actor_name TEXT,
  actor_role TEXT,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  details TEXT,
  ip_address TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_audit_log_tenant ON audit_log(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor ON audit_log(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at);
