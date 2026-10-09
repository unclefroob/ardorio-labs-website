import { aiClassify, aiCopilot, aiDraft, aiMeetingRecap, aiReplySuggest, aiResearch } from '../api/ai'
import type { AiMeta, AiProvider } from '../api/contract'
import { SalesHttpError, SalesNetworkError } from '../api/http'
import { F } from '../data/F'
import { isAiEnabled, isProviderEnabled } from '../data/session'
import { Q } from '../data/Q'
import type { BusinessId, Contact, Deal, Meeting, Research, Thread } from '../data/types'
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

export { local as localAi }
