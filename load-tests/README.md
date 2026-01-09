# 🚀 UK CRM Load Testing Suite

Comprehensive load testing для UK CRM с использованием k6.

---

## 📋 Prerequisites

### Install k6

**macOS:**
```bash
brew install k6
```

**Linux:**
```bash
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update
sudo apt-get install k6
```

**Windows:**
```powershell
choco install k6
```

---

## 🎯 Test Scenarios

### 1. API Load Test (`api-load-test.js`)

**Цель:** Тестирование HTTP API endpoints под нагрузкой

**Сценарий:**
- 0 → 5000 пользователей за 17 минут
- Sustained peak: 5000 пользователей на 2 минуты
- Mixed workload: authentication, reads, writes

**Metrics:**
- Login success rate
- GET request latency
- POST request latency
- Error rates

**Run:**
```bash
k6 run api-load-test.js
```

**Custom target:**
```bash
BASE_URL=https://your-deployment.workers.dev k6 run api-load-test.js
```

**Expected Results:**
- P95 response time < 500ms
- P99 response time < 1000ms
- Error rate < 1%
- Login success rate > 95%

---

### 2. WebSocket Load Test (`websocket-load-test.js`)

**Цель:** Тестирование WebSocket + Durable Objects scalability

**Сценарий:**
- 0 → 5000 concurrent WebSocket connections
- Sustained: 5000 connections for 5 minutes
- Heartbeat: Every 30 seconds
- Connection lifetime: 60-180 seconds (random)

**Metrics:**
- WebSocket connection success rate
- Message latency
- Active connections count
- Error count

**Run:**
```bash
k6 run websocket-load-test.js
```

**Expected Results:**
- Connection success rate > 98%
- P95 message latency < 200ms
- P99 message latency < 500ms
- Total errors < 100

---

### 3. Stress Test (`stress-test.js`)

**Цель:** Stress testing с burst loads и bulk operations

**Сценарии:**
1. **Request Creation Burst:** 1000 req/s for 30s
2. **Sustained Writes:** 0 → 1000 VUs over 7 mins
3. **Cache Stress:** 500 VUs for 5 mins (read-heavy)

**Metrics:**
- Bulk create latency
- DB write latency
- Cache invalidations
- Error rates under stress

**Run:**
```bash
k6 run stress-test.js
```

**⚠️  Warning:** This generates HEAVY load!

**Expected Results:**
- P95 response time < 2000ms (acceptable under stress)
- Error rate < 5% (acceptable under stress)
- P99 DB write latency < 5000ms

---

## 📊 Running Tests

### Quick Start

```bash
# 1. Navigate to load-tests directory
cd load-tests

# 2. Run API load test
k6 run api-load-test.js

# 3. Run WebSocket test (in separate terminal)
k6 run websocket-load-test.js

# 4. Run stress test (caution!)
k6 run stress-test.js
```

### Custom Configuration

**Change target URL:**
```bash
BASE_URL=https://your-domain.com k6 run api-load-test.js
```

**Adjust load levels:**
Edit the `options.stages` in each test file.

**Example:**
```javascript
export const options = {
  stages: [
    { duration: '1m', target: 100 },   // Lower target
    { duration: '2m', target: 500 },   // Moderate load
    { duration: '1m', target: 0 },     // Ramp down
  ],
};
```

---

## 📈 Monitoring During Tests

### 1. Watch Cloudflare Dashboard

- Workers → Analytics
- Check request rate, errors, CPU time
- Monitor Durable Objects usage

### 2. Monitor API Metrics

```bash
# In separate terminal, watch health endpoint
watch -n 5 'curl -s https://uk-crm.shaxzod.workers.dev/api/health | jq .'
```

### 3. Admin Monitoring Dashboard

Open in browser:
```
https://uk-crm.shaxzod.workers.dev/monitoring
```

Login as admin to see:
- Real-time performance metrics
- Error rates
- Endpoint statistics
- Recent errors

### 4. k6 Cloud (Optional)

For detailed analytics, use k6 Cloud:

```bash
k6 cloud api-load-test.js
```

---

## 🎯 Interpreting Results

### Good Results

```
✓ http_req_duration..............: avg=245ms  min=45ms   med=180ms  max=2.1s   p(90)=380ms  p(95)=450ms
✓ http_req_failed................: 0.23%   ✓ 127    ✗ 54673
✓ http_reqs......................: 54800   915.1/s
✓ vus............................: 5000    min=0       max=5000
✓ vus_max........................: 5000    min=5000    max=5000
```

**Indicators:**
- ✅ P95 < 500ms
- ✅ Error rate < 1%
- ✅ High throughput (>500 req/s)

### Warning Signs

```
✗ http_req_duration..............: avg=1.8s   p(95)=3.2s   p(99)=8.5s
✗ http_req_failed................: 5.4%   ✓ 3421   ✗ 59579
```

