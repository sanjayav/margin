/* A module that throws must not take the workspace with it. The boundary is
   keyed to the module, so navigating away clears the error rather than
   stranding the user on a dead screen. */
import React from 'react'
import { Button, Callout } from '../design/primitives'
import Icon from '../design/icons'

interface Props { screenKey: string; children: React.ReactNode }
interface State { error: Error | null; key: string }

export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null, key: this.props.screenKey }

  static getDerivedStateFromError(error: Error): Partial<State> { return { error } }
  static getDerivedStateFromProps(p: Props, s: State): Partial<State> | null {
    return p.screenKey !== s.key ? { error: null, key: p.screenKey } : null
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`[module:${this.props.screenKey}]`, error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="mx-auto max-w-[560px] px-6 py-16">
        <Callout tone="neg" icon={<Icon name="alert" size={15} />} title="This module could not be rendered">
          <p className="mb-3">{this.state.error.message}</p>
          <p className="mb-3 text-[11px] text-[var(--ink-4)]">
            Nothing has been changed. The rest of the workspace is unaffected — switch modules, or reload to try again.
          </p>
          <Button size="sm" variant="secondary" icon={<Icon name="refresh" size={13} />}
            onClick={() => this.setState({ error: null })}>Try again</Button>
        </Callout>
      </div>
    )
  }
}
