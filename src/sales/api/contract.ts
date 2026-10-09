// SOURCE: ardorio-labs-api-sales-os/src/services/sales/contract.ts
export interface SalesErrorBody {
  error: string                       // human message, safe to show
  code: SalesErrorCode
  details?: Record<string, unknown>
}

export const BUSINESS_IDS = ['ard', 'ros', 'pth', 'adv'] as const
export type BusinessId = typeof BUSINESS_IDS[number]

export type Role = 'viewer' | 'sales' | 'manager' | 'admin'          // per business
// 'super' is a flag on the member, not a Role value

export const DOMAIN_COLLECTIONS = [
  'businesses','users','teams','pipelines','companies','contacts','deals','tasks','meetings',
  'mailboxes','templates','sequences','enrolments','threads','messages','lists','goals','recs',
  'research','suppressions','activities','notifications','companyRels','contactRels',
] as const                                                              // the 24 (D7)
export const AUX_COLLECTIONS = ['audit', 'importJobs', 'savedViews', 'settings'] as const
export type CollectionName = typeof DOMAIN_COLLECTIONS[number] | typeof AUX_COLLECTIONS[number]
export type WritableCollection = Exclude<CollectionName, 'users'>

export const SETTINGS_IDS = ['org', 'wiza', 'demo', 'crossStatus', 'clock'] as const
export type SettingsId = typeof SETTINGS_IDS[number]

export type RecordData = Record<string, unknown>

export interface Permissions { read: boolean; edit: boolean; manage: boolean; admin: boolean }

export interface MeDTO {
  userId: string                              // admin User._id hex
  username: string
  displayName: string
  email: string
  super: boolean
  roles: Partial<Record<BusinessId, Role>>
  active: boolean
  title: string
  color: string                               // '#RRGGBB'
  meetingLink: string
  permissions: Record<BusinessId, Permissions> // all four keys always present
}

// Same shape as the prototype's S.users entries, so Q.* keeps working.
export interface SalesUserDTO {
  id: string                                   // = userId
  name: string                                 // '(removed login)' when the User was deleted
  title: string
  email: string
  super: boolean
  m: Partial<Record<BusinessId, Role>>
  active: boolean
  color: string
  meetingLink: string
  createdAt: string
  username: string
}

export interface CreateMemberRequest {
  userId: string
  roles: Partial<Record<BusinessId, Role>>
  super?: boolean
  title?: string; color?: string; meetingLink?: string
}
export interface UpdateMemberRequest {
  roles?: Partial<Record<BusinessId, Role | null>>   // null removes the role
  super?: boolean
  active?: boolean
  title?: string; color?: string; meetingLink?: string
}
export interface MembersResponse { users: SalesUserDTO[]; membersVersion: string }
export interface MemberCandidate { userId: string; username: string; displayName: string; email: string; invitePending: boolean }
export interface CandidatesResponse { candidates: MemberCandidate[] }

export interface BootstrapRecord { id: string; rev: number; data: RecordData; demo: boolean }

export interface ChangeEntry {
  collection: CollectionName
  id: string
  rev: number
  deleted: boolean
  hidden?: true                     // record became invisible to the caller; treat as deleted
  data: RecordData | null           // null when deleted or hidden
  demo: boolean
  updatedAt: string
  updatedBy: string                 // member userId
}

export interface RecordEnvelope {
  collection: CollectionName
  id: string
  rev: number
  data: RecordData                  // filtered for the caller (note-level filter, 5.4)
  demo: boolean
  updatedAt: string
  updatedBy: string
}

// Path grammar:  top-level key            'stageId'
//                deal custom field key     'fields/<key>'      (only for objectMaps: deals.fields)
//                keyed-list item           'notes#<itemId>'    (only in conflict results)
export type Path = string

