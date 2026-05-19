// Notes (notepad) CRUD routes

import { route } from '../../router';
import { getUser } from '../../middleware/auth';
import { getTenantId, requireFeature } from '../../middleware/tenant';
import { json, error } from '../../utils/helpers';

export function registerNotesRoutes() {

// Notes: Get all notes for current user
route('GET', '/api/notes', async (request, env) => {
  const fc = await requireFeature('notepad', env, request);
  if (!fc.allowed) return error(fc.error!, 403);

  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);
  const tenantId = getTenantId(request);

  const { results } = await env.DB.prepare(`
    SELECT id, title, content, created_at, updated_at
    FROM notes
    WHERE user_id = ? ${tenantId ? 'AND tenant_id = ?' : ''}
    ORDER BY updated_at DESC
    LIMIT 500
  `).bind(user.id, ...(tenantId ? [tenantId] : [])).all();

  return json({ notes: results });
});

// Notes: Create a new note
route('POST', '/api/notes', async (request, env) => {
  const fc = await requireFeature('notepad', env, request);
  if (!fc.allowed) return error(fc.error!, 403);

  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const body = await request.json() as { title: string; content?: string };

  if (!body.title?.trim()) {
    return error('Title is required');
  }

  // Sprint 79 P1/F9: cap title/content size. Was unbounded — a resident
  // could store multi-MB blobs (or pasted data-URL images) and LIST
  // would return all of it.
  const title = body.title.trim().slice(0, 200);
  const content = (body.content || '').slice(0, 50_000);

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await env.DB.prepare(`
    INSERT INTO notes (id, user_id, title, content, tenant_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(id, user.id, title, content, getTenantId(request), now, now).run();

  return json({
    note: {
      id,
      title,
      content,
      created_at: now,
      updated_at: now
    }
  });
});

// Notes: Update a note
route('PUT', '/api/notes/:id', async (request, env, params) => {
  const fc = await requireFeature('notepad', env, request);
  if (!fc.allowed) return error(fc.error!, 403);

  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);
  const tenantId = getTenantId(request);

  const noteId = params?.id;
  if (!noteId) return error('Note ID required');

  // Check ownership
  const existing = await env.DB.prepare(
    `SELECT id FROM notes WHERE id = ? AND user_id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(noteId, user.id, ...(tenantId ? [tenantId] : [])).first();

  if (!existing) {
    return error('Note not found or access denied', 404);
  }

  const body = await request.json() as { title?: string; content?: string };

  if (!body.title?.trim()) {
    return error('Title is required');
  }

  // Sprint 79 P1/F9: same caps on update path.
  const title = body.title.trim().slice(0, 200);
  const content = (body.content || '').slice(0, 50_000);
  const now = new Date().toISOString();

  await env.DB.prepare(`
    UPDATE notes SET title = ?, content = ?, updated_at = ?
    WHERE id = ? AND user_id = ? ${tenantId ? 'AND tenant_id = ?' : ''}
  `).bind(title, content, now, noteId, user.id, ...(tenantId ? [tenantId] : [])).run();

  return json({
    note: {
      id: noteId,
      title,
      content,
      updated_at: now
    }
  });
});

// Notes: Delete a note
route('DELETE', '/api/notes/:id', async (request, env, params) => {
  const fc = await requireFeature('notepad', env, request);
  if (!fc.allowed) return error(fc.error!, 403);

  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);
  const tenantId = getTenantId(request);

  const noteId = params?.id;
  if (!noteId) return error('Note ID required');

  // Check ownership and delete
  const result = await env.DB.prepare(
    `DELETE FROM notes WHERE id = ? AND user_id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(noteId, user.id, ...(tenantId ? [tenantId] : [])).run();

  if (result.meta.changes === 0) {
    return error('Note not found or access denied', 404);
  }

  return json({ success: true });
});

} // end registerNotesRoutes
