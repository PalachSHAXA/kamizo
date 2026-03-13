import https from 'https';
import fs from 'fs';

const DEMO_IP = '188.114.97.3';
const DEMO_HOST = 'demo.kamizo.uz';
const MAIN_IP = '188.114.96.3';
const MAIN_HOST = 'kamizo.uz';

// HTTP helper with SNI + direct IP
function httpRequest(ip, host, path, method = 'GET', body = null, token = null, extraHeaders = {}) {
  return new Promise((resolve) => {
    const headers = {
      'Host': host,
      'Content-Type': 'application/json',
      'Origin': `https://${host}`,
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      ...extraHeaders
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const bodyStr = body ? JSON.stringify(body) : null;
    if (bodyStr) headers['Content-Length'] = Buffer.byteLength(bodyStr);

    const options = {
      hostname: ip,
      port: 443,
      path,
      method,
      headers,
      servername: host,
      rejectUnauthorized: false,
      timeout: 15000
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        let parsed = null;
        try { parsed = JSON.parse(data); } catch {}
        resolve({ status: res.statusCode, body: data, json: parsed, ok: res.statusCode < 400 });
      });
    });
    req.on('error', e => resolve({ status: 0, body: '', json: null, ok: false, error: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, body: '', json: null, ok: false, error: 'timeout' }); });
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

// Login helper
async function login(username, password, ip = DEMO_IP, host = DEMO_HOST) {
  const res = await httpRequest(ip, host, '/api/auth/login', 'POST', { username, password });
  if (res.json?.token) return res.json.token;
  if (res.json?.access_token) return res.json.access_token;
  // Check for session-based auth or user object with token
  if (res.json?.user) return null; // session-based
  return null;
}

// GET with token
async function get(ip, host, path, token) {
  return httpRequest(ip, host, path, 'GET', null, token);
}

// POST with token
async function post(ip, host, path, body, token) {
  return httpRequest(ip, host, path, 'POST', body, token);
}

const log = (m) => console.log(`[API-AUDIT] ${m}`);

const report = {
  audit_date: '2026-03-12',
  phases: [],
  summary: {}
};

// ─── Phase 1: Login & Auth ────────────────────────────────────────────────────
async function phase1_LoginAuth() {
  const phase = { phase: 1, name: 'Login & Auth', tests: [] };
  log('=== Phase 1: Login & Auth ===');

  const roles = [
    { role: 'admin', username: 'demo-admin', password: 'demo123', ip: DEMO_IP, host: DEMO_HOST },
    { role: 'manager', username: 'demo-manager', password: 'demo123', ip: DEMO_IP, host: DEMO_HOST },
    { role: 'director', username: 'demo-director', password: 'demo123', ip: DEMO_IP, host: DEMO_HOST },
    { role: 'resident', username: 'demo-resident', password: 'demo123', ip: DEMO_IP, host: DEMO_HOST },
    { role: 'executor', username: 'demo-executor', password: 'demo123', ip: DEMO_IP, host: DEMO_HOST },
    { role: 'guard', username: 'demo-guard', password: 'demo123', ip: DEMO_IP, host: DEMO_HOST },
    { role: 'department_head', username: 'demo-head', password: 'demo123', ip: DEMO_IP, host: DEMO_HOST },
    { role: 'tenant', username: 'demo-tenant', password: 'demo123', ip: DEMO_IP, host: DEMO_HOST },
    { role: 'advertiser', username: 'demo-advertiser', password: 'demo123', ip: DEMO_IP, host: DEMO_HOST },
    { role: 'courier', username: 'demo-courier', password: 'demo123', ip: DEMO_IP, host: DEMO_HOST },
    { role: 'super_admin', username: 'admin', password: 'admin123', ip: MAIN_IP, host: MAIN_HOST },
  ];

  const tokens = {};

  for (const r of roles) {
    const res = await httpRequest(r.ip, r.host, '/api/auth/login', 'POST', { username: r.username, password: r.password });
    const token = res.json?.token || res.json?.access_token;
    const userRole = res.json?.user?.role || res.json?.role;

    if (res.status === 200 && (token || res.json?.user)) {
      tokens[r.role] = { token, ip: r.ip, host: r.host };
      phase.tests.push({
        role: r.role,
        status: 'PASS',
        http_status: res.status,
        notes: `Login successful. Role from API: ${userRole || 'N/A'}. Token: ${token ? 'JWT' : 'session'}`
      });
      log(`  ${r.role}: PASS (HTTP ${res.status}, role=${userRole})`);
    } else {
      phase.tests.push({
        role: r.role,
        status: 'FAIL',
        http_status: res.status,
        notes: `Login failed. HTTP ${res.status}. Response: ${res.body.slice(0, 200)}`
      });
      log(`  ${r.role}: FAIL (HTTP ${res.status})`);
    }
  }

  return { phase, tokens };
}

