import axios from 'axios';

// API Base URL - ваш Cloudflare Workers URL
const API_BASE_URL = 'https://uk-crm-api.shaxzod.workers.dev';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor для добавления токена
apiClient.interceptors.request.use(
  (config) => {
    const token = global.authToken;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor для обработки ошибок
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Токен истёк - выйти из системы
      global.authToken = undefined;
    }
    return Promise.reject(error);
  }
);

// API методы
export const authAPI = {
  login: async (login: string, password: string) => {
    const response = await apiClient.post('/api/auth/login', { login, password });
    return response.data;
  },
};

export const colleaguesAPI = {
  getAll: async () => {
    const response = await apiClient.get('/api/colleagues');
    return response.data;
  },

  rate: async (targetId: number, ratings: any, comment?: string) => {
    const response = await apiClient.post('/api/colleagues/rate', {
      targetId,
      ratings,
      comment,
    });
    return response.data;
  },

  thank: async (targetId: number, reason: string, isAnonymous: boolean) => {
    const response = await apiClient.post('/api/colleagues/thank', {
      targetId,
      reason,
      isAnonymous,
    });
    return response.data;
  },

  getProfile: async (id: number) => {
    const response = await apiClient.get(`/api/colleagues/${id}`);
    return response.data;
  },
};

export const requestsAPI = {
  getAll: async () => {
    const response = await apiClient.get('/api/requests');
    return response.data;
  },

  create: async (data: any) => {
    const response = await apiClient.post('/api/requests', data);
    return response.data;
  },

  update: async (id: number, data: any) => {
    const response = await apiClient.patch(`/api/requests/${id}`, data);
    return response.data;
  },
};

declare global {
  var authToken: string | undefined;
}
