import { F } from '../data/F'

export const INDUSTRIES = ['Retail', 'Furniture Retail', 'Supermarkets', 'Hospitality', 'Distribution', 'Logistics', 'Enterprise Services', 'Construction', 'Manufacturing', 'Professional Services', 'Multi-site Services', 'Healthcare', 'Education', 'Higher Education', 'Career Services', 'Other'] as const
export const STATES = ['VIC', 'NSW', 'QLD', 'SA', 'WA', 'TAS', 'ACT', 'NT'] as const
export const PERM = ['Legitimate business interest', 'Existing relationship', 'Consent', 'Referral introduction'] as const
export const OUTCOMES = ['Connected', 'No Answer', 'Voicemail Left', 'Wrong Number', 'Meeting Booked', 'Interested', 'Not Interested', 'Follow-up Required'] as const

export const norm = (s: string | null | undefined): string =>
  (s || '').toLowerCase().replace(/&/g, 'and').replace(/\b(pty|ltd|limited|group|co|company|the|inc)\b/g, '').replace(/[^a-z0-9]/g, '')

export const domOf = (w: string | null | undefined): string =>
  (w || '').toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0] ?? ''

export type PeriodKey = 'week' | 'month' | 'quarter' | 'd90'
export const PER: Record<PeriodKey, readonly [label: string, start: () => string]> = {
  week: ['This week', () => F.weekStart()],
  month: ['This month', () => F.today().slice(0, 8) + '01T00:00'],
  quarter: ['This quarter', () => {
    const d = F.now()
    return d.getFullYear() + '-' + String(Math.floor(d.getMonth() / 3) * 3 + 1).padStart(2, '0') + '-01T00:00'
  }],
  d90: ['Last 90 days', () => F.addDays(F.nowIso(), -90)],
}

export const STEP: Record<string, readonly [icon: string, label: string]> = {
  email: ['mail', 'Automated email'],
  call: ['phone', 'Call task'],
  linkedin: ['li', 'LinkedIn task'],
  task: ['checksq', 'General task'],
  wait: ['hourglass', 'Wait / delay'],
  branch: ['branch', 'Conditional branch'],
}

export const SECTIONS = [['summary', 'Meeting summary'], ['situation', 'Current situation'], ['problems', 'Problems identified'], ['requirements', 'Requirements'], ['budget', 'Budget / commercial discussion'], ['decision', 'Decision-makers'], ['timeline', 'Timeline'], ['objections', 'Objections']] as const
