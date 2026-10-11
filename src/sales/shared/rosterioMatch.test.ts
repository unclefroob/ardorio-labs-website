import { describe, expect, it } from 'vitest'
import type { RosterioAccount, RosterioLink } from '../api/contract'
import type { Company } from '../data/types'
import { accountForCompany, businessDomain, emailDomain, isFreeMail, matchAccounts } from './rosterioMatch'

const co = (id: string, name: string, over: Record<string, unknown> = {}): Company => ({ id, name, domain: '', archived: false, ...over }) as unknown as Company
const acct = (id: string, name: string, billingEmail?: string): RosterioAccount => ({ id, name, isActive: true, isTrial: false, memberCount: 3, billingEmail })
const linkOf = (c: Company): RosterioLink | undefined => (c as unknown as { rosterio?: RosterioLink }).rosterio
const opts = { linkOf }

describe('billing email domains', () => {
  it('reads the domain and ignores anything that is not an email', () => {
    expect(emailDomain('Ap@Harbour.example')).toBe('harbour.example')
    expect(emailDomain('not an email')).toBe('')
    expect(emailDomain(undefined)).toBe('')
  })
  it('treats personal mailboxes as no business domain', () => {
    expect(isFreeMail('gmail.com')).toBe(true)
    expect(isFreeMail('bigpond.net.au')).toBe(true)
    expect(businessDomain('owner@gmail.com')).toBe('')
    expect(businessDomain('owner@optusnet.com.au')).toBe('')
    expect(businessDomain('ap@harbour.example')).toBe('harbour.example')
  })
})

describe('matchAccounts', () => {
  it('an account id already saved on a company is linked, whatever else matches', () => {
    const linked = co('c1', 'Totally Different', { rosterio: { state: 'provisioned', accountId: 'a1' } })
    const m = matchAccounts([acct('a1', 'Harbour Retail Group', 'ap@harbour.example')], [linked, co('c2', 'Harbour Retail Group', { domain: 'harbour.example' })], opts)
    expect(m.get('a1')).toMatchObject({ kind: 'linked', company: { id: 'c1' } })
  })

  it('suggests by billing-email domain first, then same name, then similar name', () => {
    const companies = [
      co('byName', 'Harbour Retail Group'),
      co('byDomain', 'HRG Holdings', { domain: 'harbour.example' }),
      co('similar', 'Harbour Retail Grp Co'),
    ]
    const m = matchAccounts([acct('a1', 'Harbour Retail Group', 'ap@harbour.example')], companies, opts).get('a1')
    expect(m).toMatchObject({ kind: 'suggested', reason: 'domain', company: { id: 'byDomain' } })
    expect(m?.kind === 'suggested' && m.others.map(c => c.id)).toEqual(['byName', 'similar'])
  })

  it('suggests an exact name when the email gives nothing, and a similar name as a weaker reason', () => {
    const exact = matchAccounts([acct('a1', 'Bayside Cafe')], [co('c1', 'Bayside Cafe')], opts).get('a1')
    expect(exact).toMatchObject({ kind: 'suggested', reason: 'name' })
    const near = matchAccounts([acct('a2', 'Willow & Pine Bakery')], [co('c2', 'Willow Pine Bakery Pty Ltd')], opts).get('a2')
    expect(near).toMatchObject({ kind: 'suggested', reason: 'similar' })
  })

  it('never matches a personal-email domain against a company domain', () => {
    const m = matchAccounts([acct('a1', 'Zed Holdings', 'zed@gmail.com')], [co('c1', 'Other Co', { domain: 'gmail.com' })], opts).get('a1')
    expect(m).toEqual({ kind: 'none', why: 'free-mail' })
  })

  it('skips archived companies and companies linked to a different account', () => {
    const companies = [
      co('arch', 'Bayside Cafe', { archived: true }),
      co('taken', 'Bayside Cafe', { rosterio: { state: 'provisioned', accountId: 'other' } }),
    ]
    expect(matchAccounts([acct('a1', 'Bayside Cafe')], companies, opts).get('a1')).toEqual({ kind: 'none', why: 'no-email' })
  })

  it('leaves an account alone once the person said Not it, but still lets them link by hand', () => {
    const m = matchAccounts([acct('a1', 'Bayside Cafe', 'a@bayside.example')], [co('c1', 'Bayside Cafe')], { ...opts, dismissed: new Set(['a1']) }).get('a1')
    expect(m).toEqual({ kind: 'none', why: 'no-similar' })
  })

  it('reports why there is no match', () => {
    const m = matchAccounts([acct('a1', 'Zzz Unique Name', 'a@zzz.example'), acct('a2', 'Qqq Unique', undefined)], [co('c1', 'Something Else')], opts)
    expect(m.get('a1')).toEqual({ kind: 'none', why: 'no-similar' })
    expect(m.get('a2')).toEqual({ kind: 'none', why: 'no-email' })
  })

  it('does not choose between two companies on its own: the first is the suggestion and the rest are alternatives', () => {
    const m = matchAccounts([acct('a1', 'Harbour Retail', 'a@h.example')], [co('c1', 'One', { domain: 'h.example' }), co('c2', 'Two', { domain: 'h.example' })], opts).get('a1')
    expect(m?.kind === 'suggested' && m.others).toHaveLength(1)
  })
})

describe('accountForCompany', () => {
  const accounts = [acct('a1', 'Kestrel Logistics', 'f@kestrel.example'), acct('a2', 'Kestrel Logistic')]
  it('picks the strongest reason and skips taken or dismissed accounts', () => {
    const c = co('c1', 'Kestrel Logistics', { domain: 'kestrel.example' })
    expect(accountForCompany(c, accounts, { ...opts, takenIds: new Set() })).toMatchObject({ account: { id: 'a1' }, reason: 'domain' })
    expect(accountForCompany(c, accounts, { ...opts, takenIds: new Set(['a1']) })?.account.id).toBe('a2')
    expect(accountForCompany(c, accounts, { ...opts, takenIds: new Set(), dismissed: new Set(['a1', 'a2']) })).toBeNull()
  })
  it('gives nothing for a company that is already linked or archived', () => {
    expect(accountForCompany(co('c1', 'Kestrel Logistics', { rosterio: { state: 'provisioned', accountId: 'x' } }), accounts, { ...opts, takenIds: new Set() })).toBeNull()
    expect(accountForCompany(co('c1', 'Kestrel Logistics', { archived: true }), accounts, { ...opts, takenIds: new Set() })).toBeNull()
  })
})
