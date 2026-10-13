import { useEffect, useRef, useState } from 'react'
import type { InvoiceDto, InvoiceVoidReason } from '../../api/contract'
import { invoiceError, linkFailureId, voidInvoice } from '../../api/invoices'
import { Banner, Btn, Fld, Icon, Modal, Sel, Spinner, TA } from '../../kit'
import { buildVoid, cancelConsequences, VOID_NOTE_MAX, VOID_REASONS } from '../../shared/invoices'
import { invoiceRef } from '../../shared/externalInvoices'
import { UI } from '../../ui/store'
import { milestoneLabel } from '../../pages/invoices/parts'

type Fail =
  | { kind: 'paid' | 'already-void' | 'not-issued'; message: string }
  | { kind: 'denied'; message: string }
  | { kind: 'link'; message: string; linkId: string }
  | { kind: 'other'; message: string }

function classify(e: unknown): Fail {
  const linkId = linkFailureId(e)
  if (linkId !== null) return { kind: 'link', message: invoiceError(e, 'cancel').message, linkId }
  const r = invoiceError(e, 'cancel')
  if (r.kind === 'paid' || r.kind === 'already-void' || r.kind === 'not-issued' || r.kind === 'denied') return { kind: r.kind, message: r.message }
  return { kind: 'other', message: r.message }
}

const Row = ({ icon, children }: { icon: string; children: string }) => <li><Icon n={icon} s={16} /><span>{children}</span></li>

/**
 * Confirm cancelling (voiding) a sent or overdue invoice. An alertdialog: it starts on Keep invoice, the safe choice, and
 * Escape, the X and the backdrop all keep the invoice. Nothing can be dismissed or resubmitted while the call is in flight.
 * `onDone` gets the cancelled invoice; `onRefresh` re-reads the invoice when the server says it changed underneath us.
 */
