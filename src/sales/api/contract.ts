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
  'research','suppressions','activities','notifications','companyRels','contactRels','intel','billingPlans',
] as const                                                              // the 24 (D7) plus intel
export const AUX_COLLECTIONS = ['audit', 'importJobs', 'savedViews', 'settings'] as const
export type CollectionName = typeof DOMAIN_COLLECTIONS[number] | typeof AUX_COLLECTIONS[number]
export type WritableCollection = Exclude<CollectionName, 'users'>

export const SETTINGS_IDS = ['org', 'wiza', 'demo', 'crossStatus', 'rosterioTest'] as const
export type SettingsId = typeof SETTINGS_IDS[number]

export type RecordData = Record<string, unknown>

/**
 * Simulated mail (additive, data-only): `threads`, `messages` and `activities` records that were never really
 * sent or received carry `simulated: true`. A message the rep sent by hand keeps the existing `manual: true`
 * flag instead. Real mail sync must write `simulated: false`. Web legacy rules live in data/simulated.ts.
 */
export interface SimulatedFlag { simulated?: boolean }

/**
 * Archiving (additive, data-only): `deals` and `sequences` records gain these keys. Only admins of that business may
 * change `archived` on deals and sequences (server-enforced). Companies and contacts keep their existing `archived`
 * field. Web rules live in data/archive.ts.
 */
export interface ArchiveFields { archived?: boolean; archivedAt?: string; archivedBy?: string }

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

/** @deprecated The browser can no longer hold an engine lease. New builds never send `engine`; old builds get LEASE_LOST. */
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
  /** @deprecated The server always sends 0: SalesOS runs on real time and no longer reads a clock offset. */
  clockOffsetMinutes?: number
}

/** @deprecated Tombstoned for one release: the server runs the engine. New builds never call the lease endpoints. */
export interface LeaseRequest { sessionId: string; businessIds: BusinessId[] }   // sessionId: crypto.randomUUID() per tab
/** @deprecated see LeaseRequest. */
export interface LeaseInfo {
  businessId: BusinessId
  held: boolean                    // held by THIS session
  expiresAt: string | null         // of whoever holds it; null when nobody does
  holder?: { userId: string; name: string }   // present when another session holds it
}
/** @deprecated see LeaseRequest. */
export interface LeaseResponse { ttlMs: number; renewEveryMs: number; serverNow: string; leases: LeaseInfo[] }  // ttl 45000, renew 15000
/** @deprecated see LeaseRequest. */
export interface LeaseReleaseRequest { sessionId: string }
/** @deprecated see LeaseRequest. */
export interface LeaseReleaseResponse { released: BusinessId[] }

/** POST /sales/engine/run. Body is `{}`. Always 200; best-effort nudge of the server engine. */
export interface EngineRunResponse {
  ran: boolean
  reason?: 'busy' | 'held_elsewhere' | 'disabled'
  businessIds: BusinessId[]
  serverNow: string // ISO instant
}

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
/** Which organisation the research is about. ambiguous: several firms share the name, so the person should confirm. */
export interface ResearchIdentity { name: string; website?: string; note: string; ambiguous: boolean }
/** Head office and headcount from live search. basis 'stated': a page gives the number. 'estimated': rounded, or the middle of a range. */
export interface ResearchProfile { headOffice?: string; employees?: { count: number; basis: 'stated' | 'estimated'; note: string } }
export interface ResearchRequest { businessId: BusinessId; companyId?: string; input?: { name: string; website?: string; industry?: string } }  // companyId or input required
export interface ResearchResponse extends AiMeta {
  mode: 'llm' | 'stub'
  crmFactsUsed: Array<[string, string]>        // always present; CRM facts sent (fact)
  inference?: {                                 // model inference, never fact; present iff mode 'llm'
    overview: string; businessModel: string; challenges: string[]; offerings: string[]
    stakeholders: string[]; angle: string
    identity?: ResearchIdentity
    profile?: ResearchProfile                   // live search only
    sources: ResearchSource[]                   // links for claims from live web / X search; [] when the provider had no search. Render http(s) only
    disclaimer: string                          // no-search providers: 'Generated by AI from CRM data and general sector knowledge. Not verified. No live web research was performed.'; Grok: says it used live web and X search
  }
}

export type SalesErrorCode =
  | 'VALIDATION' | 'UNKNOWN_COLLECTION' | 'READ_ONLY' | 'APPEND_ONLY' | 'IMMUTABLE_FIELD'
  | 'NOT_A_MEMBER' | 'MEMBER_INACTIVE' | 'ROLE_REQUIRED' | 'NOT_FOUND'
  | 'CONFLICT' | 'LAST_SUPER' | 'LEASE_LOST' | 'DUPLICATE_SEND' | 'CONTENTION' | 'SUPPRESSED'
  | 'BATCH_TOO_LARGE' | 'PAYLOAD_TOO_LARGE'
  | 'INVALID_URL' | 'AI_PROVIDER_ERROR' | 'AI_BAD_OUTPUT' | 'AI_CAP_REACHED' | 'NOT_CONFIGURED' | 'UPSTREAM_ERROR' | 'INTERNAL'
  | 'PHONE_CAP_REACHED' | 'PHONE_NO_INPUT' | 'PROVIDER_ERROR'
  | 'INVOICE_PAID' | 'INVOICE_ALREADY_VOID' | 'INVOICE_NOT_ISSUED' | 'LINK_DEACTIVATION_FAILED' | 'INVOICE_ALREADY_TEST' | 'INVOICE_NOT_TEST' | 'CONFIRMATION_MISMATCH' | 'INVOICE_DELETING' | 'REFUND_DUE_UNACKNOWLEDGED'   // LINK_DEACTIVATION_FAILED carries details: { linkId: string }
  | 'DUPLICATE_EXTERNAL_REFERENCE' | 'NOT_EXTERNAL' | 'ROSTERIO_MATCH'   // ROSTERIO_MATCH carries details: RosterioMatchesResponse. DUPLICATE_EXTERNAL_REFERENCE carries details: { invoiceId: string; dealId: string | null }

// ── Contact enrichment (Grok). Mirrors the API contract; names are identical. ────────────────────
/** 429 AI_CAP_REACHED carries this as `error.details`. `resetsOn` is 'YYYY-MM-01', the first day of next month (UTC). */
export interface EnrichUsage { used: number; limit: number; resetsOn: string }
export type EnrichField = 'email' | 'email2' | 'phone' | 'mobile' | 'title' | 'linkedin'
export type EmailPattern = 'first.last' | 'firstlast' | 'flast' | 'f.last' | 'first' | 'first_last' | 'last.first'
/** Server-side check of a cited page. confirmed: the page was fetched and shows the value. unconfirmed: it could not be fetched or read (timeout, blocked, non-HTML, JS-only, linkedin.com), so the value is kept but flagged. */
export type SourceCheck = 'confirmed' | 'unconfirmed'
export interface EnrichSuggestion { field: EnrichField; value: string; kind: 'published' | 'inferred'; sourceUrl?: string; pattern?: EmailPattern
  /** Set by the server for mobile numbers: may be a personal number rather than a business line. */
  personal?: boolean
  /** Only on kind 'published' email/phone suggestions. */
  sourceCheck?: SourceCheck }
