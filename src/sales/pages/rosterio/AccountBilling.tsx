import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { RosterioInvoice } from '../../api/contract'
import { SalesHttpError } from '../../api/http'
import { rosterioBillingStop, rosterioCardLink } from '../../api/rosterio'
import { F } from '../../data/F'
import type { Loaded } from '../../data/invoicing'
import type { RosterioBilling } from '../../api/contract'
import { billingChanged, billingPill, perOf, rosMoneyOf } from '../../data/rosterioBilling'
import { Banner, Btn, Card, Chip, Skel } from '../../kit'
import { rosMoney } from '../invoices/RosterioInvoices'
import { UI } from '../../ui/store'
import { CardLink } from './billingParts'
import { StartBillingForm } from './StartBillingForm'

const fail = (e: unknown): string => (e instanceof SalesHttpError ? e.message : 'Could not reach the server. Try again.')

/** The owing figure for the Billing tab: open Stripe invoices on this account. */
export const owingCents = (invoices: readonly RosterioInvoice[]): number => invoices.filter(i => i.status === 'open').reduce((t, i) => t + i.amountRemainingCents, 0)

function Row({ label, children }: { label: string; children: ReactNode }) {
  return <div className="row"><span className="faint sm" style={{ width: 110, flex: 'none' }}>{label}</span><span style={{ minWidth: 0 }}>{children}</span></div>
}

/** A managed account's Stripe billing: not started (the form), or running (what, when, who pays) with Stop. */
export function AccountBilling({ accountId, companyId, name, billing, invoices, onChanged }: {
  accountId: string; companyId?: string; name: string; billing: Loaded<RosterioBilling>; invoices: readonly RosterioInvoice[] | undefined
  /** Called after a start or stop, so the rest of the page (the overview chip, the invoices) reads again. */
  onChanged: () => void
}) {
  const [busy, setBusy] = useState<'stop' | 'link' | null>(null)
  const v = billing.data
  // After a start or stop the card in front of you is replaced, so focus moves to the new card's heading.
  const head = useRef<HTMLElement>(null)
  const refocus = useRef(false)
  const shown = v ? (v.billing?.state ?? 'none') : 'loading'
  useEffect(() => {
    if (refocus.current && shown !== 'loading') { refocus.current = false; head.current?.focus() }
  }, [shown])
  const changed = (): void => { refocus.current = true; billingChanged({ accountId }, ...(companyId ? [{ companyId }] : [])); onChanged() }
  if (!v) return billing.error ? <Banner tone="bad" action={<Btn size="sm" kind="pri" onClick={billing.reload}>Try again</Btn>}>{fail(billing.error)}</Banner> : <Card><Skel rows={5} label="Reading billing from Rosterio" /></Card>
  const bl = v.billing
  const a = v.amounts

  if (!bl || bl.state === 'stopped') {
    if (!v.canStart) {
      return <Banner tone="info">{v.terms ? v.cannotStartReason : 'This account is self-serve: it pays at checkout, so there is no billing to start here.'}</Banner>
    }
    return (
      <div className="col" style={{ gap: 14 }}>
        {bl && <Banner tone="info">Stopped{bl.stoppedAt ? ` on ${F.date(bl.stoppedAt)}` : ''}. You can start billing again below.</Banner>}
        <StartBillingForm accountId={accountId} companyId={companyId} v={v} headRef={head} onChanged={() => { refocus.current = true; onChanged() }} />
      </div>
    )
  }

  const pill = billingPill(v)
  const how = bl.collection === 'charge_automatically' ? 'Card on file' : 'Emailed invoice'
  const owing = invoices ? owingCents(invoices) : 0
  const stoppable = ['awaiting_card', 'scheduled', 'active'].includes(bl.state)

  const stop = (): void => {
    UI.confirm({
      title: 'Stop billing in Stripe?',
      body: bl.state === 'active'
        ? `${name} will not be billed again. The subscription ends at the close of the period already billed${bl.currentPeriodEnd ? ` (${F.date(bl.currentPeriodEnd)})` : ''}; nothing is refunded.`
        : `${name} will not be billed. Nothing has been charged yet.`,
      points: ['The Rosterio account stays as it is.', 'You can start billing again later.'],
      confirm: 'Stop billing',
      danger: true,
      onConfirm: () => {
        setBusy('stop')
        rosterioBillingStop({ accountId })
          .then(() => { changed(); UI.toast('Billing stopped') }, e => UI.toast(fail(e), 'bad'))
          .finally(() => setBusy(null))
      },
    })
  }
  const resend = (): void => {
    setBusy('link')
    rosterioCardLink({ accountId })
      .then(r => UI.toast(r.cardEmailSent ? `Card link sent to ${r.billing.billing?.billingEmail ?? 'the customer'}` : 'The email could not be sent. Copy the link and send it yourself.', r.cardEmailSent ? 'ok' : 'warn'),
        e => UI.toast(fail(e), 'bad'))
      .finally(() => setBusy(null))
  }

  return (
    <div className="col" style={{ gap: 14 }}>
      <Card title={<span ref={head} tabIndex={-1}>Stripe billing</span>} icon="dollar" right={<Chip tone={pill.tone}>{pill.label}</Chip>}>
        <div className="col" style={{ gap: 8 }}>
          {a && <Row label="Amount"><span className="num b">{rosMoneyOf(a.totalCents)}</span> {perOf(a.interval)} incl. GST</Row>}
          {bl.state === 'scheduled' && <Row label="First bill">{F.date(bl.firstBillingDate)}</Row>}
          {bl.state === 'active' && bl.currentPeriodEnd && <Row label="Next bill">{F.date(bl.currentPeriodEnd)}</Row>}
          {bl.state === 'stopping' && <Row label="Ends">{bl.currentPeriodEnd ? F.date(bl.currentPeriodEnd) : 'at the end of this period'}</Row>}
          <Row label="Paid by">{how}</Row>
          <Row label="Sent to"><span className="mono sm">{bl.billingEmail}</span></Row>
          {invoices && <Row label="Owing">{owing > 0 ? <span style={{ color: 'var(--bad2)' }}>{rosMoney(owing)} owing</span> : 'Nothing owing'}</Row>}
          {bl.lastError && <span className="sm" style={{ color: 'var(--bad2)' }}>Last attempt failed: {bl.lastError}</span>}
          {stoppable && (
            <div style={{ marginTop: 4 }}>
              <Btn size="sm" kind="danger" loading={busy === 'stop'} onClick={stop}>{busy === 'stop' ? 'Stopping…' : 'Stop billing'}</Btn>
            </div>
          )}
        </div>
      </Card>
      {bl.state === 'awaiting_card' && (
        <Card title="Waiting for a card" icon="mail">
          <div className="col" style={{ gap: 8 }}>
            <div className="sm">
              {bl.billingEmail} was emailed a link to add a card. Billing starts once they do; nothing is charged before then.{' '}
              <Btn size="xs" kind="ghost" loading={busy === 'link'} onClick={resend}>{busy === 'link' ? 'Sending…' : 'Send again'}</Btn>
            </div>
            {bl.cardUrl && <CardLink url={bl.cardUrl} />}
          </div>
        </Card>
      )}
    </div>
  )
}
