// One-time schema setup against Neon.
// Run:  node --env-file=.env scripts/db-setup.mjs    (or export DATABASE_URL first)
import { neon } from '@neondatabase/serverless'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const url = process.env.DATABASE_URL
if (!url) { console.error('DATABASE_URL is not set'); process.exit(1) }

const here = dirname(fileURLToPath(import.meta.url))
const schema = readFileSync(join(here, '..', 'db', 'schema.sql'), 'utf8')
const sql = neon(url)

const statements = schema
  .split(';')
  .map((s) => s.replace(/--.*$/gm, '').trim())
  .filter(Boolean)

for (const stmt of statements) {
  await sql.query(stmt)
  console.log('✓', stmt.split('\n')[0].slice(0, 70))
}
console.log(`\nSchema ready (${statements.length} statements). Now load data: npm run ingest:eu`)
