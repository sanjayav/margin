/* ───────────────────────────────────────────────────────────────────────────
   AgentPrompt — the "ask the agent" surface.
   ---------------------------------------------------------------------------
   Every module has a moment where you stop reading and start asking. That
   moment was a plain textarea in a plain card, which made the most distinctive
   thing in the product look like a contact form.

   What earns its place here, and why:

     · SUGGESTIONS. An empty prompt is the hardest thing to fill in. The chips
       are generated from the market and the live position, so they are the
       questions this workspace can actually answer today — not placeholder
       copy. Clicking one fills the field rather than firing, because a prompt
       you cannot edit is a button pretending to be a prompt.
     · A LIVE SURFACE. A slow aurora and an orbiting mark say "something here
       is running" without a spinner. It is low-contrast on purpose: readable
       text is not negotiable for a decorative background.
     · STATE. Idle, focused, running and blocked all look different, because
       "I pressed it and nothing happened" is the failure this replaces.
   ─────────────────────────────────────────────────────────────────────────── */
import React, { useEffect, useRef, useState } from 'react'
import { Badge, Button, Kbd, Tooltip, cx } from '../../design/primitives'
import Icon from '../../design/icons'
import { prefersReducedMotion } from '../../design/motion'
import type { AgentDef } from '../kernel'

export interface Suggestion { label: string; prompt: string }

export function AgentPrompt({
  agent, value, onChange, onRun, busy, disabled, suggestions = [], hint, footnote,
}: {
  agent: AgentDef
  value: string
  onChange: (v: string) => void
  onRun: () => void
  busy?: boolean
  disabled?: boolean
  suggestions?: Suggestion[]
  hint?: string
  footnote?: React.ReactNode
}) {
  const [focused, setFocused] = useState(false)
  const ref = useRef<HTMLTextAreaElement>(null)
  const still = prefersReducedMotion()

  // Grow with the content rather than scrolling inside four lines.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = '0px'
    el.style.height = `${Math.min(180, Math.max(58, el.scrollHeight))}px`
  }, [value])

  const canRun = !!value.trim() && !disabled && !busy

  return (
    <div className={cx(
      'aurora relative overflow-hidden rounded-[var(--r-xl)] border transition-[border-color,box-shadow] duration-base ease-std',
      focused
        ? 'border-[var(--agent-line)] shadow-[var(--sh-3)]'
        : 'border-[var(--line)] shadow-[var(--sh-1)]',
    )} style={{ background: 'var(--surface-1)' }}>
      {/* the running strip — a state, not a spinner in a corner */}
      {busy && (
        <span aria-hidden className="absolute inset-x-0 top-0 h-[2px]"
          style={{
            background: 'linear-gradient(90deg, transparent, var(--agent), var(--brand), transparent)',
            backgroundSize: '200% 100%',
            animation: still ? undefined : 'aire-shimmer 1.6s linear infinite',
          }} />
      )}

      <div className="relative flex flex-col gap-3 p-4 lg:flex-row lg:items-start">
        {/* the agent, orbiting */}
        <span className="relative mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-[var(--r-lg)]"
          style={{ background: 'var(--agent-tint)', color: agent.accent }}>
          <Icon name="agent" size={18} />
          {!still && (
            <span aria-hidden className="absolute inset-[-5px] rounded-[14px]"
              style={{ animation: busy ? 'aire-orbit 2.4s linear infinite' : 'aire-orbit 9s linear infinite' }}>
              <span className="absolute left-1/2 top-0 h-[3.5px] w-[3.5px] -translate-x-1/2 rounded-full"
                style={{ background: agent.accent, opacity: busy ? 1 : 0.55 }} />
            </span>
          )}
        </span>

        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="text-[13.5px] font-semibold text-[var(--ink-1)]">Ask the {agent.name}</span>
            <Badge tone="agent">agentic</Badge>
            {busy && <span className="text-[11.5px] text-[var(--agent-ink)]">working…</span>}
          </div>

          <div className={cx(
            'rounded-[var(--r-md)] border bg-[var(--surface-1)] transition-[border-color,box-shadow] duration-fast',
            focused ? 'border-[var(--ink-3)] shadow-[var(--ring)]' : 'border-[var(--line)]',
          )}>
            <textarea
              ref={ref}
              value={value}
              disabled={disabled || busy}
              onChange={(e) => onChange(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && canRun) onRun() }}
              placeholder={hint}
              rows={2}
              className="w-full resize-none border-0 bg-transparent px-3 py-2.5 text-[13px] leading-relaxed text-[var(--ink-1)] outline-none placeholder:text-[var(--ink-5)] disabled:opacity-60" />

            {!!suggestions.length && !value && (
              <div className="flex flex-wrap gap-1.5 border-t border-[var(--line-soft)] px-3 py-2.5">
                <span className="mr-0.5 self-center text-[10.5px] uppercase tracking-[.08em] text-[var(--ink-5)]">Try</span>
                {suggestions.map((sug, i) => (
                  <button key={sug.label} disabled={disabled || busy}
                    onClick={() => { onChange(sug.prompt); ref.current?.focus() }}
                    style={{ animation: still ? undefined : `aire-rise 320ms var(--ease-out) both ${i * 45}ms` }}
                    className="rounded-[var(--r-full)] border border-[var(--line)] bg-[var(--surface-2)] px-2.5 py-[3px] text-[11.5px] text-[var(--ink-3)] transition-colors hover:border-[var(--line-strong)] hover:bg-[var(--surface-1)] hover:text-[var(--ink-1)] disabled:opacity-50">
                    {sug.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <Button size="sm" variant="primary" loading={busy} disabled={!canRun}
              icon={busy ? undefined : <Icon name="spark" size={13} />} onClick={onRun}>
              {busy ? 'Running…' : 'Build it'}
            </Button>
            {canRun && (
              <Tooltip content="Run without leaving the keyboard">
                <span className="hidden items-center gap-1 text-[10.5px] text-[var(--ink-5)] sm:inline-flex"><Kbd>⌘</Kbd><Kbd>↵</Kbd></span>
              </Tooltip>
            )}
            {disabled && (
              <span className="inline-flex items-center gap-1.5 text-[11.5px] text-[var(--ink-4)]">
                <Icon name="lock" size={12} /> Your role cannot run this agent.
              </span>
            )}
            {footnote && !disabled && <span className="text-[11px] leading-relaxed text-[var(--ink-4)]">{footnote}</span>}
          </div>
        </div>
      </div>
    </div>
  )
}
