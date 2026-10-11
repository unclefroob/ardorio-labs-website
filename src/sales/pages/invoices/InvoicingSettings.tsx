import { useState } from 'react'
import type { InvoiceSettings } from '../../api/contract'
import { getInvoiceSettings, invoiceError, putInvoiceSettings } from '../../api/invoices'
import { useLoad } from '../../data/invoicing'
import { Banner, Btn, Card, Chip, Fld, Inp, Skel, TA, Toggle } from '../../kit'
import { DEFAULT_TERMS_DAYS, validateSettings, type SettingsErrors } from '../../shared/invoices'
import { UI } from '../../ui/store'

/** Settings > Invoicing: the business profile printed on every invoice, plus the defaults a new invoice starts from. */
export function InvoicingSettings() {
  const q = useLoad(s => getInvoiceSettings(s), 'settings')
  if (q.error) {
    const e = invoiceError(q.error, 'load')
    return <Card><Banner tone={e.kind === 'denied' ? 'info' : 'bad'} icon={e.kind === 'denied' ? 'lock' : undefined} action={e.kind === 'denied' ? undefined : <Btn size="sm" onClick={q.reload}>Try again</Btn>}>{e.message}</Banner></Card>
  }
  if (!q.data) return <Card><Skel rows={5} /></Card>
  return <SettingsForm initial={q.data} />
}

function SettingsForm({ initial }: { initial: InvoiceSettings }) {
  const [s, setS] = useState<InvoiceSettings>(initial)
  const [errors, setErrors] = useState<SettingsErrors>({})
  const [busy, setBusy] = useState(false)
  const [fail, setFail] = useState('')
  const stripe = initial.stripeConfigured === true
  const bank = (patch: Partial<InvoiceSettings['bank']>): void => setS(p => ({ ...p, bank: { ...p.bank, ...patch } }))

  const save = async (): Promise<void> => {
    const e = validateSettings(s)
    setErrors(e)
    if (Object.keys(e).length) return
    setBusy(true)
    setFail('')
    try {
      const { stripeConfigured: _ignored, ...body } = s
      void _ignored
      const saved = await putInvoiceSettings(body)
      setS(saved)
      UI.toast('Invoicing settings saved')
    } catch (err) {
      setFail(invoiceError(err, 'save').message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="col" style={{ gap: 14 }}>
      <div className="row wrap">
        <div className="muted">Business details and defaults used on every invoice. Only Ardorio admins can change these.</div>
        <span className="sp" />
        <Btn kind="pri" onClick={() => void save()} disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</Btn>
      </div>
      {fail && <Banner tone="bad">{fail}</Banner>}
      <div className="inv-cols">
        <div className="inv-main">
          <Card title="Business details">
            <div className="col" style={{ gap: 14 }}>
              <div className="grid g2">
                <Fld label="Business name" req err={errors.name}><Inp value={s.name} onChange={v => setS({ ...s, name: v })} /></Fld>
                <Fld label="ABN" err={errors.abn}><Inp className="mono" value={s.abn} onChange={v => setS({ ...s, abn: v })} /></Fld>
                <Fld label="Business email" err={errors.email}><Inp type="email" value={s.email} onChange={v => setS({ ...s, email: v })} /></Fld>
              </div>
              <Fld label="Address"><TA rows={2} value={s.address} onChange={v => setS({ ...s, address: v })} /></Fld>
            </div>
          </Card>
          <Card title="How clients pay">
            <div className="col" style={{ gap: 14 }}>
              <div className="grid g2">
                <Fld label="Account name"><Inp value={s.bank.accountName} onChange={v => bank({ accountName: v })} /></Fld>
                <Fld label="BSB" err={errors.bsb}><Inp className="mono" value={s.bank.bsb} onChange={v => bank({ bsb: v })} /></Fld>
                <Fld label="Account number"><Inp className="mono" value={s.bank.accountNumber} onChange={v => bank({ accountNumber: v })} /></Fld>
                <Fld label="PayID"><Inp value={s.bank.payId} onChange={v => bank({ payId: v })} /></Fld>
              </div>
              <div className="faint sm">Shown on every invoice and on the public pay page. Bank transfer and PayID are free to receive.</div>
            </div>
          </Card>
          <Card title="Defaults for new invoices">
            <div className="col" style={{ gap: 14 }}>
              <div className="grid g2">
                <Fld label="Payment terms (days)" hint="Fixed for now. Each invoice can still change its own terms."><Inp className="num" value={DEFAULT_TERMS_DAYS} disabled readOnly /></Fld>
                <Fld label="GST" hint={s.gstRegistered ? 'New invoices charge 10% GST. Each invoice can set its own rate.' : 'New invoices charge no GST. Each invoice can set its own rate.'}>
                  <div className="row"><Toggle on={s.gstRegistered} onChange={v => setS({ ...s, gstRegistered: v })} label="Registered for GST" /><span>Registered for GST</span></div>
                </Fld>
              </div>
              <div className="row" style={{ alignItems: 'flex-start', gap: 10 }}>
                <Toggle on={s.offerCardPayments && stripe} onChange={v => setS({ ...s, offerCardPayments: v })} label="Offer card payment by default" disabled={!stripe} />
                <div>
                  <div className={'b' + (stripe ? '' : ' faint')}>Offer card payment by default</div>
                  <div className="sm muted">{stripe ? 'New invoices start with the card option on. Each invoice can still change it. Card costs about 1.7% + A$0.30 to receive.' : 'Unavailable until card payments are set up on the server.'}</div>
                </div>
              </div>
            </div>
          </Card>
        </div>
        <div className="inv-rail">
          <Card title="Connections">
            <div className="rowx"><span><div className="b">Stripe card payments</div><div className="faint sm">Single-use links, card only</div></span><Chip tone={stripe ? 'ok' : ''}>{stripe ? 'Connected' : 'Not set up'}</Chip></div>
            <div className="rowx"><span><div className="b">Xero</div><div className="faint sm">Accounting sync, planned for the next phase</div></span><Chip>Not connected</Chip></div>
          </Card>
        </div>
      </div>
    </div>
  )
}
