import { useId, useState } from 'react'
import type { RevenueReport, RevenueSourceFilter } from '../../api/contract'
import { getRevenueReport, revenueReportError } from '../../api/reports'
import { liveDeal } from '../../data/archive'
import { useLoad } from '../../data/invoicing'
import { Q } from '../../data/Q'
import { S } from '../../data/store'
import { Banner, Bars, Btn, Card, Chip, Empty, Legend, Seg } from '../../kit'
import { formatCentsTile } from '../../shared/money'
import { contractedInRange, coverageText, monthBars, monthName, pipelineCoverage, recordedLateLine, wonValueTarget } from '../../shared/revenueReport'
import { UI } from '../../ui/store'

const SOURCE_OPTS: ReadonlyArray<readonly [RevenueSourceFilter, string]> = [['all', 'All'], ['salesos', 'SalesOS'], ['external', 'External']]
const INV = 'var(--b-inv)'
const COL = 'var(--b-col)'
const R: { textAlign: 'right' } = { textAlign: 'right' }
const dollars = (v: number): string => formatCentsTile(Math.round(v * 100))

function Tile({ label, value, sub, title, describedBy, busy }: { label: string; value: string; sub?: string; title?: string; describedBy?: string; busy?: boolean }) {
  return (
    <div className="kpi static" title={title} aria-describedby={describedBy} aria-busy={busy || undefined}>
      <span className="l">{label}</span>
      <span className="v num">{value}</span>
      {sub && <span className="s">{sub}</span>}
    </div>
  )
}

/**
 * Ardorio one-off revenue for the Reports period (boards 5 and 11): bookings and contracts from the synced records,
 * invoiced and collected from GET /sales/reports/revenue. Admins of Ardorio (or super) only; the caller checks.
 * `from` and `to` are wall-clock ISO times; `period` is the Reports period key, matched against won value goals.
 */
