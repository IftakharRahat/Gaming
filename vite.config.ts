import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/game': {
        target: 'https://gameadmin.nanovisionltd.com',
        changeOrigin: true,
        secure: true,
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq, req) => {
            // /game/player/* paths are real POST endpoints (bet submission) — keep POST
            // All other /game/* paths need GET-with-body — rewrite POST→GET
            if (!req.url?.startsWith('/game/player')) {
              proxyReq.method = 'GET';
            }
          });
        },
      },
    },
  },
})
