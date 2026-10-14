import { useEffect, useRef, useState } from 'react'
import type { BillingMilestone, BillingPlan, BillingTerm, InvoiceDto } from '../../api/contract'
import { Act } from '../../data/Act'
import { F } from '../../data/F'
import { Q } from '../../data/Q'
import type { Deal } from '../../data/types'
import { Banner, Btn, Card, Chip, Ck, Fld, Icon, Inp, TA } from '../../kit'
import { scheduleRows, signedCents } from '../../shared/billing'
import { invoiceRef } from '../../shared/externalInvoices'
import { fmtDay } from '../../shared/invoices'
import { formatCents } from '../../shared/money'
import {
  bpText, daysBetween, draftChangeText, endDateProblem, endEffect, endReasonProblem, EXIT_LABEL, FREQUENCY_LABEL, inDays, INSTALMENT_ICON, INSTALMENT_TONE, instalmentsOf, instalmentState,
  MAX_END_REASON, nextAnniversary, nextBreakAnniversary, noticeBy, termActionPending, termLastDay, TIMING_LABEL, unconfirmedCpiYears, type DraftChange,
} from '../../shared/term'
import { scheduleTotal, termEndDate, termYears, yearlyFees } from '../../shared/termSchedule'
import { UI } from '../../ui/store'

export type TermPlan = BillingPlan & { term: BillingTerm }

/** "Fixed 3% a year", "CPI, assumed 2.5% a year · year 2 confirmed at 3.5%", "No rise". */
export function riseText(t: BillingTerm): string {
  if (t.escalation === 'none') return 'No rise'
  if (t.escalation === 'fixed') return `Fixed ${bpText(t.escalationBp)}% a year`
  const done = (t.cpiConfirmed ?? []).slice().sort((a, b) => a.year - b.year).map(c => `year ${c.year} confirmed at ${bpText(c.bp)}%`)
  return `CPI, assumed ${bpText(t.escalationBp)}% a year${done.length ? ` · ${done.join(', ')}` : ''}`
}

/** "Year 1 of 3, quarter 4: draft INV-0104 is removed." for each draft a change touches, or what to say when none. */
function draftsText(drafts: readonly DraftChange[], labelOf: (id: string) => string, none: string): string {
  return drafts.length ? drafts.map(d => `${labelOf(d.milestoneId)}: ${draftChangeText(d, formatCents)}`).join(' ') : none
}

/**
 * The term of a term agreement on the deal Billing tab: its dates, fee, billing, rise and exit, the automatic drafting,
 * and the schedule grouped by year with each instalment's invoice. Confirm CPI opens a dialog; ending early is
 * confirmed in place. Ardorio admins only (the Billing tab is already gated).
 */
