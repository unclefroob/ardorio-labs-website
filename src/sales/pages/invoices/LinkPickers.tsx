import { useEffect, useRef, useState } from 'react'
import type { BillingClient, InvoiceDto } from '../../api/contract'
import { errorField, invoiceError, linkBillingClient, listBillingClients, listInvoices, updateInvoiceLinks } from '../../api/invoices'
import { ardCompanies, ardDeals, billingPlans, useLoad } from '../../data/invoicing'
import { Q } from '../../data/Q'
import { useStore } from '../../data/store'
import { Banner, Btn, Card, Fld, Sel } from '../../kit'
import { linkChanges, milestoneStatus, planFor } from '../../shared/invoices'
import { formatCents } from '../../shared/money'
import { UI } from '../../ui/store'

export type LinkField = 'companyId' | 'dealId' | 'milestoneId'
export type LinkValues = Record<LinkField, string>
export type ClientsState = 'loading' | 'ready' | 'failed'
export type LinkErr = { field: LinkField; message: string } | null

/** Sent or paid, and made in SalesOS: the invoice went to the customer, so it is never re-addressed, only linked. */
export const isIssued = (inv: InvoiceDto | null): inv is InvoiceDto => !!inv && (inv.status === 'sent' || inv.status === 'paid') && inv.source !== 'external'

/**
 * True when an issued invoice is on a company its own billing client is not linked to: it stays addressed to that
 * client and is only linked to the company in SalesOS. Unknown until the billing clients have loaded.
 */
export function onlyLinkedTo(inv: InvoiceDto | null, companyId: string, clients: readonly BillingClient[], state: ClientsState): boolean {
  if (!isIssued(inv) || !companyId || state !== 'ready') return false
  return clients.find(c => c.slug === inv.clientSlug)?.linkedCompanyId !== companyId
}

/** A server VALIDATION that names one of the three pickers, else null. */
export function linkErrOf(e: unknown): LinkErr {
  const field = errorField(e)
  return field === 'companyId' || field === 'dealId' || field === 'milestoneId' ? { field, message: invoiceError(e, 'save').message } : null
}

interface Props {
  invoice: InvoiceDto | null
  value: LinkValues
  /** Picking a company clears the deal and milestone, picking a deal clears the milestone. */
  onPick: (patch: Partial<LinkValues>) => void
  /** Replaces the plain milestone pick (the editor fills a blank line from the milestone). */
  onMilestone?: (milestoneId: string) => void
  clients: readonly BillingClient[]
  clientsState: ClientsState
  reloadClients: () => void
  linkErr: LinkErr
  setLinkErr: (e: LinkErr) => void
  /** The editor's own "choose a customer" error, shown when there is no link error. */
  customerErr?: string
  required?: boolean
}

/**
 * The customer, deal and milestone pickers of an invoice, with the rules for an issued (sent or paid) invoice that has
 * no company yet. Its company can be picked once: the one its billing client is linked to; or, when that client is
 * linked to no company, any company, which leaves the invoice addressed to its own client. A company with no billing
 * client is offered its link, optionally. The customer of an issued invoice that has a company is never changed.
 */
