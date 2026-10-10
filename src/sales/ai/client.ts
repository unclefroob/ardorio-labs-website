import {
  aiCheckEmail, aiClassify, aiCompanyContact, aiCopilot, aiDraft, aiEnrichContact, aiEnrichLog, aiEnrichUsage, aiFindPeople, aiLeadList, aiMeetingPrep,
  aiMeetingRecap, aiOpener, aiReplySuggest, aiResearch, aiSignals, aiTechStack,
} from '../api/ai'
import type {
  AiMeta, AiProvider, CompanyContactItem, CompanySignal, EmailCheckStatus, EnrichLogEntry, EnrichSuggestion, EnrichUsage, FoundPerson, IntelKind, IntelSubject,
  LeadCandidate, MeetingPrep, MeetingPrepRequest, Opener, OpenerRequest, ResearchSource, TechItem,
} from '../api/contract'
import { SalesHttpError, SalesNetworkError } from '../api/http'
import { F } from '../data/F'
import { isAiEnabled, isProviderEnabled } from '../data/session'
import { Q } from '../data/Q'
import type { BusinessId, Contact, Deal, Meeting, Research, Thread } from '../data/types'
import { getUsage, putEnrich, setUsage } from './enrichCache'
import * as local from './local'

export type AiSource = 'llm' | 'stub' | 'fallback' | 'refused'

/** How a piece of AI-shaped content was produced. The UI badges it from this, never from the text. */
export interface AiTag {
  source: AiSource
  model: string | null
  /** Which provider the server routed this tool to; absent for the local template path, which has no provider. */
  provider?: AiProvider
  /** Server label for built-in template content (source 'stub'). */
  label?: string
}
export interface AiResult<T> {
  value: T
  ai: AiTag
}

const FALLBACK: AiTag = { source: 'fallback', model: null }

const PROVIDER_NAMES: Record<AiProvider, string> = { anthropic: 'Claude', xai: 'Grok' }
export const providerName = (p: AiProvider): string => PROVIDER_NAMES[p]

function tagFrom(m: AiMeta): AiTag {
  return { source: m.mode === 'llm' ? 'llm' : m.mode === 'refused' ? 'refused' : m.mode === 'stub' ? 'stub' : 'fallback', model: m.model, label: m.label, provider: m.provider }
}

/** Only an unreachable or failing provider degrades to the local template; a 4xx is the caller's to handle. */
function degradable(e: unknown): boolean {
  return e instanceof SalesNetworkError || (e instanceof SalesHttpError && e.status === 502)
}

export function badgeText(t: AiTag): string | null {
  switch (t.source) {
    case 'llm': return `AI-written${t.provider ? ` by ${providerName(t.provider)}` : ''}${t.model ? ` (${t.model})` : ''}`
    case 'stub': return t.label || 'Template'
    case 'fallback': return 'AI unavailable, showing template'
    case 'refused': return null
  }
}

/** Shown before any call when the server has no key for the provider that tool runs on (Claude unless told otherwise). */
export function aiNotConfigured(provider: AiProvider = 'anthropic'): boolean {
  return provider === 'anthropic' ? !isAiEnabled() : !isProviderEnabled(provider)
}

export async function classify(text: string, businessId: BusinessId, subject?: string): Promise<AiResult<local.Classification>> {
  try {
    const r = await aiClassify({ businessId, text, subject, clientNow: F.nowIso() })
    return { value: r.result, ai: { source: r.mode === 'llm' ? 'llm' : 'fallback', model: r.model, provider: r.provider } }
  } catch (e) {
    if (e instanceof SalesNetworkError) return { value: local.classify(text), ai: FALLBACK }
    throw e
  }
}

export async function draft(ct: Contact, b: BusinessId, purpose: 'intro' | 'follow' | 'stale', ctx?: { deal?: Deal }, guidance?: string): Promise<AiResult<local.Draft>> {
  try {
    const r = await aiDraft({ businessId: b, contactId: ct.id, purpose, dealId: ctx?.deal?.id, guidance })
    if (r.mode === 'llm' && r.draft) return { value: r.draft, ai: tagFrom(r) }
    return { value: local.draft(ct, b, purpose, ctx), ai: tagFrom(r) }
  } catch (e) {
    if (degradable(e)) return { value: local.draft(ct, b, purpose, ctx), ai: FALLBACK }
    throw e
  }
}

