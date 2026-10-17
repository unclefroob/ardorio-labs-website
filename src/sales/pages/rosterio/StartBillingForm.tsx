import { useId, useState, type ReactNode, type Ref } from 'react'
import type { RosterioBilling, RosterioCollection } from '../../api/contract'
import { SalesHttpError } from '../../api/http'
import { rosterioBillingStart } from '../../api/rosterio'
import { billingChanged, dayText, firstOfNextMonth, perOf, rosMoneyOf } from '../../data/rosterioBilling'
import { Banner, Btn, Card, Fld, Inp, Seg } from '../../kit/basic'
import { UI } from '../../ui/store'

/**
 * Start a managed Rosterio account's billing in Stripe, from its agreed terms: an emailed invoice each period or a card on
 * file, from a first billing date, plus GST. Rosterio sets it up (the customer, the subscription, the card link); this
 * shows what will happen before anything is created. It sits in the Billing tab, so there is no pop-up to confirm.
 */
type When = 'today' | 'next' | 'pick'

const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null

/** Rosterio's per-field messages from a refused start (details.errors), if the reply has them. */
function fieldErrorsOf(body: unknown): Record<string, string> | undefined {
  const errors = isRecord(body) && isRecord(body.details) ? body.details.errors : undefined
  if (!isRecord(errors)) return undefined
  return Object.fromEntries(Object.entries(errors).filter((e): e is [string, string] => typeof e[1] === 'string'))
}

/** A labelled set of controls (a segmented choice, say). A label needs one control to point at, so this is a group with a name. */
function Group({ label, hint, err, children }: { label: string; hint?: ReactNode; err?: ReactNode; children: ReactNode }) {
  const id = useId()
  return (
    <div className="fld" role="group" aria-labelledby={id}>
      <span id={id} style={{ fontSize: 12, fontWeight: 600, color: 'var(--fg2)' }}>{label}</span>
      {children}
      {err ? <div className="err" role="alert">{err}</div> : hint && <div className="hint">{hint}</div>}
    </div>
  )
}

