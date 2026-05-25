export type TicketStatus = 'backlog' | 'in-progress' | 'testing' | 'sign-off' | 'done'
export type TicketPriority = 'high' | 'medium' | 'low'
export type TicketCategory = 'Feature' | 'Bug' | 'Design' | 'Infrastructure' | 'Integration Testing' | 'Acceptance Testing'
export type TicketHorizon = 'infra' | 'H1' | 'H2' | 'H3'

export interface Ticket {
  id: string
  title: string
  description: string
  status: TicketStatus
  priority: TicketPriority
  category: TicketCategory
  horizon: TicketHorizon
}

export type MilestoneStatus = 'pending' | 'awaiting-approval' | 'paid'

export interface Milestone {
  id: string
  horizon: TicketHorizon
  label: string
  description: string
  approver: string
  status: MilestoneStatus
  date?: string
}

export interface ClientProject {
  slug: string
  clientName: string
  projectName: string
  description: string
  lastUpdated: string
  milestones: Milestone[]
  tickets: Ticket[]
}

export type ClientRegistry = Record<string, ClientProject>