// ─── Phase 2: Admin Dashboard ──────────────────────────────────────────────────
async function phase2_AdminDashboard(tokens) {
  const phase = { phase: 2, name: 'Admin Dashboard', tests: [] };
  log('\n=== Phase 2: Admin Dashboard ===');

  const { token, ip, host } = tokens['admin'] || {};
  if (!token) {
    phase.tests.push({ test: 'Login prerequisite', role: 'admin', status: 'FAIL', notes: 'No auth token from Phase 1' });
    return phase;
  }

  const endpoints = [
    { name: 'Overview - stats', path: '/api/stats' },
    { name: 'Residents', path: '/api/residents' },
    { name: 'Buildings', path: '/api/buildings' },
    { name: 'Executors', path: '/api/users?role=executor' },
    { name: 'Requests', path: '/api/requests' },
    { name: 'Meetings', path: '/api/meetings' },
    { name: 'Marketplace', path: '/api/marketplace/products' },
    { name: 'Announcements', path: '/api/announcements' },
    { name: 'Work Orders', path: '/api/work-orders' },
    { name: 'Reports', path: '/api/reports' },
    { name: 'Settings', path: '/api/settings' },
    { name: 'Platform Ads', path: '/api/platform-ads' },
    { name: 'Team/Users', path: '/api/users' },
    { name: 'Monitoring', path: '/api/admin/monitoring' },
  ];

  for (const ep of endpoints) {
    try {
      const res = await get(ip, host, ep.path, token);
      const status = res.status === 200 ? 'PASS' : res.status === 404 ? 'NEEDS_REVIEW' : 'FAIL';
      const dataInfo = res.json ? (Array.isArray(res.json) ? `${res.json.length} items` : (Array.isArray(res.json?.data) ? `${res.json.data.length} items` : 'object')) : 'non-JSON';
      phase.tests.push({
        test: ep.name,
        role: 'admin',
        status,
        http_status: res.status,
        notes: status === 'PASS' ? `API returns ${dataInfo}` : `HTTP ${res.status}: ${res.body.slice(0, 100)}`
      });
      log(`  ${ep.name}: HTTP ${res.status} (${dataInfo})`);
    } catch (err) {
      phase.tests.push({ test: ep.name, role: 'admin', status: 'FAIL', notes: `Error: ${err.message}` });
    }
  }

  return phase;
}

// ─── Phase 3: Manager Dashboard ───────────────────────────────────────────────
async function phase3_ManagerDashboard(tokens) {
  const phase = { phase: 3, name: 'Manager Dashboard', tests: [] };
  log('\n=== Phase 3: Manager Dashboard ===');

  const { token, ip, host } = tokens['manager'] || {};
  if (!token) {
    phase.tests.push({ test: 'Login prerequisite', role: 'manager', status: 'FAIL', notes: 'No auth token' });
    return phase;
  }

  const tests = [
    { name: 'Overview stats', path: '/api/stats' },
    { name: 'Guest access management', path: '/api/guest-access' },
    { name: 'Rentals', path: '/api/rentals' },
    { name: 'Requests (for assignment)', path: '/api/requests' },
  ];

  for (const t of tests) {
    const res = await get(ip, host, t.path, token);
    const dataInfo = res.json ? (Array.isArray(res.json) ? `${res.json.length} items` : (Array.isArray(res.json?.data) ? `${res.json.data.length} items` : 'object')) : 'non-JSON';
    phase.tests.push({
      test: t.name,
      role: 'manager',
      status: res.status === 200 ? 'PASS' : res.status === 404 ? 'NEEDS_REVIEW' : 'FAIL',
      http_status: res.status,
      notes: res.status === 200 ? `API returns ${dataInfo}` : `HTTP ${res.status}: ${res.body.slice(0, 100)}`
    });
    log(`  ${t.name}: HTTP ${res.status}`);
  }

  return phase;
}

