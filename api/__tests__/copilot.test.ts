// The co-pilot route's contract, driven with a scripted model so it is
// repeatable and costs nothing. What matters here is not what Claude says — it
// is that the route refuses an unauthenticated caller, that every tool call
// reaches the client with its provenance attached, that entitlements are
// enforced on the server rather than requested in a prompt, and that a proposed
// workspace change arrives staged rather than applied.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { hashPassword, issue } from '../_auth.js'
import { _reset } from '../_ratelimit.js'

// ── a scripted Anthropic client ─────────────────────────────────────────────
type Ev = Record<string, any>
interface Scripted { events: Ev[]; final: Ev }
const script: Scripted[] = []
const seen: any[] = []

function fakeStream(s: Scripted) {
  return {
    async *[Symbol.asyncIterator]() { for (const e of s.events) yield e },
    finalMessage: async () => s.final,
  }
}

vi.mock('@anthropic-ai/sdk', () => {
  class MockAnthropic {
    beta = { messages: { stream: (p: any) => { seen.push(p); return fakeStream(script.shift()!) } } }
    messages = { stream: (p: any) => { seen.push(p); return fakeStream(script.shift()!) } }
    constructor(_opts: any) { /* key checked by the route, not here */ }
  }
  return { default: MockAnthropic }
})

const { default: handler } = await import('../copilot.js')

// ── req/res shims ───────────────────────────────────────────────────────────
const USER = { email: 'a@oem.com', name: 'A', workspace: 'ws-a', passwordHash: hashPassword('x') }

function fakeRes() {
  const out = { code: 200, body: undefined as any, headers: {} as Record<string, string>, sse: '', ended: false }
  return {
    out,
    statusCode: 200,
    status(c: number) { out.code = c; return this },
    json(b: any) { out.body = b; out.ended = true; return this },
    setHeader(k: string, v: string) { out.headers[k] = v },
    flushHeaders() { /* noop */ },
    write(chunk: string) { out.sse += chunk },
    end() { out.ended = true },
    get headersSent() { return out.sse.length > 0 },
  }
}

const req = (body: any, authed = true) => ({
  method: 'POST', body,
  headers: authed ? { cookie: `ul_session=${issue(USER)}` } : {},
})

/** Parse the SSE body back into typed frames. */
function frames(sse: string): { event: string; data: any }[] {
  return sse.split('\n\n').filter(Boolean).map((f) => {
    const ev = /^event: (.*)$/m.exec(f)?.[1] ?? 'message'
    const data = /^data: (.*)$/m.exec(f)?.[1] ?? '{}'
    return { event: ev, data: JSON.parse(data) }
  })
}

const textDelta = (t: string) => ({ type: 'content_block_delta', delta: { type: 'text_delta', text: t } })
const toolBlock = (id: string, name: string, input: any) => ({ type: 'tool_use', id, name, input })

beforeEach(() => {
  script.length = 0
  seen.length = 0
  _reset()
  process.env.ANTHROPIC_API_KEY = 'test-key'
})

describe('the route refuses before it spends anything', () => {
  it('401s an unauthenticated caller', async () => {
    const res = fakeRes()
    await handler(req({ message: 'hi' }, false), res)
    expect(res.out.code).toBe(401)
    expect(script.length).toBe(0)
  })

  it('refuses when no model key is configured, rather than failing mid-stream', async () => {
    delete process.env.ANTHROPIC_API_KEY
    const res = fakeRes()
    await handler(req({ message: 'hi' }), res)
    expect(res.out.code).toBe(500)
    expect(res.out.body.error).toMatch(/ANTHROPIC_API_KEY/)
  })

  it('rejects a non-POST', async () => {
    const res = fakeRes()
    await handler({ ...req({}), method: 'GET' }, res)
    expect(res.out.code).toBe(405)
  })
})

