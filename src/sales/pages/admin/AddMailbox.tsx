import { useState } from 'react'
import { createMailboxApi } from '../../api/mailboxes'
import { SalesHttpError } from '../../api/http'
import { pollOnce } from '../../data/sync'
import { Q } from '../../data/Q'
import { S } from '../../data/store'
import { Banner, Btn, Fld, Inp, Sel } from '../../kit'
import { UI } from '../../ui/store'

const nameOf = (b: string): string => S.businesses.find(x => x.id === b)?.name ?? b

/**
 * Add a mailbox to connect. A personal mailbox is the person's own (the server makes them its owner) and may serve any business they
 * work in; a shared inbox belongs to one business and needs an admin there. Adding it connects nothing: Connect Gmail does that.
 */
export function AddMailbox({ kind, onDone }: { kind: 'personal' | 'shared'; onDone: () => void }) {
  const choices = Q.myBiz().filter(b => (kind === 'personal' ? Q.canEdit(b) : Q.canAdmin(b)))
  const [address, setAddress] = useState('')
  const [picked, setPicked] = useState<string[]>(choices.length === 1 || kind === 'shared' ? choices.slice(0, 1) : [])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const toggle = (b: string): void => setPicked(p => (p.includes(b) ? p.filter(x => x !== b) : [...p, b]))
  const save = async (): Promise<void> => {
    setErr('')
    if (!address.trim()) return setErr('Enter the mailbox\'s full email address')
    if (picked.length === 0) return setErr('Choose a business')
    setBusy(true)
    try {
      await createMailboxApi({ address: address.trim(), type: kind, businessIds: picked })
      await pollOnce()
      UI.toast(`${address.trim().toLowerCase()} added. Press Connect Gmail to link it.`)
      onDone()
    } catch (e) {
      setErr(e instanceof SalesHttpError ? e.message : 'Could not reach the server. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="col" style={{ gap: 10, padding: 14, borderBottom: '1px solid var(--line)' }}>
      <div className="row" style={{ gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <Fld label={kind === 'personal' ? 'Your Google address' : 'Shared inbox address'} hint="Exactly the account you will sign in with" style={{ minWidth: 260, flex: 1 }}>
          <Inp type="email" value={address} onChange={setAddress} placeholder={kind === 'personal' ? 'you@yourcompany.com' : 'hello@yourcompany.com'} />
        </Fld>
        {kind === 'shared'
          ? (
            <Fld label="Business">
              <Sel value={picked[0] ?? ''} onChange={v => setPicked([v])} options={choices.map(b => [b, nameOf(b)] as const)} />
            </Fld>
          )
          : choices.length > 1 && (
            <Fld label="Businesses it serves">
              <span className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                {choices.map(b => (
                  <label key={b} className="row" style={{ gap: 4 }}>
                    <input type="checkbox" checked={picked.includes(b)} onChange={() => toggle(b)} />{nameOf(b)}
                  </label>
                ))}
              </span>
            </Fld>
          )}
        <Btn kind="pri" onClick={() => void save()} loading={busy}>{busy ? 'Adding…' : 'Add mailbox'}</Btn>
        <Btn kind="ghost" onClick={onDone} disabled={busy}>Cancel</Btn>
      </div>
      {err && <Banner tone="bad">{err}</Banner>}
    </div>
  )
}
