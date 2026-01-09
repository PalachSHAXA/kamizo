/**
 * UK CRM Load Testing - API Endpoints
 *
 * Test scenarios:
 * 1. Authentication flow
 * 2. GET requests (read operations)
 * 3. POST requests (write operations)
 * 4. Mixed workload (realistic usage)
 *
 * Run: k6 run api-load-test.js
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// Custom metrics
const loginSuccessRate = new Rate('login_success');
const getRequestsLatency = new Trend('get_requests_latency');
const createRequestLatency = new Trend('create_request_latency');
const errorCounter = new Counter('errors');

// Configuration
const BASE_URL = __ENV.BASE_URL || 'https://uk-crm.shaxzod.workers.dev';

// Test stages - simulate gradual load increase
export const options = {
  stages: [
    { duration: '1m', target: 100 },   // Warm-up: 0 → 100 users
    { duration: '3m', target: 500 },   // Ramp-up: 100 → 500 users
    { duration: '5m', target: 1000 },  // Load test: 500 → 1000 users
    { duration: '5m', target: 2000 },  // Stress test: 1000 → 2000 users
    { duration: '3m', target: 5000 },  // Peak load: 2000 → 5000 users
    { duration: '2m', target: 5000 },  // Sustain peak: 5000 users
    { duration: '2m', target: 0 },     // Ramp-down: 5000 → 0 users
  ],
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<1000'], // 95% < 500ms, 99% < 1s
    http_req_failed: ['rate<0.01'],                  // Error rate < 1%
    login_success: ['rate>0.95'],                    // Login success > 95%
    get_requests_latency: ['p(95)<300'],             // GET requests < 300ms
    create_request_latency: ['p(95)<800'],           // POST requests < 800ms
  },
};

// Test data
const TEST_USERS = [
  { login: 'manager1', password: 'Manager123!' },
  { login: 'executor1', password: 'Executor123!' },
  { login: 'resident1', password: 'Resident123!' },
];

// Helper: Get random test user
function getRandomUser() {
  return TEST_USERS[Math.floor(Math.random() * TEST_USERS.length)];
}

// Helper: Login and get token
function login(user) {
  const loginRes = http.post(`${BASE_URL}/api/auth/login`, JSON.stringify({
    login: user.login,
    password: user.password,
  }), {
    headers: { 'Content-Type': 'application/json' },
  });

  const success = check(loginRes, {
    'login status is 200': (r) => r.status === 200,
    'login has token': (r) => JSON.parse(r.body).token !== undefined,
  });

  loginSuccessRate.add(success);

  if (success) {
    return JSON.parse(loginRes.body).token;
  }

  errorCounter.add(1);
  return null;
}

// Main test scenario
export default function () {
  const user = getRandomUser();

  // 1. Login
  const token = login(user);
  if (!token) {
    sleep(1);
    return;
  }

  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  // 2. Health check (public endpoint)
  group('Health Check', () => {
    const res = http.get(`${BASE_URL}/api/health`);
    check(res, {
      'health status is 200': (r) => r.status === 200,
      'health has status field': (r) => JSON.parse(r.body).status !== undefined,
    });
  });

  // 3. GET Requests (read operations)
  group('Read Operations', () => {
    // Get requests list
    const startTime = Date.now();
    const requestsRes = http.get(`${BASE_URL}/api/requests`, { headers });
    getRequestsLatency.add(Date.now() - startTime);

    check(requestsRes, {
      'get requests status is 200': (r) => r.status === 200,
      'get requests has data': (r) => JSON.parse(r.body).requests !== undefined,
    });

    // Get buildings
    const buildingsRes = http.get(`${BASE_URL}/api/buildings`, { headers });
    check(buildingsRes, {
      'get buildings status is 200': (r) => r.status === 200,
    });

    // Get categories (cached)
    const categoriesRes = http.get(`${BASE_URL}/api/categories`, { headers });
    check(categoriesRes, {
      'get categories status is 200': (r) => r.status === 200,
      'categories has cache header': (r) => r.headers['Cache-Control'] !== undefined,
    });
  });

  sleep(Math.random() * 2); // Random think time 0-2s

  // 4. POST Requests (write operations) - 20% of users
  if (Math.random() < 0.2) {
    group('Write Operations', () => {
      const createStartTime = Date.now();
      const createRes = http.post(`${BASE_URL}/api/requests`, JSON.stringify({
        title: `Load Test Request ${Date.now()}`,
        description: 'Automated load testing request',
        category: 'plumber',
        priority: 'medium',
        apartment: 'A-101',
      }), { headers });

      createRequestLatency.add(Date.now() - createStartTime);

      const createSuccess = check(createRes, {
        'create request status is 200 or 201': (r) => r.status === 200 || r.status === 201,
      });

      if (!createSuccess) {
        errorCounter.add(1);
      }
    });
  }

  // 5. Metrics check (admin only) - 5% of users
  if (user.login === 'manager1' && Math.random() < 0.05) {
    group('Admin Operations', () => {
      const metricsRes = http.get(`${BASE_URL}/api/admin/metrics`, { headers });
      check(metricsRes, {
        'metrics endpoint accessible': (r) => r.status === 200 || r.status === 403,
      });
    });
  }

  sleep(Math.random() * 3); // Random think time 0-3s
}

// Setup: Create test data
export function setup() {
  console.log('🚀 Starting load test...');
  console.log(`Target: ${BASE_URL}`);
  console.log('Peak load: 5000 concurrent users');
  return { timestamp: Date.now() };
}

// Teardown: Summary
export function teardown(data) {
  const duration = (Date.now() - data.timestamp) / 1000 / 60;
  console.log(`✅ Load test completed in ${duration.toFixed(2)} minutes`);
}
