import type {
  BootstrapRecord, BootstrapResponse, ChangeEntry, ChangesResponse, MeDTO, OpResult, Permissions, RecordData, SalesUserDTO,
} from '../api/contract'

const ALL: Permissions = { read: true, edit: true, manage: true, admin: true }

export const ME: MeDTO = {
  userId: 'u-me', username: 'me', displayName: 'Me Myself', email: 'me@example.com', super: true, roles: {},
  active: true, title: 'Rep', color: '#112233', meetingLink: '',
  permissions: { ard: ALL, ros: ALL, pth: ALL, adv: ALL },
}

export function user(id: string, name: string): SalesUserDTO {
  return {
    id, name, title: '', email: `${id}@example.com`, super: false, m: {}, active: true, color: '#445566',
    meetingLink: '', createdAt: '2026-01-01T00:00', username: id,
  }
}

export function rec(id: string, data: RecordData, rev = 1): BootstrapRecord {
  return { id, rev, data: { ...data, id }, demo: false }
}

export function bootstrap(over: Partial<BootstrapResponse['collections']> = {}, users: SalesUserDTO[] = []): BootstrapResponse {
  return {
    me: ME,
    users: [user(ME.userId, ME.displayName), ...users],
    collections: {
      businesses: [], teams: [], pipelines: [], companies: [], contacts: [], deals: [], tasks: [], meetings: [],
      mailboxes: [], templates: [], sequences: [], enrolments: [], threads: [], messages: [], lists: [], goals: [],
      recs: [], research: [], suppressions: [], activities: [], notifications: [], companyRels: [], contactRels: [],
      audit: [], importJobs: [], savedViews: [], settings: [],
      ...over,
    },
    settingsDefaults: {
      org: { name: 'Org', tz: 'Australia/Melbourne', currency: 'AUD', dateFormat: 'D MMM YYYY', notif: { email: true, inApp: true }, sendingLimit: 50 },
      wiza: { history: [] },
      demo: { researchFail: false },
      crossStatus: {},
      clock: { offsetMinutes: 0 },
    },
    cursor: 'c0',
    serverNow: '2026-10-09T10:00:00.000Z',
    membersVersion: 'm1',
    ai: { enabled: false, providers: { anthropic: false, xai: false } },
  }
}

export function appliedResult(index: number, collection: OpResult['collection'], id: string, rev: number, data: RecordData): OpResult {
  return {
    index, collection, id, status: 'applied', rev,
    record: { collection, id, rev, data: { ...data, id }, demo: false, updatedAt: '2026-10-09T10:00:00.000Z', updatedBy: ME.userId },
  }
}

export function changes(entries: ChangeEntry[], over: Partial<ChangesResponse> = {}): ChangesResponse {
  return {
    changes: entries, cursor: 'c1', more: false, serverNow: '2026-10-09T10:00:00.000Z', membersVersion: 'm1',
    clockOffsetMinutes: 0, ...over,
  }
}

export function change(collection: ChangeEntry['collection'], id: string, rev: number, data: RecordData | null, by = 'u-other'): ChangeEntry {
  return {
    collection, id, rev, deleted: data === null, data: data ? { ...data, id } : null, demo: false,
    updatedAt: '2026-10-09T10:00:00.000Z', updatedBy: by,
  }
}

/** Tests build minimal records; the store types are the full domain shapes. */
export function row(r: { id: string; [k: string]: unknown }): never {
  return r as never
}

// ── SalesOS engine-era builders ──────────────────────────────────────────────────────────────
export const CONTACT = {
  firstName: 'Sam', lastName: 'Buyer', name: 'Sam Buyer', title: 'Director', companyId: 'co1', email: 'sam@example.com',
  email2: 'sam.alt@example.com', permission: 'Legitimate interest', deliverability: 'Valid', verification: 'Verified', notes: [],
}

export function suppression(over: RecordData = {}): RecordData {
  return { contactId: 'ct1', email: 'sam@example.com', scope: 'global', businessId: null, reason: 'Unsubscribe', source: 'test', date: '2026-10-01T09:00', by: 'u-me', ...over }
}

/** An engine-created email task (contract 3.1). */
export function emailTask(over: RecordData = {}): RecordData {
  return {
    kind: 'email', type: 'Email', title: 'Send email: Intro (Step 1)', status: 'Not Started', priority: 'Normal', assigneeId: 'u-me',
    due: '2026-10-09T09:30:00', createdAt: '2026-10-09T09:30:00', source: 'Sequence: Cold', businessId: 'ros',
    seqId: 'sq1', enrolmentId: 'en1', stepId: 'st1', stepIdx: 0, companyId: 'co1', contactId: 'ct1', mailboxId: 'mb1', day: '2026-10-09',
    draft: { from: 'me@example.com', to: 'sam@example.com', cc: '', subject: 'Quick question about Acme', body: 'Hi Sam,\nGot a minute?' },
    ...over,
  }
}

/** A hydrated world with one contact, mailbox, sequence, enrolment, thread and relationship in business `ros`. */
export function salesWorld(over: Partial<BootstrapResponse['collections']> = {}): BootstrapResponse {
  const b = bootstrap({
    companies: [rec('co1', { name: 'Acme', tradingName: 'Acme', tags: [], notes: [] })],
    contacts: [rec('ct1', CONTACT)],
    mailboxes: [rec('mb1', { address: 'me@example.com', name: 'Me', type: 'personal', businessIds: ['ros'], ownerId: 'u-me', authorised: ['u-me'], status: 'connected', canSend: true })],
    sequences: [rec('sq1', {
      name: 'Cold', businessId: 'ros', ownerId: 'u-me', createdBy: 'u-me', description: '', mailboxId: 'mb1', mode: 'approval', status: 'active', shared: true,
      dailyLimit: 50, window: [9, 17], businessDays: true, exits: [], steps: [{ id: 'st1', type: 'email', delay: 0, unit: 'days', subject: 'Quick question about {{company_name}}', body: 'Hi {{first_name}}' }],
    })],
    enrolments: [rec('en1', {
      seqId: 'sq1', contactId: 'ct1', businessId: 'ros', ownerId: 'u-me', mailboxId: 'mb1', status: 'awaiting_task', stepIdx: 0, nextDue: null,
      startedAt: '2026-10-09T09:00', threadId: null, history: [], reason: '', taskId: 'tk_en1_0',
    })],
    threads: [rec('th1', {
      businessId: 'ros', mailboxId: 'mb1', subject: 'Hello', contactId: 'ct1', companyId: 'co1', dealId: null, visibility: 'private', ownerId: 'u-me',
      assigneeId: 'u-me', unread: false, archived: false, classification: null, needsReply: false, sharedWith: [], updatedAt: '2026-10-09T09:00',
    })],
    contactRels: [rec('xr1', { contactId: 'ct1', businessId: 'ros', ownerId: 'u-me', leadStatus: 'Contacted', qualification: 'Unqualified', influence: '', priority: 'Medium', lastActivity: null, eligible: true, tags: [] })],
    ...over,
  })
  // The signed-in user can edit every business, as an owner would.
  b.users[0] = { ...b.users[0], super: true }
  return b
}
