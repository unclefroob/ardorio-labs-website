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
export interface SendMailBody {
  mailboxId: string; to: string; cc?: string; bcc?: string; subject: string; body: string; threadId?: string; businessId?: string; contactId?: string; dealId?: string | null
  /** Files, base64. Up to 10, 18 MB in all. */
  attachments?: Array<{ name: string; mime: string; data: string }>
  /** Add the mailbox's signature (the server's default is yes). */
  signature?: boolean
  /** Quote the message being replied to under the reply, as Gmail does. */
  quote?: boolean
}
export const sendMailApi = (body: SendMailBody) => salesFetch<{ threadId: string; messageId: string; gmailId: string; recorded: boolean }>('/mail/send', { method: 'POST', body })

/** The original HTML of a synced message (null when there is none or it cannot be had), and the pictures it carries inside itself by Content-ID. Untrusted: sanitise it before showing it. */
export const messageHtmlApi = (id: string, signal?: AbortSignal) => salesFetch<{ html: string | null; images?: Record<string, string> }>(`/mail/messages/${encodeURIComponent(id)}/html`, { signal })

/** Send a sequence's waiting email task through Gmail. The server checks it is still the step to send, sends, and completes the task. */
export const sendTaskApi = (taskId: string) => salesFetch<{ threadId: string; messageId: string; gmailId: string; recorded: boolean }>(`/mail/send-task/${encodeURIComponent(taskId)}`, { method: 'POST' })

/** Save the signature for a mailbox (HTML; empty removes it), or fetch the one set in Gmail. The server makes it safe and answers with what it kept. */
export const setSignatureApi = (id: string, html: string) => salesFetch<{ signature: string }>(`/mailboxes/${encodeURIComponent(id)}/signature`, { method: 'POST', body: { html } })
export const importSignatureApi = (id: string) => salesFetch<{ signature: string }>(`/mailboxes/${encodeURIComponent(id)}/signature/import`, { method: 'POST' })

/** Change which businesses a mailbox serves. Owner for a personal mailbox; an admin of both businesses for a shared inbox. */
export const setMailboxBusinessesApi = (id: string, businessIds: string[]) =>
  salesFetch<{ businessIds: string[] }>(`/mailboxes/${encodeURIComponent(id)}/businesses`, { method: 'POST', body: { businessIds } })

/** Someone who wrote to a mailbox but is not a contact yet, so their mail was not filed. */
export interface UnmatchedSender { address: string; name: string; subject: string; at: string; count: number }
export const unmatchedApi = (id: string) => salesFetch<{ senders: UnmatchedSender[] }>(`/mailboxes/${encodeURIComponent(id)}/unmatched`)
export const dismissUnmatchedApi = (id: string, address: string) => salesFetch<{ ok: true }>(`/mailboxes/${encodeURIComponent(id)}/unmatched/dismiss`, { method: 'POST', body: { address } })
/** File the last 90 days of mail with an address that has just become a contact. */
export const backfillApi = (id: string, address: string) => salesFetch<{ stored: number; unmatched: number }>(`/mailboxes/${encodeURIComponent(id)}/backfill`, { method: 'POST', body: { address } })
