---
name: kamizo-security
description: "Security auditor for Kamizo. Checks JWT handling, XSS prevention, CORS, input validation, auth bypass. Trigger on: безопасность, security, XSS, JWT, auth, уязвимость, vulnerability, token, CORS. Use before any production deploy."
---

# Kamizo Security Guard

Check every change for security vulnerabilities before deploy.

## Known Vulnerabilities (from audit)
1. JWT stored in localStorage — XSS can steal tokens (P1)
2. CORS * on 2 endpoints in index.ts (P2)
3. 401 handler race condition — module-level flag in client.ts (P2)
4. No Content-Security-Policy headers (P2)
5. QR validation client-only — can forge QR codes (P1)
6. Ratings in localStorage — can be manipulated (P2)

## Checklist for every PR
- [ ] No secrets/tokens in source code
- [ ] API endpoints validate input (Zod schemas)
- [ ] Auth middleware on all sensitive endpoints
- [ ] Multi-tenant isolation (company_id filter)
- [ ] No dangerouslySetInnerHTML without sanitization
- [ ] No eval() or Function() constructor
- [ ] Rate limiting on auth/payment endpoints
- [ ] CORS configured properly (not *)

## Quick audit command
grep -rn "dangerouslySetInnerHTML\|eval(\|innerHTML\|document.write" src/frontend/src/
grep -rn "CORS\|cors\|Access-Control" cloudflare/src/
grep -rn "localStorage.setItem.*token\|localStorage.getItem.*token" src/frontend/src/
