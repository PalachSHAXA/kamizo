// API Client for UK CRM

const API_URL = '';

// Get auth token from localStorage
const getToken = () => localStorage.getItem('auth_token');

// Response wrapper type for consistent API handling
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// === REQUEST CACHE & DEDUPLICATION ===
interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

const requestCache = new Map<string, CacheEntry<unknown>>();
const pendingRequests = new Map<string, Promise<unknown>>();

// Cache TTL values (ms)
const CACHE_TTL = {
  SHORT: 10 * 1000,     // 10 sec - for frequently changing data (requests list)
  MEDIUM: 60 * 1000,    // 1 min - for moderately changing data (executors)
  LONG: 2 * 60 * 1000,  // 2 min - for buildings (reduced from 5 min for better sync)
} as const;

// Get cached data if valid
function getCached<T>(key: string): T | null {
  const entry = requestCache.get(key) as CacheEntry<T> | undefined;
  if (!entry) return null;

  const isExpired = Date.now() - entry.timestamp > entry.ttl;
  if (isExpired) {
    requestCache.delete(key);
    return null;
  }
  return entry.data;
}

// Set cache with TTL
function setCache<T>(key: string, data: T, ttl: number): void {
  requestCache.set(key, { data, timestamp: Date.now(), ttl });
}

// Clear specific cache entries
export function invalidateCache(pattern?: string): void {
  if (!pattern) {
    requestCache.clear();
    return;
  }
  for (const key of requestCache.keys()) {
    if (key.includes(pattern)) {
      requestCache.delete(key);
    }
  }
}

// Default timeout for API requests (30 seconds)
const API_TIMEOUT = 30000;

// Helper for API requests - returns raw data for backward compatibility
export async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {},
  timeout: number = API_TIMEOUT
): Promise<T> {
  const token = getToken();

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...options.headers,
  };

  // Create abort controller for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers,
      signal: controller.signal,
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'API Error');
    }

    return data;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Превышено время ожидания запроса. Проверьте соединение.');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

// Cached GET request with deduplication
async function cachedGet<T>(
  endpoint: string,
  ttl: number = CACHE_TTL.SHORT
): Promise<T> {
  const cacheKey = endpoint;

  // Return cached data if available
  const cached = getCached<T>(cacheKey);
  if (cached) return cached;

  // Deduplicate: if same request is in flight, wait for it
  const pending = pendingRequests.get(cacheKey);
  if (pending) return pending as Promise<T>;

  // Make the request
  const request = apiRequest<T>(endpoint).then(data => {
    setCache(cacheKey, data, ttl);
    pendingRequests.delete(cacheKey);
    return data;
  }).catch(err => {
    pendingRequests.delete(cacheKey);
    throw err;
  });

  pendingRequests.set(cacheKey, request);
  return request;
}

// Helper for API requests - returns wrapped response { success, data, error }
async function apiRequestWrapped<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  try {
    const data = await apiRequest<T>(endpoint, options);
    return { success: true, data };
  } catch (error: any) {
    return { success: false, error: error.message || 'API Error' };
  }
}

// Transform user object from snake_case (API) to camelCase (frontend)
function transformUser(user: any): any {
  if (!user) return user;
  return {
    ...user,
    // Map snake_case to camelCase for onboarding fields
    passwordChangedAt: user.password_changed_at || user.passwordChangedAt,
    contractSignedAt: user.contract_signed_at || user.contractSignedAt,
    buildingId: user.building_id || user.buildingId,
    totalArea: user.total_area || user.totalArea,
    signatureKey: user.signature_key || user.signatureKey,
    // Keep original fields too for backward compatibility
  };
}

// Auth API
export const authApi = {
  login: async (login: string, password: string) => {
    const data = await apiRequest<{ user: any; token: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ login, password }),
    });
    localStorage.setItem('auth_token', data.token);
    // Transform user fields from snake_case to camelCase
    return { ...data, user: transformUser(data.user) };
  },

  logout: () => {
    localStorage.removeItem('auth_token');
  },

  register: async (userData: {
    login: string;
    password: string;
    name: string;
    role: string;
    phone?: string;
    address?: string;
    apartment?: string;
    specialization?: string;
    building_id?: string;
    entrance?: string;
    floor?: string;
    branch?: string;
    building?: string;
  }) => {
    return apiRequest<{ user: any }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(userData),
    });
  },

  registerBulk: async (users: Array<{
    login: string;
    password: string;
    name: string;
    role: string;
    phone?: string;
    address?: string;
    apartment?: string;
    building_id?: string;
    entrance?: string;
    floor?: string;
  }>) => {
    return apiRequest<{ created: any[]; updated: any[] }>('/api/auth/register-bulk', {
      method: 'POST',
      body: JSON.stringify({ users }),
    });
  },
};

