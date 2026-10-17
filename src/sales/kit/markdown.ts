import { useState } from 'react'
import DOMPurify from 'dompurify'
import { marked } from 'marked'

// Markdown in SalesOS text fields (a deal's scope, a company's description): written by people here, shown to their colleagues.
// Formatting only: headings, emphasis, lists, quotes, tables, code and links. Nothing that loads or runs: no images (they would load
// from anywhere), frames, styles, forms or raw HTML handlers. Links open in a new tab and only go to web, mail or phone addresses.

const ALLOWED_TAGS = ['p', 'br', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'strong', 'b', 'em', 'i', 'del', 's', 'ul', 'ol', 'li', 'blockquote', 'code', 'pre', 'a', 'table', 'thead', 'tbody', 'tr', 'th', 'td']

export function renderSalesMarkdown(md: string): string {
  const raw = marked.parse(md ?? '', { async: false, gfm: true, breaks: true }) as string
  const frag = DOMPurify.sanitize(raw, { ALLOWED_TAGS, ALLOWED_ATTR: ['href', 'title', 'align'], RETURN_DOM_FRAGMENT: true }) as DocumentFragment
  frag.querySelectorAll('a').forEach(a => {
    const href = (a.getAttribute('href') ?? '').trim()
    if (!/^(https?:\/\/|mailto:|tel:)/i.test(href)) a.removeAttribute('href')
    else { a.setAttribute('target', '_blank'); a.setAttribute('rel', 'noopener noreferrer') }
  })
  const box = document.createElement('div')
  box.appendChild(frag)
  return box.innerHTML
}

/** Whether text uses any Markdown worth rendering (so plain text stays exactly as typed). */
export const looksLikeMarkdown = (s: string): boolean => /(^|\n)\s{0,3}(#{1,6}\s|[-*+]\s|\d+\.\s|>\s)|\*\*[^*\n]+\*\*|__[^_\n]+__|\[[^\]\n]+\]\([^)\n]+\)|`[^`\n]+`/.test(s)

const KEY = 'sos.markdown.formatted'
/** The viewer's choice of formatted or plain text, remembered in this browser (formatted unless they turned it off). */
export function readFormatted(): boolean { try { return localStorage.getItem(KEY) !== '0' } catch { return true } }
export function writeFormatted(on: boolean): void { try { localStorage.setItem(KEY, on ? '1' : '0') } catch { /* not remembered */ } }

/** The viewer's formatted/plain choice as state; the choice holds across cards and visits in this browser. */
export function useFormatted(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(readFormatted)
  return [on, v => { writeFormatted(v); setOn(v) }]
}
