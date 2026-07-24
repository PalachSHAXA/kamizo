// Rentals data layer — the single seam between pages and the real API.
//
// One export: `rentalsApi`. Every method returns data shaped exactly the
// way the pages already consume it (mock-shape) — so wiring a page from
// mock → real is a call-site swap, not a component rewrite.
//
// Backing source chosen at module load via IS_MOCK:
//   • IS_MOCK  → reads MOCK_LISTINGS / MOCK_PHOTOS from __devMock.
//   • !IS_MOCK → hits /api/rentals/* on api.kamizo.uz through apiRequest.
//
// Real-API shape divergences from the mock (from the pre-wire audit):
//   1. Feed / detail / my-listings never return photo data_url — only a
//      `cover_photo_id` field. Pages want `photosByListing[id]` populated
//      for the card cover. We fill it by fetching /listings/:id/photos
//      per listing (N+1). Acceptable for MVP; optimisation TODO v2 is a
//      server-side `?with_cover=1` param that returns the cover data_url
//      inline so a feed of 20 cards is one call, not 21.
//   2. Create is one atomic JSON POST with photos: [data_url,…]. The
//      mock's per-photo async upload UX is client-only preview state.
//      Real endpoint takes 3–8 photos in the body, each ≤1MB decoded.
//   3. reveal-phone is a distinct call — the detail row's
//      publisher_phone is null for non-owner viewers until this fires.
//   4. Photo add (post-create) is multipart/form-data, field name
//      `photo`. Photo delete is DELETE /listings/:id/photos/:photoId.
//      Reorder body is { ids: [photoId,…] } — index = new sort_order,
//      cover = whichever id lands at index 0.
//   5. State transition returns { success, state } only, not the full
//      listing. Caller should refetch or optimistically patch.

import { apiRequest, invalidateCache, API_URL, getToken } from '../../services/api/client';
import {
  IS_MOCK, MOCK_LISTINGS, MOCK_PHOTOS, MOCK_USER_ID,
} from './__devMock';
import type {
  RentalListingAPI, RentalListingPhotoAPI, RentalListingUI,
  RentalState, RentalDuration,
} from './types';
import { normalizeListing } from './types';

export interface ListingsWithPhotos {
  listings: RentalListingUI[];
  photosByListing: Record<string, RentalListingPhotoAPI[]>;
}

export interface CreateListingBody {
  rooms: 0 | 1 | 2 | 3 | 4;
  area_m2: number;
  floor: number;
  floor_total: number;
  apartment_number?: string | null;
  entrance?: string | null;
  building_id?: string | null;
  price_monthly: number;
  deposit_months?: number | null;
  furnished: 0 | 1;
  air_conditioning: 0 | 1;
  internet: 0 | 1;
  parking: 0 | 1;
  animals_allowed: 0 | 1;
  duration_type: RentalDuration;
  description: string;
  phone_visible: 0 | 1;
  photos: string[];               // full `data:image/…;base64,…` URLs, 3..8
}

// Small helper: group photo rows by listing_id, sort each group by sort_order.
function indexPhotos(rows: RentalListingPhotoAPI[]): Record<string, RentalListingPhotoAPI[]> {
  const m: Record<string, RentalListingPhotoAPI[]> = {};
  for (const p of rows) (m[p.listing_id] ||= []).push(p);
  for (const id of Object.keys(m)) m[id].sort((a, b) => a.sort_order - b.sort_order);
  return m;
}

async function fetchCoverPhotosFor(listings: RentalListingAPI[]): Promise<Record<string, RentalListingPhotoAPI[]>> {
  // Cover-only fetch: /listings/:id/photos returns the full array;
  // we take only the first (sort_order=0) so we don't drag N × M base64
  // payloads into a feed render. Parallel — limited concurrency at the
  // network layer by the browser (~6 per host).
  const results = await Promise.all(
    listings.map(async (l): Promise<RentalListingPhotoAPI | null> => {
      try {
        const resp = await apiRequest<{ photos: RentalListingPhotoAPI[] }>(
          `/api/rentals/listings/${l.id}/photos`
        );
        const cover = (resp.photos || []).find(p => p.sort_order === 0) ?? resp.photos?.[0] ?? null;
        return cover ?? null;
      } catch {
        return null;
      }
    })
  );
  const out: Record<string, RentalListingPhotoAPI[]> = {};
  results.forEach((p, i) => { if (p) out[listings[i].id] = [p]; });
  return out;
}

