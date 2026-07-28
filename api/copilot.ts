// ───────────────────────────────────────────────────────────────────────────
// /api/copilot — the co-pilot's optional narrative layer.
//
// Given a FINDING already computed by the deterministic engine (headline,
// metrics, recommendation), streams a crisp analyst "take" over SSE. The model
// only frames the numbers it is given — it never invents or alters one, and may
// not contradict the recommendation. If the key is unset the client degrades to
// the engine-computed prose (the finding is already complete without this).
// ───────────────────────────────────────────────────────────────────────────
import Anthropic from '@anthropic-ai/sdk'

const MODEL = 'claude-opus-4-8' // the most capable Claude — the co-pilot's brain
const SYSTEM = `You are AiRE, a senior emissions-compliance analyst. You are handed a FINDING that a deterministic engine has ALREADY computed — a headline, engine-verified metrics (label: value), a severity and a recommendation.

Write a crisp 2–3 sentence analyst take for a compliance lead: what it means, what to weigh, and the first move. Add judgment and framing, not new facts.

HARD RULES — non-negotiable:
- Never invent, alter, round or contradict any number. Reference only the metrics given.
- Never contradict the recommendation; sharpen it.
- Plain prose only: no headers, no bullet lists, no preamble like "Here's my take".
- Be specific and direct; no filler, no hedging clichés.`

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return }
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {}
  const { finding } = body
  if (!finding) { res.status(400).json({ error: 'finding is required' }); return }
  if (!process.env.ANTHROPIC_API_KEY) { res.status(500).json({ error: 'ANTHROPIC_API_KEY is not set on the server.' }); return }

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders?.()
  const send = (event: string, data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const stream = client.messages.stream({
      model: MODEL,
      max_tokens: 400,
      system: SYSTEM,
      messages: [{ role: 'user', content: JSON.stringify(finding) }],
    })
    for await (const ev of stream) {
      if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') send('delta', { text: ev.delta.text })
    }
    send('done', {})
    res.end()
  } catch (e: any) {
    try { send('error', { error: String(e?.message ?? e) }); res.end() }
    catch { if (!res.headersSent) res.status(500).json({ error: String(e?.message ?? e) }) }
  }
}

export const config = { maxDuration: 30 }