export interface EnrichContactRequest { businessId: BusinessId; contactId: string; linkedinHint?: string }
export interface EnrichContactResponse extends AiMeta {
  mode: 'llm' | 'stub'; usage: EnrichUsage                                // stub: no key, no result, no call reserved
  result?: { status: 'found' | 'none' | 'withheld'; suggestions: EnrichSuggestion[]; sources: ResearchSource[]; withheld: number; disclaimer: string }
}
export interface FindPeopleRequest { businessId: BusinessId; companyId?: string; input?: { name: string; website?: string }; role?: string }
export interface FoundPerson { firstName: string; lastName: string; title: string; sourceUrl: string; linkedin?: string }   // no emails or phones
export interface FindPeopleResponse extends AiMeta {
  mode: 'llm' | 'stub'; usage: EnrichUsage
  result?: { people: FoundPerson[]; sources: ResearchSource[]; withheld: number; disclaimer: string }
}
export interface EnrichUsageResponse { enabled: boolean; usage: EnrichUsage; /** The business has a competitor list, so a competitor's tool adds to the score. */ competitorRule?: boolean }   // GET /ai/enrich/usage?businessId=

// ---- Web intelligence (Grok with live search) ----------------------------------------------------
// Every tool below except openers is a search-backed xAI call that spends one slot of the same monthly
// per-business cap as enrichment (EnrichUsage). Every URL returned was cited by the search; the server never trusts a model URL.

export type IntelKind = 'signals' | 'tech' | 'contact'
export interface IntelSubject { businessId: BusinessId; companyId?: string; input?: { name: string; website?: string } }   // companyId or input required

export type SignalKind = 'expansion' | 'funding' | 'hiring' | 'leadership' | 'closure' | 'award' | 'news'
/** hrOps: a hiring signal for an HR, payroll, people-and-culture, rostering or operations role (the roles Rosterio sells into). */
export interface CompanySignal {
  kind: SignalKind; headline: string; date?: string; sourceUrl: string; hrOps?: boolean
  /** Closure signals only: a person confirmed or dismissed the report. Never set by the server or the model. */
  review?: 'confirmed' | 'dismissed'; reviewedBy?: string; reviewedAt?: string
}
export interface SignalsResponse extends AiMeta {
  mode: 'llm' | 'stub'; usage: EnrichUsage
  result?: { signals: CompanySignal[]; sources: ResearchSource[]; withheld: number; disclaimer: string }
}

export type TechCategory = 'rostering' | 'hr' | 'payroll' | 'pos' | 'other'
/** competitor: the server flagged it against the business's own competitor list (e.g. Deputy, Humanforce, Tanda for Rosterio). */
export interface TechItem { name: string; category: TechCategory; evidence: string; sourceUrl: string; competitor?: boolean; sourceCheck?: SourceCheck }
export interface TechStackResponse extends AiMeta {
  mode: 'llm' | 'stub'; usage: EnrichUsage
  result?: { tools: TechItem[]; sources: ResearchSource[]; withheld: number; disclaimer: string }
}

/** Company-level details only (switchboard, general inbox, head office), never a person's. Server-checked against the cited page. */
export interface CompanyContactItem { field: 'phone' | 'email' | 'address'; value: string; sourceUrl: string; sourceCheck?: SourceCheck }
export interface CompanyContactResponse extends AiMeta {
  mode: 'llm' | 'stub'; usage: EnrichUsage
  result?: { items: CompanyContactItem[]; sources: ResearchSource[]; withheld: number; disclaimer: string }
}

/** Facts about the company itself that fit a CRM company record. Each carries the page that states it; the server checked that page. */
export type CompanyProfileField = 'description' | 'industry' | 'subindustry' | 'hq' | 'state' | 'country' | 'employees' | 'locations' | 'type'
export interface CompanyProfileItem { field: CompanyProfileField; value: string | number; sourceUrl: string; sourceCheck?: SourceCheck }
export interface CompanyProfileResponse extends AiMeta {
  mode: 'llm' | 'stub'; usage: EnrichUsage
  result?: { items: CompanyProfileItem[]; sources: ResearchSource[]; withheld: number; disclaimer: string }
}

export interface LeadListRequest { businessId: BusinessId; query: string; state?: string }   // query 10..300 chars
/** companyId is set when the CRM already holds this company (matched by website domain or exact name); the UI must not offer to import it again. */
export interface LeadCandidate { name: string; website?: string; state?: string; industry?: string; why: string; sourceUrl: string; companyId?: string }
export interface LeadListResponse extends AiMeta {
  mode: 'llm' | 'stub'; usage: EnrichUsage
  result?: { leads: LeadCandidate[]; sources: ResearchSource[]; withheld: number; disclaimer: string }
}

export interface MeetingPrepRequest { businessId: BusinessId; meetingId?: string; contactId?: string; companyId?: string }   // one of the three
export interface MeetingPrep {
  summary: string; talkingPoints: string[]; questions: string[]; watchOuts: string[]
  news: Array<{ headline: string; sourceUrl: string }>
}
export interface MeetingPrepResponse extends AiMeta {
  mode: 'llm' | 'stub'; usage: EnrichUsage
  result?: { prep: MeetingPrep; sources: ResearchSource[]; withheld: number; disclaimer: string }
}

/** Opening lines are written from signals already saved in the CRM, so this is a normal (non-search, uncapped) Anthropic call. */
export interface OpenerRequest { businessId: BusinessId; contactId?: string; companyId?: string }   // companyId or contactId required
export interface Opener { text: string; sourceUrl: string; signalKind: SignalKind }
export interface OpenerResponse extends AiMeta {
  mode: 'llm' | 'stub'
  /** True when the company has no saved signals: nothing true to open with, so no call was made and openers is empty. */
  noSignals?: boolean
  openers?: Opener[]
}

/** The `intel` collection: one record per company, business and kind, id `in_${companyId}_${businessId}_${kind}`, rewritten on refresh. */
export interface IntelRecord {
  id: string; businessId: BusinessId; companyId: string; kind: IntelKind
  ts: string; by: string; provider: AiProvider; model: string | null
  items: Array<CompanySignal | TechItem | CompanyContactItem>
  sources: ResearchSource[]; disclaimer: string
  /** The last time a lookup ran. ts is the time of the last non-empty result. Older records have neither: use ts. */
  checkedAt?: string
}

export type EnrichLogOutcome = 'ok' | 'provider_error' | 'bad_output' | 'cap'   // stub calls are not logged
export interface EnrichLogEntry {
  id: string
  at: string                       // ISO
  userId: string
  userName: string
  tool: 'enrich' | 'find'
  contactId?: string               // enrich only
  companyId?: string
  outcome: EnrichLogOutcome
  counts: { published: number; inferred: number; withheld: number; unconfirmed: number; found: number }  // found = find-people result count
  model?: string
}
/** GET /ai/enrich/log?businessId=&contactId=&limit= , newest first, limit default 20 max 100. Without contactId: admin / super-admin only. */
export interface EnrichLogResponse { entries: EnrichLogEntry[] }
/** POST /ai/enrich/check-email. 'no_mx' only on a definitive no-mail-server answer; timeouts and SERVFAIL are 'unknown'. */
export interface CheckEmailRequest { businessId: BusinessId; email: string }
export type EmailCheckStatus = 'ok' | 'no_mx' | 'unknown'
export interface CheckEmailResponse { domain: string; status: EmailCheckStatus }

