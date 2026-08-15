import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch, apiDownload, saveBlob } from '../../lib/apiClient'
import AdminNav from '../../components/admin/AdminNav'
import type { Invoice, InvoiceStatus } from '../../types/invoice'

type Filter = 'all' | InvoiceStatus | 'overdue'

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'draft', label: 'Drafts' },
  { value: 'sent', label: 'Sent' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'paid', label: 'Paid' },
]

function StatusBadge({ invoice }: { invoice: Invoice }) {
  // Overdue is derived server-side from the due date, so it outranks the
  // stored 'sent' status in the badge without being a status of its own.
  const { label, cls } = invoice.overdue
    ? { label: 'Overdue', cls: 'bg-red-50 text-red-600 border-red-200' }
    : invoice.status === 'paid'
      ? { label: 'Paid', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' }
      : invoice.status === 'sent'
        ? { label: 'Sent', cls: 'bg-cream-200 text-stone-500 border-cream-300' }
        : { label: 'Draft', cls: 'bg-cream-200 text-stone-400 border-cream-300' }

  return (
    <span className={`font-mono text-[11px] px-2 py-0.5 rounded-full border ${cls}`}>{label}</span>
  )
}

export default function AdminInvoices() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [filter, setFilter] = useState<Filter>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    setLoading(true)
    const query = filter === 'all' ? '' : `?status=${filter}`
    apiFetch<Invoice[]>(`/invoices${query}`)
      .then(setInvoices)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [filter])

  async function handleExport() {
    setExporting(true)
    setError('')
    try {
      saveBlob(await apiDownload('/invoices/export.csv'), 'ardorio-invoices.csv')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed')
    } finally {
      setExporting(false)
    }
  }


  const outstanding = invoices
    .filter(i => i.status !== 'paid')
    .reduce((sum, i) => sum + i.totalCents, 0)

  return (
    <div className="min-h-screen bg-cream-100">
      <AdminNav breadcrumb="admin / invoices" />

      <div className="max-w-5xl mx-auto px-6 py-12">
        <div className="flex items-end justify-between mt-6 mb-8">
          <div>
            <h1 className="font-serif text-3xl text-ink mb-1">Invoices</h1>
            <p className="text-stone-500 text-sm">
              {/* Only meaningful on the unfiltered list — under a filter this
                  would total a subset and read as the whole book. */}
              {filter === 'all' && outstanding > 0
                ? `${(outstanding / 100).toLocaleString('en-AU', { style: 'currency', currency: 'AUD' })} outstanding across ${invoices.filter(i => i.status !== 'paid').length} invoices.`
                : 'Create, send and track one-off invoices.'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/admin/clients" className="font-mono text-xs text-stone-400 hover:text-ink transition-colors border border-cream-300 rounded-lg px-3 py-2">
              Clients
            </Link>
            <button
              onClick={handleExport}
              disabled={exporting}
              className="font-mono text-xs text-stone-400 hover:text-ink transition-colors border border-cream-300 rounded-lg px-3 py-2 disabled:opacity-50"
            >
              {exporting ? 'Exporting...' : 'Export CSV'}
            </button>
            <Link to="/admin/invoices/new" className="btn-primary">
              New invoice
            </Link>
          </div>
        </div>

        <div className="flex items-center gap-2 mb-6">
          {FILTERS.map(f => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={`font-mono text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                filter === f.value
                  ? 'border-stone-400 text-ink bg-cream-200'
                  : 'border-cream-300 text-stone-400 hover:text-ink'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {loading && <p className="font-mono text-xs text-stone-400 animate-pulse">Loading invoices...</p>}
        {error && <p className="font-mono text-xs text-red-500">{error}</p>}

        {!loading && !error && invoices.length === 0 && (
          <div className="text-center py-24 border border-dashed border-cream-300 rounded-2xl">
            <p className="text-stone-400 text-sm">
              {filter === 'all' ? 'No invoices yet.' : `No ${filter} invoices.`}
            </p>
          </div>
        )}

        {!loading && invoices.length > 0 && (
          <div className="grid gap-3">
            {invoices.map(invoice => (
              <Link
                key={invoice.id}
                to={`/admin/invoices/${invoice.id}`}
                className="flex items-center justify-between bg-cream-200 border border-cream-300 rounded-2xl px-6 py-4 hover:border-stone-400 transition-colors group"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2.5">
                    <p className="font-mono text-sm text-ink group-hover:underline">{invoice.invoiceNumber}</p>
                    <StatusBadge invoice={invoice} />
                  </div>
                  <p className="text-stone-400 text-sm mt-0.5 truncate">{invoice.clientName}</p>
                </div>
                <div className="text-right shrink-0 ml-4">
                  <p className="font-mono text-sm text-ink">{invoice.totalFormatted}</p>
                  <p className="font-mono text-xs text-stone-400">
                    {invoice.status === 'paid' ? `Paid ${invoice.payment?.paidAt ?? ''}` : `Due ${invoice.dueDate}`}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
