import { useEffect, useId, useRef, useState } from 'react'
import type { InvoiceDto } from '../../api/contract'
import { deleteTestInvoice, invoiceError, linkFailureId } from '../../api/invoices'
import { Banner, Btn, Icon, Modal, Spinner } from '../../kit'
import { deleteConsequences, deleteNumberMatches } from '../../shared/invoices'
import { UI } from '../../ui/store'

type Fail =
  | { kind: 'denied' | 'not-test' | 'not-found'; message: string }
  | { kind: 'link'; message: string; linkId: string }
  | { kind: 'mismatch' | 'other'; message: string }

function classify(e: unknown): Fail {
  const linkId = linkFailureId(e)
  if (linkId !== null) return { kind: 'link', message: invoiceError(e, 'test').message, linkId }
  const r = invoiceError(e, 'test')
  if (r.kind === 'denied' || r.kind === 'not-test' || r.kind === 'not-found' || r.kind === 'mismatch') return { kind: r.kind, message: r.message }
  return { kind: 'other', message: r.message }
}

const Row = ({ icon, children }: { icon: string; children: string }) => <li><Icon n={icon} s={16} /><span>{children}</span></li>

/**
 * Permanently delete a test invoice (super users only; the server checks that too). An alertdialog that starts on Keep. The
 * danger button stays disabled until the typed text equals the invoice number exactly. Escape, the X and the backdrop keep it.
 * On success: a toast, then the invoice list.
 */
export function DeleteTestInvoice({ invoice, onRefresh }: { invoice: InvoiceDto; onRefresh?: () => Promise<void> | void }) {
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [fail, setFail] = useState<Fail | null>(null)
  const inFlight = useRef(false)
  const fieldId = useId()
  const hintId = useId()
  const num = invoice.invoiceNumber
  const matches = deleteNumberMatches(typed, num)

  const failKind = fail?.kind
  useEffect(() => {
    if (!failKind) return
    document.querySelector<HTMLElement>('.modal [data-autofocus]')?.focus()
  }, [failKind])

  const close = (): void => {
    if (inFlight.current) return
    UI.close()
  }

  const submit = async (): Promise<void> => {
    if (inFlight.current || !matches) return
    inFlight.current = true
    setBusy(true)
    setFail(null)
    try {
      const r = await deleteTestInvoice(invoice.id, { confirmNumber: typed })
      UI.close()
      UI.toast(`${r.invoiceNumber} deleted permanently`)
      UI.nav('invoices')
    } catch (e) {
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

  if (fail?.kind === 'denied') {
    return (
      <Modal role="alertdialog" title="You can’t delete invoices" width={520} icon="lock" onClose={close} closeLabel="Close this dialog" footer={<Btn kind="pri" data-autofocus onClick={close}>Close</Btn>}>
        <p style={{ margin: 0, lineHeight: 1.55 }}>Permanent deletion is limited to super administrators. Ask one to delete {num} for you. Nothing has changed.</p>
      </Modal>
    )
  }
  if (fail?.kind === 'not-test' || fail?.kind === 'not-found') {
    const nf = fail.kind === 'not-found'
    return (
      <Modal role="alertdialog" title={nf ? `${num} no longer exists` : `${num} is not a test invoice`} width={520} icon="info" onClose={close} closeLabel="Close this dialog"
        footer={nf ? <Btn kind="pri" data-autofocus onClick={() => { UI.close(); UI.nav('invoices') }}>Back to invoices</Btn> : <Btn kind="pri" data-autofocus onClick={() => void refresh()}>Refresh invoice</Btn>}>
        <div className="col" style={{ gap: 12 }}>
          <p style={{ margin: 0, lineHeight: 1.55 }}>{fail.message}</p>
          <Banner tone="info">{nf ? 'It may already have been deleted.' : 'Only invoices marked as test can be deleted permanently. Nothing was deleted. Refresh to see the invoice as it is now.'}</Banner>
        </div>
      </Modal>
    )
  }
  if (fail?.kind === 'link') {
    return (
      <Modal role="alertdialog" title="Couldn’t switch off the payment link" width={540} icon="alert" onClose={close} closeLabel="Keep invoice and close this dialog"
        footer={<><Btn onClick={close}>Keep invoice</Btn><Btn kind="pri" data-autofocus onClick={() => void submit()} disabled={busy}>{busy ? 'Trying…' : 'Retry'}</Btn></>}>
        <div className="col" style={{ gap: 12 }}>
          <p style={{ margin: 0, lineHeight: 1.55 }}>{num} has <b>not</b> been deleted, because its payment link could not be switched off. Try again. If it keeps failing, switch the link off in Stripe (Payment Links, Deactivate) first.</p>
          {fail.linkId && <div className="row wrap" style={{ gap: 8 }}><span className="muted sm">Link id</span><span className="chip mono" aria-label="Payment link id">{fail.linkId}</span></div>}
        </div>
      </Modal>
    )
  }

  const mismatchServer = fail?.kind === 'mismatch'
  const showMismatch = typed.length > 0 && !matches
  const hint = busy ? 'Deleting. Keep this window open.' : matches ? 'Ready. This is permanent.' : `Type ${num} to enable deletion.`
  return (
    <Modal
      role="alertdialog"
      title={`Delete ${num} permanently?`}
      width={580}
      icon="trash"
      describedBy="del-test-desc"
      onClose={close}
      closeLabel="Keep invoice and close this dialog"
      footer={
        <>
          <span className="sm muted" style={{ marginRight: 'auto' }} role="status" aria-live="polite">{hint}</span>
          <Btn data-autofocus onClick={close} aria-disabled={busy || undefined}>Keep invoice</Btn>
          <Btn kind="dng" icon={busy ? undefined : 'trash'} disabled={!matches || busy} onClick={() => void submit()}>
            {busy ? <><Spinner />Deleting…</> : 'Delete permanently'}
          </Btn>
        </>
      }
    >
      <div className="col" style={{ gap: 16 }} aria-busy={busy}>
        {fail?.kind === 'other' && (
          <Banner tone="bad">
            <b>{num} was not deleted.</b> {fail.message}
            <div className="sm" style={{ marginTop: 2 }}>Nothing has changed. Try again, or keep the invoice and come back to it. If it keeps failing, check the invoice before trying once more.</div>
          </Banner>
        )}
        {mismatchServer && (
          <Banner tone="bad"><b>{num} was not deleted.</b> {fail.message} Check the number and type it again.</Banner>
        )}
        <p id="del-test-desc" style={{ margin: 0, lineHeight: 1.55 }}>This test invoice will be removed for good. <b>This can’t be undone.</b></p>
        <div>
          <div className="sm b" style={{ marginBottom: 8 }}>What will happen</div>
          <ul className="ulx">{deleteConsequences(invoice).map(c => <Row key={c.text} icon={c.icon}>{c.text}</Row>)}</ul>
        </div>
        <div className="fld">
          <label htmlFor={fieldId}>Type {num} to confirm<span style={{ color: 'var(--bad2)' }}> *</span></label>
          <input
            id={fieldId}
            className="inp mono"
            value={typed}
            onChange={e => { setTyped(e.target.value); if (mismatchServer) setFail(null) }}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            disabled={busy}
            aria-invalid={showMismatch || undefined}
            aria-describedby={hintId}
          />
          <div id={hintId} className={showMismatch ? 'err' : 'hint'} aria-live="polite">
            {showMismatch ? `That does not match. Type ${num} exactly as shown.` : 'Pasting is fine. It must match exactly.'}
          </div>
        </div>
      </div>
    </Modal>
  )
}
