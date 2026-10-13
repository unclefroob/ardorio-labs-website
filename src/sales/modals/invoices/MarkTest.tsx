import { useEffect, useRef, useState } from 'react'
import type { InvoiceDto } from '../../api/contract'
import { invoiceError, markTest } from '../../api/invoices'
import { Banner, Btn, Fld, Icon, Modal, Spinner, TA } from '../../kit'
import { buildMarkTest, MARK_TEST_PAID_NOTE, markTestConsequences, TEST_REASON_MAX } from '../../shared/invoices'
import { invoiceRef } from '../../shared/externalInvoices'
import { UI } from '../../ui/store'

type Fail = { kind: 'denied' | 'already-test' | 'not-found'; message: string } | { kind: 'other'; message: string }

function classify(e: unknown): Fail {
  const r = invoiceError(e, 'test')
  if (r.kind === 'denied' || r.kind === 'already-test' || r.kind === 'not-found') return { kind: r.kind, message: r.message }
  return { kind: 'other', message: r.message }
}

const Row = ({ icon, children }: { icon: string; children: string }) => <li><Icon n={icon} s={16} /><span>{children}</span></li>

/**
 * Mark an invoice as a test. It is reversible, so this is a plain dialog (not an alertdialog), but it still starts on the safe
 * button, Keep as real invoice. Escape, the X and the backdrop keep it; nothing can be dismissed or resubmitted mid-call.
 * Closing returns focus to the More button that opened it.
 */
export function MarkTest({ invoice, onDone, onRefresh }: { invoice: InvoiceDto; onDone?: (inv: InvoiceDto) => void; onRefresh?: () => Promise<void> | void }) {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [fail, setFail] = useState<Fail | null>(null)
  const inFlight = useRef(false)
  const num = invoiceRef(invoice)
  const built = buildMarkTest(reason)
  const paid = invoice.status === 'paid'

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
    if (inFlight.current || !built.ok) return
    inFlight.current = true
    setBusy(true)
    setFail(null)
    try {
      const done = await markTest(invoice.id, built.input)
      UI.close()
      UI.toast(`${num} marked as test`)
      onDone?.(done)
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

  if (fail && fail.kind !== 'other') {
    const already = fail.kind === 'already-test'
    return (
      <Modal title={already ? `${num} is already a test invoice` : fail.kind === 'denied' ? 'You can’t mark invoices as test' : 'Invoice not found'} width={520} icon={fail.kind === 'denied' ? 'lock' : 'info'} onClose={close} closeLabel="Close this dialog"
        footer={already ? <Btn kind="pri" data-autofocus onClick={() => void refresh()}>Refresh invoice</Btn> : <Btn kind="pri" data-autofocus onClick={close}>Close</Btn>}>
        <div className="col" style={{ gap: 12 }}>
          <p style={{ margin: 0, lineHeight: 1.55 }}>{fail.kind === 'denied' ? `Marking is limited to admins of the Ardorio business. Ask an admin to mark ${num} for you. Nothing has changed.` : fail.message}</p>
          {already && <Banner tone="info">Refresh to see who marked it and why.</Banner>}
        </div>
      </Modal>
    )
  }

  const hint = busy ? 'Saving. Keep this window open.' : built.ok ? 'Ready. You can unmark it later.' : built.hint
  return (
    <Modal
      title={`Mark ${num} as a test invoice?`}
      width={560}
      icon="flag"
      describedBy="mark-test-desc"
      onClose={close}
      closeLabel="Keep as real invoice and close this dialog"
      footer={
        <>
          <span className="sm muted" style={{ marginRight: 'auto' }} role="status" aria-live="polite">{hint}</span>
          <Btn data-autofocus onClick={close} aria-disabled={busy || undefined}>Keep as real invoice</Btn>
          <Btn kind="pri" icon={busy ? undefined : 'flag'} disabled={!built.ok || busy} onClick={() => void submit()}>
            {busy ? <><Spinner />Marking…</> : 'Mark as test'}
          </Btn>
        </>
      }
    >
      <div className="col" style={{ gap: 16 }} aria-busy={busy}>
        {fail?.kind === 'other' && (
          <Banner tone="bad">
            <b>{num} was not marked.</b> {fail.message}
            <div className="sm" style={{ marginTop: 2 }}>Nothing has changed. Try again, or keep it as a real invoice and come back later.</div>
          </Banner>
        )}
        <p id="mark-test-desc" style={{ margin: 0, lineHeight: 1.55 }}>Use this for practice or trial invoices that should never count as real business.</p>
        {paid && <Banner tone="warn">{MARK_TEST_PAID_NOTE}</Banner>}
        <div>
          <div className="sm b" style={{ marginBottom: 8 }}>What will happen</div>
          <ul className="ulx">{markTestConsequences.map(c => <Row key={c.text} icon={c.icon}>{c.text}</Row>)}</ul>
        </div>
        <Fld label="Reason (required)" req>
          <TA value={reason} onChange={setReason} maxLength={TEST_REASON_MAX} rows={2} placeholder="For example: trying out the invoice layout" disabled={busy} />
        </Fld>
        <div className="cnt" aria-live="polite">{reason.length} / {TEST_REASON_MAX}</div>
      </div>
    </Modal>
  )
}
