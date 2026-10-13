import type { BillingContract, BillingMilestone, BillingPlan, BillingRetainer, BillingVariation, EngagementType } from '../../api/contract'
import { F } from '../F'
import { uid } from '../ids'
import {
  claimedRetainerDate, cleanMilestone, cleanRetainer, planId, retainerPause, redraftProblem, retainerPeriodLabel, validateContract, validateDelivered, validateMilestones, validateRetainer,
  validateVariation, approvalProblem,
} from '../../shared/billing'
import { formatCents } from '../../shared/money'
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
/**
 * Mark a milestone delivered on `day` (not in the future), or undo that with null. Only deliveredOn changes; the
 * server writes deliveredBy, so the value kept here is only a placeholder it replaces. Admins of Ardorio only.
 */
export function markDelivered(dealId: string, milestoneId: string, day: string | null): BillingResult {
  const g = guard(dealId)
  if (g) return fail(g)
  const p = Q.billingPlan(dealId)
  const cur = p?.milestones.find(m => m.id === milestoneId)
  if (!p || !cur) return fail('That milestone is no longer on this deal')
  if (day !== null) {
    const bad = validateDelivered(day, F.today())
    if (bad) return fail(bad)
  } else if (!cur.deliveredOn) return { ok: true }
  p.milestones = p.milestones.map(m => {
    if (m.id !== milestoneId) return m
    const rest: BillingMilestone = { ...m }
    delete rest.deliveredOn
    delete rest.deliveredBy
    // The API reads a missing deliveredOn as 'keep the stored date', so undoing must send an explicit null.
    return day === null ? { ...rest, deliveredOn: null } : { ...rest, deliveredOn: day, deliveredBy: m.deliveredOn === day && m.deliveredBy ? m.deliveredBy : Q.me().name }
  })
  audit(day === null ? 'Milestone delivery undone' : 'Milestone delivered', `${Q.deal(dealId)?.title ?? dealId}: ${cur.label}${day ? `, ${day}` : ''}`)
  commit()
  return { ok: true }
}

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

// ── contract ledger ──────────────────────────────────────────────────────────────────────────────
export interface ContractInput { baselineCents: number; engagementType: EngagementType; contractedOn: string; estimateAtWonCents: number }

/** Why a contract cannot be written on this deal now, or null. It is written once, on a won deal. */
function contractProblem(dealId: string, c: ContractInput): string | null {
  const g = guard(dealId)
  if (g) return g
  if (Q.deal(dealId)?.status !== 'won') return 'A contract is set when the deal is won'
  if (Q.billingPlan(dealId)?.contract) return 'This deal already has a contract. Change it with a variation.'
  return validateContract(c, F.today())
}

/**
 * Freeze the contract of a won Ardorio deal, once, and add any milestones agreed with it after the ones already
 * planned. contractedBy is written by the server (the caller's display name); the name sent here is only a placeholder it replaces.
 */
export function setContract(dealId: string, c: ContractInput, milestones: readonly BillingMilestone[] = []): BillingResult {
  const bad = contractProblem(dealId, c)
  if (bad) return fail(bad)
  const all = [...(Q.billingPlan(dealId)?.milestones ?? []), ...milestones]
  if (milestones.length) {
    const m = validateMilestones(all)
    if (m) return fail(m)
  }
  const p = plan(dealId)
  const contract: BillingContract = { baselineCents: c.baselineCents, engagementType: c.engagementType, contractedOn: c.contractedOn, contractedBy: Q.me().name, estimateAtWonCents: c.estimateAtWonCents }
  p.contract = contract
  if (milestones.length) p.milestones = all.map(cleanMilestone)
  audit('Contract set', `${Q.deal(dealId)?.title ?? dealId}: ${formatCents(c.baselineCents)} ex GST${milestones.length ? `, ${milestones.length} milestone${milestones.length === 1 ? '' : 's'}` : ''}`)
  commit()
  return { ok: true }
}

export type VariationResult = { ok: true; variation: BillingVariation } | { ok: false; error: string }

/**
 * Append a variation to the ledger, proposed or approved now. Entries are never edited or removed afterwards; a
 * mistake is corrected with another variation. createdAt/createdBy/decidedAt/decidedBy are the server's (the By keys hold
 * the caller's display name): the values sent here are placeholders it replaces.
 */
export function addVariation(dealId: string, v: Pick<BillingVariation, 'label' | 'amountCents' | 'reason'>, approve: boolean): VariationResult {
  const g = guard(dealId)
  if (g) return { ok: false, error: g }
  const p0 = Q.billingPlan(dealId)
  if (!p0?.contract) return { ok: false, error: 'Set the contract before adding a variation' }
  const bad = validateVariation(v) ?? (approve ? approvalProblem(p0, v.amountCents) : null)
  if (bad) return { ok: false, error: bad }
  const now = F.nowIso()
  const me = Q.me().name
  const entry: BillingVariation = {
    id: uid('vo'), label: v.label.trim(), amountCents: v.amountCents, reason: v.reason.trim(), status: approve ? 'approved' : 'proposed', createdAt: now, createdBy: me,
    ...(approve ? { decidedAt: now, decidedBy: me } : {}),
  }
  p0.variations = [...(p0.variations ?? []), entry]
  audit(approve ? 'Variation approved' : 'Variation proposed', `${Q.deal(dealId)?.title ?? dealId}: ${entry.label}, ${formatCents(entry.amountCents)}`)
  commit()
  return { ok: true, variation: entry }
}

/** Approve or reject a proposed variation. A decided one stays as it is. */
export function decideVariation(dealId: string, id: string, status: 'approved' | 'rejected'): VariationResult {
  const g = guard(dealId)
  if (g) return { ok: false, error: g }
  const p0 = Q.billingPlan(dealId)
  const cur = p0?.variations?.find(v => v.id === id)
  if (!p0 || !cur) return { ok: false, error: 'That variation is no longer on this deal' }
  if (cur.status !== 'proposed') return { ok: false, error: `That variation was already ${cur.status}` }
  const over = status === 'approved' ? approvalProblem(p0, cur.amountCents) : null
  if (over) return { ok: false, error: over }
  const next: BillingVariation = { ...cur, status, decidedAt: F.nowIso(), decidedBy: Q.me().name }
  p0.variations = (p0.variations ?? []).map(v => (v.id === id ? next : v))
  audit(status === 'approved' ? 'Variation approved' : 'Variation rejected', `${Q.deal(dealId)?.title ?? dealId}: ${cur.label}, ${formatCents(cur.amountCents)}`)
  commit()
  return { ok: true, variation: next }
}
