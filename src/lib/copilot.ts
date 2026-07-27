// ───────────────────────────────────────────────────────────────────────────
// Co-pilot · client · streams the optional "AiRE's take" narrative for a
// finding over SSE (POST /api/copilot). The narrative only frames the
// engine-computed numbers — it never changes one. Degrades gracefully when the
// endpoint is unavailable (e.g. ANTHROPIC_API_KEY unset in local dev).
// ───────────────────────────────────────────────────────────────────────────
export interface CopilotHandlers { onDelta: (text: string) => void; onError: (message: string) => void; onDone: () => void }

export async function streamCopilotTake(finding: unknown, h: CopilotHandlers): Promise<void> {
  let res: Response
  try {
    res = await fetch('/api/copilot', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ finding }) })
  } catch (e: any) { h.onError(e?.message || 'Network error'); return }

  const ct = res.headers.get('content-type') || ''
  if (!res.ok || !ct.includes('text/event-stream') || !res.body) {
    let msg = 'AiRE’s take needs the API — set ANTHROPIC_API_KEY on the server (the finding’s numbers are already engine-proven).'
    try { const j = await res.json(); msg = j.error || msg } catch { /* keep */ }
    h.onError(msg); return
  }

  const reader = res.body.getReader()
  const dec = new TextDecoder()
  let buf = ''
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      buf += dec.decode(value, { stream: true })
      let sep: number
      while ((sep = buf.indexOf('\n\n')) >= 0) {
        const frame = buf.slice(0, sep); buf = buf.slice(sep + 2)
        let event = 'message'; const dataLines: string[] = []
        for (const line of frame.split('\n')) {
          if (line.startsWith('event:')) event = line.slice(6).trim()
          else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim())
        }
        if (!dataLines.length) continue
        try {
          const d = JSON.parse(dataLines.join('\n'))
          if (event === 'delta' && typeof d.text === 'string') h.onDelta(d.text)
          else if (event === 'error') h.onError(d.error || 'Take failed')
          else if (event === 'done') h.onDone()
        } catch { /* skip malformed frame */ }
      }
    }
  } catch (e: any) { h.onError(e?.message || 'Stream interrupted') }
}
