// ───────────────────────────────────────────────────────────────────────────
// Brand identity for chart bubbles: manufacturer/pool label → company logo.
//
// Resolution order:
//   1. keyword → official domain (the table below covers every parent across
//      the EU/IN/AU/UK datasets, and pool labels match via their maker keyword)
//   2. logo = Google's favicon service at 128px (free, cached, no key)
//   3. anything unresolved or failing to load falls back to a deterministic
//      MONOGRAM chip (initials on a stable colour) — never a broken image.
// ───────────────────────────────────────────────────────────────────────────

// Ordered most-specific-first: the first keyword contained in the label wins.
const BRAND_DOMAINS: [string, string][] = [
  ['mercedes', 'mercedes-benz.com'],
  ['maruti', 'marutisuzuki.com'],
  ['tata', 'tatamotors.com'],
  ['mahindra', 'mahindra.com'],
  ['skoda', 'skoda-auto.com'],
  ['volkswagen', 'volkswagen.com'],
  ['audi', 'audi.com'],
  ['porsche', 'porsche.com'],
  ['seat', 'seat.com'],
  ['cupra', 'cupraofficial.com'],
  ['bmw', 'bmwgroup.com'],
  ['mini', 'mini.com'],
  ['tesla', 'tesla.com'],
  ['stellantis', 'stellantis.com'],
  ['citro', 'citroen.com'],
  ['peugeot', 'peugeot.com'],
  ['fiat', 'fiat.com'],
  ['jeep', 'jeep.com'],
  ['opel', 'opel.com'],
  ['dacia', 'dacia.ro'],
  ['renault', 'renault.com'],
  ['nissan', 'nissan-global.com'],
  ['mitsubishi', 'mitsubishicars.com'],
  ['lexus', 'lexus.com'],
  ['toyota', 'toyota.com'],
  ['mazda', 'mazda.com'],
  ['subaru', 'subaru.com'],
  ['suzuki', 'suzuki.co.uk'],
  ['isuzu', 'isuzu.co.uk'],
  ['honda', 'global.honda'],
  ['hyundai', 'hyundai.com'],
  ['kia', 'kia.com'],
  ['genesis', 'genesis.com'],
  ['great wall', 'gwm-global.com'],
  ['gwm', 'gwm-global.com'],
  ['haval', 'gwm-global.com'],
  ['byd', 'byd.com'],
  ['mg motor', 'mgmotor.co.in'],
  ['saic', 'mgmotor.eu'],
  ['mg', 'mgmotor.co.in'],
  ['ldv', 'ldvautomotive.com.au'],
  ['polestar', 'polestar.com'],
  ['volvo', 'volvocars.com'],
  ['jaguar', 'jaguarlandrover.com'],
  ['land rover', 'jaguarlandrover.com'],
  ['jlr', 'jaguarlandrover.com'],
  ['ford', 'ford.com'],
  ['gm ', 'gm.com'],
  ['general motors', 'gm.com'],
  ['vauxhall', 'vauxhall.co.uk'],
  ['smart', 'smart.com'],
  ['vinfast', 'vinfastauto.com'],
  ['geely', 'geely.com'],
  ['zeekr', 'zeekrlife.com'],
  ['xpeng', 'xpeng.com'],
  ['leapmotor', 'leapmotor.com'],
]

export function brandDomain(label: string): string | null {
  const l = ` ${label.toLowerCase()} `
  for (const [kw, domain] of BRAND_DOMAINS) if (l.includes(kw)) return domain
  return null
}

/** 128px logo via Google's favicon service — free, CDN-cached, keyless. */
export function brandLogoUrl(label: string): string | null {
  const d = brandDomain(label)
  return d ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(d)}&sz=128` : null
}

const STOP = new Set(['motor', 'motors', 'auto', 'automotive', 'company', 'corporation', 'corp', 'group', 'limited', 'ltd', 'private', 'pvt', 'india', 'europe', 'australia', 'uk', 'pool', 'standalone', 'ag', 'gmbh', 'spa', 'sas', 'plc', 'inc', 'co', 'the', 'of', 'and'])

/** Deterministic initials for the monogram fallback (e.g. "KG Mobility Corp." → "KM"). */
export function brandInitials(label: string): string {
  const words = label.split(/[^A-Za-z0-9]+/).filter((w) => w && !STOP.has(w.toLowerCase()))
  if (!words.length) return label.slice(0, 2).toUpperCase()
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}

const MONO_PALETTE = ['#5B8DEF', '#8B7FF0', '#12B3A6', '#D98005', '#B3568F', '#4A9E63', '#C25E4C', '#6B7DB3']

/** Stable per-brand colour for the monogram disc. */
export function brandColor(label: string): string {
  let h = 0
  for (let i = 0; i < label.length; i++) h = (h * 31 + label.charCodeAt(i)) >>> 0
  return MONO_PALETTE[h % MONO_PALETTE.length]
}
