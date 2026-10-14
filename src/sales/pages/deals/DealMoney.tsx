import { useState } from 'react'
import type { BillingPlan, InvoiceDto } from '../../api/contract'
import type { Deal } from '../../data/types'
import { Banner, Btn, Card, Chip, Skel } from '../../kit'
import { bulletPct, bulletScale, estimateChanged, moneyForDeal, overdueProjectCents, quotedCents, type DealMoney } from '../../shared/billing'
import { formatCents } from '../../shared/money'
import { termCommitment } from '../../shared/termMoney'
import { fmtDay } from '../../shared/invoices'
import { F } from '../../data/F'
import { UI } from '../../ui/store'

const fmt = formatCents

/** What the bars are measured against: the contract, or the estimate on a deal that has none yet. */
export function moneyTarget(deal: Pick<Deal, 'value'>, m: DealMoney): { cents: number; word: string; label: string } {
  return m.contracted !== null
    ? { cents: m.contracted, word: 'contracted', label: 'Contracted' }
    : { cents: quotedCents(deal), word: 'estimated, no contract recorded', label: 'Estimate' }
}

const addVariation = (dealId: string): void => UI.open('addVariation', { dealId })

/**
 * Board 4 warnings that sit above the money: more invoiced than contracted, and an estimate edited after Won. Neither
 * blocks anything; each says what to do next. Over-scheduled milestones are warned about under the milestones.
 */
export function MoneyWarnings({ deal, plan, money }: { deal: Deal; plan: BillingPlan | undefined; money: DealMoney | null }) {
  const [kept, setKept] = useState(() => keptEstimate(deal.id))
  const contract = plan?.contract
  const est = quotedCents(deal)
  const showEstimate = !!contract && estimateChanged(deal, plan) && kept !== est
  const over = money && money.overBilled !== null && money.overBilled > 0 && money.contracted !== null
  if (!over && !showEstimate) return null
  return (
    <div className="col" style={{ gap: 10 }}>
      {over && money && (
        <Banner tone="bad" action={<Btn size="sm" onClick={() => addVariation(deal.id)}>Add variation</Btn>}>
          <span className="sm"><b>Invoiced {fmt(money.invoiced)} exceeds contracted {fmt(money.contracted ?? 0)}.</b> Approve a variation or credit the difference.</span>
        </Banner>
      )}
      {showEstimate && contract && (
        <Banner
          tone="info"
          action={
            <span className="row" style={{ gap: 6 }}>
              <Btn size="sm" kind="pri" onClick={() => addVariation(deal.id)}>Add variation</Btn>
              <Btn size="sm" kind="ghost" onClick={() => { keepEstimate(deal.id, est); setKept(est) }}>Keep as is</Btn>
            </span>
          }
        >
          <span className="sm">
            <b>The estimate changed to {fmt(est)} after Won.</b> Billing still uses the contract, {fmt(money?.contracted ?? contract.baselineCents)}.{' '}
            <span className="muted">Changing the estimate never changes the contract. To change what you can bill, add a variation.</span>
          </span>
        </Banner>
      )}
    </div>
  )
}

// "Keep as is" hides the estimate banner for this viewer until the estimate changes again. A convenience only: the
// chip on the money card stays, and losing it (private window, cleared storage) just shows the banner again.
const KEPT = (dealId: string): string => `sos.estimateKept.${dealId}`
function keptEstimate(dealId: string): number | null {
  try {
    const v = localStorage.getItem(KEPT(dealId))
    return v === null ? null : Number(v)
  } catch { return null }
}
function keepEstimate(dealId: string, cents: number): void {
  try { localStorage.setItem(KEPT(dealId), String(cents)) } catch { /* the banner just comes back */ }
}

/**
 * Board 2 "Project money": a bullet chart of earned, invoiced and collected against the contracted marker, and the
 * five figures written out beside it, so nothing rests on colour. Retainer invoices are left out: they have their own
 * card. Bars are never capped, so an overrun past the contract stays visible.
 */
