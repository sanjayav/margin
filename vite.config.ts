import { defineConfig, loadEnv, type PluginOption } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

// Serves the /api functions under `npm run dev` (Vite doesn't do this natively).
// Loads .env into process.env and dispatches /api/* to the same handlers Vercel
// runs in production, with small req/res shims for the Vercel-style signature.
function localApi(): PluginOption {
  return {
    name: 'underline-local-api',
    configureServer(server) {
      // Forward every server-side key from .env into process.env, so the API
      // routes see the same configuration they would on Vercel.
      //
      // This used to be a hardcoded allowlist, which meant each new setting had
      // to be remembered in two places — and when SESSION_SECRET and AUTH_USERS
      // were added, auth silently fell back to the built-in demo user instead of
      // reading the configured accounts. A missing name produced a wrong login,
      // not an error, so forward everything and let the routes decide.
      //
      // VITE_-prefixed keys are client-side; Vite already exposes those and they
      // have no business in a server process.
      const env = loadEnv(server.config.mode, process.cwd(), '')
      for (const [k, v] of Object.entries(env)) {
        if (k.startsWith('VITE_') || !v) continue
        if (!process.env[k]) process.env[k] = v
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
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: { port: 5180, open: true },
  build: {
    rollupOptions: {
      output: {
        // Split the three things that change at different rates, so a code
        // change doesn't force a re-download of React or the fleet extract.
        // The extract is the single largest asset (~840 KB of JSON) and is
        // identical between deploys unless the data is re-ingested.
        manualChunks: {
          react: ['react', 'react-dom'],
          fleet: ['./src/data/fleet_data.ts'],
        },
      },
    },
  },
  // Engine tests are pure arithmetic over the rule packs and run in node.
  // Component tests opt into a DOM per-file via `// @vitest-environment jsdom`.
  test: { environment: 'node', include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'api/**/*.test.ts'] },
})
