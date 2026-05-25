import { useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import Logo from '../../components/Logo'

export default function AcceptInvite() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const isReset = params.get('mode') === 'reset'

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  if (!token) {
    return (
      <div className="min-h-screen bg-cream-100 flex flex-col items-center justify-center px-6">
        <p className="font-mono text-sm text-red-500">Invalid or missing invite token.</p>
      </div>
    )
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (password.length < 8) { setError('Password must be at least 8 characters'); return }
    if (password !== confirm) { setError('Passwords do not match'); return }
    setLoading(true)
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/auth/accept-invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Something went wrong'); return }
      login(data.token)
      setDone(true)
      setTimeout(() => navigate('/admin'), 1500)
    } catch {
      setError('Could not reach the server. Try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-cream-100 flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 mb-10">
          <Logo size={20} />
          <span className="font-mono text-sm font-medium text-ink">ardorio</span>
          <span className="font-mono text-xs text-stone-400 ml-1">/ admin</span>
        </div>

        {done ? (
          <div>
            <h1 className="font-serif text-3xl text-ink mb-2">{isReset ? 'Password updated.' : 'You\'re in.'}</h1>
            <p className="text-stone-500 text-sm">Redirecting to the dashboard…</p>
          </div>
        ) : (
          <>
            <h1 className="font-serif text-3xl text-ink mb-1">
              {isReset ? 'Reset your password' : 'Set your password'}
            </h1>
            <p className="text-stone-500 text-sm mb-8">
              {isReset
                ? 'Choose a new password for your Ardorio admin account.'
                : 'Choose a password to activate your Ardorio admin account.'}
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="label block mb-1.5">Password</label>
                <input
                  type="password"
                  required
                  autoFocus
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full bg-cream-200 border border-cream-300 rounded-xl px-4 py-2.5 text-sm text-ink placeholder:text-stone-400 focus:outline-none focus:border-stone-400 transition-colors"
                  placeholder="••••••••"
                  autoComplete="new-password"
                />
              </div>
              <div>
                <label className="label block mb-1.5">Confirm password</label>
                <input
                  type="password"
                  required
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  className="w-full bg-cream-200 border border-cream-300 rounded-xl px-4 py-2.5 text-sm text-ink placeholder:text-stone-400 focus:outline-none focus:border-stone-400 transition-colors"
                  placeholder="••••••••"
                  autoComplete="new-password"
                />
              </div>

              {error && <p className="font-mono text-xs text-red-500">{error}</p>}

              <button
                type="submit"
                disabled={loading}
                className="btn-primary w-full justify-center disabled:opacity-50"
              >
                {loading
                  ? (isReset ? 'Updating…' : 'Setting password…')
                  : (isReset ? 'Update password' : 'Activate account')}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
