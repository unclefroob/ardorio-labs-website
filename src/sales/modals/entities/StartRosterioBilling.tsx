import { useState } from 'react'
import type { RosterioCollection } from '../../api/contract'
import { SalesHttpError } from '../../api/http'
import { rosterioBillingStart } from '../../api/rosterio'
import { billingChanged, dayText, firstOfNextMonth, perOf, rosMoneyOf, useRosterioBilling } from '../../data/rosterioBilling'
import { Q } from '../../data/Q'
import { Banner, Btn, Fld, Inp, Seg, Skel } from '../../kit/basic'
import { Modal } from '../../kit/overlay'
import { UI } from '../../ui/store'

/**
 * Start a managed Rosterio account's billing in Stripe, from its agreed terms: an emailed invoice each period or a card on
 * file, from a first billing date, plus GST. Rosterio sets it up (the customer, the subscription, the card link); this is
 * the operator's view of what will happen, confirmed in one line before anything is created.
 */
type When = 'today' | 'next' | 'pick'

export function StartRosterioBilling({ companyId }: { companyId: string }) {
  const b = useRosterioBilling(companyId)
  const [collection, setCollection] = useState<RosterioCollection>('send_invoice')
  const [when, setWhen] = useState<When>('next')
  const [picked, setPicked] = useState('')
  const [days, setDays] = useState('14')
  const [email, setEmail] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [fieldErr, setFieldErr] = useState<Record<string, string>>({})
  const [cardSent, setCardSent] = useState<{ sent: boolean; url: string | null; to: string } | null>(null)
  const company = Q.company(companyId)
  const v = b.data

  if (cardSent) {
    return (
      <Modal title="Waiting for a card" icon="dollar" sub={company?.name} width={520} footer={<Btn kind="pri" onClick={UI.close}>Done</Btn>}>
        <div className="col" style={{ gap: 10 }}>
          {cardSent.sent
            ? <Banner tone="ok">We emailed {cardSent.to} a link to add a card. Billing starts once they do; nothing is charged before then.</Banner>
            : <Banner tone="warn">The email to {cardSent.to} could not be sent. Send them this link yourself; billing starts once they add a card.</Banner>}
          {cardSent.url && <CardLink url={cardSent.url} />}
        </div>
      </Modal>
    )
  }

  const first = !v ? '' : when === 'today' ? v.today : when === 'next' ? firstOfNextMonth(v.today) : picked
  const to = (email ?? v?.billingEmail ?? '').trim()
  const a = v?.amounts
  const t = v?.terms
  const daysN = Number(days)

  const go = async (): Promise<void> => {
    setErr('')
    setFieldErr({})
    if (!first) return setFieldErr({ firstBillingDate: 'Choose the first billing date' })
    setBusy(true)
    try {
      const r = await rosterioBillingStart({
        companyId, collection, firstBillingDate: first, ...(collection === 'send_invoice' ? { daysUntilDue: daysN } : {}), ...(to ? { billingEmail: to } : {}),
      })
      billingChanged(companyId)
      if (r.billing.billing?.state === 'awaiting_card') {
        setCardSent({ sent: r.cardEmailSent === true, url: r.billing.billing.cardUrl, to: r.billing.billing.billingEmail })
        return
      }
      UI.close()
      UI.toast(r.billing.billing?.state === 'scheduled' ? `Billing starts ${dayText(first)}` : 'Billing started in Stripe')
    } catch (e) {
      if (e instanceof SalesHttpError) {
        const errors = (e.body?.details as { errors?: Record<string, string> } | undefined)?.errors
        if (errors) setFieldErr(errors)
        setErr(e.message)
      } else setErr('Could not reach the server. Nothing was started. Try again.')
    } finally {
      setBusy(false)
    }
  }

  const summary = v && a && first
    ? collection === 'send_invoice'
      ? `Stripe will email ${to || 'the customer'} an invoice for ${rosMoneyOf(a.totalCents)} (${rosMoneyOf(a.subtotalCents)} + ${rosMoneyOf(a.gstCents)} GST) ${perOf(a.interval)}, from ${dayText(first)}, due in ${daysN || 14} days.`
      : `Stripe will charge ${rosMoneyOf(a.totalCents)} (${rosMoneyOf(a.subtotalCents)} + ${rosMoneyOf(a.gstCents)} GST) ${perOf(a.interval)} to a card on file, from ${dayText(first)}. If they have no card yet, ${to || 'they'} will be emailed a link to add one, and nothing is charged until they do.`
    : ''

  return (
    <Modal
      title="Start billing in Stripe"
      icon="dollar"
      sub={company?.name}
      width={580}
      footer={
        <>
          {err && <span className="sm" role="alert" style={{ color: 'var(--bad2)', flex: 1 }}>{err}</span>}
          <Btn onClick={UI.close} disabled={busy}>Cancel</Btn>
          <Btn kind="pri" icon="dollar" onClick={() => void go()} loading={busy} disabled={!v?.canStart || !first || !to}>{busy ? 'Starting…' : 'Start billing'}</Btn>
        </>
      }
    >
      {!v ? (
        b.error ? <Banner tone="bad">{b.error instanceof SalesHttpError ? b.error.message : 'Could not read billing from Rosterio. Try again.'}</Banner> : <Skel rows={5} label="Reading the account's terms" />
      ) : !v.canStart ? (
        <Banner tone="info">{v.cannotStartReason}</Banner>
      ) : (
        <div className="col" style={{ gap: 14 }}>
          {t && a && (
            <div className="card card-b sm col" style={{ gap: 4, background: 'var(--surf2)' }}>
              <b>{v.accountName}&apos;s terms{t.contractReference ? ` · ${t.contractReference}` : ''}</b>
              <span>
                {t.billingModel === 'flat' ? `${rosMoneyOf(t.amountCents)} ${perOf(t.interval)}, flat` : `${rosMoneyOf(t.amountCents)} per user ${perOf(t.interval)} × ${a.quantity}`}
                {` + ${a.gstPercent}% GST = `}<b className="num">{rosMoneyOf(a.totalCents)}</b> {perOf(a.interval)}
              </span>
              <span className="faint">{t.effectiveUntil ? `Ends ${dayText(t.effectiveUntil.slice(0, 10))}; billing stops then.` : 'No end date: billed until stopped.'} To change the price, correct the terms in Rosterio; billing follows from the next bill.</span>
            </div>
          )}
          <Fld label="How they pay" err={fieldErr.collection}>
            <Seg label="How they pay" value={collection} onChange={k => setCollection(k as RosterioCollection)} opts={[['send_invoice', 'Emailed invoice', 'mail'], ['charge_automatically', 'Card on file', 'dollar']]} />
          </Fld>
          <div className="grid g2">
            <Fld label="First bill" err={fieldErr.firstBillingDate} hint={`On ${v.timezone.replace('_', ' ')} time; then every ${a?.interval === 'yearly' ? 'year' : 'month'} on that day.`}>
              <div className="col" style={{ gap: 6 }}>
                <Seg label="First bill" value={when} onChange={k => setWhen(k as When)} opts={[['today', 'Today'], ['next', dayText(firstOfNextMonth(v.today))], ['pick', 'Pick a date']]} />
                {when === 'pick' && <Inp type="date" aria-label="First billing date" value={picked} onChange={setPicked} min={v.today} />}
              </div>
            </Fld>
            {collection === 'send_invoice' && (
              <Fld label="Days to pay" err={fieldErr.daysUntilDue}>
                <Inp type="number" min={1} max={60} value={days} onChange={setDays} style={{ width: 100 }} />
              </Fld>
            )}
          </div>
          <Fld label="Billing email" err={fieldErr.billingEmail} hint="Invoices, receipts and the card link go here. Saved on the Rosterio account.">
            <Inp type="email" value={email ?? v.billingEmail ?? ''} onChange={setEmail} placeholder="accounts@company.com" />
          </Fld>
          {summary && <Banner tone="info">{summary}</Banner>}
        </div>
      )}
    </Modal>
  )
}

/** The customer's "add your card" link, to copy and send yourself. */
export function CardLink({ url }: { url: string }) {
  const copy = (): void => {
    if (!navigator.clipboard) return UI.toast('Copy is not available in this browser. Select the link and copy it.', 'warn')
    navigator.clipboard.writeText(url).then(() => UI.toast('Link copied'), () => UI.toast('Could not copy. Select the link and copy it.', 'warn'))
  }
  return (
    <div className="row" style={{ gap: 8 }}>
      <Inp readOnly aria-label="Card link" value={url} onChange={() => undefined} className="mono" style={{ flex: 1, minWidth: 0 }} onFocus={e => e.currentTarget.select()} />
      <Btn size="sm" icon="copy" onClick={copy}>Copy</Btn>
    </div>
  )
}
