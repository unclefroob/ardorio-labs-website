import { Act } from '../data/Act'
import { otherWonDeals, reopenTarget } from '../data/act/deals'
import { Q } from '../data/Q'
import type { Deal } from '../data/types'
import { UI } from '../ui/store'
import { contractedCents } from './billing'
import { formatCents } from './money'

/**
 * Reopening a closed deal (contract: deal reopen). One confirmation, used by the deal page's Reopen button and by any
 * stage move on a closed deal (tryMove), says exactly what will happen before anything changes.
 */

export interface ReopenEffects { body: string; points: string[] }

/** What reopening `d` does, in words. `then` is the stage a move asked for, when reopening is part of a move. */
export function reopenEffects(d: Deal, then?: string): ReopenEffects | null {
  const t = reopenTarget(d)
  if (!t) return null
  const thenSt = then ? Q.pipeline(d.businessId).stages.find(s => s.id === then) : undefined
  const won = d.status === 'won'
  const body = `This deal is ${won ? 'won' : 'lost'}. Reopening it makes it an open deal again`
    + (thenSt && thenSt.id !== t.stage.id ? ` and then moves it to ${thenSt.name}.` : '.')
  const points: string[] = [
    t.from === 'history'
      ? `It goes back to ${t.stage.name} (${t.stage.prob}%), the stage it was in before it closed.`
      : `It goes back to ${t.stage.name} (${t.stage.prob}%), the pipeline’s last open stage, as its history doesn’t say where it was before it closed.`,
  ]
  if (thenSt && thenSt.id !== t.stage.id) {
    points.push(thenSt.won || thenSt.lost
      ? `Then you are asked to mark it ${thenSt.won ? 'won' : 'lost'} again.`
      : `Then it moves to ${thenSt.name}, with that stage’s usual checks.`)
  }
  points.push(won ? 'Its won date and won notes are cleared.' : 'Its lost reason is cleared. Tasks cancelled when it was lost stay cancelled.')
  if (won) {
    const co = Q.company(d.companyId)?.name ?? 'The company'
    const rel = Q.rel(d.companyId, d.businessId)
    const biz = Q.biz(d.businessId)?.name ?? 'this business'
    if (otherWonDeals(d).length) points.push(`${co} stays a ${biz} customer: it has another won deal.`)
    else if (rel?.status === 'Customer') points.push(`${co} is no longer a ${biz} customer; it shows as an active opportunity.`)
  }
  if (d.businessId === 'ard') {
    if (Q.canBill()) {
      const plan = Q.billingPlan(d.id)
      const c = contractedCents(plan)
      if (c !== null) points.push(`The contract (${formatCents(c)} contracted, ex GST) stays frozen. Winning it again keeps it; it changes only by a variation.`)
      if (plan?.milestones.length) points.push('Milestones and invoices already raised are kept as they are.')
      if (plan?.retainer) points.push('Its support retainer drafts no invoices while the deal is not won, and picks up again only once it is won.')
    } else {
      points.push('Any billing plan is kept as it is. A support retainer drafts no invoices while the deal is not won.')
    }
  }
  points.push('The reopen is recorded in the activity log and the audit log.')
  return { body, points }
}

/**
 * Ask, then reopen. With `then`, the move that asked continues through tryMove once the deal is open, so the stage's
 * checks and the Won and Lost dialogs run as for any other move.
 */
export function askReopen(dealId: string, then?: string, after?: (dealId: string, stageId: string) => void): void {
  const d = Q.deal(dealId)
  if (!d || d.status === 'open') return
  const fx = reopenEffects(d, then)
  if (!fx) {
    UI.toast('This pipeline has no open stage to reopen the deal to', 'bad')
    return
  }
  UI.confirm({
    title: 'Reopen deal?',
    body: fx.body,
    points: fx.points,
    confirm: 'Reopen',
    onConfirm: () => {
      const st = Act.reopenDeal(dealId)
      if (!st) {
        UI.toast('This deal could not be reopened', 'bad')
        return
      }
      if (then && then !== st.id && after) after(dealId, then)
      else UI.toast(`Deal reopened · back in ${st.name}`)
    },
  })
}
