import type { BillingClient, BootstrapResponse, InvoiceDto, InvoiceSettings, InvoiceSummary, Role } from '../api/contract'
import { bootstrap, rec, ME } from './fixtures'
import type { Sales } from './load'

/** Business ard with two companies in it (and one outside it), a deal on the first. */
export function invoicingWorld(over: Partial<BootstrapResponse['collections']> = {}) {
  return bootstrap({
    businesses: [rec('ard', { name: 'Ardorio', short: 'ARD', accent: '#123456', desc: '', currency: 'AUD', tz: 'Australia/Melbourne', pipelineId: 'pl1', industries: [], roles: [] })],
    companies: [
      rec('co1', { name: 'Tidewater Foods', tradingName: '', tags: [], tech: [], notes: [], industry: '', subindustry: '', hq: '', state: '', domain: '', archived: false }),
      rec('co2', { name: 'Banksia Advisory', tradingName: '', tags: [], tech: [], notes: [], industry: '', subindustry: '', hq: '', state: '', domain: '', archived: false }),
      rec('co3', { name: 'Not In Ardorio', tradingName: '', tags: [], tech: [], notes: [], industry: '', subindustry: '', hq: '', state: '', domain: '', archived: false }),
    ],
    companyRels: [
      rec('cr1', { companyId: 'co1', businessId: 'ard', ownerId: 'u-me', status: 'Customer', prospectStatus: '', source: '', priority: 'Medium', tags: [] }),
      rec('cr2', { companyId: 'co2', businessId: 'ard', ownerId: 'u-me', status: 'Customer', prospectStatus: '', source: '', priority: 'Medium', tags: [] }),
      rec('cr3', { companyId: 'co3', businessId: 'ros', ownerId: 'u-me', status: 'Prospect', prospectStatus: '', source: '', priority: 'Medium', tags: [] }),
    ],
    deals: [rec('dl1', {
      name: 'Platform build, phase 2', title: 'Platform build, phase 2', businessId: 'ard', companyId: 'co1', pipelineId: 'pl1', stageId: 'sg1', ownerId: 'u-me', type: 'New',
      value: 50000, mrr: null, recurring: false, contractMonths: 12, close: '2026-12-01', probability: 50, forecast: 'Pipeline', source: '', contactIds: [], primaryContact: null,
      next: '', description: '', lostReason: '', status: 'open', createdAt: '2026-10-01T09:00:00', stageChangedAt: '2026-10-01T09:00:00', lastActivity: '2026-10-01T09:00:00',
      closedAt: null, priority: 'Medium', fields: {}, stageHistory: [], notes: [],
    })],
    ...over,
  })
}

/** A deal in Ardorio. Won by default, since billing is for won work. */
export function ardDeal(id: string, over: Record<string, unknown> = {}) {
  return rec(id, {
    name: id, title: id, businessId: 'ard', companyId: 'co1', pipelineId: 'pl1', stageId: 'sg1', ownerId: 'u-me', type: 'New',
    value: 60000, mrr: null, recurring: false, contractMonths: 12, close: '2026-12-01', probability: 100, forecast: 'Closed', source: '', contactIds: [], primaryContact: null,
    next: '', description: '', lostReason: '', status: 'won', createdAt: '2026-07-01T09:00:00', stageChangedAt: '2026-07-28T09:00:00', lastActivity: '2026-07-28T09:00:00',
    closedAt: '2026-07-28T09:00:00', priority: 'Medium', fields: {}, stageHistory: [], notes: [], ...over,
  })
}

/** The Deal board: $60,000 quoted over four milestones. */
export const PLAN_DATA = {
  dealId: 'dl1', businessId: 'ard',
  milestones: [
    { id: 'm1', label: 'Discovery and design', amountCents: 1800000, plannedDate: '2026-08-15' },
    { id: 'm2', label: 'Core platform', amountCents: 1800000, plannedDate: '2026-10-03' },
    { id: 'm3', label: 'Integration and handover', amountCents: 1800000, plannedDate: '2026-10-13' },
    { id: 'm4', label: 'Final acceptance', amountCents: 600000, plannedDate: '2026-12-15' },
  ],
}

