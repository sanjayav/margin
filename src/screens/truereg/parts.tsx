// Shared TrueReg UI vocabulary. Small, semantic, and reused everywhere so the
// same idea never has two appearances: a clause is always a clause chip, a
// basis is always a basis badge, and bilingual text always shows which language
// governs.
import { useEffect, type ReactNode } from 'react'
import { useTr, type Lang } from '../../truereg/ui/state'
import { getClause } from '../../truereg/corpus/clauses'
import { TERMS, getTerm } from '../../truereg/corpus/terms'
import Icon, { type IconName } from '../../components/Icon'

// ── numbers ─────────────────────────────────────────────────────────────────
export const n0 = (v: number) => Math.round(v).toLocaleString('en-GB')
export const n2 = (v: number, d = 2) => v.toLocaleString('en-GB', { minimumFractionDigits: d, maximumFractionDigits: d })
export const eur = (v: number) => `€${Math.round(v).toLocaleString('en-GB')}`

// ── bilingual ───────────────────────────────────────────────────────────────
/** The EU text governs and the Chinese is a reading aid. That is a legal fact,
 *  so it is expressed structurally — the governing line always leads, and the
 *  rendering is visibly subordinate — rather than left to a footnote. */
export function Bi({ en, zh, className = '', zhClass = '' }: { en: ReactNode; zh?: ReactNode; className?: string; zhClass?: string }) {
  const lang = useTr((s) => s.lang)
  if (!zh) return <span className={className}>{en}</span>
  if (lang === 'zh') return <span className={className} lang="zh-CN">{zh}</span>
  if (lang === 'en') return <span className={className}>{en}</span>
  return (
    <span className={className}>
      {en}
      <span className={`mt-1 block text-ink-500 ${zhClass}`} lang="zh-CN">{zh}</span>
    </span>
  )
}

export function LangToggle() {
  const lang = useTr((s) => s.lang)
  const set = useTr((s) => s.setLang)
  // Compact on a phone, where the header has to hold the installation and the
  // title too; spelled out from sm upward.
  const opts: { id: Lang; short: string; label: string; title: string }[] = [
    { id: 'en', short: 'EN', label: 'EN', title: 'English — the governing language of the Regulation' },
    { id: 'zh', short: '中', label: '中文', title: '中文 — 阅读辅助，欧盟文本为准' },
    { id: 'both', short: '双', label: 'EN 中文', title: 'Both, with the governing text leading' },
  ]
  return (
    <div className="flex items-center gap-0.5 rounded-[11px] border border-white/[0.10] bg-white/[0.04] p-0.5" role="group" aria-label="Language">
      {opts.map((o) => (
        <button key={o.id} onClick={() => set(o.id)} title={o.title} aria-label={o.title} aria-pressed={lang === o.id}
          className={`rounded-[9px] px-2 py-1.5 text-[11px] font-semibold transition ${lang === o.id ? 'bg-white/[0.12] text-white' : 'text-[#8A8174] hover:text-[#C9C0B2]'}`}>
          <span className="sm:hidden">{o.short}</span><span className="hidden sm:inline">{o.label}</span>
        </button>
      ))}
    </div>
  )
}

// ── citation ────────────────────────────────────────────────────────────────
/** Nothing asserts a rule without one of these. Clicking opens the authentic
 *  text, so a claim is always one tap from the clause behind it. */
export function ClauseChip({ ids, compact }: { ids: string[]; compact?: boolean }) {
  const open = useTr((s) => s.openClauses)
  const known = ids.map((i) => getClause(i)).filter(Boolean)
  if (!known.length) return null
  const label = known.length === 1 ? known[0]!.citation.replace(/^Regulation \(EU\) 2023\/956, /, '') : `${known.length} clauses`
  return (
    <button onClick={() => open(ids)}
      className={`inline-flex max-w-full items-center gap-1.5 rounded-full border border-accentblue/25 bg-accentblue/[0.07] font-semibold text-accentblue transition hover:border-accentblue/50 hover:bg-accentblue/[0.12] ${compact ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-[11px]'}`}>
      <Icon name="section" size={compact ? 10 : 12} className="shrink-0" />
      <span className="truncate">{label}</span>
    </button>
  )
}

export function TermChip({ id, children }: { id: string; children: ReactNode }) {
  const open = useTr((s) => s.openTerm)
  const t = getTerm(id)
  if (!t) return <>{children}</>
  return (
    <button onClick={() => open(t.id)} className="underline decoration-dotted decoration-ink-600 underline-offset-[3px] transition hover:decoration-brand hover:text-brand">
      {children}
    </button>
  )
}

