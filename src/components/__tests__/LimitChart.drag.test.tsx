// @vitest-environment jsdom
// REGRESSION · dragging a bubble must not also drill into it.
//
// The bug: `click` fires AFTER `pointerup`, and endDrag cleared dragRef on
// pointerup. The click guard read `!dragRef.current?.moved` — which on a cleared
// ref is `!undefined` = true — so every drag ALSO called onPick and the drill
// jumped a level. The user dragged a maker to a target and landed inside its
// model list instead of seeing the maker move.
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import LimitChart, { type ChartPoint, type DragConfig } from '../LimitChart'
import { EU } from '../../engine/rulepacks/eu'

afterEach(cleanup)

const points: ChartPoint[] = [
  { key: 'Alpha', label: 'Alpha', mass: 1600, metric: 120, units: 500_000, status: 'fine' },
  { key: 'Beta', label: 'Beta', mass: 1800, metric: 90, units: 300_000, status: 'compliant' },
]
const limitAt = (mass: number) => 93.6 - 0.0144 * (mass - 1609.6)

function setup(over: Partial<DragConfig> = {}) {
  const onPick = vi.fn()
  const commit = vi.fn()
  const drag: DragConfig = { enabled: () => true, preview: () => ['x'], commit, ...over }
  const { container } = render(
    <LimitChart pack={EU} limitAt={limitAt} points={points} onPick={onPick} drag={drag} />,
  )
  const svg = container.querySelector('svg')!
  // the bubble groups carry the pointer handlers; the first is the largest point
  const groups = [...container.querySelectorAll('g')].filter((g) => g.getAttribute('style')?.includes('cursor'))
  return { onPick, commit, svg, group: groups[0], container }
}

// jsdom has no layout, so getBoundingClientRect is all zeros and the chart's
// client→domain maths would divide by zero. Give the svg a real box.
function box(svg: SVGSVGElement) {
  svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 760, height: 360, right: 760, bottom: 360, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect
}

describe('LimitChart · drag vs click', () => {
  it('a plain click drills (onPick fires)', () => {
    const { onPick, group } = setup()
    fireEvent.pointerDown(group, { clientX: 100, clientY: 100, pointerId: 1 })
    fireEvent.pointerUp(group, { clientX: 100, clientY: 100, pointerId: 1 })
    fireEvent.click(group)
    expect(onPick).toHaveBeenCalledTimes(1)
  })

  it('a DRAG does not drill — it commits the move instead', () => {
    const { onPick, commit, svg, group } = setup()
    box(svg)
    fireEvent.pointerDown(group, { clientX: 100, clientY: 100, pointerId: 1 })
    fireEvent.pointerMove(svg, { clientX: 260, clientY: 40, pointerId: 1 })
    fireEvent.pointerUp(svg, { clientX: 260, clientY: 40, pointerId: 1 })
    fireEvent.click(group) // the browser always follows pointerup with click
    expect(commit).toHaveBeenCalledTimes(1)
    expect(onPick).not.toHaveBeenCalled()
  })

  it('a drag consumes exactly one click — the next plain click still drills', () => {
    const { onPick, svg, group } = setup()
    box(svg)
    fireEvent.pointerDown(group, { clientX: 100, clientY: 100, pointerId: 1 })
    fireEvent.pointerMove(svg, { clientX: 260, clientY: 40, pointerId: 1 })
    fireEvent.pointerUp(svg, { clientX: 260, clientY: 40, pointerId: 1 })
    fireEvent.click(group)
    expect(onPick).not.toHaveBeenCalled()

    fireEvent.pointerDown(group, { clientX: 100, clientY: 100, pointerId: 2 })
    fireEvent.pointerUp(group, { clientX: 100, clientY: 100, pointerId: 2 })
    fireEvent.click(group)
    expect(onPick).toHaveBeenCalledTimes(1)
  })

  it('a drag that ends off-canvas cannot swallow a later unrelated click', () => {
    const { onPick, svg, group } = setup()
    box(svg)
    fireEvent.pointerDown(group, { clientX: 100, clientY: 100, pointerId: 1 })
    fireEvent.pointerMove(svg, { clientX: 260, clientY: 40, pointerId: 1 })
    fireEvent.pointerLeave(svg) // drag abandoned, no click follows
    fireEvent.pointerDown(group, { clientX: 100, clientY: 100, pointerId: 2 })
    fireEvent.pointerUp(group, { clientX: 100, clientY: 100, pointerId: 2 })
    fireEvent.click(group)
    expect(onPick).toHaveBeenCalledTimes(1)
  })

  it('draws a move trace from the origin when a point has been moved', () => {
    const onPick = vi.fn()
    const { container } = render(
      <LimitChart pack={EU} limitAt={limitAt} points={points} onPick={onPick}
        moved={new Map([['Alpha', { mass: 1500, metric: 140 }]])} />,
    )
    expect(container.querySelectorAll('.lc-move').length).toBe(1)
  })

  it('draws no trace when nothing has moved', () => {
    const { container } = render(<LimitChart pack={EU} limitAt={limitAt} points={points} moved={new Map()} />)
    expect(container.querySelectorAll('.lc-move').length).toBe(0)
  })
})
