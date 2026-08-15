import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { API_BASE } from '../lib/apiClient'
import Logo from '../components/Logo'
import type { PublicInvoice as PublicInvoiceData } from '../types/invoice'

/**
 * The client-facing invoice, at /invoice/:token. Unauthenticated — the token
 * is the access control — so this page deliberately sits outside both the
 * admin ProtectedRoute tree and the marketing Navbar/Footer shell.
 *
 * Bank transfer is the primary payment path because it costs nothing to
 * receive. The card button only appears when a payment link was pasted in.
 */

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      // Clipboard is blocked on insecure origins and in some in-app browsers.
      // The value is displayed either way, so the client can still read it off.
      setCopied(false)
    }
  }

  return (
    <button
      onClick={copy}
      className="w-full flex items-center justify-between bg-cream-100 border border-cream-300 rounded-xl px-4 py-3 text-left hover:border-stone-400 transition-colors group"
    >
      <span>
        <span className="block font-mono text-[11px] text-stone-400 uppercase tracking-wide">{label}</span>
        <span className="block font-mono text-sm text-ink mt-0.5">{value}</span>
      </span>
      <span className="font-mono text-xs text-stone-400 group-hover:text-ink transition-colors shrink-0 ml-3">
        {copied ? 'Copied' : 'Copy'}
      </span>
    </button>
  )
}