export function CancelInvoice({ invoice, onDone, onRefresh }: { invoice: InvoiceDto; onDone?: (inv: InvoiceDto) => void; onRefresh?: () => Promise<void> | void }) {
  const [reason, setReason] = useState<InvoiceVoidReason | ''>('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [fail, setFail] = useState<Fail | null>(null)
  const [ack, setAck] = useState(false)
  const inFlight = useRef(false)
  const body = useRef<HTMLDivElement>(null)
  const ms = milestoneLabel(invoice)
  const built = buildVoid({ reason, note })
  const num = invoiceRef(invoice)

  // The dialog changes content when a call fails: put focus on that state's primary control.
  const failKind = fail?.kind
  useEffect(() => {
    if (!failKind) return
    document.querySelector<HTMLElement>('.modal [data-autofocus]')?.focus()
  }, [failKind])

  const close = (): void => {
    if (inFlight.current) return
    UI.close()
  }

  const submit = async (linkStillLiveAcknowledged: boolean): Promise<void> => {
    if (inFlight.current || !built.ok) return
    inFlight.current = true
    setBusy(true)
    setFail(null)
    try {
      const done = await voidInvoice(invoice.id, { ...built.input, ...(linkStillLiveAcknowledged ? { linkStillLiveAcknowledged: true } : {}) })
      UI.close()
      UI.toast(`${num} cancelled`)
      onDone?.(done)
    } catch (e) {
      setAck(false)
      setFail(classify(e))
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  const refresh = async (): Promise<void> => {
    try {
      await onRefresh?.()
    } finally {
      UI.close()
    }
  }

  const keep = <Btn onClick={close} aria-disabled={busy || undefined} data-autofocus>Keep invoice</Btn>
  const keepPlain = <Btn onClick={close}>Keep invoice</Btn>

  // ── failure states ─────────────────────────────────────────────────────────────────────────────
  if (fail?.kind === 'paid' || fail?.kind === 'already-void' || fail?.kind === 'not-issued') {
    const paid = fail.kind === 'paid'
    return (
      <Modal role="alertdialog" title={paid ? 'Nothing was cancelled' : fail.kind === 'already-void' ? `${num} is already cancelled` : `${num} has not been issued`} width={520} icon="info" onClose={close} closeLabel="Close this dialog"
        footer={<Btn kind="pri" data-autofocus onClick={() => void refresh()}>Refresh invoice</Btn>}>
        <div className="col" style={{ gap: 12 }} ref={body}>
          <p style={{ margin: 0, lineHeight: 1.55 }}>{fail.message}</p>
          <Banner tone="info">
            {paid ? 'Paid invoices cannot be cancelled. Refresh to see the payment. If that payment was a mistake, record a refund or issue a credit instead.' : 'Refresh to see the invoice as it is now.'}
          </Banner>
        </div>
      </Modal>
    )
  }
  if (fail?.kind === 'denied') {
    return (
      <Modal role="alertdialog" title="You can’t cancel invoices" width={520} icon="lock" onClose={close} closeLabel="Close this dialog" footer={<Btn kind="pri" data-autofocus onClick={close}>Close</Btn>}>
        <p style={{ margin: 0, lineHeight: 1.55 }}>Cancelling is limited to admins of the Ardorio business. Ask an admin to cancel {num} for you. Nothing has changed.</p>
      </Modal>
    )
  }
  if (fail?.kind === 'link') {
    return (
      <Modal role="alertdialog" title="Couldn’t switch off the card link" width={540} icon="alert" onClose={close} closeLabel="Keep invoice and close this dialog"
        footer={<>{keepPlain}<Btn kind="pri" data-autofocus onClick={() => void submit(false)} disabled={busy}>{busy && !ack ? 'Trying…' : 'Retry'}</Btn></>}>
        <div className="col" style={{ gap: 14 }}>
          <p style={{ margin: 0, lineHeight: 1.55 }}>{num} has <b>not</b> been cancelled, and its card link is still active, so the client could still pay it. Try again, or cancel it without the link being switched off.</p>
          <div className="col" style={{ gap: 10, borderTop: '1px solid var(--line)', paddingTop: 14 }}>
            <label className="ck" style={{ alignItems: 'flex-start' }}>
              <input type="checkbox" checked={ack} onChange={e => setAck(e.target.checked)} />
              <span><b>Cancel anyway, I will switch the link off in Stripe</b><span className="sm muted" style={{ display: 'block' }}>Stripe Dashboard, Payment Links, Deactivate. If a payment arrives first, it will be flagged for refund.</span></span>
            </label>
            {ack && (
              <>
                <div className="row wrap" style={{ gap: 8 }}>
                  <span className="muted sm">Link id</span>
                  {fail.linkId ? <span className="chip mono" aria-label="Card link id">{fail.linkId}</span> : <span className="sm muted">Not returned. Find this invoice’s link in the Stripe Dashboard under Payment Links.</span>}
                </div>
                <div className="row" style={{ justifyContent: 'flex-end' }}>
                  <Btn kind="dng" icon="x" onClick={() => void submit(true)} disabled={busy}>{busy ? 'Cancelling…' : 'Cancel invoice anyway'}</Btn>
                </div>
              </>
            )}
          </div>
        </div>
      </Modal>
    )
  }

  // ── the confirmation ───────────────────────────────────────────────────────────────────────────
  const hint = busy ? 'Cancelling. Keep this window open.' : built.ok ? 'Ready. Nothing changes until you confirm.' : built.hint
  return (
    <Modal
      role="alertdialog"
      title={`Cancel invoice ${num}?`}
      width={580}
      icon="alert"
      describedBy="cancel-inv-desc"
      onClose={close}
      closeLabel="Keep invoice and close this dialog"
      footer={
        <>
          <span className="sm muted" style={{ marginRight: 'auto' }} role="status" aria-live="polite">{hint}</span>
          {keep}
          <Btn kind="dng" icon={busy ? undefined : 'x'} disabled={!built.ok || busy} onClick={() => void submit(false)}>
            {busy ? <><Spinner />Cancelling…</> : 'Cancel invoice'}
          </Btn>
        </>
      }
    >
      <div className="col" style={{ gap: 16 }} aria-busy={busy} ref={body}>
        {fail?.kind === 'other' && (
          <Banner tone="bad">
            <b>{num} was not cancelled.</b> {fail.message}
            <div className="sm" style={{ marginTop: 2 }}>Nothing has changed. Try again, or keep the invoice and come back to it. If it keeps failing, check the invoice before trying once more.</div>
          </Banner>
        )}
        <p id="cancel-inv-desc" style={{ margin: 0, lineHeight: 1.55 }}>
          {invoice.source === 'external'
            ? <>This takes the record of {num} out of your totals. Nothing changes in the other system, and the record is kept. <b>This can’t be undone.</b></>
            : <>This stops {num} being paid and takes it out of your totals. The invoice and its number are kept for your records. <b>This can’t be undone.</b></>}
        </p>
        <div>
          <div className="sm b" style={{ marginBottom: 8 }}>What will happen</div>
          <ul className="ulx">{cancelConsequences(invoice, ms).map(c => <Row key={c.text} icon={c.icon}>{c.text}</Row>)}</ul>
          <div className="faint sm" style={{ marginTop: 10 }}>Not affected: the invoice record, its number and its history stay.</div>
        </div>
        <Fld label="Reason (required)" req>
          <Sel value={reason} onChange={v => setReason(v as InvoiceVoidReason | '')} placeholder="Choose a reason…" options={VOID_REASONS} disabled={busy} />
        </Fld>
        <Fld label={reason === 'other' ? 'Note (required for Other)' : 'Note (optional)'}>
          <TA value={note} onChange={setNote} maxLength={VOID_NOTE_MAX} rows={2} placeholder="Anything the next person should know" disabled={busy} />
        </Fld>
        <div className="cnt" aria-live="polite">{note.length} / {VOID_NOTE_MAX}</div>
      </div>
    </Modal>
  )
}
