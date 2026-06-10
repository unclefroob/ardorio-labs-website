import { createContext, useContext, useState, type ReactNode } from 'react'
import { isTokenExpired } from '../lib/jwt'

const TOKEN_KEY = 'ardorio_client_token'

// An expired token is worse than none: the UI would offer actions the API
// will reject with 401. Treat it as logged out and clean it up.
function readStoredToken(): string | null {
  const t = localStorage.getItem(TOKEN_KEY)
  if (!t) return null
  if (isTokenExpired(t)) {
    localStorage.removeItem(TOKEN_KEY)
    return null
  }
  return t
}

interface ClientAuthState {
  token: string | null
  assignedProjects: string[]
  login: (token: string, projects: string[]) => void
  logout: () => void
}

const ClientAuthContext = createContext<ClientAuthState>({
  token: null, assignedProjects: [], login: () => {}, logout: () => {},
})

function parseAssigned(token: string): string[] {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    return Array.isArray(payload.assignedProjects) ? payload.assignedProjects : []
  } catch { return [] }
}

export function ClientAuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(readStoredToken)
  const [assignedProjects, setAssigned] = useState<string[]>(() => {
    const t = readStoredToken()
    return t ? parseAssigned(t) : []
  })

  const login = (t: string, projects: string[]) => {
    localStorage.setItem(TOKEN_KEY, t)
    setToken(t)
    setAssigned(projects)
  }

  const logout = () => {
    localStorage.removeItem(TOKEN_KEY)
    setToken(null)
    setAssigned([])
  }

  return (
    <ClientAuthContext.Provider value={{ token, assignedProjects, login, logout }}>
      {children}
    </ClientAuthContext.Provider>
  )
}

export const useClientAuth = () => useContext(ClientAuthContext)
