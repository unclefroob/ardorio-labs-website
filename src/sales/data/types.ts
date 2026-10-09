import type { BusinessId, Role, SalesUserDTO } from '../api/contract'

export type { BusinessId, Role }

/** Naive local-time ISO string, `YYYY-MM-DDTHH:mm`, as the prototype stores every timestamp. */
export type Iso = string

export interface Business {
  id: BusinessId
  name: string
  short: string
  accent: string
  desc: string
  currency: string
  tz: string
  pipelineId: string
  knowledge: string
  style: string
  industries: string[]
  roles: string[]
}

export type SalesUser = SalesUserDTO

export interface Team { id: string; name: string; businessId: BusinessId; managerId: string; members: string[] }

export interface Stage { id: string; name: string; prob: number; required: string[]; won: boolean; lost: boolean }
export interface PipelineField {
  key: string
  label: string
  type: string
  options?: string[]
  [k: string]: unknown
}
export interface Pipeline {
  id: string
  businessId: BusinessId
  name: string
  recurring?: boolean
  lostReasons: string[]
  forecast: string[]
  card: string[]
  fields: PipelineField[]
  stages: Stage[]
}

export interface Note {
  id: string
  body: string
  by: string
  ts: Iso
  businessId: BusinessId
  visibility: 'business' | 'private'
  edited?: Iso
}

export interface Company {
  id: string
  name: string
  tradingName: string
  website: string
  domain: string
  industry: string
  subindustry: string
  hq: string
  state: string
  country: string
  employees: number | null
  locations: number | null
  type: string
  description: string
  linkedin: string
  tech: string[]
  tags: string[]
  researchStatus: string
  source: string
  createdAt: Iso
  updatedAt: Iso
  notes: Note[]
  archived?: boolean
  lastResearched?: Iso
  eligibleStudents?: number
  [k: string]: unknown
}

export interface CompanyRel {
  id: string
  companyId: string
  businessId: BusinessId
  ownerId: string
  status: string
  prospectStatus: string
  source: string
  priority: string
  tags: string[]
  qualification?: string
  notes?: string
  createdAt: Iso
  lastContacted?: Iso
  [k: string]: unknown
}

export interface Contact {
  id: string
  firstName: string
  lastName: string
  name: string
  title: string
  department: string
  companyId: string
  email: string
  email2: string
  phone: string
  mobile: string
  linkedin: string
  location: string
  seniority: string
  buyingRole: string
  verification: string
  deliverability: string
  permission: string | null
  permissionSource?: string
  permissionDate?: Iso | null
  source: string
  lastEnriched: Iso | null
  createdAt: Iso
  notes: Note[]
  archived?: boolean
  _bounce?: boolean
  [k: string]: unknown
}

export interface ContactRel {
  id: string
  contactId: string
  businessId: BusinessId
  ownerId: string
  leadStatus: string
  qualification: string
  influence: string
  priority: string
  lastActivity: Iso | null
  nextFollowUp?: Iso | null
  eligible: boolean
  tags: string[]
  scoreFlag?: string | null
  [k: string]: unknown
}

export interface Deal {
  id: string
  name: string
  title: string
  businessId: BusinessId
  companyId: string
  pipelineId: string
  stageId: string
  ownerId: string
  type: string
  value: number
  mrr: number | null
  recurring: boolean
  contractMonths: number
  close: string
  probability: number
  forecast: string
  source: string
  contactIds: string[]
  primaryContact: string | null
  next: string
  description: string
  lostReason: string
  status: 'open' | 'won' | 'lost'
  createdAt: Iso
  stageChangedAt: Iso
  lastActivity: Iso
  closedAt: Iso | null
  priority: string
  fields: Record<string, unknown>
  stageHistory: Array<{ stageId: string; ts: Iso }>
  notes: Note[]
  revenueType?: string
  wonNotes?: string
  lostNotes?: string
  [k: string]: unknown
}

