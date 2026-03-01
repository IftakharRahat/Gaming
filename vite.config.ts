import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { compression } from 'vite-plugin-compression2'
import https from 'node:https'
import type { IncomingMessage, ServerResponse } from 'node:http'

const API_HOST = 'funint.site'

/**
 * Custom middleware that proxies /game/* requests.
 * - /game/player/* → forwarded as POST (bet submission)
 * - all other /game/* → forwarded as GET-with-body using Node https
 *   (browsers can't send GET with body, so the frontend sends POST
 *    and this middleware re-issues it as GET)
 */
function gameApiMiddleware(req: IncomingMessage, res: ServerResponse, next: () => void) {
  // --- Media proxy: /media/* → http://funint.site/media/* ---
  if (req.url?.startsWith('/media/')) {
    const options: https.RequestOptions = {
      hostname: API_HOST,
      path: req.url,  // Already starts with /media/
      method: 'GET',
      headers: { 'Accept': 'image/*,*/*' },
    }
    const proxyReq = https.request(options, (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 200, proxyRes.headers)
      proxyRes.pipe(res, { end: true })
    })
    proxyReq.on('error', (err) => {
      console.error('[media-proxy] Error:', err.message)
      res.writeHead(502, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: err.message }))
    })
    proxyReq.end()
    return
  }

  if (!req.url?.startsWith('/game')) return next()

  // Collect request body
  const chunks: Buffer[] = []
  req.on('data', (c: Buffer) => chunks.push(c))
  req.on('end', () => {
    const body = Buffer.concat(chunks)
    const isPostEndpoint = req.url!.startsWith('/game/player') || req.url!.startsWith('/game/user')
    const method = isPostEndpoint ? 'POST' : 'GET'

    const options: https.RequestOptions = {
      hostname: API_HOST,
      path: req.url,
      method,
      headers: {
        'Content-Type': req.headers['content-type'] || 'application/json',
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
    // Pre-compress assets with gzip and brotli for production
    compression({ algorithms: ['gzip'], exclude: [/\.(png|jpg|jpeg|gif|webp|svg)$/i] }),
    compression({ algorithms: ['brotliCompress'], exclude: [/\.(png|jpg|jpeg|gif|webp|svg)$/i] }),
  ],
  build: {
    // Target modern browsers for smaller output
    target: 'es2020',
    rollupOptions: {
      output: {
        // Split vendor libraries into separate cacheable chunks
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-motion': ['framer-motion'],
          'vendor-utils': ['canvas-confetti', 'howler', 'clsx', 'tailwind-merge'],
        },
      },
    },
    // Increase chunk size warning limit (the game component is inherently large)
    chunkSizeWarningLimit: 200,
  },
})
