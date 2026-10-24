import { useEffect, useState } from 'react'
import type { XeroSettings, XeroStatus } from '../../api/contract'
import { invoiceError } from '../../api/invoices'
import { xeroAccounts, xeroConnect, xeroDisconnect, xeroSaveSettings, xeroStatus } from '../../api/xero'
import { useLoad } from '../../data/invoicing'
import { Banner, Btn, Card, Chip, Fld, Inp, Skel, Sel, Toggle } from '../../kit'
import { leaveTo } from '../../mail/navigate'
import { FEE_TAX_OPTIONS, TAX_OPTIONS, isXeroId, nextStep, readXeroReturn, settingsPatch, xeroReturnMessage } from '../../shared/xero'
import { UI } from '../../ui/store'

const CODE = /^[A-Za-z0-9._-]{0,10}$/
const DAY = /^\d{4}-\d{2}-\d{2}$/

/** The Connections row in the settings rail. */
export function XeroRailRow() {
  const q = useLoad(s => xeroStatus(s), 'xero-rail')
  const s = q.data
  const chip = q.error ? <Chip title="Couldn't check Xero">Unavailable</Chip>
    : !s ? <Chip>Checking…</Chip>
      : !s.configured ? <Chip title={s.reason}>Not set up</Chip>
        : !s.connected ? <Chip>Not connected</Chip>
          : s.problem ? <Chip tone="bad">Reconnect</Chip>
            : <Chip tone="ok">Connected</Chip>
  return (
    <div className="rowx">
      <span><div className="b">Xero</div><div className="faint sm">{s?.connected ? `Sending to ${s.tenantName}` : 'Invoices and payments to Xero'}</div></span>
      {chip}
    </div>
  )
}

/** Settings > Invoicing > Xero: connect, choose the accounts, and see what is waiting or refused. */
export function XeroCard() {
  const q = useLoad(s => xeroStatus(s), 'xero-card')
  // Xero sends the browser back here with the result of consent in the address; say it once and clear it.
  useEffect(() => {
    const r = readXeroReturn(window.location.search)
    if (!r) return
    UI.toast(xeroReturnMessage(r), r.ok ? undefined : 'bad')
    window.history.replaceState(null, '', window.location.pathname)
  }, [])
  if (q.error) {
    const e = invoiceError(q.error, 'load')
    return <Card title="Xero" icon="plug"><Banner tone={e.kind === 'denied' ? 'info' : 'bad'} action={e.kind === 'denied' ? undefined : <Btn size="sm" onClick={q.reload}>Try again</Btn>}>{e.message}</Banner></Card>
  }
  if (!q.data) return <Card title="Xero" icon="plug"><Skel rows={3} /></Card>
  const s = q.data
  if (!s.configured) {
    return (
      <Card title="Xero" icon="plug">
        <div className="muted">{s.reason ?? 'Xero isn\'t set up on the server.'}</div>
      </Card>
    )
  }
  if (!s.connected || !s.settings) return <ConnectPrompt />
  return <Connected key={s.connectedAt ?? ''} status={s} reload={q.reload} />
}

function ConnectPrompt({ reconnect }: { reconnect?: boolean }) {
  const [busy, setBusy] = useState(false)
  const go = async (): Promise<void> => {
    setBusy(true)
    try { leaveTo((await xeroConnect()).url) } catch (e) { setBusy(false); UI.toast(invoiceError(e, 'save').message, 'bad') }
  }
  return (
    <Card title="Xero" icon="plug">
      <div className="col" style={{ gap: 12 }}>
        <div className="muted">
          Send issued invoices and their payments to Xero. Invoices issued before you connect are not sent.
        </div>
        <div><Btn kind="pri" icon="plug" onClick={() => void go()} loading={busy}>{reconnect ? 'Reconnect to Xero' : 'Connect to Xero'}</Btn></div>
        <div className="faint sm">Choose one Xero organisation when you sign in.</div>
      </div>
    </Card>
  )
}

