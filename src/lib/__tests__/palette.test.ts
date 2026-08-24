// Design-system guard. Two things this protects:
//
//  1. ONE source of truth. The powertrain mapping used to exist five times and
//     two copies had drifted, so a BEV was #3ddc97 on every chart and #0E9F6E on
//     the Data screen. A colour that means something must mean it everywhere.
//  2. The palette stays colourblind-safe. The previous set had PHEV and HEV at
//     ΔE 0.6 under deuteranopia — the same colour to a colourblind reader. These
//     hexes are pinned so any change is a deliberate one that gets re-validated
//     against the cream surface (#FBF7EF) before it ships.
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { PT_COLORS, PT_ORDER, ptColor, ptRing, ptRank, STATUS } from '../palette'
import fleet from '../../data/fleet_data'

describe('palette · one source of truth', () => {
  it('no other module defines its own powertrain colour map', () => {
    const root = join(__dirname, '..', '..')
    const offenders: string[] = []
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name)
        if (statSync(p).isDirectory()) { walk(p); continue }
        if (!/\.(ts|tsx)$/.test(name)) continue
        if (p.endsWith(join('lib', 'palette.ts'))) continue
        if (p.includes('__tests__')) continue // this file pins the hexes on purpose
        const src = readFileSync(p, 'utf8')
        // a literal powertrain→hex map anywhere else is the bug this guards
        if (/\bBEV\s*:\s*'#[0-9a-fA-F]{3,8}'/.test(src)) offenders.push(p.slice(root.length + 1))
      }
    }
    walk(root)
    expect(offenders).toEqual([])
  })
})

describe('palette · powertrain slots', () => {
  it('pins the validated hexes (change ⇒ re-run the CVD validator)', () => {
    expect(PT_COLORS).toEqual({
      BEV: '#00A87A', FCEV: '#3D93C4', PHEV: '#2E86C8',
      HEV: '#B85C8A', MHEV: '#B08E00', ICE: '#C4402A',
    })
  })

  it('gives every slot a distinct fill and a distinct companion step', () => {
    const fills = Object.values(PT_COLORS)
    expect(new Set(fills).size).toBe(fills.length)
    const lum = (h: string) => [1, 3, 5].reduce((a, i) => a + parseInt(h.slice(i, i + 2), 16), 0)
    for (const pt of PT_ORDER) {
      expect(ptRing(pt)).not.toBe(ptColor(pt))
      // On a dark surface the companion goes LIGHTER — it is a highlight, not a
      // shadow. The inverse of the light-mode rule, and the reason this assertion
      // flipped rather than being deleted.
      expect(lum(ptRing(pt)), pt).toBeGreaterThan(lum(ptColor(pt)))
    }
  })

  it('resolves every powertrain present in the shipped data — nothing falls through to grey', () => {
    const pts = new Set<string>()
    for (const rows of Object.values(fleet as Record<string, { powertrain?: string }[]>)) {
      for (const r of rows) if (r.powertrain) pts.add(r.powertrain)
    }
    expect(pts.size).toBeGreaterThan(0)
    const unresolved = [...pts].filter((p) => ptColor(p) === '#8C8273')
    expect(unresolved, `unmapped powertrains: ${unresolved.join(', ')}`).toEqual([])
  })

  it('orders powertrains cleanest-first so a mix bar always reads one way', () => {
    expect(ptRank('BEV')).toBeLessThan(ptRank('PHEV'))
    expect(ptRank('PHEV')).toBeLessThan(ptRank('ICE'))
    expect(ptRank('Strong Hybrid')).toBe(ptRank('HEV')) // alias, same slot
  })

  it('keeps status colours out of the categorical set', () => {
    for (const s of Object.values(STATUS)) expect(Object.values(PT_COLORS)).not.toContain(s)
  })
})