export function TermAgreement({ deal, plan, invoices, loadError = null, onReload }: { deal: Deal; plan: TermPlan; invoices: InvoiceDto[] | null; loadError?: string | null; onReload: () => void }) {
  const t = plan.term
  const today = F.today()
  const [err, setErr] = useState('')
  // `tried`: the person pressed the confirm button once, so each field shows its own problem from then on.
  const [ending, setEnding] = useState<{ day: string; reason: string; tried: boolean } | null>(null)
  const [endErr, setEndErr] = useState('')
  const panel = useRef<HTMLDivElement>(null)
  useEffect(() => { if (ending) panel.current?.focus() }, [ending !== null]) // eslint-disable-line react-hooks/exhaustive-deps

  const known = invoices !== null
  const list = invoices ?? []
  const end = termEndDate(t)
  const lastDay = termLastDay(t)
  const left = daysBetween(today, end)
  const anniversary = t.exit === 'break' && !t.ended ? nextAnniversary(t, today) : null
  // The anniversary the client can still break at: later than the next one once its notice day has passed.
  const breakAt = t.exit === 'break' && !t.ended ? nextBreakAnniversary(t, today) : null
  const fees = yearlyFees(t)
  const cpiYears = t.ended ? [] : unconfirmedCpiYears(t)
  const rows = scheduleRows({ ...plan, milestones: instalmentsOf(plan) }, list)
  const byYear = new Map<number, typeof rows>()
  for (const r of rows) byYear.set(r.milestone.termYear ?? 1, [...(byYear.get(r.milestone.termYear ?? 1) ?? []), r])
  // Exact: this browser confirmed CPI or ended the agreement and the server has not answered yet (never guessed from amounts).
  const pending = termActionPending(t, Q.storedBillingPlan(deal.id)?.term)
  const labelOf = (id: string): string => plan.milestones.find(m => m.id === id)?.label ?? id

  const toggle = (on: boolean): void => {
    const r = Act.setTermAutoDraft(deal.id, on)
    if (!r.ok) return setErr(r.error)
    setErr('')
    UI.toast(on ? 'Instalment invoices will be drafted automatically on their invoice dates' : 'Automatic drafting is off. Create each instalment invoice yourself.')
  }

  const open = (id: string): void => UI.nav('invoice', { id })
  const create = (m: BillingMilestone): void => UI.nav('invoice', { id: 'new', q: { companyId: deal.companyId, dealId: deal.id, milestoneId: m.id } })

  // Ending early and confirming CPI are worked out from which instalments are already invoiced: until the deal's
  // invoices are loaded their previews would be wrong, so both wait for them.
  const waiting = known ? null : loadError ? `${loadError} The deal's invoices did not load, so Confirm CPI and End agreement early wait until they do.` : "Loading the deal's invoices before Confirm CPI and End agreement early…"
  const dayErr = ending ? endDateProblem(t, ending.day) : null
  const reasonErr = ending ? endReasonProblem(ending.reason) : null
  const effect = known && ending && !t.ended && !dayErr ? endEffect(plan, ending.day, list) : null
  const confirmEnd = (): void => {
    if (!ending) return
    setEnding({ ...ending, tried: true })
    if (!known) return setEndErr("The deal's invoices are not loaded, so what ending does cannot be shown yet. Try again when they are.")
    if (t.ended) return setEndErr('This agreement has already ended')
    if (dayErr || reasonErr) return setEndErr('')
    const eff = endEffect(plan, ending.day, list)
    const r = Act.endTermEarly(deal.id, ending.day, ending.reason)
    if (!r.ok) return setEndErr(r.error)
    setEnding(null)
    setEndErr('')
    UI.toast(`Agreement ends on ${fmtDay(eff.endedOn)}. ${eff.removedCents ? `${formatCents(eff.removedCents)} comes off the contract as an approved variation.` : 'Nothing comes off the contract.'}`)
  }

  return (
    <Card
      title="Term agreement"
      right={
        <span className="row wrap" style={{ gap: 6 }}>
          {t.ended ? <Chip tone="bad" icon="stop">Ended {fmtDay(t.ended.endedOn)}</Chip> : left > 0 ? <Chip icon="clock">Ends {inDays(left)}</Chip> : <Chip>Term over</Chip>}
          {cpiYears.length > 0 && <Btn size="sm" disabled={!known} title={waiting ?? undefined} onClick={() => UI.open('confirmCpi', { dealId: deal.id, year: cpiYears[0] })}>Confirm CPI for year {cpiYears[0]}</Btn>}
          {!t.ended && left > 0 && !ending && <Btn size="sm" kind="ghost" disabled={!known} title={waiting ?? undefined} onClick={() => { setEndErr(''); setEnding({ day: today >= t.startDate ? today : t.startDate, reason: '', tried: false }) }}>End agreement early</Btn>}
        </span>
      }
    >
      <div className="col" style={{ gap: 14 }}>
        {err && <Banner tone="bad">{err}</Banner>}
        {waiting && (cpiYears.length > 0 || (!t.ended && left > 0)) && (
          loadError
            ? <Banner tone="bad" action={<Btn size="sm" onClick={onReload}>Try again</Btn>}>{waiting}</Banner>
            : <div className="sm muted" role="status" aria-label="Invoices loading">{waiting}</div>
        )}
        {t.ended && (
          <Banner tone="warn" icon="stop">
            <b>Ended early on {fmtDay(t.ended.endedOn)}.</b> {t.ended.reason} <span className="muted">· recorded {fmtDay(t.ended.recordedAt)} by {t.ended.endedBy}. Issued invoices are kept; refunds or credits are handled by hand.</span>
          </Banner>
        )}
        {pending && <div className="sm muted" role="status"><Icon n="refresh" s={13} /> Updating the schedule. The server applies the change, updates or removes the drafts it touches and records the variation.</div>}

        <dl className="grid g3" style={{ margin: 0 }} aria-label="Term">
          <div><dt className="faint sm">Start</dt><dd className="b">{fmtDay(t.startDate)}</dd></div>
          <div>
            <dt className="faint sm">End</dt>
            <dd className="b">{fmtDay(lastDay)}</dd>
            <dd className="faint sm">{t.ended ? `Ended early on ${fmtDay(t.ended.endedOn)}` : left > 0 ? `Last day; ends ${inDays(left)}` : 'The term is over'}</dd>
          </div>
          <div>
            <dt className="faint sm">Annual fee (ex GST)</dt>
            <dd className="b money">{formatCents(t.annualCents)}</dd>
            <dd className="faint sm">Year 1{fees.length > 1 ? `; year ${fees.length} ${formatCents(fees[fees.length - 1])}` : ''}</dd>
          </div>
          <div><dt className="faint sm">Billed</dt><dd className="b">{FREQUENCY_LABEL[t.frequency]}, {TIMING_LABEL[t.timing].toLowerCase()}</dd><dd className="faint sm">{termYears(t)} year{termYears(t) === 1 ? '' : 's'} ({t.termMonths} months)</dd></div>
          <div><dt className="faint sm">Yearly rise</dt><dd className="b">{riseText(t)}</dd></div>
          <div>
            <dt className="faint sm">Exit</dt>
            <dd className="b">{EXIT_LABEL[t.exit]}</dd>
            {t.exit === 'break' && (
              <dd className="faint sm">
                {!anniversary ? 'No anniversary left in the term'
                  : breakAt === anniversary ? <>Next anniversary {fmtDay(anniversary)}; notice by <b>{fmtDay(noticeBy(anniversary, t.breakNoticeDays))}</b> ({t.breakNoticeDays} days)</>
                    : <>
                      Next anniversary {fmtDay(anniversary)}: the notice window closed on {fmtDay(noticeBy(anniversary, t.breakNoticeDays))}, so the client cannot break there.{' '}
                      {breakAt ? <>Next break {fmtDay(breakAt)}; notice by <b>{fmtDay(noticeBy(breakAt, t.breakNoticeDays))}</b> ({t.breakNoticeDays} days)</> : 'No break is left in the term.'}
                    </>}
              </dd>
            )}
          </div>
        </dl>


        <div className="col" style={{ gap: 4 }}>
          <Ck checked={t.autoDraft} onChange={toggle}>
            <span>Draft each instalment's invoice automatically on its invoice date</span>
          </Ck>
          <div className="faint sm" role="note" aria-label="Term automation">
            {!t.autoDraft ? 'Off: no drafts are made. Create each instalment invoice yourself from the schedule.'
              : t.ended ? `The agreement has ended, so no instalment is added. The ones that remain are still drafted on their invoice dates from ${fmtDay(t.draftFrom)}, never sent automatically: you review and issue each one.`
                : `A draft for the company's billing client is made on each invoice date from ${fmtDay(t.draftFrom)}. It is never sent automatically: you review and issue each one.`}
          </div>
        </div>

        {ending && (
          <div ref={panel} tabIndex={-1} className="card" style={{ boxShadow: 'none', background: 'var(--surf2)' }} role="group" aria-label="End agreement early">
            <div className="card-b col" style={{ gap: 10 }}>
              <div className="b">End this agreement early?</div>
              {endErr && <Banner tone="bad">{endErr}</Banner>}
              <div className="grid g2">
                <Fld label="Ends on" req err={ending.tried ? dayErr : null} hint={`From ${fmtDay(t.startDate)}, before ${fmtDay(end)}`}><Inp type="date" min={t.startDate} max={lastDay} value={ending.day} onChange={v => setEnding({ ...ending, day: v })} /></Fld>
                <Fld label="Reason" req err={ending.tried ? reasonErr : null} hint={`Up to ${MAX_END_REASON} characters`}><TA rows={2} value={ending.reason} onChange={v => setEnding({ ...ending, reason: v })} /></Fld>
              </div>
              <div role="status" aria-label="What ending does" className="col sm" style={{ gap: 4 }}>
                {effect ? (
                  <>
                    {effect.removed.length > 0
                      ? <div>Removed: {effect.removed.map(m => `${m.label} (${formatCents(m.amountCents)})`).join(', ')}.</div>
                      : <div>No instalment is removed.</div>}
                    {effect.cut.map(c => (
                      <div key={c.id}>
                        Cut: {c.label} from <span className="money">{formatCents(c.from)}</span> to <span className="money">{formatCents(c.to)}</span>, for {daysBetween(c.periodStart, effect.endedOn)} of {daysBetween(c.periodStart, c.periodEnd) + 1} days.
                        {' '}It now ends on {fmtDay(c.newPeriodEnd)}{c.newPlannedDate === c.newPeriodEnd ? ' and is invoiced that day' : ''}.
                      </div>
                    ))}
                    {effect.keptIssued.length > 0 && <div>Kept, already issued: {effect.keptIssued.map(m => m.label).join(', ')}. Refunds or credits are handled by hand.</div>}
                    <div>Drafts follow the change. {draftsText(effect.drafts, labelOf, 'None of these instalments has a draft invoice.')}</div>
                    <div>
                      {effect.removedCents
                        ? <>An approved variation of <b className="money">{signedCents(-effect.removedCents, formatCents)}</b> is added: {effect.label}.</>
                        : 'Nothing comes off the contract.'}
                      {' '}Nothing is added to the schedule after this; what remains is still drafted on its invoice date while automatic drafting is on.
                    </div>
                  </>
                ) : <div className="muted">{known ? 'Pick a day in the term to see which instalments are removed or cut.' : "Waiting for the deal's invoices to show which instalments are removed or cut."}</div>}
                <div className="b">This can't be undone.</div>
              </div>
              <span className="row" style={{ gap: 6 }}>
                <Btn size="sm" kind="danger" disabled={!known} onClick={confirmEnd}>End agreement</Btn>
                <Btn size="sm" onClick={() => { setEnding(null); setEndErr('') }}>Cancel</Btn>
              </span>
            </div>
          </div>
        )}


        <div style={{ overflowX: 'auto' }}>
          <table className="tbl" aria-label="Term schedule" style={{ minWidth: 760 }}>
            <thead><tr><th>Instalment</th><th>Period</th><th>Invoice date</th><th style={{ textAlign: 'right' }}>Amount (ex GST)</th><th>State</th><th>Invoice</th></tr></thead>
            {[...byYear.entries()].map(([y, list]) => (
              <tbody key={y}>
                {list.map(r => {
                  const m = r.milestone
                  const st = instalmentState(m, r.invoice, today)
                  return (
                    <tr key={m.id}>
                      <td className="b">{m.label}</td>
                      <td className="sm">{fmtDay(m.periodStart)} to {fmtDay(m.periodEnd)}</td>
                      <td>{fmtDay(m.plannedDate)}</td>
                      <td className="money" style={{ textAlign: 'right' }}>{formatCents(m.amountCents)}</td>
                      <td>{known ? <Chip tone={INSTALMENT_TONE[st]} icon={INSTALMENT_ICON[st]}>{st}</Chip> : <span className="faint">…</span>}</td>
                      <td>
                        {r.invoice
                          ? <a className="mono" href={`/sales/invoices/${r.invoice.id}`} onClick={ev => { ev.preventDefault(); open(r.invoice!.id) }}>{invoiceRef(r.invoice)}</a>
                          : known && st === 'Due' ? <Btn size="xs" onClick={() => create(m)}>Create invoice</Btn> : <span className="faint">Not invoiced</span>}
                        {r.invoice?.status === 'paid' && <div className="faint sm">Paid {fmtDay(r.invoice.payment?.paidAt)}</div>}
                        {r.invoice && (r.invoice.status === 'sent') && <div className="faint sm">Due {fmtDay(r.invoice.dueDate)}</div>}
                      </td>
                    </tr>
                  )
                })}
                <tr>
                  <td colSpan={3} className="b">Year {y} total{fees[y - 1] !== undefined && scheduleTotal(list.map(r => r.milestone)) !== fees[y - 1] ? <span className="faint sm"> · fee {formatCents(fees[y - 1])}</span> : null}</td>
                  <td className="money b" style={{ textAlign: 'right' }}>{formatCents(scheduleTotal(list.map(r => r.milestone)))}</td>
                  <td colSpan={2} />
                </tr>
              </tbody>
            ))}
            <tfoot>
              <tr><td colSpan={3}>Schedule total</td><td className="money" style={{ textAlign: 'right' }}>{formatCents(scheduleTotal(rows.map(r => r.milestone)))}</td><td colSpan={2} /></tr>
            </tfoot>
          </table>
        </div>
        {known && <div className="faint sm">An instalment is earned when its invoice is issued; a draft is not earned until then. Revenue is recognised when invoiced; nothing here is counted as recurring revenue. <Btn size="xs" kind="ghost" onClick={onReload}>Refresh invoices</Btn></div>}
      </div>
    </Card>
  )
}