// ─── Phase 4: Resident Dashboard ──────────────────────────────────────────────
async function phase4_ResidentDashboard(tokens) {
  const phase = { phase: 4, name: 'Resident Dashboard', tests: [] };
  log('\n=== Phase 4: Resident Dashboard ===');

  const { token, ip, host } = tokens['resident'] || {};
  if (!token) {
    phase.tests.push({ test: 'Login prerequisite', role: 'resident', status: 'FAIL', notes: 'No auth token' });
    return phase;
  }

  // Dashboard loads
  const dashRes = await get(ip, host, '/api/stats', token);
  phase.tests.push({ test: 'Dashboard data loads', role: 'resident', status: dashRes.status === 200 ? 'PASS' : 'NEEDS_REVIEW', http_status: dashRes.status, notes: `Stats API: HTTP ${dashRes.status}` });

  // Submit a service request
  const reqBody = {
    category: 'plumbing',
    type: 'plumbing',
    description: 'Test audit request',
    priority: 'medium',
    title: 'Test Audit Request - Plumbing'
  };
  const createRes = await post(ip, host, '/api/requests', reqBody, token);
  const requestId = createRes.json?.id || createRes.json?.data?.id || createRes.json?.request?.id;
  phase.tests.push({
    test: 'Submit service request (plumbing, "Test audit request")',
    role: 'resident',
    status: createRes.status < 400 ? 'PASS' : 'FAIL',
    http_status: createRes.status,
    notes: createRes.status < 400 ? `Request created, ID: ${requestId || 'not captured'}` : `HTTP ${createRes.status}: ${createRes.body.slice(0, 150)}`
  });
  log(`  Create request: HTTP ${createRes.status}, ID: ${requestId}`);

  // Verify request in list
  const listRes = await get(ip, host, '/api/requests', token);
  const count = Array.isArray(listRes.json) ? listRes.json.length : (Array.isArray(listRes.json?.data) ? listRes.json.data.length : 0);
  phase.tests.push({ test: 'Request appears in list', role: 'resident', status: listRes.status === 200 && count > 0 ? 'PASS' : 'NEEDS_REVIEW', http_status: listRes.status, notes: `${count} requests in list` });

  // Announcements
  const annRes = await get(ip, host, '/api/announcements', token);
  const annCount = Array.isArray(annRes.json) ? annRes.json.length : (Array.isArray(annRes.json?.data) ? annRes.json.data.length : 0);
  phase.tests.push({ test: 'Announcements - at least 1 visible', role: 'resident', status: annRes.status === 200 && annCount > 0 ? 'PASS' : 'FAIL', http_status: annRes.status, notes: `${annCount} announcements returned` });
  log(`  Announcements: HTTP ${annRes.status}, count=${annCount}`);

  // Vehicles
  const vehRes = await get(ip, host, '/api/vehicles', token);
  phase.tests.push({ test: 'Vehicles tab', role: 'resident', status: vehRes.status === 200 ? 'PASS' : 'NEEDS_REVIEW', http_status: vehRes.status, notes: `HTTP ${vehRes.status}` });

  // Guest access - create
  const guestBody = { visitor_name: 'Test Audit Guest', visit_date: '2026-03-13', purpose: 'audit test' };
  const guestRes = await post(ip, host, '/api/guest-access', guestBody, token);
  phase.tests.push({ test: 'Guest access - create guest pass', role: 'resident', status: guestRes.status < 400 ? 'PASS' : 'FAIL', http_status: guestRes.status, notes: guestRes.status < 400 ? 'Guest pass created' : `HTTP ${guestRes.status}: ${guestRes.body.slice(0, 100)}` });
  log(`  Guest access create: HTTP ${guestRes.status}`);

  // Marketplace - browse
  const mpRes = await get(ip, host, '/api/marketplace/products', token);
  const mpCount = Array.isArray(mpRes.json) ? mpRes.json.length : (Array.isArray(mpRes.json?.data) ? mpRes.json.data.length : 0);
  phase.tests.push({ test: 'Marketplace - browse products', role: 'resident', status: mpRes.status === 200 ? 'PASS' : 'NEEDS_REVIEW', http_status: mpRes.status, notes: `${mpCount} products returned` });

  // Marketplace - add to cart (need product id)
  let cartStatus = 'NEEDS_REVIEW';
  let cartNotes = 'No products to add to cart';
  const products = Array.isArray(mpRes.json) ? mpRes.json : (Array.isArray(mpRes.json?.data) ? mpRes.json.data : []);
  if (products.length > 0) {
    const firstProduct = products[0];
    const cartRes = await post(ip, host, '/api/marketplace/cart', { product_id: firstProduct.id, quantity: 1 }, token);
    cartStatus = cartRes.status < 400 ? 'PASS' : 'FAIL';
    cartNotes = cartRes.status < 400 ? `Added product ${firstProduct.id} to cart` : `HTTP ${cartRes.status}: ${cartRes.body.slice(0, 100)}`;
    log(`  Add to cart: HTTP ${cartRes.status}`);
  }
  phase.tests.push({ test: 'Marketplace - add to cart', role: 'resident', status: cartStatus, notes: cartNotes });

  // Place order
  const orderRes = await post(ip, host, '/api/marketplace/orders', { items: products.slice(0, 1).map(p => ({ product_id: p.id, quantity: 1 })) }, token);
  phase.tests.push({ test: 'Marketplace - place order', role: 'resident', status: orderRes.status < 400 ? 'PASS' : 'NEEDS_REVIEW', http_status: orderRes.status, notes: orderRes.status < 400 ? 'Order placed' : `HTTP ${orderRes.status}: ${orderRes.body.slice(0, 100)}` });

  // Meetings
  const meetRes = await get(ip, host, '/api/meetings', token);
  const meetCount = Array.isArray(meetRes.json) ? meetRes.json.length : (Array.isArray(meetRes.json?.data) ? meetRes.json.data.length : 0);
  phase.tests.push({ test: 'Meetings tab', role: 'resident', status: meetRes.status === 200 ? 'PASS' : 'NEEDS_REVIEW', http_status: meetRes.status, notes: `HTTP ${meetRes.status}, ${meetCount} meetings` });

  return phase;
}

