/* EE-INDEX 云同步 Worker：匿名设备 + D1 元数据 + R2 文件
   部署：见 worker/README.md。密钥不写入代码。 */

const FREE_QUOTA = 200 * 1024 * 1024;
const MAX_FILE = 60 * 1024 * 1024;
const ID_RE = /^[A-Za-z0-9_-]{1,80}$/;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors() });
    try {
      if (url.pathname === '/api/health') return await health(request, env);
      if (url.pathname === '/api/device' && request.method === 'POST') return await device(request, env);

      const auth = await authDevice(request, env);
      if (!auth.ok) return json({ error: '无效的设备码' }, 401);

      if (url.pathname === '/api/sync' && request.method === 'GET') return await sync(auth, env);
      if (url.pathname === '/api/categories' && request.method === 'POST') return await putCategories(request, auth, env);

      const m = /^\/api\/files\/([^/]+)$/.exec(url.pathname);
      if (m) {
        const id = decodeURIComponent(m[1]);
        if (!ID_RE.test(id)) return json({ error: '非法文件 ID' }, 400);
        if (request.method === 'PUT') return await putFile(request, auth, env, id);
        if (request.method === 'GET') return await getFile(auth, env, id);
        if (request.method === 'DELETE') return await deleteFile(auth, env, id);
      }
      return json({ error: 'Not found' }, 404);
    } catch (err) {
      return json({ error: String(err && err.message || err) }, 500);
    }
  }
};

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-File-Name, X-File-Category, X-File-Hash, X-File-Updated',
    'Access-Control-Max-Age': '86400'
  };
}
function json(obj, status, extra) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, cors(), extra || {})
  });
}
async function sha256hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}
function bearer(request) {
  const h = request.headers.get('Authorization') || '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : '';
}
async function authDevice(request, env) {
  const token = bearer(request);
  if (!token || token.length < 24) return { ok: false };
  const hash = await sha256hex(token);
  let row = await env.DB.prepare('SELECT * FROM devices WHERE token_hash = ?').bind(hash).first();
  if (!row) {
    const id = 'dev-' + crypto.randomUUID();
    const now = Date.now();
    await env.DB.prepare('INSERT INTO devices (id, token_hash, created_at, quota_bytes) VALUES (?, ?, ?, ?)')
      .bind(id, hash, now, FREE_QUOTA).run();
    row = { id, token_hash: hash, created_at: now, quota_bytes: FREE_QUOTA };
  }
  return { ok: true, device: row, hash };
}
async function quota(env, deviceId) {
  const row = await env.DB.prepare('SELECT COALESCE(SUM(size), 0) AS used FROM files WHERE device_id = ? AND deleted = 0')
    .bind(deviceId).first();
  return { used: Number(row && row.used || 0), limit: FREE_QUOTA };
}
async function health(request, env) {
  const auth = await authDevice(request, env);
  if (!auth.ok) return json({ error: '无效的设备码' }, 401);
  const q = await quota(env, auth.device.id);
  return json({ ok: true, service: 'eeidx-sync', version: 1, device: auth.device.id, quota: q });
}
async function device(request, env) {
  const auth = await authDevice(request, env);
  if (!auth.ok) return json({ error: '无效的设备码' }, 401);
  return json({ ok: true, device: auth.device.id, quota: await quota(env, auth.device.id) });
}
async function sync(auth, env) {
  const cats = await env.DB.prepare('SELECT * FROM categories WHERE device_id = ? ORDER BY sort ASC')
    .bind(auth.device.id).all();
  const files = await env.DB.prepare('SELECT * FROM files WHERE device_id = ? AND deleted = 0 ORDER BY updated_at DESC')
    .bind(auth.device.id).all();
  return json({
    ok: true,
    device: auth.device.id,
    quota: await quota(env, auth.device.id),
    categories: (cats.results || []).map(c => ({
      id: c.id, name: c.name, parentId: c.parent_id || null, sort: c.sort || 0, updatedAt: c.updated_at
    })),
    files: (files.results || []).map(f => ({
      id: f.id, name: f.name, size: f.size, mime: f.mime, categoryId: f.category_id,
      hash: f.hash, updatedAt: f.updated_at, cloudId: f.id
    }))
  });
}
async function putCategories(request, auth, env) {
  const body = await request.json();
  const list = Array.isArray(body) ? body : (body && Array.isArray(body.categories) ? body.categories : []);
  const now = Date.now();
  let n = 0;
  for (const c of list.slice(0, 500)) {
    if (!c || !ID_RE.test(String(c.id || ''))) continue;
    await env.DB.prepare(
      'INSERT INTO categories (device_id, id, name, parent_id, sort, updated_at) VALUES (?, ?, ?, ?, ?, ?) ' +
      'ON CONFLICT(device_id, id) DO UPDATE SET name = excluded.name, parent_id = excluded.parent_id, sort = excluded.sort, updated_at = excluded.updated_at'
    ).bind(auth.device.id, c.id, String(c.name || '未命名'), c.parentId || null, Number(c.sort) || 0, Number(c.updatedAt) || now).run();
    n++;
  }
  return json({ ok: true, written: n });
}
async function putFile(request, auth, env, id) {
  const len = Number(request.headers.get('Content-Length') || 0);
  if (len > MAX_FILE) return json({ error: '单个文件不能超过 60 MB' }, 413);
  const buf = await request.arrayBuffer();
  if (buf.byteLength > MAX_FILE) return json({ error: '单个文件不能超过 60 MB' }, 413);

  const q = await quota(env, auth.device.id);
  const old = await env.DB.prepare('SELECT size, updated_at FROM files WHERE device_id = ? AND id = ?')
    .bind(auth.device.id, id).first();
  const nextUsed = q.used - Number(old && old.size || 0) + buf.byteLength;
  if (nextUsed > q.limit) return json({ error: '免费配额已用尽（200 MB / 设备）', quota: q }, 413);

  const updated = Number(request.headers.get('X-File-Updated') || 0) || Date.now();
  if (old && Number(old.updated_at) > updated) {
    return json({ error: '云端版本更新', server: { id, size: old.size, updatedAt: old.updated_at } }, 409);
  }
  const name = decodeURIComponent(request.headers.get('X-File-Name') || 'file.bin');
  const categoryId = decodeURIComponent(request.headers.get('X-File-Category') || '');
  const hash = request.headers.get('X-File-Hash') || '';
  const mime = request.headers.get('Content-Type') || 'application/octet-stream';
  const key = 'devices/' + auth.device.id + '/' + id;
  await env.FILES.put(key, buf, { httpMetadata: { contentType: mime } });
  await env.DB.prepare(
    'INSERT INTO files (device_id, id, name, size, mime, category_id, hash, updated_at, deleted, r2_key) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?) ' +
    'ON CONFLICT(device_id, id) DO UPDATE SET name = excluded.name, size = excluded.size, mime = excluded.mime, category_id = excluded.category_id, hash = excluded.hash, updated_at = excluded.updated_at, deleted = 0, r2_key = excluded.r2_key'
  ).bind(auth.device.id, id, name, buf.byteLength, mime, categoryId, hash, updated, key).run();
  return json({ ok: true, id, size: buf.byteLength, quota: await quota(env, auth.device.id) });
}
async function getFile(auth, env, id) {
  const row = await env.DB.prepare('SELECT * FROM files WHERE device_id = ? AND id = ? AND deleted = 0')
    .bind(auth.device.id, id).first();
  if (!row) return json({ error: '文件不存在' }, 404);
  const obj = await env.FILES.get(row.r2_key);
  if (!obj) return json({ error: '云端对象缺失' }, 404);
  return new Response(obj.body, {
    headers: Object.assign({
      'Content-Type': row.mime || 'application/octet-stream',
      'Content-Disposition': 'inline; filename*=UTF-8\'\'' + encodeURIComponent(row.name || id),
      'Cache-Control': 'private, max-age=300'
    }, cors())
  });
}
async function deleteFile(auth, env, id) {
  const row = await env.DB.prepare('SELECT r2_key FROM files WHERE device_id = ? AND id = ?')
    .bind(auth.device.id, id).first();
  if (row && row.r2_key) await env.FILES.delete(row.r2_key);
  await env.DB.prepare('DELETE FROM files WHERE device_id = ? AND id = ?').bind(auth.device.id, id).run();
  return json({ ok: true, id, quota: await quota(env, auth.device.id) });
}
