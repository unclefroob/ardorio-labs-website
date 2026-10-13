import { useState } from 'react'
import type { BillingClient, InvoiceDto, InvoiceSettings } from '../../api/contract'
import {
  createInvoice, deleteInvoice, getInvoiceSettings, invoiceError, issueInvoice, listBillingClients, listInvoices, updateInvoice,
} from '../../api/invoices'
import { Act } from '../../data/Act'
import { F } from '../../data/F'
import { ardCompanies, ardDeals, billingPlans, useLoad } from '../../data/invoicing'
import { Q } from '../../data/Q'
import { useStore } from '../../data/store'
import { Banner, Btn, Card, Chip, Fld, Inp, Link, Sel, Skel, TA, Toggle } from '../../kit'
import {
  activityItems, actionsFor, blankForm, buildInput, emptyLine, fmtDay, formFromInvoice, formTotals, milestoneLine, milestoneStatus,
  missingBilling, planFor, validateForm, withTerms, type FormErrors, type InvoiceForm,
} from '../../shared/invoices'
import { claimedRetainerDate, dayOrdinal, prefillForm, retainerAutoState, retainerPeriodLabel } from '../../shared/billing'
import { formatCents, lineAmountCents, parsePercentBp } from '../../shared/money'
import { PageHead } from '../../shared/PageHead'
import { UI } from '../../ui/store'
import { downloadPdf } from './actions'
import { MoreMenu } from './MoreMenu'
import { catchUpPlans, ClashBanner, DoubledRetainer, findRetainerDraft, type RetainerClash } from './retainerClash'
import { RetainerChip, StatusChip, TestChip } from './parts'
import { TestBanner, testItems, useTestActions } from './testActions'
import { Activity, Totals } from './rail'
import { InvoicesDenied } from './states'

/**
 * The due retainer period a new invoice from the deal's billing card bills, or undefined. Only a period that is still
 * the plan's due date, and not yet claimed by the server, is offered; otherwise the invoice is an extra one.
 */
function claimFor(initial: Props['initial']): string | undefined {
  const due = initial?.retainer ? initial.retainerFor : undefined
  if (!due || !initial?.dealId) return undefined
  const r = planFor(billingPlans(), initial.dealId)?.retainer
  return r && r.nextInvoiceDate === due && retainerAutoState(r, F.today()) === 'due' ? due : undefined
}

interface Props {
  /** null: a new invoice. */
  invoice: InvoiceDto | null
  /** retainerFor: the due retainer period this new invoice bills; saving it moves the plan's next invoice date on. */
  initial?: { companyId?: string; dealId?: string; milestoneId?: string; retainer?: boolean; retainerFor?: string }
  onChange?: (inv: InvoiceDto) => void
  /** Set when editing a sent invoice, to go back to the read-only view. */
  onCancel?: () => void
}

export function InvoiceEditor(props: Props) {
  const settings = useLoad(s => getInvoiceSettings(s), 'settings')
  const clients = useLoad(s => listBillingClients(s), 'clients')
  const denied = [settings.error, clients.error].some(e => e && invoiceError(e, 'load').kind === 'denied')
  if (denied) return <InvoicesDenied />
  // A new invoice starts from the business defaults, so wait for them (or for the request to fail) before building the form.
  if (!props.invoice && settings.loading) return <div className="page"><Skel rows={6} /></div>
  return <EditorForm {...props} settings={settings.data} clients={clients.data?.clients ?? []} reloadClients={clients.reload} />
}

