import type { InvoiceDto } from '../../api/contract'
import { invoiceError, issueInvoice } from '../../api/invoices'
import { Q } from '../../data/Q'
import { useStore } from '../../data/store'
import { Banner, Btn, Card, Chip, DlLink, Icon, Link } from '../../kit'
import { activityItems, actionsFor, cardChip, cardLinkMissing, fmtDay, METHOD_LABELS, daysBetween } from '../../shared/invoices'
import { formatCents } from '../../shared/money'
import { PageHead } from '../../shared/PageHead'
import { F } from '../../data/F'
import { UI } from '../../ui/store'
import { copyLink, downloadPdf } from './actions'
import { milestoneLabel, StatusChip } from './parts'
import { Activity, Totals } from './rail'

/** Sent and paid invoices: read-only, with the actions that still apply. */
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
  const sub = [company?.name ?? inv.clientName, inv.dealId ? Q.deal(inv.dealId)?.name : '', ms].filter(Boolean).join(' · ')

  return (
    <div className="page">
      <PageHead
        title={<span className="row" style={{ gap: 10 }}>{inv.invoiceNumber}<StatusChip inv={inv} />{inv.payment && <Chip>{METHOD_LABELS[inv.payment.method]}</Chip>}</span>}
        sub={sub}
        crumb={[<Link key="i" to="invoices">Invoices</Link>, inv.invoiceNumber]}
      >
        <Btn onClick={() => void downloadPdf(inv)}>Download PDF</Btn>
        {a.reissue && <Btn onClick={onEdit}>Edit and reissue</Btn>}
        {a.markPaid && <Btn kind="pri" onClick={() => UI.open('markPaid', { invoice: inv, onDone: onChange })}>Mark paid</Btn>}
      </PageHead>

      {a.readOnly && <div style={{ marginBottom: 14 }}><Banner icon="lock">This invoice is paid, so it is read-only. To change something, raise a credit or a new invoice.</Banner></div>}
      {cardLinkMissing(inv) && (
        <div style={{ marginBottom: 14 }}>
          <Banner tone="warn" action={<Btn size="sm" onClick={() => void retry()}>Try the card link again</Btn>}>
            <b>{inv.invoiceNumber} was issued, but the card link couldn&apos;t be created.</b> The client can still pay by transfer or PayID. Retrying creates the link and leaves the invoice as it is.
          </Banner>
        </div>
      )}

      <div className="inv-cols">
        <div className="inv-main">
          {inv.payment && (
            <Card title="Payment received">
              <div className="rowx"><span className="muted">Method</span><Chip>{METHOD_LABELS[inv.payment.method]}</Chip></div>
              <div className="rowx"><span className="muted">Date paid</span><span>{fmtDay(inv.payment.paidAt)}</span></div>
              <div className="rowx"><span className="muted">Amount received</span><span className="money b">{formatCents(inv.payment.amountCents)}</span></div>
              <div className="rowx"><span className="muted">Reference</span><span className="mono">{inv.payment.reference || '—'}</span></div>
              {ms && <div className="rowx"><span className="muted">Milestone</span><span>{ms} <Chip tone="ok">Paid</Chip></span></div>}
            </Card>
          )}
          <Card title="Invoice">
            <div className="grid g2" style={{ marginBottom: 12 }}>
              <div><div className="faint sm">Customer</div>{company ? <Link to="company" id={company.id}>{company.name}</Link> : <span>{inv.clientName}</span>}</div>
              <div><div className="faint sm">Deal</div>{inv.dealId ? <DlLink id={inv.dealId} /> : <span className="faint">No deal</span>}</div>
              <div><div className="faint sm">Issued</div><div>{fmtDay(inv.issueDate)}</div></div>
              <div>
                <div className="faint sm">Due</div>
                <div className={inv.overdue ? 'late' : ''}>{fmtDay(inv.dueDate)} · {inv.paymentTermsDays} days{inv.overdue && ` · ${Math.max(1, daysBetween(inv.dueDate, today))} days overdue`}</div>
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
                      <td className="money rt b">{formatCents(l.amountCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {inv.notes && <div className="muted sm" style={{ marginTop: 10, whiteSpace: 'pre-wrap' }}>{inv.notes}</div>}
          </Card>
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
          <Totals subtotal={inv.subtotalCents} gst={inv.gstCents} total={inv.totalCents} gstPct={gstPct} note={a.readOnly ? undefined : 'Revenue reports use the ex-GST figure.'} />
          <Activity items={activityItems(inv)} />
          {a.readOnly && <div className="faint sm"><Icon n="info" s={12} /> The public invoice page shows a Paid stamp. Any unused card link was switched off when the invoice was marked paid.</div>}
        </div>
      </div>
    </div>
  )
}