describe('the streaming tool loop', () => {
  it('streams reasoning, the tool trace with provenance, the answer, and a usage total', async () => {
    script.push({
      events: [
        { type: 'content_block_start', content_block: { type: 'thinking' } },
        { type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: 'check the position first' } },
        { type: 'content_block_start', index: 1, content_block: toolBlock('t1', 'get_position', { country: 'EU', year: 2025 }) },
      ],
      final: {
        stop_reason: 'tool_use',
        content: [toolBlock('t1', 'get_position', { country: 'EU', year: 2025 })],
        usage: { input_tokens: 900, output_tokens: 40, cache_read_input_tokens: 0 },
      },
    })
    script.push({
      events: [textDelta('Volkswagen is the most exposed.')],
      final: { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Volkswagen is the most exposed.' }], usage: { input_tokens: 1200, output_tokens: 60, cache_read_input_tokens: 900 } },
    })

    const res = fakeRes()
    await handler(req({ message: 'who is most exposed?', context: { country: 'EU', ownedModules: ['EU'], pooling: true } }), res)
    const f = frames(res.out.sse)
    const names = f.map((x) => x.event)

    expect(names[0]).toBe('ready')
    expect(names).toContain('thinking')
    expect(names).toContain('tool_start')
    expect(names).toContain('tool_end')
    expect(names).toContain('text')
    expect(names[names.length - 1]).toBe('done')

    const end = f.find((x) => x.event === 'tool_end')!.data
    expect(end.name).toBe('get_position')
    expect(end.ok).toBe(true)
    // The audit trail is the product: inputs, timing and dataset provenance.
    expect(end.inputs.country).toBe('EU')
    expect(typeof end.ms).toBe('number')
    expect(end.provenance.rulePack).toBe('EU')
    expect(end.provenance.dataVersion).toBeTruthy()
    expect(['market', 'partial', 'preview']).toContain(end.provenance.coverage)
    expect(end.value.marketFine).toBeGreaterThanOrEqual(0)

    const done = f[f.length - 1].data
    expect(done.stopReason).toBe('end_turn')
    expect(done.usage.input).toBe(2100)
    expect(done.toolCalls).toBe(1)
  })

  it('sends the model a compact result but the client the full envelope', async () => {
    script.push({
      events: [],
      final: { stop_reason: 'tool_use', content: [toolBlock('t1', 'get_position', { country: 'EU', year: 2025 })], usage: {} },
    })
    script.push({ events: [textDelta('ok')], final: { stop_reason: 'end_turn', content: [], usage: {} } })

    const res = fakeRes()
    await handler(req({ message: 'q', context: { ownedModules: ['EU'] } }), res)

    const followUp = seen[1].messages.at(-1)
    const payload = JSON.parse(followUp.content[0].content)
    expect(payload._provenance.dataset).toBeTruthy()
    expect(payload._provenance.coverage).toBeTruthy()
    // The model gets the numbers and the dataset, not the audit chrome.
    expect(payload.ms).toBeUndefined()
    expect(payload.tool).toBeUndefined()
  })

  it('hands a tool failure back as information the model can act on', async () => {
    script.push({
      events: [],
      final: { stop_reason: 'tool_use', content: [toolBlock('t1', 'get_position', { country: 'EU', maker: 'Nonexistent Motors' })], usage: {} },
    })
    script.push({ events: [textDelta('I could not find that maker.')], final: { stop_reason: 'end_turn', content: [], usage: {} } })

    const res = fakeRes()
    await handler(req({ message: 'q', context: { ownedModules: ['EU'] } }), res)

    const end = frames(res.out.sse).find((x) => x.event === 'tool_end')!.data
    expect(end.ok).toBe(false)
    expect(end.error.code).toBe('maker_not_found')
    const result = seen[1].messages.at(-1).content[0]
    expect(result.is_error).toBe(true)
  })
})

