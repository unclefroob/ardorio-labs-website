import type { InvoiceDto } from '../../api/contract'
import { createInvoice, getInvoiceSettings, listBillingClients, listInvoices } from '../../api/invoices'
import { draftForMilestone, type ScheduleRow } from '../../shared/billing'
import { buildInput, planFor, validateForm } from '../../shared/invoices'
import { billingPlans } from '../../data/invoicing'

export type BulkResult = { ok: true; invoices: InvoiceDto[] } | { ok: false; error: string; invoices: InvoiceDto[] }

/**
 * One draft invoice per unbilled milestone, each with a single line for the milestone amount. Drafts only:
 * nothing is issued. Stops at the first failure and reports what was already created.
 */
export async function createDraftsForUnbilled(companyId: string, dealId: string, rowsIn: readonly ScheduleRow[], today: string): Promise<BulkResult> {
  const made: InvoiceDto[] = []
  let rows = rowsIn
  if (!rows.length) return { ok: false, error: 'Every milestone already has an invoice.', invoices: made }
  const [clients, settings] = await Promise.all([listBillingClients(), getInvoiceSettings()])
  const client = clients.clients.find(c => c.linkedCompanyId === companyId)
  if (!client) return { ok: false, error: 'This company has no billing details yet. Add them from the company page first.', invoices: made }
  const plan = planFor(billingPlans(), dealId)
  // The caller's rows may be stale or computed before the list loaded: re-check the server so a milestone that already has an invoice is never billed twice.
  const existing = new Set((await listInvoices({ dealId })).invoices.map(i => i.milestoneId).filter(Boolean))
  rows = rows.filter(r => !existing.has(r.milestone.id))
  if (!rows.length) return { ok: false, error: 'Every milestone already has an invoice.', invoices: made }
  for (const r of rows) {
    const form = { ...draftForMilestone(today, { companyId, dealId, milestoneId: r.milestone.id }, plan, { gstPct: settings.gstRegistered ? '10' : '0', card: settings.offerCardPayments && settings.stripeConfigured !== false }), clientSlug: client.slug }
    const v = validateForm(form)
    if (!v.ok) return { ok: false, error: `${r.milestone.label}: ${Object.values(v.errors).flat().filter(x => typeof x === 'string')[0] ?? 'the invoice is not valid'}`, invoices: made }
    try {
      made.push(await createInvoice(buildInput(form)))
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'Could not create the draft', invoices: made }
    }
  }
  return { ok: true, invoices: made }
}