export async function suggestReply(t: Thread, guidance?: string): Promise<AiResult<local.Draft>> {
  try {
    const r = await aiReplySuggest({ threadId: t.id, guidance })
    if (r.mode === 'llm' && r.draft) return { value: r.draft, ai: tagFrom(r) }
    return { value: local.suggestReply(t), ai: tagFrom(r) }
  } catch (e) {
    if (degradable(e)) return { value: local.suggestReply(t), ai: FALLBACK }
    throw e
  }
}

export interface MeetingActionsWithSummary extends local.MeetingActionsResult {
  summary?: string
}

/** `missing` and `updates` stay deterministic; the model supplies the actions, the recap email and a summary. */
export async function meetingActions(m: Meeting): Promise<AiResult<MeetingActionsWithSummary>> {
  const base = local.meetingActions(m)
  try {
    const r = await aiMeetingRecap({ meetingId: m.id })
    if (r.mode === 'llm' && r.recap) {
      const assigneeId = m.ownerId || Q.me().id
      return {
        value: {
          ...base,
          summary: r.recap.summary,
          actions: r.recap.actions.map(a => ({ title: a.title, type: a.type, days: a.days, on: true, assigneeId })),
          email: r.recap.email,
        },
        ai: tagFrom(r),
      }
    }
    return { value: base, ai: tagFrom(r) }
  } catch (e) {
    if (degradable(e)) return { value: base, ai: FALLBACK }
    throw e
  }
}

export async function copilot(q: string, ctx?: local.CopilotContext): Promise<AiResult<local.CopilotResult>> {
  try {
    const r = await aiCopilot({ question: q, businessIds: Q.scope(), context: ctx })
    if ((r.mode === 'llm' || r.mode === 'refused') && r.answer) {
      const items: local.CopilotItem[] = r.answer.items.map(i => ({ kind: i.kind, id: i.id, line: i.label }))
      return { value: { text: r.answer.text, items, scope: r.answer.scope }, ai: tagFrom(r) }
    }
    return { value: local.copilot(q, ctx), ai: tagFrom(r) }
  } catch (e) {
    if (degradable(e)) return { value: local.copilot(q, ctx), ai: FALLBACK }
    throw e
  }
}

/**
 * Facts, score and sources stay deterministic CRM data. The model only replaces the narrative
 * fields, which are flagged as inference.
 */
export async function research(cid: string | null | undefined, b: BusinessId, input: local.ResearchInput = {}): Promise<AiResult<Research | local.ResearchError>> {
  const base = local.research(cid, b, input)
  if ('error' in base) return { value: base, ai: FALLBACK }
  try {
    const r = await aiResearch({
      businessId: b, companyId: cid || undefined,
      input: cid ? undefined : { name: input.name ?? '', website: input.website, industry: input.industry },
    })
    if (r.mode === 'llm' && r.inference) {
      const inf = r.inference
      const sources = Array.isArray(base.sources) ? base.sources.filter((s: { kind: string }) => !s.kind.startsWith('Simulated')) : []
      sources.push({ label: `${providerName(r.provider)} (${r.model ?? 'model'})`, kind: 'AI-generated inference' })
      return {
        value: {
          ...base, simulated: false, overview: inf.overview, model: inf.businessModel, challenges: inf.challenges, offerings: inf.offerings,
          stakeholders: inf.stakeholders, angle: inf.angle, inferred: [inf.disclaimer], sources,
          provider: r.provider, providerModel: r.model, webSources: inf.sources,
        },
        ai: tagFrom(r),
      }
    }
    return { value: base, ai: tagFrom(r) }
  } catch (e) {
    if (degradable(e)) return { value: base, ai: FALLBACK }
    throw e
  }
}

// ── Contact enrichment (Grok) ─────────────────────────────────────────────────────────────────────
// A real lookup costs one of the business's monthly calls and takes tens of seconds, so none of this
// degrades to a template: every failure is its own state for the UI to explain.

interface Failed {
  /** The server has no xAI key. Nothing was reserved and nothing is shown. */
  notConfigured: { status: 'notConfigured'; usage?: EnrichUsage }
  cap: { status: 'cap'; usage: EnrichUsage }
  /** 502 AI_PROVIDER_ERROR. The call was refunded. */
  providerError: { status: 'providerError'; message: string }
  /** 502 AI_BAD_OUTPUT. The model answered but the answer was unusable; the call counted. */
  badOutput: { status: 'badOutput'; message: string }
  cancelled: { status: 'cancelled' }
  /** Anything else: offline, 400/403/404, expired session. */
  error: { status: 'error'; message: string }
}
export type EnrichFailure = Failed[keyof Failed]

