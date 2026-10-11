import type { RosterioAccount, RosterioLink } from '../api/contract'
import type { Company } from '../data/types'
import { domOf, norm } from './constants'
import { similarCompanies } from './companyMatch'

const FREE_MAIL = new Set([
  'gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com', 'msn.com', 'yahoo.com', 'yahoo.com.au', 'ymail.com', 'icloud.com', 'me.com',
  'bigpond.com', 'bigpond.net.au', 'optusnet.com.au', 'optusnet.com', 'tpg.com.au', 'iinet.net.au', 'aol.com', 'proton.me', 'protonmail.com',
])

/** The part after the @, lower case, or ''. */
export function emailDomain(email: string | null | undefined): string {
  const m = /^[^\s@]+@([^\s@]+\.[^\s@]+)$/.exec((email ?? '').trim().toLowerCase())
  return m ? m[1] : ''
}

export const isFreeMail = (domain: string): boolean => FREE_MAIL.has(domain.toLowerCase())

/** The billing email's domain when it is a business domain; '' for a personal mailbox or no email. */
export function businessDomain(email: string | null | undefined): string {
  const d = emailDomain(email)
  return d && !isFreeMail(d) ? d : ''
}

export type MatchReason = 'domain' | 'name' | 'similar'
export type AccountMatch =
  | { kind: 'linked'; company: Company }
  | { kind: 'suggested'; company: Company; reason: MatchReason; others: Company[] }
  | { kind: 'none'; why: 'free-mail' | 'no-email' | 'no-similar' }

const sameDomain = (a: string, b: string): boolean => !!a && !!b && domOf(a) === domOf(b)

/**
 * One answer per account. Order: an account id already saved on a company; the billing-email domain equal to the company
 * domain; the same name; a similar name. Suggestions only: nothing here may be applied without a click. Archived companies and
 * companies already linked to a different account are never suggested, and an account the person said "Not it" to is left alone.
 */
export function matchAccounts(
  accounts: readonly RosterioAccount[],
  companies: readonly Company[],
  opts: { linkOf: (c: Company) => RosterioLink | undefined; dismissed?: ReadonlySet<string> },
): Map<string, AccountMatch> {
  const out = new Map<string, AccountMatch>()
  const byAccount = new Map<string, Company>()
  for (const c of companies) {
    const id = opts.linkOf(c)?.accountId
    if (id && !byAccount.has(id)) byAccount.set(id, c)
  }
  const free = companies.filter(c => !c.archived && !opts.linkOf(c)?.accountId)
  for (const a of accounts) {
    const linked = byAccount.get(a.id)
    if (linked) { out.set(a.id, { kind: 'linked', company: linked }); continue }
    const dom = businessDomain(a.billingEmail)
    const why = !a.billingEmail ? 'no-email' : dom ? 'no-similar' : 'free-mail'
    if (opts.dismissed?.has(a.id)) { out.set(a.id, { kind: 'none', why }); continue }
    const byDomain = dom ? free.filter(c => sameDomain(c.domain, dom)) : []
    const exact = free.filter(c => norm(c.name) === norm(a.name) && !byDomain.includes(c))
    const similar = similarCompanies(a.name, '', free).filter(c => !byDomain.includes(c) && !exact.includes(c))
    const ranked: Array<[Company, MatchReason]> = [
      ...byDomain.map<[Company, MatchReason]>(c => [c, 'domain']),
      ...exact.map<[Company, MatchReason]>(c => [c, 'name']),
      ...similar.map<[Company, MatchReason]>(c => [c, 'similar']),
    ]
    if (!ranked.length) { out.set(a.id, { kind: 'none', why }); continue }
    const [company, reason] = ranked[0]
    out.set(a.id, { kind: 'suggested', company, reason, others: ranked.slice(1, 4).map(r => r[0]) })
  }
  return out
}

/** The best unlinked account for one company, for the company page. */
export function accountForCompany(
  company: Company,
  accounts: readonly RosterioAccount[],
  opts: { linkOf: (c: Company) => RosterioLink | undefined; dismissed?: ReadonlySet<string>; takenIds: ReadonlySet<string> },
): { account: RosterioAccount; reason: MatchReason } | null {
  if (company.archived || opts.linkOf(company)?.accountId) return null
  let best: { account: RosterioAccount; reason: MatchReason; rank: number } | null = null
  for (const a of accounts) {
    if (opts.takenIds.has(a.id) || opts.dismissed?.has(a.id)) continue
    const bd = businessDomain(a.billingEmail)
    let reason: MatchReason | null = null
    let rank = 9
    if (bd && sameDomain(company.domain, bd)) { reason = 'domain'; rank = 0 }
    else if (norm(company.name) === norm(a.name)) { reason = 'name'; rank = 1 }
    else if (similarCompanies(a.name, '', [company]).length) { reason = 'similar'; rank = 2 }
    if (reason && (!best || rank < best.rank)) best = { account: a, reason, rank }
  }
  return best ? { account: best.account, reason: best.reason } : null
}

export const REASON_TEXT: Record<MatchReason, string> = {
  domain: 'Same email domain as the company website',
  name: 'Same name',
  similar: 'Similar name only. Check before linking.',
}