export interface PutOp {
  op: 'put'
  collection: WritableCollection
  id: string
  baseRev: number | null            // null or 0 = create
  set: Record<Path, unknown>        // create: the full record (must include id); update: changed paths only
  unset?: Path[]
  items?: Partial<Record<'notes', { upsert?: Array<{ id: string } & RecordData>; remove?: string[] }>>
  demo?: boolean                    // create only (D11)
  resurrect?: boolean               // explicit restore after a 'deleted' conflict
}
export interface DeleteOp { op: 'delete'; collection: WritableCollection; id: string; baseRev: number }
export type Op = PutOp | DeleteOp

export type OpStatus = 'applied' | 'merged' | 'noop' | 'conflict' | 'rejected'

export interface FieldConflict {
  path: Path
  mine: unknown
  theirs: unknown                   // undefined (absent) when theirsDeleted
  theirsDeleted?: true
  changedBy: string                 // member userId
  changedAt: string
}

export interface OpResult {
  index: number                     // position in the request ops[]
  collection: CollectionName
  id: string
  status: OpStatus
  rev: number | null                // server rev after this op; null only when rejected before any read
  record: RecordEnvelope | null     // current server copy; null when absent, deleted, or not visible
  conflict?: { kind: 'field' | 'deleted' | 'exists' | 'modified'; fields: FieldConflict[] }
  error?: { code: SalesErrorCode; message: string; details?: Record<string, unknown> }  // only when status 'rejected'
}

export interface EngineTag { sessionId: string; businessIds: BusinessId[] }
export interface BatchRequest { ops: Op[]; engine?: EngineTag }
export interface BatchResponse { results: OpResult[]; serverNow: string }

export interface BootstrapResponse {
  me: MeDTO
  users: SalesUserDTO[]
  collections: Record<Exclude<CollectionName, 'users'>, BootstrapRecord[]>  // every key present, [] when none
  settingsDefaults: Record<SettingsId, RecordData>   // virtual defaults for settings ids not yet created (rev 0)
  cursor: string
  serverNow: string
  membersVersion: string
  ai: {
    enabled: boolean                                 // the Anthropic key; false ⇒ show "AI not configured" badge before any call
    providers: Record<AiProvider, boolean>           // per provider, so a tool on Grok can show "Grok not configured" on its own
  }
}

export interface ChangesResponse {
  changes: ChangeEntry[]          // sorted by server seq
  cursor: string                  // opaque; store and send back verbatim
  more: boolean                   // true ⇒ call again immediately with the new cursor
  serverNow: string
  membersVersion: string
  clockOffsetMinutes: number      // current settings/clock offset, for the D9 banner
}

export interface LeaseRequest { sessionId: string; businessIds: BusinessId[] }   // sessionId: crypto.randomUUID() per tab
export interface LeaseInfo {
  businessId: BusinessId
  held: boolean                    // held by THIS session
  expiresAt: string | null         // of whoever holds it; null when nobody does
  holder?: { userId: string; name: string }   // present when another session holds it
}
export interface LeaseResponse { ttlMs: number; renewEveryMs: number; serverNow: string; leases: LeaseInfo[] }  // ttl 45000, renew 15000
export interface LeaseReleaseRequest { sessionId: string }
export interface LeaseReleaseResponse { released: BusinessId[] }

export interface DemoWipeRequest { businessIds?: BusinessId[] }   // default: every business the caller admins
export interface DemoWipeResponse { wiped: number }

export type AiMode = 'llm' | 'stub' | 'fallback' | 'refused'
export type AiProvider = 'anthropic' | 'xai'
export interface AiMeta {
  mode: AiMode
  provider: AiProvider       // the provider this tool is configured onto, on every response including stubs and fallbacks
  model: string | null       // e.g. the Sonnet/Haiku model id; null unless mode 'llm'
  generated: boolean         // true only when mode 'llm'; UI badges the text as AI-written
  label?: string             // present when mode 'stub': show verbatim
}

export type ReplyCategory = 'Interested' | 'Meeting Requested' | 'More Information Requested' | 'Pricing Objection'
  | 'Timing Objection' | 'Referral' | 'Not Interested' | 'Unsubscribe' | 'Out of Office'
  | 'Wrong Contact' | 'Neutral / Unclear' | 'Delivery Failure'
