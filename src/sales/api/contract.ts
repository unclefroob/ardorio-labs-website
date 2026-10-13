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

export const SETTINGS_IDS = ['org', 'wiza', 'demo', 'crossStatus'] as const
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
export interface ResearchRequest { businessId: BusinessId; companyId?: string; input?: { name: string; website?: string; industry?: string } }  // companyId or input required
export interface ResearchResponse extends AiMeta {
  mode: 'llm' | 'stub'
  crmFactsUsed: Array<[string, string]>        // always present; CRM facts sent (fact)
  inference?: {                                 // model inference, never fact; present iff mode 'llm'
    overview: string; businessModel: string; challenges: string[]; offerings: string[]
    stakeholders: string[]; angle: string
    identity?: ResearchIdentity
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
  | 'DUPLICATE_EXTERNAL_REFERENCE' | 'NOT_EXTERNAL'   // DUPLICATE_EXTERNAL_REFERENCE carries details: { invoiceId: string; dealId: string | null }

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
}
/** 201, `Cache-Control: no-store`. `tempPassword` arrives once, only here, and is never stored by SalesOS. */
export interface RosterioProvisionResponse {
  link: RosterioLink
  adminUser: { email: string; isNewUser: boolean; tempPassword: string | null }
}

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
export type InvoiceSource = 'manual' | 'retainer' | 'external'
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
}
export interface InvoiceInput {
  clientSlug: string; companyId?: string | null; dealId?: string | null; milestoneId?: string | null
  lineItems: Array<{ description: string; detail?: string; qty: number; unitPriceCents: number }>
  gstRate?: number; notes?: string; issueDate: string; paymentTermsDays: number; dueDate?: string
  offerCardPayment?: boolean; paymentLinkUrl?: string
}
export interface VoidInvoiceInput { reason: InvoiceVoidReason; note?: string; linkStillLiveAcknowledged?: boolean }
/** POST /invoices/:id/mark-test. `reason` is trimmed, 1..200 chars, plain text, no control characters. */
export interface MarkTestInput { reason: string }
/** DELETE /invoices/:id/permanent (super only, test invoices only). `confirmNumber` must equal the invoice number exactly. */
export interface DeleteTestInput { confirmNumber: string }
export interface MarkPaidInput { method: InvoicePaymentMethod; paidAt?: string; reference?: string; amountCents?: number }
export interface InvoiceListResponse { invoices: InvoiceDto[] }
export interface InvoiceCompanyTotals { companyId: string; clientSlug: string; clientName: string; invoicedCents: number; paidCents: number; outstandingCents: number; overdueCents: number; lastPaymentAt: string | null; lastPaymentMethod: InvoicePaymentMethod | null }
export interface InvoiceSummary { tiles: { outstandingCents: number; overdueCents: number; paidThisMonthCents: number; draftCount: number; draftCents: number; needsRefundCount: number; needsRefundCents: number }; byCompany: InvoiceCompanyTotals[] }
export interface BillingClientDetails { email?: string; contactName?: string; abn?: string; address?: string }
export interface BillingClient { slug: string; clientName: string; billing: BillingClientDetails; linkedCompanyId: string | null }
export interface BillingClientInput { clientName: string; billing: BillingClientDetails }
export interface BillingMilestone { id: string; label: string; amountCents: number; plannedDate?: string; deliveredOn?: string | null; deliveredBy?: string }
// lastDraftedFor: YYYY-MM-DD of the retainer period already drafted; written only by the server (a client write
// never changes it). When a plan's nextInvoiceDate is on or before today (org timezone) and lastDraftedFor differs,
// the server engine drafts the invoice (source 'retainer', status draft, never issued or sent) and moves
// nextInvoiceDate on one month, keeping the original day where the month has it (31 Jan -> 28/29 Feb -> 31 Mar).
// anchorDay: that original day of month, written by the server when it moves the date after its own draft. Read only:
// the API keeps the value it stored and drops one a client sends (none stored means none kept), and its own contract
// does not list the key. A client never writes it; a claim by hand moves nextInvoiceDate alone.
export interface BillingRetainer { amountCents: number; interval: 'monthly'; nextInvoiceDate?: string; lastDraftedFor?: string; anchorDay?: number }
// sales record collection 'billingPlans': id = 'bp_' + dealId; business 'ard'; write role admin
export interface BillingPlan { id: string; dealId: string; businessId: 'ard'; milestones: BillingMilestone[]; retainer?: BillingRetainer; contract?: BillingContract; variations?: BillingVariation[] }
// Notifications written by the retainer scheduler (the usual notifications record: userId, ts, read, type, title, body,
// link) carry two extra keys, kind and data:
//   kind 'retainer-invoice-drafted'      data { invoiceId, invoiceNumber, dealId }   to the deal owner
//   kind 'retainer-needs-billing-client' data { dealId, companyId }                  to the deal owner, once per due date
//   kind 'retainer-periods-skipped'      a plan more than one period behind: only the latest period is drafted; the months passed over are listed once
export type RetainerNotificationKind = 'retainer-invoice-drafted' | 'retainer-needs-billing-client' | 'retainer-periods-skipped'
export interface RetainerInvoiceDraftedData { invoiceId: string; invoiceNumber: string; dealId: string }
export interface RetainerNeedsBillingClientData { dealId: string; companyId: string }
// ---- Ardorio contract ledger ----
export type EngagementType = 'fixed-price' | 'time-materials' | 'support-retainer'
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
// ---- Ardorio revenue report ----
export type RevenueSourceFilter = 'all' | 'salesos' | 'external'
export interface RevenueMonth { month: string /* YYYY-MM */; invoicedCents: number; collectedCents: number; externalInvoicedCents: number; externalCollectedCents: number }
export interface RevenueReport { from: string; to: string; source: RevenueSourceFilter; months: RevenueMonth[]; invoicedCents: number; collectedCents: number; outstandingCents: number; overdueCents: number; recordedLate: { month: string; count: number; cents: number }[] }
// GET /sales/reports/revenue?business=ard&from=YYYY-MM-DD&to=YYYY-MM-DD&source=all|salesos|external -> RevenueReport (ard admins or super only). All money is integer cents ex GST. Invoiced by issueDate, collected by payment date; void and test invoices never count. outstanding/overdue are as of now (not range bound). recordedLate lists months in range whose figures include external records recorded (external.recordedAt) after that month ended.
// Goal metrics gain: 'won_value' (sum of value of deals won in the period, cents-free dollars as deal.value), 'invoiced_cents', 'collected_cents' (from the revenue report, ard only).

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