// Users API
export const usersApi = {
  getMe: async () => {
    const data = await apiRequest<{ user: any }>('/api/users/me');
    return { user: transformUser(data.user) };
  },

  updateMe: async (updates: { phone?: string; name?: string; language?: string }) => {
    const data = await apiRequest<{ user: any }>('/api/users/me', {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
    return { user: transformUser(data.user) };
  },

  changePassword: async (currentPassword: string, newPassword: string) => {
    return apiRequest<{ success: boolean; password_changed_at?: string }>('/api/users/me/password', {
      method: 'POST',
      body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
    });
  },

  markContractSigned: async () => {
    return apiRequest<{ success: boolean; contract_signed_at?: string }>('/api/users/me/contract-signed', {
      method: 'POST',
    });
  },

  adminChangePassword: async (userId: string, newPassword: string) => {
    return apiRequest<{ success: boolean }>(`/api/users/${userId}/password`, {
      method: 'POST',
      body: JSON.stringify({ new_password: newPassword }),
    });
  },

  getAll: async (filters?: { role?: string; building_id?: string; limit?: number }) => {
    const params = new URLSearchParams();
    if (filters?.role) params.append('role', filters.role);
    if (filters?.building_id) params.append('building_id', filters.building_id);
    if (filters?.limit) params.append('limit', filters.limit.toString());
    const query = params.toString();
    return apiRequest<{ users: any[]; pagination?: any }>(`/api/users${query ? '?' + query : ''}`);
  },

  delete: async (userId: string) => {
    return apiRequest<{ success: boolean }>(`/api/users/${userId}`, {
      method: 'DELETE',
    });
  },
};

// Vehicles API
export const vehiclesApi = {
  // Get current user's vehicles only
  getMyVehicles: async () => {
    return cachedGet<{ vehicles: any[] }>('/api/vehicles', CACHE_TTL.MEDIUM);
  },

  // Get ALL vehicles with pagination (for staff: admin, manager, executor, department_head)
  // Оптимизировано для 5000+ пользователей
  getAll: async (options?: { page?: number; limit?: number; search?: string }) => {
    const params = new URLSearchParams();
    if (options?.page) params.append('page', String(options.page));
    if (options?.limit) params.append('limit', String(options.limit));
    if (options?.search) params.append('search', options.search);
    const query = params.toString();
    return apiRequest<{ vehicles: any[]; pagination?: { page: number; limit: number; total: number; totalPages: number } }>(
      `/api/vehicles/all${query ? '?' + query : ''}`
    );
  },

  getForResident: async (residentId: string) => {
    return cachedGet<{ vehicles: any[] }>(`/api/vehicles?resident_id=${residentId}`, CACHE_TTL.MEDIUM);
  },

  create: async (vehicle: {
    plate_number: string;
    brand?: string;
    model?: string;
    color?: string;
    year?: number;
    vehicle_type?: string;
    owner_type?: string;
    company_name?: string;
    parking_spot?: string;
    notes?: string;
    is_primary?: boolean;
  }) => {
    return apiRequest<{ vehicle: any }>('/api/vehicles', {
      method: 'POST',
      body: JSON.stringify(vehicle),
    });
  },

  update: async (vehicleId: string, updates: {
    plate_number?: string;
    brand?: string;
    model?: string;
    color?: string;
    year?: number;
    vehicle_type?: string;
    owner_type?: string;
    company_name?: string;
    parking_spot?: string;
    notes?: string;
    is_primary?: boolean;
  }) => {
    return apiRequest<{ vehicle: any }>(`/api/vehicles/${vehicleId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  },

  delete: async (vehicleId: string) => {
    return apiRequest<{ success: boolean }>(`/api/vehicles/${vehicleId}`, {
      method: 'DELETE',
    });
  },

  search: async (plateNumber: string) => {
    return apiRequest<{ vehicles: any[] }>(`/api/vehicles/search?plate=${encodeURIComponent(plateNumber)}`);
  },
};

// Rentals API
export const rentalsApi = {
  // Apartments
  getApartments: async () => {
    return apiRequest<{ apartments: any[] }>('/api/rentals/apartments');
  },

  // Get my apartments (for tenants/commercial_owners)
  getMyApartments: async () => {
    return apiRequest<{ apartments: any[]; records: any[] }>('/api/rentals/my-apartments');
  },

  createApartment: async (data: {
    name: string;
    address: string;
    apartment?: string;
    ownerName?: string;
    ownerPhone?: string;
    ownerLogin: string;
    ownerPassword: string;
    ownerType?: 'tenant' | 'commercial_owner';
  }) => {
    return apiRequest<{ apartment: any }>('/api/rentals/apartments', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  updateApartment: async (id: string, data: { name?: string; address?: string; apartment?: string; isActive?: boolean }) => {
    return apiRequest<{ success: boolean }>(`/api/rentals/apartments/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  deleteApartment: async (id: string) => {
    return apiRequest<{ success: boolean }>(`/api/rentals/apartments/${id}`, {
      method: 'DELETE',
    });
  },

  // Records
  getRecords: async (apartmentId?: string) => {
    const url = apartmentId ? `/api/rentals/records?apartmentId=${apartmentId}` : '/api/rentals/records';
    return apiRequest<{ records: any[] }>(url);
  },

  createRecord: async (data: {
    apartmentId: string;
    guestNames: string;
    passportInfo?: string;
    checkInDate: string;
    checkOutDate: string;
    amount?: number;
    currency?: string;
    notes?: string;
  }) => {
    return apiRequest<{ record: any }>('/api/rentals/records', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  updateRecord: async (id: string, data: {
    guestNames?: string;
    passportInfo?: string;
    checkInDate?: string;
    checkOutDate?: string;
    amount?: number;
    currency?: string;
    notes?: string;
  }) => {
    return apiRequest<{ success: boolean }>(`/api/rentals/records/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  deleteRecord: async (id: string) => {
    return apiRequest<{ success: boolean }>(`/api/rentals/records/${id}`, {
      method: 'DELETE',
    });
  },
};

// Guest Codes API
export const guestCodesApi = {
  getAll: async () => {
    return cachedGet<{ codes: any[] }>('/api/guest-codes', CACHE_TTL.SHORT);
  },

  getById: async (codeId: string) => {
    return cachedGet<{ code: any }>(`/api/guest-codes/${codeId}`, CACHE_TTL.SHORT);
  },

  create: async (code: {
    visitor_type: string;
    visitor_name?: string;
    visitor_phone?: string;
    visitor_vehicle_plate?: string;
    access_type: string;
    valid_from?: string;
    valid_until?: string;
    resident_name?: string;
    resident_phone?: string;
    resident_apartment?: string;
    resident_address?: string;
    notes?: string;
  }) => {
    return apiRequest<{ code: any }>('/api/guest-codes', {
      method: 'POST',
      body: JSON.stringify(code),
    });
  },

  revoke: async (codeId: string, reason?: string) => {
    return apiRequest<{ success: boolean }>(`/api/guest-codes/${codeId}/revoke`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  },

  delete: async (codeId: string) => {
    return apiRequest<{ success: boolean }>(`/api/guest-codes/${codeId}`, {
      method: 'DELETE',
    });
  },

  validate: async (qrToken: string) => {
    return apiRequest<{ valid: boolean; code?: any; error?: string; message?: string }>('/api/guest-codes/validate', {
      method: 'POST',
      body: JSON.stringify({ qr_token: qrToken }),
    });
  },

  use: async (codeId: string) => {
    return apiRequest<{ success: boolean; code?: any }>(`/api/guest-codes/${codeId}/use`, {
      method: 'POST',
    });
  },

  getLogs: async (codeId: string) => {
    return apiRequest<{ logs: any[] }>(`/api/guest-codes/${codeId}/logs`);
  },
};

// Chat API
export const chatApi = {
  getChannels: async () => {
    return apiRequest<{ channels: any[] }>('/api/chat/channels');
  },

  createChannel: async (channel: {
    type: 'uk_general' | 'building_general' | 'admin_support' | 'private_support';
    name: string;
    description?: string;
    building_id?: string;
  }) => {
    return apiRequest<{ channel: any }>('/api/chat/channels', {
      method: 'POST',
      body: JSON.stringify(channel),
    });
  },

  getMessages: async (channelId: string, limit = 50, before?: string) => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (before) params.append('before', before);
    return apiRequest<{ messages: any[] }>(`/api/chat/channels/${channelId}/messages?${params}`);
  },

  sendMessage: async (channelId: string, content: string) => {
    return apiRequest<{ message: any }>(`/api/chat/channels/${channelId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    });
  },

  markRead: async (channelId: string) => {
    return apiRequest<{ success: boolean }>(`/api/chat/channels/${channelId}/read`, {
      method: 'POST',
    });
  },

  // Mark specific message as read (for delivery checkmarks)
  markMessageRead: async (channelId: string, messageId: string) => {
    return apiRequest<{ success: boolean }>(`/api/chat/channels/${channelId}/messages/${messageId}/read`, {
      method: 'POST',
    });
  },

  // Get or create private support channel for current user (resident)
  getOrCreateSupportChannel: async () => {
    return apiRequest<any>('/api/chat/channels/support', {
      method: 'POST',
    });
  },

  // Get all private support channels (admin/manager only)
  getAllSupportChannels: async () => {
    return apiRequest<{ channels: any[] }>('/api/chat/channels?type=private_support');
  },

  // Get unread message count for sidebar badge
  getUnreadCount: async () => {
    return apiRequest<{ unread_count: number }>('/api/chat/unread-count');
  },
};

// Announcements API
export const announcementsApi = {
  getAll: async () => {
    return cachedGet<{ announcements: any[] }>('/api/announcements', CACHE_TTL.SHORT);
  },

  create: async (announcement: {
    title: string;
    content: string;
    type: 'residents' | 'employees' | 'staff' | 'all';
    target_type?: 'all' | 'branch' | 'building' | 'entrance' | 'floor' | 'custom';
    target_branch?: string;
    target_building_id?: string;
    target_entrance?: string;
    target_floor?: string;
    target_logins?: string;
    priority?: 'normal' | 'important' | 'urgent';
    expires_at?: string;
    attachments?: { name: string; url: string; type: string; size: number }[];
  }) => {
    const result = await apiRequest<{ id: string }>('/api/announcements', {
      method: 'POST',
      body: JSON.stringify(announcement),
    });
    invalidateCache('/api/announcements');
    return result;
  },

  delete: async (announcementId: string) => {
    const result = await apiRequest<{ success: boolean }>(`/api/announcements/${announcementId}`, {
      method: 'DELETE',
    });
    invalidateCache('/api/announcements');
    return result;
  },

  // Update announcement
  update: async (announcementId: string, data: {
    title?: string;
    content?: string;
    type?: 'residents' | 'employees' | 'all';
    priority?: 'normal' | 'important' | 'urgent';
    target_type?: string;
    target_building_id?: string;
    target_entrance?: string;
    target_floor?: string;
    target_logins?: string;
    expires_at?: string;
    attachments?: { name: string; url: string; type: string; size: number }[] | null;
  }) => {
    const result = await apiRequest<{ announcement: any }>(`/api/announcements/${announcementId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    invalidateCache('/api/announcements');
    return result;
  },

  // Mark announcement as viewed
  markAsViewed: async (announcementId: string) => {
    return apiRequest<{ success: boolean }>(`/api/announcements/${announcementId}/view`, {
      method: 'POST',
    });
  },

  // Get views for an announcement (admin/manager can see viewers list and stats)
  getViews: async (announcementId: string) => {
    return apiRequest<{
      count: number;
      targetAudienceSize: number;
      viewPercentage: number;
      viewers: any[];
      userViewed: boolean;
    }>(`/api/announcements/${announcementId}/views`);
  },
};

// File Upload API
export const uploadApi = {
  // Upload a file and get a data URL back
  uploadFile: async (file: File): Promise<{ name: string; url: string; type: string; size: number }> => {
    const formData = new FormData();
    formData.append('file', file);

    const token = localStorage.getItem('auth_token');
    const response = await fetch(`${API_URL}/api/upload`, {
      method: 'POST',
      headers: token ? { 'Authorization': `Bearer ${token}` } : {},
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Upload failed');
    }

    const data = await response.json();
    return data.file;
  },

  // Upload multiple files
  uploadFiles: async (files: File[]): Promise<{ name: string; url: string; type: string; size: number }[]> => {
    const results = await Promise.all(files.map(file => uploadApi.uploadFile(file)));
    return results;
  },
};

// Branches API (CRM)
export const branchesApi = {
  getAll: async () => {
    return cachedGet<{ branches: any[] }>('/api/branches', CACHE_TTL.LONG);
  },

  getById: async (id: string) => {
    return apiRequest<{ branch: any }>(`/api/branches/${id}`);
  },
};

// Buildings API (CRM)
export const buildingsApi = {
  getAll: async () => {
    // Buildings rarely change - use long cache
    return cachedGet<{ buildings: any[] }>('/api/buildings', CACHE_TTL.LONG);
  },

  getById: async (id: string) => {
    return cachedGet<{ building: any; entrances: any[]; documents: any[] }>(`/api/buildings/${id}`, CACHE_TTL.LONG);
  },

  create: async (building: {
    name: string;
    address: string;
    zone?: string;
    cadastralNumber?: string;
    branchCode?: string;
    buildingNumber?: string;
    floors?: number;
    entrances?: number;
    totalApartments?: number;
    totalArea?: number;
    livingArea?: number;
    commonArea?: number;
    landArea?: number;
    yearBuilt?: number;
    yearRenovated?: number;
    buildingType?: string;
    roofType?: string;
    wallMaterial?: string;
    foundationType?: string;
    hasElevator?: boolean;
    elevatorCount?: number;
    hasGas?: boolean;
    heatingType?: string;
    hasHotWater?: boolean;
    waterSupplyType?: string;
    sewerageType?: string;
    hasIntercom?: boolean;
    hasVideoSurveillance?: boolean;
    hasConcierge?: boolean;
    hasParkingLot?: boolean;
    parkingSpaces?: number;
    hasPlayground?: boolean;
    managerId?: string;
    managerName?: string;
    monthlyBudget?: number;
    reserveFund?: number;
  }) => {
    const result = await apiRequest<{ building: any }>('/api/buildings', {
      method: 'POST',
      body: JSON.stringify(building),
    });
    // Invalidate buildings cache after creation
    invalidateCache('/api/buildings');
    return result;
  },

  update: async (id: string, updates: Partial<{
    name: string;
    address: string;
    zone: string;
    cadastralNumber: string;
    branchCode: string;
    buildingNumber: string;
    floors: number;
    entrances: number;
    totalApartments: number;
    totalArea: number;
    livingArea: number;
    commonArea: number;
    landArea: number;
    yearBuilt: number;
    yearRenovated: number;
    buildingType: string;
    roofType: string;
    wallMaterial: string;
    foundationType: string;
    hasElevator: boolean;
    elevatorCount: number;
    hasGas: boolean;
    heatingType: string;
    hasHotWater: boolean;
    waterSupplyType: string;
    sewerageType: string;
    hasIntercom: boolean;
    hasVideoSurveillance: boolean;
    hasConcierge: boolean;
    hasParkingLot: boolean;
    parkingSpaces: number;
    hasPlayground: boolean;
    managerId: string;
    managerName: string;
    monthlyBudget: number;
    reserveFund: number;
    totalDebt: number;
    collectionRate: number;
  }>) => {
    const result = await apiRequest<{ building: any }>(`/api/buildings/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
    // Invalidate buildings cache after update
    invalidateCache('/api/buildings');
    return result;
  },

  delete: async (id: string) => {
    const result = await apiRequest<{ success: boolean }>(`/api/buildings/${id}`, {
      method: 'DELETE',
    });
    // Invalidate buildings cache after deletion
    invalidateCache('/api/buildings');
    return result;
  },
};

// Entrances API (CRM)
export const entrancesApi = {
  getByBuilding: async (buildingId: string) => {
    return apiRequest<{ entrances: any[] }>(`/api/buildings/${buildingId}/entrances`);
  },

  create: async (buildingId: string, entrance: {
    number: number;
    floorsFrom?: number;
    floorsTo?: number;
    apartmentsFrom?: number;
    apartmentsTo?: number;
    hasElevator?: boolean;
    elevatorId?: string;
    intercomType?: string;
    intercomCode?: string;
    cleaningSchedule?: string;
    responsibleId?: string;
    notes?: string;
  }) => {
    return apiRequest<{ entrance: any }>(`/api/buildings/${buildingId}/entrances`, {
      method: 'POST',
      body: JSON.stringify(entrance),
    });
  },

  update: async (id: string, updates: Partial<{
    number: number;
    floorsFrom: number;
    floorsTo: number;
    apartmentsFrom: number;
    apartmentsTo: number;
    hasElevator: boolean;
    elevatorId: string;
    intercomType: string;
    intercomCode: string;
    cleaningSchedule: string;
    responsibleId: string;
    lastInspection: string;
    notes: string;
  }>) => {
    return apiRequest<{ entrance: any }>(`/api/entrances/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  },

  delete: async (id: string) => {
    return apiRequest<{ success: boolean }>(`/api/entrances/${id}`, {
      method: 'DELETE',
    });
  },
};

// Building Documents API (CRM)
export const buildingDocumentsApi = {
  getByBuilding: async (buildingId: string) => {
    return apiRequest<{ documents: any[] }>(`/api/buildings/${buildingId}/documents`);
  },

  create: async (buildingId: string, document: {
    name: string;
    type?: string;
    fileUrl: string;
    fileSize?: number;
    expiresAt?: string;
  }) => {
    return apiRequest<{ document: any }>(`/api/buildings/${buildingId}/documents`, {
      method: 'POST',
      body: JSON.stringify(document),
    });
  },

  delete: async (id: string) => {
    return apiRequest<{ success: boolean }>(`/api/building-documents/${id}`, {
      method: 'DELETE',
    });
  },
};

// Apartments API (CRM)
export const apartmentsApi = {
  getByBuilding: async (buildingId: string, options?: {
    entranceId?: string;
    status?: string;
    page?: number;
    limit?: number;
  }) => {
    const params = new URLSearchParams();
    if (options?.entranceId) params.append('entrance_id', options.entranceId);
    if (options?.status) params.append('status', options.status);
    if (options?.page) params.append('page', options.page.toString());
    if (options?.limit) params.append('limit', options.limit.toString());
    const query = params.toString() ? `?${params.toString()}` : '';
    return apiRequest<{ apartments: any[]; pagination: { page: number; limit: number; total: number; pages: number } }>(
      `/api/buildings/${buildingId}/apartments${query}`
    );
  },

  getById: async (id: string) => {
    return apiRequest<{ apartment: any; owners: any[]; personalAccount: any }>(`/api/apartments/${id}`);
  },

  create: async (buildingId: string, apartment: {
    number: string;
    entranceId?: string;
    floor?: number;
    totalArea?: number;
    livingArea?: number;
    kitchenArea?: number;
    rooms?: number;
    hasBalcony?: boolean;
    hasLoggia?: boolean;
    status?: string;
  }) => {
    return apiRequest<{ apartment: any }>(`/api/buildings/${buildingId}/apartments`, {
      method: 'POST',
      body: JSON.stringify(apartment),
    });
  },

  update: async (id: string, updates: Partial<{
    entranceId: string;
    number: string;
    floor: number;
    totalArea: number;
    livingArea: number;
    rooms: number;
    status: string;
    primaryOwnerId: string;
    personalAccountId: string;
  }>) => {
    return apiRequest<{ apartment: any }>(`/api/apartments/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  },

  delete: async (id: string) => {
    return apiRequest<{ success: boolean }>(`/api/apartments/${id}`, {
      method: 'DELETE',
    });
  },
};

// Owners API (CRM)
export const ownersApi = {
  getAll: async (options?: { type?: string; search?: string; page?: number; limit?: number }) => {
    const params = new URLSearchParams();
    if (options?.type) params.append('type', options.type);
    if (options?.search) params.append('search', options.search);
    if (options?.page) params.append('page', options.page.toString());
    if (options?.limit) params.append('limit', options.limit.toString());
    const query = params.toString() ? `?${params.toString()}` : '';
    return apiRequest<{ owners: any[]; pagination: { page: number; limit: number; total: number; pages: number } }>(
      `/api/owners${query}`
    );
  },

  getById: async (id: string) => {
    return apiRequest<{ owner: any; apartments: any[] }>(`/api/owners/${id}`);
  },

  create: async (owner: {
    type?: string;
    lastName?: string;
    firstName?: string;
    middleName?: string;
    fullName?: string;
    phone?: string;
    email?: string;
    ownershipType?: string;
    ownershipShare?: number;
  }) => {
    return apiRequest<{ owner: any }>('/api/owners', {
      method: 'POST',
      body: JSON.stringify(owner),
    });
  },

  update: async (id: string, updates: Partial<{
    lastName: string;
    firstName: string;
    middleName: string;
    fullName: string;
    phone: string;
    email: string;
    isActive: boolean;
    isVerified: boolean;
  }>) => {
    return apiRequest<{ owner: any }>(`/api/owners/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  },

  delete: async (id: string) => {
    return apiRequest<{ success: boolean }>(`/api/owners/${id}`, {
      method: 'DELETE',
    });
  },

  linkToApartment: async (ownerId: string, apartmentId: string, data?: {
    ownershipShare?: number;
    isPrimary?: boolean;
    startDate?: string;
  }) => {
    return apiRequest<{ success: boolean }>(`/api/owners/${ownerId}/apartments/${apartmentId}`, {
      method: 'POST',
      body: JSON.stringify(data || {}),
    });
  },

  unlinkFromApartment: async (ownerId: string, apartmentId: string) => {
    return apiRequest<{ success: boolean }>(`/api/owners/${ownerId}/apartments/${apartmentId}`, {
      method: 'DELETE',
    });
  },
};

// Personal Accounts API (CRM)
export const personalAccountsApi = {
  getByBuilding: async (buildingId: string, options?: {
    status?: string;
    hasDebt?: boolean;
    page?: number;
    limit?: number;
  }) => {
    const params = new URLSearchParams();
    if (options?.status) params.append('status', options.status);
    if (options?.hasDebt) params.append('has_debt', 'true');
    if (options?.page) params.append('page', options.page.toString());
    if (options?.limit) params.append('limit', options.limit.toString());
    const query = params.toString() ? `?${params.toString()}` : '';
    return apiRequest<{ accounts: any[]; pagination: { page: number; limit: number; total: number; pages: number } }>(
      `/api/buildings/${buildingId}/accounts${query}`
    );
  },

  getById: async (id: string) => {
    return apiRequest<{ account: any }>(`/api/accounts/${id}`);
  },

  create: async (account: {
    apartmentId: string;
    buildingId: string;
    primaryOwnerId?: string;
    ownerName?: string;
    apartmentNumber?: string;
    totalArea?: number;
    residentsCount?: number;
    balance?: number;
    currentDebt?: number;
  }) => {
    return apiRequest<{ account: any }>('/api/accounts', {
      method: 'POST',
      body: JSON.stringify(account),
    });
  },

  update: async (id: string, updates: Partial<{
    ownerName: string;
    balance: number;
    currentDebt: number;
    penaltyAmount: number;
    status: string;
  }>) => {
    return apiRequest<{ account: any }>(`/api/accounts/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  },

  getDebtors: async (options?: { minDebt?: number; buildingId?: string }) => {
    const params = new URLSearchParams();
    if (options?.minDebt) params.append('min_debt', options.minDebt.toString());
    if (options?.buildingId) params.append('building_id', options.buildingId);
    const query = params.toString() ? `?${params.toString()}` : '';
    return apiRequest<{ debtors: any[] }>(`/api/accounts/debtors${query}`);
  },
};

// CRM Residents API
export const crmResidentsApi = {
  getByApartment: async (apartmentId: string, options?: { isActive?: boolean }) => {
    const params = new URLSearchParams();
    if (options?.isActive !== undefined) params.append('is_active', options.isActive.toString());
    const query = params.toString() ? `?${params.toString()}` : '';
    return apiRequest<{ residents: any[] }>(`/api/apartments/${apartmentId}/residents${query}`);
  },

  getById: async (id: string) => {
    return apiRequest<{ resident: any }>(`/api/residents/${id}`);
  },

  create: async (apartmentId: string, resident: {
    lastName?: string;
    firstName?: string;
    middleName?: string;
    fullName?: string;
    birthDate?: string;
    residentType?: string;
    relationToOwner?: string;
    registrationType?: string;
    registrationDate?: string;
    phone?: string;
    email?: string;
    movedInDate?: string;
    ownerId?: string;
  }) => {
    return apiRequest<{ resident: any }>(`/api/apartments/${apartmentId}/residents`, {
      method: 'POST',
      body: JSON.stringify(resident),
    });
  },

  update: async (id: string, updates: Partial<{
    lastName: string;
    firstName: string;
    middleName: string;
    fullName: string;
    birthDate: string;
    residentType: string;
    phone: string;
    email: string;
    isActive: boolean;
    movedOutDate: string;
    movedOutReason: string;
  }>) => {
    return apiRequest<{ resident: any }>(`/api/residents/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  },

  delete: async (id: string) => {
    return apiRequest<{ success: boolean }>(`/api/residents/${id}`, {
      method: 'DELETE',
    });
  },

  moveOut: async (id: string, data: { movedOutDate?: string; reason?: string }) => {
    return apiRequest<{ success: boolean }>(`/api/residents/${id}/move-out`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
};

// Meters API (CRM)
export const metersApi = {
  getByApartment: async (apartmentId: string, options?: { type?: string; isActive?: boolean }) => {
    const params = new URLSearchParams();
    if (options?.type) params.append('type', options.type);
    if (options?.isActive !== undefined) params.append('is_active', options.isActive.toString());
    const query = params.toString() ? `?${params.toString()}` : '';
    return apiRequest<{ meters: any[] }>(`/api/apartments/${apartmentId}/meters${query}`);
  },

  getByBuilding: async (buildingId: string, options?: { type?: string; isCommon?: boolean }) => {
    const params = new URLSearchParams();
    if (options?.type) params.append('type', options.type);
    if (options?.isCommon !== undefined) params.append('is_common', options.isCommon.toString());
    const query = params.toString() ? `?${params.toString()}` : '';
    return apiRequest<{ meters: any[] }>(`/api/buildings/${buildingId}/meters${query}`);
  },

  getById: async (id: string) => {
    return apiRequest<{ meter: any; readings: any[] }>(`/api/meters/${id}`);
  },

  create: async (meter: {
    apartmentId?: string;
    buildingId?: string;
    type: 'cold_water' | 'hot_water' | 'electricity' | 'gas' | 'heating';
    isCommon?: boolean;
    serialNumber: string;
    model?: string;
    brand?: string;
    installDate?: string;
    location?: string;
    initialValue?: number;
    verificationDate?: string;
    nextVerificationDate?: string;
    sealNumber?: string;
  }) => {
    return apiRequest<{ meter: any }>('/api/meters', {
      method: 'POST',
      body: JSON.stringify(meter),
    });
  },

  update: async (id: string, updates: Partial<{
    serialNumber: string;
    model: string;
    brand: string;
    location: string;
    verificationDate: string;
    nextVerificationDate: string;
    sealNumber: string;
    isActive: boolean;
    currentValue: number;
    lastReadingDate: string;
    notes: string;
  }>) => {
    return apiRequest<{ meter: any }>(`/api/meters/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  },

  delete: async (id: string) => {
    return apiRequest<{ success: boolean }>(`/api/meters/${id}`, {
      method: 'DELETE',
    });
  },

  decommission: async (id: string, reason?: string) => {
    return apiRequest<{ success: boolean }>(`/api/meters/${id}/decommission`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  },
};

// Meter Readings API
export const meterReadingsApi = {
  getByMeter: async (meterId: string, options?: { limit?: number; offset?: number; status?: string }) => {
    const params = new URLSearchParams();
    if (options?.limit) params.append('limit', options.limit.toString());
    if (options?.offset) params.append('offset', options.offset.toString());
    if (options?.status) params.append('status', options.status);
    const query = params.toString() ? `?${params.toString()}` : '';
    return apiRequest<{ readings: any[] }>(`/api/meters/${meterId}/readings${query}`);
  },

  getLastReading: async (meterId: string) => {
    return apiRequest<{ reading: any | null }>(`/api/meters/${meterId}/last-reading`);
  },

  submit: async (meterId: string, reading: {
    value: number;
    readingDate?: string;
    photoUrl?: string;
    notes?: string;
  }) => {
    return apiRequest<{ reading: any }>(`/api/meters/${meterId}/readings`, {
      method: 'POST',
      body: JSON.stringify(reading),
    });
  },

  verify: async (readingId: string, data: { approved: boolean; rejectionReason?: string }) => {
    return apiRequest<{ success: boolean }>(`/api/meter-readings/${readingId}/verify`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
};

// Team API (Admin only - get all staff: managers, department heads, executors)
export const teamApi = {
  getAll: async () => {
    // Always fetch fresh data, no caching
    return apiRequest<{
      admins: any[];
      managers: any[];
      departmentHeads: any[];
      executors: any[];
    }>('/api/team', { cache: 'no-store' });
  },

  // Get single staff member by ID (for live data refresh with password)
  getById: async (userId: string) => {
    // Always fetch fresh data, no caching
    return apiRequest<{ user: any }>(`/api/team/${userId}`, { cache: 'no-store' });
  },

  // Create new staff member (uses auth/register endpoint)
  create: async (data: {
    login: string;
    password: string;
    name: string;
    phone: string;
    role: 'admin' | 'manager' | 'department_head' | 'executor';
    specialization?: string;
  }) => {
    return apiRequest<{ user: any }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  update: async (userId: string, data: {
    name?: string;
    phone?: string;
    login?: string;
    password?: string;
    specialization?: string;
    status?: string;
  }) => {
    return apiRequest<{ user: any }>(`/api/team/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  // Delete staff member
  delete: async (userId: string) => {
    return apiRequest<{ success: boolean }>(`/api/team/${userId}`, {
      method: 'DELETE',
    });
  },

  // Reset passwords for all staff without password_plain (admin only, one-time operation)
  resetAllPasswords: async () => {
    return apiRequest<{
      message: string;
      updated: number;
      staff: { id: string; login: string; name: string; password: string }[];
    }>('/api/team/reset-all-passwords', {
      method: 'POST',
    });
  },
};

// Executors API
export const executorsApi = {
  getAll: async (showAll = false) => {
    const url = showAll ? '/api/executors?all=true' : '/api/executors';
    // No caching for executors - always fetch fresh data for accurate assignment
    return apiRequest<{ executors: any[] }>(url, { cache: 'no-store' });
  },

  // Get single executor by ID (for live data refresh with password)
  getById: async (executorId: string) => {
    // Always fetch fresh data, no caching
    return apiRequest<{ executor: any }>(`/api/executors/${executorId}`, { cache: 'no-store' });
  },

  updateStatus: async (executorId: string, status: 'available' | 'busy' | 'offline') => {
    return apiRequest<{ executor: any }>(`/api/executors/${executorId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  },

  // Get executor stats (rating, completed count, weekly, avg time)
  getStats: async (executorId: string) => {
    return apiRequest<{
      stats: {
        totalCompleted: number;
        thisWeek: number;
        thisMonth: number;
        rating: number;
        avgCompletionTime: number;
        statusBreakdown: Array<{ status: string; count: number }>;
      }
    }>(`/api/executors/${executorId}/stats`);
  },
};

// Requests API
export const requestsApi = {
  getAll: async (status?: string, category?: string) => {
    const params = new URLSearchParams();
    if (status) params.append('status', status);
    if (category) params.append('category', category);
    const queryString = params.toString();
    // Use cached GET with short TTL (10s) - requests change frequently
    return cachedGet<{ requests: any[] }>(`/api/requests${queryString ? '?' + queryString : ''}`, CACHE_TTL.SHORT);
  },

  create: async (request: {
    category_id: string;
    title: string;
    description?: string;
    priority?: 'low' | 'medium' | 'high' | 'urgent';
    access_info?: string;
    scheduled_at?: string;
    // For manual creation by managers/admins - specify resident
    resident_id?: string;
  }) => {
    const result = await apiRequest<{ request: any }>('/api/requests', {
      method: 'POST',
      body: JSON.stringify(request),
    });
    invalidateCache('/api/requests');
    return result;
  },

  update: async (requestId: string, updates: {
    status?: string;
    executor_id?: string;
    rating?: number;
    feedback?: string;
  }) => {
    const result = await apiRequest<{ success: boolean }>(`/api/requests/${requestId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
    invalidateCache('/api/requests');
    return result;
  },

  assign: async (requestId: string, executorId: string) => {
    const result = await apiRequest<{ request: any }>(`/api/requests/${requestId}/assign`, {
      method: 'POST',
      body: JSON.stringify({ executor_id: executorId }),
    });
    invalidateCache('/api/requests');
    return result;
  },

  accept: async (requestId: string) => {
    const result = await apiRequest<{ success: boolean }>(`/api/requests/${requestId}/accept`, {
      method: 'POST',
    });
    invalidateCache('/api/requests');
    return result;
  },

  start: async (requestId: string) => {
    const result = await apiRequest<{ success: boolean }>(`/api/requests/${requestId}/start`, {
      method: 'POST',
    });
    invalidateCache('/api/requests');
    return result;
  },

  complete: async (requestId: string) => {
    invalidateCache('/api/requests');
    return apiRequest<{ success: boolean }>(`/api/requests/${requestId}/complete`, {
      method: 'POST',
    });
  },

  pause: async (requestId: string) => {
    const result = await apiRequest<{ success: boolean; request: any }>(`/api/requests/${requestId}/pause`, {
      method: 'POST',
    });
    invalidateCache('/api/requests');
    return result;
  },

  resume: async (requestId: string) => {
    const result = await apiRequest<{ success: boolean; request: any; totalPausedTime: number }>(`/api/requests/${requestId}/resume`, {
      method: 'POST',
    });
    invalidateCache('/api/requests');
    return result;
  },

  // Resident approves completed work
  approve: async (requestId: string, rating?: number, feedback?: string) => {
    const result = await apiRequest<{ success: boolean }>(`/api/requests/${requestId}/approve`, {
      method: 'POST',
      body: JSON.stringify({ rating, feedback }),
    });
    invalidateCache('/api/requests');
    return result;
  },

  // Resident rejects work (sends back to executor)
  reject: async (requestId: string, reason: string) => {
    const result = await apiRequest<{ success: boolean }>(`/api/requests/${requestId}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
    invalidateCache('/api/requests');
    return result;
  },

  // Legacy rate endpoint (for backward compatibility)
  rate: async (requestId: string, rating: number, feedback?: string) => {
    return apiRequest<{ success: boolean }>(`/api/requests/${requestId}/rate`, {
      method: 'POST',
      body: JSON.stringify({ rating, feedback }),
    });
  },

  // Cancel request
  cancel: async (requestId: string, reason: string) => {
    const result = await apiRequest<{ success: boolean }>(`/api/requests/${requestId}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
    invalidateCache('/api/requests');
    return result;
  },

  // Decline/Release request (executor releases the request back to queue)
  decline: async (requestId: string, reason: string) => {
    const result = await apiRequest<{ success: boolean }>(`/api/requests/${requestId}/decline`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
    invalidateCache('/api/requests');
    return result;
  },

  // Reschedule requests
  createReschedule: async (requestId: string, data: {
    proposed_date: string;
    proposed_time: string;
    reason: string;
    reason_text?: string;
  }) => {
    return apiRequest<{ reschedule: any }>(`/api/requests/${requestId}/reschedule`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  getReschedules: async (requestId: string) => {
    return apiRequest<{ reschedules: any[] }>(`/api/requests/${requestId}/reschedule`);
  },
};

// Reschedule API (for pending reschedules)
export const rescheduleApi = {
  // Get pending reschedules for current user
  getPending: async () => {
    return apiRequest<{ reschedules: any[] }>('/api/reschedule-requests');
  },

  // Respond to reschedule request
  respond: async (rescheduleId: string, accepted: boolean, responseNote?: string) => {
    return apiRequest<{ reschedule: any }>(`/api/reschedule-requests/${rescheduleId}/respond`, {
      method: 'POST',
      body: JSON.stringify({ accepted, response_note: responseNote }),
    });
  },
};

// Ratings API
export const ratingsApi = {
  getForExecutor: async (executorId: string) => {
    return apiRequest<{ ratings: any[]; average: any }>(`/api/ratings?executor_id=${executorId}`);
  },

  create: async (rating: {
    executor_id: string;
    quality: number;
    speed: number;
    politeness: number;
    comment?: string;
  }) => {
    return apiRequest<{ rating: any }>('/api/ratings', {
      method: 'POST',
      body: JSON.stringify(rating),
    });
  },
};

// Categories API
export const categoriesApi = {
  getAll: async () => {
    return apiRequest<{ categories: any[] }>('/api/categories');
  },
};

// Stats API
export const statsApi = {
  getDashboard: async () => {
    return apiRequest<any>('/api/stats/dashboard');
  },
};

// Meetings API
export const meetingsApi = {
  getAll: async () => {
    return cachedGet<{ meetings: any[] }>('/api/meetings', CACHE_TTL.MEDIUM);
  },

  create: async (meeting: {
    title: string;
    description?: string;
    date: string;
    time: string;
    location?: string;
    type?: 'general' | 'emergency' | 'committee';
    target_building_id?: string;
  }) => {
    return apiRequest<{ meeting: any }>('/api/meetings', {
      method: 'POST',
      body: JSON.stringify(meeting),
    });
  },

  createVote: async (meetingId: string, vote: {
    question: string;
    options: string[];
  }) => {
    return apiRequest<{ vote: any }>(`/api/meetings/${meetingId}/votes`, {
      method: 'POST',
      body: JSON.stringify(vote),
    });
  },

  submitVote: async (voteId: string, optionIndex: number) => {
    return apiRequest<{ response: any }>(`/api/votes/${voteId}/respond`, {
      method: 'POST',
      body: JSON.stringify({ option_index: optionIndex }),
    });
  },
};

// ==================== TRAINING SYSTEM API ====================

// Training Partners API
export const trainingPartnersApi = {
  getAll: async (activeOnly?: boolean) => {
    const query = activeOnly ? '?active=true' : '';
    return apiRequest<{ partners: any[] }>(`/api/training/partners${query}`);
  },

  getById: async (id: string) => {
    return apiRequest<{ partner: any }>(`/api/training/partners/${id}`);
  },

  create: async (partner: {
    name: string;
    position?: string;
    specialization?: string;
    email?: string;
    phone?: string;
    bio?: string;
    avatarUrl?: string;
    isActive?: boolean;
  }) => {
    return apiRequest<{ partner: any }>('/api/training/partners', {
      method: 'POST',
      body: JSON.stringify(partner),
    });
  },

  update: async (id: string, updates: Partial<{
    name: string;
    position: string;
    specialization: string;
    email: string;
    phone: string;
    bio: string;
    avatarUrl: string;
    isActive: boolean;
  }>) => {
    return apiRequest<{ partner: any }>(`/api/training/partners/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  },

  delete: async (id: string) => {
    return apiRequest<{ success: boolean }>(`/api/training/partners/${id}`, {
      method: 'DELETE',
    });
  },
};

// Training Proposals API
export const trainingProposalsApi = {
  getAll: async (options?: {
    status?: string;
    partnerId?: string;
    authorId?: string;
    page?: number;
    limit?: number;
  }) => {
    const params = new URLSearchParams();
    if (options?.status) params.append('status', options.status);
    if (options?.partnerId) params.append('partner_id', options.partnerId);
    if (options?.authorId) params.append('author_id', options.authorId);
    if (options?.page) params.append('page', options.page.toString());
    if (options?.limit) params.append('limit', options.limit.toString());
    const query = params.toString() ? `?${params.toString()}` : '';
    return apiRequest<{ proposals: any[] }>(`/api/training/proposals${query}`);
  },

  getById: async (id: string) => {
    return apiRequest<{ proposal: any }>(`/api/training/proposals/${id}`);
  },

  create: async (proposal: {
    topic: string;
    description?: string;
    partnerId: string;
    format?: 'online' | 'offline' | 'any';
    preferredTimeSlots?: string[];
    isAuthorAnonymous?: boolean;
  }) => {
    return apiRequest<{ proposal: any }>('/api/training/proposals', {
      method: 'POST',
      body: JSON.stringify(proposal),
    });
  },

  update: async (id: string, updates: Partial<{
    topic: string;
    description: string;
    format: string;
    status: string;
    preferredTimeSlots: string[];
    partnerResponse: 'accepted' | 'rejected';
    partnerResponseNote: string;
  }>) => {
    return apiRequest<{ proposal: any }>(`/api/training/proposals/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  },

  delete: async (id: string) => {
    return apiRequest<{ success: boolean }>(`/api/training/proposals/${id}`, {
      method: 'DELETE',
    });
  },

  schedule: async (id: string, data: {
    scheduledDate: string;
    scheduledTime: string;
    scheduledLocation?: string;
    scheduledLink?: string;
    maxParticipants?: number;
  }) => {
    return apiRequest<{ proposal: any }>(`/api/training/proposals/${id}/schedule`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  complete: async (id: string, data?: { actualParticipantsCount?: number }) => {
    return apiRequest<{ proposal: any }>(`/api/training/proposals/${id}/complete`, {
      method: 'POST',
      body: JSON.stringify(data || {}),
    });
  },
};

// Training Votes API
export const trainingVotesApi = {
  getForProposal: async (proposalId: string) => {
    return apiRequest<{ votes: any[] }>(`/api/training/proposals/${proposalId}/votes`);
  },

  vote: async (proposalId: string, data: {
    participationIntent?: 'definitely' | 'maybe' | 'support_only';
    isAnonymous?: boolean;
  }) => {
    return apiRequest<{ vote: any }>(`/api/training/proposals/${proposalId}/votes`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  removeVote: async (proposalId: string) => {
    return apiRequest<{ success: boolean }>(`/api/training/proposals/${proposalId}/votes`, {
      method: 'DELETE',
    });
  },
};

// Training Registrations API
export const trainingRegistrationsApi = {
  register: async (proposalId: string) => {
    return apiRequest<{ registration: any }>(`/api/training/proposals/${proposalId}/register`, {
      method: 'POST',
    });
  },

  unregister: async (proposalId: string) => {
    return apiRequest<{ success: boolean }>(`/api/training/proposals/${proposalId}/register`, {
      method: 'DELETE',
    });
  },

  confirmAttendance: async (proposalId: string, userId: string) => {
    return apiRequest<{ success: boolean }>(`/api/training/proposals/${proposalId}/attendance/${userId}`, {
      method: 'POST',
    });
  },
};

// Training Feedback API
export const trainingFeedbackApi = {
  getForProposal: async (proposalId: string) => {
    return apiRequest<{ feedback: any[] }>(`/api/training/proposals/${proposalId}/feedback`);
  },

  submit: async (proposalId: string, feedback: {
    rating: number;
    contentRating?: number;
    presenterRating?: number;
    usefulnessRating?: number;
    comment?: string;
    isAnonymous?: boolean;
  }) => {
    return apiRequest<{ feedback: any }>(`/api/training/proposals/${proposalId}/feedback`, {
      method: 'POST',
      body: JSON.stringify(feedback),
    });
  },
};

// Training Notifications API
export const trainingNotificationsApi = {
  getAll: async (unreadOnly?: boolean) => {
    const query = unreadOnly ? '?unread=true' : '';
    return apiRequest<{ notifications: any[] }>(`/api/training/notifications${query}`);
  },

  markAsRead: async (id: string) => {
    return apiRequest<{ success: boolean }>(`/api/training/notifications/${id}/read`, {
      method: 'POST',
    });
  },

  markAllAsRead: async () => {
    return apiRequest<{ success: boolean }>('/api/training/notifications/read-all', {
      method: 'POST',
    });
  },
};

// Training Settings API
export const trainingSettingsApi = {
  getAll: async () => {
    return apiRequest<{ settings: Record<string, any> }>('/api/training/settings');
  },

  update: async (settings: Record<string, any>) => {
    return apiRequest<{ success: boolean }>('/api/training/settings', {
      method: 'PATCH',
      body: JSON.stringify(settings),
    });
  },
};

// Training Stats API
export const trainingStatsApi = {
  get: async () => {
    return apiRequest<{ stats: {
      totalProposals: number;
      votingProposals: number;
      scheduledTrainings: number;
      completedTrainings: number;
      totalVotes: number;
      totalParticipants: number;
      averageRating: number;
    } }>('/api/training/stats');
  },
};

// ==================== MEETING SYSTEM API ====================

// Meetings API (Full OSS workflow) - Uses wrapped responses for meetingStore compatibility
export const meetingsFullApi = {
  getAll: async (options?: {
    buildingId?: string;
    status?: string;
    organizerId?: string;
    onlyActive?: boolean; // ✅ NEW: Filter for active meetings only
  }) => {
    const params = new URLSearchParams();
    if (options?.buildingId) params.append('building_id', options.buildingId);
    if (options?.status) params.append('status', options.status);
    if (options?.organizerId) params.append('organizer_id', options.organizerId);
    if (options?.onlyActive) params.append('only_active', 'true'); // ✅ NEW
    const query = params.toString() ? `?${params.toString()}` : '';
    return apiRequestWrapped<{ meetings?: any[] }>(`/api/meetings${query}`).then(r => ({
      success: r.success,
      data: r.data?.meetings || r.data,
      error: r.error
    }));
  },

  getById: async (id: string) => {
    return apiRequestWrapped<any>(`/api/meetings/${id}`).then(r => ({
      success: r.success,
      data: r.data?.meeting || r.data,
      error: r.error
    }));
  },

  create: async (meeting: {
    buildingId: string;
    buildingAddress?: string;
    organizerType?: 'uk' | 'resident' | 'initiative_group';
    format?: 'online' | 'offline' | 'hybrid';
    location?: string;
    description?: string;
    meetingTime?: string;
    agendaItems: { title: string; description?: string; threshold?: string }[];
    materials?: any[];
  }) => {
    return apiRequestWrapped<any>('/api/meetings', {
      method: 'POST',
      body: JSON.stringify({
        ...meeting,
        meeting_time: meeting.meetingTime,
      }),
    }).then(r => ({
      success: r.success,
      data: r.data?.meeting || r.data,
      error: r.error
    }));
  },

  update: async (id: string, updates: any) => {
    return apiRequestWrapped<any>(`/api/meetings/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    }).then(r => ({
      success: r.success,
      data: r.data?.meeting || r.data,
      error: r.error
    }));
  },

  delete: async (id: string) => {
    return apiRequestWrapped<{ success: boolean }>(`/api/meetings/${id}`, {
      method: 'DELETE',
    });
  },

  // Status transitions
  submit: async (id: string) => {
    return apiRequestWrapped<any>(`/api/meetings/${id}/submit`, { method: 'POST' }).then(r => ({
      success: r.success,
      data: r.data?.meeting || r.data,
      error: r.error
    }));
  },

  approve: async (id: string) => {
    return apiRequestWrapped<any>(`/api/meetings/${id}/approve`, { method: 'POST' }).then(r => ({
      success: r.success,
      data: r.data?.meeting || r.data,
      error: r.error
    }));
  },

  reject: async (id: string, reason: string) => {
    return apiRequestWrapped<any>(`/api/meetings/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }).then(r => ({
      success: r.success,
      data: r.data?.meeting || r.data,
      error: r.error
    }));
  },

  openSchedulePoll: async (id: string) => {
    return apiRequestWrapped<any>(`/api/meetings/${id}/open-schedule-poll`, { method: 'POST' }).then(r => ({
      success: r.success,
      data: r.data?.meeting || r.data,
      error: r.error
    }));
  },

  confirmSchedule: async (id: string, optionId?: string) => {
    return apiRequestWrapped<any>(`/api/meetings/${id}/confirm-schedule`, {
      method: 'POST',
      body: JSON.stringify({ optionId }),
    }).then(r => ({
      success: r.success,
      data: r.data?.meeting || r.data,
      error: r.error
    }));
  },

  openVoting: async (id: string) => {
    return apiRequestWrapped<any>(`/api/meetings/${id}/open-voting`, { method: 'POST' }).then(r => ({
      success: r.success,
      data: r.data?.meeting || r.data,
      error: r.error
    }));
  },

  closeVoting: async (id: string) => {
    return apiRequestWrapped<any>(`/api/meetings/${id}/close-voting`, { method: 'POST' }).then(r => ({
      success: r.success,
      data: r.data?.meeting || r.data,
      error: r.error
    }));
  },

  publishResults: async (id: string) => {
    return apiRequestWrapped<any>(`/api/meetings/${id}/publish-results`, { method: 'POST' }).then(r => ({
      success: r.success,
      data: r.data?.meeting || r.data,
      error: r.error
    }));
  },

  generateProtocol: async (id: string) => {
    return apiRequestWrapped<any>(`/api/meetings/${id}/generate-protocol`, { method: 'POST' }).then(r => ({
      success: r.success,
      data: r.data,
      error: r.error
    }));
  },

  approveProtocol: async (id: string, signerData?: { signerId: string; signerName: string; signerRole: string }) => {
    return apiRequestWrapped<any>(`/api/meetings/${id}/approve-protocol`, {
      method: 'POST',
      body: signerData ? JSON.stringify(signerData) : undefined,
    }).then(r => ({
      success: r.success,
      data: r.data?.meeting || r.data,
      error: r.error
    }));
  },

  cancel: async (id: string, reason: string) => {
    return apiRequestWrapped<any>(`/api/meetings/${id}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }).then(r => ({
      success: r.success,
      data: r.data?.meeting || r.data,
      error: r.error
    }));
  },

  getProtocol: async (meetingId: string) => {
    return apiRequestWrapped<any>(`/api/meetings/${meetingId}/protocol`).then(r => ({
      success: r.success,
      data: r.data?.protocol || r.data,
      error: r.error
    }));
  },

  // Get protocol as HTML (for PDF export)
  getProtocolHtml: async (meetingId: string): Promise<string> => {
    const token = localStorage.getItem('auth_token');
    const response = await fetch(`/api/meetings/${meetingId}/protocol/html`, {
      headers: token ? { 'Authorization': `Bearer ${token}` } : {},
    });
    return response.text();
  },

  // Open protocol in new tab for printing/PDF
  openProtocolForPrint: (meetingId: string) => {
    window.open(`/api/meetings/${meetingId}/protocol/html`, '_blank');
  },

  // Download protocol as PDF (uses browser print dialog)
  downloadProtocolPdf: async (meetingId: string) => {
    const html = await meetingsFullApi.getProtocolHtml(meetingId);

    // Create iframe for printing
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    document.body.appendChild(iframe);

    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (doc) {
      doc.open();
      doc.write(html);
      doc.close();

      // Wait for content to load then print
      setTimeout(() => {
        iframe.contentWindow?.print();
        // Remove iframe after printing dialog closes
        setTimeout(() => {
          document.body.removeChild(iframe);
        }, 1000);
      }, 500);
    }
  },
};

// Meeting Schedule Votes API
export const meetingScheduleVotesApi = {
  vote: async (meetingId: string, optionId: string) => {
    // Invalidate meetings cache to force fresh data after vote
    invalidateCache('/api/meetings');

    return apiRequestWrapped<any>(`/api/meetings/${meetingId}/schedule-votes`, {
      method: 'POST',
      body: JSON.stringify({ option_id: optionId }), // API expects snake_case
    }).then(r => ({
      success: r.success,
      data: r.data?.meeting || r.data,
      error: r.error
    }));
  },

  getMyVote: async (meetingId: string) => {
    return apiRequestWrapped<{ optionId: string | null }>(`/api/meetings/${meetingId}/schedule-votes/me`);
  },
};

// Meeting Agenda Votes API
export const meetingAgendaVotesApi = {
  vote: async (meetingId: string, agendaItemId: string, data: {
    voterId: string;
    voterName: string;
    choice: 'for' | 'against' | 'abstain';
    apartmentId?: string;
    apartmentNumber?: string;
    ownershipShare?: number;
    verificationMethod?: 'login' | 'otp' | 'in_person' | 'proxy';
    otpVerified?: boolean;
    comment?: string; // Комментарий/обоснование к голосу
  }) => {
    return apiRequestWrapped<any>(
      `/api/meetings/${meetingId}/agenda/${agendaItemId}/vote`,
      {
        method: 'POST',
        body: JSON.stringify(data),
      }
    ).then(r => ({
      success: r.success,
      data: r.data,
      error: r.error
    }));
  },

  getMyVotes: async (meetingId: string, voterId?: string) => {
    const query = voterId ? `?voter_id=${voterId}` : '';
    return apiRequestWrapped<{ votes?: any[] }>(`/api/meetings/${meetingId}/votes/me${query}`).then(r => ({
      success: r.success,
      data: r.data?.votes || r.data || [],
      error: r.error
    }));
  },

  getVoteRecords: async (meetingId: string) => {
    return apiRequestWrapped<{ voteRecords?: any[] }>(`/api/meetings/${meetingId}/vote-records`).then(r => ({
      success: r.success,
      data: r.data?.voteRecords || r.data || [],
      error: r.error
    }));
  },
};

// Meeting Vote Reconsideration API
export const meetingReconsiderationApi = {
  // Get "against" votes for an agenda item (for managers)
  getAgainstVotes: async (meetingId: string, agendaItemId: string) => {
    return apiRequestWrapped<{ votes: any[] }>(
      `/api/meetings/${meetingId}/agenda/${agendaItemId}/votes/against`
    ).then(r => ({
      success: r.success,
      data: r.data?.votes || [],
      error: r.error
    }));
  },

  // Send reconsideration request to a resident
  sendRequest: async (meetingId: string, data: {
    agenda_item_id: string;
    resident_id: string;
    reason: string;
    message_to_resident?: string;
  }) => {
    return apiRequestWrapped<{ success: boolean; requestId: string }>(
      `/api/meetings/${meetingId}/reconsideration-requests`,
      {
        method: 'POST',
        body: JSON.stringify(data),
      }
    ).then(r => ({
      success: r.success,
      data: r.data,
      error: r.error
    }));
  },

  // Get resident's pending reconsideration requests
  getMyRequests: async () => {
    return apiRequestWrapped<{ requests: any[] }>(
      '/api/meetings/reconsideration-requests/me'
    ).then(r => ({
      success: r.success,
      data: r.data?.requests || [],
      error: r.error
    }));
  },

  // Mark request as viewed
  markViewed: async (requestId: string) => {
    return apiRequestWrapped<{ success: boolean }>(
      `/api/meetings/reconsideration-requests/${requestId}/view`,
      { method: 'POST' }
    ).then(r => ({
      success: r.success,
      data: r.data,
      error: r.error
    }));
  },

  // Ignore/dismiss request
  ignoreRequest: async (requestId: string) => {
    return apiRequestWrapped<{ success: boolean }>(
      `/api/meetings/reconsideration-requests/${requestId}/ignore`,
      { method: 'POST' }
    ).then(r => ({
      success: r.success,
      data: r.data,
      error: r.error
    }));
  },

  // Get reconsideration statistics for a meeting
  getStats: async (meetingId: string) => {
    return apiRequestWrapped<{ stats: any }>(
      `/api/meetings/${meetingId}/reconsideration-requests/stats`
    ).then(r => ({
      success: r.success,
      data: r.data?.stats || null,
      error: r.error
    }));
  },
};

// Meeting OTP API
export const meetingOtpApi = {
  request: async (data: {
    userId: string;
    phone: string;
    purpose: 'schedule_vote' | 'agenda_vote' | 'protocol_sign';
    meetingId?: string;
    agendaItemId?: string;
  }) => {
    return apiRequestWrapped<any>('/api/meetings/otp/request', {
      method: 'POST',
      body: JSON.stringify(data),
    }).then(r => ({
      success: r.success,
      data: r.data,
      error: r.error
    }));
  },

  verify: async (otpId: string, code: string) => {
    return apiRequestWrapped<{ verified: boolean; error?: string }>('/api/meetings/otp/verify', {
      method: 'POST',
      body: JSON.stringify({ otpId, code }),
    }).then(r => ({
      success: r.success,
      data: r.data,
      error: r.error
    }));
  },
};

// Meeting Building Settings API
export const meetingBuildingSettingsApi = {
  get: async (buildingId: string) => {
    return apiRequestWrapped<any>(`/api/meetings/building-settings/${buildingId}`).then(r => ({
      success: r.success,
      data: r.data?.settings || r.data,
      error: r.error
    }));
  },

  update: async (buildingId: string, settings: any) => {
    return apiRequestWrapped<any>(`/api/meetings/building-settings/${buildingId}`, {
      method: 'PATCH',
      body: JSON.stringify(settings),
    }).then(r => ({
      success: r.success,
      data: r.data?.settings || r.data,
      error: r.error
    }));
  },
};

// Meeting Voting Units API
export const meetingVotingUnitsApi = {
  getByBuilding: async (buildingId: string) => {
    return apiRequestWrapped<{ votingUnits?: any[] }>(`/api/meetings/voting-units?building_id=${buildingId}`).then(r => ({
      success: r.success,
      data: r.data?.votingUnits || r.data || [],
      error: r.error
    }));
  },

  create: async (unit: {
    buildingId: string;
    apartmentId?: string;
    apartmentNumber: string;
    ownerId?: string;
    ownerName?: string;
    coOwnerIds?: string[];
    ownershipShare?: number;
    totalArea?: number;
  }) => {
    return apiRequestWrapped<any>('/api/meetings/voting-units', {
      method: 'POST',
      body: JSON.stringify({
        building_id: unit.buildingId,
        apartment_id: unit.apartmentId,
        apartment_number: unit.apartmentNumber,
        owner_id: unit.ownerId,
        owner_name: unit.ownerName,
        co_owner_ids: unit.coOwnerIds ? JSON.stringify(unit.coOwnerIds) : '[]',
        ownership_share: unit.ownershipShare || 100,
        total_area: unit.totalArea || 0,
      }),
    }).then(r => ({
      success: r.success,
      data: r.data?.votingUnit || r.data,
      error: r.error
    }));
  },

  verify: async (id: string, verifiedBy: string) => {
    return apiRequestWrapped<any>(`/api/meetings/voting-units/${id}/verify`, {
      method: 'POST',
      body: JSON.stringify({ verified_by: verifiedBy }),
    }).then(r => ({
      success: r.success,
      data: r.data?.votingUnit || r.data,
      error: r.error
    }));
  },
};

// Meeting Eligible Voters API
export const meetingEligibleVotersApi = {
  set: async (meetingId: string, voterIds: string[], totalCount: number) => {
    return apiRequestWrapped<any>(`/api/meetings/${meetingId}/eligible-voters`, {
      method: 'POST',
      body: JSON.stringify({ voterIds, totalCount }),
    }).then(r => ({
      success: r.success,
      data: r.data?.meeting || r.data,
      error: r.error
    }));
  },
};

// Meeting Agenda Comments API (Комментарии к повестке дня)
export const meetingAgendaCommentsApi = {
  // Получить комментарии к вопросу
  getByAgendaItem: async (agendaItemId: string) => {
    return apiRequestWrapped<{ comments: any[] }>(`/api/agenda/${agendaItemId}/comments`).then(r => ({
      success: r.success,
      data: r.data?.comments || [],
      error: r.error
    }));
  },

  // Добавить комментарий
  create: async (agendaItemId: string, data: {
    content: string;
    apartmentNumber?: string;
    includeInProtocol?: boolean;
  }) => {
    return apiRequestWrapped<any>(`/api/agenda/${agendaItemId}/comments`, {
      method: 'POST',
      body: JSON.stringify({
        content: data.content,
        apartment_number: data.apartmentNumber,
        include_in_protocol: data.includeInProtocol !== false
      }),
    }).then(r => ({
      success: r.success,
      data: r.data?.comment || r.data,
      error: r.error
    }));
  },

  // Удалить свой комментарий
  delete: async (commentId: string) => {
    return apiRequestWrapped<{ success: boolean }>(`/api/comments/${commentId}`, {
      method: 'DELETE',
    });
  },
};

// ============================================
// APP SETTINGS API
// ============================================

export interface AppSettings {
  companyName: string;
  companyInn: string;
  companyAddress: string;
  companyPhone: string;
  routingMode: 'manual' | 'auto' | 'hybrid';
  workingHoursStart: string;
  workingHoursEnd: string;
  autoAssign: boolean;
  notifyOnNew: boolean;
  notifyOnComplete: boolean;
  notifyOnRating: boolean;
  smsNotifications: boolean;
  emailNotifications: boolean;
  pushNotifications: boolean;
}

export const settingsApi = {
  // Get all settings
  getAll: async () => {
    return apiRequestWrapped<{ settings: Record<string, any> }>('/api/settings').then(r => ({
      success: r.success,
      data: r.data,
      error: r.error
    }));
  },

  // Get single setting
  get: async (key: string) => {
    return apiRequestWrapped<{ value: any }>(`/api/settings/${key}`).then(r => ({
      success: r.success,
      data: r.data,
      error: r.error
    }));
  },

  // Update single setting
  update: async (key: string, value: any) => {
    return apiRequestWrapped<{ success: boolean }>(`/api/settings/${key}`, {
      method: 'PUT',
      body: JSON.stringify({ value }),
    });
  },

  // Bulk update settings
  updateMany: async (settings: Partial<AppSettings>) => {
    return apiRequestWrapped<{ success: boolean }>('/api/settings', {
      method: 'POST',
      body: JSON.stringify(settings),
    });
  },
};

// ============================================
// NOTIFICATIONS API
// ============================================

export interface Notification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body?: string;
  data?: any;
  is_read: boolean;
  created_at: string;
}

export const notificationsApi = {
  // Get notifications for current user
  getAll: async (limit = 50, unreadOnly = false) => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (unreadOnly) params.set('unread', 'true');
    return apiRequest<{ notifications: Notification[] }>(`/api/notifications?${params}`);
  },

  // Get unread count
  getUnreadCount: async () => {
    return apiRequest<{ count: number }>('/api/notifications/count');
  },

  // Create notification
  create: async (data: {
    user_id: string;
    type: string;
    title: string;
    body?: string;
    data?: any;
  }) => {
    return apiRequest<{ id: string; success: boolean }>('/api/notifications', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Mark as read
  markAsRead: async (id: string) => {
    return apiRequest<{ success: boolean }>(`/api/notifications/${id}/read`, {
      method: 'PATCH',
    });
  },

  // Mark all as read
  markAllAsRead: async () => {
    return apiRequest<{ success: boolean }>('/api/notifications/read-all', {
      method: 'POST',
    });
  },

  // Delete
  delete: async (id: string) => {
    return apiRequest<{ success: boolean }>(`/api/notifications/${id}`, {
      method: 'DELETE',
    });
  },

  // Broadcast to multiple users
  broadcast: async (data: {
    user_ids: string[];
    type: string;
    title: string;
    body?: string;
    data?: any;
  }) => {
    return apiRequest<{ success: boolean; count: number }>('/api/notifications/broadcast', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
};

// === TENANTS API (SUPER ADMIN ONLY) ===
export const tenantApi = {
  // Get all tenants
  getAll: async () => {
    return apiRequest<{ tenants: any[] }>('/api/tenants');
  },

  // Create tenant
  create: async (data: {
    name: string;
    slug: string;
    url: string;
    admin_url?: string;
    color?: string;
    color_secondary?: string;
    plan?: 'basic' | 'pro' | 'enterprise';
    features?: string[];
    admin_email?: string;
    admin_phone?: string;
  }) => {
    return apiRequest<{ tenant: any }>('/api/tenants', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Update tenant
  update: async (id: string, data: Partial<{
    name: string;
    slug: string;
    url: string;
    admin_url: string;
    color: string;
    color_secondary: string;
    plan: 'basic' | 'pro' | 'enterprise';
    features: string[];
    admin_email: string;
    admin_phone: string;
    is_active: number;
  }>) => {
    return apiRequest<{ tenant: any }>(`/api/tenants/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  // Delete tenant
  delete: async (id: string) => {
    return apiRequest<{ success: boolean }>(`/api/tenants/${id}`, {
      method: 'DELETE',
    });
  },
};
