/**
 * EE-INDEX public AI relay for Cloudflare Workers.
 *
 * Routes:
 *   GET  /health
 *   GET  /v1/models
 *   POST /v1/chat/completions
 *   POST /v1/audio/transcriptions
 *
 * Required bindings/secrets:
 *   AI_BASE_URL, AI_MODEL, AI_API_KEY
 *   STT_MODEL (optional), STT_BASE_URL (optional), STT_API_KEY (optional)
 *   ALLOWED_ORIGINS, ALLOW_LOCAL, RATE_LIMIT (KV), RATE_PER_MIN, RATE_PER_DAY
 */

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8' };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    const allowed = isAllowedOrigin(origin, env);
    const cors = corsHeaders(origin, allowed);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    if (url.pathname === '/health') {
      return json({
        ok: true,
        kv: !!env.RATE_LIMIT,
        model: env.AI_MODEL || '',
        stt: env.STT_MODEL || ''
      }, 200, { 'Access-Control-Allow-Origin': '*' });
    }

    if (!allowed) return json({ error: 'Origin not allowed' }, 403, cors);

    if (!env.AI_BASE_URL || !env.AI_MODEL || !env.AI_API_KEY) {
      return json({ error: 'AI backend is not configured' }, 503, cors);
    }

    const route = url.pathname;
    if (route !== '/v1/models' && route !== '/v1/chat/completions' && route !== '/v1/audio/transcriptions') {
      return json({ error: 'Not found' }, 404, cors);
    }

    if (route === '/v1/models') {
      const models = [{ id: env.AI_MODEL, object: 'model', owned_by: 'ee-index' }];
      if (env.STT_MODEL) models.push({ id: env.STT_MODEL, object: 'model', owned_by: 'ee-index' });
      return json({ object: 'list', data: models }, 200, cors);
    }

    if (!env.RATE_LIMIT) {
      return json({ error: 'Rate limit is not configured; refusing AI requests' }, 503, cors);
    }

    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const limited = await checkRateLimit(env, ip);
    if (!limited.ok) {
      return json({ error: 'Too many requests', retryAfter: limited.retryAfter }, 429, {
        ...cors,
        'Retry-After': String(limited.retryAfter)
      });
    }

    try {
      if (route === '/v1/chat/completions') {
        if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405, cors);
        const size = Number(request.headers.get('Content-Length') || 0);
        if (size > 8 * 1024 * 1024) return json({ error: 'Request body too large' }, 413, cors);

        let body;
        try { body = await request.json(); }
        catch (e) { return json({ error: 'Invalid JSON' }, 400, cors); }

        if (!body || !Array.isArray(body.messages) || !body.messages.length) {
          return json({ error: 'messages is required' }, 400, cors);
        }
        if (body.messages.length > 30) {
          return json({ error: 'Too many messages' }, 400, cors);
        }

        const maxTokens = Math.min(Number(body.max_tokens) || 2400, Number(env.MAX_OUTPUT_TOKENS) || 2400);
        const payload = {
          ...body,
          model: env.AI_MODEL,
          max_tokens: maxTokens,
          temperature: 0.2
        };
        delete payload.stream;

        const base = env.AI_BASE_URL.replace(/\/+$/, '');
        const upstream = await fetchWithTimeout(base + '/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + env.AI_API_KEY
          },
          body: JSON.stringify(payload)
        }, 60000);

        return relay(upstream, cors);
      }

      if (route === '/v1/audio/transcriptions') {
        if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405, cors);
        if (!env.STT_MODEL) return json({ error: 'Speech transcription is not configured' }, 503, cors);

        const size = Number(request.headers.get('Content-Length') || 0);
        if (size > 12 * 1024 * 1024) return json({ error: 'Audio file too large' }, 413, cors);

        const contentType = request.headers.get('Content-Type') || '';
        if (!contentType.includes('multipart/form-data')) {
          return json({ error: 'multipart/form-data is required' }, 415, cors);
        }

        const form = await request.formData();
        form.set('model', env.STT_MODEL);

        const sttBase = (env.STT_BASE_URL || env.AI_BASE_URL).replace(/\/+$/, '');
        const sttKey = env.STT_API_KEY || env.AI_API_KEY;
        const upstream = await fetchWithTimeout(sttBase + '/audio/transcriptions', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + sttKey },
          body: form
        }, 60000);

        return relay(upstream, cors);
      }
    } catch (err) {
      return json({ error: 'Upstream request failed', detail: err && err.message ? err.message : 'unknown' }, 502, cors);
    }

    return json({ error: 'Not found' }, 404, cors);
  }
};

function corsHeaders(origin, allowed) {
  return {
    'Access-Control-Allow-Origin': allowed ? origin : 'null',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}

function isAllowedOrigin(origin, env) {
  if (!origin) return false;
  const list = String(env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(function (s) { return s.trim(); })
    .filter(Boolean);
  if (list.indexOf(origin) !== -1) return true;
  if (env.ALLOW_LOCAL === 'true' && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return true;
  return false;
}

function json(obj, status, extraHeaders) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { ...JSON_HEADERS, ...(extraHeaders || {}) }
  });
}

async function relay(res, cors) {
  const text = await res.text();
  return new Response(text, {
    status: res.status,
    headers: {
      ...cors,
      'Content-Type': res.headers.get('Content-Type') || 'application/json; charset=utf-8'
    }
  });
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(function () { controller.abort(); }, timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function checkRateLimit(env, ip) {
  const now = Date.now();
  const minute = Math.floor(now / 60000);
  const day = Math.floor(now / 86400000);
  const minuteKey = 'rl:m:' + ip + ':' + minute;
  const dayKey = 'rl:d:' + ip + ':' + day;
  const limitMinute = Number(env.RATE_PER_MIN || 15);
  const limitDay = Number(env.RATE_PER_DAY || 150);

  const values = await Promise.all([
    env.RATE_LIMIT.get(minuteKey),
    env.RATE_LIMIT.get(dayKey)
  ]);
  const usedMinute = Number(values[0] || 0);
  const usedDay = Number(values[1] || 0);

  if (usedMinute >= limitMinute) {
    return { ok: false, retryAfter: 60 - (Math.floor(now / 1000) % 60) };
  }
  if (usedDay >= limitDay) {
    return { ok: false, retryAfter: 3600 };
  }

  await Promise.all([
    env.RATE_LIMIT.put(minuteKey, String(usedMinute + 1), { expirationTtl: 120 }),
    env.RATE_LIMIT.put(dayKey, String(usedDay + 1), { expirationTtl: 86400 })
  ]);

  return { ok: true };
}