export function LinkPickers({ invoice, value, onPick, onMilestone, clients, clientsState, reloadClients, linkErr, setLinkErr, customerErr, required }: Props) {
  const issued = isIssued(invoice)
  const linkMode = issued && !invoice.companyId
  const [confirm, setConfirm] = useState<{ companyId: string; name: string } | null>(null)
  const [linking, setLinking] = useState(false)
  const confirmBtn = useRef<HTMLButtonElement>(null)
  useEffect(() => { if (confirm) confirmBtn.current?.focus() }, [confirm])

  const companies = ardCompanies()
  const deals = value.companyId ? ardDeals(value.companyId) : []
  const plan = planFor(billingPlans(), value.dealId || null)
  const dealInvoices = useLoad(s => (value.dealId ? listInvoices({ dealId: value.dealId }, s).then(r => r.invoices) : Promise.resolve([] as InvoiceDto[])), `deal:${value.dealId}`)
  const taken = dealInvoices.data ?? []
  const errFor = (k: LinkField): string | undefined => (linkErr?.field === k ? linkErr.message : undefined)
  const companyName = (id: string): string => Q.company(id)?.name ?? 'That company'
  const own = invoice ? clients.find(c => c.slug === invoice.clientSlug) : undefined

  const setCompany = (companyId: string): void => onPick({ companyId, dealId: '', milestoneId: '' })
  const pickCompany = (companyId: string): void => {
    setLinkErr(null)
    setConfirm(null)
    if (!linkMode || !companyId) return setCompany(companyId)
    const theirs = clients.find(c => c.linkedCompanyId === companyId)
    if (theirs && theirs.slug === invoice.clientSlug) setCompany(companyId)
    else if (own?.linkedCompanyId) {
      setLinkErr({ field: 'companyId', message: `${invoice.clientName} is already linked to ${companyName(own.linkedCompanyId)}. Choose ${companyName(own.linkedCompanyId)}, or change the billing link on the company first.` })
    }
    // Billed as a different client: the invoice is linked as it is; that company keeps its own billing client.
    else if (theirs) setCompany(companyId)
    else setConfirm({ companyId, name: companyName(companyId) })
  }
  const linkClient = async (): Promise<void> => {
    if (!confirm || !invoice) return
    setLinking(true)
    try {
      await linkBillingClient(invoice.clientSlug, confirm.companyId)
      reloadClients()
      setCompany(confirm.companyId)
      setConfirm(null)
    } catch (e) {
      setConfirm(null)
      setLinkErr({ field: 'companyId', message: invoiceError(e, 'save').message })
    } finally {
      setLinking(false)
    }
  }
  const invoiceOnly = (): void => {
    if (!confirm) return
    setCompany(confirm.companyId)
    setConfirm(null)
  }
  const pickDeal = (dealId: string): void => {
    if (linkErr?.field !== 'companyId') setLinkErr(null)
    onPick({ dealId, milestoneId: '' })
  }
  const pickMilestone = (milestoneId: string): void => {
    if (linkErr?.field === 'milestoneId') setLinkErr(null)
    if (onMilestone) onMilestone(milestoneId)
    else onPick({ milestoneId })
  }
  const addressedOnly = invoice && onlyLinkedTo(invoice, value.companyId, clients, clientsState)

  return (
    <>
      <div className="grid g3">
        <Fld label="Customer (CRM company)" req={required} err={errFor('companyId') ?? customerErr} hint={issued && invoice.companyId ? 'The customer of an issued invoice can’t be changed.' : undefined}>
          <Sel
            value={value.companyId} onChange={pickCompany} placeholder="Select a customer…" aria-invalid={!!errFor('companyId') || undefined}
            disabled={(!!invoice && !!invoice.companyId) || (linkMode && (clientsState !== 'ready' || linking))}
            options={companies.map(c => [c.id, c.name] as const)}
          />
        </Fld>
        <Fld label="Deal (optional)" err={errFor('dealId')}>
          <Sel value={value.dealId} onChange={pickDeal} placeholder="No deal" disabled={!value.companyId} aria-invalid={!!errFor('dealId') || undefined} options={deals.map(d => [d.id, d.title || d.name] as const)} />
        </Fld>
        <Fld label="Milestone" err={errFor('milestoneId')}>
          <Sel
            value={value.milestoneId} onChange={pickMilestone} disabled={!plan} aria-invalid={!!errFor('milestoneId') || undefined}
            placeholder={value.dealId ? (plan ? 'No milestone' : 'No billing plan on this deal') : 'Choose a deal first'}
            options={(plan?.milestones ?? []).map(m => {
              const st = milestoneStatus(m.id, taken.filter(i => i.id !== invoice?.id))
              return [m.id, `${m.label}: ${formatCents(m.amountCents)} ex GST${st === 'Planned' ? '' : ` (${st})`}`] as const
            })}
          />
        </Fld>
      </div>

      {confirm && invoice && (
        <Banner
          tone="info" icon="link"
          action={(
            <span className="row wrap" style={{ gap: 8 }}>
              <Btn ref={confirmBtn} size="sm" kind="pri" onClick={() => void linkClient()} disabled={linking}>{linking ? 'Linking…' : 'Link billing client'}</Btn>
              <Btn size="sm" onClick={invoiceOnly} disabled={linking}>Link this invoice only</Btn>
              <Btn size="sm" kind="ghost" onClick={() => setConfirm(null)} disabled={linking}>Keep unlinked</Btn>
            </span>
          )}
        >
          <b>Link billing client {invoice.clientName} to {confirm.name}?</b> Future invoices to {invoice.clientName} will be on this company. Or link only this invoice: it stays addressed to {invoice.clientName}.
        </Banner>
      )}

      {addressedOnly && (
        <div className="sm muted" role="note">This invoice stays addressed to {invoice.clientName}; it is only linked to {companyName(value.companyId)} in SalesOS.</div>
      )}
      {!value.companyId && !confirm && invoice && !invoice.companyId && <UnlinkedHint invoice={invoice} linkMode={linkMode} clientsState={clientsState} ownCompanyId={own?.linkedCompanyId ?? null} onRetry={reloadClients} />}
    </>
  )
}

