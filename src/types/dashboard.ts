export type TicketStatus = 'backlog' | 'in-progress' | 'testing' | 'sign-off' | 'done'
export type TicketPriority = 'high' | 'medium' | 'low'
export type TicketCategory = 'Feature' | 'Bug' | 'Design' | 'Infrastructure'
export type TicketHorizon = 'infra' | 'H1' | 'H2' | 'H3'

export interface Comment {
  id: string
  author: string
  role: 'admin' | 'client'
  content: string
  createdAt: string
}

export interface Ticket {
  id: string
  title: string
  description: string
  status: TicketStatus
  priority: TicketPriority
  category: TicketCategory
  horizon: TicketHorizon
  comments?: Comment[]
}

export type MilestoneStatus = 'pending' | 'awaiting-approval' | 'signed-off'

export interface Milestone {
  id: string
  horizon: TicketHorizon
  label: string
  description: string
  approver: string
  status: MilestoneStatus
  date?: string
}

export interface Note {
  id: string
  author: string
  content: string
  createdAt: string
}

export interface ClientProject {
  slug: string
  clientName: string
  projectName: string
  description: string
  lastUpdated: string
  milestones: Milestone[]
  tickets: Ticket[]
  notes: Note[]
}

export type ClientRegistry = Record<string, ClientProject>
