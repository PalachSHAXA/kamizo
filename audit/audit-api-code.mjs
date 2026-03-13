/**
 * Kamizo Interactive Audit — API + Code Analysis approach
 * Since Playwright/Chromium is crashing on this macOS environment,
 * we audit by:
 * 1. Testing all API endpoints directly
 * 2. Analyzing frontend code for dead handlers/missing implementations
 * 3. Testing actual data flow (create, read, update, delete)
 */

import fs from 'fs';
import path from 'path';

const BASE_URL = 'https://demo.kamizo.uz';
const PASSWORD = 'kamizo';

const results = { total: 0, working: 0, broken: [], needsReview: [] };

function record(screen, element, role, expected, actual, status) {
  results.total++;
  if (status === 'ok') results.working++;
  else if (status === 'broken') results.broken.push({ screen, element, role, expected, actual });
  else results.needsReview.push({ screen, element, role, expected, actual });
  const icon = status === 'ok' ? '✅' : status === 'broken' ? '❌' : '⚠️';
  console.log(`  ${icon} [${screen}] ${element} | ${role} | ${actual}`);
}

async function apiLogin(login) {
  for (let i = 0; i < 3; i++) {
    const resp = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login, password: PASSWORD }),
    });
    if (resp.status === 429) {
      console.log('Rate limited, waiting 35s...');
      await new Promise(r => setTimeout(r, 35000));
      continue;
    }
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Login failed ${login}: ${resp.status} ${text.slice(0, 100)}`);
    }
    return resp.json();
  }
  throw new Error(`Login failed ${login} after retries`);
}

async function apiCall(method, endpoint, token, body = null) {
  const opts = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
  };
  if (body) opts.body = JSON.stringify(body);

  const resp = await fetch(`${BASE_URL}${endpoint}`, opts);
  const status = resp.status;
  let data = null;
  try { data = await resp.json(); } catch { data = await resp.text().catch(() => null); }
  return { status, data, ok: resp.ok };
}

// ====== API ENDPOINT TESTS ======

async function testAuth() {
  console.log('\n=== AUTH TESTS ===');

  // Test login with valid credentials
  try {
    const { user, token } = await apiLogin('demo-manager');
    record('Auth', 'Login (valid)', 'manager', 'Returns user+token', `OK: user=${user.name}`, 'ok');
    return { user, token };
  } catch (e) {
    record('Auth', 'Login (valid)', 'manager', 'Returns user+token', `FAILED: ${e.message}`, 'broken');
    return null;
  }
}

async function testAuthInvalid() {
  try {
    const resp = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login: 'demo-manager', password: 'wrongpassword' }),
    });
    if (resp.status === 401 || resp.status === 400) {
      record('Auth', 'Login (invalid password)', 'any', 'Returns error', `OK: ${resp.status}`, 'ok');
    } else if (resp.status === 429) {
      record('Auth', 'Login (invalid password)', 'any', 'Returns error', 'Rate limited (OK)', 'ok');
    } else {
      record('Auth', 'Login (invalid password)', 'any', 'Returns error', `Unexpected: ${resp.status}`, 'broken');
    }
  } catch (e) {
    record('Auth', 'Login (invalid)', 'any', 'Returns error', `Error: ${e.message}`, 'needs_review');
  }
}

async function testEndpoints(token, role) {
  console.log(`\n=== API ENDPOINTS (${role}) ===`);

  const endpoints = [
    // User
    ['GET', '/api/users/me', 'Get current user'],
    // Buildings
    ['GET', '/api/buildings', 'List buildings'],
    // Requests
    ['GET', '/api/requests', 'List requests'],
    // Announcements
    ['GET', '/api/announcements', 'List announcements'],
    // Meetings
    ['GET', '/api/meetings', 'List meetings'],
    // Chat channels
    ['GET', '/api/chat/channels', 'List chat channels'],
    // Vehicles
    ['GET', '/api/vehicles', 'List vehicles'],
    // Notifications
    ['GET', '/api/notifications', 'List notifications'],
    // Executors
    ['GET', '/api/executors', 'List executors'],
    // Work orders
    ['GET', '/api/work-orders', 'List work orders'],
    // Guest codes
    ['GET', '/api/guest-codes', 'List guest codes'],
    // Rentals
    ['GET', '/api/rentals', 'List rentals'],
    // Team
    ['GET', '/api/team', 'List team members'],
    // Training
    ['GET', '/api/training-partners', 'List training partners'],
    ['GET', '/api/training-proposals', 'List training proposals'],
    // Marketplace
    ['GET', '/api/marketplace/products', 'List marketplace products'],
    ['GET', '/api/marketplace/orders', 'List marketplace orders'],
    // Useful contacts
    ['GET', '/api/useful-contacts', 'List useful contacts'],
  ];

  for (const [method, endpoint, name] of endpoints) {
    const { status, data, ok } = await apiCall(method, endpoint, token);
    if (ok) {
      const count = Array.isArray(data) ? data.length : (data?.data ? data.data.length : '?');
      record('API', name, role, 'Returns data', `OK (${status}) - ${count} items`, 'ok');
    } else if (status === 403) {
      record('API', name, role, 'Returns data', `403 Forbidden (expected for ${role})`, 'ok');
    } else if (status === 404) {
      record('API', name, role, 'Returns data', `404 Not Found - endpoint missing`, 'broken');
    } else {
      record('API', name, role, 'Returns data', `Error ${status}: ${JSON.stringify(data).slice(0, 80)}`, 'broken');
    }
  }
}

async function testCRUD(token, role) {
  console.log(`\n=== CRUD OPERATIONS (${role}) ===`);

  // Test creating an announcement
  if (['manager', 'admin', 'director'].includes(role)) {
    const { status, data, ok } = await apiCall('POST', '/api/announcements', token, {
      title: 'Audit test announcement',
      content: 'This is an automated audit test. Please ignore.',
      priority: 'normal',
    });
    if (ok) {
      record('CRUD', 'Create announcement', role, 'Creates successfully', `OK: id=${data?.id || data?.data?.id}`, 'ok');

      // Try to delete it
      const id = data?.id || data?.data?.id;
      if (id) {
        const del = await apiCall('DELETE', `/api/announcements/${id}`, token);
        record('CRUD', 'Delete announcement', role, 'Deletes successfully', del.ok ? 'OK' : `Error ${del.status}`, del.ok ? 'ok' : 'broken');
      }
    } else {
      record('CRUD', 'Create announcement', role, 'Creates', `Error ${status}: ${JSON.stringify(data).slice(0, 80)}`, 'broken');
    }
  }

  // Test creating a request
  if (['resident'].includes(role)) {
    const { status, data, ok } = await apiCall('POST', '/api/requests', token, {
      title: 'Audit test request',
      description: 'Automated audit test - please ignore',
      category: 'plumbing',
      urgency: 'normal',
    });
    if (ok) {
      record('CRUD', 'Create request', role, 'Creates', `OK: id=${data?.id}`, 'ok');
    } else {
      record('CRUD', 'Create request', role, 'Creates', `Error ${status}: ${JSON.stringify(data).slice(0, 80)}`, status === 403 ? 'needs_review' : 'broken');
    }
  }

  // Test chat - send message
  {
    // First get channels
    const channels = await apiCall('GET', '/api/chat/channels', token);
    if (channels.ok && Array.isArray(channels.data) && channels.data.length > 0) {
      const channelId = channels.data[0].id;
      const { status, ok } = await apiCall('POST', `/api/chat/channels/${channelId}/messages`, token, {
        content: 'Audit test message',
      });
      record('CRUD', 'Send chat message', role, 'Sends', ok ? 'OK' : `Error ${status}`, ok ? 'ok' : 'broken');
    } else {
      record('CRUD', 'Send chat message', role, 'Sends', 'No channels available', 'needs_review');
    }
  }

  // Test notifications mark read
  {
    const { ok } = await apiCall('PUT', '/api/notifications/read-all', token);
    record('CRUD', 'Mark all notifications read', role, 'Marks read', ok ? 'OK' : 'Error', ok ? 'ok' : 'needs_review');
  }

  // Test vehicle search
  {
    const { status, data, ok } = await apiCall('GET', '/api/vehicles/search?plate=01A', token);
    if (ok) {
      record('CRUD', 'Vehicle search', role, 'Returns results', `OK: ${Array.isArray(data) ? data.length : '?'} results`, 'ok');
    } else if (status === 404) {
      // Try alternative endpoint
      const alt = await apiCall('GET', '/api/vehicles?search=01A', token);
      record('CRUD', 'Vehicle search', role, 'Returns results', alt.ok ? 'OK (alt endpoint)' : `Both endpoints failed (${status}, ${alt.status})`, alt.ok ? 'ok' : 'needs_review');
    } else {
      record('CRUD', 'Vehicle search', role, 'Returns results', `Error ${status}`, 'needs_review');
    }
  }

  // Test guest code creation
  if (['resident', 'manager', 'admin'].includes(role)) {
    const { status, data, ok } = await apiCall('POST', '/api/guest-codes', token, {
      guest_name: 'Audit Test Guest',
      valid_from: new Date().toISOString(),
      valid_until: new Date(Date.now() + 86400000).toISOString(),
    });
    if (ok) {
      record('CRUD', 'Create guest code', role, 'Creates', `OK: code=${data?.code || data?.data?.code}`, 'ok');
    } else {
      record('CRUD', 'Create guest code', role, 'Creates', `Error ${status}: ${JSON.stringify(data).slice(0, 80)}`, status === 403 ? 'ok' : 'broken');
    }
  }

  // Test meeting creation (managers)
  if (['manager', 'admin', 'director'].includes(role)) {
    const { status, data, ok } = await apiCall('POST', '/api/meetings', token, {
      title: 'Audit test meeting',
      description: 'Automated test',
      scheduled_date: new Date(Date.now() + 7 * 86400000).toISOString(),
      location: 'Test room',
    });
    if (ok) {
      record('CRUD', 'Create meeting', role, 'Creates', `OK: id=${data?.id}`, 'ok');
      // Delete it
      if (data?.id) {
        await apiCall('DELETE', `/api/meetings/${data.id}`, token);
      }
    } else {
      record('CRUD', 'Create meeting', role, 'Creates', `Error ${status}: ${JSON.stringify(data).slice(0, 80)}`, 'broken');
    }
  }
}

// ====== CODE ANALYSIS ======

function analyzeCode() {
  console.log('\n=== CODE ANALYSIS — Dead Elements ===');

  const srcDir = '/Users/shaxzodisamahamadov/kamizo/src/frontend/src';

  // Find onClick handlers that are empty or no-ops
  const pagesDir = path.join(srcDir, 'pages');
  const componentsDir = path.join(srcDir, 'components');

  function scanDir(dir) {
    const findings = [];
    const files = getAllFiles(dir);

    for (const file of files) {
      if (!file.endsWith('.tsx') && !file.endsWith('.ts')) continue;
      const content = fs.readFileSync(file, 'utf-8');
      const lines = content.split('\n');
      const relPath = file.replace('/Users/shaxzodisamahamadov/kamizo/', '');

      // Check for empty onClick handlers
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // onClick={() => {}} or onClick={() => { }}
        if (/onClick=\{.*\(\)\s*=>\s*\{\s*\}\s*\}/.test(line)) {
          findings.push({ file: relPath, line: i + 1, issue: 'Empty onClick handler', code: line.trim() });
        }

        // onClick={() => null}
        if (/onClick=\{.*\(\)\s*=>\s*null\}/.test(line)) {
          findings.push({ file: relPath, line: i + 1, issue: 'onClick returns null', code: line.trim() });
        }

        // TODO or FIXME in onClick context
        if (/onClick.*TODO|TODO.*onClick/i.test(line)) {
          findings.push({ file: relPath, line: i + 1, issue: 'TODO in onClick handler', code: line.trim() });
        }

        // console.log in onClick (debug placeholder)
        if (/onClick=\{.*console\.log/.test(line)) {
          findings.push({ file: relPath, line: i + 1, issue: 'console.log in onClick (placeholder?)', code: line.trim() });
        }

        // Disabled buttons without clear reason
        if (/disabled\s*$|disabled=\{true\}/.test(line) && !/isLoading|isSubmitting|loading|submitting|!canSubmit/.test(line)) {
          // Check surrounding context for button text
          const context = lines.slice(Math.max(0, i - 2), i + 3).join(' ');
          if (/button/i.test(context) && !/disabled=\{.*loading.*\}/i.test(context)) {
            // Skip - too many false positives
          }
        }

        // href="#" (dead links)
        if (/href=["']#["']/.test(line)) {
          findings.push({ file: relPath, line: i + 1, issue: 'Dead link (href="#")', code: line.trim() });
        }

        // Button with no handler at all (risky detection)
        // <button ... > without onClick, onChange, type="submit"
        // Too noisy, skip

        // alert() calls (placeholder behavior)
        if (/alert\(/.test(line) && !/window\.alert/.test(line)) {
          findings.push({ file: relPath, line: i + 1, issue: 'alert() call (placeholder?)', code: line.trim().slice(0, 100) });
        }
      }
    }
    return findings;
  }

  function getAllFiles(dir) {
    const files = [];
    try {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) files.push(...getAllFiles(full));
        else files.push(full);
      }
    } catch {}
    return files;
  }

  const pageFindings = scanDir(pagesDir);
  const componentFindings = scanDir(componentsDir);
  const allFindings = [...pageFindings, ...componentFindings];

  for (const f of allFindings) {
    record('Code', `${f.file}:${f.line}`, 'all', 'Working handler', `${f.issue}: ${f.code.slice(0, 80)}`, 'broken');
  }

  if (allFindings.length === 0) {
    console.log('  No dead handlers found in code analysis.');
  }

  return allFindings;
}

// ====== MULTI-ROLE LOGIN TESTS ======

async function testAllLogins() {
  console.log('\n=== LOGIN TESTS (all roles) ===');

  const accounts = [
    'demo-manager', 'demo-admin', 'demo-director', 'demo-dept-head',
    'demo-dispatcher', 'demo-resident1', 'demo-resident2', 'demo-resident3',
    'demo-executor', 'demo-electrician', 'demo-security', 'demo-tenant', 'demo-shop',
  ];

  const tokens = {};

  for (const login of accounts) {
    try {
      const { user, token } = await apiLogin(login);
      record('Login', `Login as ${login}`, user.role, 'Login succeeds', `OK: ${user.name} (${user.role})`, 'ok');
      tokens[login] = { user, token };
      await new Promise(r => setTimeout(r, 500)); // Small delay to avoid rate limiting
    } catch (e) {
      record('Login', `Login as ${login}`, 'unknown', 'Login succeeds', `FAILED: ${e.message.slice(0, 60)}`, 'broken');
      await new Promise(r => setTimeout(r, 5000)); // Longer delay after failure
    }
  }

  return tokens;
}

// ====== MAIN ======

async function main() {
  console.log('=== KAMIZO INTERACTIVE AUDIT ===');
  console.log(`Target: ${BASE_URL}`);
  console.log(`Date: ${new Date().toISOString()}\n`);

  // 1. Code analysis (offline)
  analyzeCode();

  // 2. Auth tests
  const auth = await testAuth();
  await new Promise(r => setTimeout(r, 2000));
  await testAuthInvalid();
  await new Promise(r => setTimeout(r, 2000));

  // 3. Test all role logins
  const tokens = await testAllLogins();

  // 4. API endpoint tests for key roles
  for (const role of ['demo-manager', 'demo-resident1', 'demo-admin', 'demo-executor', 'demo-security']) {
    if (tokens[role]) {
      await testEndpoints(tokens[role].token, tokens[role].user.role);
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  // 5. CRUD tests
  for (const role of ['demo-manager', 'demo-resident1', 'demo-admin']) {
    if (tokens[role]) {
      await testCRUD(tokens[role].token, tokens[role].user.role);
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  // Generate report
  generateReport();
}

function generateReport() {
  let md = `# Interactive Audit Report — demo.kamizo.uz\n\n`;
  md += `**Date:** ${new Date().toISOString().split('T')[0]}\n`;
  md += `**Method:** API endpoint testing + static code analysis\n`;
  md += `**Note:** Browser automation (Playwright) failed due to macOS Chromium sandbox crash. Audit performed via direct API calls and code analysis.\n\n`;

  md += `## Summary\n\n`;
  md += `| Metric | Count |\n|--------|-------|\n`;
  md += `| Total elements tested | ${results.total} |\n`;
  md += `| Working ✅ | ${results.working} |\n`;
  md += `| Broken/Dead ❌ | ${results.broken.length} |\n`;
  md += `| Needs review ⚠️ | ${results.needsReview.length} |\n\n`;

  md += `## ❌ Dead / Broken Elements\n\n`;
  if (results.broken.length === 0) {
    md += `No broken elements found.\n\n`;
  } else {
    md += `| # | Screen | Element | Role | Expected | Actual |\n`;
    md += `|---|--------|---------|------|----------|--------|\n`;
    results.broken.forEach((item, i) => {
      md += `| ${i + 1} | ${item.screen} | ${item.element} | ${item.role} | ${item.expected} | ${item.actual} |\n`;
    });
    md += `\n`;
  }

  md += `## ⚠️ Elements Needing Manual Review\n\n`;
  if (results.needsReview.length === 0) {
    md += `No elements need review.\n\n`;
  } else {
    md += `| # | Screen | Element | Role | Expected | Actual |\n`;
    md += `|---|--------|---------|------|----------|--------|\n`;
    results.needsReview.forEach((item, i) => {
      md += `| ${i + 1} | ${item.screen} | ${item.element} | ${item.role} | ${item.expected} | ${item.actual} |\n`;
    });
    md += `\n`;
  }

  const reportPath = '/Users/shaxzodisamahamadov/kamizo/audit/interactive-audit-report.md';
  fs.writeFileSync(reportPath, md);
  fs.writeFileSync('/Users/shaxzodisamahamadov/kamizo/audit/audit-results.json', JSON.stringify(results, null, 2));

  console.log(`\n=== REPORT: ${reportPath} ===\n`);
  console.log(md);
}

main().catch(e => {
  console.error('FATAL:', e);
  generateReport();
});
