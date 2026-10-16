import { useEffect, useMemo, useRef, useState } from 'react'
import { messageHtmlApi } from '../../../api/mailboxes'
import { F } from '../../../data/F'
import type { Message } from '../../../data/types'
import { emailDoc, foldQuotes } from '../../../mail/emailHtml'
import { reflowText } from '../../../mail/reflow'
import { useMailState } from '../../../mail/client'
import { Btn } from '../../../kit'

// What was fetched this session, by message id. html null = Gmail has no HTML for it (show the text).
interface Fetched { html: string | null; images: Record<string, string> }
const cache = new Map<string, Fetched>()
// How tall each message turned out, so opening it again reserves exactly that space and nothing below it moves.
const heights = new Map<string, number>()
export const clearEmailBodies = (): void => { cache.clear(); heights.clear() }

const SANDBOX = 'allow-same-origin allow-popups allow-popups-to-escape-sandbox' // no allow-scripts: the frame can never run script

/** A first guess at a message's height from its text, so the space is held while the original is fetched and laid out. */
function estimate(m: Message): number {
  const lines = F.plain(m.body).split('\n').reduce((n, l) => n + Math.max(1, Math.ceil(l.length / 95)), 0)
  return Math.min(520, Math.max(60, lines * 21 + 28))
}

/**
 * A message body as the sender wrote it, the way Gmail shows it. Mail that came from Gmail is shown from its original HTML, sanitised and
 * held in a frame with no scripts and no network (remote images only if asked); anything else, or anything that cannot be fetched, shows
 * the text SalesOS already holds. Nothing here changes what is stored.
 *
 * It holds its space while it loads and only appears once it has been measured, so the conversation does not jump: no flash of plain text
 * before the original, no frame that starts small and grows.
 */
export function EmailBody({ m }: { m: Message }) {
  const mail = useMailState().s
  const fromGmail = !!m.gmailId && m.status !== 'draft'
  const eligible = mail === 'live' && fromGmail
  const [got, setGot] = useState<Fetched | null | undefined>(() => cache.get(m.id))
  const [attempt, setAttempt] = useState(0)
  const [images, setImages] = useState(false)
  const [h, setH] = useState<number | null>(() => heights.get(m.id) ?? null)

  useEffect(() => {
    if (!eligible || cache.has(m.id)) return // (a cached body was already read into state when this component was made)
    const ctl = new AbortController()
    messageHtmlApi(m.id, ctl.signal)
      .then(r => { const f = { html: r.html, images: r.images ?? {} }; cache.set(m.id, f); setGot(f) })
      .catch(() => { if (!ctl.signal.aborted) setGot(null) }) // not cached: the next open (or Retry) tries again
    return () => ctl.abort()
  }, [eligible, m.id, attempt])

  const doc = useMemo(() => (got?.html ? emailDoc(got.html, images, got.images) : null), [got, images])
  const frame = useRef<HTMLIFrameElement>(null)
  const sized = useRef<ResizeObserver | null>(null)

  useEffect(() => () => { sized.current?.disconnect() }, [])

  const onLoad = (): void => {
    const f = frame.current
    const d = f?.contentDocument
    if (!f || !d || !d.body) return
    foldQuotes(d)
    // The content's own height, which can shrink as well as grow (folding a quote, a short reply). The frame's scrollHeight cannot shrink
    // below the frame, so it is not used.
    const fit = (): void => {
      const next = Math.ceil(Math.max(d.documentElement.getBoundingClientRect().height, d.body.scrollHeight))
      if (next <= 0) return
      heights.set(m.id, next)
      setH(prev => (prev === next ? prev : next))
    }
    fit()
    sized.current?.disconnect()
    if (typeof ResizeObserver !== 'undefined') {
      sized.current = new ResizeObserver(() => fit())
      sized.current.observe(d.body)
    }
    d.addEventListener('load', fit, true) // images arriving after the first paint
  }

  // Still finding out whether this is real Gmail, or fetching the original: hold the space it will need.
  const waiting = fromGmail && (mail === 'loading' || (eligible && got === undefined))
  if (waiting) return <div className="email-wait" style={{ height: h ?? estimate(m) }} aria-busy="true" aria-label="Loading message" />

  // No HTML to show: the stored text. Mail from Gmail arrives hard-wrapped at about 78 characters, so its lines are joined back into paragraphs.
  if (!doc) {
    return (
      <>
        <div className="sm msg-b" dangerouslySetInnerHTML={{ __html: F.body(m.gmailId ? reflowText(m.body) : m.body) }} />
        {eligible && got === null && (
          <div className="row xs" style={{ gap: 6, marginTop: 6 }}>
            <span className="faint">Could not load the original formatting.</span>
            <Btn size="xs" kind="ghost" onClick={() => { setGot(undefined); setAttempt(n => n + 1) }}>Retry</Btn>
          </div>
        )}
      </>
    )
  }
  return (
    <div className="email-body">
      {doc.blockedImages > 0 && !images && (
        <div className="row xs email-img-note">
          <span className="faint">Images are hidden so the sender cannot see that you opened this.</span>
          <Btn size="xs" kind="ghost" onClick={() => setImages(true)}>Show images</Btn>
        </div>
      )}
      <iframe
        ref={frame} title="Email content" className="email-frame" sandbox={SANDBOX} srcDoc={doc.srcdoc} referrerPolicy="no-referrer" onLoad={onLoad}
        // + 2: the frame's own border, top and bottom.
        style={{ height: (h ?? estimate(m)) + 2, visibility: h === null ? 'hidden' : undefined }}
      />
    </div>
  )
}