export interface EnrichDone {
  status: 'found' | 'none' | 'withheld'
  suggestions: EnrichSuggestion[]
  sources: ResearchSource[]
  /** How many values the server dropped because it could not verify a source. */
  withheld: number
  disclaimer: string
  usage: EnrichUsage
  model: string | null
}
export type EnrichOutcome = EnrichFailure | EnrichDone

const FAILURES: readonly string[] = ['notConfigured', 'cap', 'providerError', 'badOutput', 'cancelled', 'error']
export const isFailure = (o: { status: string }): o is EnrichFailure => FAILURES.includes(o.status)

export interface FindDone {
  status: 'found' | 'none' | 'withheld'
  people: FoundPerson[]
  sources: ResearchSource[]
  withheld: number
  disclaimer: string
  usage: EnrichUsage
  model: string | null
}
export type FindOutcome = EnrichFailure | FindDone

export type UsageOutcome = { status: 'ok'; enabled: boolean; usage: EnrichUsage } | Failed['cancelled'] | Failed['error']

export const ENRICH_LIMIT = 300

const isUsage = (v: unknown): v is EnrichUsage => {
  const u = v as Partial<EnrichUsage> | null
  return !!u && typeof u.used === 'number' && typeof u.limit === 'number' && typeof u.resetsOn === 'string'
}

function isAbort(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { name?: unknown }).name === 'AbortError'
}

/** No local fallback for any of these: a 502 or a dropped connection is reported, never papered over. */
function failure(e: unknown, b: BusinessId): EnrichFailure {
  if (isAbort(e)) return { status: 'cancelled' }
  if (e instanceof SalesHttpError) {
    if (e.code === 'AI_CAP_REACHED') {
      const usage = isUsage(e.body?.details) ? e.body.details : (getUsage(b) ?? { used: ENRICH_LIMIT, limit: ENRICH_LIMIT, resetsOn: '' })
      setUsage(b, usage)
      return { status: 'cap', usage }
    }
    if (e.code === 'AI_PROVIDER_ERROR') return { status: 'providerError', message: e.message }
    if (e.code === 'AI_BAD_OUTPUT') return { status: 'badOutput', message: e.message }
    return { status: 'error', message: e.message }
  }
  if (e instanceof SalesNetworkError) return { status: 'error', message: "Can't reach the server. Check your connection and try again." }
  return { status: 'error', message: e instanceof Error ? e.message : 'Something went wrong.' }
}

/**
 * The server accepts only a linkedin.com/in/<slug> profile address as a hint, so check it here rather than
 * spend a round trip on a 400. Accepts what people paste: no scheme, http, a query string, a trailing slash.
 */
