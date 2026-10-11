import { salesFetch } from './http'
import type {
  BusinessId, CheckEmailRequest, CheckEmailResponse, ClassifyRequest, ClassifyResponse, CompanyContactResponse, CopilotRequest, CopilotResponse, DraftRequest, DraftResponse,
  EnrichContactRequest, EnrichContactResponse, EnrichLogResponse, EnrichUsageResponse, FindPeopleRequest, FindPeopleResponse, IntelSubject, LeadListRequest, LeadListResponse,
  MeetingPrepRequest, MeetingPrepResponse, MeetingRecapRequest, MeetingRecapResponse, OpenerRequest, OpenerResponse, ReplySuggestRequest, ReplySuggestResponse,
  ResearchRequest, ResearchResponse, SignalsResponse, TechStackResponse,
} from './contract'

/** R12-R17. Requests carry ids; the server builds the allow-listed prompt payload itself. */
export const aiClassify = (req: ClassifyRequest) => salesFetch<ClassifyResponse>('/ai/classify', { method: 'POST', body: req })
export const aiDraft = (req: DraftRequest) => salesFetch<DraftResponse>('/ai/draft', { method: 'POST', body: req })
export const aiReplySuggest = (req: ReplySuggestRequest) => salesFetch<ReplySuggestResponse>('/ai/reply-suggest', { method: 'POST', body: req })
export const aiMeetingRecap = (req: MeetingRecapRequest) => salesFetch<MeetingRecapResponse>('/ai/meeting-recap', { method: 'POST', body: req })
export const aiCopilot = (req: CopilotRequest) => salesFetch<CopilotResponse>('/ai/copilot', { method: 'POST', body: req })
export const aiResearch = (req: ResearchRequest) => salesFetch<ResearchResponse>('/ai/research', { method: 'POST', body: req })

/** Contact enrichment. These run a live web search and can take 30-60 s, so each takes an AbortSignal. */
export const aiEnrichContact = (req: EnrichContactRequest, signal?: AbortSignal) =>
  salesFetch<EnrichContactResponse>('/ai/enrich-contact', { method: 'POST', body: req, signal })
export const aiFindPeople = (req: FindPeopleRequest, signal?: AbortSignal) =>
  salesFetch<FindPeopleResponse>('/ai/find-people', { method: 'POST', body: req, signal })
export const aiEnrichUsage = (businessId: BusinessId, signal?: AbortSignal) =>
  salesFetch<EnrichUsageResponse>(`/ai/enrich/usage?businessId=${encodeURIComponent(businessId)}`, { signal })
export const aiEnrichLog = (businessId: BusinessId, opts: { contactId?: string; limit?: number } = {}, signal?: AbortSignal) => {
  const q = new URLSearchParams({ businessId })
  if (opts.contactId) q.set('contactId', opts.contactId)
  if (opts.limit !== undefined) q.set('limit', String(opts.limit))
  return salesFetch<EnrichLogResponse>(`/ai/enrich/log?${q.toString()}`, { signal })
}
export const aiCheckEmail = (req: CheckEmailRequest, signal?: AbortSignal) =>
  salesFetch<CheckEmailResponse>('/ai/enrich/check-email', { method: 'POST', body: req, signal })

/** Web intelligence. Every call but the opener runs a live web search (30-60 s) and spends one monthly lookup. */
export const aiSignals = (req: IntelSubject, signal?: AbortSignal) =>
  salesFetch<SignalsResponse>('/ai/signals', { method: 'POST', body: req, signal })
export const aiTechStack = (req: IntelSubject, signal?: AbortSignal) =>
  salesFetch<TechStackResponse>('/ai/tech-stack', { method: 'POST', body: req, signal })
export const aiCompanyContact = (req: IntelSubject, signal?: AbortSignal) =>
  salesFetch<CompanyContactResponse>('/ai/company-contact', { method: 'POST', body: req, signal })
export const aiLeadList = (req: LeadListRequest, signal?: AbortSignal) =>
  salesFetch<LeadListResponse>('/ai/lead-list', { method: 'POST', body: req, signal })
export const aiMeetingPrep = (req: MeetingPrepRequest, signal?: AbortSignal) =>
  salesFetch<MeetingPrepResponse>('/ai/meeting-prep', { method: 'POST', body: req, signal })
export const aiOpener = (req: OpenerRequest, signal?: AbortSignal) =>
  salesFetch<OpenerResponse>('/ai/opener', { method: 'POST', body: req, signal })
