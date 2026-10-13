import type { BillingMilestone, BillingPlan, BillingRetainer } from '../../api/contract'
import { cleanMilestone, cleanRetainer, planId, redraftProblem, validateMilestones, validateRetainer } from '../../shared/billing'
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
