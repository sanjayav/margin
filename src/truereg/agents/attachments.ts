// ───────────────────────────────────────────────────────────────────────────
// ATTACHMENTS — the Intake agent's front door.
//
// "Reads mill production records, energy invoices and process logs in whatever
// form they exist" is the intake agent's whole mission, so the chat has to
// accept those files where the question is asked, not behind a separate import
// wizard.
//
// Spreadsheets and delimited files are parsed HERE, in the browser, with the
// dependency-free reader the platform already uses. That matters for more than
// convenience: a parsed sheet gives a deterministic answer (what columns exist,
// how many rows, which period) with no model in the path, so an upload is still
// useful with no key configured. PDFs and photographs of a control-room screen
// cannot be read that way and are passed to the model as document and image
// blocks — and when there is no model, the honest answer is that they are on
// file but unread, which is exactly what the record then says.
//
// Nothing here writes to the product record. Intake PROPOSES structure; a
// person accepts it. An uploaded file that silently became an emissions figure
// would defeat the entire audit trail.
// ───────────────────────────────────────────────────────────────────────────
import { parseFile, type SheetData } from '../../lib/importer.js'

export type AttachmentKind = 'table' | 'pdf' | 'image' | 'text' | 'unsupported'

export interface SheetPreview {
  name: string
  rows: number
  cols: number
  headers: string[]
  /** First few body rows, for the answer card. */
  sample: string[][]
}

export interface Attachment {
  id: string
  name: string
  bytes: number
  mediaType: string
  kind: AttachmentKind
  /** base64, no data: prefix — pdf and image only. */
  data?: string
  /** Extracted text — tables and plain text only. Capped. */
  text?: string
  sheets?: SheetPreview[]
  /** Set when the file could not be read at all. */
  error?: string
}

/** The Messages API caps a request at 32 MB. Stay well under it: base64 inflates
 *  by ~4/3, and the record, the tools and the prompt share the same request. */
export const MAX_TOTAL_BYTES = 18 * 1024 * 1024
export const MAX_FILE_BYTES = 12 * 1024 * 1024
/** Enough of a sheet for the model to see the shape without paying for all of it. */
const MAX_TEXT_CHARS = 60_000
const MAX_SAMPLE_ROWS = 6

export const ACCEPT = '.xlsx,.xls,.csv,.tsv,.txt,.md,.json,.pdf,.png,.jpg,.jpeg,.webp,.gif'

