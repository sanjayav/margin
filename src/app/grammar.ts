// ───────────────────────────────────────────────────────────────────────────
// THE GRAMMAR — one vocabulary, three ways in.
//
// Bloomberg's real lesson is not density, it is a compact vocabulary experts
// internalise. AiRE has five verbs, and the point of keeping them to five is
// that the SAME set is typeable in the palette, clickable in the UI, and sayable
// to the agent. The agent's intent vocabulary and the app's command vocabulary
// are one thing — so the agent can do anything the user can do, and using the UI
// teaches the agent.
//
// New capability is a NEW NOUN, not a new verb. If something seems to need a
// sixth verb it almost certainly belongs inside an existing one.
// ───────────────────────────────────────────────────────────────────────────
export type Verb = 'show' | 'why' | 'what-if' | 'compare' | 'prove'

export interface VerbSpec {
  id: Verb
  /** What the user types. */
  word: string
  /** What it does, in the user's words. */
  gloss: string
  /** The kind of thing it takes. */
  takes: string
  /** Example, shown in the palette's empty state. */
  example: string
}

export const VERBS: VerbSpec[] = [
  { id: 'show', word: 'show', gloss: 'Go to it', takes: 'a market, a manufacturer, a model, a module', example: 'show Mercedes-Benz' },
  { id: 'why', word: 'why', gloss: 'Open the computation behind a number', takes: 'a figure on screen', example: 'why is the target 100.7' },
  { id: 'what-if', word: 'what if', gloss: 'Stage a change and price it', takes: 'a change to the fleet or the plan', example: 'what if BEV share reaches 30%' },
  { id: 'compare', word: 'compare', gloss: 'Put two things side by side', takes: 'two makers, years, scenarios or markets', example: 'compare Renault and Dacia' },
  { id: 'prove', word: 'prove', gloss: 'Provenance and export', takes: 'a figure or a filing', example: 'prove the 2025 position' },
]

const BY_WORD = VERBS.map((v) => ({ v, re: new RegExp(`^${v.word}\\s+`, 'i') }))

export interface ParsedCommand {
  verb: Verb | null
  /** Everything after the verb — the noun. */
  rest: string
  /** True when the input is only a partial verb, so the palette can teach it. */
  partialVerb: boolean
}

/** Parse a palette input into verb + noun. Anything without a leading verb is
 *  treated as `show`, because that is what a bare search means. */
export function parse(input: string): ParsedCommand {
  const q = input.trim()
  if (!q) return { verb: null, rest: '', partialVerb: false }
  for (const { v, re } of BY_WORD) {
    if (re.test(q)) return { verb: v.id, rest: q.replace(re, '').trim(), partialVerb: false }
  }
  const partial = VERBS.some((v) => v.word.startsWith(q.toLowerCase()) && v.word !== q.toLowerCase())
  return { verb: partial ? null : 'show', rest: partial ? q : q, partialVerb: partial }
}
