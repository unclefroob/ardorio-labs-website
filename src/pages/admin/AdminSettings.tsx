import { useEffect, useState } from 'react'
import { apiFetch } from '../../lib/apiClient'
import AdminNav from '../../components/admin/AdminNav'
import type { BusinessProfile, XeroStatus } from '../../types/invoice'

/**
 * Ardorio's own business details as they appear on issued invoices. These
 * used to be environment variables; they are business facts the operator
 * owns, so changing a bank account should not need a deploy.
 */

const EMPTY: BusinessProfile = {
  name: '', abn: '', address: '', email: '', gstRegistered: true, offerCardPayments: false,
  xeroSalesAccountCode: '200', xeroTaxTypeGst: 'OUTPUT',
  xeroTaxTypeGstFree: 'EXEMPTOUTPUT', xeroPushAsDraft: true,
  bank: { accountName: '', bsb: '', accountNumber: '', payId: '' },
}

const inputCls = 'w-full bg-cream-200 border border-cream-300 rounded-xl px-4 py-2.5 text-sm text-ink placeholder:text-stone-400 focus:outline-none focus:border-stone-400 transition-colors'

export default function AdminSettings() {
  const [profile, setProfile] = useState<BusinessProfile>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [xero, setXero] = useState<XeroStatus | null>(null)
  const [xeroBusy, setXeroBusy] = useState(false)

  function loadXero() {
    return apiFetch<XeroStatus>('/xero/status').then(setXero).catch(() => setXero(null))
  }

  useEffect(() => { loadXero() }, [])

  // The OAuth callback returns the browser here with an outcome in the query.
  useEffect(() => {
    const outcome = new URLSearchParams(window.location.search).get('xero')
    if (!outcome) return
    const messages: Record<string, string> = {
      connected: 'Connected to Xero.',
      declined: 'Xero connection was declined.',
      invalid: 'That Xero link expired. Try connecting again.',
      failed: 'Could not complete the Xero connection.',
    }
    if (outcome === 'connected') setNotice(messages[outcome])
    else setError(messages[outcome] ?? 'Xero connection failed.')
    // Clear it so a refresh does not replay the message.
    window.history.replaceState({}, '', window.location.pathname)
    loadXero()
  }, [])

  useEffect(() => {
    apiFetch<BusinessProfile>('/settings/business')
      .then(p => setProfile({ ...EMPTY, ...p, bank: { ...EMPTY.bank, ...p.bank } }))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  function set<K extends keyof BusinessProfile>(key: K, value: BusinessProfile[K]) {
    setProfile(p => ({ ...p, [key]: value }))
  }

  function setBank<K extends keyof BusinessProfile['bank']>(key: K, value: string) {
    setProfile(p => ({ ...p, bank: { ...p.bank, [key]: value } }))
  }

  async function connectXero() {
    setXeroBusy(true); setError('')
    try {
      const { url } = await apiFetch<{ url: string }>('/xero/connect', { method: 'POST' })
      // Full navigation, not a popup: Xero's consent screen refuses to frame.
      window.location.href = url
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start the Xero connection')
      setXeroBusy(false)
    }
  }

  async function disconnectXero() {
    if (!confirm('Disconnect Xero? Invoices already pushed stay in Xero. New ones will stop being pushed until you reconnect.')) return
    setXeroBusy(true); setError('')
    try {
      await apiFetch('/xero/disconnect', { method: 'POST' })
      await loadXero()
      setNotice('Disconnected from Xero. Remove the app in Xero too if you want access fully revoked.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not disconnect')
    } finally {
      setXeroBusy(false)
    }
  }

  async function handleSave() {
    setError(''); setNotice(''); setSaving(true)
    try {
      const saved = await apiFetch<BusinessProfile>('/settings/business', {
        method: 'PUT',
        body: JSON.stringify(profile),
      })
      setProfile({ ...EMPTY, ...saved, bank: { ...EMPTY.bank, ...saved.bank } })
      setNotice('Settings saved. New invoices will use these details.')
      setTimeout(() => setNotice(''), 4000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save settings')
    } finally {
      setSaving(false)
    }
  }


  const hasBank = Boolean(profile.bank.bsb || profile.bank.accountNumber || profile.bank.payId)

  if (loading) {
    return (
      <div className="min-h-screen bg-cream-100 flex items-center justify-center">
        <p className="font-mono text-xs text-stone-400 animate-pulse">Loading settings...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-cream-100">
      <AdminNav breadcrumb="admin / settings" />

      <div className="max-w-2xl mx-auto px-6 py-12">
        <h1 className="font-serif text-3xl text-ink mt-6 mb-1">Settings</h1>
        <p className="text-stone-500 text-sm mb-8">
          Your business details as they appear on invoices. Changes apply to the next invoice
          rendered, including re-downloads of invoices already sent.
        </p>

        <div className="space-y-6">
          {/* Business identity */}
          <div className="bg-cream-200 border border-cream-300 rounded-2xl p-6 space-y-4">
            <h2 className="font-mono text-xs text-stone-400 uppercase tracking-wider">Business</h2>

            <div>
              <label className="label block mb-1.5">Business name</label>
              <input
                className={inputCls} value={profile.name}
                onChange={e => set('name', e.target.value)}
                placeholder="Ardorio"
              />
            </div>
            <div>
              <label className="label block mb-1.5">ABN</label>
              <input
                className={`${inputCls} font-mono`} value={profile.abn}
                onChange={e => set('abn', e.target.value)}
                placeholder="12 345 678 901"
              />
              <p className="font-mono text-xs text-stone-400 mt-1.5">
                Printed on every invoice. A tax invoice must show the seller&rsquo;s ABN.
              </p>
            </div>
            <div>
              <label className="label block mb-1.5">Business address</label>
              <textarea
                rows={2} className={inputCls} value={profile.address}
                onChange={e => set('address', e.target.value)}
                placeholder="Level 1, 100 Example St, Melbourne VIC 3000"
              />
            </div>
            <div>
              <label className="label block mb-1.5">Billing contact email</label>
              <input
                type="email" className={inputCls} value={profile.email}
                onChange={e => set('email', e.target.value)}
                placeholder="hello@ardorio.co"
              />
              <p className="font-mono text-xs text-stone-400 mt-1.5">
                Shown on the invoice so clients know where to send billing queries.
              </p>
            </div>
          </div>

          {/* GST */}
          <div className="bg-cream-200 border border-cream-300 rounded-2xl p-6">
            <h2 className="font-mono text-xs text-stone-400 uppercase tracking-wider mb-4">GST</h2>
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox" className="mt-1"
                checked={profile.gstRegistered}
                onChange={e => set('gstRegistered', e.target.checked)}
              />
              <span>
                <span className="block text-sm text-ink">Registered for GST</span>
                <span className="block font-mono text-xs text-stone-400 mt-1">
                  New invoices default to 10% GST and the document is headed &ldquo;Tax Invoice&rdquo;.
                  Untick and invoices default to no GST and read &ldquo;Invoice&rdquo;. Either way, GST can
                  still be turned off per invoice for overseas or GST-free work.
                </span>
              </span>
            </label>
          </div>

          {/* Payment details */}
          <div className="bg-cream-200 border border-cream-300 rounded-2xl p-6 space-y-4">
            <div>
              <h2 className="font-mono text-xs text-stone-400 uppercase tracking-wider">Payment details</h2>
              <p className="text-sm text-stone-500 mt-2">
                Shown on the invoice PDF and, with tap-to-copy, on the hosted invoice page. Bank
                transfer costs nothing to receive, unlike card. Leave all four blank and the payment
                section is omitted entirely.
              </p>
            </div>

            <div>
              <label className="label block mb-1.5">Account name</label>
              <input
                className={inputCls} value={profile.bank.accountName}
                onChange={e => setBank('accountName', e.target.value)}
                placeholder="Ardorio Pty Ltd"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label block mb-1.5">BSB</label>
                <input
                  className={`${inputCls} font-mono`} value={profile.bank.bsb}
                  onChange={e => setBank('bsb', e.target.value)}
                  placeholder="063-000"
                />
              </div>
              <div>
                <label className="label block mb-1.5">Account number</label>
                <input
                  className={`${inputCls} font-mono`} value={profile.bank.accountNumber}
                  onChange={e => setBank('accountNumber', e.target.value)}
                  placeholder="12345678"
                />
              </div>
            </div>
            <div>
              <label className="label block mb-1.5">PayID</label>
              <input
                className={`${inputCls} font-mono`} value={profile.bank.payId}
                onChange={e => setBank('payId', e.target.value)}
                placeholder="accounts@ardorio.co"
              />
            </div>

            {/* Card is opt-in and stated in fee terms, because that is the
                only reason to think about it. */}
            <div className="pt-4 border-t border-cream-300">
              <label className={`flex items-start gap-3 ${profile.stripeConfigured ? 'cursor-pointer' : 'opacity-60'}`}>
                <input
                  type="checkbox" className="mt-1"
                  disabled={!profile.stripeConfigured}
                  checked={profile.offerCardPayments}
                  onChange={e => set('offerCardPayments', e.target.checked)}
                />
                <span>
                  <span className="block text-sm text-ink">Also offer card payment</span>
                  <span className="block font-mono text-xs text-stone-400 mt-1">
                    Generates a Stripe payment link when an invoice is issued, shown as a secondary
                    option under the bank details. Costs 1.7% + $0.30 per domestic card payment
                    (3.5% overseas); bank transfer costs nothing. No Stripe invoicing or tax fees —
                    GST is calculated here, so Stripe is only asked to take the total.
                  </span>
                  {!profile.stripeConfigured && (
                    <span className="block font-mono text-xs text-amber-600 mt-1.5">
                      No Stripe key configured on the server, so this does nothing yet.
                      Set STRIPE_SECRET_KEY.
                    </span>
                  )}
                </span>
              </label>
            </div>

            {!hasBank && (
              <p className="font-mono text-xs text-amber-600">
                No payment details set. Invoices will show no way to pay unless a card payment link
                is pasted onto each one.
              </p>
            )}
          </div>

          {/* Xero — one-way push of issued invoices into the accounts. */}
          <div className="bg-cream-200 border border-cream-300 rounded-2xl p-6 space-y-4">
            <div>
              <h2 className="font-mono text-xs text-stone-400 uppercase tracking-wider">Xero</h2>
              <p className="text-sm text-stone-500 mt-2">
                Pushes each issued invoice into Xero so it lands in the accounts without re-keying.
                One way only — a payment recorded in Xero does not mark the invoice paid here.
              </p>
            </div>

            {!xero?.configured && (
              <p className="font-mono text-xs text-amber-600">
                Xero is not configured on the server. Set XERO_CLIENT_ID, XERO_CLIENT_SECRET and
                XERO_REDIRECT_URI.
              </p>
            )}

            {xero?.configured && !xero.connected && (
              <button onClick={connectXero} disabled={xeroBusy} className="btn-primary disabled:opacity-50">
                {xeroBusy ? 'Opening Xero...' : 'Connect to Xero'}
              </button>
            )}

            {xero?.connected && (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm text-ink">{xero.tenantName || 'Connected'}</p>
                    <p className="font-mono text-xs text-stone-400 mt-0.5">
                      Connected {xero.connectedAt ? new Date(xero.connectedAt).toLocaleDateString('en-AU') : ''}
                      {xero.lastRefreshedAt && ` · refreshed ${new Date(xero.lastRefreshedAt).toLocaleDateString('en-AU')}`}
                    </p>
                  </div>
                  <button
                    onClick={disconnectXero} disabled={xeroBusy}
                    className="font-mono text-xs text-stone-400 hover:text-red-500 transition-colors shrink-0 disabled:opacity-50"
                  >
                    Disconnect
                  </button>
                </div>

                {/* A lapsed connection is stated plainly: it can only be fixed
                    by reconnecting in a browser, so silence would strand it. */}
                {xero.lastError && (
                  <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                    <p className="font-mono text-xs text-red-600">
                      Xero rejected the last token refresh. Reconnect to restore the link.
                    </p>
                  </div>
                )}

                <div className="grid grid-cols-3 gap-3 pt-2 border-t border-cream-300">
                  <div>
                    <label className="label block mb-1.5">Sales account</label>
                    <input
                      className={`${inputCls} font-mono`} value={profile.xeroSalesAccountCode}
                      onChange={e => set('xeroSalesAccountCode', e.target.value)}
                      placeholder="200"
                    />
                  </div>
                  <div>
                    <label className="label block mb-1.5">GST tax code</label>
                    <input
                      className={`${inputCls} font-mono`} value={profile.xeroTaxTypeGst}
                      onChange={e => set('xeroTaxTypeGst', e.target.value)}
                      placeholder="OUTPUT"
                    />
                  </div>
                  <div>
                    <label className="label block mb-1.5">GST-free code</label>
                    <input
                      className={`${inputCls} font-mono`} value={profile.xeroTaxTypeGstFree}
                      onChange={e => set('xeroTaxTypeGstFree', e.target.value)}
                      placeholder="EXEMPTOUTPUT"
                    />
                  </div>
                </div>
                <p className="font-mono text-xs text-stone-400">
                  Defaults suit a standard Australian chart of accounts. If yours differs, Xero
                  rejects the push with the offending code named, and it shows on the invoice.
                </p>

                <label className="flex items-start gap-3 cursor-pointer pt-2">
                  <input
                    type="checkbox" className="mt-1"
                    checked={profile.xeroPushAsDraft}
                    onChange={e => set('xeroPushAsDraft', e.target.checked)}
                  />
                  <span>
                    <span className="block text-sm text-ink">Push as a draft in Xero</span>
                    <span className="block font-mono text-xs text-stone-400 mt-1">
                      Recommended. Untick and invoices post straight into the books as approved,
                      with no chance to look first.
                    </span>
                  </span>
                </label>
              </div>
            )}
          </div>

          {error && <p className="font-mono text-xs text-red-500">{error}</p>}
          {notice && <p className="font-mono text-xs text-emerald-600">{notice}</p>}

          <button onClick={handleSave} disabled={saving} className="btn-primary disabled:opacity-50">
            {saving ? 'Saving...' : 'Save settings'}
          </button>
        </div>
      </div>
    </div>
  )
}
