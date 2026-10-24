import type { InvoiceDto, XeroSettings, XeroStatus, XeroTaxType } from '../api/contract'

// What the Xero connection means on each page, as plain words. The server decides what is sent; this only says it.

/** Where Xero sends the browser back to, read once: ?xero=connected|error&reason=… */
export interface XeroReturn { ok: boolean; reason?: string; error?: string; detail?: string; scopes?: string }
export function readXeroReturn(search: string): XeroReturn | null {
  const q = new URLSearchParams(search)
  const x = q.get('xero')
  if (x !== 'connected' && x !== 'error') return null
  return { ok: x === 'connected', reason: q.get('reason') ?? undefined, error: q.get('xeroError') ?? undefined, detail: q.get('xeroDetail') ?? undefined, scopes: q.get('xeroScopes') ?? undefined }
}

const REASONS: Record<string, string> = {
  denied: 'Xero sign-in cancelled.',
  'bad-state': 'Sign-in expired. Connect again.',
  'not-allowed': 'Only Ardorio admins can connect Xero.',
  'exchange-failed': 'Xero sign-in failed. Try again.',
  'no-organisation': 'No Xero organisation was shared. Connect again and select one.',
  'choose-one': 'Select only one Xero organisation, then connect again.',
  'not-configured': 'Xero isn\'t set up on the server.',
}
export function xeroReturnMessage(r: XeroReturn): string {
  if (r.ok) return 'Xero connected. Choose a sales account to start sending.'
  // Xero's own refusal (invalid_scope, unauthorized_client…) says more than "cancelled"; a plain access_denied is the user choosing Deny.
  const sent = r.scopes ? ` Scopes sent: ${r.scopes}.` : ''
  if (r.reason === 'denied' && r.error && (r.error !== 'access_denied' || r.detail)) return `Xero refused the connection: ${r.error}${r.detail ? `. ${r.detail}` : ''}.${sent}`
  return REASONS[r.reason ?? ''] ?? 'Xero couldn\'t be connected. Try again.'
}

/** A bank account with no code in Xero is chosen by its id; show its name alone. */
export const isXeroId = (v: string): boolean => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)

export const TAX_LABEL: Record<XeroTaxType, string> = {
  OUTPUT: 'GST on Income (10%)',
  EXEMPTOUTPUT: 'GST Free Income',
  EXEMPTEXPORT: 'GST Free Exports',
  NONE: 'BAS Excluded',
}
export const TAX_OPTIONS: ReadonlyArray<readonly [XeroTaxType, string]> = (Object.keys(TAX_LABEL) as XeroTaxType[]).map(k => [k, TAX_LABEL[k]] as const)

/** The one thing a person should do next about the connection, or null when nothing is needed. */
export function nextStep(s: XeroStatus): string | null {
  if (!s.configured) return null
  if (!s.connected || !s.settings) return null
  if (s.problem) return 'Xero access ended. Reconnect to keep sending.'
  if (!s.settings.salesAccountCode) return 'Choose a sales account. Nothing is sent until you do.'
  if (!s.settings.paymentAccountCode) return 'Choose a bank account. Payments aren\'t recorded until you do.'
  return null
}

export type XeroChipView = { tone: '' | 'ok' | 'warn' | 'bad'; label: string; title: string }
/** The header chip on the Invoices page. */
export function chipFor(s: XeroStatus | null): XeroChipView {
  if (!s) return { tone: '', label: 'Xero', title: 'Checking Xero' }
  if (!s.configured) return { tone: '', label: 'Xero: not set up', title: s.reason ?? 'Xero isn\'t set up on the server' }
  if (!s.connected) return { tone: '', label: 'Xero: not connected', title: 'Connect in Settings > Invoicing' }
  if (s.problem) return { tone: 'bad', label: 'Xero: reconnect', title: s.problem }
  if (s.counts.failed > 0) return { tone: 'bad', label: `Xero: ${s.counts.failed} to fix`, title: 'Some invoices failed to send. Open them for details.' }
  if (nextStep(s)) return { tone: 'warn', label: 'Xero: finish setup', title: nextStep(s) ?? '' }
  if (s.settings && !s.settings.autoSync) return { tone: 'warn', label: 'Xero: manual', title: 'Automatic sending is off' }
  return { tone: 'ok', label: 'Xero: connected', title: `Sending to ${s.tenantName}${s.counts.waiting ? `. ${s.counts.waiting} waiting.` : '.'}` }
}

export interface InvoiceXeroView {
  /** Nothing to show for a draft, a test invoice or an external record. */
  show: boolean
  tone: '' | 'ok' | 'warn' | 'bad'
  label: string
  detail: string
  /** The button, when one applies. */
  action: 'send' | 'retry' | null
  url: string | null
}

/** How one invoice reads against Xero. `status` is the connection, or null while it loads or when it cannot be read (then no promise is made). */
export function invoiceXero(inv: InvoiceDto, status: XeroStatus | null): InvoiceXeroView {
  const none: InvoiceXeroView = { show: false, tone: '', label: '', detail: '', action: null, url: null }
  const x = inv.xero
  if (!x) return none
  if (x.state === 'error') return { show: true, tone: 'bad', label: 'Not in Xero', detail: x.message || 'Xero rejected this invoice.', action: 'retry', url: x.url }
  if (x.state === 'synced') return { show: true, tone: 'ok', label: inv.status === 'paid' ? 'In Xero, payment recorded' : inv.status === 'void' ? 'Cancelled in Xero' : 'In Xero', detail: x.syncedAt ? `Updated ${x.syncedAt.slice(0, 10)}` : '', action: null, url: x.url }
  if (x.state === 'pending') return { show: true, tone: 'warn', label: 'Waiting to update Xero', detail: 'Changed since last sent. Updates shortly.', action: 'send', url: x.url }
  // Never sent: say why, from the connection.
  if (!status || !status.configured) return none
  if (!status.connected || !status.settings) return { show: true, tone: '', label: 'Not in Xero', detail: 'Xero is not connected.', action: null, url: null }
  if (inv.status === 'void') return none
  const early = (inv.sentAt ?? inv.issueDate).slice(0, 10) < status.settings.syncFrom
  if (early) return { show: true, tone: '', label: 'Not in Xero', detail: `Issued before the start date (${status.settings.syncFrom}). Not sent automatically.`, action: 'send', url: null }
  if (!status.settings.salesAccountCode) return { show: true, tone: 'warn', label: 'Not in Xero yet', detail: 'Set a sales account in Settings > Invoicing.', action: null, url: null }
  if (!status.settings.autoSync) return { show: true, tone: '', label: 'Not in Xero', detail: 'Automatic sending is off.', action: 'send', url: null }
  return { show: true, tone: 'warn', label: 'Sending to Xero', detail: 'Sending shortly.', action: 'send', url: null }
}

/** The settings the form edits, as the patch to send: only what changed. */
export function settingsPatch(before: XeroSettings, after: XeroSettings): Partial<XeroSettings> {
  const out: Partial<XeroSettings> = {}
  for (const k of Object.keys(after) as Array<keyof XeroSettings>) if (after[k] !== before[k]) (out as Record<string, unknown>)[k] = after[k]
  return out
}
