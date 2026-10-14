import type { BillingPlan, InvoiceDto } from '../api/contract'
import { wallFromMs } from '../data/tz'
import type { Company, Deal } from '../data/types'
import { ardorioByDeal, isRetainerInvoice, milestoneState, nextRetainerDate, retainerPause, scheduleRows } from './billing'
import { invoiceRef } from './externalInvoices'
import { isDay, withoutTest } from './invoices'
import { monthName, monthsBetween } from './revenueReport'

// ── Ardorio revenue forecast ─────────────────────────────────────────────────────────────────────
// A forward view of when contracted money will be invoiced and collected, by month and by Australian financial year
// (July to June). Three series are kept apart and never added together: the project (contracted milestones and the
// invoices already issued), the support retainer, and the weighted pipeline. Integer cents ex GST throughout.
//
// Project, per won Ardorio deal with a contract (the deal rows of Customers by deal, so the figures agree with the deal
// page): every milestone with no live invoice is forecast to be invoiced on its planned date; a past planned date, a
// delivered milestone or one with a draft invoice is forecast this month and flagged; one with no planned date is in
// No date. What the contract still holds beyond those milestones is Unscheduled, never spread over months. So for each
// deal: backlog (contracted - invoiced) = forecast milestones + unscheduled, and the totals always reconcile.
//
// A support-retainer contract is billed by its retainer, so it is not project backlog: only milestones it may carry
// are. What its contract still holds is reported apart (retainerContracts), next to the retainer series and offset by
// the retainer periods forecast in the view, never as project Unscheduled.
//
// A retainer behind by several periods is forecast as the server scheduler drafts it: only the latest due period, this
// month. The months it passes over are listed apart (retainerSkipped), to bill by hand, never as forecast invoices.

export type FcSeries = 'project' | 'retainer' | 'pipeline'
export type FcKind = 'milestone' | 'invoice' | 'retainer' | 'pipeline'
/**
 * overdue-invoice: planned in the past and not invoiced; delivered: delivered and not invoiced; draft: a draft invoice
 * waits to be issued; overdue-collect: issued and the payment is later than the assumed days to pay; close-passed: an
 * open deal whose close date is in the past; not-on-deal: an issued invoice on no won deal; slipped: moved by the slip control.
 */
export type FcFlag = 'overdue-invoice' | 'delivered' | 'draft' | 'overdue-collect' | 'close-passed' | 'not-on-deal' | 'slipped'

export const FLAG_LABEL: Record<FcFlag, string> = {
  'overdue-invoice': 'Overdue to invoice', delivered: 'Delivered, not invoiced', draft: 'Draft invoice', 'overdue-collect': 'Overdue to collect',
  'close-passed': 'Close date passed', 'not-on-deal': 'Not on a won deal', slipped: 'Slipped',
}

export interface FcEntry {
  id: string
  series: FcSeries
  kind: FcKind
  dealId: string | null
  dealName: string
  companyId: string | null
  /** Milestone label, invoice number, retainer period or deal name. */
  label: string
  /** The forecast amount: weighted for pipeline. */
  cents: number
  /** Pipeline only: the deal value before weighting, and the stage probability used. */
  valueCents?: number
  prob?: number
  /** The day it is forecast to be invoiced, or for pipeline to close; null with no date. Null for an invoice already issued. */
  invoiceDay: string | null
  /** The day it is forecast to be paid; null with no date. Never set for pipeline. */
  collectDay: string | null
  /** Already issued: counts in Collected only. */
  issued: boolean
  flags: FcFlag[]
}

export interface DealBacklog {
  dealId: string
  dealName: string
  companyId: string
  contracted: number
  invoiced: number
  /** contracted - invoiced, never below 0. For a support-retainer contract, only its milestones still to invoice. */
  backlog: number
  /** Forecast milestones of this deal. */
  scheduled: number
  /** backlog - scheduled when positive. */
  unscheduled: number
  /** scheduled - backlog when positive: milestones still to bill add up to more than the contract still holds. */
  overScheduled: number
}

/** A support-retainer contract: billed by its retainer, so kept out of the project backlog and shown beside the retainer. */
export interface RetainerContract {
  dealId: string
  dealName: string
  companyId: string
  contracted: number
  /** Issued project and retainer invoices of the deal. */
  invoiced: number
  /** Milestones still to invoice: these are in the project backlog. */
  scheduled: number
  /** Retainer forecast for the deal and not yet issued: the periods in the view and any draft waiting. */
  forecastRetainer: number
  /** contracted - invoiced - scheduled - forecastRetainer, never below 0: what the contract still holds after the view. */
  left: number
  /** The retainer forecast in the view runs past the contract by this much. */
  beyond: number
}

