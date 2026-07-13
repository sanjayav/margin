import { useMemo, useState } from 'react'
import { useStore } from '../state/store'
import { INTEL, type EventKind } from '../engine/intelligence'
import Icon, { type IconName } from '../components/Icon'

const KIND_META: Record<EventKind, { label: string; icon: IconName; c: string }> = {
  fine: { label: 'Fine', icon: 'alert', c: 'text-danger bg-danger/10 border-danger/30' },
  alliance: { label: 'Alliance', icon: 'handshake', c: 'text-accent bg-accent/10 border-accent/30' },
  dispute: { label: 'Dispute', icon: 'scale', c: 'text-warn bg-warn/10 border-warn/30' },
  rule: { label: 'Rule change', icon: 'section', c: 'text-brand bg-brand/10 border-brand/30' },
  data: { label: 'Data', icon: 'database', c: 'text-ink-300 bg-black/5 border-black/10' },
}

export default function Intelligence() {
  const country = useStore((s) => s.country)
  const [filter, setFilter] = useState<'all' | EventKind>('all')
  const [scope, setScope] = useState<'market' | 'all'>('market')

  const events = useMemo(() => INTEL
    .filter((e) => (scope === 'all' ? true : e.country === country || e.country === 'GLOBAL'))
    .filter((e) => filter === 'all' || e.kind === filter)
    .sort((a, b) => b.date.localeCompare(a.date)), [country, filter, scope])

  return (
    <div className="space-y-5 animate-slidein">
      {/* honesty banner: this feed is curated sample content until a live source is wired */}
      <div className="flex items-start gap-3 rounded-xl border border-warn/25 bg-warn/[0.06] px-4 py-3">
        <Icon name="alert" size={16} className="mt-0.5 shrink-0 text-warn" />
        <p className="text-[12.5px] leading-relaxed text-ink-400">
          <b className="text-warn">Illustrative sample.</b> These are curated example events styled after real regulatory
          signals — a live monitored feed ships with the data partnership. Formats, sourcing and filters shown are final.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1.5">
          {(['all', 'rule', 'fine', 'alliance', 'dispute', 'data'] as const).map((k) => (
            <button key={k} onClick={() => setFilter(k)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition ${filter === k ? 'bg-ink-100 text-white' : 'bg-black/5 text-ink-500 hover:text-ink-100'}`}>{k}</button>
          ))}
        </div>
        <div className="ml-auto flex gap-1.5">
          <button onClick={() => setScope('market')} className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${scope === 'market' ? 'bg-brand/15 text-brand' : 'bg-black/5 text-ink-500'}`}>This market</button>
          <button onClick={() => setScope('all')} className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${scope === 'all' ? 'bg-brand/15 text-brand' : 'bg-black/5 text-ink-500'}`}>All markets</button>
        </div>
      </div>

      <div className="relative space-y-3 before:absolute before:left-[19px] before:top-2 before:h-full before:w-px before:bg-black/[0.06]">
        {events.map((e, i) => {
          const meta = KIND_META[e.kind]
          return (
            <div key={e.id} style={{ animationDelay: `${Math.min(i, 8) * 60}ms` }} className="rise relative flex gap-4">
              <div className={`z-10 grid h-10 w-10 shrink-0 place-items-center rounded-full border bg-ink-900 ${meta.c} ${e.impact === 'high' ? 'shadow-[0_0_0_4px_rgba(224,72,77,0.10)]' : ''}`}><Icon name={meta.icon} size={17} /></div>
              <div className="card flex-1 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${meta.c}`}>{meta.label}</span>
                  <span className="chip">{e.country}</span>
                  {e.impact === 'high' && <span className="rounded-full border border-danger/30 bg-danger/10 px-2 py-0.5 text-[10px] font-semibold text-danger">high impact</span>}
                  <span className="ml-auto num text-xs text-ink-500">{e.date}</span>
                </div>
                <h3 className="mt-2 font-semibold text-ink-100">{e.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-ink-400">{e.body}</p>
                <div className="mt-2 flex items-center gap-1.5 text-[11px] text-ink-500">
                  <Icon name="clock" size={12} /><span>Source:</span><span className="text-ink-300">{e.source}</span>
                  {e.parents && e.parents.length > 0 && <span className="ml-auto">{e.parents.join(', ')}</span>}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