export const rentalsApi = {
  // ── Feed (active listings, all publishers on this tenant) ──────────
  async listActive(): Promise<ListingsWithPhotos> {
    if (IS_MOCK) {
      const active = MOCK_LISTINGS.filter(l => l.state === 'active');
      return {
        listings: active.map(normalizeListing),
        photosByListing: indexPhotos(MOCK_PHOTOS.filter(p => active.some(l => l.id === p.listing_id))),
      };
    }
    const resp = await apiRequest<{ listings: RentalListingAPI[] }>(
      '/api/rentals/listings?state=active'
    );
    const listings = resp.listings || [];
    const photosByListing = await fetchCoverPhotosFor(listings);
    return {
      listings: listings.map(normalizeListing),
      photosByListing,
    };
  },

  // ── Tenant-wide listings by state (management moderation view) ────
  //     Same underlying endpoint as listActive() but with an explicit
  //     state param. Servers side scopes by tenant_id via getTenantId;
  //     a resident calling this would see only listings visible to
  //     residents (active-only, tenant-wide). A manager sees every
  //     state across every publisher. Cover photos are N+1-fetched, so
  //     the moderation page pays the same load cost as the feed.
  async listByState(state: RentalState): Promise<ListingsWithPhotos> {
    if (IS_MOCK) {
      const rows = MOCK_LISTINGS.filter(l => l.state === state);
      return {
        listings: rows.map(normalizeListing),
        photosByListing: indexPhotos(MOCK_PHOTOS.filter(p => rows.some(l => l.id === p.listing_id))),
      };
    }
    const resp = await apiRequest<{ listings: RentalListingAPI[] }>(
      `/api/rentals/listings?state=${encodeURIComponent(state)}`
    );
    const listings = resp.listings || [];
    const photosByListing = await fetchCoverPhotosFor(listings);
    return {
      listings: listings.map(normalizeListing),
      photosByListing,
    };
  },

  // ── My listings (all states, owned by current user) ────────────────
  async listMine(): Promise<ListingsWithPhotos> {
    if (IS_MOCK) {
      const mine = MOCK_LISTINGS.filter(l => l.publisher_user_id === MOCK_USER_ID);
      return {
        listings: mine.map(normalizeListing),
        photosByListing: indexPhotos(MOCK_PHOTOS.filter(p => mine.some(l => l.id === p.listing_id))),
      };
    }
    const resp = await apiRequest<{ listings: RentalListingAPI[] }>(
      '/api/rentals/my-listings'
    );
    const listings = resp.listings || [];
    const photosByListing = await fetchCoverPhotosFor(listings);
    return {
      listings: listings.map(normalizeListing),
      photosByListing,
    };
  },

  // ── Single listing + its photos ────────────────────────────────────
  async getListing(id: string): Promise<{ listing: RentalListingUI; photos: RentalListingPhotoAPI[] } | null> {
    if (IS_MOCK) {
      const raw = MOCK_LISTINGS.find(l => l.id === id);
      if (!raw) return null;
      return {
        listing: normalizeListing(raw),
        photos: MOCK_PHOTOS.filter(p => p.listing_id === id).sort((a, b) => a.sort_order - b.sort_order),
      };
    }
    try {
      const detailResp = await apiRequest<{ listing: RentalListingAPI }>(
        `/api/rentals/listings/${id}`
      );
      const photosResp = await apiRequest<{ photos: RentalListingPhotoAPI[] }>(
        `/api/rentals/listings/${id}/photos`
      );
      return {
        listing: normalizeListing(detailResp.listing),
        photos: (photosResp.photos || []).sort((a, b) => a.sort_order - b.sort_order),
      };
    } catch {
      return null;
    }
  },

  // ── Create ────────────────────────────────────────────────────────
  async createListing(body: CreateListingBody): Promise<RentalListingAPI> {
    if (IS_MOCK) {
      // Simulate — do not mutate MOCK_LISTINGS; caller navigates to done.
      return {
        id: `rl-mock-${Date.now()}`,
        tenant_id: 'mock',
        publisher_user_id: MOCK_USER_ID,
        source_type: 'resident',
        state: 'active',
        hidden_reason: null, hidden_by_user_id: null, hidden_at: null,
        rooms: body.rooms,
        area_m2: body.area_m2, floor: body.floor, floor_total: body.floor_total,
        apartment_number: body.apartment_number ?? null,
        entrance: body.entrance ?? null,
        building_id: body.building_id ?? null,
        price_monthly: body.price_monthly, price_currency: 'UZS',
        deposit_months: body.deposit_months ?? null,
        furnished: body.furnished, air_conditioning: body.air_conditioning,
        internet: body.internet, parking: body.parking, animals_allowed: body.animals_allowed,
        duration_type: body.duration_type, description: body.description,
        phone_visible: body.phone_visible,
        last_confirmed_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
        confirm_prompt_sent_at: null,
        created_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
        updated_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
        publisher_name: 'Dev Preview', publisher_phone: '+998 90 000 00 00', publisher_login: 'dev-mock',
      };
    }
    // Server contract (listings.ts:272,312): photos is an array of
    // {data_url}, not raw strings. Wrap here so the caller shape stays
    // simple (string[]) — no callers care about the on-the-wire shape.
    const wire = { ...body, photos: body.photos.map(data_url => ({ data_url })) };
    const resp = await apiRequest<{ listing: RentalListingAPI }>(
      '/api/rentals/listings',
      { method: 'POST', body: JSON.stringify(wire) },
      120_000                                            // large body → generous timeout
    );
    invalidateCache('rentals');
    return resp.listing;
  },

  // ── Edit (partial) ────────────────────────────────────────────────
  async patchListing(id: string, fields: Partial<CreateListingBody>): Promise<RentalListingAPI> {
    if (IS_MOCK) throw new Error('mock: patch not supported');
    const resp = await apiRequest<{ listing: RentalListingAPI }>(
      `/api/rentals/listings/${id}`,
      { method: 'PATCH', body: JSON.stringify(fields) }
    );
    invalidateCache('rentals');
    return resp.listing;
  },

  // ── State transition ─────────────────────────────────────────────
  async transitionState(id: string, state: RentalState, hidden_reason?: string): Promise<void> {
    if (IS_MOCK) return;
    await apiRequest(
      `/api/rentals/listings/${id}/state`,
      { method: 'POST', body: JSON.stringify({ state, hidden_reason }) }
    );
    invalidateCache('rentals');
  },

  // ── Confirm still active (14-day ping) ────────────────────────────
  async confirmActive(id: string): Promise<void> {
    if (IS_MOCK) return;
    await apiRequest(
      `/api/rentals/listings/${id}/confirm`,
      { method: 'POST', body: '{}' }
    );
    invalidateCache('rentals');
  },

  // ── Photo add (multipart) ─────────────────────────────────────────
  //     apiRequest sets 'content-type: application/json' by default and
  //     would clobber the multipart boundary; hit fetch directly here.
  async addPhoto(listingId: string, file: File): Promise<RentalListingPhotoAPI> {
    if (IS_MOCK) throw new Error('mock: addPhoto not supported');
    const form = new FormData();
    form.append('photo', file);
    const token = getToken();
    const resp = await fetch(`${API_URL}/api/rentals/listings/${listingId}/photos`, {
      method: 'POST',
      headers: token ? { authorization: `Bearer ${token}` } : {},
      body: form,
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data?.error_ru || data?.error || `HTTP ${resp.status}`);
    invalidateCache('rentals');
    return data.photo;
  },

  // ── Photo delete ─────────────────────────────────────────────────
  async removePhoto(listingId: string, photoId: string): Promise<void> {
    if (IS_MOCK) return;
    await apiRequest(
      `/api/rentals/listings/${listingId}/photos/${photoId}`,
      { method: 'DELETE' }
    );
    invalidateCache('rentals');
  },

  // ── Photo reorder — body shape is { ids: [...] } (audit item #11) ─
  async reorderPhotos(listingId: string, photoIds: string[]): Promise<void> {
    if (IS_MOCK) return;
    await apiRequest(
      `/api/rentals/listings/${listingId}/photos/reorder`,
      { method: 'PATCH', body: JSON.stringify({ ids: photoIds }) }
    );
    invalidateCache('rentals');
  },

  // ── Reveal phone ──────────────────────────────────────────────────
  async revealPhone(listingId: string): Promise<{ phone: string; name: string }> {
    if (IS_MOCK) {
      const l = MOCK_LISTINGS.find(x => x.id === listingId);
      return { phone: l?.publisher_phone || '', name: l?.publisher_name || '' };
    }
    return apiRequest<{ phone: string; name: string }>(
      `/api/rentals/listings/${listingId}/reveal-phone`,
      { method: 'POST', body: '{}' }
    );
  },
};

// Helper: read a File as a `data:image/…;base64,…` URL. Used by the
// create page: photos are gathered as data-URLs then POSTed inline in
// one atomic call (audit item #4).
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ''));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}
