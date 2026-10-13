import type { BillingMilestone, BillingPlan, BillingRetainer } from '../../api/contract'
import { claimedRetainerDate, cleanMilestone, cleanRetainer, planId, retainerPause, redraftProblem, retainerPeriodLabel, validateMilestones, validateRetainer } from '../../shared/billing'
import { commit } from '../commit'
import { audit } from '../internals'
import { Q } from '../Q'
import { S } from '../store'

export type BillingResult = { ok: true } | { ok: false; error: string }

const fail = (error: string): BillingResult => ({ ok: false, error })

/** Billing plans are Ardorio admin business: the server refuses anyone else, so the client says so before sending. */
function guard(dealId: string): string | null {
  const d = Q.deal(dealId)
  if (!d || d.businessId !== 'ard') return 'Billing schedules are only for Ardorio deals'
  if (!Q.canAdmin('ard')) return 'Only admins of Ardorio can change a billing schedule'
  return null
}

function plan(dealId: string): BillingPlan {
  let p = Q.billingPlan(dealId)
  if (!p) {
    p = { id: planId(dealId), dealId, businessId: 'ard', milestones: [] }
    S.billingPlans.push(p)
  }
  return p
}

/** Replace the milestone list of a deal's plan (creates the plan on first save). The retainer is left alone. */
export function saveMilestones(dealId: string, milestones: readonly BillingMilestone[]): BillingResult {
  const g = guard(dealId)
  if (g) return fail(g)
  const bad = validateMilestones(milestones)
  if (bad) return fail(bad)
  plan(dealId).milestones = milestones.map(cleanMilestone)
  audit('Billing schedule saved', `${Q.deal(dealId)?.title ?? dealId}: ${milestones.length} milestone${milestones.length === 1 ? '' : 's'}`)
  commit()
  return { ok: true }
}

/** Set or clear (null) the retainer of a deal's plan. Milestones are left alone. */
export function saveRetainer(dealId: string, retainer: BillingRetainer | null): BillingResult {
  const g = guard(dealId)
  if (g) return fail(g)
  if (retainer) {
    const bad = validateRetainer(retainer) ?? redraftProblem(retainer.nextInvoiceDate, Q.billingPlan(dealId)?.retainer)
    if (bad) return fail(bad)
  } else if (!Q.billingPlan(dealId)?.retainer) return { ok: true }
  const p = plan(dealId)
  // lastDraftedFor and anchorDay belong to the server: an edit keeps whatever the plan already had, never what the form says.
  if (retainer) {
    p.retainer = cleanRetainer({ ...retainer, lastDraftedFor: p.retainer?.lastDraftedFor, anchorDay: p.retainer?.anchorDay })
  }
  else delete p.retainer
  audit('Billing retainer saved', Q.deal(dealId)?.title ?? dealId)
  commit()
  return { ok: true }
}

export type ClaimResult = { ok: true; next: string; laterDay?: number } | { ok: false; error: string }

/** Why the period the card offered can no longer be claimed by hand, or null while it still can. */
export function retainerClaimProblem(dealId: string, due: string): string | null {
  const g = guard(dealId)
  if (g) return g
  const d = Q.deal(dealId)
  const paused = d ? retainerPause(d) : null
  if (paused) return paused === 'archived' ? 'The deal is archived, so no retainer is drafted for it' : 'The deal is not won, so no retainer is drafted for it'
  const r = Q.billingPlan(dealId)?.retainer
  if (!r || r.nextInvoiceDate !== due) return 'The retainer has already moved on from that period'
  if (r.lastDraftedFor === due) return `The ${retainerPeriodLabel(due)} retainer is already being drafted automatically`
  return null
}

/**
 * A retainer invoice made by hand for the period that is due: move the plan's next invoice date on a month, the way
 * the server does after its own draft, so the scheduler does not draft the same period again. Only the period the
 * card offered is claimed, and only while it is still the plan's due date and the server has not claimed it.
 * anchorDay is left as the server stored it: the API drops a client's anchorDay, so writing one would only make the
 * local plan disagree with the server's. `laterDay` says when that moves every later date to a shorter day.
 */
export function claimRetainerPeriod(dealId: string, due: string): ClaimResult {
  const problem = retainerClaimProblem(dealId, due)
  if (problem) return { ok: false, error: problem }
  const r = Q.billingPlan(dealId)!.retainer!
  const c = claimedRetainerDate(due, r.anchorDay)
  r.nextInvoiceDate = c.next
  audit('Billing retainer period invoiced by hand', `${Q.deal(dealId)?.title ?? dealId}: ${retainerPeriodLabel(due)}, next ${c.next}`)
  commit()
  return c.laterDay ? { ok: true, next: c.next, laterDay: c.laterDay } : { ok: true, next: c.next }
}
