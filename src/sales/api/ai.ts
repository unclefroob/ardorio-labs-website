import { salesFetch } from './http'
import type {
  ClassifyRequest, ClassifyResponse, CopilotRequest, CopilotResponse, DraftRequest, DraftResponse, MeetingRecapRequest,
  MeetingRecapResponse, ReplySuggestRequest, ReplySuggestResponse, ResearchRequest, ResearchResponse,
} from './contract'

/** R12-R17. Requests carry ids; the server builds the allow-listed prompt payload itself. */
export const aiClassify = (req: ClassifyRequest) => salesFetch<ClassifyResponse>('/ai/classify', { method: 'POST', body: req })
export const aiDraft = (req: DraftRequest) => salesFetch<DraftResponse>('/ai/draft', { method: 'POST', body: req })
export const aiReplySuggest = (req: ReplySuggestRequest) => salesFetch<ReplySuggestResponse>('/ai/reply-suggest', { method: 'POST', body: req })
export const aiMeetingRecap = (req: MeetingRecapRequest) => salesFetch<MeetingRecapResponse>('/ai/meeting-recap', { method: 'POST', body: req })
export const aiCopilot = (req: CopilotRequest) => salesFetch<CopilotResponse>('/ai/copilot', { method: 'POST', body: req })
export const aiResearch = (req: ResearchRequest) => salesFetch<ResearchResponse>('/ai/research', { method: 'POST', body: req })
