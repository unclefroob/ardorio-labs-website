// What happens after a reply has stopped a sequence, by the kind of reply. The server applies these (engine/replyRules.ts in the API); this is
// the web's copy for the settings screen, and its test checks it against the API's when ARDORIO_API_DIR is set. Unsubscribes and bounces are
// not rules: they always suppress.

export type ReplyKind = 'interested' | 'info' | 'later' | 'wrong' | 'no' | 'other' | 'ooo'
export type Then = 'task' | 'restart' | 'nothing' | 'continue' | 'end'
export interface ReplyRule { then: Then; taskTitle?: string; taskDays?: number; restartDays?: number; leadStatus?: string }

export const DEFAULT_RULES: Record<ReplyKind, ReplyRule> = {
  interested: { then: 'task', taskTitle: 'Reply to {name} and book a time', taskDays: 0, leadStatus: 'Engaged' },
  info: { then: 'task', taskTitle: 'Send {name} the information they asked for', taskDays: 1 },
  later: { then: 'restart', restartDays: 60 },
  wrong: { then: 'task', taskTitle: 'Find the right contact at {company}', taskDays: 1 },
  no: { then: 'nothing', leadStatus: 'Unqualified' },
  other: { then: 'task', taskTitle: 'Read the reply from {name}', taskDays: 1 },
  ooo: { then: 'continue' },
}

/** The rows of the "When they reply" table, in the order shown. */
export const KINDS: ReadonlyArray<{ kind: ReplyKind; label: string; example: string; does: string }> = [
  { kind: 'interested', label: 'Interested', example: '“Sounds good, can you send times?”', does: 'Stops the sequence and tells you' },
  { kind: 'info', label: 'Wants more information', example: '“Do you have a case study?”', does: 'Stops the sequence and tells you' },
  { kind: 'later', label: 'Not right now', example: '“Revisit after Christmas”', does: 'Stops the sequence and tells you' },
  { kind: 'wrong', label: 'Wrong person', example: '“Talk to our ops manager”', does: 'Stops the sequence and tells you' },
  { kind: 'no', label: 'Not interested', example: '“We are happy with what we have”', does: 'Stops the sequence and tells you' },
  { kind: 'other', label: 'Anything else', example: 'The words do not fit a rule', does: 'Stops the sequence and tells you' },
  { kind: 'ooo', label: 'Out of office', example: '“Back on 20 October”', does: 'Pauses until the date they give, or a week' },
]

export const LEAD_FOR_RULES = ['Contacted', 'Engaged', 'Qualified', 'Unqualified'] as const

/** The rule in force for display: this sequence's own, else the business's, else SalesOS's. */
export function ruleFor(kind: ReplyKind, seqRules?: Partial<Record<ReplyKind, Partial<ReplyRule>>>, bizRules?: Partial<Record<ReplyKind, Partial<ReplyRule>>>): ReplyRule {
  return { ...DEFAULT_RULES[kind], ...(bizRules?.[kind] ?? {}), ...(seqRules?.[kind] ?? {}) }
}

export function dueWords(days: number | undefined): string {
  return !days ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`
}
