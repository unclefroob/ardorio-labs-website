import { commit } from '../commit'
import { F } from '../F'
import { audit, CONTACT_TOUCH } from '../internals'
import { Q } from '../Q'
import { idx, S } from '../store'
import type { Activity } from '../types'
import { canVoidActivity } from '../voidRules'
import { isVoided, VOID_REASON_MAX } from '../voided'

export type VoidResult = { ok: true } | { ok: false; reason: 'missing' | 'reason_required' | 'reason_too_long' | 'already_voided' | 'not_allowed' }

const latest = (acts: readonly Activity[]): string | undefined => acts.reduce<string | undefined>((m, x) => (!m || x.ts > m ? x.ts : m), undefined)

/**
 * The rolled-up "last activity" dates that this activity set are worked out again without it. Only a date equal to
 * the voided activity's own time is touched, and only when another standing activity can take its place (a deal falls
 * back to when it was created), so dates written by anything else are left as they are.
 */
function rollBack(a: Activity): void {
  const standing = S.activities.filter(x => x.id !== a.id && !isVoided(x) && x.businessId === a.businessId)
  if (a.dealId) {
    const d = idx.deals.get(a.dealId)
    if (d && d.lastActivity === a.ts) {
      const next = latest(standing.filter(x => x.dealId === d.id))
      d.lastActivity = next && next > d.createdAt ? next : d.createdAt
    }
  }
  if (a.contactId) {
    const r = Q.crel(a.contactId, a.businessId)
    const next = latest(standing.filter(x => x.contactId === a.contactId))
    if (r && r.lastActivity === a.ts && next) r.lastActivity = next
  }
  if (a.companyId && CONTACT_TOUCH.includes(a.type)) {
    const r = Q.rel(a.companyId, a.businessId)
    const next = latest(standing.filter(x => x.companyId === a.companyId && CONTACT_TOUCH.includes(x.type)))
    if (r && r.lastContacted === a.ts && next) r.lastContacted = next
  }
}

/**
 * Mark an activity as logged in error (contract: activity void). It gains voided, voidedAt and voidReason; voidedBy
 * is the server's (the caller's display name), so the browser never writes it. The activity itself is never edited
 * or removed, and a voided one cannot be voided again or un-voided.
 */
export function voidActivity(id: string, reason: string): VoidResult {
  const a = idx.activities.get(id)
  if (!a) return { ok: false, reason: 'missing' }
  if (isVoided(a)) return { ok: false, reason: 'already_voided' }
  if (!canVoidActivity(a)) return { ok: false, reason: 'not_allowed' }
  const r = reason.trim()
  if (!r) return { ok: false, reason: 'reason_required' }
  if (r.length > VOID_REASON_MAX) return { ok: false, reason: 'reason_too_long' }
  a.voided = true
  a.voidedAt = F.nowIso()
  a.voidReason = r
  rollBack(a)
  audit('Activity voided', `${a.subject ?? a.type}: ${r}`)
  commit()
  return { ok: true }
}
