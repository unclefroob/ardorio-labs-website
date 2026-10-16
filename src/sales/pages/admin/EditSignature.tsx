import { useState } from 'react'
import { importSignatureApi, setSignatureApi } from '../../api/mailboxes'
import { SalesHttpError } from '../../api/http'
import { pollOnce } from '../../data/sync'
import type { Mailbox } from '../../data/types'
import { Banner, Btn, RichText } from '../../kit'
import { safeSignature } from '../../modals/comms/MailExtras'
import { UI } from '../../ui/store'

/**
 * The signature added under every email from a mailbox (sent by hand or by a sequence). It starts as the one set in Gmail; it can be
 * fetched from Gmail again, or written here. The editor keeps plain formatting and links: a signature with a logo or a table is best
 * kept as it is in Gmail and fetched.
 */
export function EditSignature({ m, onDone }: { m: Mailbox; onDone: () => void }) {
  const current = m.signature ?? ''
  const rich = /<(img|table)\b/i.test(current)
  const [editing, setEditing] = useState(!current)
  const [draft, setDraft] = useState(current)
  // Which action is working (each shows it on its own button); null when none.
  const [busy, setBusy] = useState<'fetch' | 'save' | 'remove' | null>(null)
  const [err, setErr] = useState('')
  const run = async (fn: () => Promise<{ signature: string }>, said: (s: string) => string, which: 'fetch' | 'save' | 'remove'): Promise<void> => {
    setErr('')
    setBusy(which)
    try {
      const r = await fn()
      await pollOnce()
      setDraft(r.signature)
      setEditing(false)
      UI.toast(said(r.signature))
    } catch (e) {
      setErr(e instanceof SalesHttpError ? e.message : 'Could not reach the server. Try again.')
    } finally {
      setBusy(null)
    }
  }
  const fromGmail = (): Promise<void> => run(() => importSignatureApi(m.id), s => (s ? 'Signature fetched from Gmail' : 'There is no signature in Gmail for ' + m.address), 'fetch')
  const save = (html: string): Promise<void> => run(() => setSignatureApi(m.id, html), s => (s ? 'Signature saved' : 'Signature removed'), html ? 'save' : 'remove')
  const preview = safeSignature(current)
  return (
    <div className="col" style={{ gap: 8, padding: '10px 14px', borderTop: '1px solid var(--line)', background: 'var(--surf2)' }}>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <b className="sm">Signature for {m.address}</b>
        <span className="faint xs">Added under every email from this mailbox, including sequence emails. You can leave it off any one email.</span>
        <span className="sp" />
        <Btn size="sm" icon="download" onClick={() => void fromGmail()} loading={busy === 'fetch'} disabled={!!busy || m.status !== 'connected'}>{busy === 'fetch' ? 'Fetching…' : 'Fetch from Gmail'}</Btn>
        <Btn size="sm" onClick={onDone} disabled={!!busy}>Close</Btn>
      </div>
      {editing ? (
        <>
          {rich && <Banner tone="warn">This signature has a picture or a table, which the editor here does not keep. To change those, edit it in Gmail and fetch it again.</Banner>}
          <RichText value={draft} onChange={setDraft} minH={90} label="Signature" />
          <div className="row" style={{ gap: 6 }}>
            <span className="sp" />
            {current && <Btn size="sm" onClick={() => { setDraft(current); setEditing(false) }} disabled={!!busy}>Cancel</Btn>}
            <Btn size="sm" kind="pri" onClick={() => void save(draft)} loading={busy === 'save'} disabled={!!busy}>{busy === 'save' ? 'Saving…' : 'Save signature'}</Btn>
          </div>
        </>
      ) : (
        <>
          <div className="sig-preview sm" aria-label="Current signature" dangerouslySetInnerHTML={{ __html: preview }} />
          <div className="row" style={{ gap: 6 }}>
            <span className="sp" />
            <Btn size="sm" kind="ghost" onClick={() => void save('')} loading={busy === 'remove'} disabled={!!busy}>{busy === 'remove' ? 'Removing…' : 'Remove'}</Btn>
            <Btn size="sm" icon="edit" onClick={() => setEditing(true)} disabled={!!busy}>Edit</Btn>
          </div>
        </>
      )}
      {err && <Banner tone="bad">{err}</Banner>}
    </div>
  )
}
