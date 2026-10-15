import DOMPurify from 'dompurify'

/**
 * Email HTML, made safe to show. Email is hostile input: it can carry script, forms, trackers and styles meant to deceive. Three layers, so
 * that no single mistake here is enough:
 *   1. DOMPurify with a strict allow-list of tags and attributes (no script, frame, form, svg, meta, link or base; links http(s)/mailto/tel only);
 *   2. remote images removed unless the person asked for them (a remote image tells the sender you opened the mail, and from where);
 *   3. the result is shown in a sandboxed frame with no scripts, whose own Content-Security-Policy refuses every network request except
 *      images the person allowed.
 */

const TAGS = [
  'a', 'abbr', 'address', 'b', 'big', 'blockquote', 'br', 'caption', 'center', 'cite', 'code', 'col', 'colgroup', 'dd', 'del', 'div', 'dl', 'dt', 'em', 'font',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'i', 'img', 'ins', 'li', 'ol', 'p', 'pre', 'q', 's', 'small', 'span', 'strike', 'strong', 'style', 'sub', 'sup',
  'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'u', 'ul',
]
const ATTRS = [
  'href', 'src', 'alt', 'title', 'width', 'height', 'align', 'valign', 'bgcolor', 'color', 'border', 'cellpadding', 'cellspacing', 'colspan', 'rowspan',
  'style', 'class', 'dir', 'lang', 'target', 'rel', 'face', 'size', 'nowrap', 'type',
]
const FORBIDDEN = ['script', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'textarea', 'select', 'option', 'meta', 'link', 'base', 'svg', 'math', 'video', 'audio', 'source', 'frame', 'frameset', 'template', 'noscript']
const INLINE_IMAGE = /^data:image\/(?:png|gif|jpe?g|webp);base64,[a-z0-9+/=\s]+$/i

const BASE_CSS = `
html,body{margin:0;padding:0;background:#fff}
body{padding:14px 16px;font:14px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#1c1917;overflow-wrap:anywhere;word-break:break-word}
img{max-width:100%;height:auto}
table{max-width:100%}
a{color:#4338ca}
blockquote{margin:0 0 0 .4em;padding-left:1em;border-left:2px solid #d6d3d1;color:#57534e}
pre{white-space:pre-wrap}
.sos-trim{display:inline-block;margin:6px 0;padding:0 8px;line-height:16px;border:1px solid #d6d3d1;border-radius:9px;background:#f5f5f4;color:#57534e;font:12px/16px sans-serif;cursor:pointer}
img[data-blocked]{display:inline-block;min-width:24px;min-height:16px;background:#f5f5f4;border:1px dashed #d6d3d1}
`

export interface EmailDoc {
  /** A complete document for the frame's srcdoc. */
  srcdoc: string
  /** Remote images that were left out (the person can ask for them). */
  blockedImages: number
}

const cleanCss = (css: string, images: boolean): string => {
  let c = css.replace(/@import[^;]*;?/gi, '').replace(/expression\s*\(/gi, '(').replace(/javascript:/gi, '').replace(/behavior\s*:/gi, 'x:')
  // A CSS url() is a request. Only https images the person allowed survive; everything else becomes nothing.
  c = c.replace(/url\(\s*(['"]?)([^)'"]*)\1\s*\)/gi, (_m, _q, u: string) => (images && /^https:\/\//i.test(u.trim()) ? `url("${u.trim().replace(/"/g, '')}")` : 'none'))
  return c
}

/**
 * `inline` holds the pictures the mail carries inside itself, by Content-ID, as data: addresses from the server. They are part of the mail and
 * make no request, so they show even while remote images are hidden.
 */
export function emailDoc(raw: string, images: boolean, inline: Readonly<Record<string, string>> = {}): EmailDoc {
  const byCid = new Map(Object.entries(inline).map(([k, v]) => [k.toLowerCase(), v] as const))
  const purify = DOMPurify(window)
  let blocked = 0
  purify.addHook('afterSanitizeAttributes', node => {
    const el = node as Element
    const tag = el.tagName.toLowerCase()
    if (tag === 'a') {
      // Only these destinations are kept: anything else (script, data, relative, protocol-relative) leaves the text but not the link.
      const href = (el.getAttribute('href') ?? '').trim()
      if (!/^(?:https?:|mailto:|tel:)/i.test(href)) el.removeAttribute('href')
      el.setAttribute('target', '_blank')
      el.setAttribute('rel', 'noopener noreferrer nofollow')
    }
    if (tag === 'img') {
      let src = (el.getAttribute('src') ?? '').trim()
      if (/^cid:/i.test(src)) {
        let cid = src.slice(4).replace(/^<|>$/g, '')
        try { cid = decodeURIComponent(cid) } catch { /* keep as written */ }
        const data = byCid.get(cid.toLowerCase())
        if (data && INLINE_IMAGE.test(data)) { el.setAttribute('src', data); return }
      }
      if (INLINE_IMAGE.test(src)) return // embedded in the mail itself: no request
      if (src.startsWith('//')) src = 'https:' + src
      if (/^https:\/\//i.test(src)) {
        if (images) { el.setAttribute('src', src); return }
        blocked++ // a remote image the person can ask for
      }
      // Anything else (http, cid:, a bad data: image) is never shown, and offering "show images" would not help.
      el.removeAttribute('src')
      el.setAttribute('data-blocked', '1')
    }
    const style = el.getAttribute('style')
    if (style) el.setAttribute('style', cleanCss(style, images))
  })
  purify.addHook('uponSanitizeElement', (node, data) => {
    if (data.tagName === 'style') (node as Element).textContent = cleanCss((node as Element).textContent ?? '', images)
  })
  const body = purify.sanitize(raw, {
    ALLOWED_TAGS: TAGS, ALLOWED_ATTR: ATTRS, FORBID_TAGS: FORBIDDEN, ALLOW_DATA_ATTR: false, ALLOW_ARIA_ATTR: false,
    FORCE_BODY: true, KEEP_CONTENT: true,
  })
  purify.removeAllHooks()
  const csp = `default-src 'none'; img-src data:${images ? ' https:' : ''}; style-src 'unsafe-inline'; font-src data:`
  return {
    srcdoc: `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><base target="_blank"><style>${BASE_CSS}</style></head><body>${body}</body></html>`,
    blockedImages: blocked,
  }
}

const QUOTES = '.gmail_quote, blockquote[type="cite"], .yahoo_quoted, .moz-cite-prefix'

/**
 * Gmail folds the quoted history of a reply behind a "…" button. Done from outside the frame (the frame itself runs no script): each
 * top-level quote is hidden, with a button before it that shows or hides it.
 */
export function foldQuotes(doc: Document): void {
  const all = [...doc.querySelectorAll<HTMLElement>(QUOTES)]
  const top = all.filter(el => !all.some(o => o !== el && o.contains(el)))
  for (const q of top) {
    if (!q.textContent?.trim() || q.previousElementSibling?.classList.contains('sos-trim')) continue
    const b = doc.createElement('button')
    b.type = 'button'
    b.className = 'sos-trim'
    b.textContent = '···'
    b.title = 'Show trimmed content'
    q.style.display = 'none'
    b.addEventListener('click', () => {
      const hidden = q.style.display === 'none'
      q.style.display = hidden ? '' : 'none'
      b.title = hidden ? 'Hide trimmed content' : 'Show trimmed content'
    })
    q.parentNode?.insertBefore(b, q)
  }
}
