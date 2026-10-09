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
      wiza: { status: 'disconnected', credits: 0, used: 0, lastSync: null, history: [], autoUpdate: false, requireReview: true },
      demo: { wizaFail: false, researchFail: false },
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
