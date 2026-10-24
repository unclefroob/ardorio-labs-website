import { useEffect, useState } from 'react'
import type { RosterioInvoice, XeroContactRef } from '../../api/contract'
import { invoiceError } from '../../api/invoices'
import { sendStripeInvoiceToXero, xeroContacts, xeroSaveStripeContact } from '../../api/xero'
import { Btn, Card, Chip, Inp } from '../../kit'
import { payoutLine, stripeFeeLine, stripeXero } from '../../shared/xero'
import { UI } from '../../ui/store'

const DEBOUNCE_MS = 300

/** Under the Rosterio invoices: the Xero contact for this customer, the button to send or retry, and the fee and payout once known. */
export function RosterioXeroPanel({ invoice: inv, canAct, onChange, onClose }: { invoice: RosterioInvoice; canAct: boolean; onChange: () => void; onClose?: () => void }) {
  const v = stripeXero(inv.xero)
  const [busy, setBusy] = useState(false)
  const [changing, setChanging] = useState(false)
  const [term, setTerm] = useState('')
  const [found, setFound] = useState<XeroContactRef[] | null>(null)
  const [searchErr, setSearchErr] = useState('')
  const picking = canAct && (!inv.xeroContact || changing)

  // Search Xero once typing pauses.
  useEffect(() => {
    const t = term.trim()
    if (!picking || !t) { setFound(null); setSearchErr(''); return }
    const ac = new AbortController()
    const h = setTimeout(() => {
      xeroContacts(t, ac.signal).then(
        r => { if (!ac.signal.aborted) { setFound(r.contacts); setSearchErr('') } },
        e => { if (!ac.signal.aborted) { setFound(null); setSearchErr(invoiceError(e, 'load').message) } },
      )
    }, DEBOUNCE_MS)
    return () => { clearTimeout(h); ac.abort() }
  }, [term, picking])

  const pick = async (contactId: string): Promise<void> => {
    setBusy(true)
    try {
      await xeroSaveStripeContact(inv.customerId, contactId)
      UI.toast(contactId ? 'Xero contact saved' : 'Xero contact cleared')
      setChanging(false); setTerm(''); setFound(null)
      onChange()
    } catch (e) {
      UI.toast(invoiceError(e, 'save').message, 'bad')
    } finally {
      setBusy(false)
    }
  }
  const send = async (): Promise<void> => {
    setBusy(true)
    try {
      const next = await sendStripeInvoiceToXero(inv.id)
      const st = next.xero?.state
      UI.toast(st === 'error' ? 'Xero rejected the invoice' : 'Sent to Xero', st === 'error' ? 'bad' : undefined)
      onChange()
    } catch (e) {
      UI.toast(invoiceError(e, 'save').message, 'bad')
    } finally {
      setBusy(false)
    }
  }

  const fee = stripeFeeLine(inv.xero?.feeCents)
  const payout = payoutLine(inv.xero?.payout)
  return (
    <Card title={`Xero · ${inv.number ?? inv.customerName}`} icon="plug" right={<span className="row" style={{ gap: 8 }}>{v && <Chip tone={v.tone}>{v.label}</Chip>}{onClose && <Btn size="sm" kind="ghost" onClick={onClose}>Close</Btn>}</span>}>
      <div className="col" style={{ gap: 10 }}>
        <div className="row wrap" style={{ gap: 8 }}>
          <span className="faint sm">Contact</span>
          <span className="b">{inv.xeroContact ? inv.xeroContact.name : 'No Xero contact yet'}</span>
          {canAct && inv.xeroContact && !changing && <Btn size="sm" kind="ghost" onClick={() => setChanging(true)}>Change</Btn>}
          {canAct && inv.xeroContact && changing && <Btn size="sm" kind="ghost" onClick={() => { setChanging(false); setTerm('') }}>Keep</Btn>}
        </div>
        {picking && (
          <div className="col" style={{ gap: 6 }}>
            <Inp value={term} onChange={setTerm} placeholder="Search Xero contacts" aria-label="Search Xero contacts" style={{ maxWidth: 320 }} />
            {searchErr && <div className="sm" role="alert">{searchErr}</div>}
            {found && !found.length && <div className="sm muted">No contacts match.</div>}
            {found && found.length > 0 && (
              <ul className="col" style={{ gap: 4, listStyle: 'none', margin: 0, padding: 0 }}>
                {found.map(c => <li key={c.id}><Btn size="sm" onClick={() => void pick(c.id)} disabled={busy}>{c.name}</Btn></li>)}
              </ul>
            )}
          </div>
        )}
        {v && <div className={'sm ' + (v.tone === 'bad' ? '' : 'muted')} role={v.tone === 'bad' ? 'alert' : undefined}>{v.text}</div>}
        {(fee || payout) && (
          <div className="col" style={{ gap: 2 }}>
            {fee && <div className="sm">{fee}</div>}
            {payout && <div className="sm muted">{payout}</div>}
          </div>
        )}
        <div className="row wrap" style={{ gap: 8 }}>
          {canAct && v && v.action !== null && inv.xeroContact && <Btn size="sm" kind={v.action === 'retry' ? 'pri' : undefined} onClick={() => void send()} loading={busy}>{v.action === 'retry' ? 'Retry' : 'Send to Xero'}</Btn>}
          {inv.xero?.url && <a className="btn sm" href={inv.xero.url} target="_blank" rel="noopener noreferrer">Open in Xero</a>}
        </div>
      </div>
    </Card>
  )
}
