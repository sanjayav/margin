// @vitest-environment jsdom
// Verdict is the answer-first header every module now opens with, so a crash
// here takes out Plan, Forecast, Credit book and Pricing at once. These render
// it the way the screens actually call it, including the degenerate shapes.
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import Verdict from '../Verdict'

afterEach(cleanup)

describe('Verdict', () => {
  it('leads with the question, the sentence and the figure', () => {
    render(
      <Verdict
        question="Where does India sit against the line?"
        headline={<>3 of 13 manufacturers are over the line.</>}
        figure="₹1,240 Cr"
        figureUnit="exposed at today's book"
        tone="bad"
      />,
    )
    expect(screen.getByText(/Where does India sit/)).toBeTruthy()
    expect(screen.getByText(/3 of 13 manufacturers/)).toBeTruthy()
    expect(screen.getByText('₹1,240 Cr')).toBeTruthy()
  })

  it('renders without stats, action or footnote — the minimum a screen can pass', () => {
    const { container } = render(<Verdict question="Q" headline="H" figure="0" />)
    expect(container.querySelector('[data-testid="verdict"]')).toBeTruthy()
  })

  it('shows at most three supporting figures', () => {
    // More than three stops being a headline and starts being the KPI strip the
    // Verdict exists to replace, so the component caps it rather than trusting
    // the caller.
    render(
      <Verdict question="Q" headline="H" figure="0"
        stats={[
          { label: 'One', value: '1' }, { label: 'Two', value: '2' },
          { label: 'Three', value: '3' }, { label: 'Four', value: '4' },
        ]} />,
    )
    expect(screen.queryByText('Four')).toBeNull()
    expect(screen.getByText('Three')).toBeTruthy()
  })

  it('offers a trace affordance only for figures that have provenance', () => {
    let traced = 0
    render(
      <Verdict question="Q" headline="H" figure="0"
        stats={[
          { label: 'Traceable', value: '1', onTrace: () => { traced += 1 } },
          { label: 'Plain', value: '2' },
        ]} />,
    )
    const traces = screen.getAllByText('trace')
    expect(traces).toHaveLength(1)
    fireEvent.click(traces[0])
    expect(traced).toBe(1)
  })

  it('fires the single primary action', () => {
    let clicked = 0
    render(<Verdict question="Q" headline="H" figure="0" action={{ label: 'Get under the line', onClick: () => { clicked += 1 } }} />)
    fireEvent.click(screen.getByText(/Get under the line/))
    expect(clicked).toBe(1)
  })
})