describe('entitlements are enforced on the server', () => {
  it('refuses a market the workspace has not subscribed to, whatever the model asks for', async () => {
    script.push({
      events: [],
      final: { stop_reason: 'tool_use', content: [toolBlock('t1', 'get_position', { country: 'IN', year: 2027 })], usage: {} },
    })
    script.push({ events: [textDelta('That market is not on this subscription.')], final: { stop_reason: 'end_turn', content: [], usage: {} } })

    const res = fakeRes()
    await handler(req({ message: 'how is India doing?', context: { ownedModules: ['EU'], pooling: true } }), res)

    const end = frames(res.out.sse).find((x) => x.event === 'tool_end')!.data
    expect(end.ok).toBe(false)
    expect(end.error.code).toBe('not_entitled')
  })

  it('tells the model, in the prompt, only about the markets it may use', async () => {
    script.push({ events: [textDelta('hi')], final: { stop_reason: 'end_turn', content: [], usage: {} } })
    const res = fakeRes()
    await handler(req({ message: 'q', context: { ownedModules: ['EU', 'UK'], pooling: false } }), res)

    const doctrine = seen[0].system[0].text
    expect(doctrine).toContain('subscribed to: EU, UK')
    expect(doctrine).toContain('Pooling & credit-market add-on is NOT active')
    expect(doctrine).not.toContain('- India (IN)')
  })
})

describe('workspace changes are proposed, not applied', () => {
  it('streams the change as an action for the user to approve', async () => {
    script.push({
      events: [],
      final: {
        stop_reason: 'tool_use',
        content: [toolBlock('t1', 'update_workspace', { country: 'EU', screen: 'analyse', year: 2025, why: 'show the book of record' })],
        usage: {},
      },
    })
    script.push({ events: [textDelta('Opening Plan.')], final: { stop_reason: 'end_turn', content: [], usage: {} } })

    const res = fakeRes()
    await handler(req({ message: 'open the plan', context: { ownedModules: ['EU'] } }), res)

    const action = frames(res.out.sse).find((x) => x.event === 'action')!.data.action
    expect(action.screen).toBe('analyse')
    expect(action.why).toBe('show the book of record')
  })
})

describe('request shape', () => {
  it('asks for adaptive thinking, high effort and a cached doctrine block', async () => {
    script.push({ events: [textDelta('hi')], final: { stop_reason: 'end_turn', content: [], usage: {} } })
    await handler(req({ message: 'q', context: { ownedModules: ['EU'] } }), fakeRes())

    const p = seen[0]
    expect(p.model).toBe('claude-opus-5')
    expect(p.thinking).toEqual({ type: 'adaptive', display: 'summarized' })
    expect(p.output_config.effort).toBe('high')
    // Stable doctrine is cached; the volatile situation block sits after it.
    expect(p.system[0].cache_control).toEqual({ type: 'ephemeral' })
    expect(p.system[1].cache_control).toBeUndefined()
    expect(p.system[1].text).toMatch(/Right now the user is looking at/)
    expect(p.tools.length).toBeGreaterThan(10)
    // No sampling parameters — they are rejected on this model.
    expect(p.temperature).toBeUndefined()
    expect(p.top_p).toBeUndefined()
  })

  it('surfaces a policy refusal as a readable message rather than an empty answer', async () => {
    script.push({ events: [], final: { stop_reason: 'refusal', content: [], usage: {} } })
    const res = fakeRes()
    await handler(req({ message: 'q', context: { ownedModules: ['EU'] } }), res)
    const err = frames(res.out.sse).find((x) => x.event === 'error')!.data
    expect(err.error).toMatch(/declined/i)
  })
})

describe("mode 'take' — framing a finding the engine already computed", () => {
  it('streams prose deltas and never receives tools', async () => {
    script.push({ events: [textDelta('This is the one to fix first.')], final: { stop_reason: 'end_turn', content: [], usage: {} } })
    const res = fakeRes()
    await handler(req({ mode: 'take', finding: { headline: 'X breaches', metrics: ['Gap: +4.2'] } }), res)

    const f = frames(res.out.sse)
    expect(f.map((x) => x.event)).toEqual(['delta', 'done'])
    expect(f[0].data.text).toMatch(/fix first/)
    expect(seen[0].tools).toBeUndefined()
    expect(seen[0].system).toMatch(/never invent, alter, round or contradict/i)
  })
})