function Connected({ status, reload }: { status: XeroStatus; reload: () => void }) {
  const [saved, setSaved] = useState<XeroSettings>(status.settings as XeroSettings)
  const [draft, setDraft] = useState<XeroSettings>(status.settings as XeroSettings)
  const [busy, setBusy] = useState(false)
  const [fail, setFail] = useState('')
  const [sure, setSure] = useState(false)
  const accounts = useLoad(s => xeroAccounts(s), 'xero-accounts')
  const patch = settingsPatch(saved, draft)
  const dirty = Object.keys(patch).length > 0
  const set = (p: Partial<XeroSettings>): void => setDraft(d => ({ ...d, ...p }))
  const codeErr = (v: string): string => (CODE.test(v) || isXeroId(v) ? '' : 'Up to 10 letters, digits, dots or dashes')
  const dayErr = DAY.test(draft.syncFrom) && !Number.isNaN(Date.parse(`${draft.syncFrom}T00:00:00Z`)) ? '' : 'Choose a date'
  // Empty is allowed here: nothing is sent until a start date is chosen.
  const stripeDayErr = !draft.stripeFrom || (DAY.test(draft.stripeFrom) && !Number.isNaN(Date.parse(`${draft.stripeFrom}T00:00:00Z`))) ? '' : 'Choose a date'
  const invalid = !!codeErr(draft.salesAccountCode) || !!codeErr(draft.paymentAccountCode) || !!codeErr(draft.clearingAccountCode) || !!codeErr(draft.feeAccountCode) || !!dayErr || !!stripeDayErr
  const step = nextStep({ ...status, settings: saved })

  const save = async (): Promise<void> => {
    if (!dirty || invalid) return
    setBusy(true); setFail('')
    try {
      const r = await xeroSaveSettings(patch)
      setSaved(r.settings); setDraft(r.settings)
      UI.toast('Xero settings saved')
      reload()
    } catch (e) { setFail(invoiceError(e, 'save').message) } finally { setBusy(false) }
  }
  const reconnect = async (): Promise<void> => {
    setBusy(true)
    try { leaveTo((await xeroConnect()).url) } catch (e) { setBusy(false); UI.toast(invoiceError(e, 'save').message, 'bad') }
  }
  const disconnect = async (): Promise<void> => {
    setBusy(true); setFail('')
    try { await xeroDisconnect(); UI.toast('Xero disconnected'); reload() } catch (e) { setFail(invoiceError(e, 'save').message); setBusy(false) }
  }

  // The chart of accounts picks the code when it loaded; if it did not, the code can still be typed.
  const picker = (label: string, value: string, list: Array<{ code: string; name: string }> | undefined, onChange: (v: string) => void, hint: string) => (
    <Fld label={label} hint={hint} err={codeErr(value)}>
      {list
        ? <Sel value={value} onChange={onChange} placeholder="Choose an account…" options={[...(value && !list.some(a => a.code === value) ? [[value, `${isXeroId(value) ? 'Account' : value} (not in Xero)`] as const] : []), ...list.map(a => [a.code, isXeroId(a.code) ? a.name : `${a.code} · ${a.name}`] as const)]} />
        : <Inp className="mono" value={value} onChange={onChange} placeholder="e.g. 200" />}
    </Fld>
  )

  if (status.problem) return <ConnectPrompt reconnect />

  return (
    <Card title="Xero" icon="plug" right={<Chip tone="ok">Connected to {status.tenantName}</Chip>}>
      <div className="col" style={{ gap: 14 }}>
        {step && <Banner tone="warn">{step}</Banner>}
        {fail && <Banner tone="bad">{fail}</Banner>}
        {!!accounts.error && <Banner tone="info">Couldn't load Xero accounts. Enter the codes instead.</Banner>}
        <div className="grid g2">
          {picker('Sales account', draft.salesAccountCode, accounts.data?.sales, v => set({ salesAccountCode: v }), 'Account for invoice lines')}
          {picker('Bank account for payments', draft.paymentAccountCode, accounts.data?.bank, v => set({ paymentAccountCode: v }), 'Account that receives payments')}
          <Fld label="Tax type with GST"><Sel value={draft.gstTaxType} onChange={v => set({ gstTaxType: v as XeroSettings['gstTaxType'] })} options={TAX_OPTIONS} /></Fld>
          <Fld label="Tax type without GST"><Sel value={draft.noGstTaxType} onChange={v => set({ noGstTaxType: v as XeroSettings['noGstTaxType'] })} options={TAX_OPTIONS} /></Fld>
        </div>
        <div className="row" style={{ alignItems: 'flex-start', gap: 10 }}>
          <Toggle on={draft.autoSync} onChange={v => set({ autoSync: v })} label="Send invoices automatically" />
          <div>
            <div className="b">Send invoices automatically</div>
            <div className="sm muted">{draft.autoSync ? 'Issued invoices and payments go to Xero within minutes.' : 'Off. Use Send to Xero on each invoice.'}</div>
          </div>
        </div>
        <Fld label="Start from" hint="Earlier invoices are not sent automatically" err={dayErr}>
          <Inp type="date" value={draft.syncFrom} onChange={v => set({ syncFrom: v })} style={{ maxWidth: 200 }} />
        </Fld>
        <div className="col" style={{ gap: 12, borderTop: '1px solid var(--line)', paddingTop: 14 }}>
          <div className="b">Stripe invoices</div>
          {status.bankScope === false && <Banner tone="warn" action={<Btn size="sm" onClick={() => void reconnect()} loading={busy}>Reconnect to Xero</Btn>}>Reconnect Xero to allow bank transactions.</Banner>}
          <div className="row" style={{ alignItems: 'flex-start', gap: 10 }}>
            <Toggle on={draft.stripeSync} onChange={v => set({ stripeSync: v })} label="Send Stripe invoices automatically" />
            <div>
              <div className="b">Send Stripe invoices automatically</div>
              <div className="sm muted">{draft.stripeSync ? 'Rosterio invoices, their payments and Stripe fees go to Xero within minutes.' : 'Off. Use Send to Xero on each Rosterio invoice.'}</div>
            </div>
          </div>
          <Fld label="Stripe start date" hint="Leave empty to send nothing. Earlier invoices are not sent automatically." err={stripeDayErr}>
            <Inp type="date" value={draft.stripeFrom} onChange={v => set({ stripeFrom: v })} style={{ maxWidth: 200 }} />
          </Fld>
          <div className="grid g2">
            {picker('Stripe clearing account', draft.clearingAccountCode, accounts.data?.bank, v => set({ clearingAccountCode: v }), 'Bank-type account that holds Stripe money')}
            {picker('Stripe fees account', draft.feeAccountCode, accounts.data?.expense, v => set({ feeAccountCode: v }), 'Expense account for Stripe fees')}
            <Fld label="Fee GST"><Sel value={draft.feeTaxType} onChange={v => set({ feeTaxType: v as XeroSettings['feeTaxType'] })} options={FEE_TAX_OPTIONS} /></Fld>
          </div>
        </div>
        <div className="row wrap" style={{ gap: 10 }}>
          <Btn kind="pri" onClick={() => void save()} disabled={!dirty || invalid} loading={busy}>Save Xero settings</Btn>
          <span className="faint sm">{status.counts.waiting} waiting · {status.counts.failed} to fix</span>
          <span className="sp" />
          {sure
            ? <><span className="sm muted">Disconnect Xero?</span><Btn size="sm" kind="danger" onClick={() => void disconnect()} loading={busy}>Disconnect</Btn><Btn size="sm" onClick={() => setSure(false)}>Keep</Btn></>
            : <Btn size="sm" kind="ghost" onClick={() => setSure(true)}>Disconnect</Btn>}
        </div>
      </div>
    </Card>
  )
}
