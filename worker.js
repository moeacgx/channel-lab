import page from './index.html';

const MAX_BODY_BYTES = 1024 * 1024;
const PRIVATE_SUFFIXES = ['.localhost', '.local', '.internal', '.lan', '.home', '.corp', '.intranet', '.private', '.test', '.invalid', '.example', '.onion', '.arpa'];

function responseHeaders(origin) {
  const headers = new Headers({
    'Cache-Control': 'no-store, no-transform',
    'X-Content-Type-Options': 'nosniff',
    'Vary': 'Origin',
  });
  if (origin) headers.set('Access-Control-Allow-Origin', origin);
  return headers;
}

function jsonResponse(data, status, origin, extraHeaders = {}) {
  const headers = responseHeaders(origin);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  for (const [name, value] of Object.entries(extraHeaders)) headers.set(name, value);
  return new Response(JSON.stringify(data), { status, headers });
}

function fail(message, status, origin, extraHeaders) {
  return jsonResponse({ error: { message } }, status, origin, extraHeaders);
}

function allowedOrigin(request, env, ownUrl) {
  const origin = request.headers.get('Origin');
  if (!origin) return { allowed: true, origin: null };
  const allowlist = (env.ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean);
  return { allowed: origin === ownUrl.origin || allowlist.includes(origin), origin };
}

function upstreamUrl(value, ownUrl) {
  if (typeof value !== 'string' || value !== value.trim() || value.includes('?') || value.includes('#') || /^https:\/\/[^/]*@/i.test(value)) {
    throw new Error('接口地址必须是不带用户信息、查询参数或片段的 HTTPS URL。');
  }
  const target = new URL(value);
  const hostname = target.hostname.toLowerCase();
  // URL 会规范化十进制、十六进制等 IPv4 表示，因此在解析后检查地址。
  const isIp = hostname.includes(':') || /^\d+(?:\.\d+){3}$/.test(hostname);
  const validDomain = hostname.length <= 253 && hostname.includes('.') && hostname.split('.').every(label =>
    /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)
  );
  if (target.protocol !== 'https:' || (target.port && target.port !== '443') ||
      target.username || target.password || target.search || target.hash ||
      isIp || !validDomain || hostname === 'localhost' || hostname === ownUrl.hostname.toLowerCase() ||
      PRIVATE_SUFFIXES.some(suffix => hostname.endsWith(suffix))) {
    throw new Error('只允许不带账号、查询参数或片段的 HTTPS 公网域名，端口必须为 443。');
  }
  if (!/\/(?:chat\/completions|responses)$/.test(target.pathname)) {
    throw new Error('请求路径必须以 /chat/completions 或 /responses 结尾。');
  }
  return target;
}

async function readJson(request) {
  if (!request.body) throw Object.assign(new Error('请求体不能为空。'), { status: 400 });
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        throw Object.assign(new Error('请求体不能超过 1 MiB。'), { status: 413 });
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    throw Object.assign(new Error('请求体必须为有效的 UTF-8 JSON。'), { status: 400 });
  }
}

export default {
  async fetch(request, env = {}) {
    const ownUrl = new URL(request.url);
    const cors = allowedOrigin(request, env, ownUrl);
    if (!cors.allowed) return fail('当前网页来源未获准访问此代理。', 403, null);
    const origin = cors.origin;
    const path = ownUrl.pathname;

    if (path === '/' || path === '/index.html') {
      if (request.method !== 'GET') return fail('此路径仅支持 GET。', 405, origin, { Allow: 'GET' });
      const headers = responseHeaders(origin);
      headers.set('Content-Type', 'text/html; charset=utf-8');
      return new Response(page, { headers });
    }
    if (path === '/api/health') {
      if (request.method !== 'GET') return fail('此路径仅支持 GET。', 405, origin, { Allow: 'GET' });
      return jsonResponse({ ok: true, mode: 'proxy' }, 200, origin);
    }
    if (path !== '/api/proxy') return fail('路径不存在。', 404, origin);
    if (request.method === 'OPTIONS') {
      const headers = responseHeaders(origin);
      headers.set('Access-Control-Allow-Methods', 'POST');
      headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
      headers.set('Access-Control-Max-Age', '600');
      return new Response(null, { status: 204, headers });
    }
    if (request.method !== 'POST') return fail('此路径仅支持 POST。', 405, origin, { Allow: 'POST, OPTIONS' });

    const authorization = request.headers.get('Authorization') || '';
    if (!/^Bearer\s+\S+$/i.test(authorization)) return fail('请填写接口令牌。', 401, origin);
    if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type') || '')) {
      return fail('请求 Content-Type 必须为 application/json。', 415, origin);
    }

    let envelope;
    try {
      envelope = await readJson(request);
    } catch (error) {
      return fail(error.status ? error.message : '无法读取请求体。', error.status || 400, origin);
    }
    if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) {
      return fail('请求必须包含 url 和 payload。', 400, origin);
    }
    const payload = envelope.payload;
    if (!payload || typeof payload !== 'object' || Array.isArray(payload) ||
        typeof payload.model !== 'string' || !payload.model.trim() ||
        ('stream' in payload && typeof payload.stream !== 'boolean')) {
      return fail('payload 必须为对象，model 不能为空，stream 必须为布尔值。', 400, origin);
    }
    let target;
    try {
      target = upstreamUrl(envelope.url, ownUrl);
    } catch {
      return fail('接口地址无效：仅支持 HTTPS 公网域名及 /chat/completions 或 /responses 路径，不允许查询参数。', 400, origin);
    }

    try {
      const upstream = await fetch(target.toString(), {
        method: 'POST',
        headers: {
          'Authorization': authorization,
          'Content-Type': 'application/json',
          'Accept': payload.stream ? 'text/event-stream' : 'application/json',
        },
        body: JSON.stringify(payload),
        redirect: 'manual',
        signal: request.signal,
      });
      const headers = responseHeaders(origin);
      headers.set('Content-Type', upstream.headers.get('Content-Type') || 'application/octet-stream');
      // 不缓冲响应，不透传重定向地址、Cookie 或任何上游认证信息。
      return new Response(upstream.body, { status: upstream.status, headers });
    } catch {
      return fail('代理无法连接上游接口，或请求已取消，请检查接口地址与上游服务状态。', 502, origin);
    }
  },
};
