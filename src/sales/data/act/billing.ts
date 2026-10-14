import type { BillingContract, BillingMilestone, BillingPlan, BillingRetainer, BillingTerm, BillingVariation, EngagementType } from '../../api/contract'
import { F } from '../F'
import { uid } from '../ids'
import {
  claimedRetainerDate, cleanMilestone, cleanRetainer, planId, retainerPause, redraftProblem, retainerPeriodLabel, validateContract, validateDelivered, validateMilestones, validateRetainer,
  validateVariation, approvalProblem,
} from '../../shared/billing'
import { formatCents } from '../../shared/money'
import { cpiProblem, endProblem, isInstalment, oneOffMilestones, validateTerm, waiveProblem, type TermInput } from '../../shared/term'
import { scheduleTotal, termSchedule } from '../../shared/termSchedule'
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
  const bad = validateMilestones(milestones) ?? instalmentsChanged(Q.billingPlan(dealId), milestones)
  if (bad) return fail(bad)
  plan(dealId).milestones = milestones.map(cleanMilestone)
  audit('Billing schedule saved', `${Q.deal(dealId)?.title ?? dealId}: ${milestones.length} milestone${milestones.length === 1 ? '' : 's'}`)
  commit()
  return { ok: true }
}

/**
 * A term agreement's instalments are set by its schedule: a client may not add, remove or re-price one (the API answers
 * 400), so a milestone list that changes them is refused here. Null when they are exactly as stored.
 */
