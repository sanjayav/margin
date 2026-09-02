// @vitest-environment jsdom
// The workspace has to survive first paint on the real record: every screen
// computes from the deterministic engine on mount, so a regression here is a
// blank pane rather than a subtle wrong number.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, within, cleanup } from '@testing-library/react'
import TrueRegApp from '../TrueRegApp'
import { useTr } from '../../../truereg/ui/state'

const reset = () => useTr.setState({ surface: 'console', lang: 'en', substituteDefaults: true, clauseSheet: [], termSheet: null, approved: [], messages: [], run: { goal: null, plan: null, narration: '', narrating: false, runtime: null, error: null } })

describe('the TrueReg workspace', () => {
  beforeEach(reset)
  afterEach(cleanup)

  it('opens on a composer, not a wall of explanation', () => {
    render(<TrueRegApp />)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Ask')
    expect(screen.getByLabelText('Ask the agents')).toBeTruthy()
    expect(screen.getAllByText(/曹妃甸厂区/).length).toBeGreaterThan(0)
  })

  it('answers a typed question from the engine alone, with its trace', async () => {
    render(<TrueRegApp />)
    const box = screen.getByLabelText('Ask the agents')
    fireEvent.change(box, { target: { value: 'what is our hot rolled coil embedded emissions figure?' } })
    fireEvent.keyDown(box, { key: 'Enter' })
    // The deterministic answer lands without any model configured.
    await screen.findByText(/Hot-rolled coil is 2\.\d{3} tCO₂e per tonne/, {}, { timeout: 8000 })
    expect(screen.getAllByText('Engine').length).toBeGreaterThan(0)
    expect(screen.getAllByText(/tool call/).length).toBeGreaterThan(0)
  }, 15000)

  it('routes a buyer question to the delta agent and answers in the buyer’s currency', async () => {
    render(<TrueRegApp />)
    const box = screen.getByLabelText('Ask the agents')
    fireEvent.change(box, { target: { value: 'what is it worth to Nordstahl versus the default?' } })
    fireEvent.keyDown(box, { key: 'Enter' })
    await screen.findByText(/save your EU buyers/, {}, { timeout: 8000 })
    expect(screen.getAllByText('Delta agent').length).toBeGreaterThan(0)
  }, 15000)

  it('answers a question asked in Chinese', async () => {
    render(<TrueRegApp />)
    const box = screen.getByLabelText('Ask the agents')
    fireEvent.change(box, { target: { value: '我们的隐含排放是多少？' } })
    fireEvent.keyDown(box, { key: 'Enter' })
    await screen.findByText(/tCO₂e per tonne/, {}, { timeout: 8000 })
  }, 15000)

  it('offers a phone tab bar over the same surfaces as the desktop rail', () => {
    render(<TrueRegApp />)
    const tabs = within(screen.getByRole('navigation', { name: 'Sections' })).getAllByRole('button')
    expect(tabs.map((b) => b.textContent)).toEqual(['Ask', 'The number', 'Exposure', 'Verify', 'Duties'])
  })

  it('states the indicative basis in the chrome rather than burying it', () => {
    render(<TrueRegApp />)
    expect(screen.getByText(/indicative defaults/i)).toBeTruthy()
    expect(screen.getByText(/not the surrendered number/i)).toBeTruthy()
  })

  it('shows the derivation, not just the figure', () => {
    useTr.setState({ surface: 'number' })
    render(<TrueRegApp />)
    expect(screen.getByText(/How Hot-rolled coil was calculated/)).toBeTruthy()
    expect(screen.getAllByText(/tCO₂e\/t =|tCO₂e reported by the operator/).length).toBeGreaterThan(0)
  })

  it('escalates the ambiguous furnace to a person instead of resolving it', () => {
    useTr.setState({ surface: 'number' })
    render(<TrueRegApp />)
    // Named twice by design: once in the lede's meta line, once as the panel.
    expect(screen.getAllByText(/boundary question/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText('2#炼钢电炉').length).toBeGreaterThan(0)
  })

  it('states the buyer’s exposure per EORI, and that the Chinese ETS buys nothing', () => {
    useTr.setState({ surface: 'exposure' })
    render(<TrueRegApp />)
    expect(screen.getByText('DE517402881996314', { exact: false })).toBeTruthy()
    expect(screen.getByText(/No Article 9 deduction is available/)).toBeTruthy()
  })

  it('never shows a readiness score without the blocking findings under it', () => {
    useTr.setState({ surface: 'verify' })
    render(<TrueRegApp />)
    expect(screen.getByText(/Not ready/)).toBeTruthy()
    expect(screen.getAllByText(/blocking/i).length).toBeGreaterThan(0)
  })

  it('reports the authoring metric that proves the graph is regulation-agnostic', () => {
    useTr.setState({ surface: 'duties' })
    render(<TrueRegApp />)
    expect(screen.getByText(/Time to author/)).toBeTruthy()
    expect(screen.getAllByText(/0 code changes/).length).toBe(2)
  })

  it('puts the authentic clause one tap from any assertion', () => {
    useTr.setState({ surface: 'exposure' })
    render(<TrueRegApp />)
    fireEvent.click(screen.getAllByText(/^Article 9$/)[0])
    const sheet = screen.getByRole('dialog', { name: 'Source text' })
    expect(within(sheet).getByText(/Chinese reading aid/)).toBeTruthy()
    expect(within(sheet).getByText(/CELEX 32023R0956/)).toBeTruthy()
  })

  it('switches language without changing a figure', () => {
    useTr.setState({ surface: 'number' })
    const { rerender } = render(<TrueRegApp />)
    const before = screen.getAllByText(/^2\.\d{3}$/).map((n) => n.textContent)
    expect(before.length).toBeGreaterThan(0)
    // The toggle's accessible name is the full explanation, not the glyph.
    fireEvent.click(screen.getByRole('button', { name: /阅读辅助/ }))
    rerender(<TrueRegApp />)
    expect(screen.getAllByText(/^2\.\d{3}$/).map((n) => n.textContent)).toEqual(before)
  })

  it('runs a goal end to end and stops at the human', async () => {
    render(<TrueRegApp />)
    fireEvent.click(screen.getByText('Take a buyer to first declaration'))
    // The plan posts into the same thread as a typed question, and stops at the
    // disclosure — the one step that must never proceed without a person.
    await screen.findByText(/waiting on you · nothing has been sent/, {}, { timeout: 10000 })
    await screen.findAllByText(/Share the emissions record for/, {}, { timeout: 10000 })
    expect(screen.getAllByText('Approve').length).toBeGreaterThan(0)
  }, 20000)
})
