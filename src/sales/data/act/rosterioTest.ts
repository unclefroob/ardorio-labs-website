import type { RosterioAccount } from '../../api/contract'
import { MAX_ROSTERIO_TEST_ACCOUNTS } from '../../api/contract'
import { commit } from '../commit'
import { audit } from '../internals'
import { Q } from '../Q'
import { S } from '../store'
import { canMarkTest, MARK_TEST_DENIED, TEST_LIMIT_MESSAGE, testAccounts, testEntryFor, testReasonProblem, type TestMarkResult } from '../rosterioTest'

/** Mark a Rosterio account as a test account. Nothing changes in Rosterio; SalesOS stops counting it as a customer. */
export function markTestAccount(account: Pick<RosterioAccount, 'id' | 'name'>, reason: string): TestMarkResult {
  if (!canMarkTest()) return { ok: false, message: MARK_TEST_DENIED }
  const problem = testReasonProblem(reason)
  if (problem) return { ok: false, message: problem }
  const list = testAccounts()
  if (list.some(a => a.accountId === account.id)) return { ok: true }
  if (list.length >= MAX_ROSTERIO_TEST_ACCOUNTS) return { ok: false, message: TEST_LIMIT_MESSAGE }
  S.rosterioTest.accounts = [...list, testEntryFor(account, reason, Q.me().name, new Date().toISOString())]
  audit('Rosterio test account marked', account.name)
  commit()
  return { ok: true }
}

/** Count the account as a customer again. */
export function unmarkTestAccount(accountId: string): TestMarkResult {
  if (!canMarkTest()) return { ok: false, message: MARK_TEST_DENIED }
  const list = testAccounts()
  const gone = list.find(a => a.accountId === accountId)
  if (!gone) return { ok: true }
  S.rosterioTest.accounts = list.filter(a => a.accountId !== accountId)
  audit('Rosterio test account unmarked', gone.name)
  commit()
  return { ok: true }
}