/** Retainer periods the server scheduler passes over when it catches up: bill them by hand if they were not. */
export interface RetainerSkipped { deal: Deal; periods: string[] }

export interface Forecast {
  today: string
  lagDays: number
  slip: number
  entries: FcEntry[]
  deals: DealBacklog[]
  /** Contracted minus invoiced, all won Ardorio deals with a contract. */
  backlog: number
  unscheduled: number
  overScheduled: number
  /** Won Ardorio deals with no contract yet: not in the forecast. */
  noContract: Deal[]
  /** Active retainers with no next invoice date: nothing can be forecast for them. */
  retainerNoDate: Deal[]
  /** Support-retainer contracts, apart from the project backlog. */
  retainerContracts: RetainerContract[]
  /** Retainers more than one period behind: the months skipped, oldest first. */
  retainerSkipped: RetainerSkipped[]
}

// ── days and months ──────────────────────────────────────────────────────────────────────────────
const p2 = (n: number): string => String(n).padStart(2, '0')
const toMs = (day: string): number => Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10))
const fromMs = (ms: number): string => { const d = new Date(ms); return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}` }

export const addDays = (day: string, n: number): string => fromMs(toMs(day) + n * 86_400_000)
export const daysBetween = (from: string, to: string): number => Math.round((toMs(to) - toMs(from)) / 86_400_000)

/** The same day `n` months on, clamped to the month's last day: 31 Jan + 1 -> 28 Feb. */
export function addMonths(day: string, n: number): string {
  const y = +day.slice(0, 4), m = +day.slice(5, 7) - 1 + n, d = +day.slice(8, 10)
  const yy = y + Math.floor(m / 12), mm = ((m % 12) + 12) % 12
  const last = new Date(Date.UTC(yy, mm + 1, 0)).getUTCDate()
  return `${yy}-${p2(mm + 1)}-${p2(Math.min(d, last))}`
}

/** "2026-11" -> 27: the Australian financial year (July to June) a month is in, named by the year it ends. */
export const fyOf = (ym: string): number => (+ym.slice(5, 7) >= 7 ? +ym.slice(0, 4) + 1 : +ym.slice(0, 4))
export const fyLabel = (fy: number): string => `FY${p2(fy % 100)}`

/** The day of a stored payment instant (or day), in the org timezone. Empty when it does not parse. */
function paidDay(at: string | undefined | null): string {
  if (!at) return ''
  if (isDay(at)) return at
  const ms = Date.parse(at)
  return Number.isNaN(ms) ? '' : wallFromMs(ms).slice(0, 10)
}

// ── payment lag ──────────────────────────────────────────────────────────────────────────────────
export const DEFAULT_LAG = 30
export const LAG_MIN_SAMPLE = 3
export interface PaymentLag { days: number; sample: number; median: boolean }

/**
 * Days from issue to payment: the median over paid, non-test invoices paid in the last 24 months when there are at
 * least three, else 30. Every invoice listed is an Ardorio invoice; external records count like any other.
 */
export function paymentLag(all: readonly InvoiceDto[], today: string): PaymentLag {
  const since = addMonths(today, -24)
  const days: number[] = []
  for (const i of withoutTest(all)) {
    if (i.status !== 'paid' || !isDay(i.issueDate)) continue
    const paid = paidDay(i.payment?.paidAt)
    if (!paid || paid < since || paid > today) continue
    days.push(Math.max(0, daysBetween(i.issueDate, paid)))
  }
  if (days.length < LAG_MIN_SAMPLE) return { days: DEFAULT_LAG, sample: days.length, median: false }
  days.sort((a, b) => a - b)
  const mid = days.length >> 1
  const med = days.length % 2 ? days[mid] : Math.round((days[mid - 1] + days[mid]) / 2)
  return { days: med, sample: days.length, median: true }
}

/** "Collected assumes 44 days to pay (median of 12 paid invoices)". */
export function lagLine(lag: PaymentLag, days = lag.days): string {
  const word = days === 1 ? 'day' : 'days'
  if (days !== lag.days) return `Collected assumes ${days} ${word} to pay (set for this view; the median would be ${lag.median ? `${lag.days} days, of ${lag.sample} paid invoices` : `the default of ${DEFAULT_LAG} days`})`
  if (lag.median) return `Collected assumes ${days} ${word} to pay (median of ${lag.sample} paid invoices)`
  return `Collected assumes ${days} ${word} to pay (the default: fewer than ${LAG_MIN_SAMPLE} invoices paid in the last 24 months, ${lag.sample} so far)`
}

/** The days to pay a person typed: a whole number of days from 0 to 365, else null. */
export function parseLag(text: string): number | null {
  const t = text.trim()
  if (!/^\d{1,3}$/.test(t)) return null
  const n = Number(t)
  return n <= 365 ? n : null
}

// ── the forecast ─────────────────────────────────────────────────────────────────────────────────
export interface ForecastInput {
  today: string
  deals: readonly Deal[]
  companies: readonly Company[]
  plans: readonly BillingPlan[]
  invoices: readonly InvoiceDto[]
  /** Days to pay, from paymentLag or the viewer's own number. */
  lagDays: number
  /** Months every planned, undelivered milestone is assumed to slip: 0 to 3. */
  slip?: number
  /** Stage probability of an open deal, 0..100. */
  prob: (d: Deal) => number
  /** The last day retainer periods are listed to: a retainer has no end, so it is drawn only as far as the view. */
  retainerUntil: string
}

const dealName = (d: Pick<Deal, 'title' | 'name'>): string => d.title || d.name
const MAX_RETAINER_PERIODS = 240

export function buildForecast(o: ForecastInput): Forecast {
  const { today, lagDays } = o
  const slip = Math.max(0, Math.trunc(o.slip ?? 0))
  const collect = (day: string): { day: string; late: boolean } => {
    const at = addDays(day, lagDays)
    return at < today ? { day: today, late: true } : { day: at, late: false }
  }
  const entries: FcEntry[] = []
  const deals: DealBacklog[] = []
  const noContract: Deal[] = []
  const retainerNoDate: Deal[] = []
  const retainerContracts: RetainerContract[] = []
  const retainerSkipped: RetainerSkipped[] = []
  const live = withoutTest(o.invoices).filter(i => i.status !== 'void')
  const byDeal = ardorioByDeal(o.deals, o.companies, o.plans, o.invoices)
  const planOf = new Map(o.plans.map(p => [p.dealId, p] as const))
  const onDeal = new Set<string>()

  for (const co of byDeal.companies) {
    for (const row of co.deals) {
      const d = row.deal
      const plan = planOf.get(d.id)
      const inv = live.filter(i => i.dealId === d.id)
      for (const i of inv) onDeal.add(i.id)
      const name = dealName(d)
      const base = { dealId: d.id, dealName: name, companyId: row.companyId }

      // Issued, unpaid invoices of the deal: collected issue date + lag, else this month and overdue. Retainer ones go
      // to the retainer series; external records are project money, as everywhere.
      for (const i of inv) {
        if (i.status !== 'sent') continue
        const retainer = isRetainerInvoice(i, plan)
        const c = collect(isDay(i.issueDate) ? i.issueDate : today)
        entries.push({
          ...base, id: `inv:${i.id}`, series: retainer ? 'retainer' : 'project', kind: 'invoice', label: invoiceRef(i) || 'Invoice',
          cents: i.subtotalCents, invoiceDay: null, collectDay: c.day, issued: true, flags: c.late ? ['overdue-collect'] : [],
        })
      }

      // The support retainer: its amount every month from the next invoice date, while the deal is won and live.
      let forecastRetainer = 0
      if (plan?.retainer && retainerPause(d) === null) {
        const r = plan.retainer
        // A draft the scheduler (or a person) made waits to be issued: this month.
        for (const i of inv) {
          if (i.status !== 'draft' || !isRetainerInvoice(i, plan)) continue
          const c = collect(today)
          entries.push({ ...base, id: `rdraft:${i.id}`, series: 'retainer', kind: 'retainer', label: i.invoiceNumber || 'Retainer draft', cents: i.subtotalCents, invoiceDay: today, collectDay: c.day, issued: false, flags: ['draft'] })
        }
        if (!r.nextInvoiceDate || !isDay(r.nextInvoiceDate)) retainerNoDate.push(d)
        else {
          // Periods due by today (not the one already claimed) collapse to the latest, as the scheduler's
          // latestDuePeriod drafts only that one: the earlier ones are skipped, not forecast.
          const due: string[] = []
          const until = o.retainerUntil > today ? o.retainerUntil : today
          let cur = r.nextInvoiceDate
          let anchor = r.anchorDay
          for (let n = 0; cur <= until && n < MAX_RETAINER_PERIODS; n++) {
            if (cur !== r.lastDraftedFor) {
              if (cur <= today) due.push(cur)
              else if (cur <= o.retainerUntil) {
                const c = collect(cur)
                entries.push({
                  ...base, id: `ret:${d.id}:${cur}`, series: 'retainer', kind: 'retainer', label: `Retainer, ${monthName(cur.slice(0, 7), true)}`,
                  cents: r.amountCents, invoiceDay: cur, collectDay: c.day, issued: false, flags: [],
                })
              }
            }
            const nx = nextRetainerDate(cur, anchor)
            cur = nx.next
            anchor = nx.anchorDay
          }
          const latest = due[due.length - 1]
          if (latest) {
            const late = latest < today
            const c = collect(today)
            entries.push({
              ...base, id: `ret:${d.id}:${latest}`, series: 'retainer', kind: 'retainer', label: `Retainer, ${monthName(latest.slice(0, 7), true)}`,
              cents: r.amountCents, invoiceDay: today, collectDay: c.day, issued: false, flags: late ? ['overdue-invoice'] : [],
            })
          }
          if (due.length > 1) retainerSkipped.push({ deal: d, periods: due.slice(0, -1) })
        }
        for (const e of entries) if (e.dealId === d.id && e.series === 'retainer' && !e.issued) forecastRetainer += e.cents
      }

      if (row.money.contracted === null) { noContract.push(d); continue }

      // Milestones not yet invoiced: Planned, Delivered or with a draft invoice (a draft is not invoiced yet).
      let scheduled = 0
      for (const s of scheduleRows(plan, inv)) {
        const state = milestoneState(s)
        if (state === 'Invoiced' || state === 'Paid') continue
        const m = s.milestone
        scheduled += m.amountCents
        const flags: FcFlag[] = []
        let on: string | null
        if (state === 'Draft invoice') { on = today; flags.push('draft') }
        else if (state === 'Delivered') { on = today; flags.push('delivered', 'overdue-invoice') }
        else if (!m.plannedDate || !isDay(m.plannedDate)) on = null
        else if (m.plannedDate < today) { on = today; flags.push('overdue-invoice') }
        else {
          on = slip ? addMonths(m.plannedDate, slip) : m.plannedDate
          if (slip) flags.push('slipped')
        }
        const c = on ? collect(on) : null
        entries.push({ ...base, id: `ms:${d.id}:${m.id}`, series: 'project', kind: 'milestone', label: m.label, cents: m.amountCents, invoiceDay: on, collectDay: c?.day ?? null, issued: false, flags })
      }

      // A support-retainer contract is billed by its retainer: only its milestones are project backlog, and what the
      // contract still holds is reported beside the retainer, offset by the retainer periods in the view.
      if (row.engagement === 'support-retainer') {
        const invoiced = row.money.invoiced + row.money.retainerInvoiced
        const rest = Math.max(0, row.money.contracted - invoiced - scheduled)
        retainerContracts.push({
          dealId: d.id, dealName: name, companyId: row.companyId, contracted: row.money.contracted, invoiced, scheduled, forecastRetainer,
          left: Math.max(0, rest - forecastRetainer), beyond: Math.max(0, forecastRetainer - rest),
        })
        if (scheduled > 0) {
          deals.push({ dealId: d.id, dealName: name, companyId: row.companyId, contracted: row.money.contracted, invoiced: row.money.invoiced, backlog: scheduled, scheduled, unscheduled: 0, overScheduled: 0 })
        }
        continue
      }
      const invoiced = row.money.invoiced
      const backlog = Math.max(0, row.money.contracted - invoiced)
      deals.push({
        dealId: d.id, dealName: name, companyId: row.companyId, contracted: row.money.contracted, invoiced, backlog, scheduled,
        unscheduled: Math.max(0, backlog - scheduled), overScheduled: Math.max(0, scheduled - backlog),
      })
    }
  }

  // Issued, unpaid invoices on no won deal: still money owed, collected like any other, and labelled.
  for (const i of live) {
    if (i.status !== 'sent' || onDeal.has(i.id)) continue
    const c = collect(isDay(i.issueDate) ? i.issueDate : today)
    const d = i.dealId ? o.deals.find(x => x.id === i.dealId) : undefined
    entries.push({
      id: `inv:${i.id}`, series: i.source === 'retainer' ? 'retainer' : 'project', kind: 'invoice', dealId: d ? d.id : null, dealName: d ? dealName(d) : 'Not on a deal',
      companyId: i.companyId, label: invoiceRef(i) || 'Invoice', cents: i.subtotalCents, invoiceDay: null, collectDay: c.day, issued: true,
      flags: c.late ? ['not-on-deal', 'overdue-collect'] : ['not-on-deal'],
    })
  }

  // Weighted pipeline: open Ardorio deals, value x stage probability, in the month of the close date.
  for (const d of o.deals) {
    if (d.businessId !== 'ard' || d.status !== 'open' || d.archived === true) continue
    const value = Math.round((d.value || 0) * 100)
    const prob = Math.max(0, Math.min(100, o.prob(d) || 0))
    const close = d.close && isDay(d.close) ? d.close : null
    const late = !!close && close < today
    entries.push({
      id: `pl:${d.id}`, series: 'pipeline', kind: 'pipeline', dealId: d.id, dealName: dealName(d), companyId: d.companyId || null, label: dealName(d),
      cents: Math.round((value * prob) / 100), valueCents: value, prob, invoiceDay: close ? (late ? today : close) : null, collectDay: null, issued: false, flags: late ? ['close-passed'] : [],
    })
  }

  const sum = (f: (d: DealBacklog) => number): number => deals.reduce((a, d) => a + f(d), 0)
  return { today, lagDays, slip, entries, deals, backlog: sum(d => d.backlog), unscheduled: sum(d => d.unscheduled), overScheduled: sum(d => d.overScheduled), noContract, retainerNoDate, retainerContracts, retainerSkipped }
}

// ── range and buckets ────────────────────────────────────────────────────────────────────────────
export type FcRange = 'm12' | 'm24' | 'fy'
export const FC_RANGES: ReadonlyArray<readonly [FcRange, string]> = [['m12', 'Next 12 months'], ['m24', 'Next 24 months'], ['fy', 'By financial year']]
export const SLIPS: ReadonlyArray<readonly [string, string]> = [['0', '0'], ['1', '1'], ['2', '2'], ['3', '3']]
/** At most this many financial years are listed; anything after is Later. */
export const MAX_FY = 10

/**
 * The months a range covers, from this month. Next 12 or 24 months; by financial year, whole financial years from this
 * one to the one holding the latest dated forecast (at least this one and the next, at most MAX_FY).
 */
export function rangeMonths(range: FcRange, today: string, latest: string | null = null): string[] {
  const from = today.slice(0, 7)
  if (range !== 'fy') return monthsBetween(`${from}-01`, addMonths(`${from}-01`, range === 'm12' ? 11 : 23))
  const first = fyOf(from)
  const want = latest ? fyOf(latest.slice(0, 7)) : first + 1
  const last = Math.min(first + MAX_FY - 1, Math.max(first + 1, want))
  return monthsBetween(`${from}-01`, `${last}-06-30`)
}

/** The latest invoice or collect day of the dated project and pipeline entries: how far "By financial year" reaches. */
export function latestDay(entries: readonly FcEntry[]): string | null {
  let out: string | null = null
  for (const e of entries) {
    if (e.series === 'retainer') continue
    for (const day of [e.invoiceDay, e.collectDay]) if (day && (!out || day > out)) out = day
  }
  return out
}

export type FcRole = 'invoiced' | 'collected' | 'retainer' | 'retainerCollected' | 'pipeline'
export interface FcBucket {
  invoiced: number
  collected: number
  retainer: number
  retainerCollected: number
  pipeline: number
  /** Pipeline value before weighting. */
  pipelineValue: number
  /** Every entry counted in the bucket, with the figure it counts in. */
  items: Array<{ e: FcEntry; role: FcRole }>
}
export const emptyBucket = (): FcBucket => ({ invoiced: 0, collected: 0, retainer: 0, retainerCollected: 0, pipeline: 0, pipelineValue: 0, items: [] })

function add(b: FcBucket, e: FcEntry, role: FcRole): void {
  b[role] += e.cents
  if (role === 'pipeline') b.pipelineValue += e.valueCents ?? 0
  b.items.push({ e, role })
}

export interface FcSummary {
  months: string[]
  byMonth: Map<string, FcBucket>
  /** Every month of the range together. */
  inRange: FcBucket
  /** After the range. */
  later: FcBucket
  /** No planned date (milestones) or no close date (pipeline). */
  noDate: FcBucket
}

/** Each entry in the month its figure falls in: invoiced (or closes) on invoiceDay, collected on collectDay. */
export function summarise(f: Pick<Forecast, 'entries'>, months: readonly string[]): FcSummary {
  const byMonth = new Map(months.map(m => [m, emptyBucket()] as const))
  const inRange = emptyBucket(), later = emptyBucket(), noDate = emptyBucket()
  const first = months[0] ?? '', last = months[months.length - 1] ?? ''
  const put = (e: FcEntry, role: FcRole, day: string | null): void => {
    if (!day) return add(noDate, e, role)
    let ym = day.slice(0, 7)
    if (ym < first) ym = first
    if (ym > last) return add(later, e, role)
    add(byMonth.get(ym)!, e, role)
    add(inRange, e, role)
  }
  for (const e of f.entries) {
    if (e.series === 'pipeline') put(e, 'pipeline', e.invoiceDay)
    else if (e.series === 'retainer') {
      if (!e.issued) put(e, 'retainer', e.invoiceDay)
      put(e, 'retainerCollected', e.collectDay)
    } else {
      if (!e.issued) put(e, 'invoiced', e.invoiceDay)
      // A milestone with no date has no collected date either: it is in No date once, as invoiced.
      if (e.issued || e.invoiceDay) put(e, 'collected', e.collectDay)
    }
  }
  return { months: [...months], byMonth, inRange, later, noDate }
}

export interface FyRow { fy: number; label: string; months: string[]; partial: boolean; bucket: FcBucket }

function merge(into: FcBucket, b: FcBucket): void {
  into.invoiced += b.invoiced
  into.collected += b.collected
  into.retainer += b.retainer
  into.retainerCollected += b.retainerCollected
  into.pipeline += b.pipeline
  into.pipelineValue += b.pipelineValue
  into.items.push(...b.items)
}

/** The months of the range grouped by financial year. A year the range covers only part of says which months. */
export function byFinancialYear(s: Pick<FcSummary, 'months' | 'byMonth'>): FyRow[] {
  const out: FyRow[] = []
  for (const m of s.months) {
    const fy = fyOf(m)
    let row = out[out.length - 1]
    if (!row || row.fy !== fy) { row = { fy, label: fyLabel(fy), months: [], partial: false, bucket: emptyBucket() }; out.push(row) }
    row.months.push(m)
    merge(row.bucket, s.byMonth.get(m) ?? emptyBucket())
  }
  for (const r of out) {
    r.partial = r.months.length < 12
    if (r.partial) r.label = `${fyLabel(r.fy)} (${monthName(r.months[0])} to ${monthName(r.months[r.months.length - 1])})`
  }
  return out
}

/** backlog = forecast invoiced in range + later + no date + unscheduled (- over-scheduled). Zero when it reconciles. */
export function reconcileGap(f: Pick<Forecast, 'backlog' | 'unscheduled' | 'overScheduled'>, s: Pick<FcSummary, 'inRange' | 'later' | 'noDate'>): number {
  return f.backlog - (s.inRange.invoiced + s.later.invoiced + s.noDate.invoiced + f.unscheduled - f.overScheduled)
}

export interface DrillDeal { key: string; dealId: string | null; dealName: string; companyId: string | null; items: Array<{ e: FcEntry; role: FcRole }>; total: Partial<Record<FcRole, number>> }

/** A bucket's items grouped by deal, biggest first: what an expanded row lists. */
export function drillByDeal(b: Pick<FcBucket, 'items'>): DrillDeal[] {
  const map = new Map<string, DrillDeal>()
  for (const it of b.items) {
    const key = it.e.dealId ?? `none:${it.e.dealName}`
    const d = map.get(key) ?? { key, dealId: it.e.dealId, dealName: it.e.dealName, companyId: it.e.companyId, items: [], total: {} }
    d.items.push(it)
    d.total[it.role] = (d.total[it.role] ?? 0) + it.e.cents
    map.set(key, d)
  }
  const size = (d: DrillDeal): number => Object.values(d.total).reduce((a, n) => a + (n ?? 0), 0)
  return [...map.values()].sort((a, b) => size(b) - size(a) || a.dealName.localeCompare(b.dealName))
}

/** The monthly chart, in dollars: forecast invoiced, forecast collected and weighted pipeline side by side. */
export const forecastBars = (s: Pick<FcSummary, 'months' | 'byMonth'>): { l: string; v: number[] }[] =>
  s.months.map(m => {
    const b = s.byMonth.get(m) ?? emptyBucket()
    return { l: monthName(m), v: [b.invoiced / 100, b.collected / 100, b.pipeline / 100] }
  })