export default function PublicInvoice() {
  const { token } = useParams<{ token: string }>()
  const [invoice, setInvoice] = useState<PublicInvoiceData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    // Plain fetch, not apiFetch: this page has no admin token and must never
    // trigger the 401-redirect-to-login behaviour baked into apiFetch.
    fetch(`${API_BASE}/invoices/public/${token}`)
      .then(async res => {
        if (!res.ok) throw new Error(res.status === 404 ? 'This invoice link is not valid.' : 'Could not load this invoice.')
        return res.json() as Promise<PublicInvoiceData>
      })
      .then(setInvoice)
      .catch(e => setError(e instanceof Error ? e.message : 'Could not load this invoice.'))
      .finally(() => setLoading(false))
  }, [token])

  if (loading) {
    return (
      <div className="min-h-screen bg-cream-100 flex items-center justify-center">
        <p className="font-mono text-xs text-stone-400 animate-pulse">Loading invoice...</p>
      </div>
    )
  }

  if (error || !invoice) {
    return (
      <div className="min-h-screen bg-cream-100 flex items-center justify-center px-6">
        <div className="text-center">
          <Logo size={24} />
          <p className="text-stone-500 text-sm mt-4">{error || 'This invoice link is not valid.'}</p>
          <p className="font-mono text-xs text-stone-400 mt-2">
            If you were expecting an invoice, reply to the email you received.
          </p>
        </div>
      </div>
    )
  }

  const { business, bank } = { business: invoice.business, bank: invoice.business.bank }
  const hasBankDetails = Boolean(bank.bsb || bank.accountNumber)

  return (
    <div className="min-h-screen bg-cream-100">
      <header className="border-b border-cream-300">
        <div className="max-w-2xl mx-auto px-6 py-4 flex items-center gap-2">
          <Logo size={18} />
          <span className="font-mono text-sm font-medium text-ink">ardorio</span>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-6 py-12">
        {/* Headline amount — the one thing the client came here for. */}
        <div className="mb-8">
          <div className="flex items-center gap-2.5 mb-2">
            <span className="font-mono text-xs text-stone-400">{invoice.invoiceNumber}</span>
            {invoice.status === 'paid' ? (
              <span className="font-mono text-[11px] px-2 py-0.5 rounded-full border bg-emerald-50 text-emerald-700 border-emerald-200">Paid</span>
            ) : invoice.overdue ? (
              <span className="font-mono text-[11px] px-2 py-0.5 rounded-full border bg-red-50 text-red-600 border-red-200">Overdue</span>
            ) : null}
          </div>
          <h1 className="font-serif text-4xl text-ink mb-1">{invoice.totalFormatted}</h1>
          <p className="text-stone-500 text-sm">
            {invoice.status === 'paid'
              ? `Paid in full. Thank you.`
              : `Due ${invoice.dueDateFormatted}`}
          </p>
        </div>

        {/* How to pay — first, because it's the action. */}
        {invoice.status !== 'paid' && (
          <div className="bg-cream-200 border border-cream-300 rounded-2xl p-6 mb-8">
            <h2 className="font-serif text-xl text-ink mb-1">How to pay</h2>
            {hasBankDetails && (
              <>
                <p className="text-stone-500 text-sm mb-4">
                  Bank transfer is the fastest way to pay and costs nothing on either side.
                </p>
                <div className="space-y-2">
                  {bank.accountName && <CopyField label="Account name" value={bank.accountName} />}
                  {bank.bsb && <CopyField label="BSB" value={bank.bsb} />}
                  {bank.accountNumber && <CopyField label="Account number" value={bank.accountNumber} />}
                  {bank.payId && <CopyField label="PayID" value={bank.payId} />}
                  <CopyField label="Payment reference" value={invoice.invoiceNumber} />
                </div>
              </>
            )}

            {invoice.paymentLinkUrl && (
              <div className={hasBankDetails ? 'mt-5 pt-5 border-t border-cream-300' : ''}>
                <a
                  href={invoice.paymentLinkUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block font-mono text-xs text-stone-500 hover:text-ink transition-colors border border-cream-300 rounded-lg px-4 py-2.5 bg-cream-100"
                >
                  Pay by card instead &rarr;
                </a>
              </div>
            )}

            {!hasBankDetails && !invoice.paymentLinkUrl && (
              <p className="text-stone-500 text-sm">
                Reply to the email you received and we will send payment details.
              </p>
            )}
          </div>
        )}

        {/* The invoice itself */}
        <div className="border border-cream-300 rounded-2xl p-6 mb-6">
          <div className="flex justify-between items-start mb-6 gap-6">
            <div>
              <p className="font-mono text-[11px] text-stone-400 uppercase tracking-wide mb-1">From</p>
              <p className="text-ink text-sm">{business.name}</p>
              {business.abn && <p className="text-stone-500 text-sm">ABN {business.abn}</p>}
              {business.email && <p className="text-stone-500 text-sm">{business.email}</p>}
            </div>
            <div className="text-right">
              <p className="font-mono text-[11px] text-stone-400 uppercase tracking-wide mb-1">To</p>
              <p className="text-ink text-sm">{invoice.clientName}</p>
              {invoice.billTo.contactName && <p className="text-stone-500 text-sm">{invoice.billTo.contactName}</p>}
              {invoice.billTo.address && <p className="text-stone-500 text-sm">{invoice.billTo.address}</p>}
              {invoice.billTo.abn && <p className="text-stone-500 text-sm">ABN {invoice.billTo.abn}</p>}
            </div>
          </div>

          <div className="flex gap-6 mb-6 font-mono text-xs text-stone-400">
            <span>Issued {invoice.issueDateFormatted}</span>
            <span>Due {invoice.dueDateFormatted}</span>
          </div>

          {/* Line items scroll horizontally rather than squashing on mobile. */}
          <div className="overflow-x-auto -mx-2 px-2">
            <table className="w-full text-sm min-w-[420px]">
              <thead>
                <tr className="border-b border-cream-300">
                  <th className="text-left font-mono text-[11px] text-stone-400 uppercase tracking-wide pb-2">Description</th>
                  <th className="text-right font-mono text-[11px] text-stone-400 uppercase tracking-wide pb-2 w-16">Qty</th>
                  <th className="text-right font-mono text-[11px] text-stone-400 uppercase tracking-wide pb-2 w-24">Unit</th>
                  <th className="text-right font-mono text-[11px] text-stone-400 uppercase tracking-wide pb-2 w-28">Amount</th>
                </tr>
              </thead>
              <tbody>
                {invoice.lineItems.map((line, i) => (
                  <tr key={i} className="border-b border-cream-200">
                    <td className="py-2.5 pr-3">
                      <span className="block text-ink">{line.description}</span>
                      {line.detail && (
                        <span className="block text-stone-400 text-xs mt-0.5">{line.detail}</span>
                      )}
                    </td>
                    <td className="py-2.5 text-right font-mono text-stone-500">{line.qty}</td>
                    <td className="py-2.5 text-right font-mono text-stone-500">{line.unitPriceFormatted}</td>
                    <td className="py-2.5 text-right font-mono text-ink">{line.amountFormatted}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 space-y-1 text-sm">
            <div className="flex justify-between font-mono text-stone-500">
              <span>Subtotal</span><span>{invoice.subtotalFormatted}</span>
            </div>
            {invoice.gstCents > 0 && (
              <div className="flex justify-between font-mono text-stone-500">
                <span>GST ({invoice.gstRatePercent}%)</span><span>{invoice.gstFormatted}</span>
              </div>
            )}
            <div className="flex justify-between font-mono text-base text-ink pt-1.5 border-t border-cream-300">
              <span>Total</span><span>{invoice.totalFormatted}</span>
            </div>
            {invoice.gstCents > 0 && (
              <p className="font-mono text-[11px] text-stone-400 text-right pt-1">Total price includes GST.</p>
            )}
          </div>

          {invoice.notes && (
            <div className="mt-6 pt-4 border-t border-cream-300">
              <p className="font-mono text-[11px] text-stone-400 uppercase tracking-wide mb-1.5">Notes</p>
              <p className="text-stone-500 text-sm whitespace-pre-wrap">{invoice.notes}</p>
            </div>
          )}
        </div>

        <a
          href={`${API_BASE}/invoices/public/${token}/pdf`}
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-xs text-stone-400 hover:text-ink transition-colors"
        >
          Download PDF &darr;
        </a>
      </div>
    </div>
  )
}
