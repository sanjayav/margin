// Prompt-cache breakpoints.
//
// This is a cost-correctness property, and cost defects are silent: a wrong
// breakpoint produces the same answers at several times the price, so nothing
// fails and nobody notices until the bill arrives. That is how agent runs came
// to cost dollars apiece — every turn re-sent the whole transcript at full
// input rate, paying for the first turn's tool results a dozen times over.
//
// Two rules carry the saving, and both are asserted here:
//   · exactly one rolling breakpoint exists, at the END of the transcript, so
//     each turn reads everything before it from cache
//   · the PREVIOUS turn's breakpoint is cleared, because a stale one both burns
//     one of the four available slots and pays to write a prefix that nothing
//     will ever read again
import { describe, it, expect } from 'vitest'
import { rollCacheBreakpoint } from '../agents.js'

/** Every block in `messages` carrying a cache_control marker. */
const marked = (messages: any[]) =>
  messages.flatMap((m, mi) =>
    (Array.isArray(m.content) ? m.content : [])
      .map((b: any, bi: number) => (b?.cache_control ? { mi, bi } : null))
      .filter(Boolean),
  )

/** The shape a turn actually appends: an assistant turn, then its tool results. */
const turn = (n: number) => [
  { role: 'assistant', content: [{ type: 'tool_use', id: `t${n}`, name: 'position', input: {} }] },
  { role: 'user', content: [{ type: 'tool_result', tool_use_id: `t${n}`, content: `result ${n}` }] },
]

describe('rollCacheBreakpoint', () => {
  it('marks the final block of the transcript', () => {
    const messages: any[] = [{ role: 'user', content: 'Run your standard pass.' }, ...turn(1)]
    rollCacheBreakpoint(messages)

    expect(marked(messages)).toEqual([{ mi: 2, bi: 0 }])
    expect(messages[2].content[0].cache_control).toEqual({ type: 'ephemeral' })
  })

  it('moves the breakpoint forward instead of accumulating them', () => {
    const messages: any[] = [{ role: 'user', content: 'Run your standard pass.' }]

    // Four turns of a real pass. After each, exactly one marker should exist,
    // and it should sit on the newest content.
    for (let n = 1; n <= 4; n++) {
      messages.push(...turn(n))
      rollCacheBreakpoint(messages)

      const hits = marked(messages)
      expect(hits).toHaveLength(1)
      expect(hits[0]).toEqual({ mi: messages.length - 1, bi: 0 })
    }
  })

  it('leaves a string-content message alone rather than crashing on it', () => {
    // The opening user message is a bare string, not a block array — it is far
    // too small to be worth a breakpoint and must not throw when scanned.
    const messages: any[] = [{ role: 'user', content: 'Run your standard pass.' }]
    expect(() => rollCacheBreakpoint(messages)).not.toThrow()
    expect(marked(messages)).toEqual([])
  })

  it('marks the last block when a turn carries several', () => {
    // A turn with parallel tool calls returns several results in one message.
    // Caching must cover all of them, so the marker belongs on the last.
    const messages: any[] = [
      { role: 'user', content: 'go' },
      { role: 'assistant', content: [{ type: 'tool_use', id: 'a', name: 'position', input: {} }] },
      {
        role: 'user',
        content: [
          { type: 'tool_result', tool_use_id: 'a', content: 'one' },
          { type: 'tool_result', tool_use_id: 'b', content: 'two' },
          { type: 'tool_result', tool_use_id: 'c', content: 'three' },
        ],
      },
    ]
    rollCacheBreakpoint(messages)
    expect(marked(messages)).toEqual([{ mi: 2, bi: 2 }])
  })

  it('clears a marker left behind by an earlier call', () => {
    // Directly asserts the stale-breakpoint case, since that is the one that
    // costs money rather than failing.
    const messages: any[] = [{ role: 'user', content: 'go' }, ...turn(1)]
    rollCacheBreakpoint(messages)
    const stale = messages[2].content[0]
    expect(stale.cache_control).toBeDefined()

    messages.push(...turn(2))
    rollCacheBreakpoint(messages)

    expect(stale.cache_control).toBeUndefined()
    expect(marked(messages)).toHaveLength(1)
  })
})
