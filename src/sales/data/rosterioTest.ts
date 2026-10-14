import type { RosterioAccount, RosterioTestAccount } from '../api/contract'
import { MAX_ROSTERIO_TEST_ACCOUNTS } from '../api/contract'
import { Q } from './Q'
import { S } from './store'

/**
 * Rosterio test accounts (contract: "Rosterio test accounts"), kept in settings/rosterioTest. A marked account stays in
 * Rosterio unchanged; SalesOS shows it on its own tab and leaves it out of every customer count and revenue figure.
 * markedBy/markedAt are the server's: the browser fills them in only so the row reads right until the write comes back.
 */

export const TEST_REASON_MAX = 300
export const TEST_NAME_MAX = 200
export const DEFAULT_TEST_REASON = 'App Store review account'

const isEntry = (x: unknown): x is RosterioTestAccount => {
  const o = x as Partial<RosterioTestAccount> | null
  return !!o && typeof o === 'object' && typeof o.accountId === 'string' && !!o.accountId
}

/** The marked accounts. A record with no list yet (a server older than this client) has none. */
export function testAccounts(): RosterioTestAccount[] {
  const v = S.rosterioTest.accounts
  return Array.isArray(v) ? v.filter(isEntry) : []
}

export const testAccountIds = (): Set<string> => new Set(testAccounts().map(a => a.accountId))
export const testAccountOf = (accountId: string): RosterioTestAccount | undefined => testAccounts().find(a => a.accountId === accountId)

/** Marking moves Rosterio's customer and revenue figures, so it is a ros admin's call (or a super user's). */
export const canMarkTest = (): boolean => Q.canAdmin('ros')
export const MARK_TEST_DENIED = 'Only a Rosterio admin can change test accounts'

export function testReasonProblem(reason: string): string | null {
  return reason.trim().length > TEST_REASON_MAX ? `Keep the reason to ${TEST_REASON_MAX} characters or fewer` : null
}

export type TestMarkResult = { ok: true } | { ok: false; message: string }

/** The entry written for an account: its name as it is now, and the reason trimmed. */
export function testEntryFor(account: Pick<RosterioAccount, 'id' | 'name'>, reason: string, by: string, at: string): RosterioTestAccount {
  const name = account.name.trim().slice(0, TEST_NAME_MAX) || account.id
  return { accountId: account.id, name, reason: reason.trim(), markedBy: by, markedAt: at }
}

export const TEST_LIMIT_MESSAGE = `At most ${MAX_ROSTERIO_TEST_ACCOUNTS} accounts can be test accounts`