// ── Rosterio CRM link. The server holds the Rosterio URL and key; neither ever reaches the browser. ──
/** Rosterio's real plans. The Rosterio deal field `plan` uses the same three values. */
export const ROSTERIO_PLANS = ['starter', 'pro', 'enterprise'] as const
export type RosterioPlan = typeof ROSTERIO_PLANS[number]
export type RosterioLinkState = 'provisioning' | 'provisioned' | 'unknown'
/** Lives on the company record as `rosterio`. Written by the server only; the browser never edits it. */
export interface RosterioLink {
  state: RosterioLinkState
  accountId?: string
  accountName?: string
  plan?: RosterioPlan
  isTrial?: boolean
  trialEndDate?: string               // ISO date
  /** Snapshot of the live account, refreshed by the server from Rosterio: its status ('active' | 'suspended' | 'cancelled' | 'deleted'). */
  accountStatus?: string
  /** 'deleted' once Rosterio no longer has the account. The link is kept: only a person unlinks. */
  accountState?: 'active' | 'deleted'
  /** Locations the account has, from the on-open refresh only. null = the read failed and there was no earlier count. */
  locationCount?: number | null
  /** ISO time the snapshot was last read from Rosterio. */
  refreshedAt?: string
  by?: string                         // member userId of whoever clicked Provision
  at?: string                         // ISO
}
export type RosterioPushOutcome = 'ok' | 'failed' | 'skipped'
export interface RosterioPushEntry { at: string; dealId: string; outcome: RosterioPushOutcome; reason?: string }
/** GET /sales/rosterio/status. Any sales member may read it. No URL or key in the body. */
export interface RosterioStatusResponse { configured: boolean; pendingFailures: number; recent: RosterioPushEntry[] }   // recent: last 20
/** POST /sales/rosterio/sync/retry (business admins). Body `{}`. The response body is not relied on: the status is read again afterwards. */
export interface RosterioRetryResponse { retried?: number; failed?: number }
/** GET /sales/rosterio/accounts. A live read of Rosterio, never stored. `billingEmail` is present only for business admins. */
export interface RosterioAccount {
  id: string
  name: string
  plan?: RosterioPlan | string
  status?: string
  isActive: boolean
  isTrial: boolean
  trialEndDate?: string
  createdAt?: string
  memberCount: number
  subscriptionStatus?: string
  billingEmail?: string
  /** AUD dollars per month. Paying accounts only; the server returns the three pricing fields only to Rosterio admins. */
  monthlyCost?: number | null
  pricingSource?: 'plan' | 'custom' | null
  billingQuantity?: number | null
  /** Managed billing state, Rosterio admins only; null when billing has not been started. */
  billingState?: RosterioBillingState | null
}
export interface RosterioAccountsResponse {
  accounts: RosterioAccount[]
  total: number
  /** Rosterio lists a fixed number of accounts, newest first. True when there may be older ones not shown. */
  truncated: boolean
  fetchedAt: string
}
/** POST /sales/rosterio/link. Needs edit rights in business `ros`. The server checks the account exists. */
export interface RosterioLinkRequest { companyId: string; accountId: string }
export interface RosterioLinkResponse { link: RosterioLink }
/** POST /sales/rosterio/unlink. Needs edit rights in business `ros`. */
export interface RosterioUnlinkRequest { companyId: string }
/** POST /sales/rosterio/provision. Needs edit rights in business `ros`. */
export interface RosterioProvisionRequest {
  dealId: string
  accountName: string
  adminFirstName: string
  adminLastName: string
  adminEmail: string
  adminPhone?: string
  plan: RosterioPlan
  isTrial?: boolean
  trialEndDate?: string               // ISO date; must be in the future when isTrial
  /** Lets a person go past matches on the admin or billing email alone (one person can run several accounts). An exact name match never proceeds. */
  confirmNotDuplicate?: boolean
}
/** 201, `Cache-Control: no-store`. `tempPassword` arrives once, only here, and is never stored by SalesOS. */
export interface RosterioProvisionResponse {
  link: RosterioLink
  adminUser: { email: string; isNewUser: boolean; tempPassword: string | null }
}

// ---- Rosterio: is there already an account for this? ----
// POST /sales/rosterio/matches RosterioMatchesRequest -> RosterioMatchesResponse. Read-only (edit rights in ros, like provisioning).
// POST /sales/rosterio/provision runs the same check first: unlinked matches stop it with 409 ROSTERIO_MATCH, details = RosterioMatchesResponse.
export interface RosterioMatchesRequest { companyId: string; accountName: string; administratorEmail: string }
export type RosterioMatchReason = 'name' | 'administratorEmail' | 'billingEmail'
export interface RosterioMatch {
  accountId: string
  name: string
  plan: string | null
  isTrial: boolean
  status: string | null
  /** Why it matched. Never an email address. */
  matchedOn: RosterioMatchReason[]
}
/** A match already linked to a SalesOS company. companyName only when the caller can see that company. */
export interface RosterioLinkedMatch extends RosterioMatch { companyId: string | null; companyName: string | null }
export interface RosterioMatchesResponse {
  /** false when Rosterio could not be asked: matches is then empty and provisioning would go ahead. */
  checked: boolean
  /** Not linked to any company: "Link this account instead" (POST /sales/rosterio/link) applies to these. */
  matches: RosterioMatch[]
  alreadyLinked: RosterioLinkedMatch[]
  /** True when provisioning could go ahead with confirmNotDuplicate: matches is not empty and none matched on name. */
  canConfirmNotDuplicate: boolean
}

// ---- Rosterio: keep the link snapshot fresh ----
// POST /sales/rosterio/refresh RosterioRefreshRequest -> RosterioRefreshResponse, when a company page opens. Refreshes the link
// snapshot from the live account (server-only write; the deal and the link itself are never changed). Nothing is unlinked automatically.
export interface RosterioRefreshRequest { companyId: string }
export interface RosterioPlanDrift { dealPlan: RosterioPlan; accountPlan: RosterioPlan }
export interface RosterioRefreshResponse {
  link: RosterioLink | null
  refreshed: boolean
  /** The deal's plan and the account's plan, only when both exist and differ. Informational: the deal is never modified. */
  planDrift: RosterioPlanDrift | null
  /** Rosterio admins only, and only when the server has an admin URL: `${ROSTERIO_ADMIN_URL}/accounts/${accountId}`. */
  adminUrl?: string
}

// ---- Rosterio payments (Stripe) ----
// GET /sales/rosterio/invoices?companyId=|accountId= -> RosterioInvoicesResponse: Rosterio's subscription invoices as Stripe has them,
// newest first (at most 1000). Rosterio admins and super users only (else ROLE_REQUIRED { needed: 'admin', businessId: 'ros' }), like
// Rosterio's revenue figures. failed = open, attempted, still owing; overdue = open past its due date or with no retry left.
// POST /sales/rosterio/invoices/sync (same role) runs the sync now -> { invoices, syncedAt, error }. Read-only: nothing is written to Stripe.
export type RosterioInvoiceStatus = 'draft' | 'open' | 'paid' | 'void' | 'uncollectible'
export interface RosterioInvoice {
  id: string; number: string | null; accountId: string; companyId: string | null; customerName: string
  status: RosterioInvoiceStatus; failed: boolean; overdue: boolean
  amountDueCents: number; amountPaidCents: number; amountRemainingCents: number; currency: string
  createdAt: string; dueAt: string | null; paidAt: string | null; periodStart: string | null; periodEnd: string | null
  attemptCount: number; nextAttemptAt: string | null; lastError: string | null; hostedUrl: string | null; pdfUrl: string | null
  /** The Stripe customer; the Xero contact is chosen once per customer. */
  customerId: string
  /** Where this invoice stands against Xero. null when the server has nothing to say (a draft). */
  xero: StripeXeroInfo | null
  /** The Xero contact chosen for this customer, or null when none is chosen yet. */
  xeroContact: XeroContactRef | null
}
export interface RosterioInvoicesResponse { invoices: RosterioInvoice[]; configured: boolean; syncedAt: string | null; syncError: string | null }

