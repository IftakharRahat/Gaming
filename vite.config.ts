import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import https from 'node:https'
import type { IncomingMessage, ServerResponse } from 'node:http'

const API_HOST = 'gameadmin.nanovisionltd.com'

/**
 * Custom middleware that proxies /game/* requests.
 * - /game/player/* → forwarded as POST (bet submission)
 * - all other /game/* → forwarded as GET-with-body using Node https
 *   (browsers can't send GET with body, so the frontend sends POST
 *    and this middleware re-issues it as GET)
 */
function gameApiMiddleware(req: IncomingMessage, res: ServerResponse, next: () => void) {
  if (!req.url?.startsWith('/game')) return next()

  // Collect request body
  const chunks: Buffer[] = []
  req.on('data', (c: Buffer) => chunks.push(c))
  req.on('end', () => {
    const body = Buffer.concat(chunks)
    const isPlayerEndpoint = req.url!.startsWith('/game/player')
    const method = isPlayerEndpoint ? 'POST' : 'GET'

    const options: https.RequestOptions = {
      hostname: API_HOST,
      path: req.url,
      method,
      headers: {
        'Content-Type': req.headers['content-type'] || 'text/plain',
        'Content-Length': body.length.toString(),
      },
    }

    const proxyReq = https.request(options, (proxyRes) => {
      // Relay status + headers + body back to the browser
      res.writeHead(proxyRes.statusCode || 200, proxyRes.headers)
      proxyRes.pipe(res, { end: true })
    })

    proxyReq.on('error', (err) => {
      console.error('[proxy] Error:', err.message)
      res.writeHead(502, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: err.message }))
    })

    proxyReq.write(body)
    proxyReq.end()
  })
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'game-api-proxy',
      configureServer(server) {
        server.middlewares.use(gameApiMiddleware)
      },
    },
  ],
})