// ── status vocabulary ───────────────────────────────────────────────────────
export function BasisBadge({ basis, published }: { basis: 'actual' | 'partial' | 'default'; published?: boolean }) {
  const map = {
    actual: { t: 'Actuals', zh: '实际值', c: 'border-safe/30 bg-safe/[0.09] text-safe', dot: 'bg-safe', tip: 'Every term computed from this installation’s own records.' },
    partial: { t: 'Actuals · part default', zh: '实际值·部分默认', c: 'border-warn/30 bg-warn/[0.09] text-warn', dot: 'bg-warn', tip: 'Some terms are carried at a default value because the underlying data is not resolved.' },
    default: { t: 'Not determinable', zh: '无法确定', c: 'border-danger/30 bg-danger/[0.09] text-danger', dot: 'bg-danger', tip: 'A blocking unknown remains. No figure is stated rather than an estimated one.' },
  }[basis]
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10.5px] font-bold ${map.c}`} data-tip={map.tip}>
      <span className={`h-1.5 w-1.5 rounded-full ${map.dot}`} />
      <Bi en={map.t} zh={map.zh} />
      {published === false && <span className="font-semibold opacity-70">· indicative</span>}
    </span>
  )
}

export function QualityDot({ q }: { q: string }) {
  const c = q === 'measured' ? 'bg-safe' : q === 'calculated' ? 'bg-accentblue' : q === 'supplier-declared' ? 'bg-warn' : 'bg-danger'
  return <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${c}`} data-tip={`Data quality: ${q}`} />
}

/** Every indicative input must say so wherever a figure derived from it lands.
 *  Shown as a real sentence, not an asterisk — an asterisk is not a disclosure. */
export function Caveat({ items }: { items: string[] }) {
  if (!items.length) return null
  return (
    <div className="mt-4 rounded-xl border border-warn/20 bg-warn/[0.05] p-3.5">
      <div className="flex items-start gap-2.5">
        <Icon name="alert" size={14} className="mt-px shrink-0 text-warn" />
        <div className="min-w-0 space-y-1.5">
          <div className="text-[11.5px] font-bold text-warn">This figure rests on inputs that are not the published table</div>
          {items.map((c, i) => <p key={i} className="text-[11.5px] leading-relaxed text-ink-400">{c}</p>)}
        </div>
      </div>
    </div>
  )
}

// ── the lede ────────────────────────────────────────────────────────────────
/** Every surface opens with its own answer, in display type, sitting on the
 *  ground rather than inside a card. It is the same device the Ask screen uses,
 *  and it is what stops a page reading as an undifferentiated stack of panels:
 *  one statement at full strength, then the evidence for it. The figure inside
 *  it is always live — a lede that could have been written in advance is just a
 *  subtitle. */
export function Lede({ children, meta }: { children: ReactNode; meta?: ReactNode }) {
  return (
    <header className="mb-6 sm:mb-7">
      <h2 className="max-w-[30ch] font-display text-[23px] font-bold leading-[1.18] tracking-[-0.035em] text-ink-100 sm:max-w-[38ch] sm:text-[29px]">
        {children}
      </h2>
      {meta && <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px] text-ink-500">{meta}</div>}
    </header>
  )
}

/** The number inside a lede. Tabular, tight, and the only coloured thing in it. */
export function Big({ children, tone = 'brand' }: { children: ReactNode; tone?: 'brand' | 'safe' | 'danger' | 'warn' }) {
  const c = { brand: 'text-brand', safe: 'text-safe', danger: 'text-danger', warn: 'text-warn' }[tone]
  return <span className={`dnum whitespace-nowrap ${c}`}>{children}</span>
}

/** Trailing unit on a lede figure — subordinate, never the same size. */
export const Unit = ({ children }: { children: ReactNode }) =>
  <span className="text-[0.55em] font-semibold tracking-normal text-ink-400">{children}</span>

