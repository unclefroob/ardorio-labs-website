export type TicketStatus = 'backlog' | 'ongoing' | 'done'
export type TicketPriority = 'high' | 'medium' | 'low'
export type TicketCategory = 'Feature' | 'Bug' | 'Design' | 'Infrastructure'

export interface Ticket {
  id: string
  title: string
  description: string
  status: TicketStatus
  priority: TicketPriority
  category: TicketCategory
}

export interface ClientProject {
  slug: string
  clientName: string
  projectName: string
  description: string
  lastUpdated: string
  tickets: Ticket[]
}

export type ClientRegistry = Record<string, ClientProject>
