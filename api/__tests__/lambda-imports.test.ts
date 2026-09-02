/**
 * Every relative import reachable from an API route must carry a `.js`
 * extension.
 *
 * The routes are compiled to ESM and run by Node on Vercel, where an
 * extensionless relative specifier does not resolve — it throws
 * ERR_MODULE_NOT_FOUND at import time, which surfaces as a bare 500 with no
 * response body. Vite resolves the same specifier happily, so nothing catches
 * it in dev, in the build, or in the type-check.
 *
 * This shipped once: api/agents.ts began importing LEVER_BOUNDS from
 * src/app/modules/scenario/levers.ts, a browser-side module whose own
 * `../../../engine/blocks` import had never needed an extension. Every agent
 * run in production returned 500.
 *
 * Type-only imports are erased before Node sees them, so they cannot crash —
 * they are held to the same rule anyway, because the day someone drops the
 * `type` keyword is the day the route breaks.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(__dirname, '../..')

/** Files Vercel does not turn into routes. */
const isRoute = (f: string) => f.endsWith('.ts') && !f.startsWith('_')

function resolveImport(from: string, spec: string): string | null {
  const base = path.resolve(path.dirname(from), spec.replace(/\.js$/, ''))
  const candidates = [
    `${base}.ts`,
    `${base}.tsx`,
    path.join(base, 'index.ts'),
    path.join(base, 'index.tsx'),
    `${base}.js`,
  ]
  return candidates.find((c) => fs.existsSync(c) && fs.statSync(c).isFile()) ?? null
}

/** Relative specifiers in `src`, paired with the 1-based line they sit on. */
function relativeImports(src: string): { spec: string; line: number }[] {
  const out: { spec: string; line: number }[] = []
  src.split('\n').forEach((ln, i) => {
    const m =
      /^\s*(?:import|export)\s+(?:type\s+)?[\s\S]*?from\s+['"](\.[^'"]+)['"]/.exec(ln) ??
      /^\s*import\s+['"](\.[^'"]+)['"]/.exec(ln)
    if (m) out.push({ spec: m[1], line: i + 1 })
  })
  return out
}

/** Walks the transitive import graph from every API route. */
function walk(): { graph: Set<string>; offenders: string[] } {
  const graph = new Set<string>()
  const offenders: string[] = []
  const queue = fs
    .readdirSync(path.join(ROOT, 'api'))
    .filter(isRoute)
    .map((f) => path.join(ROOT, 'api', f))

  while (queue.length) {
    const file = queue.pop() as string
    if (graph.has(file)) continue
    graph.add(file)

    for (const { spec, line } of relativeImports(fs.readFileSync(file, 'utf8'))) {
      if (!spec.endsWith('.js')) {
        offenders.push(`${path.relative(ROOT, file)}:${line} imports '${spec}' (needs .js)`)
      }
      const target = resolveImport(file, spec)
      if (target) queue.push(target)
    }
  }
  return { graph, offenders }
}

describe('lambda import graph', () => {
  const { graph, offenders } = walk()

  it('reaches the routes and their dependencies', () => {
    // A resolver regression that silently walked nothing would make the
    // extension check below vacuous.
    expect(graph.size).toBeGreaterThan(20)
    expect([...graph].some((f) => f.endsWith('api/agents.ts'))).toBe(true)
    expect([...graph].some((f) => f.includes('src/engine/'))).toBe(true)
  })

  it('has no extensionless relative import', () => {
    expect(offenders).toEqual([])
  })
})
