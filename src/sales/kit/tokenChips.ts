import { parseTokens, suggestToken, tokenDef, tokenRe, tokenSource, TOKEN_KEYS } from '../data/tokens'

// Variables shown as chips inside the editors. The chips are only a view: every editor reads and writes plain {{key}} text, so
// the stored sequences, templates and the server's rendering are unchanged. These helpers turn text into chips and back.

/** How a chip should look for one variable: amber when some contacts lack it, red when it is not a variable at all. */
export interface ChipNote { tone?: 'warn' | 'bad'; note?: string }
export type ChipInfo = (key: string) => ChipNote | undefined

/** The default: a variable not in the list is an error, with what it was probably meant to be. */
export const unknownInfo: ChipInfo = key => {
  if (TOKEN_KEYS.includes(key)) return undefined
  const s = suggestToken(key)
  return { tone: 'bad', note: `Not a variable${s ? `: did you mean ${s.label}?` : ''}` }
}

/** The label, classes and hover text a chip for {key, fallback} gets. Shared by the editable chips and the read-only TokenText. */
export function chipView(key: string, fallback: string | undefined, info: ChipInfo = unknownInfo): { label: string; cls: string; title: string; aria: string } {
  const d = tokenDef(key)
  const n = info(key) ?? unknownInfo(key)
  const label = (d?.label ?? key) + (fallback === undefined ? '' : fallback ? ` · or “${fallback}”` : ' · or leave out')
  const cls = 'tok ' + (d ? `tok-${d.side}` : 'tok-bad') + (n?.tone === 'bad' ? ' tok-bad' : n?.tone === 'warn' ? ' tok-warn' : '')
  const parts = [d ? `${d.label}: ${d.side === 'contact' ? "the contact's" : 'your'} ${d.label.replace(/^Your /, '').toLowerCase()} (e.g. ${d.sample})` : `{{${key}}}`]
  if (fallback !== undefined) parts.push(fallback ? `If empty: “${fallback}”` : 'If empty: left out')
  if (n?.note) parts.push(n.note)
  return { label, cls, title: parts.join('\n'), aria: `Variable ${d?.label ?? key}${n?.tone === 'bad' ? ', not recognised' : n?.tone === 'warn' ? ', some contacts have no value' : ''}` }
}

export function chipEl(doc: Document, key: string, fallback: string | undefined, info?: ChipInfo): HTMLSpanElement {
  const v = chipView(key, fallback, info)
  const el = doc.createElement('span')
  el.className = v.cls
  el.setAttribute('contenteditable', 'false')
  el.dataset.tok = key
  if (fallback !== undefined) el.dataset.fb = fallback
  el.title = v.title
  el.setAttribute('aria-label', v.aria)
  el.textContent = v.label
  return el
}

const isChip = (n: Node | null): n is HTMLElement => !!n && n.nodeType === 1 && (n as HTMLElement).classList.contains('tok')
const sourceOf = (el: HTMLElement): string => tokenSource(el.dataset.tok ?? '', el.dataset.fb)

/**
 * Replace every {{…}} in the text under `root` with a chip. Text already inside a chip is left alone. When the caret was in a text that
 * changed, it is put back after the chip it was in or behind, so typing "{{first_name}}" by hand turns into a chip and carries on.
 */
export function chipify(root: HTMLElement, info?: ChipInfo): boolean {
  const doc = root.ownerDocument
  const sel = doc.getSelection()
  const caretNode = sel && sel.rangeCount && sel.isCollapsed && root.contains(sel.anchorNode) ? sel.anchorNode : null
  const caretOff = sel ? sel.anchorOffset : 0
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: n => (isChip(n.parentElement) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) })
  const texts: Text[] = []
  for (let n = walker.nextNode(); n; n = walker.nextNode()) if (tokenRe().test((n as Text).data)) texts.push(n as Text)
  let caret: { node: Node; off: number } | null = null
  for (const t of texts) {
    // The text split into pieces (plain text and chips), each knowing which characters of the original it covers.
    const pieces: Array<{ node: Node; start: number; end: number }> = []
    let at = 0
    for (const m of t.data.matchAll(tokenRe())) {
      const start = m.index ?? 0
      if (start > at) pieces.push({ node: doc.createTextNode(t.data.slice(at, start)), start: at, end: start })
      pieces.push({ node: chipEl(doc, m[1], m[2] !== undefined ? m[2].trim() : undefined, info), start, end: start + m[0].length })
      at = start + m[0].length
    }
    if (at < t.data.length) pieces.push({ node: doc.createTextNode(t.data.slice(at)), start: at, end: t.data.length })
    if (t === caretNode) {
      const p = pieces.find(x => caretOff >= x.start && caretOff <= x.end && (x.node.nodeType === 3 || caretOff === x.end)) ?? pieces[pieces.length - 1]
      caret = p.node.nodeType === 3 ? { node: p.node, off: caretOff - p.start } : { node: p.node, off: -1 }
    }
    const frag = doc.createDocumentFragment()
    pieces.forEach(x => frag.appendChild(x.node))
    t.replaceWith(frag)
  }
  if (caret && sel) {
    const r = doc.createRange()
    if (caret.off >= 0) r.setStart(caret.node, caret.off)
    else r.setStartAfter(caret.node)
    r.collapse(true)
    sel.removeAllRanges()
    sel.addRange(r)
  }
  return texts.length > 0
}

