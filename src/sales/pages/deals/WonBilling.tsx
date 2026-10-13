import { useEffect, useRef, useState } from 'react'
import { invoiceError } from '../../api/invoices'
import { Q } from '../../data/Q'
import type { Company } from '../../data/types'
import { Banner, Btn, Ck, Skel } from '../../kit'
import { Icon } from '../../kit/Icon'
import { missingBilling } from '../../shared/invoices'
import { useBillingLink } from '../companies/useBillingLink'

export interface WonBillingProps {
  dealId: string
  /** Open the deal Billing tab once the Won dialog closes, to add milestones. */
  milestones: boolean
  onMilestones: (v: boolean) => void
}

/**
 * The optional Billing step of the Won dialog, for Ardorio deals and Ardorio admins only. With no billing client
 * linked to the company it offers the same link and create actions as the company Billing details card (click only,
 * nothing runs on load); with one linked it is a single confirmation line. Winning the deal never waits on it.
 */
export function WonBilling(p: WonBillingProps) {
  const d = Q.deal(p.dealId)
  const company = d ? Q.company(d.companyId) : undefined
  if (!d || !company || d.businessId !== 'ard' || !Q.canBill()) return null
  return <Step {...p} company={company} />
}

function Step({ company, milestones, onMilestones }: WonBillingProps & { company: Company }) {
  const { clients, client, suggestions, dismiss, busy, fail, link, create } = useBillingLink(company, true)
  const [later, setLater] = useState(false)
  // When the actions go away (linked, or Later), focus moves to the line that replaced them, not to the page.
  const said = useRef<HTMLDivElement>(null)
  const acted = useRef(false)
  const settled = later || !!client
  useEffect(() => {
    if (settled && acted.current) said.current?.focus()
  }, [settled])

  const err = clients.error
  if (err != null && invoiceError(err, 'load').kind === 'denied') return null

  const addMilestones = (
    <Ck checked={milestones} onChange={onMilestones}>
      <span>Add milestones next <span className="faint">· opens the deal Billing tab when you close this</span></span>
    </Ck>
  )

  if (later) {
    return (
      <div ref={said} tabIndex={-1} role="status" className="sm muted" style={{ marginTop: 14 }}>
        Billing skipped. You can link a billing client from the company page or the deal Billing tab later.
      </div>
    )
  }

  if (clients.loading && !clients.data) {
    return <div style={{ marginTop: 14 }} role="status" aria-label="Loading billing" aria-busy="true"><Skel rows={1} /></div>
  }

  if (client) {
    const lacks = missingBilling(client)
    return (
      <div style={{ marginTop: 14 }} className="col">
        <div ref={said} tabIndex={-1} role="status" className="row sm" style={{ gap: 6 }}>
          <Icon n="check" s={14} style={{ color: 'var(--ok)' }} />
          <span>Billing client linked: <b>{client.clientName}</b>{lacks.length ? <span className="muted"> · still missing {lacks.join(', ')}</span> : null}</span>
        </div>
        {addMilestones}
      </div>
    )
  }

  const go = (f: () => Promise<void>) => (): void => {
    acted.current = true
    void f()
  }

  return (
    <section className="card card-b" style={{ marginTop: 14 }} aria-labelledby="won-billing-h">
      <div className="row" style={{ gap: 6 }}>
        <Icon n="dollar" s={14} />
        <h3 id="won-billing-h" className="b" style={{ fontSize: 'inherit', margin: 0 }}>Billing</h3>
        <span className="faint sm">Optional</span>
      </div>
      <div className="col" style={{ gap: 10, marginTop: 8 }}>
        {fail && <Banner tone="bad">{fail}</Banner>}
        {err != null && <Banner tone="bad" action={<Btn size="sm" onClick={clients.reload}>Try again</Btn>}>{invoiceError(err, 'load').message}</Banner>}
        <div className="sm muted">No billing client is linked to {company.name} yet. Invoices need one for the name, email, ABN and address.</div>
        {suggestions.map(s => (
          <div key={s.client.slug} className="rowx">
            <span><b>{s.client.clientName}</b><div className="faint sm">{s.reasons.join(' · ')}</div></span>
            <span className="row" style={{ gap: 6 }}>
              <Btn size="sm" kind="pri" disabled={!!busy} aria-label={`Link ${s.client.clientName}`} onClick={go(() => link(s.client.slug))}>{busy === s.client.slug ? 'Linking…' : 'Link'}</Btn>
              <Btn size="sm" disabled={!!busy} aria-label={`Not it, ${s.client.clientName}`} onClick={() => dismiss(s.client.slug)}>Not it</Btn>
            </span>
          </div>
        ))}
        <div><Btn size="sm" disabled={!!busy} onClick={go(create)}>{busy === 'create' ? 'Creating…' : `Create billing client from "${company.name}"`}</Btn></div>
        {addMilestones}
        <div className="row">
          <span className="faint sm">The deal is already won. This step is optional.</span>
          <span className="sp" />
          <Btn size="sm" disabled={!!busy} onClick={() => { acted.current = true; setLater(true); onMilestones(false) }}>Later</Btn>
        </div>
      </div>
    </section>
  )
}
