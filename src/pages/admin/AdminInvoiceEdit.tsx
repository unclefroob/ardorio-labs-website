import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { apiFetch, apiDownload, saveBlob } from '../../lib/apiClient'
import AdminNav from '../../components/admin/AdminNav'
import type { ClientProject } from '../../types/dashboard'
import {
  PAYMENT_METHOD_LABELS,
  PAYMENT_TERM_OPTIONS,
  type Invoice,
  type PaymentMethod,
} from '../../types/invoice'

/**
 * Serves both /admin/invoices/new and /admin/invoices/:id, following the
 * AdminNewsroomEdit convention. Issue, Mark paid and the download actions
 * only appear once the invoice exists.
 */

type FormLine = { description: string; detail: string; qty: string; unitPrice: string }

const emptyLine: FormLine = { description: '', detail: '', qty: '1', unitPrice: '' }

/** Dollars typed by the admin to integer cents for the wire. */
function toCents(dollars: string): number {
  const n = Number(String(dollars).replace(/[$,\s]/g, ''))
  if (!Number.isFinite(n)) return NaN
  return Math.round(n * 100)
}

function fromCents(cents: number): string {
  return (cents / 100).toFixed(2)
}

function formatAud(cents: number): string {
  return (cents / 100).toLocaleString('en-AU', { style: 'currency', currency: 'AUD' })
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return iso
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

// Width is deliberately NOT part of this. `${inputCls} w-20` looks like it
// narrows a field but emits `w-full w-20`, and Tailwind orders w-full last, so
// the field silently stretches to full width and squashes its neighbours.
const fieldCls = 'bg-cream-200 border border-cream-300 rounded-xl px-4 py-2.5 text-sm text-ink placeholder:text-stone-400 focus:outline-none focus:border-stone-400 transition-colors'
const inputCls = `w-full ${fieldCls}`

export default function AdminInvoiceEdit() {
  const { id } = useParams<{ id: string }>()
  const isNew = !id || id === 'new'
  const navigate = useNavigate()

  const [clients, setClients] = useState<ClientProject[]>([])
  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const today = new Date().toISOString().slice(0, 10)
  const [clientSlug, setClientSlug] = useState('')
  const [issueDate, setIssueDate] = useState(today)
  const [termsDays, setTermsDays] = useState(45)
  const [dueDate, setDueDate] = useState(addDays(today, 45))
  const [dueDateEdited, setDueDateEdited] = useState(false)
  const [gstEnabled, setGstEnabled] = useState(true)
  const [notes, setNotes] = useState('')
  const [paymentLinkUrl, setPaymentLinkUrl] = useState('')
  const [offerCardPayment, setOfferCardPayment] = useState(false)
  const [cardDefault, setCardDefault] = useState<{ on: boolean; configured: boolean }>({ on: false, configured: false })
  const [lines, setLines] = useState<FormLine[]>([{ ...emptyLine }])

  // The business default, so a NEW invoice starts where Settings sits and the
  // checkbox can explain itself when Stripe is not configured at all.
  useEffect(() => {
    apiFetch<{ offerCardPayments: boolean; stripeConfigured: boolean }>('/settings/business')
      .then(p => {
        setCardDefault({ on: Boolean(p.offerCardPayments), configured: Boolean(p.stripeConfigured) })
        if (isNew) setOfferCardPayment(Boolean(p.offerCardPayments))
      })
      .catch(() => { /* the server still applies its own default */ })
  }, [isNew])

  // Clients power the picker, and carry the billing email we warn about below.
  useEffect(() => {
    apiFetch<ClientProject[]>('/clients')
      .then(setClients)
      .catch(e => setError(e.message))
  }, [])

  useEffect(() => {
    if (isNew) return
    apiFetch<Invoice>(`/invoices/${id}`)
      .then(inv => {
        setInvoice(inv)
        setClientSlug(inv.clientSlug)
        setIssueDate(inv.issueDate)
        setTermsDays(inv.paymentTermsDays)
        setDueDate(inv.dueDate)
        setGstEnabled(inv.gstRate > 0)
        setNotes(inv.notes)
        setPaymentLinkUrl(inv.paymentLinkUrl)
        setOfferCardPayment(inv.offerCardPayment)
        setLines(inv.lineItems.length > 0
          ? inv.lineItems.map(l => ({
              description: l.description,
              detail: l.detail ?? '',
              qty: String(l.qty),
              unitPrice: fromCents(l.unitPriceCents),
            }))
          : [{ ...emptyLine }])
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [id, isNew])

  // Terms drive the due date until the admin overrides it directly.
  useEffect(() => {
    if (dueDateEdited) return
    setDueDate(addDays(issueDate, termsDays))
  }, [issueDate, termsDays, dueDateEdited])

  const totals = useMemo(() => {
    // Mirrors the server: round each line (they're printed), sum exactly,
    // then round GST once. Display only — the server's numbers are canonical.
    const computed = lines.map(l => {
      const qty = Number(l.qty)
      const cents = toCents(l.unitPrice)
      const amount = Number.isFinite(qty) && Number.isFinite(cents) ? Math.round(qty * cents) : 0
      return amount
    })
    const subtotal = computed.reduce((a, b) => a + b, 0)
    const gst = gstEnabled ? Math.round(subtotal * 0.1) : 0
    return { lineAmounts: computed, subtotal, gst, total: subtotal + gst }
  }, [lines, gstEnabled])

  const selectedClient = clients.find(c => c.slug === clientSlug)
  const missingBillingEmail = Boolean(selectedClient) && !selectedClient?.billing?.email

  function updateLine(index: number, patch: Partial<FormLine>) {
    setLines(prev => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)))
  }

  function removeLine(index: number) {
    setLines(prev => (prev.length === 1 ? prev : prev.filter((_, i) => i !== index)))
  }

  function buildPayload() {
    return {
      clientSlug,
      issueDate,
      paymentTermsDays: termsDays,
      dueDate,
      gstRate: gstEnabled ? 0.1 : 0,
      notes: notes.trim(),
      paymentLinkUrl: paymentLinkUrl.trim(),
      offerCardPayment,
      lineItems: lines.map(l => ({
        description: l.description.trim(),
        detail: l.detail.trim(),
        qty: Number(l.qty),
        unitPriceCents: toCents(l.unitPrice),
      })),
    }
  }

  async function handleSave() {
    setError(''); setNotice(''); setSaving(true)
    try {
      if (isNew) {
        const created = await apiFetch<Invoice>('/invoices', {
          method: 'POST',
          body: JSON.stringify(buildPayload()),
        })
        navigate(`/admin/invoices/${created.id}`)
      } else {
        const updated = await apiFetch<Invoice>(`/invoices/${id}`, {
          method: 'PUT',
          body: JSON.stringify(buildPayload()),
        })
        setInvoice(updated)
        // The server clears a pasted link when the total moves, so mirror
        // whatever it actually stored rather than what was typed.
        setPaymentLinkUrl(updated.paymentLinkUrl)
        setNotice(updated.paymentLinkUrl === '' && paymentLinkUrl !== ''
          ? 'Saved. The payment link was cleared because the total changed.'
          : 'Saved.')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the invoice')
    } finally {
      setSaving(false)
    }
  }

  /**
   * Issuing does not email anything — invoices go out from a real mailbox, not
   * from here. It commits the invoice and brings its hosted link to life, then
   * you send the PDF or the link yourself.
   */
  async function handleIssue() {
    if (!invoice) return
    if (!confirm(`Issue ${invoice.invoiceNumber}? This makes its client link live. Nothing is emailed — send it yourself.`)) return
    setError(''); setNotice(''); setBusy('issue')
    try {
      const issued = await apiFetch<Invoice>(`/invoices/${invoice.id}/issue`, { method: 'POST' })
      setInvoice(issued)
      setNotice('Issued. Download the PDF or copy the link, then send it from your own email.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not issue the invoice')
    } finally {
      setBusy('')
    }
  }

  async function handleMarkPaid(method: PaymentMethod) {
    if (!invoice) return
    setError(''); setNotice(''); setBusy('paid')
    try {
      const paid = await apiFetch<Invoice>(`/invoices/${invoice.id}/mark-paid`, {
        method: 'POST',
        body: JSON.stringify({ method, paidAt: new Date().toISOString().slice(0, 10) }),
      })
      setInvoice(paid)
      setNotice('Recorded as paid.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not record the payment')
    } finally {
      setBusy('')
    }
  }

  async function handleDelete() {
    if (!invoice) return
    if (!confirm(`Delete draft ${invoice.invoiceNumber}? This cannot be undone.`)) return
    try {
      await apiFetch(`/invoices/${invoice.id}`, { method: 'DELETE' })
      navigate('/admin/invoices')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete the invoice')
    }
  }

  async function handleDownloadPdf() {
    if (!invoice) return
    setBusy('pdf')
    try {
      // Admin route, not the public token one: that 404s drafts by design.
      const blob = await apiDownload(`/invoices/${invoice.id}/pdf`)
      saveBlob(blob, `${invoice.invoiceNumber}.pdf`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not download the PDF')
    } finally {
      setBusy('')
    }
  }

  async function copyHostedLink() {
    if (!invoice) return
    await navigator.clipboard.writeText(invoice.hostedUrl)
    setNotice('Invoice link copied.')
  }


  const readOnly = invoice?.status === 'paid'

  if (loading) {
    return (
      <div className="min-h-screen bg-cream-100 flex items-center justify-center">
        <p className="font-mono text-xs text-stone-400 animate-pulse">Loading invoice...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-cream-100">
      <AdminNav breadcrumb={isNew ? 'new invoice' : invoice?.invoiceNumber} />

      <div className="max-w-3xl mx-auto px-6 py-12">
        <Link to="/admin/invoices" className="font-mono text-xs text-stone-400 hover:text-ink transition-colors">
          &larr; All invoices
        </Link>

        <div className="flex items-end justify-between mt-6 mb-8">
          <div>
            <h1 className="font-serif text-3xl text-ink mb-1">
              {isNew ? 'New invoice' : invoice?.invoiceNumber}
            </h1>
            <p className="text-stone-500 text-sm">
              {isNew
                ? 'A one-off invoice. The number is assigned when you create it.'
                : `${invoice?.clientName} · ${invoice?.status}${invoice?.overdue ? ' · overdue' : ''}`}
            </p>
          </div>
          {!isNew && invoice?.status === 'draft' && (
            <button onClick={handleDelete} className="font-mono text-xs text-stone-400 hover:text-red-500 transition-colors">
              Delete draft
            </button>
          )}
        </div>

        {readOnly && (
          <div className="mb-6 border border-emerald-200 bg-emerald-50 rounded-xl px-4 py-3">
            <p className="font-mono text-xs text-emerald-700">
              Paid {invoice?.payment?.paidAt} by {PAYMENT_METHOD_LABELS[invoice!.payment!.method]}
              {' '}({invoice?.payment?.amountFormatted}). Paid invoices cannot be edited.
            </p>
          </div>
        )}

        <div className="space-y-5">
          {/* Client */}
          <div>
            <label className="label block mb-1.5">Client</label>
            <select
              value={clientSlug}
              onChange={e => setClientSlug(e.target.value)}
              disabled={!isNew}
              className={`${inputCls} disabled:opacity-60`}
            >
              <option value="">Select a client...</option>
              {clients.map(c => (
                <option key={c.slug} value={c.slug}>{c.clientName}</option>
              ))}
            </select>
            {missingBillingEmail && (
              <p className="font-mono text-xs text-stone-400 mt-1.5">
                No billing email on record for {selectedClient?.clientName}. Not required — nothing is
                emailed from here — but worth adding under{' '}
                <Link to="/admin/clients" className="underline">Clients</Link> so you know where it goes.
              </p>
            )}
            <p className="font-mono text-xs text-stone-400 mt-1.5">
              <Link to="/admin/clients" className="hover:text-ink transition-colors">
                Manage clients &amp; billing details &rarr;
              </Link>
            </p>
            {!isNew && (
              <p className="font-mono text-xs text-stone-400 mt-1.5">
                The client cannot be changed after the invoice is created.
              </p>
            )}
          </div>

          {/* Dates and terms */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label block mb-1.5">Issue date</label>
              <input
                type="date" value={issueDate} disabled={readOnly}
                onChange={e => setIssueDate(e.target.value)}
                className={`${inputCls} font-mono disabled:opacity-60`}
              />
            </div>
            <div>
              <label className="label block mb-1.5">Payment terms</label>
              <select
                value={termsDays} disabled={readOnly}
                onChange={e => { setTermsDays(Number(e.target.value)); setDueDateEdited(false) }}
                className={`${inputCls} disabled:opacity-60`}
              >
                {PAYMENT_TERM_OPTIONS.map(d => <option key={d} value={d}>{d} days</option>)}
                {!PAYMENT_TERM_OPTIONS.includes(termsDays as never) && (
                  <option value={termsDays}>{termsDays} days</option>
                )}
              </select>
            </div>
            <div>
              <label className="label block mb-1.5">Due date</label>
              <input
                type="date" value={dueDate} disabled={readOnly}
                onChange={e => { setDueDate(e.target.value); setDueDateEdited(true) }}
                className={`${inputCls} font-mono disabled:opacity-60`}
              />
            </div>
          </div>

          {/* Line items */}
          <div>
            <label className="label block mb-1.5">Line items</label>
            {/* Column headers: the placeholders disappear once a field has a
                value, leaving unlabelled numbers. */}
            <div className="flex items-center gap-2 px-3 pb-1.5">
              <span className="flex-1 min-w-0 label">Description</span>
              <span className="w-20 shrink-0 label text-right">Qty</span>
              <span className="w-28 shrink-0 label text-right">Unit $</span>
              <span className="w-24 shrink-0 label text-right">Amount</span>
              <span className="w-4 shrink-0" aria-hidden="true" />
            </div>

            <div className="space-y-2">
              {lines.map((line, i) => (
                <div key={i} className="border border-cream-300 rounded-2xl p-2.5 space-y-2">
                  <div className="flex items-start gap-2">
                    <input
                      type="text" placeholder="Description" value={line.description} disabled={readOnly}
                      onChange={e => updateLine(i, { description: e.target.value })}
                      className={`${fieldCls} flex-1 min-w-0 disabled:opacity-60`}
                    />
                    <input
                      type="number" step="0.01" min="0" placeholder="Qty" value={line.qty} disabled={readOnly}
                      onChange={e => updateLine(i, { qty: e.target.value })}
                      className={`${fieldCls} w-20 shrink-0 font-mono text-right disabled:opacity-60`}
                    />
                    <input
                      type="number" step="0.01" min="0" placeholder="0.00" value={line.unitPrice} disabled={readOnly}
                      onChange={e => updateLine(i, { unitPrice: e.target.value })}
                      className={`${fieldCls} w-28 shrink-0 font-mono text-right disabled:opacity-60`}
                    />
                    <div className="w-24 shrink-0 pt-2.5 text-right font-mono text-sm text-stone-500">
                      {formatAud(totals.lineAmounts[i] ?? 0)}
                    </div>
                    <button
                      type="button" onClick={() => removeLine(i)}
                      disabled={readOnly || lines.length === 1}
                      className="w-4 shrink-0 pt-2.5 font-mono text-xs text-stone-400 hover:text-red-500 disabled:opacity-30 transition-colors"
                      aria-label={`Remove line ${i + 1}`}
                      title={lines.length === 1 ? 'An invoice needs at least one line' : 'Remove this line'}
                    >
                      &times;
                    </button>
                  </div>

                  {/* Optional second line — printed smaller and grey under the
                      description on the invoice itself. */}
                  <input
                    type="text" placeholder="Detail (optional)" value={line.detail} disabled={readOnly}
                    onChange={e => updateLine(i, { detail: e.target.value })}
                    className={`${fieldCls} w-full text-xs py-1.5 disabled:opacity-60`}
                  />
                </div>
              ))}
            </div>
            {!readOnly && (
              <button
                type="button"
                onClick={() => setLines(prev => [...prev, { ...emptyLine }])}
                className="font-mono text-xs text-stone-400 hover:text-ink transition-colors mt-2"
              >
                + Add line
              </button>
            )}
          </div>

          {/* Totals */}
          <div className="bg-cream-200 border border-cream-300 rounded-2xl px-6 py-4">
            <div className="flex items-center justify-between mb-2">
              <label className="flex items-center gap-2 font-mono text-xs text-stone-500">
                <input
                  type="checkbox" checked={gstEnabled} disabled={readOnly}
                  onChange={e => setGstEnabled(e.target.checked)}
                />
                Charge 10% GST
              </label>
              <span className="font-mono text-xs text-stone-400">
                Untick for GST-free or overseas work
              </span>
            </div>
            <div className="border-t border-cream-300 pt-3 space-y-1">
              <div className="flex justify-between font-mono text-sm text-stone-500">
                <span>Subtotal</span><span>{formatAud(totals.subtotal)}</span>
              </div>
              {gstEnabled && (
                <div className="flex justify-between font-mono text-sm text-stone-500">
                  <span>GST (10%)</span><span>{formatAud(totals.gst)}</span>
                </div>
              )}
              <div className="flex justify-between font-mono text-base text-ink pt-1">
                <span>Total</span><span>{formatAud(totals.total)}</span>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="label block mb-1.5">Notes</label>
            <textarea
              rows={2} value={notes} disabled={readOnly}
              onChange={e => setNotes(e.target.value)}
              className={`${inputCls} disabled:opacity-60`}
              placeholder="Shown at the bottom of the invoice."
            />
          </div>

          {/* Card payment */}
          <div className="bg-cream-200 border border-cream-300 rounded-2xl px-6 py-4">
            <label className={`flex items-start gap-3 ${readOnly || !cardDefault.configured ? 'opacity-60' : 'cursor-pointer'}`}>
              <input
                type="checkbox" className="mt-1"
                checked={offerCardPayment}
                disabled={readOnly || !cardDefault.configured}
                onChange={e => setOfferCardPayment(e.target.checked)}
              />
              <span>
                <span className="block text-sm text-ink">Generate a card payment link for this invoice</span>
                <span className="block font-mono text-xs text-stone-400 mt-1">
                  {cardDefault.configured
                    ? `Created when the invoice is issued. Costs 1.7% + $0.30 to receive (3.5% overseas); bank transfer costs nothing. Default for new invoices is ${cardDefault.on ? 'on' : 'off'}, set under Settings.`
                    : 'No Stripe key configured on the server, so no link can be generated.'}
                </span>
              </span>
            </label>
          </div>

          <div>
            <label className="label block mb-1.5">Card payment link (optional)</label>
            <input
              type="url" value={paymentLinkUrl} disabled={readOnly}
              onChange={e => setPaymentLinkUrl(e.target.value)}
              className={`${inputCls} font-mono disabled:opacity-60`}
              placeholder="https://buy.stripe.com/..."
            />
            <p className="font-mono text-xs text-stone-400 mt-1.5">
              {invoice?.paymentLinkIsAutomatic
                ? 'Generated automatically when this invoice was issued. Editing it here hands the link back to you — it will no longer be deactivated for you if the total changes.'
                : 'Paste a link if this client wants to pay by card, or turn on automatic generation under Settings. Leave it empty and the invoice shows bank transfer only, which costs nothing to receive. Cleared if the total changes, because the amount is baked into the link.'}
            </p>
          </div>

          {error && <p className="font-mono text-xs text-red-500">{error}</p>}
          {notice && <p className="font-mono text-xs text-emerald-600">{notice}</p>}

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-cream-300 mt-2">
            {!readOnly && (
              <button onClick={handleSave} disabled={saving} className="btn-primary disabled:opacity-50 mt-4">
                {saving ? 'Saving...' : isNew ? 'Create invoice' : 'Save changes'}
              </button>
            )}
            {invoice?.status === 'draft' && (
              <button
                onClick={handleIssue}
                disabled={busy === 'issue'}
                className="font-mono text-xs text-stone-400 hover:text-ink transition-colors border border-cream-300 rounded-lg px-3 py-2 disabled:opacity-40 mt-4"
              >
                {busy === 'issue' ? 'Issuing...' : 'Issue invoice'}
              </button>
            )}
            {invoice && invoice.status !== 'draft' && !readOnly && (
              <>
                <button
                  onClick={() => handleMarkPaid('bank-transfer')} disabled={busy === 'paid'}
                  className="font-mono text-xs text-stone-400 hover:text-ink transition-colors border border-cream-300 rounded-lg px-3 py-2 disabled:opacity-40 mt-4"
                >
                  {busy === 'paid' ? 'Recording...' : 'Mark paid (transfer)'}
                </button>
                <button
                  onClick={() => handleMarkPaid('card')} disabled={busy === 'paid'}
                  className="font-mono text-xs text-stone-400 hover:text-ink transition-colors border border-cream-300 rounded-lg px-3 py-2 disabled:opacity-40 mt-4"
                >
                  Mark paid (card)
                </button>
              </>
            )}
            {/* Copy link stays gated: the hosted page 404s a draft, so offering
                the link before sending would hand over a dead URL. */}
            {invoice && invoice.status !== 'draft' && (
              <button
                onClick={copyHostedLink}
                className="font-mono text-xs text-stone-400 hover:text-ink transition-colors border border-cream-300 rounded-lg px-3 py-2 mt-4"
              >
                Copy link
              </button>
            )}
            {/* PDF is available at any status — proofreading a draft before
                sending it is exactly when you want to see the document. */}
            {invoice && (
              <button
                onClick={handleDownloadPdf} disabled={busy === 'pdf'}
                className="font-mono text-xs text-stone-400 hover:text-ink transition-colors border border-cream-300 rounded-lg px-3 py-2 disabled:opacity-40 mt-4"
              >
                {busy === 'pdf' ? 'Preparing...' : invoice.status === 'draft' ? 'Preview PDF' : 'Download PDF'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
