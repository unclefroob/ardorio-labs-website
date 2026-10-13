import { useState } from 'react'
import type { BillingClient } from '../../api/contract'
import { createBillingClient, invoiceError, linkBillingClient, listBillingClients } from '../../api/invoices'
import { useLoad, type Loaded } from '../../data/invoicing'
import type { Company } from '../../data/types'
import { linkSuggestions, type LinkSuggestion } from '../../shared/billing'

export interface BillingLink {
  clients: Loaded<BillingClient[]>
  /** The billing client linked to this company, if any. */
  client: BillingClient | undefined
  /** Unlinked clients that look like this company, minus the ones dismissed with Not it. Empty once one is linked. */
  suggestions: LinkSuggestion[]
  dismiss: (slug: string) => void
  /** The slug being linked, 'create' while creating, or ''. */
  busy: string
  fail: string
  link: (slug: string) => Promise<void>
  create: () => Promise<void>
}

/**
 * Link a company to a billing client, or create one from its name. Shared by the company Billing details card and
 * the Billing step of the Won dialog so both follow the same rule: nothing links or creates on load, only on a click.
 * `show` false loads nothing.
 */
export function useBillingLink(company: Pick<Company, 'id' | 'name' | 'tradingName' | 'website' | 'domain'> & { abn?: unknown }, show: boolean): BillingLink {
  const clients = useLoad(s => (show ? listBillingClients(s).then(r => r.clients) : Promise.resolve([] as BillingClient[])), `clients:${show}`)
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(new Set())
  const [busy, setBusy] = useState('')
  const [fail, setFail] = useState('')

  const client = (clients.data ?? []).find(c => c.linkedCompanyId === company.id)
  const suggestions = client ? [] : linkSuggestions(company, clients.data ?? [], dismissed)

  const link = async (slug: string): Promise<void> => {
    setBusy(slug)
    setFail('')
    try {
      await linkBillingClient(slug, company.id)
      clients.reload()
    } catch (e) {
      setFail(invoiceError(e, 'save').message)
    } finally {
      setBusy('')
    }
  }
  const create = async (): Promise<void> => {
    setBusy('create')
    setFail('')
    try {
      const c = await createBillingClient({ clientName: company.name, billing: {} })
      await linkBillingClient(c.slug, company.id)
      clients.reload()
    } catch (e) {
      setFail(invoiceError(e, 'save').message)
      clients.reload()
    } finally {
      setBusy('')
    }
  }
  const dismiss = (slug: string): void => setDismissed(prev => new Set([...prev, slug]))

  return { clients, client, suggestions, dismiss, busy, fail, link, create }
}
