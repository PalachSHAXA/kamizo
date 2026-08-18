// Seed routes: initial non-production data and retired demo seed.
import { getCacheStats } from '../../cache';
import { getUser } from '../../middleware/auth';
import { route } from '../../router';
import { hashPassword } from '../../utils/crypto';
import { error, generateId, json } from '../../utils/helpers';

export function registerSeedRoutes() {
  route('GET', '/api/admin/cache/stats', async (request, env) => {
    const user = await getUser(request, env);
    if (!user || user.role !== 'admin') return error('Admin access required', 403);
    return json(getCacheStats());
  });

  route('POST', '/api/init-superadmin', async (request, env) => {
    if (!env.SETUP_TOKEN) return error('Endpoint disabled (no SETUP_TOKEN configured)', 410);
    if ((request.headers.get('Authorization') || '') !== `Bearer ${env.SETUP_TOKEN}`) {
      return error('Forbidden', 403);
    }
    const bootstrapPassword = env.SUPERADMIN_BOOTSTRAP_PASSWORD;
    if (!bootstrapPassword || bootstrapPassword.length < 12) {
      return error('SUPERADMIN_BOOTSTRAP_PASSWORD must be set and >= 12 chars', 500);
    }

    const superadminLogin = 'superadmin';
    const existing = await env.DB.prepare('SELECT id FROM users WHERE login = ?')
      .bind(superadminLogin).first();
    if (existing) return error('Superadmin already exists. Use the in-app reset flow.', 409);

    const passwordHash = await hashPassword(bootstrapPassword);
    await env.DB.prepare(`
      INSERT INTO users (id, login, password_hash, name, role, phone, is_active, created_at, updated_at)
      VALUES (?, ?, ?, 'Super Administrator', 'super_admin', '+998900000000', 1, datetime('now'), datetime('now'))
    `).bind(generateId(), superadminLogin, passwordHash).run();
    return json({ login: superadminLogin, status: 'created' });
  });

  route('POST', '/api/seed', async () => error(
    'Generic credential seed retired. Use secured bootstrap or demo provision endpoints.',
    410,
  ));

  route('POST', '/api/seed-kamizo-demo', async () => error(
    'Legacy demo seed retired. Use POST /api/super-admin/demo/provision.',
    410,
  ));
}
