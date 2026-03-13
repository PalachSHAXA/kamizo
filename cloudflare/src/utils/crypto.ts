// Password encryption and hashing utilities
// Framework-agnostic — uses Web Crypto API (works in Workers, Node 20+, Bun, Deno)

export async function encryptPassword(plainText: string, keyString: string): Promise<string> {
  const enc = new TextEncoder();
  const keyData = enc.encode((keyString || 'default-key-change-me').padEnd(32, '0').slice(0, 32));
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
    const keyData = enc.encode((keyString || 'default-key-change-me').padEnd(32, '0').slice(0, 32));
    const key = await crypto.subtle.importKey('raw', keyData, { name: 'AES-GCM' }, false, ['decrypt']);
    const iv = Uint8Array.from(atob(ivB64), c => c.charCodeAt(0));
    const encrypted = Uint8Array.from(atob(encB64), c => c.charCodeAt(0));
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, encrypted);
    return new TextDecoder().decode(decrypted);
  } catch {
    return stored;
  }
}

// Workers-safe PBKDF2: 10,000 iterations (stays within CPU time limits).
// Hash format: "10000:saltB64:hashB64" — iteration count is stored in the hash.
const PBKDF2_ITERATIONS = 10000;

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

  // Legacy format: "saltB64:hashB64" — old 100,000-iteration hashes.
  // These cannot be safely verified on Workers (CPU timeout). Return false so
  // the caller gets a clean 401 instead of a 1101 crash. The login handler's
  // auto-migration will re-hash the password after a successful admin-forced reset.
  return false;
}
