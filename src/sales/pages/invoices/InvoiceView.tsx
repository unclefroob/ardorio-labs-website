import { useEffect, useRef, useState } from 'react'
import type { InvoiceDto } from '../../api/contract'
import { acknowledgeRefund, duplicateInvoice, getInvoice, invoiceError, issueInvoice } from '../../api/invoices'
import { Q } from '../../data/Q'
import { useStore } from '../../data/store'
import { Banner, Btn, Card, Chip, DlLink, Icon, Link } from '../../kit'
import { activityItems, actionsFor, cardChip, cardLinkMissing, fmtDay, METHOD_LABELS, daysBetween, needsRefund, PAID_CANCEL_HINT, voidSummary } from '../../shared/invoices'
import { EXTERNAL_SOURCE_LABEL, invoiceRef } from '../../shared/externalInvoices'
import { formatCents } from '../../shared/money'
import { PageHead } from '../../shared/PageHead'
import { F } from '../../data/F'
import { UI } from '../../ui/store'
import { copyLink, downloadPdf } from './actions'
import { TestBanner, testItems, useTestActions, type TestOps } from './testActions'
import { MoreMenu, type MoreItem } from './MoreMenu'
import { ExternalChip, milestoneLabel, personName, RetainerChip, TermChip, StatusChip, TestChip } from './parts'
import { Activity, Totals } from './rail'
import { PaidLinksCard } from './LinkPickers'

/** The items of the More menu for an invoice, by status. Drafts have none: they keep Delete in the editor and were never issued. */
export function moreItems(inv: InvoiceDto, o: { copy: () => void; duplicate: () => void; cancel: () => void } & TestOps): MoreItem[] {
  const a = actionsFor(inv)
  const items: MoreItem[] = []
  if (a.copyLink) items.push({ key: 'copy', label: 'Copy public link', icon: 'copy', onSelect: o.copy })
  if (a.duplicate && !a.voided) items.push({ key: 'dup', label: 'Duplicate as new draft', icon: 'layers', onSelect: o.duplicate })
  if (a.cancel) items.push({ key: 'cancel', label: 'Cancel invoice…', icon: 'x', danger: true, divider: items.length > 0, onSelect: o.cancel })
  // A paid invoice cannot be cancelled: say so in words beside the item rather than hiding it.
  if (a.cancelBlockedPaid) items.push({ key: 'cancel', label: 'Cancel invoice', icon: 'lock', disabled: true, hint: PAID_CANCEL_HINT, divider: items.length > 0 })
  items.push(...testItems(inv, o, items.length > 0))
  return items
}