/** Make the signed-in user hold exactly this role in Ardorio, be a super admin, or hold only a role elsewhere. */
export function setArdRole(m: Sales, role: Role | 'super' | null, others: Partial<Record<'ros' | 'pth' | 'adv', Role>> = {}): void {
  const u = m.store.S.users.find(x => x.id === ME.userId)
  if (!u) throw new Error('no signed-in user')
  u.super = role === 'super'
  u.m = { ...(role && role !== 'super' ? { ard: role } : {}), ...others }
  m.store.reindex()
}

export function dto(over: Partial<InvoiceDto> = {}): InvoiceDto {
  return {
    id: 'i1', invoiceNumber: 'INV-0034', clientSlug: 'tidewater', clientName: 'Tidewater Foods', companyId: 'co1', dealId: 'dl1', milestoneId: null,
    lineItems: [{ description: 'Milestone 2: core platform', detail: 'SOW 4.2', qty: 1, unitPriceCents: 1800000, amountCents: 1800000 }], gstRate: 0.1, notes: '',
    issueDate: '2026-10-03', paymentTermsDays: 45, dueDate: '2026-11-17', status: 'sent', overdue: false, payment: null,
    offerCardPayment: false, paymentLinkUrl: '', paymentLinkIsAutomatic: false, publicToken: 'tok', hostedUrl: 'https://ardorio.co/invoice/tok',
    sentAt: '2026-10-03T01:00:00.000Z', issuedCount: 1, subtotalCents: 1800000, gstCents: 180000, totalCents: 1980000, createdAt: '2026-10-01T01:00:00.000Z', ...over,
  }
}

export const SUMMARY: InvoiceSummary = {
  tiles: { outstandingCents: 2250000, overdueCents: 450000, paidThisMonthCents: 960000, draftCount: 1, draftCents: 1800000 },
  byCompany: [],
}

export const SETTINGS: InvoiceSettings = {
  name: 'Ardorio Labs Pty Ltd', abn: '98 765 432 109', address: 'Level 2, 88 Example Street\nPerth WA 6000', email: 'accounts@ardorio.example',
  gstRegistered: true, offerCardPayments: false, bank: { accountName: 'Ardorio Labs Pty Ltd', bsb: '000-000', accountNumber: '00000000', payId: 'payments@ardorio.example' }, stripeConfigured: true,
}

export const CLIENT: BillingClient = {
  slug: 'tidewater', clientName: 'Tidewater Foods', linkedCompanyId: 'co1',
  billing: { contactName: 'Priya Raman', email: 'accounts@tidewaterfoods.example', abn: '12 345 678 901', address: '14 Wharf Road\nFremantle WA 6160' },
}

/** The five invoices of the Main board. */
export function boardInvoices(): InvoiceDto[] {
  return [
    dto({ id: 'a', invoiceNumber: 'INV-0035', status: 'draft', createdAt: '2026-10-13T00:00:00Z', issueDate: '2026-10-13', dueDate: '2026-11-27', sentAt: null, issuedCount: 0, subtotalCents: 1800000, gstCents: 180000, totalCents: 1980000 }),
    dto({ id: 'b', invoiceNumber: 'INV-0034', createdAt: '2026-10-01T00:00:00Z' }),
    dto({ id: 'c', invoiceNumber: 'INV-0033', clientName: 'Banksia Advisory', companyId: 'co2', dealId: null, overdue: true, dueDate: '2026-10-02', createdAt: '2026-08-18T00:00:00Z', subtotalCents: 450000, gstCents: 45000, totalCents: 495000 }),
    dto({ id: 'd', invoiceNumber: 'INV-0032', clientName: 'Quarry Street Retail', companyId: null, dealId: null, status: 'paid', createdAt: '2026-09-12T00:00:00Z', subtotalCents: 960000, gstCents: 96000, totalCents: 1056000, payment: { method: 'bank-transfer', paidAt: '2026-10-06', amountCents: 1056000, reference: 'QSR' } }),
    dto({ id: 'e', invoiceNumber: 'INV-0031', clientName: 'Larch & Co', companyId: null, dealId: null, status: 'paid', createdAt: '2026-09-01T00:00:00Z', subtotalCents: 180000, gstCents: 18000, totalCents: 198000, payment: { method: 'payid', paidAt: '2026-10-03', amountCents: 198000, reference: '' } }),
  ]
}