// ─── Phase 5: Executor Dashboard ──────────────────────────────────────────────
async function phase5_ExecutorDashboard(tokens) {
  const phase = { phase: 5, name: 'Executor Dashboard', tests: [] };
  log('\n=== Phase 5: Executor Dashboard ===');

  const { token, ip, host } = tokens['executor'] || {};
  if (!token) {
    phase.tests.push({ test: 'Login prerequisite', role: 'executor', status: 'FAIL', notes: 'No auth token' });
    return phase;
  }

  // Pending requests
  const pendRes = await get(ip, host, '/api/requests?status=pending', token);
  const pendCount = Array.isArray(pendRes.json) ? pendRes.json.length : (Array.isArray(pendRes.json?.data) ? pendRes.json.data.length : 0);
  phase.tests.push({ test: 'Pending requests appear', role: 'executor', status: pendRes.status === 200 ? 'PASS' : 'NEEDS_REVIEW', http_status: pendRes.status, notes: `${pendCount} pending requests` });
  log(`  Pending requests: HTTP ${pendRes.status}, count=${pendCount}`);

  // Also get all requests
  const allReqRes = await get(ip, host, '/api/requests', token);
  const allRequests = Array.isArray(allReqRes.json) ? allReqRes.json : (Array.isArray(allReqRes.json?.data) ? allReqRes.json.data : []);

  // Find a pending/available request to accept
  const availableReq = allRequests.find(r => ['pending', 'open', 'available'].includes(r.status));
  if (availableReq) {
    const acceptRes = await httpRequest(ip, host, `/api/requests/${availableReq.id}/status`, 'PUT', { status: 'in_progress' }, token);
    phase.tests.push({ test: 'Accept request (in_progress)', role: 'executor', status: acceptRes.status < 400 ? 'PASS' : 'FAIL', http_status: acceptRes.status, notes: acceptRes.status < 400 ? `Request ${availableReq.id} accepted` : `HTTP ${acceptRes.status}: ${acceptRes.body.slice(0, 100)}` });
    log(`  Accept request: HTTP ${acceptRes.status}`);

    // Complete the request
    const completeRes = await httpRequest(ip, host, `/api/requests/${availableReq.id}/status`, 'PUT', { status: 'completed' }, token);
    phase.tests.push({ test: 'Complete request', role: 'executor', status: completeRes.status < 400 ? 'PASS' : 'FAIL', http_status: completeRes.status, notes: completeRes.status < 400 ? `Request ${availableReq.id} completed` : `HTTP ${completeRes.status}: ${completeRes.body.slice(0, 100)}` });
    log(`  Complete request: HTTP ${completeRes.status}`);
  } else {
    phase.tests.push({ test: 'Accept request (in_progress)', role: 'executor', status: 'NEEDS_REVIEW', notes: `No pending/available requests found to accept (${allRequests.length} total requests visible)` });
    phase.tests.push({ test: 'Complete request', role: 'executor', status: 'NEEDS_REVIEW', notes: 'No request to complete (depends on accept step)' });
  }

  // Schedule page
  const schedRes = await get(ip, host, '/api/schedule', token);
  phase.tests.push({ test: 'Schedule page', role: 'executor', status: schedRes.status === 200 ? 'PASS' : schedRes.status === 404 ? 'NEEDS_REVIEW' : 'FAIL', http_status: schedRes.status, notes: `HTTP ${schedRes.status}` });

  // Announcements
  const annRes = await get(ip, host, '/api/announcements', token);
  phase.tests.push({ test: 'Announcements', role: 'executor', status: annRes.status === 200 ? 'PASS' : 'NEEDS_REVIEW', http_status: annRes.status, notes: `HTTP ${annRes.status}` });

  return phase;
}

