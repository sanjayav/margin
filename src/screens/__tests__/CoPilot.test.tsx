// @vitest-environment jsdom
// The console has to survive first paint on a real rule pack: the briefing scan
// runs synchronously on mount, so a regression there is a blank screen rather
// than a subtle wrong number.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, within, cleanup } from '@testing-library/react'
import CoPilot from '../CoPilot'
import { useStore } from '../../state/store'
import { useCopilot } from '../../lib/copilot'

// jsdom implements no scrolling; the console autoscrolls the transcript.
if (!Element.prototype.scrollTo) Element.prototype.scrollTo = () => {}

// vitest runs without `globals`, so testing-library's auto-cleanup is not wired.
afterEach(cleanup)

beforeEach(() => {
  useCopilot.getState().reset()
  useStore.setState({ country: 'EU', subscribedModules: ['EU', 'UK'], poolingAddon: true, screen: 'copilot' })
})

describe('the co-pilot console', () => {
  it('mounts on the landing state and names the market', () => {
    render(<CoPilot />)
    expect(screen.getAllByText(/European Union/).length).toBeGreaterThan(0)
    expect(screen.getByPlaceholderText(/Ask AiRE about European Union/)).toBeTruthy()
  })

  it('paints the briefing rail from the deterministic scan', () => {
    render(<CoPilot />)
    const rail = screen.getByText(/Standing briefing/).closest('aside')!
    expect(within(rail).getAllByRole('button').length).toBeGreaterThan(1)
    expect(within(rail).getAllByText(/Ask AiRE/).length).toBeGreaterThan(0)
  })

  it('states the dataset coverage tier up front, so a preview fleet is never mistaken for a market position', () => {
    render(<CoPilot />)
    expect(screen.getByText(/^(Market data|Covered scope|Preview)$/)).toBeTruthy()
  })

  it('opens the evidence panel on its empty state rather than a blank pane', () => {
    render(<CoPilot />)
    expect(screen.getByText(/The working, not just the answer/)).toBeTruthy()
  })

  it('renders a completed turn with its tool trace and evidence affordance', () => {
    useCopilot.setState({
      turns: [
        { id: 'u1', role: 'user', content: 'who is most exposed?', thinking: '', tools: [], actions: [], status: 'done', at: Date.now() },
        {
          id: 'a1', role: 'assistant', content: 'Volkswagen carries the largest exposure.', thinking: 'checked the position',
          tools: [{ id: 't1', name: 'get_position', ok: true, ms: 12, inputs: { country: 'EU', year: 2025 }, provenance: { dataVersion: 'v1', refreshed: null, rulePack: 'EU', basis: 'actuals', coverage: 'market', source: 'EEA' } }],
          actions: [], status: 'done', at: Date.now(), model: 'claude-opus-5',
        },
      ],
    })
    render(<CoPilot />)
    expect(screen.getByText(/Volkswagen carries the largest exposure/)).toBeTruthy()
    expect(screen.getAllByText(/Reading the position/).length).toBeGreaterThan(0)
    expect(screen.getByText(/1 engine call/)).toBeTruthy()
    expect(screen.getAllByText(/Evidence/).length).toBeGreaterThan(0)
  })

  it('shows a proposed workspace change as something to approve, not something done', () => {
    useCopilot.setState({
      turns: [{
        id: 'a2', role: 'assistant', content: 'Opening the Plan.', thinking: '', tools: [], status: 'done', at: Date.now(),
        actions: [{ action: { screen: 'analyse', year: 2025, why: 'show the book of record' }, state: 'staged' }],
      }],
    })
    render(<CoPilot />)
    expect(screen.getByText(/1 change proposed/)).toBeTruthy()
    expect(screen.getByText('Apply')).toBeTruthy()
    expect(screen.getByText(/show the book of record/)).toBeTruthy()
  })
})
