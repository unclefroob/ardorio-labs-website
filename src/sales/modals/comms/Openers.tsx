import { useEffect, useRef, useState } from 'react'
import { aiNotConfigured, isFailure, openingLines, type OpenerOutcome } from '../../ai/client'
import { checkCompany } from '../../ai/intelRun'
import type { BusinessId, CompanySignal } from '../../api/contract'
import { F } from '../../data/F'
import { Q } from '../../data/Q'
import { openerUsable } from '../../data/signalAdjust'
import { flushAll } from '../../data/sync'
import { Banner, Btn, Spinner } from '../../kit'
import { Src } from '../../shared/IntelBits'
import { useLookups } from '../../shared/useLookups'

const KIND: Record<string, string> = { hiring: 'Hiring', expansion: 'Expansion', funding: 'Funding', closure: 'Closure', news: 'News' }

/** Put a line at the top of an email body. The line is plain text: it is escaped, and {{ }} can never become a merge tag. */
export function withOpener(body: string, line: string): string {
  const safe = F.esc(line.replace(/\{\{|\}\}/g, '').trim())
  const rest = body.trim()
  if (!rest) return `<p>${safe}</p>`
  return /<\w/.test(rest) ? `<p>${safe}</p>${rest}` : `<p>${safe}</p><p>${F.esc(rest).replace(/\n/g, '<br>')}</p>`
}

/**
 * Up to three opening lines written from signals already saved for the company. It costs no web lookup.
 * Nothing is inserted until a line is chosen, and every failure leaves the email editable.
 */
export function Openers({ b, companyId, contactId, onInsert }: { b: BusinessId; companyId?: string; contactId?: string; onInsert: (line: string) => void }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [checking, setChecking] = useState(false)
  const [out, setOut] = useState<OpenerOutcome | null>(null)
  const [note, setNote] = useState('')
  const [sync, setSync] = useState<'local' | 'server' | null>(null)
  const live = useRef<AbortController | null>(null)
  const lk = useLookups(open ? b : undefined)
  useEffect(() => () => live.current?.abort(), [])

  if (aiNotConfigured() || (!companyId && !contactId)) return null

  const fetchLines = async (): Promise<OpenerOutcome> => {
    const ac = new AbortController()
    live.current = ac
    const o = await openingLines({ businessId: b, ...(companyId ? { companyId } : { contactId }) }, { signal: ac.signal })
    return live.current === ac ? o : { status: 'cancelled' }
  }
  const signalsHere = (): boolean => !!companyId && ((Q.intel(companyId, 'signals', b)?.items ?? []) as CompanySignal[]).some(x => openerUsable(x))
  // Signals saved in this browser reach the server through sync. Flush first, and never send them from here:
  // the server only ever writes lines from what it has stored.
  const load = async (): Promise<void> => {
    setBusy(true)
    setSync(null)
    setOut(null)
    const here = signalsHere()
    if (here && !(await flushAll())) {
      setBusy(false)
      setSync('local')
      return
    }
    const o = await fetchLines()
    live.current = null
    setBusy(false)
    if (o.status === 'cancelled') return
    if (o.status === 'noSignals' && here) {
      setSync('server')
      return
    }
    setOut(o)
  }
  const show = async (): Promise<void> => {
    if (busy || checking) return
    setOpen(true)
    setNote('')
    await load()
  }
  const checkThenShow = async (): Promise<void> => {
    if (!companyId || checking) return
    setChecking(true)
    setNote('')
    const ac = new AbortController()
    live.current = ac
    const c = await checkCompany('signals', companyId, b, { signal: ac.signal })
    if (live.current !== ac) return
    live.current = null
    setChecking(false)
    if (isFailure(c)) {
      setNote(c.status === 'cap' ? 'The monthly lookup limit is reached.' : c.status === 'notConfigured' ? 'Grok is not configured, so signals cannot be searched.' : c.status === 'cancelled' ? 'Cancelled.' : 'The signals search did not work. Try again later.')
      return
    }
    if (!c.items.length) {
      setNote('No signals were found on the web for this company either.')
      return
    }
    if (!signalsHere()) {
      setNote(`Found ${c.items.length} ${c.items.length === 1 ? 'signal' : 'signals'}, but none with a date in the last 6 months to open with. They are saved on the company page.`)
      return
    }
    await load()
  }

  const co = companyId ? Q.company(companyId) : undefined
  const canCheck = !!companyId && Q.canEdit(b) && !lk.notConfigured && !lk.capped

  return (
    <div className="col" style={{ gap: 6 }}>
      <div className="row" style={{ gap: 6 }}>
        <Btn size="xs" kind="ghost" icon="bulb" disabled={busy || checking} onClick={() => void show()}>Opening lines</Btn>
        {open && <Btn size="xs" kind="ghost" onClick={() => { live.current?.abort(); live.current = null; setBusy(false); setChecking(false); setOpen(false); setOut(null); setNote(''); setSync(null) }}>Hide</Btn>}
      </div>
      {open && (
        <div className="card card-b col" style={{ gap: 8, background: 'var(--surf2)' }} aria-live="polite">
          {(busy || checking) && <div className="row sm" aria-busy="true"><Spinner />{checking ? `Searching the web for signals about ${co?.name ?? 'this company'}…` : 'Writing opening lines from saved signals…'}</div>}
          {!busy && !checking && out?.status === 'ok' && (
            <>
              <div className="xs faint">Written from signals saved for {co?.name ?? 'this company'}. Pick one to put it at the top of the email.</div>
              {out.openers.map(o => (
                <div key={o.text} className="row" style={{ alignItems: 'flex-start', gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="sm">{o.text}</div>
                    <div className="row xs faint" style={{ gap: 6 }}>{KIND[o.signalKind] ?? 'Signal'} · <Src url={o.sourceUrl} /></div>
                  </div>
                  <Btn size="xs" onClick={() => onInsert(o.text)}>Use this</Btn>
                </div>
              ))}
            </>
          )}
          {!busy && !checking && sync && (
            <div className="row sm" style={{ gap: 8 }} role="status">
              {sync === 'local' ? 'Saved here, not synced yet.' : "Saved here, but the server doesn't have them yet."}
              <Btn size="xs" onClick={() => void load()}>{sync === 'local' ? 'Retry' : 'Retry sync'}</Btn>
            </div>
          )}
          {!busy && !checking && !sync && out?.status === 'noSignals' && (
            <div className="col" style={{ gap: 6 }}>
              <div className="sm"><b>No saved signals for this company yet.</b> There is nothing true to open with.</div>
              {lk.capped && lk.pausedLabel && <div className="sm muted" role="status">{lk.pausedLabel}.</div>}
              {canCheck && <div className="row" style={{ gap: 8 }}><Btn size="sm" icon="search" onClick={() => void checkThenShow()}>Check signals first · 1 lookup</Btn>{lk.label && <span className="sm muted">{lk.label}</span>}</div>}
            </div>
          )}
          {!busy && !checking && !sync && out && isFailure(out) && out.status !== 'cancelled' && (
            <div className="row sm muted" style={{ gap: 8 }}>Opening lines are not available right now. You can keep writing.<Btn size="xs" onClick={() => void show()}>Try again</Btn></div>
          )}
          {note && <Banner tone="info">{note}</Banner>}
        </div>
      )}
    </div>
  )
}
