import { useState, type FormEvent } from 'react'
import Logo from '../../components/Logo'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

export default function AdminLogin() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const sessionExpired = searchParams.get('reason') === 'expired'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: email, password }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Login failed'); return }
      login(data.token)
      navigate('/admin')
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

        <h1 className="font-serif text-3xl text-ink mb-1">Sign in</h1>
        <p className="text-stone-500 text-sm mb-8">Access the Ardorio admin dashboard.</p>

        {sessionExpired && !error && (
          <p className="font-mono text-xs text-amber-600 mb-4">Your session has expired. Please sign in again.</p>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label block mb-1.5">Username</label>
            <input
              type="text"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full bg-cream-200 border border-cream-300 rounded-xl px-4 py-2.5 text-sm text-ink placeholder:text-stone-400 focus:outline-none focus:border-stone-400 transition-colors"
              placeholder="username"
              autoComplete="username"
            />
          </div>
          <div>
            <label className="label block mb-1.5">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full bg-cream-200 border border-cream-300 rounded-xl px-4 py-2.5 text-sm text-ink placeholder:text-stone-400 focus:outline-none focus:border-stone-400 transition-colors"
              placeholder="••••••••"
              autoComplete="current-password"
            />
          </div>

          {error && (
            <p className="font-mono text-xs text-red-500">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full justify-center disabled:opacity-50"
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}
