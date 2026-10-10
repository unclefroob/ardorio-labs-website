import { useEffect } from 'react'
import { aiNotConfigured, enrichUsage } from '../ai/client'
import { fmtReset, remaining, useCompetitorRule, useEnrichUsage } from '../ai/enrichCache'
import type { BusinessId, EnrichUsage } from '../api/contract'

export interface Lookups {
  usage: EnrichUsage | undefined
  left: number | null
  /** The server has no xAI key: nothing can be looked up. */
  notConfigured: boolean
  /** Known to be at the monthly limit. */
  capped: boolean
  /** "N of 300 lookups left", or null until the allowance is known. */
  label: string | null
  /** "Research paused until 1 Nov 2026" once the limit is reached; null otherwise. Saved intel, scores and opening lines keep working. */
  pausedLabel: string | null
  /** The business has a competitor list, so a competitor's tool adds to the score. Unknown until usage loads. */
  competitorRule: boolean | undefined
}

/** The business's monthly web-lookup allowance. Reading it is free; it never starts a lookup. */
export function useLookups(b: BusinessId | undefined): Lookups {
  const usage = useEnrichUsage(b)
  const notConfigured = aiNotConfigured('xai')
  useEffect(() => {
    if (!b || notConfigured) return
    const ac = new AbortController()
    void enrichUsage(b, ac.signal)
    return () => ac.abort()
  }, [b, notConfigured])
  const competitorRule = useCompetitorRule(b)
  const left = remaining(usage)
  const capped = left === 0
  return {
    usage, left, notConfigured, capped, competitorRule,
    label: usage && left !== null ? `${left} of ${usage.limit} lookups left` : null,
    pausedLabel: capped && usage ? `Research paused until ${usage.resetsOn ? fmtReset(usage.resetsOn) : 'next month'}` : null,
  }
}