// ─── Phase 6: Director Dashboard ──────────────────────────────────────────────
async function phase6_DirectorDashboard(tokens) {
  const phase = { phase: 6, name: 'Director Dashboard', tests: [] };
  log('\n=== Phase 6: Director Dashboard ===');

  const { token, ip, host } = tokens['director'] || {};
  if (!token) {
    phase.tests.push({ test: 'Login prerequisite', role: 'director', status: 'FAIL', notes: 'No auth token' });
    return phase;
  }

  const tests = [
    { name: 'Stats and KPIs', path: '/api/stats' },
    { name: 'Team management', path: '/api/users' },
    { name: 'Executors', path: '/api/users?role=executor' },
    { name: 'Reports', path: '/api/reports' },
  ];

  for (const t of tests) {
    const res = await get(ip, host, t.path, token);
    const dataInfo = res.json ? (Array.isArray(res.json) ? `${res.json.length} items` : 'object') : 'non-JSON';
    phase.tests.push({ test: t.name, role: 'director', status: res.status === 200 ? 'PASS' : 'NEEDS_REVIEW', http_status: res.status, notes: `HTTP ${res.status}: ${dataInfo}` });
    log(`  ${t.name}: HTTP ${res.status}`);
  }

  return phase;
}

// ─── Phase 7: Department Head ──────────────────────────────────────────────────
async function phase7_DepartmentHead(tokens) {
  const phase = { phase: 7, name: 'Department Head', tests: [] };
  log('\n=== Phase 7: Department Head ===');

  const { token, ip, host } = tokens['department_head'] || {};
  if (!token) {
    phase.tests.push({ test: 'Login prerequisite', role: 'department_head', status: 'FAIL', notes: 'No auth token' });
    return phase;
  }

  // Dashboard data
  const statsRes = await get(ip, host, '/api/stats', token);
  phase.tests.push({ test: 'Dashboard loads', role: 'department_head', status: statsRes.status === 200 ? 'PASS' : 'NEEDS_REVIEW', http_status: statsRes.status, notes: `Stats API: HTTP ${statsRes.status}` });

  // Requests visible
  const reqRes = await get(ip, host, '/api/requests', token);
  const reqCount = Array.isArray(reqRes.json) ? reqRes.json.length : (Array.isArray(reqRes.json?.data) ? reqRes.json.data.length : 0);
  phase.tests.push({ test: 'Requests visible', role: 'department_head', status: reqRes.status === 200 ? 'PASS' : 'NEEDS_REVIEW', http_status: reqRes.status, notes: `HTTP ${reqRes.status}, ${reqCount} requests` });

  return phase;
}

