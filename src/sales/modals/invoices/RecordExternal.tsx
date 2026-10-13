import { useEffect, useRef, useState } from 'react'
import type { ExternalInvoiceSource, InvoiceDto, InvoicePaymentMethod } from '../../api/contract'
import { duplicateReference, errorField, getInvoice, invoiceError, recordExternalInvoice, updateExternalInvoice } from '../../api/invoices'
import { F } from '../../data/F'
import { Q } from '../../data/Q'
import { S, useStore } from '../../data/store'
import { Banner, Btn, Chip, Ck, Fld, Icon, Inp, Modal, Seg, Sel, Spinner, TA } from '../../kit'
import {
  aud, blankExternal, buildExternal, checkExternal, EXTERNAL_CHIP, EXTERNAL_DENIED_BODY, EXTERNAL_DENIED_TITLE, EXTERNAL_NOTES_MAX, EXTERNAL_SOURCE_LABEL, EXTERNAL_SOURCES,
  externalLabel, formFromExternal, invoiceRef, patchExternal, previewLine, recordedLine, type ExternalErrors, type ExternalField, type ExternalForm,
} from '../../shared/externalInvoices'
import { fmtDay, METHOD_LABELS, METHOD_ORDER } from '../../shared/invoices'
import { formatCents, parseCents } from '../../shared/money'
import { UI } from '../../ui/store'

export interface RecordExternalProps {
  /** The deal it is recorded on. Without one (from the Invoices list) the dialog asks for the deal. */
  dealId?: string
  /** Edit this external invoice (PUT) instead of recording a new one. */
  invoice?: InvoiceDto
  onDone?: (inv: InvoiceDto) => void
}

/** The API's field names, as the form names them. */
const FIELD: Record<string, ExternalField> = {
  dealId: 'dealId', companyId: 'dealId', externalReference: 'reference', issueDate: 'issueDate', subtotalCents: 'amount', gstCents: 'gst',
  paidOn: 'paidOn', paidAmountCents: 'paidAmount', notes: 'notes',
}

const dealLabel = (id: string): string => {
  const d = Q.deal(id)
  if (!d) return ''
  const co = Q.company(d.companyId)?.name
  return co && !(d.title || d.name).startsWith(co) ? `${co}, ${d.title || d.name}` : d.title || d.name
}

/** Ardorio deals a record can go on: live, not archived; won ones first. */
const pickableDeals = (): Array<readonly [string, string]> =>
  S.deals
    .filter(d => d.businessId === 'ard' && !d.archived && !!Q.company(d.companyId))
    .sort((a, b) => Number(b.status === 'won') - Number(a.status === 'won') || dealLabel(a.id).localeCompare(dealLabel(b.id)))
    .map(d => [d.id, `${dealLabel(d.id)}${d.status === 'won' ? '' : d.status === 'lost' ? ' (lost)' : ' (open)'}`] as const)

/** Board 12 E: shown instead of the form to anyone who is not an Ardorio admin, and when the server says the same. */
function Denied() {
  return (
    <Modal role="alertdialog" title={EXTERNAL_DENIED_TITLE} icon="lock" width={520} describedBy="ext-denied" closeLabel="Close this dialog" footer={<Btn kind="pri" data-autofocus onClick={UI.close}>OK</Btn>}>
      <p id="ext-denied" className="sm" style={{ margin: 0, lineHeight: 1.55 }}>{EXTERNAL_DENIED_BODY}</p>
    </Modal>
  )
}

/**
 * Board 9: Record external invoice or payment. For money invoiced or received outside SalesOS (Xero, another system,
 * or a bank transfer with no invoice). It takes no SalesOS number and has no PDF, card link or pay page. The checks
 * mirror the API, next to their fields; a reference already recorded says where, with a way to open it.
 */
export function RecordExternal(props: RecordExternalProps) {
  useStore()
  if (!Q.canBill()) return <Denied />
  return <RecordExternalForm {...props} />
}

