import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { fetchJobDescription, JdFetchError } from './api/_jdFetcher.js'

// Vite's dev server doesn't run the Vercel functions in api/, so /api/fetch-jd
// would 404 locally. This serves it in dev using the exact same fetcher module
// the deployed function uses — one implementation, both environments.
function devJdFetchApi(): Plugin {
  return {
    name: 'dev-jd-fetch-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/api/fetch-jd', async (req, res) => {
        const send = (status: number, body: unknown) => {
          res.statusCode = status
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify(body))
        }
        try {
          const url = new URL(req.url ?? '', 'http://localhost').searchParams.get('url')
          if (!url) return send(400, { error: 'Missing url.' })
          send(200, await fetchJobDescription(url))
        } catch (e: unknown) {
          if (e instanceof JdFetchError) return send(e.status, { error: e.message })
          send(500, { error: 'Could not fetch that link.' })
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), devJdFetchApi()],
})
