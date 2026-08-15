import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { apiFetch } from '../../lib/apiClient'
import Logo from '../../components/Logo'
import type { BusinessProfile } from '../../types/invoice'

/**
 * Ardorio's own business details as they appear on issued invoices. These
 * used to be environment variables; they are business facts the operator
 * owns, so changing a bank account should not need a deploy.
 */

const EMPTY: BusinessProfile = {
  name: '', abn: '', address: '', email: '', gstRegistered: true,
  bank: { accountName: '', bsb: '', accountNumber: '', payId: '' },
}

const inputCls = 'w-full bg-cream-200 border border-cream-300 rounded-xl px-4 py-2.5 text-sm text-ink placeholder:text-stone-400 focus:outline-none focus:border-stone-400 transition-colors'

export default function AdminSettings() {
  const { logout } = useAuth()
  const navigate = useNavigate()
  const [profile, setProfile] = useState<BusinessProfile>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

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

  function handleLogout() { logout(); navigate('/admin/login') }

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
      <header className="border-b border-cream-300 bg-cream-100">
        <div className="max-w-2xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Logo size={18} />
            <span className="font-mono text-sm font-medium text-ink">ardorio</span>
            <span className="font-mono text-xs text-stone-400 ml-1">/ admin / settings</span>
          </div>
          <button onClick={handleLogout} className="font-mono text-xs text-stone-400 hover:text-ink transition-colors">
            Sign out
          </button>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-6 py-12">
        <Link to="/admin" className="font-mono text-xs text-stone-400 hover:text-ink transition-colors">
          &larr; All clients
        </Link>

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

            {!hasBank && (
              <p className="font-mono text-xs text-amber-600">
                No payment details set. Invoices will show no way to pay unless a card payment link
                is pasted onto each one.
              </p>
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
