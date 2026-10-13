import type { InvoiceDto } from '../../api/contract'
import { listInvoices } from '../../api/invoices'
import { pollOnce } from '../../data/sync'
import { Banner, Btn, Card } from '../../kit'
import { retainerPeriodLabel } from '../../shared/billing'
import { PageHead } from '../../shared/PageHead'
import { UI } from '../../ui/store'

/** A retainer period the editor meant to bill by hand, found already drafted (or moved on) by the server. */
export interface RetainerClash { dealId: string; due: string; reason: string; draft: InvoiceDto | null }

/**
 * Bring the local plans up to the server before a claim is checked. The scheduler runs every 30 seconds, so a period
 * the card offered as due is often drafted while the editor is open. Never throws: a failed poll leaves the store as
 * it was, and the claim is checked against that.
 */
export async function catchUpPlans(): Promise<void> {
  try {
    await pollOnce()
  } catch {
    // pollOnce records its own failures.
  }
}

/** The live invoice the scheduler drafted for that retainer period on the deal, if there is one. */
export async function findRetainerDraft(dealId: string, due: string): Promise<InvoiceDto | null> {
  const line = `Retainer, ${retainerPeriodLabel(due)}`
  try {
    const { invoices } = await listInvoices({ dealId })
    return invoices.find(i => i.source === 'retainer' && i.status !== 'void' && i.lineItems.some(l => l.description === line)) ?? null
  } catch {
    return null
  }
}

/** Before saving: the period is no longer the one to claim. Saving now makes an extra invoice, so the user chooses. */
export function ClashBanner({ clash, onExtra }: { clash: RetainerClash; onExtra: () => void }) {
  const period = retainerPeriodLabel(clash.due)
  return (
    <div style={{ marginBottom: 14 }} role="alert" aria-label="Retainer already drafted">
      <Banner
        tone="warn"
        action={
          <span className="row" style={{ gap: 8 }}>
            {clash.draft && <Btn size="sm" onClick={() => UI.nav('invoice', { id: clash.draft!.id })}>Open {clash.draft.invoiceNumber}</Btn>}
            <Btn size="sm" onClick={onExtra}>Save as an extra invoice</Btn>
          </span>
        }
      >
        <b>The {period} retainer was drafted automatically while this was open{clash.draft ? ` as ${clash.draft.invoiceNumber}` : ''}.</b> Nothing was saved. Saving this
        too makes a second invoice for {period}. Open the automatic draft to bill the month there, or save this as an extra invoice.
      </Banner>
    </div>
  )
}

/**
 * After saving: the invoice was created, but the server drafted the same period before the claim went in, so there
 * are two invoices for one month. Shown in place of the editor until the user picks one to open; nothing is issued.
 */
export function DoubledRetainer({ saved, clash }: { saved: InvoiceDto; clash: RetainerClash }) {
  const period = retainerPeriodLabel(clash.due)
  return (
    <div className="page">
      <PageHead title={`${saved.invoiceNumber} saved as a draft`} />
      <Card>
        <div role="alert" aria-label="Two invoices for one retainer month" className="col" style={{ gap: 14 }}>
          <Banner tone="bad">
            <b>There are now two invoices for the {period} retainer.</b> {saved.invoiceNumber} was saved, but the {period} retainer was
            {clash.draft ? ` also drafted automatically as ${clash.draft.invoiceNumber}` : ' already drafted automatically'}, so this invoice
            did not move the automatic draft on. Delete one of the two drafts so {period} is billed once. Neither has been issued.
          </Banner>
          <span className="row" style={{ gap: 8 }}>
            {clash.draft && <Btn kind="pri" onClick={() => UI.nav('invoice', { id: clash.draft!.id })}>Open {clash.draft.invoiceNumber}</Btn>}
            <Btn onClick={() => UI.nav('invoice', { id: saved.id })}>Open {saved.invoiceNumber}</Btn>
            {!clash.draft && <Btn onClick={() => UI.nav('deal', { id: clash.dealId, q: { tab: 'billing' } })}>Open the deal</Btn>}
          </span>
        </div>
      </Card>
    </div>
  )
}
