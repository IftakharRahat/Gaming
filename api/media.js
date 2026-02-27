import http from 'node:http';

const API_HOST = 'funint.site';

export default async function handler(req, res) {
    try {
        const rawPath = req.query.path || req.query['...path'] || '';
        const mediaPath = Array.isArray(rawPath) ? rawPath.join('/') : String(rawPath || '');

        if (!mediaPath) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Missing path parameter' }));
            return;
        }

        const remotePath = '/' + mediaPath.replace(/^\/+/, '');

        const proxyReq = http.request(
            {
                hostname: API_HOST,
                path: remotePath,
                method: 'GET',
                headers: {
                    'Accept': 'image/*,*/*',
                },
            },
            (proxyRes) => {
                res.statusCode = proxyRes.statusCode || 200;

                // Forward content headers
                const contentType = proxyRes.headers['content-type'];
                if (contentType) res.setHeader('Content-Type', contentType);

                const contentLength = proxyRes.headers['content-length'];
                if (contentLength) res.setHeader('Content-Length', contentLength);

                // Cache for 1 day since these are static assets
                res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400');

                proxyRes.pipe(res, { end: true });
            },
        );

        proxyReq.on('error', (err) => {
            res.statusCode = 502;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: err.message }));
        });

        proxyReq.end();
    } catch (err) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: err instanceof Error ? err.message : 'Unexpected proxy error' }));
    }
}