// ---- An external record that is a Stripe invoice, sent to Xero ----
// GET  /sales/invoices/:id/xero/stripe      -> ExternalStripeLink. No Stripe lookup: linked is null until someone finds it.
// POST /sales/invoices/:id/xero/stripe-link -> RosterioInvoice. Looks the record's reference up in Stripe and keeps a copy; the
//   usual Stripe Xero flow (contact, send, fee, payout) then applies to that copy. 409 CONFLICT with a plain reason when it is
//   not found (e.g. 'No Stripe invoice has the number AIQGCIEQ-0002'). Admins of ard only, else 403.
export interface ExternalStripeLink { linked: RosterioInvoice | null }

// ---- Rosterio billing (a managed account's Stripe subscription) ----
// Billing of a Rosterio account on negotiated (managed) terms, run by Rosterio (its managedBillingService); SalesOS only
// asks. Rosterio admins and super users only (else ROLE_REQUIRED { needed: 'admin', businessId: 'ros' }); the company must
// be linked to a Rosterio account (else NOT_FOUND).
// GET  /sales/rosterio/billing?companyId= -> RosterioBilling: the terms, the bill (amount + 10% GST), and billing so far.
// POST /sales/rosterio/billing/start StartRosterioBillingRequest -> StartRosterioBillingResponse. collection 'send_invoice'
//   emails an invoice each period, due in daysUntilDue (1..60, default 14); 'charge_automatically' charges a card on
//   file, emailing the customer an "add your card" link first when they have none (billing.state 'awaiting_card' until
//   they do; nothing is billed meanwhile). firstBillingDate is YYYY-MM-DD on the account's clock, today..+1 year; today
//   interval 'monthly' | 'yearly' (omitted = the terms' own): the other one moves the terms to it first, same yearly
//   total (options says what each costs); anything else -> 400 VALIDATION.
//   bills now, a later day starts a Stripe schedule then. Refused (CONFLICT) when billing is already set up, the terms
//   are inactive or ended, or the account is a trial; Rosterio's field errors come back as VALIDATION details.errors.
// POST /sales/rosterio/billing/stop { companyId } -> { billing }: a running subscription ends at the close of the period
//   already billed; a schedule not yet started, or a wait for a card, stops at once.
// POST /sales/rosterio/billing/card-link { companyId } -> { billing, cardEmailSent }: sends the card link again.
export type RosterioBillingState = 'starting' | 'awaiting_card' | 'scheduled' | 'active' | 'stopping' | 'stopped'
export type RosterioCollection = 'send_invoice' | 'charge_automatically'
export interface RosterioBilling {
  accountId: string; accountName: string; timezone: string; today: string; billingEmail: string | null
  terms: null | {
    billingModel: 'per_user' | 'flat'; amountCents: number; interval: 'monthly' | 'yearly'
    effectiveFrom: string; effectiveUntil: string | null; contractReference: string | null; status: string
  }
  amounts: null | { quantity: number; unitAmountCents: number; subtotalCents: number; gstCents: number; totalCents: number; gstPercent: number; interval: 'monthly' | 'yearly' }
  billing: null | {
    state: RosterioBillingState; collection: RosterioCollection; firstBillingDate: string; daysUntilDue: number | null
    billingEmail: string; startedAt: string; stoppedAt: string | null; cardUrl: string | null; cardSavedAt: string | null
    lastError: string | null; subscriptionStatus: string | null; currentPeriodEnd: string | null; cancelAtPeriodEnd: boolean
    /** Billing was started on the other interval, which changed the terms from these. */
    termsChangedFrom: null | { interval: 'monthly' | 'yearly'; amountCents: number }
  }
  /** The bill monthly and yearly. changesTerms: starting on it moves the terms to that interval (same yearly total). */
  options: Array<{ interval: 'monthly' | 'yearly'; quantity: number; unitAmountCents: number; subtotalCents: number; gstCents: number; totalCents: number; changesTerms: boolean }>
  canStart: boolean; cannotStartReason: string | null
}
/** Exactly one of companyId and accountId. */
export interface StartRosterioBillingRequest { companyId?: string; accountId?: string; collection: RosterioCollection; firstBillingDate: string; daysUntilDue?: number; billingEmail?: string; interval?: 'monthly' | 'yearly' }
export interface StartRosterioBillingResponse { billing: RosterioBilling; cardEmailSent?: boolean }

// ---- Rosterio account detail ----
// GET /sales/rosterio/accounts/:accountId -> RosterioAccountDetail: one Rosterio account as Rosterio has it, read live
// (Rosterio GET /api/admin/accounts/:id and /locations with the provisioning key), for the account page. Rosterio admins
// and super users only (else ROLE_REQUIRED { needed: 'admin', businessId: 'ros' }). accountId is 24 hex (else 400
// VALIDATION); an account Rosterio does not have -> 404 NOT_FOUND. Read field by field: no emails, phones, Stripe ids or
// database names reach the browser. admins are the account's active super_admin members (name and role only).
// The kiosk / payroll / compliance switches are operator features and are not part of this answer (they live in Rosterio Admin).
// locationCount is null when Rosterio's location list could not be read. company is the SalesOS company linked to it
// (data.rosterio.state 'provisioned' and accountId), else null.
export interface RosterioAccountDetail {
  accountId: string; name: string; plan: string | null; status: string | null; isActive: boolean; isTrial: boolean
  trialEndDate: string | null; createdAt: string | null; subscriptionStatus: string | null
  memberCount: number; maxUsers: number | null; maxLocations: number | null; locationCount: number | null
  billingState: RosterioBillingState | null
  pricing: null | { source: 'plan' | 'custom'; managedContract: boolean; monthlyCost: number | null; billingQuantity: number | null }
  terms: RosterioBilling['terms']
  aiCreditsPerPeriod: number | null
  awardSetup: null | { status: string; updatedAt: string | null }
  people: { active: number; byRole: { super_admin: number; manager: number; staff: number } }
  admins: Array<{ name: string; role: string }>
  company: null | { id: string; name: string }
  /** @deprecated Always []. Kept so the type matches the API for one release. Never rendered: the switches live in Rosterio Admin. */
  features: never[]
  /** The deal's plan vs the account's plan; non-null only when both exist and differ. The deal is never modified. */
  planDrift: RosterioPlanDrift | null
  /** Rosterio admins only, and only when the server has an admin URL. */
  adminUrl?: string
  fetchedAt: string
}
// Billing by account: GET /sales/rosterio/billing and POST /sales/rosterio/billing/start|stop|card-link now take
// accountId (24 hex) as an alternative to companyId (query param for GET, body field for POSTs). Exactly one of the two;
// both or neither -> 400 VALIDATION. An accountId is used as given (Rosterio refuses one it does not have, -> 404).
// RosterioAccount (GET /sales/rosterio/accounts) gains billingState: RosterioBillingState | null — managed billing state,
// Rosterio admins only like the pricing fields (absent for everyone else).

// ---- Rosterio test accounts ----
// settings/rosterioTest = { accounts: RosterioTestAccount[] }: Rosterio accounts kept for testing (an App Store review
// login, say). They stay in Rosterio unchanged; SalesOS shows them on their own tab and leaves them out of every customer
// count and revenue figure. At most 500 accounts, accountIds unique (else 400 VALIDATION). name is the account's name
// when it was marked (1..200 chars); reason is plain text 0..300. markedBy (the member's display name) and markedAt (ISO)
// are stamped by the server on entries that are new compared with the stored record, and whatever a client sends for
// them is ignored; an entry already stored keeps its stamps. Removing an entry un-marks the account. Only an admin of
// 'ros' or a super user may write the record (else ROLE_REQUIRED, details { needed: 'admin', businessId: 'ros' });
// every member reads it, as with other settings.
export interface RosterioTestAccount { accountId: string; name: string; reason: string; markedBy: string; markedAt: string }
export interface RosterioTestSettings { accounts: RosterioTestAccount[] }
export const MAX_ROSTERIO_TEST_ACCOUNTS = 500

