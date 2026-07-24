// Sanity-check the China dual-credit engine against the authoritative per-entity
// credits in China Data.xlsx (Regulatory-mode rows, 2024).
import { getPack } from '../src/engine/rulepacks/index.js'
import { getFleet } from '../src/data/fleet.js'
import { buildTree } from '../src/engine/engine.js'
import { defaultScenario } from '../src/state/store.js'
import { buildDualCredit } from '../src/engine/china/dualcredit.js'

const pack = getPack('CN')
const raw = getFleet('CN')
const s = { ...defaultScenario('CN'), year: 2024 }
const dc = buildDualCredit(buildTree(raw, pack, s), s, pack.creditPrice ?? pack.fineRate)

// File's authoritative 2024 accounting (Regulatory rows; Tesla = sum of its two rows)
const PUB: Record<string, { cafc: number; nev: number }> = {
  BMW: { cafc: -435972, nev: -48851 },
  'Brilliance-BMW': { cafc: 437499, nev: 291652 },
  Porsche: { cafc: 54856, nev: 24807 },
  Tata: { cafc: -88572, nev: -7703 },
  'Chery-Tata': { cafc: -65882, nev: -8305 },
  Tesla: { cafc: 4706109, nev: 2070133 },
}
const f = (n: number) => (n >= 0 ? '+' : '−') + Math.round(Math.abs(n)).toLocaleString()
console.log('\nChina dual-credit · 2024 · engine vs China Data.xlsx (authoritative)\n' + '─'.repeat(76))
let ok = 0, tot = 0
for (const o of dc.oems) {
  const p = PUB[o.parent]
  console.log(`${o.parent.padEnd(16)} CAFC ${f(o.cafcCredit).padStart(12)} NEV ${f(o.nevBalance).padStart(11)}${p ? `   file ${f(p.cafc).padStart(12)} / ${f(p.nev).padStart(11)}` : ''}`)
  if (p) { tot += 2; if (Math.sign(o.cafcCredit) === Math.sign(p.cafc)) ok++; if (Math.sign(o.nevBalance) === Math.sign(p.nev)) ok++ }
}
console.log('─'.repeat(76))
console.log(`sign match vs file: ${ok}/${tot} · market cost ${pack.currency}${(dc.totals.cost / 1e9).toFixed(2)}B · ${dc.totals.makersOver}/${dc.totals.makers} short`)