export type TaskStatus = 'Not Started' | 'In Progress' | 'Completed' | 'Cancelled' | 'Snoozed'
export interface Task {
  id: string
  title: string
  type: string
  desc: string
  script?: string
  businessId: BusinessId
  assigneeId: string
  priority: string
  due: Iso
  status: TaskStatus
  companyId?: string | null
  contactId?: string | null
  dealId?: string | null
  seqId?: string
  enrolmentId?: string
  stepId?: string
  recId?: string
  source: string
  createdAt: Iso
  completedAt?: Iso
  outcome?: string
  notes?: string
  snoozeUntil?: Iso
  _od?: number
  [k: string]: unknown
}

export interface Meeting {
  id: string
  title: string
  businessId: BusinessId
  companyId?: string | null
  dealId?: string | null
  ownerId: string
  participants: string[]
  start: Iso
  duration: number
  type: string
  status: string
  sections: Record<string, string>
  summary: string
  nextSteps: string
  outcome?: string
  createdBy: string
  _nt?: number
  _logged?: number
  [k: string]: unknown
}

export interface Mailbox {
  id: string
  address: string
  name: string
  type: 'shared' | 'personal'
  businessIds: BusinessId[]
  ownerId?: string
  authorised: string[]
  status: string
  lastSync?: Iso
  canSend: boolean
}

export interface Template {
  id: string
  businessId: BusinessId
  name: string
  category: string
  subject: string
  body: string
  ownerId: string
  shared: boolean
  createdAt: Iso
  updatedAt?: Iso
  [k: string]: unknown
}

export interface SeqStep {
  id: string
  type: 'email' | 'call' | 'linkedin' | 'task' | 'wait' | 'branch'
  delay?: number
  unit?: string
  subject?: string
  body?: string
  title?: string
  desc?: string
  script?: string
  action?: string
  taskType?: string
  assignee?: string
  priority?: string
  wait?: boolean
  approval?: string
  cond?: string
  onFalse?: string
  [k: string]: unknown
}
export interface Sequence {
  id: string
  name: string
  businessId: BusinessId
  ownerId: string
  createdBy: string
  description: string
  mailboxId: string
  mode: string
  status: string
  shared: boolean
  dailyLimit: number
  window: [number, number]
  businessDays: boolean
  exits: string[]
  steps: SeqStep[]
  createdAt: Iso
  updatedAt: Iso
}

export interface Enrolment {
  id: string
  seqId: string
  contactId: string
  businessId: BusinessId
  ownerId: string
  mailboxId: string
  status: string
  stepIdx: number
  nextDue: Iso | null
  startedAt: Iso
  threadId: string | null
  history: unknown[]
  reason: string
  completedAt?: Iso
  pendingMsgId?: string | null
  taskId?: string
  resumeAt?: Iso | null
}

export interface ThreadClassification {
  cat: string
  secondary?: string | null
  conf: number
  reason: string
  corrected?: boolean
  impact?: string
}
export interface Thread {
  id: string
  businessId: BusinessId
  mailboxId: string
  subject: string
  contactId?: string
  companyId?: string
  dealId: string | null
  seqId?: string
  enrolmentId?: string
  visibility: 'private' | 'shared'
  ownerId: string
  assigneeId: string
  unread: boolean
  archived: boolean
  classification: ThreadClassification | null
  needsReply: boolean
  sharedWith: string[]
  updatedAt: Iso
  [k: string]: unknown
}
export interface Message {
  id: string
  threadId: string
  dir: 'in' | 'out'
  from: string
  to: string
  cc?: string
  subject: string
  body: string
  ts: Iso
  status: string
  enrolmentId?: string
  stepId?: string
  mailboxId?: string
  snoozeUntil?: Iso
  [k: string]: unknown
}