/** The HTML under `root` with every chip written back as {{key}} text: what an editor stores. */
export function serializeHtml(root: HTMLElement): string {
  const c = root.cloneNode(true) as HTMLElement
  c.querySelectorAll<HTMLElement>('.tok').forEach(el => el.replaceWith(root.ownerDocument.createTextNode(sourceOf(el))))
  return c.innerHTML
}

/** The text under `root` with chips as {{key}}: what a one-line field stores. */
export function serializeText(root: HTMLElement | DocumentFragment): string {
  const c = root.cloneNode(true) as HTMLElement
  c.querySelectorAll<HTMLElement>('.tok').forEach(el => el.replaceWith(el.ownerDocument.createTextNode(sourceOf(el))))
  return (c.textContent ?? '').replace(/\u00a0/g, ' ').replace(/[\r\n]+/g, ' ')
}

/** Refresh every chip's look (after the contacts or the list of warnings changed), without touching the text or the caret. */
export function paintChips(root: HTMLElement, info?: ChipInfo): void {
  root.querySelectorAll<HTMLElement>('.tok').forEach(el => {
    const v = chipView(el.dataset.tok ?? '', el.dataset.fb, info)
    if (el.className !== v.cls) el.className = v.cls
    el.title = v.title
    el.setAttribute('aria-label', v.aria)
    if (el.textContent !== v.label) el.textContent = v.label
  })
}

/** Copy or cut from an editor: chips go to the clipboard as {{key}}, so they paste back as chips here and as text anywhere else. */
export function copyChips(e: { clipboardData: DataTransfer | null; preventDefault: () => void }, root: HTMLElement, cut: boolean, after?: () => void): void {
  const sel = root.ownerDocument.getSelection()
  if (!sel || !sel.rangeCount || sel.isCollapsed || !root.contains(sel.anchorNode)) return
  const range = sel.getRangeAt(0)
  const box = root.ownerDocument.createElement('div')
  box.appendChild(range.cloneContents())
  if (!box.querySelector('.tok')) return
  const html = serializeHtml(box)
  e.clipboardData?.setData('text/plain', serializeText(box))
  e.clipboardData?.setData('text/html', html)
  e.preventDefault()
  if (cut) { range.deleteContents(); after?.() }
}

/** Put a chip where the caret is (or at the end when the caret is elsewhere), then the caret after it. */
export function insertChip(root: HTMLElement, key: string, info?: ChipInfo, replaceBack = 0): void {
  const doc = root.ownerDocument
  const sel = doc.getSelection()
  let range: Range
  if (sel && sel.rangeCount && root.contains(sel.getRangeAt(0).startContainer)) range = sel.getRangeAt(0)
  else { range = doc.createRange(); range.selectNodeContents(root); range.collapse(false) }
  if (replaceBack && range.startContainer.nodeType === 3) range.setStart(range.startContainer, Math.max(0, range.startOffset - replaceBack))
  range.deleteContents()
  const chip = chipEl(doc, key, undefined, info)
  range.insertNode(chip)
  // A space after the chip gives the caret somewhere to go, as a chip cannot hold it.
  const sp = doc.createTextNode('\u00a0')
  chip.after(sp)
  const r = doc.createRange()
  r.setStart(sp, 1)
  r.collapse(true)
  sel?.removeAllRanges()
  sel?.addRange(r)
}

/** What the caret is typing after "{{", for the picker: the text so far and the caret's position on screen. */
export function pickerQuery(root: HTMLElement): { q: string; back: number; rect: DOMRect | null } | null {
  const sel = root.ownerDocument.getSelection()
  if (!sel || !sel.rangeCount || !sel.isCollapsed) return null
  const n = sel.anchorNode
  if (!n || n.nodeType !== 3 || !root.contains(n) || isChip(n.parentElement)) return null
  const m = /\{\{\s*(\w*)$/.exec((n as Text).data.slice(0, sel.anchorOffset))
  if (!m) return null
  const r = sel.getRangeAt(0).cloneRange()
  const rect = typeof r.getBoundingClientRect === 'function' ? r.getBoundingClientRect() : null
  return { q: m[1].toLowerCase(), back: m[0].length, rect }
}

/** Keys of every variable in a piece of text, for callers that need to look them up (warnings). */
export const keysIn = (s: string): string[] => [...new Set(parseTokens(s).map(t => t.key))]

/** Sanitised HTML (from F.body) with its variables as chips, for read-only views (a locked step, the preview). */
export function chipsInHtml(html: string, info?: ChipInfo): string {
  if (typeof document === 'undefined' || !tokenRe().test(html)) return html
  const box = document.createElement('div')
  box.innerHTML = html
  chipify(box, info)
  box.querySelectorAll('.tok').forEach(el => el.removeAttribute('contenteditable'))
  return box.innerHTML
}
