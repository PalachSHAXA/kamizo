// Request body validation schemas (no external deps — Workers-friendly)
// Each schema is a map of field names → validation rules.

export interface FieldRule {
  required?: boolean;
  type?: 'string' | 'number' | 'boolean';
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  pattern?: RegExp;
  oneOf?: readonly string[];
  /** Custom label for error messages (defaults to field name) */
  label?: string;
}

export type Schema = Record<string, FieldRule>;

// ── Auth ──────────────────────────────────────────────
export const loginSchema: Schema = {
  login: { required: true, type: 'string', minLength: 1, maxLength: 100, label: 'Login' },
  password: { required: true, type: 'string', minLength: 1, maxLength: 200, label: 'Password' },
};

// ── Requests ──────────────────────────────────────────
export const createRequestSchema: Schema = {
  category_id: { required: true, type: 'string', minLength: 1, label: 'Category' },
  title: { required: true, type: 'string', minLength: 1, maxLength: 500, label: 'Title' },
  description: { type: 'string', maxLength: 5000, label: 'Description' },
  priority: { type: 'string', oneOf: ['low', 'medium', 'high', 'urgent'] as const },
  resident_id: { type: 'string' },
  access_info: { type: 'string', maxLength: 500 },
  scheduled_at: { type: 'string' },
};

// ── Payments ──────────────────────────────────────────
export const createPaymentSchema: Schema = {
  amount: { required: true, type: 'number', label: 'Amount' },
  apartment_id: { type: 'string' },
  resident_id: { type: 'string' },
  payment_type: { type: 'string', oneOf: ['cash', 'card', 'transfer'] as const },
  period: { type: 'string', maxLength: 7 },
  description: { type: 'string', maxLength: 1000 },
  paid_by: { type: 'string' },
};

// ── Buildings ─────────────────────────────────────────
export const createBuildingSchema: Schema = {
  name: { required: true, type: 'string', minLength: 1, maxLength: 200, label: 'Name' },
  address: { required: true, type: 'string', minLength: 1, maxLength: 500, label: 'Address' },
  floors: { type: 'number', min: 1, max: 200 },
  entrances: { type: 'number', min: 1, max: 100 },
  entrances_count: { type: 'number', min: 1, max: 100 },
  apartments_count: { type: 'number', min: 0 },
  building_type: { type: 'string', oneOf: ['monolith', 'brick', 'panel', 'frame', 'other'] as const },
  heating_type: { type: 'string', oneOf: ['central', 'autonomous', 'individual', 'none'] as const },
};

// ── Pagination (reusable) ─────────────────────────────
export const paginationSchema: Schema = {
  page: { type: 'number', min: 1 },
  limit: { type: 'number', min: 1, max: 100 },
};