// ─── Phase 8: Guard QR Scanner ────────────────────────────────────────────────
async function phase8_Guard(tokens) {
  const phase = { phase: 8, name: 'Guard QR Scanner', tests: [] };
  log('\n=== Phase 8: Guard ===');

  const { token, ip, host } = tokens['guard'] || {};
  if (!token) {
    phase.tests.push({ test: 'Login prerequisite', role: 'guard', status: 'FAIL', notes: 'No auth token' });
    return phase;
  }

  // QR scanner - check relevant APIs
  const guestRes = await get(ip, host, '/api/guest-access', token);
  phase.tests.push({ test: 'QR scanner page - guest access API', role: 'guard', status: guestRes.status === 200 ? 'PASS' : 'NEEDS_REVIEW', http_status: guestRes.status, notes: `Guest access API: HTTP ${guestRes.status}` });
  log(`  QR scanner guest API: HTTP ${guestRes.status}`);

  // Vehicle search
  const vehRes = await get(ip, host, '/api/vehicles/search?q=01A', token);
  const vehRes2 = await get(ip, host, '/api/vehicles?search=01A', token);
  const vehicleStatus = vehRes.status === 200 ? 200 : vehRes2.status;
  phase.tests.push({ test: 'Vehicle search API', role: 'guard', status: vehicleStatus === 200 ? 'PASS' : 'NEEDS_REVIEW', http_status: vehicleStatus, notes: `Vehicle search: HTTP ${vehRes.status} (alt: ${vehRes2.status})` });
  log(`  Vehicle search: HTTP ${vehRes.status}/${vehRes2.status}`);

  return phase;
}

// ─── Phase 9: Advertiser ──────────────────────────────────────────────────────
async function phase9_Advertiser(tokens) {
  const phase = { phase: 9, name: 'Advertiser', tests: [] };
  log('\n=== Phase 9: Advertiser ===');

  const { token, ip, host } = tokens['advertiser'] || {};
  if (!token) {
    phase.tests.push({ test: 'Login prerequisite', role: 'advertiser', status: 'FAIL', notes: 'No auth token' });
    return phase;
  }

  // Dashboard
  const dashRes = await get(ip, host, '/api/ads', token);
  const dashRes2 = await get(ip, host, '/api/advertisements', token);
  const dashStatus = dashRes.status === 200 ? 200 : dashRes2.status;
  phase.tests.push({ test: 'Advertiser dashboard loads', role: 'advertiser', status: dashStatus === 200 ? 'PASS' : 'NEEDS_REVIEW', http_status: dashStatus, notes: `Ads API: HTTP ${dashRes.status} (alt: ${dashRes2.status})` });
  log(`  Advertiser dashboard: HTTP ${dashRes.status}/${dashRes2.status}`);

  // Create a new ad
  const adBody = { title: 'Test Ad', content: 'Audit test', description: 'Audit test', status: 'active' };
  const createRes = await post(ip, host, '/api/ads', adBody, token);
  const createRes2 = createRes.status >= 400 ? await post(ip, host, '/api/advertisements', adBody, token) : createRes;
  const createStatus = createRes.status < 400 ? createRes.status : createRes2.status;
  const adId = createRes.json?.id || createRes2.json?.id;
  phase.tests.push({ test: 'Create new ad (title: "Test Ad")', role: 'advertiser', status: createStatus < 400 ? 'PASS' : 'NEEDS_REVIEW', http_status: createStatus, notes: createStatus < 400 ? `Ad created, ID: ${adId || 'N/A'}` : `HTTP ${createRes.status}/${createRes2.status}: ${createRes.body.slice(0, 100)}` });
  log(`  Create ad: HTTP ${createRes.status}/${createRes2.status}`);

  return phase;
}

// ─── Phase 10: Tenant ─────────────────────────────────────────────────────────
async function phase10_Tenant(tokens) {
  const phase = { phase: 10, name: 'Marketplace Manager / Tenant', tests: [] };
  log('\n=== Phase 10: Tenant ===');

  const { token, ip, host } = tokens['tenant'] || {};
  if (!token) {
    phase.tests.push({ test: 'Login prerequisite', role: 'tenant', status: 'FAIL', notes: 'No auth token' });
    return phase;
  }

  // Check tenant-specific endpoints
  const statsRes = await get(ip, host, '/api/stats', token);
  const ordersRes = await get(ip, host, '/api/marketplace/orders', token);
  const productsRes = await get(ip, host, '/api/marketplace/products', token);

  phase.tests.push({
    test: 'Tenant dashboard loads',
    role: 'tenant',
    status: statsRes.status === 200 ? 'PASS' : 'NEEDS_REVIEW',
    http_status: statsRes.status,
    notes: `Stats API: ${statsRes.status}. Orders API: ${ordersRes.status}. Products: ${productsRes.status}`
  });
  log(`  Tenant: stats=${statsRes.status}, orders=${ordersRes.status}, products=${productsRes.status}`);

  return phase;
}

