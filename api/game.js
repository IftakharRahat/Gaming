import https from 'node:https';

const API_HOST = 'funint.site';

function toBuffer(body) {
  if (body == null) return Buffer.alloc(0);
  if (Buffer.isBuffer(body)) return body;
  if (typeof body === 'string') return Buffer.from(body);
  return Buffer.from(JSON.stringify(body));
}

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function parsePath(query) {
  const raw = query.path ?? query['...path'] ?? '';
  const value = Array.isArray(raw) ? raw.join('/') : String(raw || '');
  return value.replace(/^\/+/, '');
}

export default async function handler(req, res) {
  try {
    const normalizedPath = parsePath(req.query);
    const hasTrailingSlash = req.query.trailing_slash === '1';
    const gamePath = normalizedPath
      ? `/game/${normalizedPath}${hasTrailingSlash ? '/' : ''}`
      : '/game';
    const isPostEndpoint = gamePath.startsWith('/game/player') || gamePath.startsWith('/game/user') || gamePath.startsWith('/game/magic/boxs/open');
    const method = isPostEndpoint ? 'POST' : 'GET';

    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(req.query)) {
      if (key === 'path' || key === '...path' || key === 'trailing_slash') continue;
      if (Array.isArray(value)) {
        for (const v of value) qs.append(key, String(v));
      } else if (value != null) {
        qs.append(key, String(value));
      }
    }
    const requestPath = qs.size > 0 ? `${gamePath}?${qs.toString()}` : gamePath;

    const bodyBuffer =
      req.body !== undefined
        ? toBuffer(req.body)
        : await readRawBody(req);

    const proxyReq = https.request(
      {
        hostname: API_HOST,
        path: requestPath,
        method,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': String(bodyBuffer.length),
        },
      },
      (proxyRes) => {
        res.statusCode = proxyRes.statusCode || 200;
        for (const [key, value] of Object.entries(proxyRes.headers)) {
          if (value !== undefined) {
            res.setHeader(key, value);
          }
        }
        proxyRes.pipe(res, { end: true });
      },
    );

    proxyReq.on('error', (err) => {
      res.statusCode = 502;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: err.message }));
    });

    if (bodyBuffer.length > 0) {
      proxyReq.write(bodyBuffer);
    }
    proxyReq.end();
  } catch (err) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: err instanceof Error ? err.message : 'Unexpected proxy error' }));
  }
}