function instalmentsChanged(p: BillingPlan | undefined, next: readonly BillingMilestone[]): string | null {
  const key = (m: BillingMilestone): string => JSON.stringify([m.id, m.label, m.amountCents, m.plannedDate ?? '', m.termYear ?? null, m.periodStart ?? '', m.periodEnd ?? ''])
  const was = (p?.milestones ?? []).filter(isInstalment).map(key)
  const now = next.filter(isInstalment).map(key)
  if (was.length === now.length && was.every((k, i) => k === now[i])) return null
  return 'The instalments of a term agreement follow its schedule and cannot be added, removed or changed here'
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
  if (isInstalment(cur)) return fail('An instalment is earned when it is invoiced, so it is never marked delivered')
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
  if (c.engagementType === 'term-agreement') return fail('A term agreement is set together with its term and schedule')
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
  const bad = validateVariation(v, p0.contract.engagementType) ?? (approve ? approvalProblem(p0, v.amountCents) : null)
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

// ── term agreements ──────────────────────────────────────────────────────────────────────────────
export type TermContractInput = Omit<ContractInput, 'engagementType'>

/** What a term agreement's contract must be: the one-off milestones (those planned already and the build fee) plus the schedule. */
export function termBaseline(dealId: string, term: Pick<BillingTerm, 'startDate' | 'termMonths' | 'annualCents' | 'frequency' | 'timing' | 'escalation' | 'escalationBp'>, buildFee: readonly BillingMilestone[] = []): number {
  return scheduleTotal(oneOffMilestones(Q.billingPlan(dealId))) + scheduleTotal(buildFee) + scheduleTotal(termSchedule(term))
}

/**
 * Freeze the contract of a won Ardorio deal as a term agreement, once, with its term, the one-off milestones agreed
 * with it (a build fee, say) after the ones already planned, and the instalments of termSchedule. The rules are those
 * of setContract; the baseline must be the one-off milestones plus the schedule total. The server rebuilds the
 * instalments from the term and stamps draftFrom and contractedBy: the values written here are what it will store.
 */
export function setTermAgreement(dealId: string, c: TermContractInput, term: TermInput, buildFee: readonly BillingMilestone[] = []): BillingResult {
  const input: ContractInput = { ...c, engagementType: 'term-agreement' }
  const bad = contractProblem(dealId, input) ?? validateTerm(term)
  if (bad) return fail(bad)
  if (buildFee.some(isInstalment)) return fail('A build fee is a one-off milestone, not an instalment')
  const oneOffs = [...oneOffMilestones(Q.billingPlan(dealId)), ...buildFee]
  const schedule = termSchedule(term)
  const all = [...oneOffs, ...schedule]
  const m = validateMilestones(all)
  if (m) return fail(m)
  const expected = scheduleTotal(oneOffs) + scheduleTotal(schedule)
  if (c.baselineCents !== expected) return fail(`The contract must be the one-off milestones plus the schedule: ${formatCents(expected)} ex GST`)
  const p = plan(dealId)
  p.contract = { baselineCents: c.baselineCents, engagementType: 'term-agreement', contractedOn: c.contractedOn, contractedBy: Q.me().name, estimateAtWonCents: c.estimateAtWonCents }
  p.term = { ...pickTerm(term), draftFrom: F.today() }
  p.milestones = all.map(cleanMilestone)
  audit('Term agreement set', `${Q.deal(dealId)?.title ?? dealId}: ${formatCents(c.baselineCents)} ex GST, ${schedule.length} instalment${schedule.length === 1 ? '' : 's'}${buildFee.length ? `, ${buildFee.length} one-off milestone${buildFee.length === 1 ? '' : 's'}` : ''}`)
  commit()
  return { ok: true }
}

/** Only the keys of a term a person sets, so nothing else from a form rides along. */
function pickTerm(t: TermInput): TermInput {
  return {
    startDate: t.startDate, termMonths: t.termMonths, annualCents: t.annualCents, frequency: t.frequency, timing: t.timing,
    escalation: t.escalation, escalationBp: t.escalationBp, exit: t.exit, breakNoticeDays: t.breakNoticeDays, autoDraft: t.autoDraft,
  }
}

function termOf(dealId: string): { p: BillingPlan & { term: BillingTerm } } | { error: string } {
  const g = guard(dealId)
  if (g) return { error: g }
  const p = Q.billingPlan(dealId)
  if (!p?.term) return { error: 'This deal has no term agreement' }
  // The server refuses any change to the term of a deal that is not won.
  if (Q.deal(dealId)?.status !== 'won') return { error: 'This deal is not won: win it again before changing its term agreement' }
  return { p: p as BillingPlan & { term: BillingTerm } }
}

/**
 * Confirm the CPI rise of one year. Only the confirmation is written: the server stamps who and when, re-prices the
 * instalments of that year and later that have no issued invoice (their drafts follow), and appends one approved
 * variation for the difference. A client may not re-price instalments itself, so the schedule here changes when the
 * server's answer arrives.
 */
export function confirmCpi(dealId: string, year: number, bp: number): BillingResult {
  const r = termOf(dealId)
  if ('error' in r) return fail(r.error)
  const bad = cpiProblem(r.p.term, year, bp)
  if (bad) return fail(bad)
  r.p.term = { ...r.p.term, cpiConfirmed: [...(r.p.term.cpiConfirmed ?? []), { year, bp, confirmedOn: F.today(), confirmedBy: Q.me().name }] }
  audit('Term CPI confirmed', `${Q.deal(dealId)?.title ?? dealId}: year ${year}, ${bp / 100}%`)
  commit()
  return { ok: true }
}

/**
 * End a term agreement early, once; it cannot be undone. Only the end is written: the server stamps who and when,
 * removes the un-issued instalments from the end date on, cuts one that spans it to end the day before, makes their
 * drafts follow, and appends one approved variation of minus what was removed. Nothing is added to the schedule after
 * that; what remains is still drafted while auto-draft is on. Issued instalments are kept; refunds or credits stay manual.
 */
export function endTermEarly(dealId: string, endedOn: string, reason: string): BillingResult {
  const r = termOf(dealId)
  if ('error' in r) return fail(r.error)
  const bad = endProblem(r.p.term, endedOn, reason)
  if (bad) return fail(bad)
  r.p.term = { ...r.p.term, ended: { endedOn, reason: reason.trim(), endedBy: Q.me().name, recordedAt: F.nowIso() } }
  audit('Term agreement ended early', `${Q.deal(dealId)?.title ?? dealId}: ends ${endedOn}`)
  commit()
  return { ok: true }
}

/**
 * Turn automatic drafting of instalment invoices on or off. The only setting of a stored term a person may change; on an
 * ended agreement it drafts the instalments that remain.
 */
export function setTermAutoDraft(dealId: string, on: boolean): BillingResult {
  const r = termOf(dealId)
  if ('error' in r) return fail(r.error)
  if (r.p.term.autoDraft === on) return { ok: true }
  r.p.term = { ...r.p.term, autoDraft: on }
  audit(on ? 'Term auto-draft on' : 'Term auto-draft off', Q.deal(dealId)?.title ?? dealId)
  commit()
  return { ok: true }
}

/**
 * Waive one instalment the client will not be billed for; it cannot be undone. Only the waiver is written: the server
 * stamps who and when, refuses an instalment with an issued invoice, removes the instalment, deletes (or unlinks) its
 * drafts and appends one approved variation of minus its amount ('Waived: <label>'). Ended agreements too. The caller
 * checks the deal's invoices first (waiveProblem): this layer has none, so here only the instalment and reason are.
 */
export function waiveInstalment(dealId: string, milestoneId: string, reason: string): BillingResult {
  const r = termOf(dealId)
  if ('error' in r) return fail(r.error)
  const bad = waiveProblem(r.p, milestoneId, reason, [])
  if (bad) return fail(bad)
  const label = r.p.milestones.find(m => m.id === milestoneId)?.label ?? milestoneId
  r.p.term = { ...r.p.term, waived: [...(r.p.term.waived ?? []), { milestoneId, reason: reason.trim(), waivedOn: F.today(), waivedBy: Q.me().name }] }
  audit('Term instalment waived', `${Q.deal(dealId)?.title ?? dealId}: ${label}`)
  commit()
  return { ok: true }
}
