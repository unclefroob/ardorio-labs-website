import { createContext, useContext } from 'react'
import type { Comment } from '../types/dashboard'

interface DashboardContextValue {
  canInteract: boolean
  addComment: (ticketId: string, content: string) => Promise<Comment[]>
}

export const DashboardContext = createContext<DashboardContextValue>({
  canInteract: false,
  addComment: async () => [],
})

export const useDashboard = () => useContext(DashboardContext)
