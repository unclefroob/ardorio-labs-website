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
import { Banner, Btn, Card, Chip, Fld, Icon, Inp } from '../../kit'
import {
  isRetainerInvoice, milestoneState, moneyForDeal, redraftProblem, retainerAutoState, retainerPause, retainerDuePeriods, retainerPeriodLabel, retainerSpanLabel, scheduleRows,
  STATE_TONE, unbilledRows, validateDelivered, type RetainerPause, type ScheduleRow,
} from '../../shared/billing'
import { fmtDay, statusChip } from '../../shared/invoices'
import { centsToInput, formatCents, parseCents } from '../../shared/money'
import { UI } from '../../ui/store'
import { RetainerChip } from '../invoices/parts'
import { createDraftsForUnbilled } from './billingActions'
import { ContractLedger } from './ContractLedger'
import { moneyTarget, MoneyWarnings, ProjectMoney } from './DealMoney'

/**
 * The Billing tab of an Ardorio deal: warnings, the project money, the contract ledger beside the milestones, and the
 * support retainer in its own card. Rendered only for admins of Ardorio; the server enforces the same.
 */
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
  const [retErr, setRetErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [delivering, setDelivering] = useState<{ id: string; day: string } | null>(null)

  const plan = Q.billingPlan(deal.id)
  // Statuses come from the invoice list, so until it has loaded no row action is offered.
  const known = !!inv.data
  const list: InvoiceDto[] = inv.data ?? []
  const rows = scheduleRows(plan, list)
  const unbilled = unbilledRows(rows)
  const money = known ? moneyForDeal(deal, plan, list) : null
  const e = inv.error ? invoiceError(inv.error, 'load') : null
  const retainerInvoices = list.filter(i => isRetainerInvoice(i, plan)).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
  // Project invoices with no milestone, as time and materials bills: counted in the money, listed under the milestones.
  const looseInvoices = list.filter(i => !i.milestoneId && !isRetainerInvoice(i, plan)).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
  const scheduled = (plan?.milestones ?? []).reduce((a, x) => a + x.amountCents, 0)
  const target = moneyTarget(deal, moneyForDeal(deal, plan, []))
  const gap = target.cents - scheduled
  const today = F.today()
  const paused = retainerPause(deal)

  const open = (id: string): void => UI.nav('invoice', { id })
  const create = (q: { milestoneId?: string; retainer?: boolean; retainerFor?: string }): void => UI.nav('invoice', { id: 'new', q: { companyId: deal.companyId, dealId: deal.id, ...q } })

  const startAdd = (): void => { setErr(''); setForm({ id: null, label: '', amount: '', date: '' }) }
  const startEdit = (m: BillingMilestone): void => { setErr(''); setForm({ id: m.id, label: m.label, amount: centsToInput(m.amountCents), date: m.plannedDate ?? '' }) }
  const saveForm = (): void => {
    if (!form) return
    const cents = parseCents(form.amount)
    if (cents === null) return setErr('Amount is dollars and cents, like 18000.00')
    const cur = plan?.milestones ?? []
    // An edit keeps the delivered state: only the label, amount and planned date come from the form.
    const prev = form.id ? cur.find(x => x.id === form.id) : undefined
    const m: BillingMilestone = {
      id: form.id ?? uid('ms'), label: form.label, amountCents: cents, ...(form.date ? { plannedDate: form.date } : {}),
      ...(prev?.deliveredOn ? { deliveredOn: prev.deliveredOn } : {}), ...(prev?.deliveredBy ? { deliveredBy: prev.deliveredBy } : {}),
    }
    const next = form.id ? cur.map(x => (x.id === form.id ? m : x)) : [...cur, m]
    const r = Act.saveMilestones(deal.id, next)
    if (!r.ok) return setErr(r.error)
    setForm(null)
    setErr('')
  }
  const saveDelivered = (): void => {
    if (!delivering) return
    const bad = validateDelivered(delivering.day, today)
    if (bad) return setErr(bad)
    const r = Act.markDelivered(deal.id, delivering.id, delivering.day)
    if (!r.ok) return setErr(r.error)
    setErr('')
    setDelivering(null)
  }
  const undoDelivered = (m: BillingMilestone): void => {
    UI.confirm({
      title: `Undo delivered for ${m.label}?`,
      body: `It goes back to not delivered, and ${formatCents(m.amountCents)} leaves Earned. Any invoice for it is left as it is.`,
      confirm: 'Undo delivered',
      onConfirm: () => {
        const r = Act.markDelivered(deal.id, m.id, null)
        if (!r.ok) setErr(r.error)
        else { setErr(''); UI.toast(`${m.label} is no longer marked delivered`) }
      },
    })
  }
  const remove = (id: string): void => {
    const r = Act.saveMilestones(deal.id, (plan?.milestones ?? []).filter(x => x.id !== id))
    if (!r.ok) setErr(r.error)
  }
  const saveRetainer = (): void => {
    if (!retainerForm) return
    const cents = parseCents(retainerForm.amount)
    if (cents === null) return setRetErr('Monthly amount is dollars and cents, like 4500.00')
    const r: BillingRetainer = { amountCents: cents, interval: 'monthly', ...(retainerForm.date ? { nextInvoiceDate: retainerForm.date } : {}) }
    const res = Act.saveRetainer(deal.id, r)
    if (!res.ok) return setRetErr(res.error)
    setRetainerForm(null)
    setRetErr('')
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
  // What saving the retainer form would make the server do: a date in the past drafts one invoice per run until it
  // passes today, and a date on or before the last drafted period drafts that month again.
  const formDate = retainerForm?.date || undefined
  const formRedraft = retainerForm ? redraftProblem(formDate, retainer) : null
  const formCatchUp = retainerForm && !formRedraft ? retainerDuePeriods({ nextInvoiceDate: formDate, lastDraftedFor: retainer?.lastDraftedFor, anchorDay: formDate === retainer?.nextInvoiceDate ? retainer?.anchorDay : undefined }, today) : []
  const statusLine = (r: ScheduleRow): string => (r.invoice ? (r.invoice.status === 'draft' ? 'Not issued' : r.invoice.status === 'paid' ? `Paid ${fmtDay(r.invoice.payment?.paidAt)}` : `Due ${fmtDay(r.invoice.dueDate)}`) : '')

  const who = (x: string | undefined): string => (x ? Q.user(x)?.name ?? x : '')
  const invLink = (i: InvoiceDto) => <a className="mono" href={`/sales/invoices/${i.id}`} onClick={ev => { ev.preventDefault(); open(i.id) }}>{i.invoiceNumber}</a>
  const contracted = !!plan?.contract
  const ofText = `Scheduled ${formatCents(scheduled)} of ${formatCents(target.cents)} ${contracted ? 'contracted' : 'estimate'}`

  const milestones = (
    <Card
      title="Milestones"
      right={
        <span className="row wrap" style={{ gap: 6 }}>
          {!retainer && !retainerForm && <Btn size="sm" onClick={() => { setRetErr(''); setRetainerForm({ amount: '', date: '' }) }}>Add retainer</Btn>}
          <Btn size="sm" onClick={startAdd}>+ Add milestone</Btn>
          <Btn size="sm" kind="pri" disabled={!known || !unbilled.length || busy} onClick={() => void all()}>{busy ? 'Creating…' : 'Create invoice for all unbilled'}</Btn>
        </span>
      }
    >
      <div className="col" style={{ gap: 14 }}>
        {err && <Banner tone="bad">{err}</Banner>}
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
            <table className="tbl" aria-label="Milestones" style={{ minWidth: 760 }}>
              <thead><tr><th>Milestone</th><th style={{ textAlign: 'right' }}>Amount (ex GST)</th><th>Planned</th><th>State</th><th>Invoice</th><th /></tr></thead>
              <tbody>
                {rows.map((r, i) => {
                  const st = milestoneState(r)
                  const ms = r.milestone
                  const picking = delivering?.id === ms.id
                  return (
                    <tr key={ms.id}>
                      <td className="b">{i + 1} · {ms.label}</td>
                      <td className="money" style={{ textAlign: 'right' }}>{formatCents(ms.amountCents)}</td>
                      <td>{fmtDay(ms.plannedDate)}</td>
                      <td>
                        {known || st === 'Delivered' ? <Chip tone={STATE_TONE[st]}>{st}</Chip> : <span className="faint">…</span>}
                        {ms.deliveredOn && <div className="faint sm">Delivered {fmtDay(ms.deliveredOn)}{ms.deliveredBy ? ` · ${who(ms.deliveredBy)}` : ''}</div>}
                      </td>
                      <td>
                        {r.invoice ? <>{invLink(r.invoice)}<div className="faint sm">{statusLine(r)}</div></> : <span className="faint">Not invoiced</span>}
                        {r.cancelled && !r.invoice && <div className="faint sm">{r.cancelled.invoiceNumber} cancelled {fmtDay(r.cancelled.voided?.voidedAt)}</div>}
                      </td>
                      <td>
                        {picking ? (
                          <span className="row wrap" style={{ gap: 6, justifyContent: 'flex-end' }}>
                            <Inp aria-label={`Delivered date for ${ms.label}`} type="date" max={today} value={delivering.day} onChange={v => setDelivering({ id: ms.id, day: v })} style={{ width: 150 }} />
                            <Btn size="xs" kind="pri" onClick={saveDelivered}>Save delivered</Btn>
                            <Btn size="xs" kind="ghost" onClick={() => { setDelivering(null); setErr('') }}>Cancel</Btn>
                          </span>
                        ) : (
                          <span className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
                            {known && r.status === 'Planned' && <Btn size="xs" kind={st === 'Delivered' ? 'pri' : undefined} onClick={() => create({ milestoneId: ms.id })}>Create invoice</Btn>}
                            {known && r.status === 'Draft invoice' && r.invoice && <Btn size="xs" onClick={() => open(r.invoice?.id ?? '')}>Open draft</Btn>}
                            {known && r.status === 'Invoiced' && r.invoice && <Btn size="xs" onClick={() => UI.open('markPaid', { invoice: r.invoice, onDone: inv.reload })}>Mark paid</Btn>}
                            {!ms.deliveredOn && <Btn size="xs" aria-label={`Mark delivered: ${ms.label}`} onClick={() => { setErr(''); setDelivering({ id: ms.id, day: today }) }}>Mark delivered</Btn>}
                            {ms.deliveredOn && <Btn size="xs" kind="ghost" aria-label={`Undo delivered: ${ms.label}`} onClick={() => undoDelivered(ms)}>Undo delivered</Btn>}
                            {known && r.status === 'Planned' && <Btn size="xs" kind="ghost" onClick={() => startEdit(ms)}>Edit</Btn>}
                            {known && r.status === 'Planned' && <Btn size="xs" kind="ghost" aria-label={`Remove ${ms.label}`} onClick={() => remove(ms.id)}>Remove</Btn>}
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td>Scheduled</td>
                  <td className="money" style={{ textAlign: 'right' }}>{formatCents(scheduled)}</td>
                  <td colSpan={4}>
                    <span className="row wrap" style={{ gap: 8 }} aria-label="Reconciliation">
                      <span>{ofText}</span>
                      {gap > 0 && <Chip tone="warn">Unscheduled {formatCents(gap)}</Chip>}
                      {gap < 0 && <Chip tone="warn">Over-scheduled by {formatCents(-gap)}</Chip>}
                      {gap === 0 && <Chip tone="ok">All scheduled</Chip>}
                      {gap > 0 && !form && <Btn size="xs" onClick={startAdd}>Add milestone</Btn>}
                    </span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : !form && <div className="faint sm">No milestones yet. Add the agreed payments for this deal{retainer ? '' : ', or set up a monthly retainer'}.</div>}

        {rows.length > 0 && gap < 0 && (
          <Banner tone="warn" action={contracted ? <Btn size="sm" onClick={() => UI.open('addVariation', { dealId: deal.id })}>Add variation</Btn> : undefined}>
            <span className="sm">
              <b>Over-scheduled by {formatCents(-gap)}.</b> Milestones total {formatCents(scheduled)} against {formatCents(target.cents)} {contracted ? 'contracted' : 'estimated'}.{' '}
              <span className="muted">{contracted ? 'Reduce a milestone, or approve a variation if the client agreed to more work.' : 'Reduce a milestone, or set the contract to what was agreed.'}</span>
            </span>
          </Banner>
        )}

        {looseInvoices.length > 0 && (
          <div className="col" style={{ gap: 6 }}>
            <div className="b sm">Project invoices without a milestone</div>
            {looseInvoices.map(i => (
              <div key={i.id} className="rowx"><span>{invLink(i)} <span className="faint sm">{fmtDay(i.issueDate)}</span></span><span className="row" style={{ gap: 6 }}><span className="money sm">{formatCents(i.subtotalCents)}</span>{(() => { const c = statusChip(i); return <Chip tone={c.tone} icon={c.icon}>{c.label}</Chip> })()}</span></div>
            ))}
          </div>
        )}
        <div className="faint sm">Milestones are agreed amounts, not forecasts. Mark one delivered when the client has it; creating an invoice makes a draft with the milestone as its line, which you still review and issue.</div>
      </div>
    </Card>
  )

  const retainerCard = (retainer || retainerForm) && (
    <Card title="Support retainer" right={<Chip>Separate from project progress</Chip>}>
      <div className="col" style={{ gap: 14 }}>
        {retErr && <Banner tone="bad">{retErr}</Banner>}
        {retainerForm && (
          <div className="col" style={{ gap: 8 }}>
            <div className="grid g3" style={{ alignItems: 'end' }}>
              <Fld label="Monthly amount (ex GST)"><Inp aria-label="Retainer amount" className="mono" value={retainerForm.amount} onChange={v => setRetainerForm({ ...retainerForm, amount: v })} /></Fld>
              <Fld label="Next invoice date"><Inp aria-label="Retainer next invoice date" type="date" value={retainerForm.date} onChange={v => setRetainerForm({ ...retainerForm, date: v })} /></Fld>
              <span className="row" style={{ gap: 6 }}>
                <Btn size="sm" kind="pri" onClick={saveRetainer}>{formCatchUp.length > 1 ? `Save and draft ${retainerSpanLabel(formCatchUp.slice(-1))} only` : 'Save retainer'}</Btn>
                <Btn size="sm" onClick={() => { setRetainerForm(null); setRetErr('') }}>Cancel</Btn>
              </span>
            </div>
            {formRedraft && <Banner tone="bad">{formRedraft}.</Banner>}
            {formCatchUp.length > 1 && (
              <Banner tone="warn">
                <b>This date is {formCatchUp.length} months in the past, so only {retainerSpanLabel(formCatchUp.slice(-1))} is drafted, on the next run. {retainerSpanLabel(formCatchUp.slice(0, -1))} {formCatchUp.length === 2 ? 'is' : 'are'} skipped.</b>{' '}
                You get one notification listing the skipped months; invoice by hand any that still need billing.
              </Banner>
            )}
            {formCatchUp.length === 1 && <div className="faint sm">This date is today or earlier, so the first draft is made on the next run.</div>}
          </div>
        )}

        {retainer && (
          <div className="col" style={{ gap: 10 }}>
            <div className="row wrap" style={{ gap: 6 }}><b>Retainer</b><Chip>Monthly</Chip></div>
            <div className="grid g3">
              <div><div className="faint sm">Monthly amount (ex GST)</div><div className="b money" style={{ fontSize: 18 }}>{formatCents(retainer.amountCents)}</div></div>
              <div><div className="faint sm">Next invoice date</div><div className="b" style={{ fontSize: 18 }}>{fmtDay(retainer.nextInvoiceDate)}</div></div>
              <div>
                <div className="faint sm">Last drafted period</div>
                {retainer.lastDraftedFor
                  ? <><div className="b" style={{ fontSize: 18 }}>{retainerPeriodLabel(retainer.lastDraftedFor) || '—'}</div><div className="faint sm">Drafted for {fmtDay(retainer.lastDraftedFor)}</div></>
                  : <div className="b" style={{ fontSize: 18 }}>None yet</div>}
              </div>
            </div>
            <RetainerNote retainer={retainer} today={today} paused={paused} />
            {retainerInvoices.map(i => (
              <div key={i.id} className="rowx"><span>{invLink(i)} <span className="faint sm">{fmtDay(i.issueDate)}</span></span><span className="row" style={{ gap: 4 }}><RetainerChip inv={i} />{(() => { const c = statusChip(i); return <Chip tone={c.tone} icon={c.icon}>{c.label}</Chip> })()}</span></div>
            ))}
            {money && <div className="sm muted" aria-label="Retainer invoiced">Retainer invoiced {formatCents(money.retainerInvoiced)} ex GST, not counted in Contracted, Invoiced or Collected above.</div>}
            <ManualRetainerNote retainer={retainer} today={today} paused={paused} />
            <div className="row" style={{ gap: 6 }}>
              <Btn size="sm" onClick={() => create(!paused && retainerAutoState(retainer, today) === 'due' && retainer.nextInvoiceDate ? { retainer: true, retainerFor: retainer.nextInvoiceDate } : { retainer: true })}>Create invoice</Btn>
              <Btn size="sm" kind="ghost" onClick={() => setRetainerForm({ amount: centsToInput(retainer.amountCents), date: retainer.nextInvoiceDate ?? '' })}>Edit retainer</Btn>
              <Btn size="sm" kind="ghost" onClick={() => { const r = Act.saveRetainer(deal.id, null); if (!r.ok) setRetErr(r.error) }}>Remove retainer</Btn>
            </div>
          </div>
        )}
      </div>
    </Card>
  )

  return (
    <div className="col" style={{ gap: 14 }}>
      {e && e.kind !== 'denied' && <Banner tone="bad" action={<Btn size="sm" onClick={inv.reload}>Try again</Btn>}>{e.message}</Banner>}
      <MoneyWarnings deal={deal} plan={plan} money={money} />
      <ProjectMoney deal={deal} plan={plan} invoices={known ? list : null} loading={inv.loading} />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'flex-start' }}>
        {plan?.contract || deal.status === 'won' ? <div style={{ flex: '1 1 420px', minWidth: 0 }}><ContractLedger deal={deal} /></div> : null}
        <div style={{ flex: '2 1 560px', minWidth: 0 }}>{milestones}</div>
      </div>
      {retainerCard}
    </div>
  )
}

const PAUSED: Record<RetainerPause, string> = {
  'archived': 'The deal is archived, so no retainer invoice is drafted automatically. Drafting resumes from the next invoice date when the deal is restored.',
  'not-won': 'The deal is not won, so no retainer invoice is drafted automatically. Drafting starts from the next invoice date once the deal is won.',
}

/**
 * What Create invoice does next to the scheduler. While a period is due, the invoice made here bills it and the
 * automatic draft moves on a month. Before then, an invoice made here is an extra one: the scheduled draft still comes.
 */
function ManualRetainerNote({ retainer, today, paused }: { retainer: BillingRetainer; today: string; paused: RetainerPause | null }) {
  const st = retainerAutoState(retainer, today)
  if (st === 'no-date') return null
  // Nothing is drafted for a paused deal, so an invoice made here claims no period and moves no date.
  if (paused) return <div className="faint sm" aria-label="Create invoice by hand">An invoice created here is an extra one and leaves the next invoice date as it is.</div>
  const period = retainerPeriodLabel(retainer.nextInvoiceDate)
  const msg = st === 'due'
    ? `Create invoice bills ${period} by hand: once it is saved, the automatic draft for ${period} is skipped and the date moves on a month.`
    : st === 'drafted'
      ? `The ${period} draft is already being made, so an invoice created here is an extra one.`
      : `An invoice created here is an extra one: the ${period} draft is still made automatically on ${fmtDay(retainer.nextInvoiceDate)}. If this invoice replaces it, move the next invoice date on first.`
  return <div className="faint sm" aria-label="Create invoice by hand">{msg}</div>
}

/** What the server scheduler will do with this retainer. Drafts only: nothing is ever issued or sent automatically. */
function RetainerNote({ retainer, today, paused }: { retainer: BillingRetainer; today: string; paused: RetainerPause | null }) {
  const st = retainerAutoState(retainer, today)
  const amount = formatCents(retainer.amountCents)
  const behind = st === 'due' ? retainerDuePeriods(retainer, today) : []
  const catchUp = behind.length > 1
    ? ` The date is ${behind.length} months behind, so only ${retainerSpanLabel(behind.slice(-1))} is drafted, on the next run. ${retainerSpanLabel(behind.slice(0, -1))} ${behind.length === 2 ? 'is' : 'are'} skipped, with one notification listing them; invoice by hand any that still need billing.`
    : ''
  const msg = paused && st !== 'no-date' ? PAUSED[paused] : st === 'no-date'
    ? 'No next invoice date, so no draft is created automatically. Set a date to have the draft made for you.'
    : st === 'due'
      ? `Due ${fmtDay(retainer.nextInvoiceDate)}. A draft invoice for ${amount} is created automatically on the next run, as long as the company has a billing client.${catchUp} It is never sent automatically.`
      : st === 'drafted'
        ? `The draft invoice for ${retainerPeriodLabel(retainer.lastDraftedFor)} is being created. It is never sent automatically.`
        : `A draft invoice for ${amount} is created automatically on ${fmtDay(retainer.nextInvoiceDate)}, then the date moves on a month. It is never sent automatically: you review and issue each one.`
  return (
    <div className="row sm muted" role="note" aria-label="Retainer automation" style={{ gap: 6, alignItems: 'flex-start' }}>
      <Icon n={st === 'no-date' || paused ? 'info' : 'refresh'} s={14} style={{ marginTop: 2, flexShrink: 0 }} />
      <span>{msg}</span>
    </div>
  )
}
