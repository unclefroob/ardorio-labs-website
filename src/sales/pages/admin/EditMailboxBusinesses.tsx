import { useState } from 'react'
import { setMailboxBusinessesApi } from '../../api/mailboxes'
import { SalesHttpError } from '../../api/http'
import { pollOnce } from '../../data/sync'
import { Q } from '../../data/Q'
import { S } from '../../data/store'
import type { Mailbox } from '../../data/types'
import { Banner, Btn, Sel } from '../../kit'
import { UI } from '../../ui/store'

const nameOf = (b: string): string => S.businesses.find(x => x.id === b)?.name ?? b

/**
 * Which businesses a mailbox serves, changed after it was added. A personal mailbox can serve any business its owner works in; a shared
 * inbox serves one business. Mail already filed stays where it is.
 */
export function EditMailboxBusinesses({ m, onDone }: { m: Mailbox; onDone: () => void }) {
  const shared = m.type === 'shared'
  const choices = [...new Set([...m.businessIds, ...Q.myBiz().filter(b => (shared ? Q.canAdmin(b) : Q.canEdit(b)))])]
  const [picked, setPicked] = useState<string[]>(m.businessIds)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const toggle = (b: string): void => setPicked(p => (p.includes(b) ? p.filter(x => x !== b) : [...p, b]))
  const save = async (): Promise<void> => {
    setErr('')
    if (!picked.length) return setErr('Choose at least one business')
    setBusy(true)
    try {
      await setMailboxBusinessesApi(m.id, picked)
      await pollOnce()
      UI.toast(`${m.address} now serves ${picked.map(nameOf).join(', ')}. New mail is filed there; mail already filed stays where it is.`)
      onDone()
    } catch (e) {
      setErr(e instanceof SalesHttpError ? e.message : 'Could not reach the server. Try again.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="col" style={{ gap: 8, padding: '10px 14px', borderTop: '1px solid var(--line)', background: 'var(--surf2)' }}>
      <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
        <b className="sm">Businesses for {m.address}</b>
        {shared ? (
          <Sel aria-label="Business" value={picked[0] ?? ''} onChange={v => setPicked([v])} options={choices.map(b => [b, nameOf(b)] as const)} style={{ width: 200 }} />
        ) : choices.map(b => (
          <label key={b} className="row sm" style={{ gap: 4 }}><input type="checkbox" checked={picked.includes(b)} onChange={() => toggle(b)} />{nameOf(b)}</label>
        ))}
        <span className="sp" />
        <Btn size="sm" onClick={onDone} disabled={busy}>Cancel</Btn>
        <Btn size="sm" kind="pri" onClick={() => void save()} loading={busy}>{busy ? 'Saving…' : 'Save'}</Btn>
      </div>
      {err && <Banner tone="bad">{err}</Banner>}
    </div>
  )
}