export interface ListRec {
  id: string
  name: string
  businessId: BusinessId
  type: 'static' | 'dynamic'
  ownerId: string
  filter?: Record<string, unknown>
  contactIds: string[]
  createdAt: Iso
}

export interface Goal {
  id: string
  businessId: BusinessId
  ownerType: 'user' | 'team'
  ownerId: string
  metric: string
  target: number
  period: 'day' | 'week' | 'month'
  start?: string
  end?: string
  createdBy: string
}

export interface Rec {
  id: string
  key: string
  businessId: BusinessId
  type: string
  title: string
  explain: string
  evidence: string
  confidence: string
  action: string
  taskTitle?: string
  taskType?: string
  taskDays?: number
  contactId?: string | null
  companyId?: string | null
  dealId?: string | null
  threadId?: string
  createdAt: Iso
  status: string
  suggestDeal?: boolean
  [k: string]: unknown
}

export interface Research {
  id: string
  companyId: string
  businessId: BusinessId
  ts: Iso
  angle?: string
  [k: string]: unknown
}

export interface Suppression {
  id: string
  contactId: string
  email?: string
  scope: 'global' | 'business'
  businessId: BusinessId | null
  reason: string
  source: string
  date: Iso
  by: string
  removed?: Iso
}

export interface Activity {
  id: string
  type: string
  businessId: BusinessId
  actorId: string
  ts: Iso
  visibility: 'business' | 'private'
  ownerId?: string
  companyId?: string | null
  contactId?: string | null
  dealId?: string | null
  taskId?: string
  seqId?: string
  messageId?: string
  meetingId?: string
  subject?: string
  desc?: string
  outcome?: string
  dup?: boolean
  [k: string]: unknown
}

export interface NotifLink { page: string; id?: string | null; q?: Record<string, unknown> }
export interface Notification {
  id: string
  userId: string
  ts: Iso
  read: boolean
  type: string
  title: string
  body?: string
  link?: NotifLink
}

export interface AuditEntry { id: string; actorId: string; action: string; target: string; ts: Iso }
export interface ImportJob {
  id: string; name: string; businessId: BusinessId; by: string; ts: Iso
  total: number; created: number; updated: number; skipped: number; status: string
}
export interface SavedView { id: string; page: string; name: string; q: Record<string, unknown>; ownerId: string }

export interface WizaSettings {
  status: string
  credits: number
  used: number
  lastSync: Iso | null
  history: Array<{ ts: Iso; action: string; by: string; result: string }>
  autoUpdate: boolean
  requireReview: boolean
}
export interface OrgSettings {
  name: string
  tz: string
  currency: string
  dateFormat: string
  notif: { email: boolean; inApp: boolean }
  sendingLimit: number
}
export interface DemoSettings { wizaFail: boolean; researchFail: boolean }

export interface Session {
  userId: string
  ws: 'all' | BusinessId
  theme: 'light' | 'dark'
}

/** Every collection the client keeps as an array in `S`. */
export interface Collections {
  businesses: Business[]
  users: SalesUser[]
  teams: Team[]
  pipelines: Pipeline[]
  companies: Company[]
  contacts: Contact[]
  deals: Deal[]
  tasks: Task[]
  meetings: Meeting[]
  mailboxes: Mailbox[]
  templates: Template[]
  sequences: Sequence[]
  enrolments: Enrolment[]
  threads: Thread[]
  messages: Message[]
  lists: ListRec[]
  goals: Goal[]
  recs: Rec[]
  research: Research[]
  suppressions: Suppression[]
  activities: Activity[]
  notifications: Notification[]
  companyRels: CompanyRel[]
  contactRels: ContactRel[]
  audit: AuditEntry[]
  importJobs: ImportJob[]
  savedViews: SavedView[]
}

export interface State extends Collections {
  session: Session
  org: OrgSettings
  wiza: WizaSettings
  demo: DemoSettings
  crossStatus: Record<string, string>
}

export type CollKey = keyof Collections