export function ArdorioRevenue({ from, to, period, periodLabel }: { from: string; to: string; period: string; periodLabel: string }) {
  const [source, setSource] = useState<RevenueSourceFilter>('all')
  const fromDay = from.slice(0, 10)
  const toDay = to.slice(0, 10)
  const rep = useLoad(s => getRevenueReport({ from: fromDay, to: toDay, source }, s), `ard-revenue:${fromDay}:${toDay}:${source}`)
  const formulaId = useId()

  const ard = S.deals.filter(d => d.businessId === 'ard' && liveDeal(d))
  const won = ard.filter(d => d.status === 'won' && (d.closedAt ?? '') >= from && (d.closedAt ?? '') <= to)
  const wonValue = won.reduce((s, d) => s + (d.value || 0), 0)
  const weighted = ard.filter(Q.open).reduce((s, d) => s + Q.weighted(d), 0)
  const contracted = contractedInRange(S.billingPlans, ard, fromDay, toDay)
  const cov = pipelineCoverage(weighted, wonValueTarget(S.goals, period), wonValue)

  const err = rep.error ? revenueReportError(rep.error) : null
  const data: RevenueReport | null = rep.data
  const busy = !data && !err
  const money = (pick: (r: RevenueReport) => number): string => (data ? formatCentsTile(pick(data)) : busy ? '…' : '—')

  const covValue = cov.kind === 'ratio' ? coverageText(cov.ratio) : cov.kind === 'met' ? 'Goal met' : '—'
  const covSub = cov.kind === 'no-goal' ? 'Set a won value goal to see coverage' : cov.kind === 'met' ? `Won ${dollars(cov.won)} of ${dollars(cov.target)}` : `Needed: ${dollars(cov.needed)}`
  const formula = cov.kind === 'ratio'
    ? `Pipeline coverage = weighted open Ardorio pipeline (${dollars(cov.weighted)}) ÷ won value still needed to reach the goal (${dollars(cov.needed)}).`
    : 'Pipeline coverage = weighted open Ardorio pipeline ÷ (won value goal for the period − won value so far).'

  return (
    <section aria-labelledby="ard-revenue-h" style={{ marginBottom: 16 }}>
      <div className="row wrap" style={{ gap: 10, margin: '4px 0 10px', justifyContent: 'space-between' }}>
        <div>
          <h3 className="b" id="ard-revenue-h" style={{ margin: 0 }}>Ardorio revenue</h3>
          <div className="faint sm">One-off projects, counted per deal and per invoice · {periodLabel.toLowerCase()} · ex GST. No recurring revenue is shown for Ardorio.</div>
        </div>
        <Seg label="Source" value={source} onChange={v => setSource(v as RevenueSourceFilter)} opts={SOURCE_OPTS} />
      </div>
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
          <div className="grid g4" style={{ marginBottom: 6 }}>
            <Tile label="Won value" value={dollars(wonValue)} sub={`${won.length} deal${won.length === 1 ? '' : 's'} won · bookings`} />
            <Tile label="Contracted" value={formatCentsTile(contracted)} sub="Contracts and approved variations" />
            <Tile label="Invoiced" value={money(r => r.invoicedCents)} sub="By issue date" busy={busy} />
            <Tile label="Collected" value={money(r => r.collectedCents)} sub="By paid date" busy={busy} />
            <Tile label="Outstanding" value={money(r => r.outstandingCents)} sub="As of now" busy={busy} />
            <Tile label="Overdue" value={money(r => r.overdueCents)} sub="As of now" busy={busy} />
            <Tile label="Pipeline coverage" value={covValue} sub={covSub} title={formula} describedBy={formulaId} />
          </div>
          <div className="faint sm" id={formulaId} style={{ marginBottom: 12 }}>{formula}</div>
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
          {data && (
            <div className="grid g2" style={{ marginBottom: 12 }}>
              <Card title="Invoiced and collected by month" right={<Legend items={[['Invoiced', INV], ['Collected', COL]]} />}>
                {data.months.length
                  ? <Bars label="Ardorio invoiced and collected by month" grouped series={['Invoiced', 'Collected']} colors={[INV, COL]} data={monthBars(data.months)} fmt={v => dollars(v)} />
                  : <Empty icon="chart" title="No months in this range" />}
              </Card>
              <Card title="By month" right={<span className="faint xs">ex GST</span>} pad={false}>
                <table className="tbl" aria-label="Ardorio revenue by month">
                  <thead><tr><th>Month</th><th style={R}>Invoiced</th><th style={R}>Collected</th><th>Includes</th></tr></thead>
                  <tbody>
                    {data.months.map(m => (
                      <tr key={m.month}>
                        <td>{monthName(m.month)}</td>
                        <td style={R} className="money">{formatCentsTile(m.invoicedCents)}</td>
                        <td style={R} className="money">{formatCentsTile(m.collectedCents)}</td>
                        <td>
                          <span className="row wrap" style={{ gap: 4 }}>
                            {m.externalInvoicedCents > 0 && <Chip tone="info">External {formatCentsTile(m.externalInvoicedCents)} invoiced</Chip>}
                            {m.externalCollectedCents > 0 && <Chip tone="info">External {formatCentsTile(m.externalCollectedCents)} collected</Chip>}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot><tr><td className="b">Total</td><td style={R} className="money b">{formatCentsTile(data.invoicedCents)}</td><td style={R} className="money b">{formatCentsTile(data.collectedCents)}</td><td /></tr></tfoot>
                </table>
              </Card>
            </div>
          )}
          <div className="row wrap" style={{ gap: 10 }}>
            <span className="faint sm" style={{ flex: 1 }}>As recorded in SalesOS. Xero is the books. Cancelled and test invoices are left out. The Source filter shows SalesOS invoices, external records, or both; it does not change won value, contracted or coverage.</span>
            <Btn size="sm" onClick={() => UI.nav('goals')}>Goals</Btn>
            <Btn size="sm" onClick={() => UI.nav('customers')}>By customer</Btn>
          </div>
        </>
      )}
    </section>
  )
}