export function checkLinkedinHint(input: string): { ok: true; value: string } | { ok: false; error: string } {
  const t = input.trim()
  if (!t) return { ok: true, value: '' }
  const m = t.match(/^(?:https?:\/\/)?(?:(?:www|[a-z]{2,3})\.)?linkedin\.com\/in\/([\w-]+)\/?(?:[?#].*)?$/i)
  if (!m) return { ok: false, error: 'Use a LinkedIn profile address like linkedin.com/in/first-last' }
  return { ok: true, value: `https://www.linkedin.com/in/${m[1]}` }
}

export interface EnrichOpts { linkedinHint?: string; signal?: AbortSignal }

/** Look up one contact. A found / none / withheld answer is also kept in the session cache for "Review & apply". */
export async function enrichContact(contactId: string, b: BusinessId, opts: EnrichOpts = {}): Promise<EnrichOutcome> {
  try {
    const hint = opts.linkedinHint?.trim()
    const r = await aiEnrichContact({ businessId: b, contactId, ...(hint ? { linkedinHint: hint } : {}) }, opts.signal)
    if (isUsage(r.usage)) setUsage(b, r.usage)
    if (r.mode === 'stub') return { status: 'notConfigured', usage: isUsage(r.usage) ? r.usage : undefined }
    if (!r.result) return { status: 'badOutput', message: 'The lookup returned no result.' }
    const out: EnrichDone = {
      status: r.result.status, suggestions: r.result.suggestions, sources: r.result.sources,
      withheld: r.result.withheld, disclaimer: r.result.disclaimer, usage: r.usage, model: r.model,
    }
    putEnrich(contactId, out)
    return out
  } catch (e) {
    return failure(e, b)
  }
}

/** Find people at a company (saved, or just a name and website) in a given role. Returns no emails or phones. */
export async function findPeople(
  target: { companyId: string } | { input: { name: string; website?: string } },
  b: BusinessId,
  opts: { role?: string; signal?: AbortSignal } = {},
): Promise<FindOutcome> {
  try {
    const role = opts.role?.trim()
    const r = await aiFindPeople({ businessId: b, ...target, ...(role ? { role } : {}) }, opts.signal)
    if (isUsage(r.usage)) setUsage(b, r.usage)
    if (r.mode === 'stub') return { status: 'notConfigured', usage: isUsage(r.usage) ? r.usage : undefined }
    if (!r.result) return { status: 'badOutput', message: 'The search returned no result.' }
    const { people, sources, withheld, disclaimer } = r.result
    return { status: people.length ? 'found' : withheld > 0 ? 'withheld' : 'none', people, sources, withheld, disclaimer, usage: r.usage, model: r.model }
  } catch (e) {
    return failure(e, b)
  }
}

// ── Web intelligence (signals, tech stack, company contact, lead lists, meeting prep, opening lines) ─────────
// Same rules as enrichment: a search-backed call spends one monthly lookup, nothing degrades to a made-up answer.

export type IntelItem = CompanySignal | TechItem | CompanyContactItem

export interface WebDone<T> {
  status: 'found' | 'none' | 'withheld'
  items: T[]
  sources: ResearchSource[]
  withheld: number
  disclaimer: string
  usage: EnrichUsage
  provider: AiProvider
  model: string | null
}
export type WebOutcome<T> = EnrichFailure | WebDone<T>

interface Wire { mode: string; usage: EnrichUsage; provider: AiProvider; model: string | null; result?: { sources: ResearchSource[]; withheld: number; disclaimer: string } }

function webDone<T>(r: Wire, items: T[], b: BusinessId): WebOutcome<T> {
  if (isUsage(r.usage)) setUsage(b, r.usage)
  if (r.mode === 'stub') return { status: 'notConfigured', usage: isUsage(r.usage) ? r.usage : undefined }
  if (!r.result) return { status: 'badOutput', message: 'The search returned no result.' }
  const { sources, withheld, disclaimer } = r.result
  return { status: items.length ? 'found' : withheld > 0 ? 'withheld' : 'none', items, sources, withheld, disclaimer, usage: r.usage, provider: r.provider, model: r.model }
}

const arr = <T>(v: T[] | undefined): T[] => (Array.isArray(v) ? v : [])

/** Run one of the three per-company lookups. Saving the answer is the caller's job (Act.saveIntel). */
export async function runIntel(kind: IntelKind, subject: IntelSubject, opts: { signal?: AbortSignal } = {}): Promise<WebOutcome<IntelItem>> {
  const b = subject.businessId
  try {
    if (kind === 'signals') {
      const r = await aiSignals(subject, opts.signal)
      return webDone(r, arr(r.result?.signals), b)
    }
    if (kind === 'tech') {
      const r = await aiTechStack(subject, opts.signal)
      return webDone(r, arr(r.result?.tools), b)
    }
    const r = await aiCompanyContact(subject, opts.signal)
    return webDone(r, arr(r.result?.items), b)
  } catch (e) {
    return failure(e, b)
  }
}

export type LeadListOutcome = WebOutcome<LeadCandidate>

export async function findLeads(b: BusinessId, query: string, opts: { state?: string; signal?: AbortSignal } = {}): Promise<LeadListOutcome> {
  try {
    const r = await aiLeadList({ businessId: b, query: query.trim(), ...(opts.state ? { state: opts.state } : {}) }, opts.signal)
    return webDone(r, arr(r.result?.leads), b)
  } catch (e) {
    return failure(e, b)
  }
}

export interface PrepDone { status: 'ready'; prep: MeetingPrep; sources: ResearchSource[]; withheld: number; disclaimer: string; usage: EnrichUsage; provider: AiProvider; model: string | null }
export type PrepOutcome = EnrichFailure | PrepDone

const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : [])

export async function prepareMeeting(req: MeetingPrepRequest, opts: { signal?: AbortSignal } = {}): Promise<PrepOutcome> {
  try {
    const r = await aiMeetingPrep(req, opts.signal)
    if (isUsage(r.usage)) setUsage(req.businessId, r.usage)
    if (r.mode === 'stub') return { status: 'notConfigured', usage: isUsage(r.usage) ? r.usage : undefined }
    if (!r.result?.prep) return { status: 'badOutput', message: 'The brief came back empty.' }
    const p = r.result.prep
    const prep: MeetingPrep = {
      summary: typeof p.summary === 'string' ? p.summary : '', talkingPoints: strs(p.talkingPoints), questions: strs(p.questions), watchOuts: strs(p.watchOuts),
      news: Array.isArray(p.news) ? p.news.filter(n => n && typeof n.headline === 'string' && typeof n.sourceUrl === 'string') : [],
    }
    return { status: 'ready', prep, sources: arr(r.result.sources), withheld: r.result.withheld ?? 0, disclaimer: r.result.disclaimer ?? '', usage: r.usage, provider: r.provider, model: r.model }
  } catch (e) {
    return failure(e, req.businessId)
  }
}

export type OpenerOutcome = EnrichFailure | { status: 'ok'; openers: Opener[]; model: string | null } | { status: 'noSignals' }

/** Opening lines written from signals already saved for the company. Uncapped: it costs no lookup. */
export async function openingLines(req: OpenerRequest, opts: { signal?: AbortSignal } = {}): Promise<OpenerOutcome> {
  try {
    const r = await aiOpener(req, opts.signal)
    if (r.mode === 'stub') return { status: 'notConfigured' }
    if (r.noSignals) return { status: 'noSignals' }
    const openers = arr(r.openers).filter(o => o && typeof o.text === 'string' && o.text.trim() !== '').slice(0, 3)
    if (!openers.length) return { status: 'badOutput', message: 'No opening lines came back.' }
    return { status: 'ok', openers, model: r.model }
  } catch (e) {
    return failure(e, req.businessId)
  }
}

/** Calls used this month for a business. Does not itself cost a call. */
export async function enrichUsage(b: BusinessId, signal?: AbortSignal): Promise<UsageOutcome> {
  try {
    const r = await aiEnrichUsage(b, signal)
    if (isUsage(r.usage)) setUsage(b, r.usage)
    return { status: 'ok', enabled: r.enabled, usage: r.usage }
  } catch (e) {
    const f = failure(e, b)
    return f.status === 'cancelled' ? f : { status: 'error', message: 'message' in f ? f.message : 'Could not load usage.' }
  }
}

// ── Enrichment hardening: activity log and email check ───────────────────────────────────────────
// Neither costs a lookup, and neither may block the user: a failure is reported to the caller, who treats it as "unknown".

export type EnrichLogOutcomeResult = { status: 'ok'; entries: EnrichLogEntry[] } | Failed['cancelled'] | Failed['error']

/** Newest first. With a contactId: that contact's calls (any member who can edit). Without: the business's calls (admins only). */
export async function fetchEnrichLog(b: BusinessId, opts: { contactId?: string; limit?: number; signal?: AbortSignal } = {}): Promise<EnrichLogOutcomeResult> {
  try {
    const r = await aiEnrichLog(b, { contactId: opts.contactId, limit: opts.limit }, opts.signal)
    if (!r || !Array.isArray(r.entries)) return { status: 'error', message: 'The activity log came back in an unexpected form.' }
    return { status: 'ok', entries: r.entries }
  } catch (e) {
    const f = failure(e, b)
    return f.status === 'cancelled' ? f : { status: 'error', message: 'message' in f ? f.message : 'Could not load the activity log.' }
  }
}

/** The newest call that returned a usable answer, or undefined. Does not trust the order the server sent. */
export function lastSuccessfulEnrich(entries: EnrichLogEntry[]): EnrichLogEntry | undefined {
  let best: EnrichLogEntry | undefined
  let bestT = -Infinity
  for (const e of entries) {
    if (e.outcome !== 'ok') continue
    const t = Date.parse(e.at)
    if (Number.isNaN(t) || t <= bestT) continue
    best = e
    bestT = t
  }
  return best
}

/** Whole days since an ISO time (0 = today, under 24 h). Unparseable or future times are 0. */
export function daysSince(iso: string, now: number = Date.now()): number {
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return 0
  return Math.max(0, Math.floor((now - t) / 86_400_000))
}

/** A contact enriched within this many days gets a deliberate "Enrich again" step. */
export const RE_ENRICH_DAYS = 30

export interface EmailCheck { status: EmailCheckStatus; domain: string }

const domainOf = (email: string): string => email.trim().split('@').pop()?.toLowerCase() ?? ''

/** Whether the email's domain can receive mail. Any failure (offline, 4xx/5xx, odd answer) is 'unknown': it never blocks. */
export async function checkEmail(b: BusinessId, email: string, signal?: AbortSignal): Promise<EmailCheck> {
  try {
    const r = await aiCheckEmail({ businessId: b, email: email.trim() }, signal)
    const status: EmailCheckStatus = r.status === 'ok' || r.status === 'no_mx' ? r.status : 'unknown'
    return { status, domain: typeof r.domain === 'string' && r.domain ? r.domain : domainOf(email) }
  } catch {
    return { status: 'unknown', domain: domainOf(email) }
  }
}

export { local as localAi }
