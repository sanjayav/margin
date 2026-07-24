// ───────────────────────────────────────────────────────────────────────────
// Forecast Studio · client
//
// Streams /api/forecast over SSE: the AI's scenario definitions arrive as one
// `scenarios` event, then the executive brief streams token-by-token. The
// scenarios carry only LEVERS — the studio recomputes every trajectory locally
// through the SAME engine the server used (buildForecast), so the chart, the
// compare matrix and the brief can never disagree.
// ───────────────────────────────────────────────────────────────────────────
import type { CountryId } from '../engine/types'
import type { ForecastScenarioDef, ForecastSummary } from '../engine/forecast'

/** A scenario as it comes off the wire (levers + a server-computed preview). */
export interface AiScenario {
  id: string
  kind: 'ai'
  name: string
  description: string
  color: string
  levers: ForecastScenarioDef['levers']
  events: { year: number; label: string }[]
  summary: ForecastSummary
  series: { year: number; metric: number; limit: number; gap: number; fine: number }[]
}

export interface BaselineWire {
  target: string; market: string; unit: string; currency: string
  series: { year: number; metric: number; limit: number; gap: number; fine: number }[]
  firstBreachYear: number | null; cumExposure: number
}

/** The AI's recommended forecast MODEL — an Assumption-Book configuration
 *  (drivers + case weights + narrative) the analyst can apply in one click. */
export interface AiBook {
  drivers: { marketGrowth: number; evShareHorizon: number; iceCo2Improve: number; massDrift: number }
  weights: { base: number; upside: number; downside: number }
  narrative: string
}

export interface StreamHandlers {
  onBaseline?: (b: BaselineWire) => void
  onScenarios?: (s: AiScenario[]) => void
  onBook?: (b: AiBook) => void
  onBriefDelta?: (text: string) => void
  onDone?: () => void
  onError?: (message: string) => void
}

export interface ForecastContext {
  country: CountryId
  target: string
  ownedModules: CountryId[]
  /** The analyst's current Assumption Book — the AI models against it. */
  drivers?: { marketGrowth: number; evShareHorizon: number; iceCo2Improve: number; massDrift: number }
}

// Palette the AI picks from (must match COLORS in api/forecast.ts). Baseline and
// the regulatory limit have their own fixed colours.
export const SCEN_COLORS: Record<string, string> = {
  emerald: '#0E9F6E', amber: '#D98005', violet: '#8b7ff0', sky: '#3B6FE0',
  rose: '#E0484D', teal: '#12b3a6', orange: '#E8223B',
}
export const BASELINE_HEX = '#5b8def'
export const LIMIT_HEX = '#E0A100'
export const colorHex = (key: string | undefined) => (key && SCEN_COLORS[key]) || BASELINE_HEX

/** POST the prompt and dispatch SSE events to the handlers. Resolves when the
 *  stream ends (or errors). Degrades gracefully when the endpoint returns a
 *  plain-JSON error (e.g. ANTHROPIC_API_KEY unset) instead of an event stream. */
export async function streamForecast(prompt: string, context: ForecastContext, h: StreamHandlers): Promise<void> {
  let res: Response
  try {
    res = await fetch('/api/forecast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, context }),
    })
  } catch (e: any) {
    h.onError?.(e?.message || 'Network error'); return
  }

  const ct = res.headers.get('content-type') || ''
  if (!res.ok || !ct.includes('text/event-stream') || !res.body) {
    let msg = `Request failed (${res.status})`
    try { const j = await res.json(); msg = j.error || msg } catch { /* keep msg */ }
    h.onError?.(msg); return
  }

  const reader = res.body.getReader()
  const dec = new TextDecoder()
  let buf = ''
  const dispatch = (event: string, data: any) => {
    switch (event) {
      case 'baseline': h.onBaseline?.(data as BaselineWire); break
      case 'scenarios': h.onScenarios?.((data?.scenarios ?? []) as AiScenario[]); break
      case 'book': if (data?.book) h.onBook?.(data.book as AiBook); break
      case 'brief_delta': if (typeof data?.text === 'string') h.onBriefDelta?.(data.text); break
      case 'done': h.onDone?.(); break
      case 'error': h.onError?.(data?.error || 'Forecast failed'); break
    }
  }

  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      buf += dec.decode(value, { stream: true })
      let sep: number
      while ((sep = buf.indexOf('\n\n')) >= 0) {
        const frame = buf.slice(0, sep)
        buf = buf.slice(sep + 2)
        let event = 'message'
        const dataLines: string[] = []
        for (const line of frame.split('\n')) {
          if (line.startsWith('event:')) event = line.slice(6).trim()
          else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim())
        }
        if (!dataLines.length) continue
        try { dispatch(event, JSON.parse(dataLines.join('\n'))) } catch { /* skip malformed frame */ }
      }
    }
  } catch (e: any) {
    h.onError?.(e?.message || 'Stream interrupted')
  }
}
