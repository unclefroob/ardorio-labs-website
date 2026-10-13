import type { ReactNode } from 'react'
import type { InvoiceDto } from '../../api/contract'
import { Link } from '../../kit'
import { Chip } from '../../kit/basic'
import { Q } from '../../data/Q'
import { billingPlans } from '../../data/invoicing'
import { EXTERNAL_CHIP, EXTERNAL_SOURCE_LABEL } from '../../shared/externalInvoices'
import { METHOD_LABELS, statusChip } from '../../shared/invoices'

export function StatusChip({ inv }: { inv: Pick<InvoiceDto, 'status' | 'overdue'> }) {
  const c = statusChip(inv)
  return <Chip tone={c.tone} icon={c.icon}>{c.label}</Chip>
}

/** TEST marker: an icon and the word, never colour alone. */
export function TestChip({ inv }: { inv: Pick<InvoiceDto, 'test'> }) {
  return inv.test ? <Chip icon="flag" title={`Test invoice: ${inv.test.reason}`}>TEST</Chip> : null
}

/** Made by the retainer scheduler (always as a draft). An icon and words, never colour alone. Missing source reads as manual. */
export function RetainerChip({ inv }: { inv: Pick<InvoiceDto, 'source'> }) {
  return inv.source === 'retainer' ? <Chip icon="refresh" title="Drafted automatically from the deal's monthly retainer">From retainer</Chip> : null
}

/**
 * Recorded from outside SalesOS (Xero, another system, a bank transfer): an icon and words, never colour alone. The
 * title says the source and who recorded it.
 */
export function ExternalChip({ inv }: { inv: Pick<InvoiceDto, 'source' | 'external'> }) {
  if (inv.source !== 'external') return null
  const e = inv.external
  return <Chip tone="info" icon="ext" title={e ? `${EXTERNAL_SOURCE_LABEL[e.source]}, recorded by ${e.recordedBy}` : undefined}>{EXTERNAL_CHIP}</Chip>
}

export function MethodChip({ inv }: { inv: Pick<InvoiceDto, 'payment'> }) {
  return inv.payment ? <Chip>{METHOD_LABELS[inv.payment.method]}</Chip> : null
}

/** The customer, linked to the CRM company when the invoice has one; legacy invoices show the billing name. */
export function CustomerLink({ inv }: { inv: Pick<InvoiceDto, 'companyId' | 'clientName'> }) {
  return inv.companyId && Q.company(inv.companyId) ? <Link to="company" id={inv.companyId}>{Q.company(inv.companyId)?.name ?? inv.clientName}</Link> : <span>{inv.clientName}</span>
}

export function milestoneLabel(inv: Pick<InvoiceDto, 'dealId' | 'milestoneId'>): string {
  if (!inv.dealId || !inv.milestoneId) return ''
  return billingPlans().find(p => p.dealId === inv.dealId)?.milestones.find(m => m.id === inv.milestoneId)?.label ?? ''
}

export function Faint({ children }: { children: ReactNode }) {
  return <div className="faint sm">{children}</div>
}

/** Who did it: a member's name, or the raw value when they are not in the user list. */
export function personName(id: string): string {
  return Q.user(id)?.name ?? id
}
