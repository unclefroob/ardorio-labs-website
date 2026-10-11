import { useState } from 'react'
import type { BillingMilestone, BillingRetainer, InvoiceDto } from '../../api/contract'
import { invoiceError, listInvoices } from '../../api/invoices'
import { Act } from '../../data/Act'
import { F } from '../../data/F'
import { useLoad } from '../../data/invoicing'
import { uid } from '../../data/ids'
import { Q } from '../../data/Q'
import { useStore } from '../../data/store'
import type { Deal } from '../../data/types'
import { Banner, Btn, Card, Chip, Fld, Inp, Skel } from '../../kit'
import { billingProgress, quotedCents, scheduleRows, STATUS_TONE, unbilledRows, type ScheduleRow } from '../../shared/billing'
import { fmtDay, statusChip } from '../../shared/invoices'
import { centsToInput, formatCents, parseCents } from '../../shared/money'
import { UI } from '../../ui/store'
import { createDraftsForUnbilled } from './billingActions'

/** Billing schedule of an Ardorio deal. Rendered only for admins of Ardorio; the server enforces the same. */
export function BillingCard({ deal }: { deal: Deal }) {
  useStore()
  // Gate before the inner card mounts, so a non-admin never triggers the invoice request.
  return deal.businessId === 'ard' && Q.canBill() ? <Schedule deal={deal} /> : null
}

