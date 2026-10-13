import { useId, useState, type ReactNode } from 'react'
import type { RevenueReport, RevenueSourceFilter } from '../../api/contract'
import { getRevenueReport, revenueReportError } from '../../api/reports'
import { liveDeal } from '../../data/archive'
import { F } from '../../data/F'
import { useLoad } from '../../data/invoicing'
import { Q } from '../../data/Q'
import { S } from '../../data/store'
import { Banner, Btn, Card, Chip, Empty, Seg } from '../../kit'
import { bulletPct, bulletScale } from '../../shared/billing'
import { wonAt } from '../../shared/goalMetrics'
import { formatCentsTile } from '../../shared/money'
import { PageHead } from '../../shared/PageHead'
import {
  ARD_PERIODS, coverageText, goalTarget, monthName, monthsBetween, periodProgress, pipelineCoverage, recordedLateLine, reportRange, wonByMonth,
  type ArdPeriod,
} from '../../shared/revenueReport'
import { UI } from '../../ui/store'

const SOURCE_OPTS: ReadonlyArray<readonly [RevenueSourceFilter, string]> = [['all', 'All'], ['salesos', 'SalesOS'], ['external', 'External']]
const R: { textAlign: 'right' } = { textAlign: 'right' }
const dollars = (v: number): string => formatCentsTile(Math.round(v * 100))
const plural = (n: number, w: string): string => `${n} ${w}${n === 1 ? '' : 's'}`
/** "2026-07-01" -> "1 Jul 2026". */
const dayName = (day: string): string => `${Number(day.slice(8, 10))} ${monthName(day.slice(0, 7))}`

function Tile({ label, value, sub, title, describedBy, busy }: { label: string; value: string; sub?: string; title?: string; describedBy?: string; busy?: boolean }) {
  return (
    <div className="kpi static" title={title} aria-describedby={describedBy} aria-busy={busy || undefined}>
      <span className="l">{label}</span>
      <span className="v num">{value}</span>
      {sub && <span className="s">{sub}</span>}
    </div>
  )
}

interface GoalLine { label: string; actual: number | null; target: number | null; color: string }

/** One bullet of "Against this year's goals": the bar is the figure so far, the black marker the goal. Cents. */
function GoalBullet({ g, busy }: { g: GoalLine; busy: boolean }) {
  const cols = { gridTemplateColumns: '110px minmax(0,1fr) 190px' }
  if (g.target === null) {
    return (
      <div className="bul" style={cols} data-goal={g.label}>
        <span className="lab">{g.label}</span>
        <div className="bt" aria-hidden="true" />
        <span className="val faint">No goal set</span>
      </div>
    )
  }
  if (g.actual === null) {
    return (
      <div className="bul" style={cols} data-goal={g.label}>
        <span className="lab">{g.label}</span>
        <div className="bt" aria-hidden="true"><b style={{ left: '90.9%' }} /></div>
        <span className="val">{busy ? '…' : '—'} of {formatCentsTile(g.target)}</span>
      </div>
    )
  }
  const scale = bulletScale([g.actual, g.target])
  const pct = Math.round((g.actual / g.target) * 100)
  return (
    <div className="bul" style={cols} role="img" aria-label={`${g.label} ${formatCentsTile(g.actual)} of ${formatCentsTile(g.target)} goal, ${pct} percent`} data-goal={g.label}>
      <span className="lab">{g.label}</span>
      <div className="bt">
        <i style={{ width: bulletPct(g.actual, scale), background: g.color }} />
        <b style={{ left: bulletPct(g.target, scale) }} />
      </div>
      <span className="val">{formatCentsTile(g.actual)} of {formatCentsTile(g.target)} · {pct}%</span>
    </div>
  )
}

/**
 * Reports › Ardorio revenue (boards 5 and 11): one-off project money for a financial year, quarter or month. Won value
 * from the synced won deals (the contract at won, else the deal value); invoiced, collected, outstanding and overdue
 * from GET /sales/reports/revenue; the period's goals; and pipeline coverage against the won value goal.
 * Admins of Ardorio (or super) only; the caller checks. `tabs` is the Reports tab bar, drawn under the page head.
 */