**Indicators:**
- ⚠️  P95 > 1s (slow)
- ⚠️  Error rate > 2% (many failures)
- ⚠️  Many timeouts

**Actions:**
1. Check `/api/admin/metrics/errors` for error details
2. Review bottlenecks in monitoring dashboard
3. Check Cloudflare logs for 500 errors
4. Consider optimizations (indexes, caching, rate limits)

---

## 🔧 Troubleshooting

### Issue: Too many errors (>10%)

**Possible causes:**
- Rate limiting triggered (check X-RateLimit headers)
- Database connection issues
- Worker CPU time exceeded

**Solutions:**
1. Reduce VU count in test
2. Check rate limits in `/api/admin/metrics`
3. Review D1 database status

### Issue: WebSocket connections failing

**Possible causes:**
- Durable Objects limit reached
- Connection timeout
- Authentication issues

**Solutions:**
1. Check Durable Objects dashboard
2. Verify auth tokens are valid
3. Increase connection timeout in test

### Issue: High latency (P95 > 2s)

**Possible causes:**
- Database queries not optimized
- Cache misses
- High concurrent writes

**Solutions:**
1. Check `/api/admin/metrics/performance` for slow endpoints
2. Verify cache hit rates
3. Add database indexes
4. Optimize slow queries

---

## 📝 Test Data Setup

### Create Test Users

Before running tests, ensure test users exist:

```sql
-- In D1 database (via Cloudflare dashboard or wrangler)

-- Manager user
INSERT INTO users (id, login, password, name, role, is_active)
VALUES (
  'test-manager-1',
  'manager1',
  'HASHED_PASSWORD',  -- Use your password hashing
  'Test Manager',
  'manager',
  1
);

-- Executor user
INSERT INTO users (id, login, password, name, role, is_active)
VALUES (
  'test-executor-1',
  'executor1',
  'HASHED_PASSWORD',
  'Test Executor',
  'executor',
  1
);

-- Resident user
INSERT INTO users (id, login, password, name, role, is_active)
VALUES (
  'test-resident-1',
  'resident1',
  'HASHED_PASSWORD',
  'Test Resident',
  'resident',
  1
);
```

Or use the existing admin account.

---

## 🎯 Performance Targets

### Production Targets (5000 users)

| Metric | Target | Acceptable | Poor |
|--------|--------|------------|------|
| **P95 Response Time** | < 300ms | < 500ms | > 1s |
| **P99 Response Time** | < 500ms | < 1s | > 2s |
| **Error Rate** | < 0.5% | < 1% | > 2% |
| **Throughput** | > 1000 req/s | > 500 req/s | < 200 req/s |
| **WebSocket Success** | > 99% | > 98% | < 95% |

### Current System Capacity

Based on optimizations:
- ✅ **D1 Database:** 8.6K reads/day (after WebSocket optimization)
- ✅ **Cache Hit Rate:** ~95% (static data)
- ✅ **WebSocket:** 5000+ concurrent connections (Durable Objects)
- ✅ **Workers:** Autoscaling (no limit)

---

## 📚 Best Practices

### 1. Gradual Load Increase

Always ramp up gradually:
```javascript
stages: [
  { duration: '2m', target: 100 },   // Warm-up
  { duration: '3m', target: 500 },   // Gradual
  { duration: '2m', target: 1000 },  // Target load
]
```

### 2. Monitor During Tests

- Keep monitoring dashboard open
- Watch for errors in real-time
- Stop test if error rate > 10%

### 3. Clean Up After Tests

```bash
# Clear test data from database
# Clear metrics
curl -X POST https://uk-crm.shaxzod.workers.dev/api/admin/metrics/clear \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

### 4. Test in Stages

1. ✅ Smoke test (10 users, 1 min)
2. ✅ Load test (1000 users, 5 min)
3. ✅ Stress test (5000 users, 10 min)
4. ✅ Soak test (1000 users, 1 hour)

---

## 🚀 Next Steps After Load Testing

1. **Analyze Results:**
   - Review metrics in monitoring dashboard
   - Identify bottlenecks
   - Document findings

2. **Optimize:**
   - Add indexes for slow queries
   - Increase cache TTL if appropriate
   - Optimize expensive operations

3. **Re-test:**
   - Run tests again after optimizations
   - Verify improvements

4. **Production Readiness:**
   - Document performance baselines
   - Set up alerts for degradation
   - Create runbook for incidents

---

## ✅ Checklist

Before running load tests:
- [ ] k6 installed
- [ ] Test users created
- [ ] Monitoring dashboard accessible
- [ ] Cloudflare dashboard open
- [ ] Test data cleanup plan ready

During load tests:
- [ ] Monitor error rates
- [ ] Watch response times
- [ ] Check WebSocket connections
- [ ] Review logs for issues

After load tests:
- [ ] Analyze results
- [ ] Document bottlenecks
- [ ] Create optimization tickets
- [ ] Clean up test data
- [ ] Update performance baselines

---

**Happy Load Testing!** 🚀