// ── layout ──────────────────────────────────────────────────────────────────
export function Panel({ title, titleZh, right, hint, children, className = '', id }: {
  title?: ReactNode; titleZh?: string; right?: ReactNode; hint?: ReactNode; children: ReactNode; className?: string; id?: string
}) {
  return (
    <section id={id} className={`card p-4 sm:p-6 ${className}`}>
      {(title || right) && (
        <header className="mb-4 flex flex-wrap items-start justify-between gap-x-3 gap-y-2 sm:mb-5">
          <div className="min-w-0">
            {title && <h2 className="font-display text-[15px] font-bold leading-tight tracking-[-0.02em] text-ink-100 sm:text-[16.5px]"><Bi en={title} zh={titleZh} zhClass="text-[12.5px] font-semibold" /></h2>}
            {hint && <p className="mt-1.5 max-w-[68ch] text-[11.5px] leading-relaxed text-ink-500">{hint}</p>}
          </div>
          {right && <div className="shrink-0">{right}</div>}
        </header>
      )}
      {children}
    </section>
  )
}

/** Wide content scrolls inside itself. The page body never scrolls sideways —
 *  on a phone that is the difference between usable and not. */
export function Scroller({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0 ${className}`}><div className="min-w-[560px]">{children}</div></div>
}

export function Figure({ label, labelZh, value, unit, sub, tone = 'ink', className = '' }: {
  label: string; labelZh?: string; value: ReactNode; unit?: string; sub?: ReactNode; tone?: 'ink' | 'safe' | 'danger' | 'warn' | 'blue'; className?: string
}) {
  const c = { ink: 'text-ink-100', safe: 'text-safe', danger: 'text-danger', warn: 'text-warn', blue: 'text-accentblue' }[tone]
  const rail = { ink: '#C9BCA3', safe: '#0E9F6E', danger: '#E0484D', warn: '#D98005', blue: '#3B6FE0' }[tone]
  return (
    <div className={`relative overflow-hidden rounded-2xl border border-black/[0.05] bg-[#FFFEFB] p-4 ${className}`}>
      <span aria-hidden className="absolute inset-x-0 top-0 h-[2px]" style={{ background: `linear-gradient(90deg, ${rail}, ${rail}00 82%)`, opacity: 0.75 }} />
      <div className="label"><Bi en={label} zh={labelZh} /></div>
      <div className={`dnum mt-2 flex items-baseline gap-1.5 text-[22px] font-bold leading-none tracking-[-0.03em] sm:text-[27px] ${c}`}>
        {value}{unit && <span className="text-[12px] font-semibold text-ink-500">{unit}</span>}
      </div>
      {sub && <div className="mt-2.5 text-[11px] leading-snug text-ink-500">{sub}</div>}
    </div>
  )
}

export function Empty({ icon = 'section', title, body }: { icon?: IconName; title: string; body: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-black/[0.10] px-6 py-12 text-center">
      <span className="grid h-11 w-11 place-items-center rounded-xl bg-black/[0.04] text-ink-500"><Icon name={icon} size={20} /></span>
      <p className="mt-3.5 font-display text-[14.5px] font-bold text-ink-200">{title}</p>
      <p className="mt-1.5 max-w-[42ch] text-[12px] leading-relaxed text-ink-500">{body}</p>
    </div>
  )
}

// ── the corpus sheet ────────────────────────────────────────────────────────
/** Bottom sheet on a phone, side panel on a desktop. Same content, and the
 *  governing text always sits above the rendering. */
export function CorpusSheet() {
  const ids = useTr((s) => s.clauseSheet)
  const termId = useTr((s) => s.termSheet)
  const close = useTr((s) => s.closeClauses)
  const closeTerm = useTr((s) => s.openTerm)
  const openTerm = useTr((s) => s.openTerm)
  const open = ids.length > 0 || !!termId
  const dismiss = () => { close(); closeTerm(null) }

  useEffect(() => {
    if (!open) return
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') dismiss() }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [open])

  if (!open) return null
  const clauses = ids.map((i) => getClause(i)).filter(Boolean)
  const term = termId ? getTerm(termId) : null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-end sm:items-stretch" role="dialog" aria-modal="true" aria-label="Source text">
      <button aria-label="Close" onClick={dismiss} className="absolute inset-0 bg-[#1C1812]/45 backdrop-blur-[2px]" style={{ animation: 'overlayIn .18s ease' }} />
      <div className="relative flex max-h-[86vh] w-full flex-col rounded-t-[22px] border-t border-black/[0.08] bg-[#FFFEFB] shadow-2xl sm:max-h-none sm:w-[min(30rem,92vw)] sm:rounded-none sm:rounded-l-[22px] sm:border-l sm:border-t-0"
        style={{ animation: 'modalPop .22s cubic-bezier(.2,.7,.2,1)' }}>
        <div className="flex items-start justify-between gap-3 border-b border-black/[0.06] px-5 py-4">
          <div>
            <div className="label">{term ? 'Term base' : 'Source text'}</div>
            <p className="mt-1 text-[11.5px] leading-snug text-ink-500">
              {term ? 'Controlled rendering. A wrong one changes the number.' : 'The EU text governs. The Chinese is a reading aid.'}
            </p>
          </div>
          <button onClick={dismiss} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-ink-500 transition hover:bg-black/[0.05] hover:text-ink-100"><Icon name="close" size={16} /></button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          {term && (
            <div className="space-y-4">
              <div>
                <div className="font-display text-[19px] font-bold tracking-[-0.02em] text-ink-100">{term.en}</div>
                <div className="dnum mt-1 text-[19px] font-bold text-brand" lang="zh-CN">{term.zh}</div>
                {term.status === 'draft' && <span className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-warn/30 bg-warn/[0.08] px-2.5 py-1 text-[10.5px] font-bold text-warn"><Icon name="alert" size={10} /> Draft — must be flagged wherever it is used</span>}
              </div>
              <p className="text-[12.5px] leading-relaxed text-ink-300">{term.definitionEn}</p>
              <p className="text-[12.5px] leading-relaxed text-ink-400" lang="zh-CN">{term.definitionZh}</p>
              {term.forbidden.length > 0 && (
                <div className="rounded-xl border border-danger/20 bg-danger/[0.04] p-3.5">
                  <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-danger">Do not render as</div>
                  <ul className="mt-2.5 space-y-2.5">
                    {term.forbidden.map((f) => (
                      <li key={f.zh}>
                        <span className="dnum text-[14px] font-bold text-danger line-through decoration-danger/50" lang="zh-CN">{f.zh}</span>
                        <p className="mt-1 text-[11.5px] leading-relaxed text-ink-400">{f.why}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {term.clauseId && <ClauseChip ids={[term.clauseId]} />}
              <div className="border-t border-black/[0.06] pt-3 text-[10.5px] text-ink-500">Term base version {term.version} · {term.domain}</div>
            </div>
          )}

          {clauses.map((c) => (
            <article key={c!.id} className="border-b border-black/[0.06] pb-5 last:border-0 [&+article]:pt-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="chip !border-accentblue/25 !bg-accentblue/[0.07] !text-accentblue">{c!.citation}</span>
                {c!.status === 'summary'
                  ? <span className="chip !border-warn/25 !bg-warn/[0.06] !text-warn" data-tip="An analyst precis, faithful but not the authentic wording. Read against the source before commercial reliance.">Precis</span>
                  : <span className="chip !border-safe/25 !bg-safe/[0.06] !text-safe">Verbatim</span>}
              </div>
              <h3 className="mt-3 font-display text-[15.5px] font-bold tracking-[-0.02em] text-ink-100">{c!.titleEn}</h3>
              <p className="mt-3 text-[12.5px] leading-[1.75] text-ink-200">{c!.textEn}</p>
              <div className="mt-4 rounded-xl border border-black/[0.06] bg-black/[0.02] p-3.5">
                <div className="label mb-1.5">Chinese reading aid · 中文参考</div>
                <div className="text-[13px] font-bold text-ink-200" lang="zh-CN">{c!.titleZh}</div>
                <p className="mt-2 text-[12.5px] leading-[1.85] text-ink-300" lang="zh-CN">{c!.textZh}</p>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[10.5px] text-ink-500">
                <span>Corpus {c!.version}</span><span>·</span><span>checked {c!.checkedOn}</span>
                {c!.celex && <><span>·</span><span className="mono">CELEX {c!.celex}</span></>}
                {c!.url && <><span>·</span><a href={c!.url} target="_blank" rel="noreferrer" className="font-semibold text-accentblue hover:underline">Read the act ↗</a></>}
              </div>
            </article>
          ))}

          {!term && clauses.length === 0 && <Empty title="Clause not in the corpus" body="The citation points at a clause this corpus version does not hold. That is a defect, not a gap in your record." />}
        </div>

        {!term && (
          <div className="border-t border-black/[0.06] px-5 py-3">
            <button onClick={() => openTerm(TERMS[0].id)} className="text-[11.5px] font-semibold text-accentblue hover:underline">Open the bilingual term base →</button>
          </div>
        )}
      </div>
    </div>
  )
}