// ── Invoicing (business `ard`, admins only). Additive. ────────────────────────────────────────────
export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'void'
export type InvoiceVoidReason = 'mistake' | 'client-cancelled' | 'replaced' | 'other'
export interface InvoiceVoidInfo { voidedAt: string; voidedBy: string; reason: InvoiceVoidReason; note: string; linkDeactivated: boolean | null }
export interface InvoiceRefundDue { amountCents: number; receivedAt: string; reference: string; acknowledgedAt: string | null; acknowledgedBy: string | null }
export type InvoicePaymentMethod = 'bank-transfer' | 'payid' | 'card' | 'other'
export interface InvoiceLine { description: string; detail?: string; qty: number; unitPriceCents: number; amountCents: number }
export interface InvoicePayment { method: InvoicePaymentMethod; paidAt: string; amountCents: number; reference: string }
/** Set when an admin marked the invoice as a test. Test invoices are excluded from every list, total and export unless ?includeTest=1. */
export interface InvoiceTestInfo { markedAt: string; markedBy: string; reason: string }
// Who made the invoice: a person, or the retainer scheduler (always as a draft), or a person recording one made outside
// SalesOS ('external', see below). Every existing invoice reads as 'manual'.
export type InvoiceSource = 'manual' | 'retainer' | 'external' | 'term'
export interface InvoiceDto {
  id: string; invoiceNumber: string; clientSlug: string; clientName: string
  companyId: string | null; dealId: string | null; milestoneId: string | null
  lineItems: InvoiceLine[]; gstRate: number; notes: string
  issueDate: string; paymentTermsDays: number; dueDate: string
  status: InvoiceStatus; overdue: boolean; payment: InvoicePayment | null
  offerCardPayment: boolean; paymentLinkUrl: string; paymentLinkIsAutomatic: boolean
  publicToken: string; hostedUrl: string; sentAt: string | null; issuedCount: number
  subtotalCents: number; gstCents: number; totalCents: number; createdAt: string
  voided: InvoiceVoidInfo | null; refundDue: InvoiceRefundDue | null
  test: InvoiceTestInfo | null
  source: InvoiceSource
  external: InvoiceExternalInfo | null
  xero?: InvoiceXeroInfo | null
}
export interface InvoiceInput {
  clientSlug: string; companyId?: string | null; dealId?: string | null; milestoneId?: string | null
  lineItems: Array<{ description: string; detail?: string; qty: number; unitPriceCents: number }>
  gstRate?: number; notes?: string; issueDate: string; paymentTermsDays: number; dueDate?: string
  offerCardPayment?: boolean; paymentLinkUrl?: string
}
/**
 * PUT /invoices/:id payment link: paymentLinkUrl left out (or sent unchanged) keeps the link in place. A different URL
 * (pasted, or '' to clear) replaces it and is kept even when the same save changes the total. The automatic (Stripe) link
 * is switched off at Stripe whenever it is replaced, cleared or the total changes; an unchanged pasted link is cleared
 * when the total changes. If the automatic link cannot be switched off (Stripe error or not configured) nothing is saved:
 * 409 LINK_DEACTIVATION_FAILED, details { linkId }.
 */