export interface Classification {
  cat: ReplyCategory; secondary: ReplyCategory | null; conf: number; reason: string
  nextAction: string; taskTitle: string; followUpDays: number; deal: boolean; returnDate: string | null
}
export interface ClassifyRequest { businessId: BusinessId; text: string; subject?: string; clientNow: string }   // text ≤ 8000; clientNow = now() from section 7
export interface ClassifyResponse {
  mode: 'llm' | 'fallback'                // never 'stub': no key ⇒ server regex, fallbackReason 'ai_disabled'
  provider: AiProvider
  fallbackReason?: 'ai_disabled' | 'provider_error' | 'bad_output'
  model: string | null; generated: boolean
  result: Classification
}

export type DraftPurpose = 'intro' | 'follow' | 'stale'                          // prototype strings
export interface DraftRequest { businessId: BusinessId; contactId: string; purpose: DraftPurpose; dealId?: string; guidance?: string }  // guidance ≤ 500
export interface EmailDraft { subject: string; body: string }
export interface DraftResponse extends AiMeta { mode: 'llm' | 'stub'; draft?: EmailDraft }            // draft present iff mode 'llm'

export interface ReplySuggestRequest { threadId: string; guidance?: string }
export interface ReplySuggestResponse extends AiMeta { mode: 'llm' | 'stub'; draft?: EmailDraft }

export type RecapActionType = 'Call' | 'Email' | 'Meeting' | 'Follow-up' | 'Proposal' | 'General'
export interface MeetingRecapRequest { meetingId: string }
export interface MeetingRecapResponse extends AiMeta {
  mode: 'llm' | 'stub'
  recap?: { summary: string; actions: Array<{ title: string; type: RecapActionType; days: number }>; email: EmailDraft }   // actions ≤ 6, days 0-60
}

export interface CopilotRequest { question: string; businessIds?: BusinessId[]; context?: { contactId?: string; dealId?: string; companyId?: string } }  // question ≤ 1000
export interface CopilotItem { kind: 'deal' | 'task' | 'thread' | 'company' | 'contact'; id: string; label: string }
export interface CopilotResponse extends AiMeta {
  mode: 'llm' | 'stub' | 'refused'
  answer?: { text: string; items: CopilotItem[]; scope: BusinessId[] }   // present for 'llm' and 'refused'
}

export interface ResearchSource { title: string; url: string }
export interface ResearchRequest { businessId: BusinessId; companyId?: string; input?: { name: string; website?: string; industry?: string } }  // companyId or input required
export interface ResearchResponse extends AiMeta {
  mode: 'llm' | 'stub'
  crmFactsUsed: Array<[string, string]>        // always present; CRM facts sent (fact)
  inference?: {                                 // model inference, never fact; present iff mode 'llm'
    overview: string; businessModel: string; challenges: string[]; offerings: string[]
    stakeholders: string[]; angle: string
    sources: ResearchSource[]                   // links for claims from live web / X search; [] when the provider had no search. Render http(s) only
    disclaimer: string                          // no-search providers: 'Generated by AI from CRM data and general sector knowledge. Not verified. No live web research was performed.'; Grok: says it used live web and X search
  }
}

export type SalesErrorCode =
  | 'VALIDATION' | 'UNKNOWN_COLLECTION' | 'READ_ONLY' | 'APPEND_ONLY' | 'IMMUTABLE_FIELD'
  | 'NOT_A_MEMBER' | 'MEMBER_INACTIVE' | 'ROLE_REQUIRED' | 'NOT_FOUND'
  | 'CONFLICT' | 'LAST_SUPER' | 'LEASE_LOST' | 'DUPLICATE_SEND' | 'CONTENTION'
  | 'BATCH_TOO_LARGE' | 'PAYLOAD_TOO_LARGE'
  | 'INVALID_URL' | 'AI_PROVIDER_ERROR' | 'AI_BAD_OUTPUT' | 'INTERNAL'