function RecordExternalForm({ dealId, invoice, onDone }: RecordExternalProps) {
  const today = F.today()
  const editing = !!invoice
  const [f, setF] = useState<ExternalForm>(() => (invoice ? formFromExternal(invoice, today) : blankExternal(today, { dealId })))
  const [serverErr, setServerErr] = useState<ExternalErrors>({})
  const [touched, setTouched] = useState<ReadonlySet<ExternalField>>(new Set())
  const [tries, setTries] = useState(0)
  const [busy, setBusy] = useState(false)
  const [fail, setFail] = useState('')
  const [denied, setDenied] = useState(false)
  const [dup, setDup] = useState<{ invoiceId: string; dealId: string | null; label: string; who: string } | null>(null)
  const inFlight = useRef(false)
  const body = useRef<HTMLDivElement>(null)

  const checked = checkExternal(f, today)
  const shown = (k: ExternalField): string | undefined => {
    const e = serverErr[k] ?? checked.errors[k]
    if (!e) return undefined
    // Dates are said at once: a future date or a payment before the issue date is never a typing slip in progress.
    const now = (k === 'issueDate' && !!f.issueDate) || (k === 'paidOn' && !!f.paidOn)
    return tries > 0 || touched.has(k) || now || !!serverErr[k] ? e : undefined
  }
  const set = (patch: Partial<ExternalForm>): void => {
    setF(prev => patchExternal(prev, patch))
    setServerErr({})
    if (patch.reference !== undefined || patch.source !== undefined) setDup(null)
  }
  const touch = (k: ExternalField) => () => setTouched(t => (t.has(k) ? t : new Set(t).add(k)))

  useEffect(() => {
    if (tries) body.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
  }, [tries])
  // A duplicate replaces Record with a way out: land on Open it, the next useful control.
  const dupKey = dup ? `${dup.invoiceId}|${dup.dealId}` : ''
  useEffect(() => {
    if (dupKey) body.current?.querySelector<HTMLElement>('[data-duplicate] button')?.focus()
  }, [dupKey])

  const deal = f.dealId ? Q.deal(f.dealId) : undefined
  const plan = Q.billingPlan(f.dealId)
  const milestones = plan?.milestones ?? []
  const ms = milestones.find(x => x.id === f.milestoneId)
  const sub = parseCents(f.amount)
  const gst = parseCents(f.gst)
  const total = sub !== null && gst !== null ? sub + gst : null
  const preview = previewLine(f, today)
  const label = f.reference.trim() ? externalLabel({ source: f.source, reference: f.reference }) : ''

  const submit = async (): Promise<void> => {
    if (inFlight.current) return
    setFail('')
    if (!checked.ok) {
      setTries(t => t + 1)
      return
    }
    if (!deal) return setServerErr({ dealId: 'That deal is no longer available. Choose another.' })
    inFlight.current = true
    setBusy(true)
    try {
      const input = buildExternal(f, deal.companyId, checked)
      const saved = invoice ? await updateExternalInvoice(invoice.id, input) : await recordExternalInvoice(input)
      UI.close()
      UI.toast(editing ? `${invoiceRef(saved)} saved` : recordedLine(saved))
      onDone?.(saved)
    } catch (e) {
      const where = duplicateReference(e)
      const r = invoiceError(e, 'external')
      if (where) {
        setDup({ ...where, label: label || f.reference.trim(), who: '' })
        // Who recorded it and when, if the other record can be read; the warning stands without it.
        if (where.invoiceId) {
          getInvoice(where.invoiceId).then(
            other => setDup(d => (d && d.invoiceId === where.invoiceId && other.external ? { ...d, who: `${fmtDay(other.external.recordedAt)}, ${other.external.recordedBy}` } : d)),
            () => undefined,
          )
        }
      } else if (r.kind === 'denied') {
        setDenied(true)
      } else {
        const field = errorField(e)
        const k = field ? FIELD[field] : undefined
        if (k) setServerErr({ [k]: r.message })
        else setFail(r.message)
      }
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  if (denied) return <Denied />

  const openIt = (): void => {
    if (!dup) return
    UI.close()
    if (dup.invoiceId) UI.nav('invoice', { id: dup.invoiceId })
    else if (dup.dealId) UI.nav('deal', { id: dup.dealId, q: { tab: 'billing' } })
  }
  const dupWhere = dup?.dealId ? dealLabel(dup.dealId) || 'another deal' : 'another invoice'
  const invalid = (k: ExternalField): true | undefined => (shown(k) ? true : undefined)

  return (
    <Modal
      title={invoice ? `Edit ${invoiceRef(invoice)}` : 'Record external invoice or payment'}
      icon="dollar"
      width={720}
      footer={
        <>
          {dup && <Btn onClick={() => body.current?.querySelector<HTMLElement>('#ext-ref')?.focus()}>Change reference</Btn>}
          {!dup && <Btn onClick={UI.close} disabled={busy}>Cancel</Btn>}
          <Btn kind="pri" onClick={() => void submit()} disabled={busy || !!dup}>{busy ? <><Spinner />Saving…</> : editing ? 'Save changes' : 'Record'}</Btn>
        </>
      }
    >
      <div ref={body} className="col" style={{ gap: 14 }} aria-busy={busy}>
        <div className="sm muted">
          {deal && dealId ? <>On {dealLabel(deal.id)}. </> : null}For money invoiced or received outside SalesOS. Admins only; every record is audited.
        </div>
        {fail && <Banner tone="bad">{fail}</Banner>}

        {!dealId && (
          <Fld label="Deal" req err={shown('dealId')} hint="The deal this money belongs to. It counts on that deal, its company and the Customers tab.">
            <Sel
              id="ext-deal"
              value={f.dealId}
              onChange={v => set({ dealId: v, milestoneId: '' })}
              placeholder="Choose a deal…"
              options={pickableDeals()}
              onBlur={touch('dealId')}
              aria-invalid={invalid('dealId')}
            />
          </Fld>
        )}

        <div className="fld">
          <span className="lbl" style={{ fontSize: 12, fontWeight: 600 }}>Source</span>
          <Seg label="Source" value={f.source} onChange={v => set({ source: v as ExternalInvoiceSource })} opts={EXTERNAL_SOURCES.map(s => [s, EXTERNAL_SOURCE_LABEL[s]] as const)} />
        </div>

        <div className="grid g2">
          <Fld label="External reference (required)" err={shown('reference')} hint="The number in the other system. It stops the same invoice being counted twice, including when the Xero sync arrives.">
            <Inp id="ext-ref" className="mono" value={f.reference} onChange={v => set({ reference: v })} onBlur={touch('reference')} placeholder={f.source === 'xero' ? 'INV-0457' : 'Reference'} aria-required="true" aria-invalid={invalid('reference') ?? (dup ? true : undefined)} />
          </Fld>
          <Fld label="Issue date" err={shown('issueDate')} hint="Counts as Invoiced in this month.">
            <Inp id="ext-issued" type="date" max={today} value={f.issueDate} onChange={v => set({ issueDate: v })} onBlur={touch('issueDate')} aria-invalid={invalid('issueDate')} />
          </Fld>
        </div>

        {dup && (
          <div data-duplicate>
            <Banner tone="warn" icon="alert" action={(dup.invoiceId || dup.dealId) ? <Btn size="sm" onClick={openIt}>Open it</Btn> : undefined}>
              <span className="sm">{dup.label} is already recorded on {dupWhere}{dup.who ? ` (${dup.who})` : ''}. Recording it again would count it twice.</span>
            </Banner>
          </div>
        )}

        <div className="grid g3">
          <Fld label="Amount (A$, ex GST)" err={shown('amount')}>
            <Inp id="ext-amt" className="money rt" inputMode="decimal" value={f.amount} onChange={v => set({ amount: v })} onBlur={touch('amount')} placeholder="80000" aria-invalid={invalid('amount')} />
          </Fld>
          <Fld label="GST" err={shown('gst')} hint="10% suggested. Change it for zero-rated work.">
            <Inp id="ext-gst" className="money rt" inputMode="decimal" value={f.gst} onChange={v => set({ gst: v })} onBlur={touch('gst')} aria-invalid={invalid('gst')} />
          </Fld>
          <Fld label="Total inc GST">
            <Inp id="ext-total" className="money rt" value={total === null ? '' : formatCents(total)} readOnly />
          </Fld>
        </div>

        <Fld label="Milestone (optional)" hint={f.dealId && !milestones.length ? 'This deal has no milestones. The record counts on the deal without one.' : undefined}>
          <Sel id="ext-ms" value={f.milestoneId} onChange={v => set({ milestoneId: v })} placeholder="Not linked to a milestone" disabled={!f.dealId}
            options={milestones.map(x => [x.id, `${x.label} (${aud(x.amountCents)})`] as const)} />
        </Fld>

        <div className="card" style={{ boxShadow: 'none' }}>
          <div className="card-h"><Ck checked={f.paid} onChange={v => set({ paid: v })}><span className="b">It has been paid</span></Ck></div>
          {f.paid && (
            <div className="card-b">
              <div className="grid g3">
                <Fld label="Paid date" err={shown('paidOn')} hint="Counts as Collected in this month.">
                  <Inp id="ext-paid" type="date" max={today} value={f.paidOn} onChange={v => set({ paidOn: v })} onBlur={touch('paidOn')} aria-invalid={invalid('paidOn')} />
                </Fld>
                <Fld label="Method">
                  <Sel id="ext-meth" value={f.method} onChange={v => set({ method: v as InvoicePaymentMethod })} options={METHOD_ORDER.map(x => [x, METHOD_LABELS[x]] as const)} />
                </Fld>
                <Fld label="Amount paid (A$, inc GST)" err={shown('paidAmount')}>
                  <Inp id="ext-paidamt" className="money rt" inputMode="decimal" value={f.paidAmount} onChange={v => set({ paidAmount: v })} onBlur={touch('paidAmount')} aria-invalid={invalid('paidAmount')} />
                </Fld>
              </div>
            </div>
          )}
        </div>

        <Fld label="Notes (optional)" err={shown('notes')}>
          <TA id="ext-notes" value={f.notes} onChange={v => set({ notes: v })} onBlur={touch('notes')} rows={2} maxLength={EXTERNAL_NOTES_MAX} aria-invalid={invalid('notes')} />
        </Fld>

        <div className="card" style={{ boxShadow: 'none', background: 'var(--surf2)' }} role="group" aria-label="What recording does">
          <div className="card-b col" style={{ gap: 6 }}>
            <div className="b sm">What {editing ? 'saving' : 'recording'} does</div>
            <div className="sm" aria-live="polite" data-preview>
              {preview ?? 'Enter the amount and the issue date to see where it counts.'}
              {preview && ' Ex GST, on this deal, its company, the Customers tab and the reports.'}
            </div>
            <div className="sm">
              {ms ? <>Marks {ms.label} as {f.paid ? 'Paid' : 'Invoiced'}. </> : null}
              Shown everywhere as <Chip tone="info" icon="ext">{EXTERNAL_CHIP}</Chip>{label ? <> with <span className="mono">{label}</span></> : null}.
            </div>
            <div className="sm muted"><Icon n="info" s={12} /> No SalesOS invoice number, PDF, card link or pay page is created. You can cancel it or mark it as a test later.</div>
          </div>
        </div>
      </div>
    </Modal>
  )
}