function EditorForm({ invoice, initial, onChange, onCancel, settings, clients, reloadClients }: Props & { settings: InvoiceSettings | null; clients: BillingClient[]; reloadClients: () => void }) {
  useStore()
  const today = F.today()
  const isNew = !invoice
  const acts = actionsFor(invoice)
  const ta = useTestActions(invoice, i => onChange?.(i))
  const testOptions = invoice ? testItems(invoice, ta, false) : []
  const stripeOff = settings?.stripeConfigured === false
  const [f, setF] = useState<InvoiceForm>(() => {
    if (invoice) return formFromInvoice(invoice)
    const base = blankForm(today, { gstPct: settings && !settings.gstRegistered ? '0' : '10', card: !!settings?.offerCardPayments && !stripeOff })
    const co = initial?.companyId && ardCompanies().some(c => c.id === initial.companyId) ? initial.companyId : ''
    const deal = initial?.dealId && ardDeals(co).some(d => d.id === initial.dealId) ? initial.dealId : ''
    return deal ? prefillForm(base, { companyId: co, dealId: deal, milestoneId: initial?.milestoneId, retainer: initial?.retainer, retainerFor: claimFor(initial) }, planFor(billingPlans(), deal)) : { ...base, companyId: co, dealId: deal }
  })
  // Fixed when the editor opens, so the period claimed is the one the card offered.
  const [claiming] = useState(() => {
    const due = isNew ? claimFor(initial) : undefined
    return due && initial?.dealId ? { dealId: initial.dealId, due } : null
  })
  const [tried, setTried] = useState(false)
  const [busy, setBusy] = useState<'' | 'save' | 'issue' | 'pdf' | 'delete'>('')
  const [fail, setFail] = useState('')
  const [notice, setNotice] = useState('')
  // The server drafted the period before this was saved: ask before making a second invoice for it.
  const [clash, setClash] = useState<RetainerClash | null>(null)
  // The user chose to save an extra invoice after that, so nothing is claimed.
  const [extra, setExtra] = useState(false)
  // Saved, but the claim lost to the server's draft: two invoices for one month, shown in place of the form.
  const [doubled, setDoubled] = useState<{ saved: InvoiceDto; clash: RetainerClash } | null>(null)
  const set = (patch: Partial<InvoiceForm>): void => setF(p => ({ ...p, ...patch }))

  const client = clients.find(c => c.linkedCompanyId === f.companyId)
  // A stored invoice keeps its billing client (the API refuses a change), so it never depends on the clients list.
  // A new invoice resolves the billing client from the chosen company.
  const slug = invoice ? invoice.clientSlug : f.companyId ? (client?.slug ?? '') : f.clientSlug
  const form: InvoiceForm = { ...f, clientSlug: slug }
  const { ok, errors }: { ok: boolean; errors: FormErrors } = validateForm(form)
  const totals = formTotals(form)
  const bp = parsePercentBp(f.gstPct) ?? 0

  const companies = ardCompanies()
  const deals = f.companyId ? ardDeals(f.companyId) : []
  const plan = planFor(billingPlans(), f.dealId || null)
  const dealInvoices = useLoad(s => (f.dealId ? listInvoices({ dealId: f.dealId }, s).then(r => r.invoices) : Promise.resolve([] as InvoiceDto[])), `deal:${f.dealId}`)
  const taken = dealInvoices.data ?? []

  const pickCompany = (companyId: string): void => set({ companyId, dealId: '', milestoneId: '' })
  const pickDeal = (dealId: string): void => set({ dealId, milestoneId: '' })
  const pickMilestone = (milestoneId: string): void => {
    const m = plan?.milestones.find(x => x.id === milestoneId)
    const blank = f.lines.length === 1 && !f.lines[0].description.trim() && !f.lines[0].unitPrice.trim()
    if (m && blank) set({ milestoneId, lines: [{ ...emptyLine(), ...milestoneLine(m) }] })
    else set({ milestoneId })
  }
  const setLine = (i: number, patch: Partial<InvoiceForm['lines'][number]>): void => set({ lines: f.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) })

  const company = f.companyId ? Q.company(f.companyId) : undefined
  const claimNext = claiming ? claimedRetainerDate(claiming.due, planFor(billingPlans(), claiming.dealId)?.retainer?.anchorDay) : { next: '' }
  const lacks = missingBilling(client)

  /** Saves what is on screen. Returns the stored invoice, or null after showing why not. */
  const persist = async (): Promise<InvoiceDto | null> => {
    setTried(true)
    if (!ok) {
      setFail('Fix the highlighted fields first.')
      return null
    }
    setFail('')
    const claim = !invoice && claiming && !extra && form.dealId === claiming.dealId ? claiming : null
    try {
      if (claim) {
        // The scheduler runs every 30 seconds, so check the period is still unclaimed against the server, not the
        // plan as it was when the editor opened.
        await catchUpPlans()
        const problem = Act.retainerClaimProblem(claim.dealId, claim.due)
        if (problem) {
          setClash({ ...claim, reason: problem, draft: await findRetainerDraft(claim.dealId, claim.due) })
          return null
        }
      }
      const input = buildInput(form)
      const saved = invoice ? await updateInvoice(invoice.id, input) : await createInvoice(input)
      if (claim && saved.dealId === claim.dealId) {
        await catchUpPlans()
        const c = Act.claimRetainerPeriod(claim.dealId, claim.due)
        if (!c.ok) {
          // Saved, but the server drafted the same month first. Stop here (no issue, no navigation) and say so.
          setDoubled({ saved, clash: { ...claim, reason: c.error, draft: await findRetainerDraft(claim.dealId, claim.due) } })
          return null
        }
        UI.toast(`The ${retainerPeriodLabel(claim.due)} retainer is billed by this invoice. The next automatic draft is on ${fmtDay(c.next)}.${c.laterDay ? ` Later drafts fall on the ${dayOrdinal(c.laterDay)}.` : ''}`)
      }
      if (invoice && invoice.paymentLinkUrl && saved.paymentLinkUrl === '') {
        setNotice('The total changed, so the pasted payment link was cleared. The old link had the old amount built in. Paste a new one, or let a card link be created when you issue.')
      }
      return saved
    } catch (e) {
      setFail(invoiceError(e, 'save').message)
      return null
    }
  }

  const adopt = (saved: InvoiceDto): void => {
    onChange?.(saved)
    setF(formFromInvoice(saved))
  }

  const save = async (): Promise<void> => {
    setBusy('save')
    setNotice('')
    const saved = await persist()
    setBusy('')
    if (!saved) return
    UI.toast(isNew ? `${saved.invoiceNumber} saved as a draft` : 'Saved')
    if (isNew) UI.nav('invoice', { id: saved.id })
    else adopt(saved)
  }

  const preview = async (): Promise<void> => {
    setBusy('pdf')
    const saved = await persist()
    if (saved) {
      await downloadPdf(saved)
      if (isNew) UI.nav('invoice', { id: saved.id })
      else adopt(saved)
    }
    setBusy('')
  }

  const doIssue = async (): Promise<void> => {
    setBusy('issue')
    setNotice('')
    const saved = await persist()
    if (!saved) {
      setBusy('')
      return
    }
    try {
      const issued = await issueInvoice(saved.id)
      UI.toast(`${issued.invoiceNumber} ${invoice?.status === 'sent' ? 'reissued' : 'issued'}`)
      if (isNew) UI.nav('invoice', { id: issued.id })
      else adopt(issued)
    } catch (e) {
      const err = invoiceError(e, 'issue')
      setFail(err.message)
      // The save went through, so keep the screen in step with what is stored.
      if (isNew) UI.nav('invoice', { id: saved.id })
      else adopt(saved)
    } finally {
      setBusy('')
    }
  }

  const issue = (): void => {
    setTried(true)
    if (!ok) {
      setFail('Fix the highlighted fields first.')
      return
    }
    const reissue = invoice?.status === 'sent'
    UI.confirm({
      title: reissue ? `Reissue ${invoice?.invoiceNumber}?` : `Issue ${invoice?.invoiceNumber ?? 'this invoice'}?`,
      body: reissue
        ? 'This saves your changes and refreshes the client link: the same URL, showing the corrected invoice. A new card payment link is created if the total changed. Nothing is emailed, so tell the client yourself.'
        : 'This saves your changes and makes the client link live. Nothing is emailed from here: copy the link or download the PDF to send it yourself.',
      confirm: reissue ? 'Reissue' : 'Issue invoice',
      onConfirm: () => void doIssue(),
    })
  }

  const remove = (): void => {
    if (!invoice) return
    UI.confirm({
      title: `Delete draft ${invoice.invoiceNumber}?`, body: 'This cannot be undone.', confirm: 'Delete draft', danger: true,
      onConfirm: () => {
        setBusy('delete')
        deleteInvoice(invoice.id).then(
          () => { UI.toast(`${invoice.invoiceNumber} deleted`); UI.nav('invoices') },
          e => { setFail(invoiceError(e, 'delete').message); setBusy('') },
        )
      },
    })
  }

  const editBilling = (): void => {
    if (!f.companyId) return
    UI.open('billingDetails', { companyId: f.companyId, client: client ?? null, onSaved: () => reloadClients() })
  }

  const showErr = (k: keyof Omit<FormErrors, 'line'>): string | undefined => (tried ? errors[k] : undefined)
  const sub = isNew ? 'A new invoice. The number is assigned when you save it.' : [company?.name ?? invoice?.clientName, invoice?.dealId ? Q.deal(invoice.dealId)?.name : ''].filter(Boolean).join(' · ')
  const issuedState = invoice?.status === 'sent'
  const cardOn = f.offerCard && !stripeOff

  if (doubled) return <DoubledRetainer saved={doubled.saved} clash={doubled.clash} />

  return (
    <div className="page">
      <PageHead
        title={<span className="row" style={{ gap: 10 }}>{invoice?.invoiceNumber ?? 'New invoice'}{invoice ? <><StatusChip inv={invoice} /><TestChip inv={invoice} /><RetainerChip inv={invoice} /></> : <Chip>Draft</Chip>}</span>}
        sub={sub}
        crumb={[<Link key="i" to="invoices">Invoices</Link>, invoice?.invoiceNumber ?? 'New invoice']}
      >
        {acts.delete && !isNew && <Btn kind="ghost" style={{ color: 'var(--bad-ink)' }} onClick={remove} disabled={busy !== ''}>Delete draft</Btn>}
        {onCancel && <Btn onClick={onCancel} disabled={busy !== ''}>Cancel</Btn>}
        <Btn onClick={() => void preview()} disabled={busy !== ''}>{busy === 'pdf' ? 'Preparing…' : invoice && invoice.status !== 'draft' ? 'Download PDF' : 'Preview PDF'}</Btn>
        <Btn onClick={() => void save()} disabled={busy !== ''}>{busy === 'save' ? 'Saving…' : issuedState ? 'Save changes' : 'Save draft'}</Btn>
        <Btn kind="pri" onClick={issue} disabled={busy !== ''}>{busy === 'issue' ? (issuedState ? 'Reissuing…' : 'Issuing…') : issuedState ? 'Reissue' : 'Issue invoice'}</Btn>
        {testOptions.length > 0 && invoice && <MoreMenu label={`More actions for ${invoice.invoiceNumber}`} items={testOptions} />}
      </PageHead>
      {invoice && <TestBanner inv={invoice} onUnmark={ta.unmarkTest} busy={ta.busy} />}

      {clash && <ClashBanner clash={clash} onExtra={() => { setClash(null); setExtra(true) }} />}
      {claiming && !clash && !extra && f.dealId === claiming.dealId && (
        <div style={{ marginBottom: 14 }}>
          <Banner tone="info">
            <b>This invoice bills the {retainerPeriodLabel(claiming.due)} retainer.</b> Saving it moves the automatic draft on to {fmtDay(claimNext.next)}, so that month is not drafted twice.
            {claimNext.laterDay && <> Later drafts then fall on the {dayOrdinal(claimNext.laterDay)} of each month, not the {dayOrdinal(+claiming.due.slice(8, 10))}. Change the next invoice date on the deal afterwards to keep the {dayOrdinal(+claiming.due.slice(8, 10))}.</>}
          </Banner>
        </div>
      )}
      {fail && <div style={{ marginBottom: 14 }}><Banner tone="bad">{fail}</Banner></div>}
      {notice && <div style={{ marginBottom: 14 }}><Banner tone="info"><b>The total changed, so the pasted payment link was cleared.</b> The old link had the old amount built in. Paste a new one, or let a card link be created when you issue.</Banner></div>}

      <div className="inv-cols">
        <div className="inv-main">
          <Card title="Customer">
            <div className="col" style={{ gap: 14 }}>
              <div className="grid g3">
                <Fld label="Customer (CRM company)" req err={showErr('customer')}>
                  <Sel value={f.companyId} onChange={pickCompany} placeholder="Select a customer…" disabled={issuedState || (!!invoice && !!invoice.companyId)} options={companies.map(c => [c.id, c.name] as const)} />
                </Fld>
                <Fld label="Deal (optional)">
                  <Sel value={f.dealId} onChange={pickDeal} placeholder="No deal" disabled={!f.companyId} options={deals.map(d => [d.id, d.title || d.name] as const)} />
                </Fld>
                <Fld label="Milestone">
                  <Sel
                    value={f.milestoneId} onChange={pickMilestone} disabled={!plan}
                    placeholder={f.dealId ? (plan ? 'No milestone' : 'No billing plan on this deal') : 'Choose a deal first'}
                    options={(plan?.milestones ?? []).map(m => {
                      const st = milestoneStatus(m.id, taken.filter(i => i.id !== invoice?.id))
                      return [m.id, `${m.label}: ${formatCents(m.amountCents)} ex GST${st === 'Planned' ? '' : ` (${st})`}`] as const
                    })}
                  />
                </Fld>
              </div>

              {f.companyId && client && (
                <div className="card card-b" style={{ background: 'var(--surf2)', boxShadow: 'none' }}>
                  <div className="row wrap" style={{ alignItems: 'flex-start', gap: 24 }}>
                    <div style={{ minWidth: 200 }}><div className="faint sm">Billing contact</div><div>{client.billing.contactName || <span className="faint">None</span>}</div><div className="mono muted">{client.billing.email}</div></div>
                    <div style={{ minWidth: 140 }}><div className="faint sm">ABN</div><div className="mono">{client.billing.abn || '—'}</div></div>
                    <div style={{ minWidth: 200 }}><div className="faint sm">Address</div><div style={{ whiteSpace: 'pre-line' }}>{client.billing.address || '—'}</div></div>
                    <span className="sp" />
                    <button type="button" className="btn ghost sm" onClick={editBilling}>Edit billing details</button>
                  </div>
                </div>
              )}
              {f.companyId && (!client || lacks.length > 0) && (
                <Banner tone="warn" action={<Btn size="sm" onClick={editBilling}>Add billing details</Btn>}>
                  <b>{company?.name ?? 'This customer'} {client ? `has no ${lacks.join(', ')}` : 'has no billing details'}.</b> {client ? 'Add them so they appear on the invoice.' : 'Add an email, ABN and address so they appear on the invoice. A customer needs billing details before it can be invoiced.'}
                </Banner>
              )}
              {!f.companyId && invoice && !invoice.companyId && <div className="sm muted">Billed to {invoice.clientName}, which is not linked to a CRM company. Choose the company to link it.</div>}
              <div className="sm muted">Linking a milestone marks it Invoiced when you issue this invoice, and Paid when you mark it paid.</div>
            </div>
          </Card>

          <Card title="Dates and terms">
            <div className="grid g3">
              <Fld label="Issue date" err={showErr('issueDate')}><Inp type="date" value={f.issueDate} onChange={v => setF(p => withTerms(p, { issueDate: v }))} /></Fld>
              <Fld label="Payment terms (days)" err={showErr('terms')}><Inp className="num" inputMode="numeric" value={f.terms} onChange={v => setF(p => ({ ...withTerms({ ...p, dueEdited: false }, { terms: v }) }))} /></Fld>
              <Fld label="Due date" err={showErr('dueDate')}><Inp type="date" value={f.dueDate} onChange={v => set({ dueDate: v, dueEdited: true })} /></Fld>
            </div>
          </Card>

          <Card title="Line items" right={<span className="faint sm">Quantities can be fractional, for example 7.5 hours</span>}>
            <div className="col" style={{ gap: 12 }}>
              <div className="inv-lines"><span className="h">Description</span><span className="h rt">Qty</span><span className="h rt">Unit price</span><span className="h rt">Amount</span><span /></div>
              {f.lines.map((l, i) => {
                const amount = lineAmountCents(l.qty, l.unitPrice)
                const err = tried ? errors.line[i] : undefined
                return (
                  <div key={i}>
                    <div className="inv-lines">
                      <div className="col" style={{ gap: 6 }}>
                        <Inp value={l.description} placeholder="Description" aria-label={`Description line ${i + 1}`} aria-invalid={!!err} onChange={v => setLine(i, { description: v })} />
                        <Inp value={l.detail} placeholder="Detail (optional)" aria-label={`Detail line ${i + 1}`} style={{ color: 'var(--fg2)' }} onChange={v => setLine(i, { detail: v })} />
                      </div>
                      <Inp className="rt num" inputMode="decimal" value={l.qty} aria-label={`Quantity line ${i + 1}`} onChange={v => setLine(i, { qty: v })} />
                      <Inp className="rt num" inputMode="decimal" value={l.unitPrice} placeholder="0.00" aria-label={`Unit price line ${i + 1}`} onChange={v => setLine(i, { unitPrice: v })} />
                      <div className="rt money b" style={{ paddingTop: 6 }}>{amount === null ? '—' : formatCents(amount)}</div>
                      <Btn kind="ghost" size="xs" aria-label={`Remove line ${i + 1}`} disabled={f.lines.length === 1} title={f.lines.length === 1 ? 'An invoice needs at least one line' : 'Remove this line'} onClick={() => { set({ lines: f.lines.filter((_, j) => j !== i) }) }}>✕</Btn>
                    </div>
                    {err && <div className="err" role="alert" style={{ color: 'var(--bad2)', fontSize: 12, marginTop: 4 }}>{err}</div>}
                  </div>
                )
              })}
              {tried && errors.lines && <div role="alert" style={{ color: 'var(--bad2)', fontSize: 12 }}>{errors.lines}</div>}
              <div className="row">
                <Btn size="sm" onClick={() => set({ lines: [...f.lines, emptyLine()] })}>+ Add line</Btn>
                <span className="sp" />
                <label className="row sm" style={{ gap: 8 }}>
                  <span className="b">GST rate</span>
                  <Inp className="rt num" style={{ width: 64 }} inputMode="decimal" aria-label="GST rate" value={f.gstPct} onChange={v => set({ gstPct: v })} />
                  <span>%</span>
                </label>
              </div>
              {showErr('gst') && <div role="alert" style={{ color: 'var(--bad2)', fontSize: 12 }}>{errors.gst}</div>}
              <div className="faint sm">Set GST per invoice. Use 0% for overseas work that is zero-rated.</div>
            </div>
          </Card>

          <Card title="Notes">
            <Fld label="Shown at the bottom of the invoice"><TA rows={3} value={f.notes} onChange={v => set({ notes: v })} /></Fld>
          </Card>

          <Card title="Payment options">
            <div className="col" style={{ gap: 14 }}>
              {stripeOff && (
                <Banner tone="info"><b>Card payments aren&apos;t set up on the server.</b> Invoices can still be paid by bank transfer or PayID. An admin needs to add the Stripe key before a card link can be created.</Banner>
              )}
              <div className="row" style={{ alignItems: 'flex-start', gap: 10 }}>
                <Toggle on={cardOn} onChange={v => set({ offerCard: v })} label="Offer card payment" disabled={stripeOff} />
                <div>
                  <div className={'b' + (stripeOff ? ' faint' : '')}>Offer card payment</div>
                  <div className="sm muted">
                    {stripeOff
                      ? 'Unavailable until card payments are set up.'
                      : 'Costs about 1.7% + A$0.30 to receive (3.5% overseas); bank transfer is free. The card link is created when you issue this invoice, not now. It is single-use, so it cannot be paid twice.'}
                  </div>
                </div>
              </div>
              <Fld label="Card payment link (optional)" err={showErr('link')} hint={invoice?.paymentLinkIsAutomatic ? 'Created automatically when this invoice was issued. Editing it hands the link back to you.' : 'A link pasted here is left alone. It is cleared if the total changes, because the amount is built into the link.'}>
                <Inp type="url" value={f.paymentLink} placeholder="https://buy.stripe.com/..." onChange={v => set({ paymentLink: v })} />
              </Fld>
              <div className="sm muted">Bank transfer and PayID details on the invoice come from <Link to="settings" q={{ tab: 'invoicing' }}>Settings › Invoicing</Link>.</div>
            </div>
          </Card>
        </div>

        <div className="inv-rail">
          <Totals subtotal={totals.subtotalCents} gst={totals.gstCents} total={totals.totalCents} gstPct={bp / 100} note="Revenue reports use the ex-GST figure." />
          <Card title="Summary">
            <div className="rowx"><span className="muted">Due</span><span className="b">{f.dueDate || '—'} · {f.terms || '0'} days</span></div>
            <div className="rowx"><span className="muted">Pay by</span><span>{cardOn ? 'Bank transfer, PayID, card' : 'Bank transfer, PayID'}</span></div>
            <div className="rowx"><span className="muted">Card link</span><Chip>{f.paymentLink.trim() ? 'Pasted link' : cardOn ? (issuedState && invoice?.paymentLinkUrl ? 'Link active' : 'Created on issue') : 'Not offered'}</Chip></div>
            <div className="rowx"><span className="muted">Public page</span><span className="faint">{invoice && invoice.status !== 'draft' ? 'Live' : 'Available once issued'}</span></div>
          </Card>
          <Activity items={activityItems(invoice)} />
          <Banner tone="info">Issuing marks the invoice Sent. Nothing is emailed from here: copy the link or download the PDF to send it.</Banner>
        </div>
      </div>
    </div>
  )
}
