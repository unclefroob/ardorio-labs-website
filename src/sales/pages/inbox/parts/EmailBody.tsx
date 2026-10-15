import { useEffect, useMemo, useRef, useState } from 'react'
import { messageHtmlApi } from '../../../api/mailboxes'
import { F } from '../../../data/F'
import type { Message } from '../../../data/types'
import { emailDoc, foldQuotes } from '../../../mail/emailHtml'
import { useMailState } from '../../../mail/client'
import { Btn } from '../../../kit'

// What was fetched this session, by message id. null = Gmail has no HTML for it (show the text).
const cache = new Map<string, string | null>()
export const clearEmailBodies = (): void => cache.clear()

const SANDBOX = 'allow-same-origin allow-popups allow-popups-to-escape-sandbox' // no allow-scripts: the frame can never run script

/**
 * A message body as the sender wrote it, the way Gmail shows it. Mail that came from Gmail is shown from its original HTML, sanitised and
 * held in a frame with no scripts and no network (remote images only if asked); anything else, or anything that cannot be fetched, shows
 * the text SalesOS already holds. Nothing here changes what is stored.
 */
export function EmailBody({ m }: { m: Message }) {
  const live = useMailState().s === 'live'
  const eligible = live && !!m.gmailId && m.status !== 'draft'
  const [html, setHtml] = useState<string | null | undefined>(() => (cache.has(m.id) ? cache.get(m.id) : undefined))
  const [images, setImages] = useState(false)

  useEffect(() => {
    if (!eligible || cache.has(m.id)) return // (a cached body was already read into state when this component was made)
    const ctl = new AbortController()
    messageHtmlApi(m.id, ctl.signal)
      .then(r => { cache.set(m.id, r.html); setHtml(r.html) })
      .catch(() => { if (!ctl.signal.aborted) setHtml(null) }) // not cached: the next open tries again
    return () => ctl.abort()
  }, [eligible, m.id])

  const doc = useMemo(() => (html ? emailDoc(html, images) : null), [html, images])
  const frame = useRef<HTMLIFrameElement>(null)
  const sized = useRef<ResizeObserver | null>(null)

  useEffect(() => () => { sized.current?.disconnect() }, [])

  const onLoad = (): void => {
    const f = frame.current
    const d = f?.contentDocument
    if (!f || !d) return
    foldQuotes(d)
    const fit = (): void => { f.style.height = d.documentElement.scrollHeight + 'px' }
    fit()
    sized.current?.disconnect()
    if (typeof ResizeObserver !== 'undefined') {
      sized.current = new ResizeObserver(fit)
      sized.current.observe(d.documentElement)
    }
    d.addEventListener('load', fit, true) // images arriving after the first paint
  }

  if (!doc) return <div className="sm msg-b" dangerouslySetInnerHTML={{ __html: F.body(m.body) }} />
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
      />
    </div>
  )
}
