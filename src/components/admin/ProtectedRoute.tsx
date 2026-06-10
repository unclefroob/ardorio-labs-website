import { useEffect, type ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { isTokenExpired } from '../../lib/jwt'

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { token, logout } = useAuth()
  const expired = !!token && isTokenExpired(token)

  // Clear the stale token outside render — logout() sets provider state.
  useEffect(() => {
    if (expired) logout()
  }, [expired, logout])

  if (!token) return <Navigate to="/admin/login" replace />
  if (expired) return <Navigate to="/admin/login?reason=expired" replace />
  return <>{children}</>
}