export interface VoidInvoiceInput { reason: InvoiceVoidReason; note?: string; linkStillLiveAcknowledged?: boolean }
/** POST /invoices/:id/mark-test. `reason` is trimmed, 1..200 chars, plain text, no control characters. */
export interface MarkTestInput { reason: string }
/** DELETE /invoices/:id/permanent (super only, test invoices only). `confirmNumber` must equal the invoice number exactly. */
export interface DeleteTestInput { confirmNumber: string }
export interface MarkPaidInput { method: InvoicePaymentMethod; paidAt?: string; reference?: string; amountCents?: number }
// ---- Xero (SalesOS pushes issued invoices and payments to Xero; Xero stays the books) ----
// InvoiceDto.xero is null for drafts, test invoices and external records. 'synced': Xero matches the SalesOS status. 'pending': sent before
// but SalesOS has since changed. 'error': the last push failed (message is plain text). 'not_sent': never pushed; the page says why from
// XeroStatus (not connected, or issued before settings.syncFrom). url opens the invoice in Xero once it exists. Optional here so a page
// released ahead of the API still reads an invoice.
export type XeroInfoState = 'synced' | 'pending' | 'error' | 'not_sent'
export interface InvoiceXeroInfo { state: XeroInfoState; message: string; syncedAt: string | null; url: string | null }
export type XeroTaxType = 'OUTPUT' | 'EXEMPTOUTPUT' | 'EXEMPTEXPORT' | 'NONE'
/** Tax type on the Stripe fee, an expense. */
export type XeroExpenseTaxType = 'INPUT' | 'EXEMPTEXPENSES' | 'NONE'
export interface XeroSettings {
  salesAccountCode: string; paymentAccountCode: string; gstTaxType: XeroTaxType; noGstTaxType: XeroTaxType; autoSync: boolean; syncFrom: string
  /** Rosterio subscription invoices from Stripe. Nothing is sent before stripeFrom ('' until chosen). */
  stripeSync: boolean; stripeFrom: string; clearingAccountCode: string; feeAccountCode: string; feeTaxType: XeroExpenseTaxType
}
// Rosterio's Stripe invoices in Xero. 'needs-contact': no Xero contact is chosen for the customer yet. payout: whether the money has left Stripe.
export type StripeXeroState = 'synced' | 'pending' | 'error' | 'needs-contact' | 'not_sent'
export interface StripeXeroInfo { state: StripeXeroState; message: string; syncedAt: string | null; url: string | null; feeCents: number | null; payout: 'paid-out' | 'awaiting' | null }
export interface XeroContactRef { id: string; name: string }
export interface XeroStatus {
  configured: boolean; reason?: string; connected: boolean; tenantName: string; connectedAt: string | null
  /** Xero turned the connection down (revoked or expired): offer Reconnect. */
  problem: string | null
  settings: XeroSettings | null; counts: { waiting: number; failed: number }
  /** False when the stored Xero scopes lack bank transactions: reconnect to send Stripe fees. */
  bankScope: boolean
}
export interface XeroAccount { code: string; name: string }
/** One Stripe fee item and the Xero expense account it goes to (the suggested one, or the one used once locked). */
export interface StripeFeeLine { key: string; label: string; amountCents: number; accountCode: string }
/** locked: the fee is already in Xero, so the lines show what was used and cannot change. */
export interface StripeFeePreview { lines: StripeFeeLine[]; taxCents: number; totalCents: number; locked: boolean }
export interface XeroAccountsResponse { sales: XeroAccount[]; bank: XeroAccount[]; expense: XeroAccount[] }
export interface InvoiceListResponse { invoices: InvoiceDto[] }
export interface InvoiceCompanyTotals { companyId: string; clientSlug: string; clientName: string; invoicedCents: number; paidCents: number; outstandingCents: number; overdueCents: number; lastPaymentAt: string | null; lastPaymentMethod: InvoicePaymentMethod | null }
export interface InvoiceSummary { tiles: { outstandingCents: number; overdueCents: number; paidThisMonthCents: number; draftCount: number; draftCents: number; needsRefundCount: number; needsRefundCents: number }; byCompany: InvoiceCompanyTotals[] }
export interface BillingClientDetails { email?: string; contactName?: string; abn?: string; address?: string }
export interface BillingClient { slug: string; clientName: string; billing: BillingClientDetails; linkedCompanyId: string | null }
export interface BillingClientInput { clientName: string; billing: BillingClientDetails }
export interface BillingMilestone { id: string; label: string; amountCents: number; plannedDate?: string; deliveredOn?: string | null; deliveredBy?: string; kind?: 'instalment'; termYear?: number; periodStart?: string; periodEnd?: string }
// lastDraftedFor: YYYY-MM-DD of the retainer period already drafted; written only by the server (a client write
// never changes it). When a plan's nextInvoiceDate is on or before today (org timezone) and lastDraftedFor differs,
// the server engine drafts the invoice (source 'retainer', status draft, never issued or sent) and moves
// nextInvoiceDate on one month, keeping the original day where the month has it (31 Jan -> 28/29 Feb -> 31 Mar).
// anchorDay: that original day of month, written by the server when it moves the date after its own draft. Read only:
// the API keeps the value it stored and drops one a client sends (none stored means none kept), and its own contract
// does not list the key. A client never writes it; a claim by hand moves nextInvoiceDate alone.
export interface BillingRetainer { amountCents: number; interval: 'monthly'; nextInvoiceDate?: string; lastDraftedFor?: string; anchorDay?: number }
// sales record collection 'billingPlans': id = 'bp_' + dealId; business 'ard'; write role admin
export interface BillingPlan { id: string; dealId: string; businessId: 'ard'; milestones: BillingMilestone[]; retainer?: BillingRetainer; contract?: BillingContract; variations?: BillingVariation[]; term?: BillingTerm }
// Notifications written by the retainer scheduler (the usual notifications record: userId, ts, read, type, title, body,
// link) carry two extra keys, kind and data:
//   kind 'retainer-invoice-drafted'      data { invoiceId, invoiceNumber, dealId }   to the deal owner
//   kind 'retainer-needs-billing-client' data { dealId, companyId }                  to the deal owner, once per due date
//   kind 'retainer-periods-skipped'      a plan more than one period behind: only the latest period is drafted; the months passed over are listed once
export type RetainerNotificationKind = 'retainer-invoice-drafted' | 'retainer-needs-billing-client' | 'retainer-periods-skipped'
export interface RetainerInvoiceDraftedData { invoiceId: string; invoiceNumber: string; dealId: string }
export interface RetainerNeedsBillingClientData { dealId: string; companyId: string }
// ---- Ardorio contract ledger ----
export type EngagementType = 'fixed-price' | 'time-materials' | 'support-retainer' | 'term-agreement'
export type VariationStatus = 'proposed' | 'approved' | 'rejected'
export interface BillingVariation { id: string; label: string; amountCents: number; reason: string; status: VariationStatus; createdAt: string; createdBy: string; decidedAt?: string; decidedBy?: string }
// amountCents is SIGNED (a reduction is negative), ex GST, non-zero, |amount| <= 100000000.
export interface BillingContract { baselineCents: number; engagementType: EngagementType; contractedOn: string; contractedBy: string; estimateAtWonCents: number }
// BillingPlan gains: contract?: BillingContract ; variations?: BillingVariation[]
// BillingMilestone gains: deliveredOn?: string ; deliveredBy?: string   (YYYY-MM-DD, not in the future)
// contracted total = contract.baselineCents + sum(amountCents of variations with status 'approved'). It is the denominator for progress and reconciliation.
// Server-written keys (a client value is ignored and the stored value kept): contract.contractedBy, variation.createdBy, variation.createdAt, variation.decidedBy, variation.decidedAt, milestone.deliveredBy.
// The By keys (contractedBy, createdBy, decidedBy, deliveredBy) hold the caller's display name (displayName || username || email), not a user id: show the stored text as it is.
// Amounts here are ex-GST cents. Derived milestone status (web computes): Planned (no live invoice with this milestoneId), Draft invoice (invoice draft), Invoiced (sent), Paid. A void invoice counts as none of them.
// ---- Recorded won deals and external invoices ----
// Deals: a deal created already won carries recordedWonDirectly: true and recordedWonBy (server-set display name). The server refuses a won date (deal.close) in the future for such a deal. Restoring a deleted deal (resurrect) keeps its stored stamps, or their absence, and is not judged as a new recorded won deal.
// InvoiceSource gains 'external' (InvoiceSource = 'manual' | 'retainer' | 'external').
export type ExternalInvoiceSource = 'xero' | 'other-system' | 'bank-transfer-no-invoice'
export interface ExternalInvoiceInput { companyId: string; dealId: string; milestoneId?: string | null; externalSource: ExternalInvoiceSource; externalReference: string; issueDate: string; subtotalCents: number; gstCents: number; paidOn?: string | null; paymentMethod?: InvoicePaymentMethod | null; paidAmountCents?: number | null; notes?: string }
// An external record is outstanding ('sent', no paidOn) or paid in full ('paid', paidOn given): paidAmountCents may be
// omitted (it is then subtotal + GST) and, when given, must equal subtotalCents + gstCents, else 400 VALIDATION on
// paidAmountCents. Collected counts a paid record's whole subtotal, so a part payment is recorded as its own record for
// the part paid, with the rest left as an unpaid record.
export interface InvoiceExternalInfo { source: ExternalInvoiceSource; reference: string; recordedBy: string; recordedAt: string }
// InvoiceDto gains: external: InvoiceExternalInfo | null
// The billing client of an external record: the company's linked one; else the one unlinked billing client the company's
// earlier non-void invoices bill (it is then linked); else a billing-only client made from the company name (one per
// company, linked after the record is written). Two or more unlinked clients on earlier invoices -> 409 CONFLICT
// { field: 'companyId', clientSlugs, needsBillingLink: true }: link the right one first.
// POST /sales/invoices/external (ExternalInvoiceInput) -> InvoiceDto ; PUT /sales/invoices/:id/external (ExternalInvoiceInput) -> InvoiceDto (external, not void)
// SalesErrorCode gains: 'DUPLICATE_EXTERNAL_REFERENCE' (details: { invoiceId: string; dealId: string | null }) | 'NOT_EXTERNAL'
// ---- Linking an issued invoice to a company ----
// The company on an invoice (companyId on POST/PUT /invoices and PUT /invoices/:id/links) must be visible in ard. A new
// invoice or a DRAFT may only go on the company its billing client is linked to (else 400 VALIDATION, field companyId).
// An ISSUED invoice (sent or paid) may also go on that company; when its own billing client is linked to NO company it
// may go on ANY company visible in ard, even one billed as a different client or with none. When its billing client is
// linked to a company, it may only go on that company (else 400 VALIDATION, field companyId).
// Linking an invoice never links its billing client and never changes the client, the bill-to, the number, the status,
// the totals, the dates, the public token or the card link: the invoice stays addressed to the client it was sent to.
export interface InvoiceLinksInput { companyId?: string | null; dealId?: string | null; milestoneId?: string | null }
// PUT /sales/invoices/:id/links (InvoiceLinksInput) -> InvoiceDto (ard admins or super only). Draft, sent or paid. A void
// invoice is 409 INVOICE_ALREADY_VOID; an external record is 409 CONFLICT { external: true } (use PUT /invoices/:id/external);
// any other key is 400 VALIDATION. A key left out is kept, null clears, clearing the deal clears the milestone. Writes only
// companyId, dealId and milestoneId, plus, when one of them changed, one audit row 'Invoice links changed'
// { businessId: 'ard', invoiceId, invoiceNumber, status, clientSlug, from: {companyId, dealId, milestoneId}, to: {...} }.
// A paid invoice still refuses PUT /invoices/:id (409); this route is how its links change.
// Money views (customers, company and deal billing, revenue, forecast) follow the invoice's companyId/dealId/milestoneId,
// never its clientSlug, so such an invoice counts on the company it is linked to.
// ---- Ardorio revenue report ----
export type RevenueSourceFilter = 'all' | 'salesos' | 'external'
export interface RevenueMonth { month: string /* YYYY-MM */; invoicedCents: number; collectedCents: number; externalInvoicedCents: number; externalCollectedCents: number }
export interface RevenueReport { from: string; to: string; source: RevenueSourceFilter; months: RevenueMonth[]; invoicedCents: number; collectedCents: number; outstandingCents: number; overdueCents: number; recordedLate: { month: string; count: number; cents: number }[] }
// GET /sales/reports/revenue?business=ard&from=YYYY-MM-DD&to=YYYY-MM-DD&source=all|salesos|external -> RevenueReport (ard admins or super only). All money is integer cents ex GST. Invoiced by issueDate, collected by payment date; void and test invoices never count. outstanding/overdue are as of now (not range bound). recordedLate lists months in range whose figures include external records recorded (external.recordedAt) after that month ended.
// Goal metrics gain: 'won_value' (dollars: per deal won in the period, the contract baseline frozen at won, else deal.value), 'invoiced_cents', 'collected_cents' (from the revenue report, ard only).
// A goal with metric 'invoiced_cents' or 'collected_cents' is Ardorio money: businessId must be 'ard' (else VALIDATION); only an ard admin or super may create, change or delete one, or change a goal's metric to one (else ROLE_REQUIRED, details { needed: 'admin', businessId: 'ard', field: 'metric' }); to every other member it is hidden (absent from bootstrap, a hidden entry with data null in the changes feed, NOT_FOUND on write).
// No API contract change for this feature.
// ---- Meeting lifecycle and activity voiding ----
// Meeting.status: 'upcoming' | 'completed' | 'cancelled' | 'no-show'. A cancelled meeting carries cancelledAt (ISO), cancelledBy (display name, server-set) and cancelReason (plain text <= 300). A rescheduled meeting stays 'upcoming' with its new start and appends the old start to rescheduledFrom: string[] (ISO). Meetings may be deleted by their owner (ownerId, else whoever created it) or a manager+ of the business. Meeting.ownerId is an owner field: only a manager+ may change it (else ROLE_REQUIRED, details { needed: 'manager', field: 'ownerId' }), so a rep cannot take a meeting over to delete it. Status moves: an upcoming meeting may become any status; a completed or cancelled meeting keeps its status; a no-show may become upcoming (rebooked) or completed. Any other change of status is 400 VALIDATION; a stored status outside the four (an older record) may move to any of them.
// Activity void: an existing activity may change ONLY by gaining { voided: true, voidedAt (ISO), voidedBy (display name, server-set), voidReason (plain text 1..300) }, written by the activity's actor or a manager+ of its business; once voided it cannot be un-voided or changed again. Voided activities are excluded from every count, metric, goal, report and timeline total (shown struck through with the reason).
// Deal reopen writes reopenedAt, reopenedBy and clears won/lost fields (closedAt, lostReason, wonNotes if present); stage returns to the stage before close from stageHistory (fallback: the pipeline's last open stage).
// Reopening a deal recorded as won directly ends that classification: recordedWonDirectly and recordedWonBy are removed, so a later win through the pipeline counts as a pipeline win (and the recorded-won future-date rule no longer applies). They are not lost: the server appends { recordedWonBy: string | null, reopenedAt (ISO), reopenedBy (display name) } to deal.recordedWonHistory, an append-only, server-set list (client values ignored, like reopenedAt/reopenedBy). Reports that classify won value use recordedWonDirectly as it is now; recordedWonHistory is audit only.

