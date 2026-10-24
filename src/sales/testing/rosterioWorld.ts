import { vi } from 'vitest'
import type { BootstrapResponse, Role, RosterioLink, RosterioProvisionResponse, RosterioStatusResponse } from '../api/contract'
import { bootstrap, rec, ME } from './fixtures'
import type { Sales } from './load'

/** Rosterio business, a pipeline with the `plan` field, one company, one contact and one open + one won Rosterio deal. */
export function rosterioWorld(over: { company?: Record<string, unknown>; contactEmail?: string; dealFields?: Record<string, unknown>; extraCompanies?: Record<string, Record<string, unknown>> } = {}): BootstrapResponse {
  const extra = Object.entries(over.extraCompanies ?? {})
  const stages = [
    { id: 'sg1', name: 'Lead', prob: 10, required: [], won: false, lost: false },
    { id: 'sg2', name: 'Closed Won', prob: 100, required: [], won: true, lost: false },
    { id: 'sg3', name: 'Closed Lost', prob: 0, required: [], won: false, lost: true },
  ]
  const deal = (id: string, status: 'open' | 'won', stageId: string) => rec(id, {
    name: 'Acme rostering', title: 'Acme rostering', businessId: 'ros', companyId: 'co1', pipelineId: 'pl1', stageId, ownerId: 'u-me', type: 'New',
    value: 12000, mrr: 1000, recurring: true, contractMonths: 12, close: '2026-12-01', probability: 10, forecast: 'Pipeline', source: 'Outbound',
    contactIds: ['ct1'], primaryContact: 'ct1', next: '', description: '', lostReason: '', status, createdAt: '2026-10-01T09:00:00', stageChangedAt: '2026-10-01T09:00:00',
    lastActivity: '2026-10-01T09:00:00', closedAt: null, priority: 'Medium', fields: { plan: 'pro', ...over.dealFields }, stageHistory: [], notes: [],
  })
  const b = bootstrap({
    businesses: [rec('ros', { name: 'Rosterio', short: 'ROS', accent: '#123456', desc: '', currency: 'AUD', tz: 'Australia/Melbourne', pipelineId: 'pl1', industries: [], roles: [] })],
    pipelines: [rec('pl1', {
      businessId: 'ros', name: 'Rosterio pipeline', recurring: true, lostReasons: ['Price'], forecast: [], card: [], stages,
      fields: [{ key: 'plan', label: 'Plan', type: 'select', options: ['starter', 'pro', 'enterprise'], active: true }],
    })],
    companies: [
      rec('co1', { name: 'Acme Pty Ltd', tradingName: 'Acme', tags: [], tech: [], notes: [], industry: '', subindustry: '', hq: '', state: '', ...over.company }),
      ...extra.map(([id, d]) => rec(id, { name: id, tradingName: id, tags: [], tech: [], notes: [], industry: '', subindustry: '', hq: '', state: '', domain: '', archived: false, ...d })),
    ],
    contacts: [rec('ct1', {
      firstName: 'Jo', lastName: 'Park', name: 'Jo Park', title: 'Ops Director', companyId: 'co1', email: over.contactEmail ?? 'jo@acme.test', email2: '',
      phone: '0400 000 000', mobile: '', notes: [], verification: 'Verified',
    })],
    companyRels: [
      rec('cr1', { companyId: 'co1', businessId: 'ros', ownerId: 'u-me', status: 'Prospect', prospectStatus: '', source: '', priority: 'Medium', tags: [] }),
      ...extra.map(([id]) => rec('cr_' + id, { companyId: id, businessId: 'ros', ownerId: 'u-me', status: 'Prospect', prospectStatus: '', source: '', priority: 'Medium', tags: [] })),
    ],
    deals: [deal('dl1', 'open', 'sg1'), deal('dl2', 'won', 'sg2')],
  })
  return b
}

/** Make the signed-in user hold exactly this role in Rosterio (or be a super admin). */
export function setRole(m: Sales, role: Role | 'super' | null, others: Partial<Record<'ard' | 'pth' | 'adv', Role>> = {}): void {
  const u = m.store.S.users.find(x => x.id === ME.userId)
  if (!u) throw new Error('no signed-in user')
  u.super = role === 'super'
  u.m = { ...(role && role !== 'super' ? { ros: role } : {}), ...others }
  m.store.reindex()
}

export const STATUS_OK: RosterioStatusResponse = { configured: true, pendingFailures: 0, recent: [] }
export const link = (o: Partial<RosterioLink> = {}): RosterioLink => ({ state: 'provisioned', accountId: 'acc1', accountName: 'Acme Pty Ltd', plan: 'pro', ...o })
export const PASSWORD = 'Tmp-9xQ-secret-7731'
export const provisioned = (o: Partial<RosterioProvisionResponse['adminUser']> = {}): RosterioProvisionResponse => ({
  link: link(), adminUser: { email: 'jo@acme.test', isNewUser: true, tempPassword: PASSWORD, ...o },
})

export interface Call { method: string; path: string; body: unknown }
type Reply = Response | Promise<Response> | (() => Response | Promise<Response>)
export const json = (status: number, body: unknown): Response => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

