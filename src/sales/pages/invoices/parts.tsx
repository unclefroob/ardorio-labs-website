import type { ReactNode } from 'react'
import type { InvoiceDto } from '../../api/contract'
import { Link } from '../../kit'
import { Chip } from '../../kit/basic'
import { Q } from '../../data/Q'
import { billingPlans } from '../../data/invoicing'
import { METHOD_LABELS, statusChip } from '../../shared/invoices'

export function StatusChip({ inv }: { inv: Pick<InvoiceDto, 'status' | 'overdue'> }) {
  const c = statusChip(inv)
  return <Chip tone={c.tone} icon={c.icon}>{c.label}</Chip>
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
