// @vitest-environment jsdom
// The per-model request rules are not cosmetic: sending `effort` to a model
// that has none, or adaptive thinking to a pre-4.6 model, is a 400 from the API
// rather than a degraded answer — so they are asserted rather than trusted.
import { describe, it, expect } from 'vitest'
import { DEFAULT_EFFORT, DEFAULT_MODEL, MODELS, getModel, modelParams, estimateTurnCostUsd } from '../agents/models'
import { readAttachment, summariseIntake, forWire, MAX_FILE_BYTES } from '../agents/attachments'

describe('model catalogue', () => {
  it('defaults to Opus 5 at high effort — what the agents are tuned for', () => {
    expect(DEFAULT_MODEL).toBe('claude-opus-5')
    expect(DEFAULT_EFFORT).toBe('high')
    expect(getModel('nonsense').id).toBe('claude-opus-5')
  })

  it('sends effort and adaptive thinking to models that take them', () => {
    const p = modelParams('claude-opus-5', 'xhigh') as any
    expect(p.model).toBe('claude-opus-5')
    expect(p.output_config).toEqual({ effort: 'xhigh' })
    // Summarised, or the client sees a silent pause instead of reasoning.
    expect(p.thinking).toEqual({ type: 'adaptive', display: 'summarized' })
  })

  it('sends neither to Haiku 4.5, which rejects both', () => {
    const p = modelParams('claude-haiku-4-5', 'max') as any
    expect(p.model).toBe('claude-haiku-4-5')
    expect(p.output_config).toBeUndefined()
    expect(p.thinking).toBeUndefined()
  })

  it('never emits a budget_tokens thinking config — removed on this generation', () => {
    for (const m of MODELS) {
      const p = modelParams(m.id, 'high') as any
      expect(JSON.stringify(p ?? {})).not.toMatch(/budget_tokens/)
    }
  })

  it('prices a turn in the right order across the tiers', () => {
    const cost = (id: any) => estimateTurnCostUsd(id)
    expect(cost('claude-fable-5')).toBeGreaterThan(cost('claude-opus-5'))
    expect(cost('claude-opus-5')).toBeGreaterThan(cost('claude-sonnet-5'))
    expect(cost('claude-sonnet-5')).toBeGreaterThan(cost('claude-haiku-4-5'))
  })
})

describe('attachments', () => {
  const csv = new File(
    ['日期,焦炭消耗量(t),电力(MWh)\n2026-01-01,2100,378\n2026-01-02,2140,381'],
    '2#高炉_日志.csv', { type: 'text/csv' },
  )

  it('parses a spreadsheet in the browser, keeping the plant’s own headings', async () => {
    const a = await readAttachment(csv)
    expect(a.error).toBeUndefined()
    expect(a.kind).toBe('table')
    expect(a.sheets?.[0].rows).toBe(2)
    expect(a.sheets?.[0].headers).toContain('焦炭消耗量(t)')
    // The parsed text travels, not the raw bytes — paying twice for the same
    // content is the easy mistake here.
    expect(forWire(a).data).toBeUndefined()
    expect(forWire(a).text).toContain('焦炭消耗量')
  })

  it('refuses a file it cannot read rather than sending something misleading', async () => {
    const bad = await readAttachment(new File(['x'], 'plant.dwg', { type: 'application/acad' }))
    expect(bad.kind).toBe('unsupported')
    expect(bad.error).toMatch(/Spreadsheets, CSV, PDF/)
  })

  it('rejects a file over the per-file cap before reading it', async () => {
    const big = new File([new Uint8Array(8)], 'huge.pdf', { type: 'application/pdf' })
    Object.defineProperty(big, 'size', { value: MAX_FILE_BYTES + 1 })
    expect((await readAttachment(big)).error).toMatch(/Too large/)
  })

  it('reports shape, and refuses to infer meaning', async () => {
    const pdf = await readAttachment(new File([new Uint8Array(64)], '电费发票.pdf', { type: 'application/pdf' }))
    const s = summariseIntake([await readAttachment(csv), pdf])
    expect(s.headline).toMatch(/2 rows structured|rows structured/)
    // The whole point: nothing lands in the record on an upload.
    expect(s.headline).toMatch(/Nothing has been written to the record yet/)
    expect(s.openQuestions.join(' ')).toMatch(/Which process unit does each column belong to/)
    expect(s.openQuestions.join(' ')).toMatch(/need a model to read/)
  })
})