// ---- Ardorio term agreements ----
// A term agreement is a multi-year contract billed by schedule (for example 5 years, the same fee each year). It is an
// Ardorio deal like any other: one contract frozen at Won, an immutable variations ledger, milestones, invoices. There is
// still no MRR or ARR for Ardorio; views may show the annual fee of a term agreement as "Annual fee".
// EngagementType gains 'term-agreement'. BillingPlan gains term?: BillingTerm. InvoiceSource gains 'term'.
export type TermFrequency = 'annual' | 'quarterly' | 'monthly'
export type TermTiming = 'advance' | 'arrears'
export type TermEscalation = 'none' | 'fixed' | 'cpi'
export type TermExit = 'committed' | 'break'
export interface TermCpiConfirmation { year: number; bp: number; confirmedOn: string; confirmedBy: string }
export interface TermEnd { endedOn: string; reason: string; endedBy: string; recordedAt: string }
export interface TermWaiver { milestoneId: string; reason: string; waivedOn: string; waivedBy: string }
export interface BillingTerm {
  startDate: string            // YYYY-MM-DD, first day of the term
  termMonths: number           // integer 1..120
  annualCents: number          // year-1 fee ex GST, integer 1..100000000
  frequency: TermFrequency
  timing: TermTiming
  escalation: TermEscalation
  escalationBp: number         // 'fixed': the yearly rise; 'cpi': the ASSUMED yearly rise until a year is confirmed; 'none': 0. Integer 0..2000 (basis points)
  exit: TermExit               // 'break': the client may end the agreement at any anniversary of startDate
  breakNoticeDays: number      // 'break' only (else 0): notice the client must give before an anniversary, integer 0..365
  autoDraft: boolean           // the server drafts each instalment's invoice on its invoice date
  draftFrom: string            // server-set YYYY-MM-DD (org timezone) when the term is first stored; instalments dated before it are never auto-drafted
  cpiConfirmed?: TermCpiConfirmation[]  // append-only, server-stamped confirmedBy/confirmedOn
  ended?: TermEnd              // set once by an admin to end the agreement early; never unset
  waived?: TermWaiver[]        // append-only: instalments the client will not be billed for, server-stamped waivedOn/waivedBy
}
// BillingMilestone gains: kind?: 'instalment' (absent = a one-off milestone); termYear?: number; periodStart?: string; periodEnd?: string
// (YYYY-MM-DD, inclusive). For an instalment, plannedDate is its INVOICE DATE. An instalment is earned when its invoice is ISSUED
// (a sent or paid, non-test invoice linked by milestoneId), never by a draft; deliveredOn is never set on an instalment (400 VALIDATION).
// "Un-issued" below means no such invoice: a draft never fixes an instalment's amount.
//
// Schedule (pure helper termSchedule(term) in both repos, src/services/sales/billing/termSchedule.ts and src/sales/shared/termSchedule.ts,
// identical results: both run the cases in the API's src/services/sales/billing/termSchedule.fixtures.json). addMonths keeps the day
// of month, clamped to the month's last day (31 Jan + 1 = 28/29 Feb).
//   periodMonths = 12 (annual) | 3 (quarterly) | 1 (monthly); termEnd = addMonths(startDate, termMonths) (exclusive).
//   Period i (0-based) starts addMonths(startDate, i*periodMonths) and ends the day before min(addMonths(startDate, (i+1)*periodMonths), termEnd).
//   Periods continue while the start is before termEnd; the last one may be short.
//   termYear y = floor(i*periodMonths/12) + 1; years = ceil(termMonths/12).
//   Yearly fee: fee(1) = annualCents; fee(y) = round(fee(y-1) * (10000 + rate(y)) / 10000) where rate(y) = 0 for 'none', escalationBp for
//   'fixed', and for 'cpi' the confirmed bp of year y if cpiConfirmed has it, else escalationBp. Rounding is half away from zero on integers.
//   Within year y, with m0/m1 the whole months from the start of year y to the period's start/end (a short last period simply has fewer
//   months, since termMonths is whole months), amount = round(fee(y)*m1/12) - round(fee(y)*m0/12), so a full year's periods sum exactly to fee(y).
//   Instalment id 'inst_<y>_<k>' (k = 1-based period within the year); label 'Year <y> of <years>' (annual) or 'Year <y> of <years>,
//   quarter <k>' / 'Year <y> of <years>, month <k>'; plannedDate = periodStart ('advance') or periodEnd ('arrears').
//
// Writing a term (billingPlans, ard admins or super, deal won). The term is first set together with a contract whose engagementType is
// 'term-agreement'. The SERVER then replaces any client-sent instalments with termSchedule(term) (one-off milestones, e.g. a build fee,
// are kept) and stamps draftFrom. contract.baselineCents must equal the one-off milestones plus the schedule total, else 400 VALIDATION
// { field: 'contract.baselineCents', expectedCents }. After that, startDate, termMonths, annualCents, frequency, timing, escalation,
// escalationBp, exit and breakNoticeDays are frozen (a change is 400 VALIDATION; price changes go through variations). autoDraft may be
// toggled. Instalments cannot be added, removed or re-priced by a client (400 VALIDATION); only the server changes them, below.
//   Confirm CPI (escalation 'cpi'): append { year, bp } (year 2..years, not already confirmed, bp integer -1000..2000). The server stamps
//   confirmedBy/confirmedOn, recomputes the schedule, re-prices every un-issued instalment of year >= that year, and
//   appends ONE approved variation for the difference (label 'CPI year <y>: <bp/100>% (assumed <escalationBp/100>%)', server-stamped,
//   skipped when the difference is 0), so contracted still equals the schedule. Instalments already issued keep their amounts.
//   End early: set ended { endedOn, reason (1..300) } once (endedOn >= startDate, before termEnd). The server stamps endedBy/recordedAt,
//   removes every un-issued instalment whose periodStart >= endedOn, cuts an un-issued instalment whose period spans endedOn to
//   round(amount * days(periodStart..endedOn-1) / days(period)) (a cut that rounds below 1 cent removes it), and appends ONE approved
//   variation of minus the total removed (label 'Ended early on <endedOn>'). A cut instalment's periodEnd becomes endedOn - 1 day and,
//   for 'arrears', its plannedDate too ('advance' keeps periodStart). Issued instalments are kept; refunds or credits stay manual. No
//   instalment is ever added to an ended agreement: the ones that remain are still auto-drafted (below), and the reminders stop.
//   Waive an instalment (any time, ended or not): append { milestoneId, reason (1..300) } to waived. The instalment must be one of the plan's
//   and un-issued (cancel its invoice first). The server stamps waivedOn/waivedBy, removes the instalment and appends ONE approved variation
//   'var_waive_<milestoneId>' of minus its amount (label 'Waived: <instalment label>'). The write may leave the waived instalment out of
//   milestones or echo it. Append-only: a waiver never changes or goes. This is how one instalment the client will not pay stops being drafted.
//   Drafts follow: after any of the three is saved, every draft linked to an instalment it re-priced takes the new amount when it has one line
//   item at qty 1 and no automatic card link (a pasted card link is cleared); a draft linked to a removed instalment, or one that cannot
//   be re-priced, is deleted when its source is 'term' and otherwise unlinked from the milestone (milestoneId cleared) and kept.
//
// Auto-drafting (server engine tick, like the retainer scheduler, same lease and org timezone): for each plan with term.autoDraft (ended
// or not: an ended plan drafts the instalments that remain), its deal won and not archived: every instalment with draftFrom <= plannedDate <= today and no non-void, non-test invoice linked to it
// gets one draft invoice (source 'term', status draft, never issued or sent) for the deal's company billing client, linked
// companyId/dealId/milestoneId, one line item '<deal name>: <label> (<periodStart> to <periodEnd>)' qty 1 at the instalment amount, GST
// at the business default, notes empty. Idempotent under concurrent ticks (one invoice per instalment): termKey '<dealId>:<milestoneId>:<n>',
// n one more than the highest n in any invoice's termKey for that instalment, whatever that invoice's status or link now (0 for the
// first), so an invoice relinked elsewhere or a deleted one never makes a used key look free. The draft is priced from the plan read
// just before it is created and checked against the plan after: if Confirm CPI, End early or a waiver changed the instalment in between,
// the draft follows it as above (a removed instalment's draft is deleted and no notification is sent).
// An instalment whose draft is deleted, or whose invoice is cancelled or marked test, is drafted again on the next tick: waive it to stop that.
// No billing client on the company: no draft, notification kind 'term-needs-billing-client' { dealId, companyId } once per instalment
// (and recipient, below).
// Notifications go to the people who can read the plan: every active ard admin or super user, once each, the deal owner included only
// when they are one (a rep or manager who owns the deal is not told). Each 'once' below is once per recipient (deterministic ids per
// recipient; one a recipient deleted is not brought back). Reminders are sent only while the agreement has not ended.
// 'term-invoice-drafted' { invoiceId, invoiceNumber, dealId, milestoneId };
// 'term-cpi-to-confirm' { dealId, year } once, from 30 days before the first instalment of an unconfirmed CPI year until its date;
// 'term-break-window' { dealId, anniversary, noticeBy } once per anniversary, from 30 days before noticeBy until noticeBy (exit 'break');
// 'term-ending' { dealId, termEnd } once, from 90 days before termEnd (time to renew).
//
// Reporting (web, pure helpers): contracted = baseline + approved variations as before. For exit 'break' (not ended), the break point is
// the first anniversary of startDate after today, before termEnd, whose noticeBy (anniversary minus breakNoticeDays) is today or later:
// once an anniversary's noticeBy has passed the client can no longer break there. committed = contracted minus the un-issued instalments
// whose periodStart is on or after the break point; those are "Not yet committed (break at <anniversary>)". No break point left: all of
// it is committed. Earned for an instalment = issued. The forecast places instalments on plannedDate.
// Invoiced and collected stay invoice based (revenue is recognised when invoiced). Renewal: termEnd and "ends in N days" on the deal and Customers.