export function ProjectMoney({ deal, plan, invoices, loading }: { deal: Deal; plan: BillingPlan | undefined; invoices: readonly InvoiceDto[] | null; loading: boolean }) {
  const contract = plan?.contract
  const changed = estimateChanged(deal, plan)
  const right = (
    <span className="row wrap" style={{ gap: 10 }}>
      <span className="sm muted">ex GST · as recorded in SalesOS</span>
      {changed && <Chip tone="warn" title="The estimate no longer matches the contract">Estimate on the deal: {fmt(quotedCents(deal))} (changed after Won)</Chip>}
    </span>
  )
  if (!invoices) {
    return (
      <Card title="Project money" right={right}>
        {loading ? <Skel rows={3} /> : <div className="sm muted">Invoiced, collected and outstanding show once the deal's invoices load.</div>}
      </Card>
    )
  }
  const m = moneyForDeal(deal, plan, invoices)
  const t = moneyTarget(deal, m)
  const overdue = overdueProjectCents(deal.id, plan, invoices)
  // A break agreement: what the client may still break before is shown under Contracted, which stays the denominator.
  const commit = m.contracted !== null ? termCommitment(plan, m.contracted, invoices, F.today()) : null
  const scale = bulletScale([t.cents, m.earned, m.invoiced, m.collected])
  const over = contract ? m.invoiced > t.cents : false
  const bars = [
    { label: 'Earned', v: m.earned, color: 'var(--b-earned)' },
    { label: 'Invoiced', v: m.invoiced, color: over ? 'var(--bad2)' : 'var(--b-inv)' },
    { label: 'Collected', v: m.collected, color: 'var(--b-col)' },
  ]
  return (
    <Card title="Project money" right={right}>
      <div className="col" style={{ gap: 12 }}>
        <div className="row wrap" aria-hidden="true" style={{ gap: 14 }}>
          <span className="key"><i style={{ background: 'var(--b-earned)' }} />Earned</span>
          <span className="key"><i style={{ background: 'var(--b-inv)' }} />Invoiced</span>
          <span className="key"><i style={{ background: 'var(--b-col)' }} />Collected</span>
          <span className="key"><i style={{ background: 'var(--fg)', width: 3 }} />{t.label}</span>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24 }}>
          <div className="col" style={{ flex: '2 1 420px', minWidth: 0, gap: 10 }}>
            {bars.map(b => (
              <div key={b.label} className="bul" role="img" aria-label={`${b.label} ${fmt(b.v)} of ${fmt(t.cents)} ${t.word}`} data-bar={b.label}>
                <span className="lab">{b.label}</span>
                <div className="bt">
                  <i style={{ width: bulletPct(b.v, scale), background: b.color }} />
                  <b style={{ left: bulletPct(t.cents, scale) }} />
                </div>
                <span className="val">{fmt(b.v)}</span>
              </div>
            ))}
            <div className="sm muted">
              The tall marker is the {contract ? 'contracted amount' : 'estimate: no contract is recorded yet'}. Earned counts delivered milestones{plan?.term ? ' and instalments with an issued invoice; a draft is not earned until it is issued' : ''}.
              {m.retainerInvoiced > 0 && ` Support retainer invoices (${fmt(m.retainerInvoiced)}) are not counted here.`}
            </div>
          </div>
          <div className="money-figs" style={{ flex: '1 1 280px' }} aria-label="Project money figures" role="group">
            <Fig label={contract ? 'Contracted' : 'Estimate (no contract)'} v={t.cents} sub={commit && commit.breakAt ? `${formatCents(commit.committed)} committed; ${formatCents(commit.notCommitted)} not yet committed, break at ${fmtDay(commit.breakAt)}` : undefined} />
            <Fig label="Earned" v={m.earned} />
            <Fig label="Invoiced" v={m.invoiced} />
            <Fig label="Collected" v={m.collected} />
            <Fig label="Outstanding" sub={`invoiced, not yet paid · ${overdue > 0 ? `${fmt(overdue)} overdue` : 'none overdue'}`} v={m.outstanding} wide />
          </div>
        </div>
      </div>
    </Card>
  )
}

function Fig({ label, v, sub, wide }: { label: string; v: number; sub?: string; wide?: boolean }) {
  return (
    <div className={'kpi static' + (wide ? ' wide' : '')} data-fig={label}>
      <span className="v money">{fmt(v)}</span>
      <span className="l">{label}{sub ? ` (${sub})` : ''}</span>
    </div>
  )
}
