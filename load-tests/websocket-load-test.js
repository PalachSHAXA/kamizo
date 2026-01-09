/**
 * UK CRM Load Testing - WebSocket Connections
 *
 * Test Durable Objects + WebSocket scalability
 * Simulates 5000 concurrent WebSocket connections
 *
 * Run: k6 run websocket-load-test.js
 */

import ws from 'k6/ws';
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// Custom metrics
const wsConnectionRate = new Rate('ws_connection_success');
const wsMessageLatency = new Trend('ws_message_latency');
const wsErrorCounter = new Counter('ws_errors');
const activeConnections = new Counter('ws_active_connections');

// Configuration
const BASE_URL = __ENV.BASE_URL || 'https://uk-crm.shaxzod.workers.dev';
const WS_URL = BASE_URL.replace('https://', 'wss://').replace('http://', 'ws://');

// Test stages - gradual WebSocket connection increase
export const options = {
  stages: [
    { duration: '2m', target: 500 },   // Warm-up: 0 → 500 connections
    { duration: '3m', target: 1000 },  // Ramp-up: 500 → 1000 connections
    { duration: '3m', target: 2000 },  // Load: 1000 → 2000 connections
    { duration: '3m', target: 3500 },  // Stress: 2000 → 3500 connections
    { duration: '2m', target: 5000 },  // Peak: 3500 → 5000 connections
    { duration: '5m', target: 5000 },  // Sustain: 5000 connections
    { duration: '2m', target: 0 },     // Ramp-down: 5000 → 0
  ],
  thresholds: {
    ws_connection_success: ['rate>0.98'],           // Connection success > 98%
    ws_message_latency: ['p(95)<200', 'p(99)<500'], // Message latency < 200ms (p95)
    ws_errors: ['count<100'],                        // Total errors < 100
  },
};

// Test data
const TEST_USERS = [
  { login: 'manager1', password: 'Manager123!' },
  { login: 'executor1', password: 'Executor123!' },
  { login: 'resident1', password: 'Resident123!' },
  { login: 'dispatcher1', password: 'Dispatcher123!' },
];

function getRandomUser() {
  return TEST_USERS[Math.floor(Math.random() * TEST_USERS.length)];
}

// Get auth token
function getAuthToken(user) {
  const loginRes = http.post(`${BASE_URL}/api/auth/login`, JSON.stringify({
    login: user.login,
    password: user.password,
  }), {
    headers: { 'Content-Type': 'application/json' },
  });

  if (loginRes.status === 200) {
    return JSON.parse(loginRes.body).token;
  }

  return null;
}

export default function () {
  const user = getRandomUser();
  const token = getAuthToken(user);

  if (!token) {
    wsErrorCounter.add(1);
    sleep(5);
    return;
  }

  const wsUrl = `${WS_URL}/api/ws?token=${token}`;
  let messageReceived = false;
  let connectionStartTime = Date.now();

  const res = ws.connect(wsUrl, {
    headers: {
      'User-Agent': 'k6-load-test',
    },
  }, function (socket) {
    // Connection established
    const connectionTime = Date.now() - connectionStartTime;
    const connected = check(socket, {
      'WebSocket connected': (s) => s !== null,
    });

    wsConnectionRate.add(connected);

    if (!connected) {
      wsErrorCounter.add(1);
      return;
    }

    activeConnections.add(1);
    console.log(`✅ WebSocket connected for ${user.login} (${connectionTime}ms)`);

    // Handle incoming messages
    socket.on('open', () => {
      console.log(`WebSocket opened for ${user.login}`);
    });

    socket.on('message', (data) => {
      const messageStartTime = Date.now();

      try {
        const message = JSON.parse(data);
        console.log(`📨 Received: ${message.type} for ${user.login}`);

        // Measure message processing latency
        wsMessageLatency.add(Date.now() - messageStartTime);

        check(message, {
          'message has type field': (m) => m.type !== undefined,
        });

        messageReceived = true;

        // Respond to ping with pong
        if (message.type === 'ping') {
          socket.send(JSON.stringify({ type: 'pong' }));
        }

        // Handle different message types
        switch (message.type) {
          case 'connected':
            console.log(`Connected: ${user.login}, sessions: ${message.data?.totalSessions || 0}`);
            break;
          case 'request_update':
            console.log(`Request update received for ${user.login}`);
            break;
          case 'meeting_update':
            console.log(`Meeting update received for ${user.login}`);
            break;
        }
      } catch (e) {
        console.error(`Error parsing message: ${e}`);
        wsErrorCounter.add(1);
      }
    });

    socket.on('error', (e) => {
      console.error(`WebSocket error for ${user.login}: ${e}`);
      wsErrorCounter.add(1);
    });

    socket.on('close', () => {
      console.log(`WebSocket closed for ${user.login}`);
      activeConnections.add(-1);
    });

    // Send periodic heartbeat
    socket.setInterval(() => {
      if (socket.readyState === ws.OPEN) {
        socket.send(JSON.stringify({ type: 'ping' }));
      }
    }, 30000); // Every 30 seconds

    // Keep connection alive for test duration
    const connectionDuration = 60 + Math.random() * 120; // 60-180 seconds
    socket.setTimeout(() => {
      console.log(`Closing connection for ${user.login} after ${connectionDuration}s`);
      socket.close();
    }, connectionDuration * 1000);

    // Wait for connection duration
    sleep(connectionDuration);
  });

  // Check connection result
  check(res, {
    'WebSocket status is 101': (r) => r && r.status === 101,
  });

  if (!res || res.status !== 101) {
    wsErrorCounter.add(1);
  }

  // Small delay before next iteration
  sleep(Math.random() * 5);
}

export function setup() {
  console.log('🚀 Starting WebSocket load test...');
  console.log(`Target: ${WS_URL}`);
  console.log('Peak: 5000 concurrent WebSocket connections');
  console.log('Duration: ~20 minutes');
  return { timestamp: Date.now() };
}

export function teardown(data) {
  const duration = (Date.now() - data.timestamp) / 1000 / 60;
  console.log(`✅ WebSocket load test completed in ${duration.toFixed(2)} minutes`);
}
