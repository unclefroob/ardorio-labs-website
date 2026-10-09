import type { CollectionName, RecordData } from '../api/contract'
import { F } from './F'
import { localData } from './plan'
import { S, SYNCED_COLLECTIONS, idx, type SyncedCollection } from './store'
import type { Pipeline, PipelineField } from './types'

const CORE_LABELS: Readonly<Record<string, string>> = {
  name: 'Name',
  title: 'Title',
  tradingName: 'Trading name',
  firstName: 'First name',
  lastName: 'Last name',
  email: 'Email',
  email2: 'Second email',
  phone: 'Phone',
  mobile: 'Mobile',
  linkedin: 'LinkedIn',
  website: 'Website',
  domain: 'Domain',
  industry: 'Industry',
  subindustry: 'Sub-industry',
  hq: 'Headquarters',
  state: 'State',
  country: 'Country',
  employees: 'Employees',
  locations: 'Locations',
  type: 'Type',
  description: 'Description',
  desc: 'Description',
  tags: 'Tags',
  tech: 'Technology',
  source: 'Source',
  department: 'Department',
  location: 'Location',
  seniority: 'Seniority',
  buyingRole: 'Buying role',
  companyId: 'Company',
  contactId: 'Contact',
  dealId: 'Deal',
  contactIds: 'Contacts',
  primaryContact: 'Primary contact',
  ownerId: 'Owner',
  assigneeId: 'Assignee',
  managerId: 'Manager',
  stageId: 'Stage',
  pipelineId: 'Pipeline',
  businessId: 'Business',
  value: 'Value',
  mrr: 'Monthly recurring revenue',
  recurring: 'Recurring',
  contractMonths: 'Contract length (months)',
  close: 'Expected close',
  probability: 'Probability',
  forecast: 'Forecast category',
  next: 'Next step',
  status: 'Status',
  priority: 'Priority',
  due: 'Due',
  lostReason: 'Lost reason',
  lostNotes: 'Lost notes',
  wonNotes: 'Won notes',
  revenueType: 'Revenue type',
  archived: 'Archived',
  notes: 'Notes',
  subject: 'Subject',
  body: 'Body',
  outcome: 'Outcome',
  script: 'Script',
  verification: 'Email verification',
  deliverability: 'Deliverability',
  permission: 'Permission to contact',
  researchStatus: 'Research status',
  createdAt: 'Created',
  updatedAt: 'Updated',
  completedAt: 'Completed',
  closedAt: 'Closed',
  stageChangedAt: 'Stage changed',
  lastActivity: 'Last activity',
  start: 'Starts',
  end: 'Ends',
}

function isSyncedCollection(c: CollectionName): c is SyncedCollection {
  return (SYNCED_COLLECTIONS as readonly string[]).includes(c)
}

const MONEY_KEYS = new Set(['value', 'mrr', 'amount', 'target'])
const DATE_KEYS = new Set(['close', 'due', 'start', 'end'])
const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?/

function humanise(key: string): string {
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').trim().toLowerCase()
  return spaced ? spaced[0].toUpperCase() + spaced.slice(1) : key
}

function recordData(collection: CollectionName, recId: string): RecordData | undefined {
  return isSyncedCollection(collection) ? localData(collection, recId) : undefined
}

function pipelineFor(collection: CollectionName, recId: string): Pipeline | undefined {
  if (collection === 'pipelines') return S.pipelines.find(p => p.id === recId)
  const rec = recordData(collection, recId)
  const pid = rec?.pipelineId
  if (typeof pid === 'string') return S.pipelines.find(p => p.id === pid)
  const bid = rec?.businessId
  if (typeof bid === 'string') return S.pipelines.find(p => p.businessId === bid)
  return undefined
}

function customField(collection: CollectionName, recId: string, key: string): PipelineField | undefined {
  const own = pipelineFor(collection, recId)?.fields.find(f => f.key === key)
  if (own) return own
  for (const p of S.pipelines) {
    const f = p.fields.find(x => x.key === key)
    if (f) return f
  }
  return undefined
}

/** The label a person would use for a changed path, from pipeline field definitions first, then the core map. */
export function fieldLabel(collection: CollectionName, recId: string, path: string): string {
  if (path.startsWith('fields/')) {
    const key = path.slice(7)
    return customField(collection, recId, key)?.label ?? humanise(key)
  }
  if (path.startsWith('notes#')) return 'A note'
  return CORE_LABELS[path] ?? humanise(path)
}

function scalar(v: unknown): string {
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  return JSON.stringify(v)
}

function formatTyped(key: string, v: unknown, type: string | undefined, collection: CollectionName, recId: string): string | null {
  if (type === 'boolean' || typeof v === 'boolean') return v ? 'Yes' : 'No'
  if (type === 'contact' && typeof v === 'string') return idx.contacts.get(v)?.name ?? 'Unknown contact'
  if ((type === 'currency' || MONEY_KEYS.has(key)) && typeof v === 'number') return F.money(v)
  if (key === 'probability' && typeof v === 'number') return `${v}%`
  if (key === 'stageId' && typeof v === 'string') {
    const stage = pipelineFor(collection, recId)?.stages.find(s => s.id === v)
      ?? S.pipelines.flatMap(p => p.stages).find(s => s.id === v)
    return stage?.name ?? 'Unknown stage'
  }
  if ((key === 'ownerId' || key === 'assigneeId' || key === 'managerId') && typeof v === 'string') {
    return idx.users.get(v)?.name ?? 'A teammate'
  }
  if (key === 'companyId' && typeof v === 'string') return idx.companies.get(v)?.name ?? 'Unknown company'
  if (key === 'contactId' && typeof v === 'string') return idx.contacts.get(v)?.name ?? 'Unknown contact'
  if (key === 'primaryContact' && typeof v === 'string') return idx.contacts.get(v)?.name ?? 'Unknown contact'
  if (key === 'dealId' && typeof v === 'string') return idx.deals.get(v)?.name ?? 'Unknown deal'
  if (key === 'businessId' && typeof v === 'string') return idx.businesses.get(v)?.name ?? v
  if (key === 'contactIds' && Array.isArray(v)) {
    return v.length ? v.map(x => (typeof x === 'string' ? idx.contacts.get(x)?.name ?? 'Unknown contact' : scalar(x))).join(', ') : 'None'
  }
  if (typeof v === 'string' && (type === 'date' || DATE_KEYS.has(key) || key.endsWith('At') || ISO_DATE.test(v))) {
    if (ISO_DATE.test(v)) return v.includes('T') ? F.dt(v) : F.date(v)
  }
  return null
}

/** A value as a person reads it. Absent and empty values read as "empty". */
export function formatFieldValue(collection: CollectionName, recId: string, path: string, value: unknown): string {
  if (value === undefined || value === null || value === '') return 'empty'
  if (path.startsWith('notes#')) {
    const body = typeof value === 'object' && value !== null ? (value as { body?: unknown }).body : undefined
    return typeof body === 'string' && body ? body : 'a note'
  }
  const isCustom = path.startsWith('fields/')
  const key = isCustom ? path.slice(7) : path
  const type = isCustom ? customField(collection, recId, key)?.type : undefined
  const typed = formatTyped(isCustom ? '' : key, value, type, collection, recId)
  if (typed !== null) return typed
  if (Array.isArray(value)) return value.length ? value.map(scalar).join(', ') : 'None'
  return scalar(value)
}
