// Password encryption, hashing, and JWT utilities
// Framework-agnostic — uses Web Crypto API (works in Workers, Node 20+, Bun, Deno)

// ── JWT (HMAC-SHA256 via Web Crypto API) ─────────────────────────────

export interface JwtPayload {
  userId: string;
  role: string;
  tenantId?: string;
}

function base64urlEncode(data: Uint8Array | string): string {
  const str = typeof data === 'string'
    ? btoa(data)
    : btoa(String.fromCharCode(...data));
  return str.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlDecode(str: string): Uint8Array {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded);
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}

async function hmacSign(data: string, secret: string): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return new Uint8Array(sig);
}

async function hmacVerify(data: string, signature: Uint8Array, secret: string): Promise<boolean> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
  );
  return crypto.subtle.verify('HMAC', key, signature, enc.encode(data));
}

export async function createJWT(payload: JwtPayload, secret: string | undefined, expiresInSec: number): Promise<string> {
  if (!secret) throw new Error('JWT_SECRET is not configured — run: wrangler secret put JWT_SECRET');
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const fullPayload = { ...payload, iat: now, exp: now + expiresInSec };

  const headerB64 = base64urlEncode(JSON.stringify(header));
  const payloadB64 = base64urlEncode(JSON.stringify(fullPayload));
  const unsigned = `${headerB64}.${payloadB64}`;

  const sig = await hmacSign(unsigned, secret);
  return `${unsigned}.${base64urlEncode(sig)}`;
}

export async function verifyJWT(token: string, secret: string | undefined): Promise<JwtPayload | null> {
  if (!secret) return null;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [headerB64, payloadB64, sigB64] = parts;
    const unsigned = `${headerB64}.${payloadB64}`;
    const signature = base64urlDecode(sigB64);

    const valid = await hmacVerify(unsigned, signature, secret);
    if (!valid) return null;

    const payloadJson = new TextDecoder().decode(base64urlDecode(payloadB64));
    const payload = JSON.parse(payloadJson);

    // Check expiry
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) return null;

    return {
      userId: payload.userId,
      role: payload.role,
      tenantId: payload.tenantId,
    };
  } catch {
    return null;
  }
}

// ── Password encryption and hashing ──────────────────────────────────

export async function encryptPassword(plainText: string, keyString: string): Promise<string> {
  if (!keyString) throw new Error('ENCRYPTION_KEY is required — set it in .dev.vars or wrangler secrets');
  const enc = new TextEncoder();
  if (new TextEncoder().encode(keyString).length < 32) throw new Error('ENCRYPTION_KEY must be at least 32 bytes');
  const keyData = enc.encode(keyString.slice(0, 32));
  const key = await crypto.subtle.importKey('raw', keyData, { name: 'AES-GCM' }, false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(plainText));
  const ivB64 = btoa(String.fromCharCode(...iv));
  const encB64 = btoa(String.fromCharCode(...new Uint8Array(encrypted)));
  return `enc:${ivB64}:${encB64}`;
}

export async function decryptPassword(stored: string | null, keyString: string): Promise<string | null> {
  if (!stored) return null;
  if (!stored.startsWith('enc:')) return stored;
  try {
    const parts = stored.split(':');
    const ivB64 = parts[1];
    const encB64 = parts[2];
    const enc = new TextEncoder();
    if (!keyString) throw new Error('ENCRYPTION_KEY is required — set it in .dev.vars or wrangler secrets');
    if (new TextEncoder().encode(keyString).length < 32) throw new Error('ENCRYPTION_KEY must be at least 32 bytes');
  const keyData = enc.encode(keyString.slice(0, 32));
    const key = await crypto.subtle.importKey('raw', keyData, { name: 'AES-GCM' }, false, ['decrypt']);
    const iv = Uint8Array.from(atob(ivB64), c => c.charCodeAt(0));
    const encrypted = Uint8Array.from(atob(encB64), c => c.charCodeAt(0));
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, encrypted);
    return new TextDecoder().decode(decrypted);
  } catch {
    return stored;
  }
}

// Workers CPU limit: 100k iterations causes timeout on free plan (~50ms CPU).
// 50,000 iterations ~25ms — safe margin for Workers. Stored in hash for auto-migration.
// Увеличить до 100,000+ при миграции на VPS/dedicated.
const PBKDF2_ITERATIONS = 50_000;

export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    'raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']
  );
  const hash = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial, 256
  );
  const saltB64 = btoa(String.fromCharCode(...salt));
  const hashB64 = btoa(String.fromCharCode(...new Uint8Array(hash)));
  return `${PBKDF2_ITERATIONS}:${saltB64}:${hashB64}`;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const encoder = new TextEncoder();

  if (!storedHash.includes(':')) {
    // Legacy SHA-256 verification
    const data = encoder.encode(password);
    const hash = await crypto.subtle.digest('SHA-256', data);
    const hashArray = new Uint8Array(hash);
    const hexHash = Array.from(hashArray).map(b => b.toString(16).padStart(2, '0')).join('');
    if (hexHash === storedHash) return true;
    const base64Hash = btoa(String.fromCharCode(...hashArray));
    return base64Hash === storedHash;
  }

  const parts = storedHash.split(':');

  // New format: "iterations:saltB64:hashB64"
  if (parts.length === 3 && /^\d+$/.test(parts[0])) {
    const iterations = parseInt(parts[0], 10);
    const saltB64 = parts[1];
    const expectedHashB64 = parts[2];
    const salt = new Uint8Array(atob(saltB64).split('').map(c => c.charCodeAt(0)));
    const keyMaterial = await crypto.subtle.importKey(
      'raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']
    );
    const hash = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
      keyMaterial, 256
    );
    const hashB64 = btoa(String.fromCharCode(...new Uint8Array(hash)));
    return hashB64 === expectedHashB64;
  }

  // Legacy format: "saltB64:hashB64" — old hashes without iteration prefix.
  // Try with common iteration counts (100k was the old default, 10k was intermediate).
  if (parts.length === 2) {
    const saltB64 = parts[0];
    const expectedHashB64 = parts[1];
    const salt = new Uint8Array(atob(saltB64).split('').map(c => c.charCodeAt(0)));
    const keyMaterial = await crypto.subtle.importKey(
      'raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']
    );
    // Try 10k iterations first (fast), then 100k
    for (const iterations of [10000, 50000, 100000]) {
      try {
        const hash = await crypto.subtle.deriveBits(
          { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
          keyMaterial, 256
        );
        const hashB64 = btoa(String.fromCharCode(...new Uint8Array(hash)));
        if (hashB64 === expectedHashB64) return true;
      } catch {
        // CPU timeout on high iterations — skip
        break;
      }
    }
  }

  return false;
}