/** GET/PUT /sales/invoices/settings: the business profile of GET/PUT /settings/business, plus a read-only `stripeConfigured`. */
export interface InvoiceBankDetails { accountName: string; bsb: string; accountNumber: string; payId: string }
export interface InvoiceSettings {
  name: string; abn: string; address: string; email: string
  gstRegistered: boolean; offerCardPayments: boolean
  bank: InvoiceBankDetails
  stripeConfigured?: boolean
}
// ── Mobile phone lookup (vendor-agnostic). Mirrors the API contract; names are identical. ────────
// GET /phone/status and POST /phone/reveal. Error codes: NOT_CONFIGURED, PHONE_CAP_REACHED (details = PhoneUsage),
// PHONE_NO_INPUT, PROVIDER_ERROR. The browser never sees a vendor key.
export const PHONE_PROVIDERS = ['leadmagic','signalhire','wiza'] as const
export type PhoneProviderId = typeof PHONE_PROVIDERS[number]
export interface PhoneNumberFound { e164: string; type: 'mobile' | 'other' | 'unknown'; confidence?: number }
export interface PhoneUsage { used: number; limit: number; resetsOn: string }
export interface PhoneStatusResponse { configured: boolean; provider?: PhoneProviderId; label?: string; usage: PhoneUsage }
export interface RevealPhoneRequest { contactId: string; businessId: BusinessId }
export interface RevealPhoneResponse { mode: 'live' | 'stub'; provider?: PhoneProviderId; status: 'found' | 'not_found'; numbers: PhoneNumberFound[]; creditsUsed?: number; usage: PhoneUsage; lastCheckedAt?: string }
