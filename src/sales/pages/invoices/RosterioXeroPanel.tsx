import { useEffect, useState } from 'react'
import type { RosterioInvoice, StripeFeePreview, XeroAccount, XeroContactRef } from '../../api/contract'
import { invoiceError } from '../../api/invoices'
import { sendStripeInvoiceToXero, xeroAccounts, xeroContacts, xeroSaveStripeContact, xeroStripeFees } from '../../api/xero'
import { Banner, Btn, Card, Chip, Inp, Sel } from '../../kit'
import { payoutLine, stripeFeeLine, stripeXero } from '../../shared/xero'
import { UI } from '../../ui/store'

const DEBOUNCE_MS = 300
const aud = (cents: number): string => `A$${(cents / 100).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/** Under the Rosterio invoices: the Xero contact for this customer, the button to send or retry, and the fee and payout once known. */
export function RosterioXeroPanel({ invoice: inv, canAct, onChange, onClose }: { invoice: RosterioInvoice; canAct: boolean; onChange: () => void; onClose?: () => void }) {
  const v = stripeXero(inv.xero)
  const [busy, setBusy] = useState(false)
  const [changing, setChanging] = useState(false)
  const [term, setTerm] = useState('')
  const [found, setFound] = useState<XeroContactRef[] | null>(null)
  const [searchErr, setSearchErr] = useState('')
  const picking = canAct && (!inv.xeroContact || changing)

  // The fee items of a paid invoice: shown for choosing before it is sent, read-only once it is in Xero.
  const voided = !!inv.xero?.voidedInXero
  const redoable = !!inv.xero?.redoable && !voided
  const [redoing, setRedoing] = useState(false)
  const [confirmNew, setConfirmNew] = useState(false)
  const redo = redoing && redoable
  // A voided invoice goes again as a new one, with a fresh fee, so its old fee does not lock the rows.
  const feeInXero = inv.xero?.feeCents != null && !voided
  const wantFees = inv.status === 'paid' && !!inv.xeroContact && canAct
  const [preview, setPreview] = useState<{ id: string; redo: boolean; data: StripeFeePreview | null; error: string } | null>(null)
  const [accounts, setAccounts] = useState<XeroAccount[] | null>(null)
  const [chosen, setChosen] = useState<Record<string, string>>({})
  useEffect(() => {
    if (!wantFees) return
    const ac = new AbortController()
    xeroStripeFees(inv.id, ac.signal, redo || undefined).then(
      data => { if (!ac.signal.aborted) setPreview({ id: inv.id, redo, data, error: '' }) },
      e => { if (!ac.signal.aborted) setPreview({ id: inv.id, redo, data: null, error: invoiceError(e, 'load').message }) },
    )
    return () => ac.abort()
  }, [wantFees, inv.id, redo])
  const editable = wantFees && (!feeInXero || redo)
  useEffect(() => {
    if (!editable) return
    const ac = new AbortController()
    xeroAccounts(ac.signal).then(r => { if (!ac.signal.aborted) setAccounts(r.expense) }, () => undefined)
    return () => ac.abort()
  }, [editable])
  const pv = wantFees && preview?.id === inv.id && preview.redo === redo ? preview : null
  const feeData = pv?.data ?? null
  const locked = !!feeData && (feeData.locked || (feeInXero && !redo))
  const codeOf = (key: string, suggested: string): string => chosen[key] ?? suggested
  const missing = !!feeData && !locked && feeData.lines.some(l => l.amountCents !== 0 && !codeOf(l.key, l.accountCode))
  const feeLoading = editable && !pv

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
  const send = async (mode?: 'redo' | 'new-invoice'): Promise<void> => {
    setBusy(true)
    try {
      const mapping = feeData && !locked ? Object.fromEntries(feeData.lines.map(l => [l.key, codeOf(l.key, l.accountCode)])) : undefined
      const next = await (mode ? sendStripeInvoiceToXero(inv.id, mapping, mode) : mapping ? sendStripeInvoiceToXero(inv.id, mapping) : sendStripeInvoiceToXero(inv.id))
      const st = next.xero?.state
      UI.toast(st === 'error' ? 'Xero rejected the invoice' : mode === 'redo' ? 'Payment and fee redone in Xero' : 'Sent to Xero', st === 'error' ? 'bad' : undefined)
      setRedoing(false); setConfirmNew(false)
      onChange()
    } catch (e) {
      UI.toast(invoiceError(e, 'save').message, 'bad')
    } finally {
      setBusy(false)
    }
  }

  const fee = stripeFeeLine(inv.xero?.feeCents)
  const payout = payoutLine(inv.xero?.payout)
  const options = (code: string): Array<readonly [string, string]> => [
    ...(code && !(accounts ?? []).some(a => a.code === code) ? [[code, code] as const] : []),
    ...(accounts ?? []).map(a => [a.code, `${a.code} · ${a.name}`] as const),
  ]
  const feeRows = feeData && (
    <div className="col" style={{ gap: 6 }} aria-label="Stripe fee lines">
      {feeData.lines.map(l => (
        <div key={l.key} className={'row wrap' + (l.amountCents === 0 ? ' muted' : '')} style={{ gap: 8 }}>
          <span className="sm" style={{ minWidth: 140 }}>{l.label}</span>
          <span className="sm mono" style={{ minWidth: 80 }}>{aud(l.amountCents)}</span>
          {locked
            ? <span className="sm mono">{l.accountCode}</span>
            : <Sel value={codeOf(l.key, l.accountCode)} onChange={v => setChosen(c => ({ ...c, [l.key]: v }))} options={options(codeOf(l.key, l.accountCode))} placeholder={l.accountCode ? null : 'Choose an account…'} aria-label={`Account for ${l.label}`} style={{ maxWidth: 280 }} />}
        </div>
      ))}
      <div className="row wrap muted" style={{ gap: 8 }}>
        <span className="sm" style={{ minWidth: 140 }}>GST on fees</span>
        <span className="sm mono" style={{ minWidth: 80 }}>{aud(feeData.taxCents)}</span>
        <span className="sm">Taken from Stripe</span>
      </div>
      <div className="row wrap b" style={{ gap: 8 }}>
        <span className="sm" style={{ minWidth: 140 }}>Total</span>
        <span className="sm mono">{aud(feeData.totalCents)}</span>
      </div>
    </div>
  )
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
        {voided && canAct && <div className="sm" role="status">Voided in Xero.</div>}
        {locked && feeRows}
        {editable && !locked && (
          <div className="col" style={{ gap: 6 }}>
            <span className="b sm">Stripe fee</span>
            {redo && <div className="sm muted">Removes the payment and fee in Xero, then adds them again. If they are reconciled, Xero refuses: unreconcile them first.</div>}
            {pv?.error && <Banner tone="warn">{pv.error}</Banner>}
            {feeLoading && <div className="sm muted">Loading the fee.</div>}
            {feeRows}
          </div>
        )}
        {canAct && voided && inv.xero?.nextNumber && <div className="sm muted">{`Creates ${inv.xero.nextNumber} in Xero. The voided invoice stays as it is.`}</div>}
        <div className="row wrap" style={{ gap: 8 }}>
          {canAct && v && v.action !== null && inv.xeroContact && !voided && <Btn size="sm" kind={v.action === 'retry' ? 'pri' : undefined} onClick={() => void send()} loading={busy} disabled={missing || feeLoading}>{v.action === 'retry' ? 'Retry' : 'Send to Xero'}</Btn>}
          {canAct && voided && !confirmNew && <Btn size="sm" onClick={() => setConfirmNew(true)} disabled={busy}>Send as a new invoice</Btn>}
          {canAct && voided && confirmNew && <>
            <Btn size="sm" kind="pri" onClick={() => void send('new-invoice')} loading={busy} disabled={missing || feeLoading}>Confirm</Btn>
            <Btn size="sm" kind="ghost" onClick={() => setConfirmNew(false)} disabled={busy}>Cancel</Btn>
          </>}
          {canAct && redoable && !redo && <Btn size="sm" kind="ghost" onClick={() => setRedoing(true)}>Redo payment and fee</Btn>}
          {canAct && redo && <>
            <Btn size="sm" kind="pri" onClick={() => void send('redo')} loading={busy} disabled={missing || feeLoading || !feeData}>Redo in Xero</Btn>
            <Btn size="sm" kind="ghost" onClick={() => setRedoing(false)} disabled={busy}>Cancel</Btn>
          </>}
          {inv.xero?.url && <a className="btn sm" href={inv.xero.url} target="_blank" rel="noopener noreferrer">Open in Xero</a>}
        </div>
      </div>
    </Card>
  )
}