/** Stands in for the network. Keys are `METHOD /sales/path`. Unlisted calls are 404 so a stray request fails the test loudly. */
export function fakeApi(routes: Record<string, Reply>): { calls: Call[]; count: (key: string) => number } {
  const calls: Call[] = []
  vi.stubGlobal('fetch', (async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    const path = String(url).replace('https://api.test', '')
    calls.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : undefined })
    const r = routes[`${method} ${path}`]
    if (!r) return json(404, { error: 'No such route in the test', code: 'NOT_FOUND' })
    return typeof r === 'function' ? r() : r
  }) as typeof fetch)
  return { calls, count: key => calls.filter(c => `${c.method} ${c.path}` === key).length }
}

import type { RosterioAccount, RosterioAccountsResponse } from '../api/contract'
export const account = (o: Partial<RosterioAccount> = {}): RosterioAccount => ({
  id: 'acc1', name: 'Acme Pty Ltd', plan: 'pro', status: 'active', isActive: true, isTrial: false, memberCount: 12, createdAt: '2025-03-14T00:00:00.000Z', ...o,
})
export const accountsOf = (accounts: RosterioAccount[], o: Partial<RosterioAccountsResponse> = {}): RosterioAccountsResponse => ({
  accounts, total: accounts.length, truncated: false, fetchedAt: new Date().toISOString(), ...o,
})

import type { RosterioAccountDetail, RosterioBilling, RosterioInvoice } from '../api/contract'
/** A Rosterio account id as the page requires: 24 hex characters. */
export const ACC_ID = '65f0c0ffee0000000000abcd'
/** A Spuntino-like managed account as the account page reads it: A$400 a month flat, 12 people, no billing started. */
export const detail = (o: Partial<RosterioAccountDetail> = {}): RosterioAccountDetail => ({
  accountId: ACC_ID, name: 'Acme Pty Ltd', plan: 'pro', status: 'active', isActive: true, isTrial: false, trialEndDate: null, createdAt: '2025-03-14T00:00:00.000Z',
  subscriptionStatus: 'active', memberCount: 12, maxUsers: 20, maxLocations: 5, locationCount: 3, billingState: null,
  pricing: { source: 'custom', managedContract: true, monthlyCost: 400, billingQuantity: null },
  terms: { billingModel: 'flat', amountCents: 40000, interval: 'monthly', effectiveFrom: '2026-09-01T00:00:00.000Z', effectiveUntil: null, contractReference: 'ACME-MSA', status: 'active' },
  features: [], planDrift: null, adminUrl: `https://admin.rosterio.test/accounts/${ACC_ID}`,
  aiCreditsPerPeriod: 500, awardSetup: { status: 'complete', updatedAt: '2026-09-02T00:00:00.000Z' },
  people: { active: 12, byRole: { super_admin: 2, manager: 3, staff: 7 } },
  admins: [{ name: 'Jo Park', role: 'super_admin' }, { name: 'Sam Lee', role: 'super_admin' }],
  company: { id: 'co1', name: 'Acme Pty Ltd' }, fetchedAt: new Date().toISOString(), ...o,
})

/** A managed account's billing as Rosterio reports it. Pass a state to get it running (and so not startable). */
export const billingView = (state: NonNullable<RosterioBilling['billing']>['state'] | null = null, o: Partial<NonNullable<RosterioBilling['billing']>> = {}, over: Partial<RosterioBilling> = {}): RosterioBilling => ({
  accountId: ACC_ID, accountName: 'Acme Pty Ltd', timezone: 'Australia/Sydney', today: '2026-10-17', billingEmail: 'finance@acme.test',
  terms: { billingModel: 'flat', amountCents: 40000, interval: 'monthly', effectiveFrom: '2026-09-01T00:00:00.000Z', effectiveUntil: null, contractReference: 'ACME-MSA', status: 'active' },
  amounts: { quantity: 1, unitAmountCents: 40000, subtotalCents: 40000, gstCents: 4000, totalCents: 44000, gstPercent: 10, interval: 'monthly' }, options: [],
  ...(state
    ? {
        canStart: false, cannotStartReason: 'Billing is already set up for this account.',
        billing: { state, collection: 'charge_automatically', firstBillingDate: '2026-11-01', daysUntilDue: null, billingEmail: 'finance@acme.test', startedAt: '2026-10-17T00:00:00.000Z',
          stoppedAt: null, cardUrl: 'https://api.rosterio.test/api/billing/card/abc', cardSavedAt: null, lastError: null, subscriptionStatus: null, currentPeriodEnd: null, cancelAtPeriodEnd: false, termsChangedFrom: null, ...o },
      }
    : { billing: null, canStart: true, cannotStartReason: null }),
  ...over,
})

export const invoice = (o: Partial<RosterioInvoice> = {}): RosterioInvoice => ({
  id: 'in_1', number: 'RS-1', accountId: ACC_ID, companyId: 'co1', customerName: 'Acme Pty Ltd', status: 'paid', failed: false, overdue: false,
  amountDueCents: 44000, amountPaidCents: 44000, amountRemainingCents: 0, currency: 'aud', createdAt: '2026-10-01T00:00:00Z', dueAt: null, paidAt: '2026-10-02T00:00:00Z',
  periodStart: null, periodEnd: null, attemptCount: 1, nextAttemptAt: null, lastError: null, hostedUrl: null, pdfUrl: null, ...o,
})
