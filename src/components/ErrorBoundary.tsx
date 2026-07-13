// Production guard: one screen throwing must never white-screen the workspace.
// Catches render errors, shows a recoverable card, and lets the user retry or
// switch screens (the boundary resets whenever the screen key changes).
import { Component, type ReactNode } from 'react'
import Icon from './Icon'

interface Props { screenKey: string; children: ReactNode }
interface State { error: Error | null }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error) {
    console.error('[screen crash]', error)
  }

  componentDidUpdate(prev: Props) {
    // navigating to another screen clears the failure
    if (prev.screenKey !== this.props.screenKey && this.state.error) this.setState({ error: null })
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-danger/10 text-danger"><Icon name="alert" size={26} /></span>
        <h2 className="font-display mt-4 text-[18px] font-bold text-ink-100">This screen hit an error</h2>
        <p className="mt-2 text-sm text-ink-400">The rest of the workspace is unaffected — your data and assumptions are safe. Retry, or switch screens from the sidebar.</p>
        <p className="num mx-auto mt-3 max-w-sm truncate rounded-lg bg-black/[0.04] px-3 py-1.5 text-[11px] text-ink-500">{String(this.state.error.message || this.state.error)}</p>
        <button onClick={() => this.setState({ error: null })} className="btn-primary mx-auto mt-5"><Icon name="reset" size={15} /> Retry</button>
      </div>
    )
  }
}