function kindFor(name: string, type: string): { kind: AttachmentKind; mediaType: string } {
  const ext = (name.match(/\.([^.]+)$/)?.[1] ?? '').toLowerCase()
  if (['xlsx', 'xls', 'csv', 'tsv'].includes(ext)) return { kind: 'table', mediaType: type || 'application/octet-stream' }
  if (ext === 'pdf' || type === 'application/pdf') return { kind: 'pdf', mediaType: 'application/pdf' }
  if (['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)) {
    const mt = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`
    return { kind: 'image', mediaType: type?.startsWith('image/') ? type : mt }
  }
  if (['txt', 'md', 'json', 'log', 'xml'].includes(ext) || type.startsWith('text/')) return { kind: 'text', mediaType: 'text/plain' }
  return { kind: 'unsupported', mediaType: type || 'application/octet-stream' }
}

const b64 = (buf: ArrayBuffer): string => {
  const bytes = new Uint8Array(buf)
  let s = ''
  // Chunked: String.fromCharCode(...bytes) blows the call stack on a real PDF.
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

function previewSheets(sheets: SheetData[]): { previews: SheetPreview[]; text: string } {
  const previews: SheetPreview[] = []
  const parts: string[] = []
  for (const s of sheets) {
    const grid = s.grid.filter((r) => r.some((c) => String(c ?? '').trim()))
    if (!grid.length) continue
    const [head, ...body] = grid
    previews.push({
      name: s.name,
      rows: body.length,
      cols: head.length,
      headers: head.map((h) => String(h ?? '').trim()),
      sample: body.slice(0, MAX_SAMPLE_ROWS),
    })
    // A TSV rendition is the cheapest faithful form for a model to read.
    parts.push(`## Sheet: ${s.name} (${body.length} rows × ${head.length} columns)\n${grid.map((r) => r.join('\t')).join('\n')}`)
  }
  let text = parts.join('\n\n')
  if (text.length > MAX_TEXT_CHARS) text = `${text.slice(0, MAX_TEXT_CHARS)}\n\n[truncated — ${text.length - MAX_TEXT_CHARS} more characters not sent]`
  return { previews, text }
}

export async function readAttachment(file: File): Promise<Attachment> {
  const id = Math.random().toString(36).slice(2, 10)
  const { kind, mediaType } = kindFor(file.name, file.type)
  const base: Attachment = { id, name: file.name, bytes: file.size, mediaType, kind }

  if (file.size > MAX_FILE_BYTES) {
    return { ...base, error: `Too large (${(file.size / 1024 / 1024).toFixed(1)} MB). The limit is ${MAX_FILE_BYTES / 1024 / 1024} MB per file.` }
  }
  if (kind === 'unsupported') {
    return { ...base, error: 'Not a format intake can read. Spreadsheets, CSV, PDF, images and plain text are supported.' }
  }

  try {
    const buf = await file.arrayBuffer()
    if (kind === 'table') {
      const sheets = await parseFile(file.name, buf)
      const { previews, text } = previewSheets(sheets)
      if (!previews.length) return { ...base, error: 'The file parsed but every sheet was empty.' }
      return { ...base, sheets: previews, text }
    }
    if (kind === 'text') {
      const t = new TextDecoder().decode(buf)
      return { ...base, text: t.length > MAX_TEXT_CHARS ? `${t.slice(0, MAX_TEXT_CHARS)}\n\n[truncated]` : t }
    }
    return { ...base, data: b64(buf) }
  } catch (e: any) {
    return { ...base, error: `Could not read it: ${String(e?.message ?? e)}` }
  }
}

export const totalBytes = (as: Attachment[]) => as.reduce((a, x) => a + x.bytes, 0)

/** What goes over the wire. The parsed text travels instead of the raw bytes for
 *  a spreadsheet — sending both would pay twice for the same content. */
export function forWire(a: Attachment) {
  return {
    name: a.name, mediaType: a.mediaType, kind: a.kind,
    ...(a.data ? { data: a.data } : {}),
    ...(a.text ? { text: a.text } : {}),
    ...(a.error ? { error: a.error } : {}),
  }
}

// ── the deterministic intake answer ─────────────────────────────────────────

export interface IntakeSummary {
  headline: string
  headlineZh: string
  figures: { label: string; value: string; tone?: 'ink' | 'safe' | 'warn' | 'danger'; sub?: string }[]
  rows: { label: string; sub?: string; value?: string; tone?: 'ink' | 'safe' | 'warn' | 'danger' }[]
  /** What a person has to decide before any of this reaches the record. */
  openQuestions: string[]
}

/** Structure what was uploaded, with no model in the path.
 *
 *  Deliberately reports SHAPE, not meaning. It can say a sheet has a column
 *  called 焦炭消耗量 with 366 rows; it cannot say those are the tonnes that
 *  belong inside the blast furnace boundary. That judgement is the boundary
 *  agent's, and it needs a person or a model — so it is returned as an open
 *  question rather than guessed at. */
export function summariseIntake(atts: Attachment[]): IntakeSummary {
  const ok = atts.filter((a) => !a.error)
  const failed = atts.filter((a) => a.error)
  const tables = ok.filter((a) => a.kind === 'table')
  const unread = ok.filter((a) => a.kind === 'pdf' || a.kind === 'image')
  const sheets = tables.flatMap((t) => t.sheets ?? [])
  const dataRows = sheets.reduce((a, s) => a + s.rows, 0)

  const rows: IntakeSummary['rows'] = []
  for (const t of tables) {
    for (const s of t.sheets ?? []) {
      rows.push({
        label: `${t.name} · ${s.name}`,
        sub: `${s.rows} rows × ${s.cols} columns — ${s.headers.filter(Boolean).slice(0, 8).join(', ')}${s.headers.length > 8 ? ' …' : ''}`,
        value: `${s.rows}`, tone: 'safe',
      })
    }
  }
  for (const a of unread) {
    rows.push({
      label: a.name,
      sub: a.kind === 'pdf'
        ? 'A PDF cannot be structured in the browser. It is on file and goes to the agent to read — with no model configured it stays unread, and the record says so.'
        : 'An image goes to the agent to read. With no model configured it stays unread.',
      value: `${(a.bytes / 1024).toFixed(0)} KB`, tone: 'warn',
    })
  }
  for (const a of failed) rows.push({ label: a.name, sub: a.error, value: 'failed', tone: 'danger' })

  const openQuestions: string[] = []
  if (sheets.length) {
    openQuestions.push('Which process unit does each column belong to? A quantity with no unit attached cannot be placed inside a system boundary.')
    openQuestions.push('What reporting period do these rows cover, and is it the whole period or part of it?')
    const noUnits = sheets.filter((s) => !s.headers.some((h) => /\b(t|kg|mwh|kwh|gj|m3|m³|tco2|吨|千克|万吨)\b/i.test(h)))
    if (noUnits.length) openQuestions.push(`${noUnits.length} sheet(s) carry no unit in any column heading. Intake will not assume one — a wrong unit is a wrong tonne of CO₂.`)
  }
  if (unread.length) openQuestions.push(`${unread.length} file(s) need a model to read. Nothing is inferred from a filename.`)

  const headline = ok.length === 0
    ? `Nothing could be read from ${atts.length} file${atts.length === 1 ? '' : 's'}.`
    : `${ok.length} file${ok.length === 1 ? '' : 's'} taken in${sheets.length ? ` — ${sheets.length} sheet${sheets.length === 1 ? '' : 's'}, ${dataRows.toLocaleString('en-GB')} rows structured` : ''}${unread.length ? `, ${unread.length} awaiting a reader` : ''}. Nothing has been written to the record yet.`

  const headlineZh = ok.length === 0
    ? `${atts.length} 个文件均无法读取。`
    : `已接收 ${ok.length} 个文件${sheets.length ? `，解析出 ${sheets.length} 个工作表、${dataRows.toLocaleString('en-GB')} 行数据` : ''}${unread.length ? `，另有 ${unread.length} 个待读取` : ''}。尚未写入记录。`

  return {
    headline, headlineZh,
    figures: [
      { label: 'Files taken in', value: String(ok.length), tone: failed.length ? 'warn' : 'safe', sub: failed.length ? `${failed.length} failed` : undefined },
      { label: 'Sheets', value: String(sheets.length) },
      { label: 'Rows structured', value: dataRows.toLocaleString('en-GB') },
      { label: 'Awaiting a reader', value: String(unread.length), tone: unread.length ? 'warn' : 'safe', sub: unread.length ? 'PDF or image' : undefined },
    ],
    rows, openQuestions,
  }
}
