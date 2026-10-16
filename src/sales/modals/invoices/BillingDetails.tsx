import { useEffect, useState } from 'react'
import type { BillingClient } from '../../api/contract'
import { createBillingClient, invoiceError, linkBillingClient, listBillingClients, updateBillingClient } from '../../api/invoices'
import { Q } from '../../data/Q'
import { Banner, Btn, Fld, Inp, Modal, Sel, TA } from '../../kit'
import { validateBilling, type BillingForm } from '../../shared/invoices'
import { useF } from '../../shared/useF'
import { UI } from '../../ui/store'

const fromClient = (c: BillingClient | null | undefined, fallbackName: string): BillingForm => ({
  clientName: c?.clientName ?? fallbackName, contactName: c?.billing.contactName ?? '', email: c?.billing.email ?? '', abn: c?.billing.abn ?? '', address: c?.billing.address ?? '',
})

/** Billing details of one CRM company: edits its linked billing client, or creates one and links it. */
export function BillingDetails({ companyId, client, onSaved }: { companyId: string; client?: BillingClient | null; onSaved?: (c: BillingClient) => void }) {
  const company = Q.company(companyId)
  const [current, setCurrent] = useState<BillingClient | null>(client ?? null)
  const [f, set] = useF<BillingForm>(() => fromClient(client, company?.name ?? ''))
  const [others, setOthers] = useState<BillingClient[]>([])
  // Whether the existing billing clients are still being looked up: their picker holds its place meanwhile.
  const [looking, setLooking] = useState(!client)
  const [errors, setErrors] = useState<Partial<Record<keyof BillingForm, string>>>({})
  const [busy, setBusy] = useState(false)
  const [fail, setFail] = useState('')

  useEffect(() => {
    if (client) return
    let live = true
    listBillingClients().then(r => { if (live) setOthers(r.clients.filter(c => !c.linkedCompanyId)) }, () => undefined).finally(() => { if (live) setLooking(false) })
    return () => { live = false }
  }, [client])

  const pickExisting = (slug: string): void => {
    const c = others.find(x => x.slug === slug) ?? null
    setCurrent(c)
    set(fromClient(c, company?.name ?? ''))
  }

  const save = async (): Promise<void> => {
    const e = validateBilling(f)
    setErrors(e)
    if (Object.keys(e).length) return
    setBusy(true)
    setFail('')
    const input = { clientName: f.clientName.trim(), billing: { contactName: f.contactName.trim(), email: f.email.trim(), abn: f.abn.trim(), address: f.address.trim() } }
    try {
      let saved: BillingClient
      if (current) {
        saved = await updateBillingClient(current.slug, input)
        if (current.linkedCompanyId !== companyId) await linkBillingClient(current.slug, companyId)
      } else {
        saved = await createBillingClient(input)
        await linkBillingClient(saved.slug, companyId)
      }
      const linked = { ...saved, linkedCompanyId: companyId }
      UI.close()
      UI.toast('Billing details saved')
      onSaved?.(linked)
    } catch (err) {
      setFail(invoiceError(err, 'save').message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title="Billing details"
      sub={company?.name}
      width={560}
      footer={<><Btn onClick={UI.close} disabled={busy}>Cancel</Btn><Btn kind="pri" onClick={() => void save()} loading={busy}>{busy ? 'Saving…' : 'Save billing details'}</Btn></>}
    >
      <div className="col" style={{ gap: 14 }}>
        {fail && <Banner tone="bad">{fail}</Banner>}
        {!client && looking && others.length === 0 && (
          <Fld label="Use an existing billing client"><Sel value="" onChange={() => undefined} placeholder="Checking existing billing clients…" options={[]} disabled aria-busy="true" /></Fld>
        )}
        {!client && others.length > 0 && (
          <Fld label="Use an existing billing client" hint="Billing clients carry over from the old invoicing. Pick one to link it to this company, or fill in new details below.">
            <Sel value={current?.slug ?? ''} onChange={pickExisting} placeholder="Create a new one" options={others.map(c => [c.slug, c.clientName] as const)} />
          </Fld>
        )}
        <div className="grid g2">
          <Fld label="Name on invoice" req err={errors.clientName}><Inp value={f.clientName} onChange={v => set('clientName', v)} /></Fld>
          <Fld label="Billing contact"><Inp value={f.contactName} onChange={v => set('contactName', v)} /></Fld>
          <Fld label="Email" err={errors.email}><Inp type="email" value={f.email} onChange={v => set('email', v)} /></Fld>
          <Fld label="ABN" err={errors.abn}><Inp className="mono" value={f.abn} onChange={v => set('abn', v)} /></Fld>
        </div>
        <Fld label="Address"><TA rows={2} value={f.address} onChange={v => set('address', v)} /></Fld>
        <div className="sm muted">Nothing is emailed from here. These details print on the invoice and are checked when you issue.</div>
      </div>
    </Modal>
  )
}