/** Sent, paid and cancelled invoices: read-only, with the actions that still apply. */
export function InvoiceView({ invoice: inv, onChange, onEdit }: { invoice: InvoiceDto; onChange: (i: InvoiceDto) => void; onEdit: () => void }) {
  useStore()
  const a = actionsFor(inv)
  const ms = milestoneLabel(inv)
  const company = inv.companyId ? Q.company(inv.companyId) : undefined
  const today = F.today()
  const gstPct = Math.round(inv.gstRate * 10000) / 100
  const card = cardChip(inv)
  const retry = async (): Promise<void> => {
    try {
      onChange(await issueInvoice(inv.id))
      UI.toast('Card link created')
    } catch (e) {
      UI.toast(invoiceError(e, 'issue').message, 'bad')
    }
  }
  const [dupBusy, setDupBusy] = useState(false)
  // A paid invoice is read-only, but its company, deal and milestone can still be set, through the links route only.
  const [linksOpen, setLinksOpen] = useState(false)
  const [refundBusy, setRefundBusy] = useState(false)
  const dupLock = useRef(false)
  const refundLock = useRef(false)
  const banner = useRef<HTMLDivElement>(null)
  const wasVoid = useRef(a.voided)
  const voided = inv.voided
  const linkLive = voided?.linkDeactivated === false || (voided != null && voided.linkDeactivated == null && !!inv.paymentLinkUrl)
  const paid = inv.status === 'paid'
  const ext = inv.source === 'external' ? inv.external : null
  const paidLinks = paid && !ext
  const name = invoiceRef(inv)
  // Just cancelled: the dialog closed and the button that started it is gone, so land on the banner that says what happened.
  useEffect(() => {
    if (a.voided && !wasVoid.current) banner.current?.focus()
    wasVoid.current = a.voided
  }, [a.voided])
  const duplicate = async (): Promise<void> => {
    if (dupLock.current) return
    dupLock.current = true
    setDupBusy(true)
    try {
      const d = await duplicateInvoice(inv.id)
      UI.nav('invoice', { id: d.id })
    } catch (e) {
      UI.toast(invoiceError(e, 'duplicate').message, 'bad')
    } finally {
      dupLock.current = false
      setDupBusy(false)
    }
  }
  const refunded = async (): Promise<void> => {
    if (refundLock.current) return
    refundLock.current = true
    setRefundBusy(true)
    try {
      onChange(await acknowledgeRefund(inv.id))
      UI.toast('Refund recorded')
    } catch (e) {
      UI.toast(invoiceError(e, 'refund').message, 'bad')
    } finally {
      refundLock.current = false
      setRefundBusy(false)
    }
  }
  const refresh = async (): Promise<void> => {
    try {
      onChange(await getInvoice(inv.id))
    } catch (e) {
      UI.toast(invoiceError(e, 'load').message, 'bad')
    }
  }
  const ta = useTestActions(inv, onChange)
  const more = moreItems(inv, {
    markTest: ta.markTest, unmarkTest: ta.unmarkTest, deleteTest: ta.deleteTest, isSuper: ta.isSuper,
    copy: () => void copyLink(inv),
    duplicate: () => void duplicate(),
    cancel: () => UI.open('cancelInvoice', { invoice: inv, onDone: onChange, onRefresh: refresh }),
  })
  const money = (cents: number): string => formatCents(cents)
  const editExternal = (): void => UI.open('recordExternal', { invoice: inv, onDone: onChange })
  const sub = [company?.name ?? inv.clientName, inv.dealId ? Q.deal(inv.dealId)?.name : '', ms].filter(Boolean).join(' · ')

  return (
    <div className="page">
      <PageHead
        title={<span className="row" style={{ gap: 10 }}>{name}<StatusChip inv={inv} /><TestChip inv={inv} /><RetainerChip inv={inv} /><TermChip inv={inv} /><ExternalChip inv={inv} />{inv.payment && <Chip>{METHOD_LABELS[inv.payment.method]}</Chip>}</span>}
        sub={sub}
        crumb={[<Link key="i" to="invoices">Invoices</Link>, name]}
      >
        {/* An external record has no PDF, hosted link, issue, reissue, mark paid or card controls: only Edit, Cancel and Mark as test. */}
        {!ext && <Btn onClick={() => void downloadPdf(inv)}>Download PDF</Btn>}
        {ext && a.edit && <Btn icon="edit" onClick={editExternal}>Edit</Btn>}
        {a.reissue && <Btn onClick={onEdit}>Edit and reissue</Btn>}
        {paidLinks && !linksOpen && <Btn icon="link" onClick={() => setLinksOpen(true)}>Edit links</Btn>}
        {a.markPaid && <Btn kind="pri" onClick={() => UI.open('markPaid', { invoice: inv, onDone: onChange })}>Mark paid</Btn>}
        {a.voided && !ext && <Btn kind="pri" icon="layers" onClick={() => void duplicate()} disabled={dupBusy}>{dupBusy ? 'Duplicating…' : 'Duplicate as new draft'}</Btn>}
        {more.length > 0 && <><span aria-hidden="true" style={{ width: 1, alignSelf: 'stretch', background: 'var(--line2)', margin: '0 4px' }} /><MoreMenu label={`More actions for ${name}`} items={more} /></>}
      </PageHead>

      <TestBanner inv={inv} onUnmark={ta.unmarkTest} busy={ta.busy} />
      {voided && (
        <div ref={banner} tabIndex={-1} style={{ marginBottom: 14, outline: 'none' }}>
          <Banner icon="x">
            <b>{voidSummary(voided, personName(voided.voidedBy))}.</b>{' '}
            {ext
              ? 'This record was cancelled. Its reference can be recorded again.'
              : 'The invoice and its number are kept. It can’t be reopened; duplicate it to start a corrected draft.'}
          </Banner>
        </div>
      )}
      {inv.refundDue && needsRefund(inv) && (
        <div style={{ marginBottom: 14 }}>
          <Banner tone="bad" icon="flag" action={<Btn onClick={() => void refunded()} disabled={refundBusy}>{refundBusy ? 'Saving…' : 'I have refunded this'}</Btn>}>
            <b>Payment received on a cancelled invoice: refund {money(inv.refundDue.amountCents)} in Stripe.</b>
            <div className="sm" style={{ marginTop: 4 }}>The client paid on {fmtDay(inv.refundDue.receivedAt)}{inv.refundDue.reference ? ` (${inv.refundDue.reference})` : ''}, after this invoice was cancelled. The invoice stays cancelled and the payment is not counted as revenue. Refund it in Stripe, then confirm here.</div>
          </Banner>
        </div>
      )}
      {inv.refundDue?.acknowledgedAt && (
        <div className="faint sm" style={{ marginBottom: 14 }}>
          <Icon n="check" s={12} /> Refund of {money(inv.refundDue.amountCents)} confirmed{inv.refundDue.acknowledgedBy ? ` by ${personName(inv.refundDue.acknowledgedBy)}` : ''} on {fmtDay(inv.refundDue.acknowledgedAt)}. The history is kept.
        </div>
      )}
      {paid && !ext && <div style={{ marginBottom: 14 }}><Banner icon="lock">This invoice is paid, so it is read-only. To change something, raise a credit or a new invoice. Its customer, deal and milestone can still be set with Edit links.</Banner></div>}
      {ext && !a.voided && (
        <div style={{ marginBottom: 14 }}>
          <Banner icon="info" tone="info">
            <b>Recorded externally from {EXTERNAL_SOURCE_LABEL[ext.source]}.</b> It counts as Invoiced in its issue month{inv.payment ? ' and Collected in its paid month' : ''}. Its details are read-only here: use Edit to correct them.
          </Banner>
        </div>
      )}
      {cardLinkMissing(inv) && (
        <div style={{ marginBottom: 14 }}>
          <Banner tone="warn" action={<Btn size="sm" onClick={() => void retry()}>Try the card link again</Btn>}>
            <b>{name} was issued, but the card link couldn&apos;t be created.</b> The client can still pay by transfer or PayID. Retrying creates the link and leaves the invoice as it is.
          </Banner>
        </div>
      )}

      <div className="inv-cols">
        <div className="inv-main">
          {paidLinks && linksOpen && <PaidLinksCard invoice={inv} onSaved={onChange} onClose={() => setLinksOpen(false)} />}
          {inv.payment && !a.voided && (
            <Card title="Payment received">
              <div className="rowx"><span className="muted">Method</span><Chip>{METHOD_LABELS[inv.payment.method]}</Chip></div>
              <div className="rowx"><span className="muted">Date paid</span><span>{fmtDay(inv.payment.paidAt)}</span></div>
              <div className="rowx"><span className="muted">Amount received</span><span className="money b">{formatCents(inv.payment.amountCents)}</span></div>
              <div className="rowx"><span className="muted">Reference</span><span className="mono">{inv.payment.reference || '—'}</span></div>
              {ms && <div className="rowx"><span className="muted">Milestone</span><span>{ms} <Chip tone="ok">Paid</Chip></span></div>}
            </Card>
          )}
          {ext && (
            <Card title="Recorded externally" right={<span className="faint sm">Read-only</span>}>
              <div className="rowx"><span className="muted">Source</span><span>{EXTERNAL_SOURCE_LABEL[ext.source]}</span></div>
              <div className="rowx"><span className="muted">External reference</span><span className="mono">{name}</span></div>
              <div className="rowx"><span className="muted">Recorded</span><span>{fmtDay(ext.recordedAt)}{ext.recordedBy ? ` by ${ext.recordedBy}` : ''}</span></div>
              <div className="faint sm" style={{ marginTop: 8 }}>No SalesOS invoice number, PDF, card link or pay page. Xero or the other system holds the invoice itself.</div>
            </Card>
          )}
          <Card title="Invoice" right={a.voided || ext ? <span className="faint sm">Read-only</span> : undefined}>
            <div className="grid g2" style={{ marginBottom: 12 }}>
              <div>
                <div className="faint sm">Customer</div>
                {company ? <Link to="company" id={company.id}>{company.name}</Link> : <span>{inv.clientName}</span>}
                {!inv.companyId && !ext && (a.reissue || paid) && (
                  <div className="faint sm" style={{ marginTop: 2 }}>
                    {paid
                      ? 'Not linked to a CRM company. Choose it with Edit links: the paid invoice itself does not change.'
                      : 'Not linked to a CRM company. Choose it under Edit and reissue: saving only the customer, deal or milestone does not reissue the invoice.'}
                  </div>
                )}
              </div>
              <div><div className="faint sm">Deal</div>{inv.dealId ? <DlLink id={inv.dealId} /> : <span className="faint">No deal</span>}</div>
              <div><div className="faint sm">Issued</div><div>{fmtDay(inv.issueDate)}</div></div>
              <div>
                <div className="faint sm">{a.voided ? 'Was due' : 'Due'}</div>
                <div className={a.voided ? 'strike' : inv.overdue ? 'late' : ''}>{fmtDay(inv.dueDate)} · {inv.paymentTermsDays} days{inv.overdue && ` · ${Math.max(1, daysBetween(inv.dueDate, today))} days overdue`}</div>
              </div>
            </div>
            <div className="tw">
              <table className="tbl">
                <thead><tr><th>Description</th><th style={{ textAlign: 'right' }}>Qty</th><th style={{ textAlign: 'right' }}>Unit price</th><th style={{ textAlign: 'right' }}>Amount</th></tr></thead>
                <tbody>
                  {inv.lineItems.map((l, i) => (
                    <tr key={i}>
                      <td className="w"><div className="b">{l.description}</div>{l.detail && <div className="faint sm">{l.detail}</div>}</td>
                      <td className="money rt">{l.qty}</td>
                      <td className="money rt">{formatCents(l.unitPriceCents).replace('$', '')}</td>
                      <td className={'money rt b' + (a.voided ? ' strike' : '')}>{formatCents(l.amountCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {inv.notes && <div className="muted sm" style={{ marginTop: 10, whiteSpace: 'pre-wrap' }}>{inv.notes}</div>}
          </Card>
          {a.voided && !ext && (
            <Card title="Sharing and payment">
              <div className="col" style={{ gap: 14 }}>
                <div className="rowx">
                  <span className="muted">Card payment</span>
                  <Chip tone={linkLive ? 'warn' : ''} icon={linkLive ? 'alert' : voided?.linkDeactivated ? 'check' : undefined}>
                    {voided?.linkDeactivated === true ? 'Link switched off' : voided?.linkDeactivated === false ? 'Link still active: switch it off in Stripe' : linkLive ? 'Link still active: switch it off in your payment provider' : 'No card link'}
                  </Chip>
                </div>
                {linkLive && inv.paymentLinkUrl && <div className="rowx"><span className="muted">Card link</span><span className="mono sm" style={{ wordBreak: 'break-all' }}>{inv.paymentLinkUrl}</span></div>}
                <div className="rowx"><span className="muted">Client’s invoice page</span><span>Shows “This invoice has been cancelled”</span></div>
              </div>
            </Card>
          )}
          {a.copyLink && (
            <Card title="Sharing and payment">
              <div className="col" style={{ gap: 14 }}>
                <div>
                  <label className="faint sm" htmlFor="inv-link" style={{ display: 'block', marginBottom: 5 }}>Public invoice link</label>
                  <div className="linkbox"><input id="inv-link" className="inp mono" value={inv.hostedUrl} readOnly /><Btn icon="copy" onClick={() => void copyLink(inv)}>Copy link</Btn></div>
                  <div className="faint sm" style={{ marginTop: 4 }}>Anyone with this link can view and pay the invoice. Nothing is emailed from here.</div>
                </div>
                <div className="rowx"><span className="muted">Card payment</span><span><Chip tone={card.tone}>{card.label}</Chip>{inv.paymentLinkUrl && <span className="faint sm"> {inv.paymentLinkIsAutomatic ? 'single-use · card only' : 'pasted link'}</span>}</span></div>
                <div className="rowx"><span className="muted">Bank transfer and PayID</span><span className="faint">Shown on the invoice from Settings</span></div>
              </div>
            </Card>
          )}
        </div>
        <div className="inv-rail">
          <Totals subtotal={inv.subtotalCents} gst={inv.gstCents} total={inv.totalCents} gstPct={gstPct} struck={a.voided} note={a.voided ? 'Removed from Outstanding and Invoiced.' : a.readOnly ? undefined : 'Revenue reports use the ex-GST figure.'} />
          <Activity items={activityItems(inv, personName)} />
          {paid && !ext && <div className="faint sm"><Icon n="info" s={12} /> The public invoice page shows a Paid stamp. Any unused card link was switched off when the invoice was marked paid.</div>}
        </div>
      </div>
    </div>
  )
}
