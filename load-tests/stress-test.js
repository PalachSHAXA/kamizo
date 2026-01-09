/**
 * UK CRM Stress Testing - Bulk Operations
 *
 * Test scenarios:
 * 1. Bulk request creation (1000 requests simultaneously)
 * 2. Bulk user registration (100 users)
 * 3. Database write stress
 * 4. Cache invalidation stress
 *
 * Run: k6 run stress-test.js
 */

import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// Custom metrics
const bulkCreateSuccessRate = new Rate('bulk_create_success');
const bulkCreateLatency = new Trend('bulk_create_latency');
const dbWriteLatency = new Trend('db_write_latency');
const cacheInvalidations = new Counter('cache_invalidations');
const errorCounter = new Counter('errors');

// Configuration
const BASE_URL = __ENV.BASE_URL || 'https://uk-crm.shaxzod.workers.dev';

// Aggressive stress test stages
export const options = {
  scenarios: {
    // Scenario 1: Burst of 1000 request creations
    request_creation_burst: {
      executor: 'constant-arrival-rate',
      rate: 1000,              // 1000 requests/second
      timeUnit: '1s',
      duration: '30s',         // 30 seconds of burst
      preAllocatedVUs: 100,
      maxVUs: 500,
    },

    // Scenario 2: Sustained database write load
    sustained_writes: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: 200 },  // Ramp to 200 VUs
        { duration: '3m', target: 500 },  // Ramp to 500 VUs
        { duration: '2m', target: 1000 }, // Stress: 1000 VUs
        { duration: '1m', target: 0 },    // Ramp down
      ],
      startTime: '40s', // Start after burst scenario
    },

    // Scenario 3: Read-heavy workload (cache testing)
    cache_stress: {
      executor: 'constant-vus',
      vus: 500,
      duration: '5m',
      startTime: '3m',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<2000'], // 95% < 2s (acceptable under stress)
    http_req_failed: ['rate<0.05'],     // Error rate < 5% (acceptable under stress)
    bulk_create_latency: ['p(95)<3000'],
    db_write_latency: ['p(99)<5000'],
  },
};

// Test data
const ADMIN_USER = { login: 'admin', password: 'Admin123!' };
const MANAGER_USER = { login: 'manager1', password: 'Manager123!' };

function getAuthToken(user) {
  const loginRes = http.post(`${BASE_URL}/api/auth/login`, JSON.stringify(user), {
    headers: { 'Content-Type': 'application/json' },
  });

  if (loginRes.status === 200) {
    return JSON.parse(loginRes.body).token;
  }
  return null;
}

// Scenario 1: Request Creation Burst
export function request_creation_burst() {
  const token = getAuthToken(MANAGER_USER);
  if (!token) {
    errorCounter.add(1);
    return;
  }

  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  const startTime = Date.now();

  const requestData = {
    title: `Stress Test Request ${Date.now()}-${__VU}-${__ITER}`,
    description: `Bulk load testing - VU:${__VU}, Iter:${__ITER}`,
    category: ['plumber', 'electrician', 'elevator', 'cleaning'][Math.floor(Math.random() * 4)],
    priority: ['low', 'medium', 'high', 'urgent'][Math.floor(Math.random() * 4)],
    apartment: `A-${100 + Math.floor(Math.random() * 400)}`,
  };

  const res = http.post(`${BASE_URL}/api/requests`, JSON.stringify(requestData), { headers });

  const latency = Date.now() - startTime;
  bulkCreateLatency.add(latency);
  dbWriteLatency.add(latency);

  const success = check(res, {
    'bulk create status ok': (r) => r.status === 200 || r.status === 201,
    'bulk create has id': (r) => {
      try {
        return JSON.parse(r.body).request?.id !== undefined;
      } catch {
        return false;
      }
    },
  });

  bulkCreateSuccessRate.add(success);

  if (!success) {
    errorCounter.add(1);
    console.error(`Failed to create request: ${res.status} - ${res.body}`);
  }
}

// Scenario 2: Sustained Database Writes
export function sustained_writes() {
  const token = getAuthToken(MANAGER_USER);
  if (!token) {
    errorCounter.add(1);
    sleep(1);
    return;
  }

  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  group('Database Write Operations', () => {
    // Create request
    const createStart = Date.now();
    const createRes = http.post(`${BASE_URL}/api/requests`, JSON.stringify({
      title: `Write Test ${Date.now()}`,
      description: 'Sustained write load testing',
      category: 'plumber',
      priority: 'medium',
      apartment: `B-${Math.floor(Math.random() * 500)}`,
    }), { headers });

    dbWriteLatency.add(Date.now() - createStart);

    if (createRes.status === 200 || createRes.status === 201) {
      const requestId = JSON.parse(createRes.body).request?.id;

      // Update request (if created successfully)
      if (requestId) {
        sleep(0.5);

        const updateRes = http.patch(
          `${BASE_URL}/api/requests/${requestId}`,
          JSON.stringify({
            status: 'in_progress',
            notes: 'Stress test update',
          }),
          { headers }
        );

        check(updateRes, {
          'update successful': (r) => r.status === 200,
        });

        // Trigger cache invalidation
        cacheInvalidations.add(1);
      }
    } else {
      errorCounter.add(1);
    }
  });

  sleep(Math.random()); // 0-1s think time
}

// Scenario 3: Cache Stress (Read-Heavy)
export function cache_stress() {
  const token = getAuthToken(MANAGER_USER);
  if (!token) {
    errorCounter.add(1);
    sleep(1);
    return;
  }

  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  group('Cache Read Operations', () => {
    // Read cached data (categories, buildings, executors)
    const endpoints = [
      '/api/categories',
      '/api/buildings',
      '/api/executors',
      '/api/requests',
    ];

    endpoints.forEach((endpoint) => {
      const res = http.get(`${BASE_URL}${endpoint}`, { headers });

      check(res, {
        [`${endpoint} status ok`]: (r) => r.status === 200,
        [`${endpoint} has cache header`]: (r) => {
          // Categories and buildings should be cached
          if (endpoint === '/api/categories' || endpoint === '/api/buildings') {
            return r.headers['Cache-Control'] !== undefined;
          }
          return true;
        },
      });

      if (res.status !== 200) {
        errorCounter.add(1);
      }
    });
  });

  sleep(0.1); // Fast iteration for cache stress
}

export function setup() {
  console.log('⚠️  Starting STRESS TEST...');
  console.log(`Target: ${BASE_URL}`);
  console.log('Scenarios:');
  console.log('  1. Request creation burst: 1000 req/s for 30s');
  console.log('  2. Sustained writes: 0 → 1000 VUs over 7 mins');
  console.log('  3. Cache stress: 500 VUs for 5 mins');
  console.log('');
  console.log('⚡ This will generate HEAVY load on the system!');

  return { timestamp: Date.now() };
}

export function teardown(data) {
  const duration = (Date.now() - data.timestamp) / 1000 / 60;
  console.log(`✅ Stress test completed in ${duration.toFixed(2)} minutes`);
}
