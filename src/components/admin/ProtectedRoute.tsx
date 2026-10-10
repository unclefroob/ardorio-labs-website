import { useEffect, type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { isTokenExpired } from '../../lib/jwt'
import { loginPath } from '../../lib/nextPath'

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { token, logout } = useAuth()
  const expired = !!token && isTokenExpired(token)
  const { pathname, search } = useLocation()
  const next = pathname + search

  // Clear the stale token outside render — logout() sets provider state.
  useEffect(() => {
    if (expired) logout()
  }, [expired, logout])

  if (!token) return <Navigate to={loginPath({ next })} replace />
  if (expired) return <Navigate to={loginPath({ reason: 'expired', next })} replace />
  return <>{children}</>
}
