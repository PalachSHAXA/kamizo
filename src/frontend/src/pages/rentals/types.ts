// Resident rentals — frozen API contract.
//
// Every field name and type here mirrors the §2 backend schema and the §4
// endpoint responses verbatim. When the real API lands, swapping mock →
// live is a one-line change per call site (the URL) — response bodies
// don't need reshaping.
//
// SQLite emits booleans as 0/1 integers. We keep the API shape as 0/1
// for the wire and normalise to boolean at the render boundary — same
// pattern MarketplacePage.tsx:217-222 uses for is_featured / is_on_demand.

export type RentalState = 'active' | 'rented' | 'archived' | 'hidden';
export type RentalSource = 'resident' | 'uk';
export type RentalDuration = 'short' | 'long' | 'flexible';
export type RentalReportReason =
  | 'already_rented'
  | 'misleading'
  | 'wrong_photos'
  | 'fraud'
  | 'other';

export interface RentalListingAPI {
  id: string;
  tenant_id: string;
  publisher_user_id: string;
  source_type: RentalSource;

  state: RentalState;
  hidden_reason: string | null;
  hidden_by_user_id: string | null;
  hidden_at: string | null;

  rooms: 0 | 1 | 2 | 3 | 4;                 // 0 = studio, 4 = "4+"
  area_m2: number;
  floor: number;
  floor_total: number;
  apartment_number: string | null;
  entrance: string | null;
  building_id: string | null;

  price_monthly: number;                    // whole сум
  price_currency: 'UZS';
  deposit_months: number | null;

  furnished: 0 | 1;
  air_conditioning: 0 | 1;
  internet: 0 | 1;
  parking: 0 | 1;
  animals_allowed: 0 | 1;

  duration_type: RentalDuration;
  description: string;

  phone_visible: 0 | 1;

  last_confirmed_at: string;
  confirm_prompt_sent_at: string | null;

  created_at: string;
  updated_at: string;

  // JOINed from users on the server (same pattern as marketplace's
  // category_name_ru at admin-products.ts:19-20).
  publisher_name: string;
  publisher_phone: string | null;           // null when phone_visible=0 for non-owner viewers
  publisher_login: string;
}

export interface RentalListingPhotoAPI {
  id: string;
  listing_id: string;
  tenant_id: string;
  sort_order: number;                       // 0 = cover
  // Real API will carry `data:image/jpeg;base64,…` here (see §3 photo
  // storage decision). Dev mock uses external Unsplash URLs so the
  // design review reads as photo-led; contract shape is identical
  // either way — <img src={data_url}> works for both.
  data_url: string;
  created_at: string;
}

export interface RentalListingReportAPI {
  id: string;
  listing_id: string;
  tenant_id: string;
  reporter_user_id: string;
  reason: RentalReportReason;
  comment: string | null;
  handled_at: string | null;
  handled_by_user_id: string | null;
  created_at: string;
}

// Normalised for render — post `!!` on the 0/1 fields.
export interface RentalListingUI extends Omit<
  RentalListingAPI,
  'furnished' | 'air_conditioning' | 'internet' | 'parking' | 'animals_allowed' | 'phone_visible'
> {
  furnished: boolean;
  air_conditioning: boolean;
  internet: boolean;
  parking: boolean;
  animals_allowed: boolean;
  phone_visible: boolean;
}

export function normalizeListing(l: RentalListingAPI): RentalListingUI {
  return {
    ...l,
    furnished: !!l.furnished,
    air_conditioning: !!l.air_conditioning,
    internet: !!l.internet,
    parking: !!l.parking,
    animals_allowed: !!l.animals_allowed,
    phone_visible: !!l.phone_visible,
  };
}

// Neighbour-kicker builder — used by feed card, listing detail (twice:
// hero kicker + publisher block), and my-listings card. Optional fields
// (apartment_number, entrance) must NOT render when null/empty — the
// naïve template-literal `Кв. ${apartment_number}` produced "КВ. NULL"
// in the wild when a resident published without an apartment. Every new
// segment is a positive-value gate: no value → no segment → no trailing
// "· " separator. Trailing/leading "·" are impossible because we join
// after filtering.
export function neighbourKicker(
  l: Pick<RentalListingAPI | RentalListingUI, 'apartment_number' | 'floor'>,
  language: 'ru' | 'uz',
): string {
  const parts: string[] = [];
  parts.push(language === 'ru' ? 'Сосед' : "Qo'shni");
  const apt = (l.apartment_number ?? '').toString().trim();
  if (apt) {
    parts.push(language === 'ru' ? `Кв. ${apt}` : `${apt}-uy`);
  }
  parts.push(language === 'ru' ? `${l.floor} этаж` : `${l.floor}-qavat`);
  return parts.join(' · ');
}
