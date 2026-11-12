// @vitest-environment jsdom
// The per-model request rules are not cosmetic: sending `effort` to a model
// that has none, or adaptive thinking to a pre-4.6 model, is a 400 from the API
// rather than a degraded answer — so they are asserted rather than trusted.
import { describe, it, expect } from 'vitest'
import { DEFAULT_EFFORT, DEFAULT_MODEL, MODELS, getModel, modelParams, estimateTurnCostUsd } from '../agents/models'
import { readAttachment, summariseIntake, forWire, MAX_FILE_BYTES } from '../agents/attachments'

describe('model catalogue', () => {
  it('runs Claude Sonnet 5.5 only, at high effort', () => {
    expect(MODELS.map((m) => m.id)).toEqual(['claude-sonnet-5-5'])
    expect(DEFAULT_MODEL).toBe('claude-sonnet-5-5')
    expect(DEFAULT_EFFORT).toBe('high')
    // Anything the client names is clamped back to the one model.
    expect(getModel('claude-opus-5').id).toBe('claude-sonnet-5-5')
    expect(getModel('nonsense').id).toBe('claude-sonnet-5-5')
  })

  it('sends effort and summarised adaptive thinking', () => {
    const p = modelParams('claude-sonnet-5-5', 'xhigh') as any
    expect(p.model).toBe('claude-sonnet-5-5')
    expect(p.output_config).toEqual({ effort: 'xhigh' })
    // Summarised, or the client sees a silent pause instead of reasoning.
    expect(p.thinking).toEqual({ type: 'adaptive', display: 'summarized' })
  })

  it('never emits a config Sonnet 5.5 rejects', () => {
    for (const m of MODELS) {
      const s = JSON.stringify(modelParams(m.id, 'high') ?? {})
      expect(s).not.toMatch(/budget_tokens|"disabled"|temperature|top_p|top_k/)
    }
  })

  it('prices a turn from the Sonnet rate card', () => {
    // 12k in × $2/M + 900 out × $10/M
    expect(estimateTurnCostUsd('claude-sonnet-5-5')).toBeCloseTo(0.033, 5)
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