export function ArdorioRevenue({ tabs }: { tabs?: ReactNode }) {
  const [period, setPeriod] = useState<ArdPeriod>('fy')
  const [source, setSource] = useState<RevenueSourceFilter>('all')
  const today = F.today()
  const range = reportRange(period, today)
  const { from, to } = range
  const rep = useLoad(s => getRevenueReport({ from, to, source }, s), `ard-revenue:${from}:${to}:${source}`)
  // Goals always compare all sources: a second read only while the Source filter narrows the figures above.
  const allOn = source !== 'all' && range.goal !== null
  const all = useLoad(s => (allOn ? getRevenueReport({ from, to, source: 'all' }, s) : Promise.resolve(null)), allOn ? `ard-revenue:${from}:${to}:all` : 'ard-revenue-all:off')
  const formulaId = useId()

  const ard = S.deals.filter(d => d.businessId === 'ard' && liveDeal(d))
  const won = ard.filter(d => {
    const at = wonAt(d)
    return d.status === 'won' && !!at && at >= `${from}T00:00` && at <= `${to}T23:59`
  })
  const wonValue = won.reduce((s, d) => s + Q.wonAmount(d), 0)
  const wonCents = Math.round(wonValue * 100)
  const weighted = ard.filter(Q.open).reduce((s, d) => s + Q.weighted(d), 0)
  const wonTarget = range.goal ? goalTarget(S.goals, 'won_value', range.goal) : null
  const cov = range.goal ? pipelineCoverage(weighted, wonTarget, wonValue) : null

  const err = rep.error ? revenueReportError(rep.error) : null
  const data: RevenueReport | null = rep.data
  const busy = !data && !err
  const money = (pick: (r: RevenueReport) => number): string => (data ? formatCentsTile(pick(data)) : busy ? '…' : '—')
  const extInv = data ? data.months.reduce((s, m) => s + m.externalInvoicedCents, 0) : 0
  const extCol = data ? data.months.reduce((s, m) => s + m.externalCollectedCents, 0) : 0

  const goalWord = `this ${range.noun}’s goal`
  const covValue = !cov ? '—' : cov.kind === 'ratio' ? coverageText(cov.ratio) : cov.kind === 'met' ? 'Goal met' : '—'
  const covSub = !cov ? '' : cov.kind === 'no-goal' ? `Set a won value goal for the ${range.noun === 'year' ? 'financial year' : range.noun} to see coverage` : cov.kind === 'met' ? `Won ${dollars(cov.won)} of ${dollars(cov.target)}` : `Needed: ${dollars(cov.needed)}`
  const formula = cov?.kind === 'ratio'
    ? `Pipeline coverage = weighted open Ardorio pipeline (${dollars(cov.weighted)}) ÷ won value still needed to reach ${goalWord} (${dollars(cov.needed)}).`
    : `Pipeline coverage = weighted open Ardorio pipeline ÷ won value still needed to reach ${goalWord}.`

  const goalData = source === 'all' ? data : all.data
  const goalBusy = source === 'all' ? busy : !all.data && !all.error
  const goalLines: GoalLine[] = range.goal ? [
    { label: 'Won value', actual: wonCents, target: wonTarget === null ? null : Math.round(wonTarget * 100), color: 'var(--b-inv)' },
    { label: 'Invoiced', actual: goalData ? goalData.invoicedCents : null, target: goalTarget(S.goals, 'invoiced_cents', range.goal), color: 'var(--b-inv)' },
    { label: 'Collected', actual: goalData ? goalData.collectedCents : null, target: goalTarget(S.goals, 'collected_cents', range.goal), color: 'var(--b-col)' },
  ] : []
  const anyGoal = goalLines.some(g => g.target !== null)

  const months = monthsBetween(from, to)
  const wonMonths = wonByMonth(won, Q.wonAmount)
  const repMonths = new Map((data?.months ?? []).map(m => [m.month, m]))
  const cell = (cents: number | undefined): string => (cents !== undefined ? formatCentsTile(cents) : busy ? '…' : '—')
  const label = ARD_PERIODS.find(p => p[0] === period)?.[1] ?? ''

  return (
    <>
      <div className="crumb">Reports <span aria-hidden="true">›</span> Ardorio revenue</div>
      <PageHead title="Ardorio revenue" sub={`${label}, ${dayName(from)} to ${dayName(to)}. One-off projects, counted per deal and per invoice, ex GST. No recurring revenue is shown for Ardorio.`}>
        <Seg label="Period" value={period} onChange={v => setPeriod(v as ArdPeriod)} opts={ARD_PERIODS} />
        <Seg label="Source" value={source} onChange={v => setSource(v as RevenueSourceFilter)} opts={SOURCE_OPTS} />
        <Btn onClick={() => UI.nav('goals')}>Goals</Btn>
        <Btn onClick={() => UI.nav('customers', { q: { product: 'ard' } })}>By deal</Btn>
      </PageHead>
      {tabs}
      <section aria-label="Ardorio revenue figures" data-ard-revenue>
        {err?.kind === 'denied' ? (
          <Card><Empty icon="lock" title="The Ardorio revenue report is for Ardorio admins" body={err.message} /></Card>
        ) : (
          <>
            {err && (
              <div style={{ marginBottom: 10 }}>
                {err.kind === 'not-configured'
                  ? <Banner tone="info">{err.message}</Banner>
                  : <Banner tone="bad" action={<Btn size="sm" onClick={rep.reload}>Try again</Btn>}>Couldn’t load invoiced and collected figures. {err.message}</Banner>}
              </div>
            )}
            {data && data.recordedLate.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <Banner tone="info">
                  <b>Some months include records entered later.</b>
                  <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                    {data.recordedLate.map(r => <li key={r.month}>{recordedLateLine(r, formatCentsTile)}</li>)}
                  </ul>
                </Banner>
              </div>
            )}
            <div className={'grid ' + (cov ? 'g6' : 'g5')} style={{ marginBottom: 6 }}>
              <Tile label="Won value" value={dollars(wonValue)} sub={`bookings · ${plural(won.length, 'deal')} won`} />
              <Tile label="Invoiced" value={money(r => r.invoicedCents)} sub={`By issue date${extInv > 0 ? ` · ${formatCentsTile(extInv)} external` : ''}`} busy={busy} />
              <Tile label="Collected" value={money(r => r.collectedCents)} sub={`By paid date${extCol > 0 ? ` · ${formatCentsTile(extCol)} external` : ''}`} busy={busy} />
              <Tile label="Outstanding" value={money(r => r.outstandingCents)} sub="As of now" busy={busy} />
              <Tile label="Overdue" value={money(r => r.overdueCents)} sub="As of now" busy={busy} />
              {cov && <Tile label="Pipeline coverage" value={covValue} sub={covSub} title={formula} describedBy={formulaId} />}
            </div>
            {cov && <div className="faint sm" id={formulaId} style={{ marginBottom: 12 }}>{formula}</div>}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'flex-start', marginTop: cov ? 0 : 8 }}>
              {range.goal && (
                <Card title={`Against this ${range.noun}’s goals`} style={{ flex: '1 1 520px', minWidth: 0 }} right={<Btn size="sm" onClick={() => UI.nav('goals')}>Edit goals</Btn>}>
                  {anyGoal ? (
                    <div className="col" style={{ gap: 14 }}>
                      {goalLines.map(g => <GoalBullet key={g.label} g={g} busy={goalBusy} />)}
                      <div className="sm muted">The black marker is the goal. {periodProgress(range, today)}{source !== 'all' ? ' Goals count all sources.' : ''}</div>
                    </div>
                  ) : (
                    <Empty
                      icon="target"
                      title={`No Ardorio goals for this ${range.noun === 'year' ? 'financial year' : range.noun}`}
                      body="Set a won value, invoiced or collected goal to compare with."
                      action={Q.canManage('ard') ? <Btn size="sm" icon="plus" onClick={() => UI.open('goal', { period: range.goal, ownerType: 'team' })}>Set goal</Btn> : undefined}
                    />
                  )}
                </Card>
              )}
              <Card title="By month" right={<span className="faint xs">ex GST</span>} pad={false} style={{ flex: '1 1 520px', minWidth: 0 }}>
                <table className="tbl" aria-label="Ardorio revenue by month">
                  <thead><tr><th>Month</th><th style={R}>Won value</th><th style={R}>Invoiced</th><th style={R}>Collected</th><th>Includes</th></tr></thead>
                  <tbody>
                    {months.map(k => {
                      const m = repMonths.get(k)
                      const w = wonMonths.get(k)
                      return (
                        <tr key={k}>
                          <td>{monthName(k)}{k === today.slice(0, 7) && to === today ? ' (to date)' : ''}</td>
                          <td style={R} className="money">{formatCentsTile(w?.cents ?? 0)}</td>
                          <td style={R} className="money">{cell(m?.invoicedCents)}</td>
                          <td style={R} className="money">{cell(m?.collectedCents)}</td>
                          <td>
                            <span className="row wrap" style={{ gap: 4 }}>
                              {!!m && m.externalInvoicedCents > 0 && <Chip tone="info">External {formatCentsTile(m.externalInvoicedCents)} invoiced</Chip>}
                              {!!m && m.externalCollectedCents > 0 && <Chip tone="info">External {formatCentsTile(m.externalCollectedCents)} collected</Chip>}
                              {!!w && w.recordedCents > 0 && <Chip tone="acc">Recorded directly {formatCentsTile(w.recordedCents)} won</Chip>}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td className="b">{range.total}</td>
                      <td style={R} className="money b">{formatCentsTile(wonCents)}</td>
                      <td style={R} className="money b">{money(r => r.invoicedCents)}</td>
                      <td style={R} className="money b">{money(r => r.collectedCents)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </Card>
            </div>
            <div style={{ marginTop: 14 }}>
              <Banner>As recorded in SalesOS. Xero is the books. Cancelled and test invoices are left out. The Source filter shows SalesOS invoices, external records, or both; it does not change won value, goals or coverage.</Banner>
            </div>
          </>
        )}
      </section>
    </>
  )
}
