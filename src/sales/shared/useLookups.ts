import { useEffect } from 'react'
import { aiNotConfigured, enrichUsage } from '../ai/client'
import { remaining, useEnrichUsage } from '../ai/enrichCache'
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
  const left = remaining(usage)
  return { usage, left, notConfigured, capped: left === 0, label: usage && left !== null ? `${left} of ${usage.limit} lookups left` : null }
}
