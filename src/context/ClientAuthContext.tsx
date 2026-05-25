import { createContext, useContext, useState, ReactNode } from 'react'

const TOKEN_KEY = 'ardorio_client_token'

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
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY))
  const [assignedProjects, setAssigned] = useState<string[]>(() => {
    const t = localStorage.getItem(TOKEN_KEY)
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