/** What the page says about an invoice with no company, matched to whether its picker can be used. */
function UnlinkedHint({ invoice, linkMode, clientsState, ownCompanyId, onRetry }: { invoice: InvoiceDto; linkMode: boolean; clientsState: ClientsState; ownCompanyId: string | null; onRetry: () => void }) {
  const name = invoice.clientName
  if (!linkMode) return <div className="sm muted">Billed to {name}, which is not linked to a CRM company. Choose the company to link it.</div>
  if (clientsState === 'loading') return <div className="sm muted">Billed to {name}. Checking which company it is linked to…</div>
  if (clientsState === 'failed') {
    return (
      <div className="sm muted row" style={{ gap: 8 }}>
        <span>Billed to {name}. The billing clients could not be loaded, so a company can’t be chosen yet.</span>
        <Btn size="xs" onClick={onRetry}>Try again</Btn>
      </div>
    )
  }
  if (ownCompanyId) {
    const co = Q.company(ownCompanyId)?.name ?? 'a CRM company'
    return <div className="sm muted">Billed to {name}, which is linked to {co}. Choose {co} to put this invoice on it.</div>
  }
  return <div className="sm muted">Billed to {name}, which is not linked to a CRM company. Choose the company to link it.</div>
}

/**
 * The links of a paid invoice, edited in place on its read-only view. Saves through PUT /invoices/:id/links, which
 * writes only the company, deal and milestone: the paid invoice itself does not change.
 */
export function PaidLinksCard({ invoice, onSaved, onClose }: { invoice: InvoiceDto; onSaved: (inv: InvoiceDto) => void; onClose: () => void }) {
  useStore()
  const clients = useLoad(s => listBillingClients(s), 'clients')
  const clientsState: ClientsState = clients.data ? 'ready' : clients.error ? 'failed' : 'loading'
  const [value, setValue] = useState<LinkValues>({ companyId: invoice.companyId ?? '', dealId: invoice.dealId ?? '', milestoneId: invoice.milestoneId ?? '' })
  const [linkErr, setLinkErr] = useState<LinkErr>(null)
  const [fail, setFail] = useState('')
  const [busy, setBusy] = useState(false)
  const changes = linkChanges(invoice, value)
  const dirty = Object.keys(changes).length > 0

  const save = async (): Promise<void> => {
    setBusy(true)
    setFail('')
    setLinkErr(null)
    try {
      const saved = await updateInvoiceLinks(invoice.id, changes)
      UI.toast('Links saved. Nothing else on the invoice changed.')
      onSaved(saved)
      onClose()
    } catch (e) {
      const le = linkErrOf(e)
      if (le) setLinkErr(le)
      else setFail(invoiceError(e, 'save').message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card
      title="Customer, deal and milestone"
      right={(
        <span className="row" style={{ gap: 8 }}>
          <Btn size="sm" onClick={onClose} disabled={busy}>Cancel</Btn>
          <Btn size="sm" kind="pri" onClick={() => void save()} disabled={busy || !dirty}>{busy ? 'Saving…' : 'Save links'}</Btn>
        </span>
      )}
    >
      <div className="col" style={{ gap: 14 }}>
        {fail && <Banner tone="bad">{fail}</Banner>}
        <LinkPickers
          invoice={invoice} value={value} onPick={patch => setValue(v => ({ ...v, ...patch }))}
          clients={clients.data?.clients ?? []} clientsState={clientsState} reloadClients={clients.reload}
          linkErr={linkErr} setLinkErr={setLinkErr}
        />
        <div className="sm muted">Only the links change. The paid invoice, its number, payment and customer details stay as they are.</div>
      </div>
    </Card>
  )
}
