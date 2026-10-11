import type { Company } from '../data/types'
import { domOf, norm } from './constants'

const NOISE = new Set(['pty', 'ltd', 'limited', 'group', 'co', 'company', 'the', 'inc', 'and', 'of', 'au', 'australia', 'australian'])

const tokens = (s: string): string[] =>
  s.toLowerCase().replace(/&/g, ' and ').split(/[^a-z0-9]+/).filter(t => t && !NOISE.has(t))

const stripTld = (d: string): string => d.replace(/\.(com|com\.au|net\.au|org\.au|au)$/, '')

function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    prev = cur
  }
  return prev[b.length]
}

/** Lower is closer; null is no match. Never called for an exact normalised match, which the caller handles. */
function score(name: string, website: string, c: Company): number | null {
  const d = domOf(website)
  if (d && c.domain && stripTld(d) === stripTld(c.domain)) return 0
  const a = tokens(name)
  const b = tokens(c.name)
  if (!a.length || !b.length) return null
  const [small, big] = a.length <= b.length ? [a, b] : [b, a]
  // "Spuntino Group" is a prefix-or-subset of "Spuntino Food Group"; a lone 1-4 letter token is too weak to trust.
  if (small.every(t => big.includes(t)) && small.join('').length >= 5) return 1 + (big.length - small.length) / 10
  const x = norm(name)
  const y = norm(c.name)
  const max = Math.min(x.length, y.length) >= 10 ? 2 : Math.min(x.length, y.length) >= 6 ? 1 : 0
  if (max && editDistance(x, y, max) <= max) return 3
  return null
}

/** CRM companies that probably are the one typed, best first. Suggestions only: nothing here may be applied without a click. */
export function similarCompanies(name: string, website: string, companies: readonly Company[], limit = 3): Company[] {
  const n = norm(name)
  return companies
    .filter(c => !c.archived && norm(c.name) !== n)
    .flatMap(c => {
      const s = score(name, website, c)
      return s === null ? [] : [{ c, s }]
    })
    .sort((p, q) => p.s - q.s || p.c.name.localeCompare(q.c.name))
    .slice(0, limit)
    .map(x => x.c)
}
