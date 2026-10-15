import { salesFetch } from './http'

/** Real Gmail connections. Whether the server can do them at all; never carries a key or a token. */
export interface MailStatus { configured: boolean; reason?: string }
export const mailStatusApi = (signal?: AbortSignal) => salesFetch<MailStatus>('/mailboxes/google/status', { signal })

/** The Google consent address for one mailbox. The browser is sent there, and Google sends it back to /sales/integrations. */
export const connectMailboxApi = (id: string) => salesFetch<{ url: string }>(`/mailboxes/${encodeURIComponent(id)}/connect`, { method: 'POST' })
export const disconnectMailboxApi = (id: string) => salesFetch<{ ok: true }>(`/mailboxes/${encodeURIComponent(id)}/disconnect`, { method: 'POST' })
export const syncMailboxApi = (id: string) => salesFetch<{ ran: boolean; reason: string | null; stored: number; fetched: number }>(`/mailboxes/${encodeURIComponent(id)}/sync`, { method: 'POST' })

/** Add a mailbox record. The server decides the owner (the caller, for a personal mailbox); the request never names one. */
export interface NewMailboxBody { address: string; type: 'personal' | 'shared'; businessIds: string[]; name?: string }
export const createMailboxApi = (body: NewMailboxBody) => salesFetch<{ id: string }>('/mailboxes', { method: 'POST', body })

/** Switch sending on or off for a mailbox. Turning it on may answer with a Google consent address instead (one more permission is needed). */
export const setSendingApi = (id: string, enabled: boolean) =>
  salesFetch<{ enabled: boolean; url?: string }>(`/mailboxes/${encodeURIComponent(id)}/sending`, { method: 'POST', body: { enabled } })

/** Send one email through a connected mailbox. Nothing is sent unless this resolves; a failure says so. */
export interface SendMailBody { mailboxId: string; to: string; cc?: string; subject: string; body: string; threadId?: string; businessId?: string; contactId?: string; dealId?: string | null }
export const sendMailApi = (body: SendMailBody) => salesFetch<{ threadId: string; messageId: string; gmailId: string; recorded: boolean }>('/mail/send', { method: 'POST', body })

/** The original HTML of a synced message (null when there is none or it cannot be had). Untrusted: sanitise it before showing it. */
export const messageHtmlApi = (id: string, signal?: AbortSignal) => salesFetch<{ html: string | null }>(`/mail/messages/${encodeURIComponent(id)}/html`, { signal })
