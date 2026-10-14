import type { Activity } from './types'

/**
 * Activities logged in error (contract: "Meeting lifecycle and activity voiding").
 *
 * Activities are append-only. The one change an existing activity may take is the void: it gains voided: true,
 * voidedAt, voidedBy (the server writes the name) and voidReason (plain text, 1 to 300 characters). Its actor or a
 * manager+ of its business may void it, and once voided it never changes again.
 *
 * A voided activity stays in every timeline, struck through with its reason, and counts nowhere: not in goals,
 * reports, the dashboard, sequence stats, the engagement score, timeline totals or last-activity dates.
 */

export const VOID_REASON_MAX = 300

export const isVoided = (a: Pick<Activity, 'voided'>): boolean => a.voided === true

/** Activities still standing (not logged in error). */
export const standingActs = <T extends Activity>(acts: readonly T[]): T[] => acts.filter(a => !isVoided(a))
