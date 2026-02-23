import https from 'https';

const API_HOST = 'gameadmin.nanovisionltd.com';

function toBuffer(body) {
    if (body == null) return Buffer.alloc(0);
    if (Buffer.isBuffer(body)) return body;
    if (typeof body === 'string') return Buffer.from(body);
    return Buffer.from(JSON.stringify(body));
}

export default async function handler(req, res) {
    try {
        // Catch-all route: req.query.path is an array of path segments
        const pathSegments = req.query.path || [];
        const subPath = Array.isArray(pathSegments) ? pathSegments.join('/') : String(pathSegments);

        // Preserve trailing slash if the original URL had one
        const originalUrl = req.url || '';
        const hasTrailingSlash = originalUrl.split('?')[0].endsWith('/');
        const gamePath = `/game/${subPath}${hasTrailingSlash && subPath ? '/' : ''}`;

        const isPlayerEndpoint = gamePath.startsWith('/game/player');
        const method = isPlayerEndpoint ? 'POST' : 'GET';

        // Build query string from remaining params (exclude path segments)
        const qs = new URLSearchParams();
        for (const [key, value] of Object.entries(req.query)) {
            if (key === 'path') continue;
            if (Array.isArray(value)) {
                for (const v of value) qs.append(key, String(v));
            } else if (value != null) {
                qs.append(key, String(value));
            }
        }
        const requestPath = qs.size > 0 ? `${gamePath}?${qs.toString()}` : gamePath;

        // Get the body — Vercel auto-parses it, so use req.body
        const bodyBuffer = toBuffer(req.body);

        console.log(`[proxy] ${method} ${requestPath} (body: ${bodyBuffer.length}B)`);

        const proxyReq = https.request(
            {
                hostname: API_HOST,
                path: requestPath,
                method,
                headers: {
                    'Content-Type': 'text/plain',
                    'Content-Length': String(bodyBuffer.length),
                },
            },
            (proxyRes) => {
                res.statusCode = proxyRes.statusCode || 200;
                for (const [key, value] of Object.entries(proxyRes.headers)) {
                    if (value !== undefined && key.toLowerCase() !== 'transfer-encoding') {
                        res.setHeader(key, value);
                    }
                }
                proxyRes.pipe(res, { end: true });
            },
        );

        proxyReq.on('error', (err) => {
            console.error('[proxy] Request error:', err.message);
            res.statusCode = 502;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: err.message }));
        });

        if (bodyBuffer.length > 0) {
            proxyReq.write(bodyBuffer);
        }
        proxyReq.end();
    } catch (err) {
        console.error('[proxy] Handler error:', err);
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: err instanceof Error ? err.message : 'Unexpected proxy error' }));
    }
}
