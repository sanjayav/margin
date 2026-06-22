import { defineConfig, loadEnv, type PluginOption } from 'vite'
import react from '@vitejs/plugin-react'

// Serves the /api functions under `npm run dev` (Vite doesn't do this natively).
// Loads .env into process.env and dispatches /api/* to the same handlers Vercel
// runs in production, with small req/res shims for the Vercel-style signature.
function localApi(): PluginOption {
  return {
    name: 'underline-local-api',
    configureServer(server) {
      const env = loadEnv(server.config.mode, process.cwd(), '')
      for (const k of ['ANTHROPIC_API_KEY', 'DATABASE_URL', 'CRON_SECRET', 'EEA_EU_URL', 'EEA_EU_DELIMITER']) {
        if (env[k] && !process.env[k]) process.env[k] = env[k]
      }
      server.middlewares.use(async (req, res, next) => {
        if (!req.url || !req.url.startsWith('/api/')) return next()
        const url = new URL(req.url, 'http://localhost')
        const name = url.pathname.replace(/^\/api\//, '').split('/')[0]
        try {
          ;(req as any).query = Object.fromEntries(url.searchParams)
          if (req.method !== 'GET' && req.method !== 'HEAD') {
            const chunks: Buffer[] = []
            for await (const c of req) chunks.push(c as Buffer)
            const raw = Buffer.concat(chunks).toString('utf8')
            try { (req as any).body = raw ? JSON.parse(raw) : {} } catch { (req as any).body = raw }
          }
          const r = res as any
          r.status = (code: number) => { res.statusCode = code; return r }
          r.json = (obj: unknown) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(obj)) }
          const mod = await server.ssrLoadModule(`/api/${name}.ts`)
          if (!mod?.default) { res.statusCode = 404; res.end(JSON.stringify({ error: `no /api/${name}` })); return }
          await mod.default(req, res)
        } catch (e: any) {
          res.statusCode = 500
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify({ error: String(e?.message ?? e) }))
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), localApi()],
  server: { port: 5180, open: true },
})