function Schedule({ deal }: { deal: Deal }) {
  useStore()
  const inv = useLoad(s => listInvoices({ dealId: deal.id }, s).then(r => r.invoices), `deal:${deal.id}`)
  const [form, setForm] = useState<{ id: string | null; label: string; amount: string; date: string } | null>(null)
  const [retainerForm, setRetainerForm] = useState<{ amount: string; date: string } | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const plan = Q.billingPlan(deal.id)
  const list: InvoiceDto[] = inv.data ?? []
  const rows = scheduleRows(plan, list)
  const unbilled = unbilledRows(rows)
  const quoted = quotedCents(deal)
  const prog = billingProgress(quoted, list)
  const e = inv.error ? invoiceError(inv.error, 'load') : null
  const retainerInvoices = list.filter(i => !i.milestoneId).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
  const today = F.today()

  const open = (id: string): void => UI.nav('invoice', { id })
  const create = (q: { milestoneId?: string; retainer?: boolean }): void => UI.nav('invoice', { id: 'new', q: { companyId: deal.companyId, dealId: deal.id, ...q } })

  const startAdd = (): void => { setErr(''); setForm({ id: null, label: '', amount: '', date: '' }) }
  const startEdit = (m: BillingMilestone): void => { setErr(''); setForm({ id: m.id, label: m.label, amount: centsToInput(m.amountCents), date: m.plannedDate ?? '' }) }
  const saveForm = (): void => {
    if (!form) return
    const cents = parseCents(form.amount)
    if (cents === null) return setErr('Amount is dollars and cents, like 18000.00')
    const m: BillingMilestone = { id: form.id ?? uid('ms'), label: form.label, amountCents: cents, ...(form.date ? { plannedDate: form.date } : {}) }
    const cur = plan?.milestones ?? []
    const next = form.id ? cur.map(x => (x.id === form.id ? m : x)) : [...cur, m]
    const r = Act.saveMilestones(deal.id, next)
    if (!r.ok) return setErr(r.error)
    setForm(null)
    setErr('')
  }
  const remove = (id: string): void => {
    const r = Act.saveMilestones(deal.id, (plan?.milestones ?? []).filter(x => x.id !== id))
    if (!r.ok) setErr(r.error)
  }
  const saveRetainer = (): void => {
    if (!retainerForm) return
    const cents = parseCents(retainerForm.amount)
    if (cents === null) return setErr('Monthly amount is dollars and cents, like 4500.00')
    const r: BillingRetainer = { amountCents: cents, interval: 'monthly', ...(retainerForm.date ? { nextInvoiceDate: retainerForm.date } : {}) }
    const res = Act.saveRetainer(deal.id, r)
    if (!res.ok) return setErr(res.error)
    setRetainerForm(null)
    setErr('')
  }
  const all = async (): Promise<void> => {
    setBusy(true)
    setErr('')
    const r = await createDraftsForUnbilled(deal.companyId, deal.id, unbilled, today).catch((x: unknown) => ({ ok: false as const, error: invoiceError(x, 'save').message, invoices: [] as InvoiceDto[] }))
    setBusy(false)
    inv.reload()
    if (r.ok) UI.toast(`${r.invoices.length} draft invoice${r.invoices.length === 1 ? '' : 's'} created. Review and issue each one.`)
    else setErr(r.invoices.length ? `${r.error} (${r.invoices.length} draft${r.invoices.length === 1 ? ' was' : 's were'} created first.)` : r.error)
  }

  const retainer = plan?.retainer
  const statusLine = (r: ScheduleRow): string => (r.invoice ? (r.invoice.status === 'draft' ? 'Not issued' : r.invoice.status === 'paid' ? `Paid ${fmtDay(r.invoice.payment?.paidAt)}` : `Due ${fmtDay(r.invoice.dueDate)}`) : '')

  return (
    <Card
      title="Billing schedule"
      right={
        <span className="row" style={{ gap: 6 }}>
          {!retainer && <Btn size="sm" onClick={() => { setErr(''); setRetainerForm({ amount: '', date: '' }) }}>Add retainer</Btn>}
          <Btn size="sm" onClick={startAdd}>+ Add milestone</Btn>
          <Btn size="sm" kind="pri" disabled={!unbilled.length || busy} onClick={() => void all()}>{busy ? 'Creating…' : 'Create invoice for all unbilled'}</Btn>
        </span>
      }
    >
      <div className="col" style={{ gap: 14 }}>
        {e && e.kind !== 'denied' && <Banner tone="bad" action={<Btn size="sm" onClick={inv.reload}>Try again</Btn>}>{e.message}</Banner>}
        {err && <Banner tone="bad">{err}</Banner>}
        {inv.loading && !inv.data ? <Skel rows={3} /> : (
          <div>
            <div className="row" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
              <span className="b">Billed {formatCents(prog.billed)} of {formatCents(prog.quoted)} quoted</span>
              <span className="faint sm">ex GST · {prog.billedPct}%</span>
            </div>
            <div className="prog" role="img" aria-label={`Paid ${formatCents(prog.paid)}, invoiced ${formatCents(prog.invoiced)}, not yet billed ${formatCents(prog.unbilled)} of ${formatCents(prog.quoted)}`} style={{ display: 'flex' }}>
              <i style={{ width: prog.paidPct + '%', background: 'var(--ok)', borderRadius: 0 }} />
              <i style={{ width: prog.invoicedPct + '%', background: 'var(--info)', borderRadius: 0 }} />
            </div>
            <div className="row wrap sm" style={{ gap: 16, marginTop: 8 }}>
              <span><Chip tone="ok">Paid</Chip> {formatCents(prog.paid)}</span>
              <span><Chip tone="info">Invoiced</Chip> {formatCents(prog.invoiced)}</span>
              <span><Chip>Not yet billed</Chip> {formatCents(prog.unbilled)}</span>
            </div>
          </div>
        )}

        {form && (
          <div className="grid g3" style={{ alignItems: 'end' }}>
            <Fld label="Milestone"><Inp aria-label="Milestone label" value={form.label} onChange={v => setForm({ ...form, label: v })} /></Fld>
            <Fld label="Amount (ex GST)"><Inp aria-label="Milestone amount" className="mono" value={form.amount} onChange={v => setForm({ ...form, amount: v })} /></Fld>
            <Fld label="Planned date"><Inp aria-label="Milestone planned date" type="date" value={form.date} onChange={v => setForm({ ...form, date: v })} /></Fld>
            <span className="row" style={{ gap: 6 }}><Btn size="sm" kind="pri" onClick={saveForm}>{form.id ? 'Save milestone' : 'Add milestone'}</Btn><Btn size="sm" onClick={() => { setForm(null); setErr('') }}>Cancel</Btn></span>
          </div>
        )}

        {rows.length > 0 ? (
          <div style={{ overflowX: 'auto' }}>
            <table className="tbl" style={{ minWidth: 760 }}>
              <thead><tr><th>Milestone</th><th style={{ textAlign: 'right' }}>Amount (ex GST)</th><th>Planned</th><th>Status</th><th>Invoice</th><th /></tr></thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.milestone.id}>
                    <td className="b">{i + 1} · {r.milestone.label}</td>
                    <td className="money" style={{ textAlign: 'right' }}>{formatCents(r.milestone.amountCents)}</td>
                    <td>{fmtDay(r.milestone.plannedDate)}</td>
                    <td><Chip tone={STATUS_TONE[r.status]}>{r.status}</Chip></td>
                    <td>
                      {r.invoice ? <><a className="mono" href={`/sales/invoices/${r.invoice.id}`} onClick={ev => { ev.preventDefault(); open(r.invoice?.id ?? '') }}>{r.invoice.invoiceNumber}</a><div className="faint sm">{statusLine(r)}</div></> : <span className="faint">Not invoiced</span>}
                    </td>
                    <td>
                      <span className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
                        {r.status === 'Planned' && <Btn size="xs" onClick={() => create({ milestoneId: r.milestone.id })}>Create invoice</Btn>}
                        {r.status === 'Draft invoice' && r.invoice && <Btn size="xs" onClick={() => open(r.invoice?.id ?? '')}>Open draft</Btn>}
                        {r.status === 'Invoiced' && r.invoice && <Btn size="xs" onClick={() => UI.open('markPaid', { invoice: r.invoice, onDone: inv.reload })}>Mark paid</Btn>}
                        {r.status === 'Planned' && <Btn size="xs" kind="ghost" onClick={() => startEdit(r.milestone)}>Edit</Btn>}
                        {r.status === 'Planned' && <Btn size="xs" kind="ghost" aria-label={`Remove ${r.milestone.label}`} onClick={() => remove(r.milestone.id)}>Remove</Btn>}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : !retainer && !form && <div className="faint sm">No milestones yet. Add the agreed payments for this deal, or set up a monthly retainer.</div>}

        {retainerForm && (
          <div className="grid g3" style={{ alignItems: 'end' }}>
            <Fld label="Monthly amount (ex GST)"><Inp aria-label="Retainer amount" className="mono" value={retainerForm.amount} onChange={v => setRetainerForm({ ...retainerForm, amount: v })} /></Fld>
            <Fld label="Next invoice date"><Inp aria-label="Retainer next invoice date" type="date" value={retainerForm.date} onChange={v => setRetainerForm({ ...retainerForm, date: v })} /></Fld>
            <span className="row" style={{ gap: 6 }}><Btn size="sm" kind="pri" onClick={saveRetainer}>Save retainer</Btn><Btn size="sm" onClick={() => { setRetainerForm(null); setErr('') }}>Cancel</Btn></span>
          </div>
        )}

        {retainer && (
          <div className="col" style={{ gap: 10 }}>
            <div className="row wrap" style={{ gap: 6 }}><b>Retainer</b><Chip>Monthly</Chip></div>
            <div className="grid g3">
              <div><div className="faint sm">Monthly amount (ex GST)</div><div className="b money" style={{ fontSize: 18 }}>{formatCents(retainer.amountCents)}</div></div>
              <div><div className="faint sm">Next invoice date</div><div className="b" style={{ fontSize: 18 }}>{fmtDay(retainer.nextInvoiceDate)}</div></div>
            </div>
            {retainerInvoices.map(i => (
              <div key={i.id} className="rowx"><span><a className="mono" href={`/sales/invoices/${i.id}`} onClick={ev => { ev.preventDefault(); open(i.id) }}>{i.invoiceNumber}</a> <span className="faint sm">{fmtDay(i.issueDate)}</span></span>{(() => { const c = statusChip(i); return <Chip tone={c.tone}>{c.label}</Chip> })()}</div>
            ))}
            <div className="row" style={{ gap: 6 }}>
              <Btn size="sm" onClick={() => create({ retainer: true })}>Create invoice</Btn>
              <Btn size="sm" kind="ghost" onClick={() => setRetainerForm({ amount: centsToInput(retainer.amountCents), date: retainer.nextInvoiceDate ?? '' })}>Edit retainer</Btn>
              <Btn size="sm" kind="ghost" onClick={() => { const r = Act.saveRetainer(deal.id, null); if (!r.ok) setErr(r.error) }}>Remove retainer</Btn>
            </div>
          </div>
        )}
        <div className="faint sm">Milestones are agreed amounts, not forecasts. Creating an invoice makes a draft with the milestone as its line; you still review and issue it.</div>
      </div>
    </Card>
  )
}