export function StartBillingForm({ accountId, companyId, v, onChanged, headRef }: {
  accountId: string; companyId?: string; v: RosterioBilling; onChanged: () => void; headRef: Ref<HTMLElement>
}) {
  const [collection, setCollection] = useState<RosterioCollection>('send_invoice')
  const [every, setEvery] = useState<'monthly' | 'yearly'>(v.terms?.interval ?? 'monthly')
  const [when, setWhen] = useState<When>('next')
  const [picked, setPicked] = useState('')
  const [days, setDays] = useState('14')
  const [email, setEmail] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [fieldErr, setFieldErr] = useState<Record<string, string>>({})

  const first = when === 'today' ? v.today : when === 'next' ? firstOfNextMonth(v.today) : picked
  const to = (email ?? v.billingEmail ?? '').trim()
  const t = v.terms
  // The bill as chosen: monthly or yearly (Rosterio gives both). An older reply without options bills the terms as they are.
  const opt = v.options.find(o => o.interval === every)
  const a = opt && v.amounts ? { ...v.amounts, ...opt } : v.amounts
  const changesTerms = opt?.changesTerms === true
  const sendsInvoice = collection === 'send_invoice'
  const daysN = Number(days)
  const daysOk = days.trim() !== '' && Number.isInteger(daysN) && daysN >= 1 && daysN <= 60
  // Why Start is off, shown next to the field that needs fixing.
  const dateProblem = when === 'pick' && !picked ? 'Choose the first billing date' : ''
  const emailProblem = to ? '' : 'A billing email is required'
  const daysProblem = sendsInvoice && !daysOk ? 'Days to pay must be a whole number from 1 to 60' : ''
  const ready = !!first && !!to && !daysProblem

  const go = async (): Promise<void> => {
    setErr('')
    setFieldErr({})
    if (!ready) return
    setBusy(true)
    try {
      const r = await rosterioBillingStart({
        accountId, collection, firstBillingDate: first, ...(sendsInvoice ? { daysUntilDue: daysN } : {}), ...(to ? { billingEmail: to } : {}),
        ...(opt ? { interval: every } : {}),
      })
      billingChanged({ accountId }, ...(companyId ? [{ companyId }] : []))
      onChanged()
      if (r.billing.billing?.state === 'awaiting_card') {
        const sent = r.cardEmailSent === true
        UI.toast(sent ? `Card link sent to ${r.billing.billing.billingEmail}` : 'The email could not be sent. Copy the link and send it yourself.', sent ? 'ok' : 'warn')
      } else UI.toast(r.billing.billing?.state === 'scheduled' ? `Billing starts ${dayText(first)}` : 'Billing started in Stripe')
    } catch (e) {
      if (e instanceof SalesHttpError) {
        const errors = fieldErrorsOf(e.body)
        if (errors) setFieldErr(errors)
        setErr(e.message)
      } else setErr('Could not reach the server. Nothing was started. Try again.')
    } finally {
      setBusy(false)
    }
  }

  const summary = a && first && !daysProblem
    ? sendsInvoice
      ? `Stripe will email ${to || 'the customer'} an invoice for ${rosMoneyOf(a.totalCents)} (${rosMoneyOf(a.subtotalCents)} + ${rosMoneyOf(a.gstCents)} GST) ${perOf(a.interval)}, from ${dayText(first)}, due in ${daysN} days.`
      : `Stripe will charge ${rosMoneyOf(a.totalCents)} (${rosMoneyOf(a.subtotalCents)} + ${rosMoneyOf(a.gstCents)} GST) ${perOf(a.interval)} to a card on file, from ${dayText(first)}. If they have no card yet, ${to || 'they'} will be emailed a link to add one, and nothing is charged until they do.`
    : ''

  return (
    <div className="grid g2" style={{ alignItems: 'start' }}>
      <Card title={<span ref={headRef} tabIndex={-1}>Start billing in Stripe</span>} icon="dollar">
        <div className="col" style={{ gap: 14 }}>
          {t && a && (
            <div className="card card-b sm col" style={{ gap: 4, background: 'var(--surf2)' }}>
              <b>What it bills{t.contractReference ? ` · ${t.contractReference}` : ''}</b>
              <span>
                Terms: {t.billingModel === 'flat' ? `${rosMoneyOf(t.amountCents)} ${perOf(t.interval)}, flat` : `${rosMoneyOf(t.amountCents)} per user ${perOf(t.interval)}`}, ex GST
              </span>
              <span className="faint">{t.effectiveUntil ? `Ends ${dayText(t.effectiveUntil.slice(0, 10))}; billing stops then.` : 'No end date: billed until stopped.'}</span>
            </div>
          )}
          {v.options.length === 2 && (
            <Group
              label="How often"
              hint={changesTerms && t && opt
                ? `Billing ${every} changes the terms to ${rosMoneyOf(opt.unitAmountCents)} ${perOf(every)}${t.billingModel === 'flat' ? '' : ' per user'} (from ${rosMoneyOf(t.amountCents)} ${perOf(t.interval)}), the same over a year.`
                : 'As the terms say.'}
            >
              <Seg
                className="nowrap"
                label="How often"
                value={every}
                onChange={k => setEvery(k === 'yearly' ? 'yearly' : 'monthly')}
                opts={v.options.map(o => [o.interval, `${o.interval === 'monthly' ? 'Monthly' : 'Yearly'} · ${rosMoneyOf(o.totalCents)}`] as const)}
              />
            </Group>
          )}
          <Group label="How they pay" err={fieldErr.collection}>
            <Seg className="nowrap" label="How they pay" value={collection} onChange={k => setCollection(k as RosterioCollection)} opts={[['send_invoice', 'Emailed invoice', 'mail'], ['charge_automatically', 'Card on file', 'dollar']]} />
          </Group>
          <Group label="First bill" err={fieldErr.firstBillingDate ?? dateProblem} hint={`On ${v.timezone.replace('_', ' ')} time; then every ${a?.interval === 'yearly' ? 'year' : 'month'} on that day.`}>
            <div className="col" style={{ gap: 6 }}>
              <Seg className="nowrap" label="First bill" value={when} onChange={k => setWhen(k as When)} opts={[['today', 'Today'], ['next', dayText(firstOfNextMonth(v.today))], ['pick', 'Pick a date']]} />
              {when === 'pick' && <Inp type="date" aria-label="First billing date" value={picked} onChange={setPicked} min={v.today} style={{ maxWidth: 200 }} />}
            </div>
          </Group>
          {sendsInvoice && (
            <Fld label="Days to pay" err={fieldErr.daysUntilDue ?? daysProblem} hint="1 to 60 days">
              <Inp type="number" min={1} max={60} value={days} onChange={setDays} style={{ width: 100 }} />
            </Fld>
          )}
          <Fld label="Billing email" err={fieldErr.billingEmail ?? emailProblem} hint="Invoices, receipts and the card link go here. Saved on the Rosterio account.">
            <Inp type="email" value={email ?? v.billingEmail ?? ''} onChange={setEmail} placeholder="accounts@company.com" />
          </Fld>
        </div>
      </Card>
      <Card title="What Stripe will do" icon="info">
        <div className="col" style={{ gap: 12 }}>
          {summary ? <div role="status">{summary}{changesTerms ? ` The terms move to ${every} billing when it starts.` : ''}</div> : <div className="faint">Choose the first bill to see what Stripe will do.</div>}
          {a && first && !daysProblem && (
            <div className="card card-b sm col" style={{ gap: 2, background: 'var(--surf2)' }} aria-label="The invoice, line by line">
              <b>The invoice shows</b>
              <div className="row"><span>Rosterio subscription</span><span className="sp" /><span className="num">{rosMoneyOf(a.subtotalCents)}</span></div>
              <div className="row"><span>GST ({a.gstPercent}%)</span><span className="sp" /><span className="num">{rosMoneyOf(a.gstCents)}</span></div>
              <div className="row"><b>Total</b><span className="sp" /><b className="num">{rosMoneyOf(a.totalCents)}</b></div>
            </div>
          )}
          <div className="faint sm">Nothing is created until you press Start billing. You can stop it again later.</div>
          {err && <Banner tone="bad">{err}</Banner>}
          <div>
            <Btn kind="pri" icon="dollar" onClick={() => void go()} loading={busy} disabled={!ready}>{busy ? 'Starting…' : 'Start billing'}</Btn>
          </div>
        </div>
      </Card>
    </div>
  )
}
