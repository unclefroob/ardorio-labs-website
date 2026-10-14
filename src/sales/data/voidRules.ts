import { F } from './F'
import { Q } from './Q'
import { S } from './store'
import type { Activity } from './types'
import { isVoided } from './voided'

/** Who may void an activity: the person who logged it (with edit access), or a manager+ of its business. The server enforces the same. */
export function canVoidActivity(a: Pick<Activity, 'actorId' | 'businessId' | 'voided'>): boolean {
  if (isVoided(a)) return false
  if (Q.canManage(a.businessId)) return true
  return a.actorId === S.session.userId && Q.canEdit(a.businessId)
}

/** "Logged in error by Priya on 14 Oct 2026: reason", with what the record says. voidedBy arrives once the server has it. */
export function voidedLine(a: Pick<Activity, 'voidedAt' | 'voidedBy' | 'voidReason'>): string {
  return 'Logged in error' + (a.voidedBy ? ` by ${a.voidedBy}` : '') + (a.voidedAt ? ` on ${F.date(a.voidedAt)}` : '') + (a.voidReason ? `: ${a.voidReason}` : '')
}