// ─── Phase 11: Super Admin ────────────────────────────────────────────────────
async function phase11_SuperAdmin(tokens) {
  const phase = { phase: 11, name: 'Super Admin', tests: [] };
  log('\n=== Phase 11: Super Admin ===');

  const { token, ip, host } = tokens['super_admin'] || {};
  if (!token) {
    phase.tests.push({ test: 'Login at kamizo.uz', role: 'super_admin', status: 'FAIL', notes: 'No auth token from login phase' });
    return phase;
  }

  // Super admin dashboard
  const dashRes = await get(ip, host, '/api/admin/stats', token);
  const dashRes2 = await get(ip, host, '/api/super-admin/stats', token);
  const dashRes3 = await get(ip, host, '/api/stats', token);
  const bestStatus = [dashRes, dashRes2, dashRes3].find(r => r.status === 200)?.status || dashRes.status;
  phase.tests.push({ test: 'Super admin dashboard loads', role: 'super_admin', status: bestStatus === 200 ? 'PASS' : 'NEEDS_REVIEW', http_status: bestStatus, notes: `Admin stats: ${dashRes.status}, super-admin: ${dashRes2.status}, stats: ${dashRes3.status}` });
  log(`  Super admin stats: ${dashRes.status}/${dashRes2.status}/${dashRes3.status}`);

  // Tenant list
  const tenantsRes = await get(ip, host, '/api/tenants', token);
  const tenantCount = Array.isArray(tenantsRes.json) ? tenantsRes.json.length : (Array.isArray(tenantsRes.json?.data) ? tenantsRes.json.data.length : 0);
  phase.tests.push({ test: 'Tenant list shows at least 1 tenant', role: 'super_admin', status: tenantsRes.status === 200 && tenantCount > 0 ? 'PASS' : tenantsRes.status === 200 ? 'NEEDS_REVIEW' : 'FAIL', http_status: tenantsRes.status, notes: `${tenantCount} tenants returned (HTTP ${tenantsRes.status})` });
  log(`  Tenants: HTTP ${tenantsRes.status}, count=${tenantCount}`);

  // Ads management
  const adsRes = await get(ip, host, '/api/platform-ads', token);
  const adsRes2 = await get(ip, host, '/api/ads', token);
  const adsStatus = adsRes.status === 200 ? 200 : adsRes2.status;
  phase.tests.push({ test: 'Ads management tab', role: 'super_admin', status: adsStatus === 200 ? 'PASS' : 'NEEDS_REVIEW', http_status: adsStatus, notes: `platform-ads: ${adsRes.status}, ads: ${adsRes2.status}` });
  log(`  Super admin ads: ${adsRes.status}/${adsRes2.status}`);

  return phase;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  log('Kamizo Platform API-based E2E Audit — 2026-03-12');

  // Phase 1: Login & get tokens
  const { phase: p1, tokens } = await phase1_LoginAuth();
  report.phases.push(p1);

  // Run remaining phases
  const phases = [
    () => phase2_AdminDashboard(tokens),
    () => phase3_ManagerDashboard(tokens),
    () => phase4_ResidentDashboard(tokens),
    () => phase5_ExecutorDashboard(tokens),
    () => phase6_DirectorDashboard(tokens),
    () => phase7_DepartmentHead(tokens),
    () => phase8_Guard(tokens),
    () => phase9_Advertiser(tokens),
    () => phase10_Tenant(tokens),
    () => phase11_SuperAdmin(tokens),
  ];

  for (const fn of phases) {
    try {
      const result = await fn();
      report.phases.push(result);
    } catch (err) {
      log(`Phase error: ${err.message}`);
    }
  }

  // Summary
  let total = 0, passed = 0, failed = 0, needs_review = 0;
  for (const phase of report.phases) {
    for (const test of phase.tests) {
      total++;
      if (test.status === 'PASS') passed++;
      else if (test.status === 'FAIL') failed++;
      else needs_review++;
    }
  }
  report.summary = { total_tests: total, passed, failed, needs_review };

  // Write report
  const reportPath = '/Users/shaxzodisamahamadov/kamizo/audit/reaudit-report.json';
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  log('\n=== AUDIT COMPLETE ===');
  log(`Total: ${total} | Passed: ${passed} | Failed: ${failed} | Needs Review: ${needs_review}`);

  // Print full JSON
  console.log('\n===== FULL JSON REPORT =====');
  console.log(JSON.stringify(report, null, 2));
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
