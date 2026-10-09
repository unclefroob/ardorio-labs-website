# SalesOS Phase 2 (server sequence engine) contract (authoritative)

**Date:** 2026-10-09 · **Owner:** architect · **Slug:** sales-engine
**Status:** single source of truth for the delta on top of `sales-os-2026-10-09.contract.md` between `/home/ryan/dev/ardorio-labs-api-sales-os` (API) and `/home/ryan/dev/ardorio-labs-website-sales-os` (web). Where `sales-engine-2026-10-09.backend.md` or `.web.md` disagree with this file, this file wins and the plan is a bug. Anything not mentioned here is unchanged from the Phase 1 contract.
**Binding inputs:** Feature Brief `sales-engine-2026-10-09.md` (rulings: real email out of scope, browser engine deleted, sends simulated, email step becomes a "send this email" task, D9 clock, D10 superseded).

Nothing here has been built or run. Line numbers in the brief were not trusted; every code claim was re-read in the worktrees. Items not checked are marked **unverified**.

---

## 1. Summary of the change

1. The sequence engine moves from the browser (`src/sales/engine/engine.ts`, leased via `engine/lease.ts`) to an in-process API scheduler (`src/services/sales/engine/*`), started from `src/index.ts`.
2. The server writes only through in-process `applyBatch` as a system actor. There is no new write protocol.
3. An email step no longer "sends". It creates a **task of kind `email`** holding the rendered draft. A human copies it, sends it elsewhere, and clicks **Mark as sent** (web writes the `sent` message) or **Skip**.
4. The server owns scheduling (`nextDue`). The web `enrol` writes `nextDue: null` and the server schedules it.
5. Timezone: all engine schedules are computed in `org.tz` (default `Australia/Melbourne`) using `Intl`. Clock = real time + `settings/clock.offsetMinutes` (D9).
6. Suppression is one helper with identical semantics on both sides (contactId OR email OR email2) and the server refuses to mark a message `sent` to a suppressed address (`SUPPRESSED`).

## 2. Source of truth for types

- API `src/services/sales/contract.ts`; web `src/sales/api/contract.ts`. Both change in lockstep (as Phase 1 section 1). API ships first.
- Changes to those files in this feature are limited to: `ErrorCode` gains `SUPPRESSED`; `SalesEngineLease` is marked deprecated; a new `EngineRunResponse` type (section 6). Everything else in this document is record `data` convention (records are schemaless in the contract, validated by `collections.ts` where it already validates).

## 3. Record shapes

All examples are the `data` object of a record. Timestamps `due`, `nextDue`, `createdAt`, `completedAt`, `snoozeUntil`, `resumeAt`, `startedAt` are **zoneless wall-clock strings `YYYY-MM-DDTHH:mm:ss` (unchanged from Phase 1) and are now defined to be wall time in `org.tz`**. Instants (`createdAt` on envelopes, `sentAt` ISO with `Z`) are unaffected. See section 9 for migration (none).

### 3.1 Task, kind `email` (new)

Collection `tasks`. Deterministic id: `tk_<enrolmentId>_<stepIdx>`, hashed by `detId` when longer than 80 chars (`ID_PATTERN` is `^[A-Za-z0-9_-]{1,80}$`).

```json
{
  "id": "tk_en_ab12cd34ef56_2",
  "kind": "email",
  "type": "Email",
  "title": "Send email: Intro to {{company}} (Step 3)",
  "status": "Not Started",
  "priority": "Normal",
  "assigneeId": "u_owner",
  "due": "2026-10-12T09:30:00",
  "createdAt": "2026-10-12T09:30:00",
  "source": "Sequence: Cold outbound v2",
  "seqId": "sq_x", "enrolmentId": "en_ab12cd34ef56", "stepId": "st_y", "stepIdx": 2,
  "companyId": "co_z", "contactId": "ct_w",
  "mailboxId": "mb_1",
  "day": "2026-10-12",
  "draft": {
    "from": "owner@ardorio.com",
    "to": "buyer@example.com",
    "cc": "",
    "subject": "Quick question about Acme",
    "body": "Hi Sam,\n..."
  }
}
```

Field rules:

| Field | Type | Notes |
|---|---|---|
| `kind` | `'email'` | New discriminator. Existing tasks have no `kind` (unchanged). |
| `type` | `'Email'` | Display type. Added to the task type list on web (**unverified** which list: see web plan 4.1). |
| `draft` | `{from,to,cc,subject,body}` all strings | Rendered at creation using the sequence's tokens. Immutable by the server after creation except on reopen (3.1.2). Web may let the user edit `draft` before copying (optional; the server never reads it back except for the Mark-as-sent default). |
| `mailboxId` | string | Mailbox the draft is attributed to (cap accounting). |
| `day` | `YYYY-MM-DD` | Org-tz calendar day the task was created for. Cap accounting key. |
| `stepIdx` | integer | Index into `sequence.steps`. |
| `due`/`createdAt` | wall string | Equal at creation. |
| `status` | existing task statuses | `Not Started`, `In Progress`, `Completed`, `Cancelled`, `Snoozed` (unchanged set). |
| `outcome` | string | Existing field. Values written for this kind: `Sent (manual)`, `Skipped`, `Enrolment <status>`, `Contact suppressed`. |

#### 3.1.1 Other engine-created tasks

`call`, `linkedin`, `task` steps create tasks exactly as the browser engine did (same fields), with the new deterministic id `tk_<enrolmentId>_<stepIdx>` (was random `uid('tk')`). **unverified:** whether any web code looks up tasks by an id prefix; grep `'tk_'` before building.

#### 3.1.2 Task lifecycle owned by whom

| Transition | Writer |
|---|---|
| create | server (engine) |
| Not Started to Completed (email) | web "Mark as sent" modal only (never the generic complete) |
| Not Started to Cancelled (email) via Skip | web ("Skip this email") |
| Not Started to Cancelled (reconcile) | server, when enrolment is no longer `awaiting_task` or contact is suppressed |
| Cancelled to Not Started (reopen with fresh draft) | server, on resume of a paused enrolment whose step task exists |
| Snoozed to Not Started | server, when `snoozeUntil <= nowWall` (existing behaviour, now server side) |

### 3.2 Enrolment

Collection `enrolments`. **No new statuses.** (The LIVE status list is duplicated in about 8 web places; adding one would be a wide change. Unverified count; the plan uses "do not add".)

Status transitions:

| From | To | Trigger | Writer |
|---|---|---|---|
| (new) | `active`, `stepIdx:0`, `nextDue:null`, `startedAt:<wall now>` | enrol | web |
| `active`, `nextDue:null` | `active`, `nextDue:<first step delay from startedAt>` | scheduling pass | server |
| `active`, `nextDue<=now` | `awaiting_task` + `taskId` (email, call, linkedin, task steps) | step exec | server |
| `active`, `nextDue<=now` | `active`, next step, new `nextDue` (wait step, branch pass) | step exec | server |
| `active` | `paused`, `pauseReason:"Held: missing {{x}}"`, `resumeAt:null` | unresolved token | server |
| `active` | `active`, `nextDue:<next day 08:00 org-tz>` | daily cap reached | server |
| `active` | `removed` | suppressed contact (any email/email2 match) | server |
| `active` | `failed` + notification | no email, contact Bounced, or mailbox missing or not connected | server |
| `active` | `completed` ("Exited at branch") | branch cond false and `onFalse !== 'skip'` | server |
| `awaiting_task` | `active`, `stepIdx+1`, `nextDue` | task Completed (from `completedAt`), or Cancelled, deleted or missing (from now) | server |
| `awaiting_task` | `removed` | web "Stop emailing this contact" (writes the removal itself and cancels the task) | web |
| `paused` | `active`, `nextDue:<now>` | `resumeAt <= now`, or user resume | server (timed) / web (user) |
| `awaiting_approval` (legacy) | `awaiting_task` + `taskId` | legacy sweep (3.5) | server |
| any live | `replied` / `unsubscribed` / `bounced` | inbound classification | web (`simulateReply`, `correctClass`) |

`active` with `nextDue: null` is the defined "unscheduled" state. Web user resume of a `paused` enrolment still writes `nextDue = <wall now>` (org-tz) and `status:'active'`; the server executes it on the next tick.

### 3.3 Message (manual send)

`Mark as sent` creates, with deterministic id `ms_<taskId>` (hashed if long):

```json
{
  "id": "ms_tk_en_ab12cd34ef56_2",
  "threadId": "th_q", "dir": "out", "status": "sent",
  "enrolmentId": "en_ab12cd34ef56", "stepId": "st_y", "mailboxId": "mb_1",
  "from": "owner@ardorio.com", "to": "buyer@example.com", "cc": "",
  "subject": "Quick question about Acme", "body": "Hi Sam,\n...",
  "sentAt": "2026-10-12T09:41:07.000Z",
  "manual": true
}
```

- `manual: true` is new. `sent_step_unique` (unique partial on `data.enrolmentId + data.stepId` for sent messages) and `assertNotDuplicateSend` still apply. A second mark-as-sent returns `DUPLICATE_SEND`; the web treats that as success (already sent).
- If the enrolment has no thread yet, web creates the thread in the same batch (thread before message, per the `viaThread` scope rule).
- `sentAt` is the real instant (`new Date(now()).toISOString()`, clock-offset aware), not wall.

### 3.4 Activity

Collection `activities` (append only).

- Email step marked as sent: `{type:'email_out', manual:true, taskId, messageId, desc:"Sent manually from owner@ardorio.com (marked as sent)", actorId:<clicking user>, contactId, companyId, enrolmentId}` id `ac_ms_<taskId>`.
- Email step skipped: `{type:'seq_paused', desc:"Email step skipped", taskId, ...}` id `ac_sk_<taskId>`.
- Sequence step events written by the engine use `actorId = enrolment owner` and `createdBy/updatedBy = 'system'`. Deterministic ids: `ac_<kind>_<enrolmentId>_<stepIdx>`.
- Activities with a `privateTo` are **created only** by the engine (the system actor is "hidden" from them, so replays hit rejected-CONFLICT; treated as already done).

### 3.5 Legacy approval sweep

On every tick, for each `awaiting_approval` enrolment with a `pendingMsgId`: create the email task (id as 3.1, from the pending message's rendered fields), set the pending message `status:'discarded'`, set the enrolment `awaiting_task` + `taskId`. `seq.mode` and `step.approval` are ignored by the engine; the fields stay in data. `awaiting_approval` without a pending message is advanced like a stuck enrolment (**unverified:** whether any such rows exist).

### 3.6 Notifications

Engine-created, deterministic ids, `createdBy:'system'`:

| Id | When |
|---|---|
| `nt_fail_<enrolmentId>_<stepIdx>` | step failed (no email, bounced, mailbox) |
| `nt_od_<taskId>` | High-priority task overdue (flag `_od` on task) |
| `nt_mt_<meetingId>` | meeting within 24h (flag `_nt` on meeting) |
| `nt_em_<hash>` | one grouped "N emails ready to send" per assignee per tick, hash of sorted task ids |

### 3.7 Suppression semantics (shared)

`isSuppressed(contact, businessId)` is true when a suppression record exists with no `removed`, scope `global` or `scope === businessId`, and `s.contactId === contact.id` OR `lower(s.email)` is in `{lower(contact.email), lower(contact.email2)}`. Both sides implement exactly this; vectors in section 10.

Compose-time variant for raw addresses (manual compose to/cc): same email match, plus `contactId` if the thread has one.

## 4. Errors

| Code | HTTP | Meaning |
|---|---|---|
| `SUPPRESSED` (new) | 409 | A message transition to `status:'sent'` (dir `out`) was refused because the thread's contact or an address in `to`/`cc` is suppressed in the thread's business. Applies to `putCreate` and `putUpdate` on `messages`. Drafts (`status:'draft'`) are exempt. Surfaces as a `rejected` OpResult with `error.code: 'SUPPRESSED'` and `error.message` naming the address. |
| `LEASE_LOST` | 409 | **Deprecated, retained.** Returned to old web builds posting `engine` tagged batches: the browser can no longer hold a lease. The new web never sends `engine`. |
| `DUPLICATE_SEND` | 409 | Unchanged. |

`STATUS` map in `errors.ts` gets `SUPPRESSED: 409`. Web `ErrorCode` union gets `'SUPPRESSED'`; `api/http.test.ts` gains a parse case.

## 5. Settings keys

No new keys. Consumed:

- `settings/org.tz` (IANA name; default `Australia/Melbourne` from `SETTINGS_DEFAULTS`). Read by the server every tick. Invalid or unsupported value falls back to `Australia/Melbourne` (and logs once per change). The per-business `tz` field is ignored.
- `settings/clock.offsetMinutes` (integer, ±525600, admin write). Unchanged check.

Effective now = `Date.now() + offsetMinutes * 60000`; wall now = that instant formatted in `org.tz`.

## 6. Endpoints

All under `/sales` (requireAuth, requireSalesMember), envelope per Phase 1.

### 6.1 New: `POST /sales/engine/run`

Caller needs a `sales`-tier role in at least one business. Body: `{}` (no fields). Ticks, on this instance, the businesses the caller can write to.

```ts
export interface EngineRunResponse {
  ran: boolean
  reason?: 'busy' | 'held_elsewhere' | 'disabled'
  businessIds: BusinessId[]
  serverNow: string // ISO instant incl. clock offset
}
```

- Always 200 (never throws on busy). Coalesced: at most one forced run per second per instance.
- `held_elsewhere`: another instance holds the lease. Best-effort only; the lease holder ticks within 30 s regardless. `disabled`: `SALES_ENGINE=off`.
- Web calls it (`nudgeEngine()`) after a flush for: "Run due steps", clock change, enrol, sequence activate.

### 6.2 Tombstoned (one release): `POST /sales/engine/lease`, `POST /sales/engine/lease/release`

- `lease`: returns `{held:false, holder:{userId:'system', name:'SalesOS engine'}, ...}` for every requested business and **never writes**. `release`: `{released:[]}`.
- Web builds from this feature on never call them. Delete in a follow-up (owner decision N1).
- Engine tagged batches from old builds: `assertLease` finds no browser-held lease and returns `LEASE_LOST` 409; the old `sendPlan` already rolls back on that.

### 6.3 Health

`GET /health` gains `salesEngine: { enabled: boolean, running: boolean, lastTickAt: string | null }`. Additive.

## 7. Server lease (internal, not an endpoint)

- Collection: existing `SalesEngineLease` (`_id = BusinessId`).
- `sessionId = 'server:<instanceId>'`, `userId = 'system'`, TTL 90 000 ms, renewed before every apply chunk.
- Browser `SESSION_ID` regex `^[A-Za-z0-9_-]{8,100}$` excludes `:`; browsers can never present a `server:` session. `heldBusinesses` requires matching `userId`, so a server lease is never "held" by any browser.
- `holderOf` returns name `"SalesOS engine"` for userId `system`.
- SIGTERM/SIGINT: stop scheduling, wait up to 10 s for an in-flight tick, set `expiresAt = now` on leases owned by this instance, exit.

## 8. System actor

```ts
export const SYSTEM_ACTOR: MemberCtx = { userId: 'system', super: true, roles: {} }
```

- Record `createdBy`/`updatedBy` = `'system'` (matches the bootstrap, audit and suppression writers; verified in `records.ts` that `updatedBy`/`deletedBy` are stamped from the caller's `userId`).
- No `users` projection entry. Web has a constant `SYSTEM_USER` (name "SalesOS engine") used by `userName()` and `Q.user('system')`, kept out of `S.users`.
- Super is still "hidden" from `privateTo` records that lack its userId; the engine creates but never updates private notifications, threads or activities.

## 9. Migration

None. Existing zoneless strings are re-read as `org.tz` wall time (previously browser-local wall time). For the current single-region (Melbourne) operation this is the same. A mismatch is only possible if a user in another zone created data (**risk R1**). Legacy `awaiting_approval` is swept (3.5). Old random-id tasks and activities remain valid.

## 10. Shared test vectors (both repos must pass)

Timezone `Australia/Melbourne`. `wall` = `YYYY-MM-DDTHH:mm:ss`.

| # | Case | Input | Expected |
|---|---|---|---|
| T1 | wall to instant, normal | `2026-07-01T09:00:00` | `2026-06-30T23:00:00Z` |
| T2 | gap (DST start 2026-10-04) | `2026-10-04T02:30:00` | resolves forward: `2026-10-03T16:30:00Z` (= 03:30 +11) |
| T3 | overlap (DST end 2026-04-05) | `2026-04-05T02:30:00` | earlier instant: `2026-04-04T15:30:00Z` (02:30 +11) |
| T4 | instant to wall, gap edge | `2026-10-03T15:59:00Z` | `2026-10-04T01:59:00` |
| T5 | | `2026-10-03T16:00:00Z` | `2026-10-04T03:00:00` |
| T6 | overlap edges | `2026-04-04T15:59:00Z` / `16:00Z` / `17:00Z` | `02:59:00` / `02:00:00` / `03:00:00` (all 2026-04-05) |
| T7 | +1 day across DST start | `2026-10-03T10:00:00` + 1 day | `2026-10-04T10:00:00` (wall arithmetic, not +24h) |
| T8 | business days | Fri `2026-10-09T16:00:00` + 1 bd | Mon `2026-10-12T09:00:00` (window clamp [9,17)) |
| T9 | hours unit across gap | `2026-10-04T01:00:00` + 2 h | via ms: `2026-10-04T04:00:00` |

Suppression vectors S1-S6: contactId match; email match; email2 match; case-insensitive; other business scope not matching; `removed` ignored. Expected true, true, true, true, false, false.

T1-T6 and T9 instants were checked against Node 26 `Intl.DateTimeFormat` output for Melbourne. T7/T8 are algorithm rules (unverified until implemented).

## 11. File ownership (parallel implementers)

| Owner | Files |
|---|---|
| **API** | `src/services/sales/engine/**` (new), `src/services/sales/lease.ts`, `src/services/sales/records.ts` (SUPPRESSED guard), `src/services/sales/errors.ts`, `src/services/sales/contract.ts`, `src/models/sales/SalesRecord.ts` (indexes), `src/routes/sales/engine.ts`, `src/index.ts`, `src/__tests__/sales-engine-*.test.ts`, `src/__tests__/sales-suppressed-send.test.ts`, `src/__tests__/sales-lease.test.ts` (rewrite) |
| **Web** | everything under `src/sales/` including `api/contract.ts` (must mirror API verbatim), `api/engine.ts`, tests. Web plan section 1 lists the deletions |
| **Architect only** | `.autofeature/designs/sales-engine-2026-10-09.*` |

Shared vectors (section 10) are copied into both test suites; neither side imports the other.

**Order:** API first (scheduler off in tests by `NODE_ENV=test`; enabled with a flag in engine tests). Web can develop in parallel against this document; it must not be deployed before the API. Until the web ships, the new server engine and old browser engines coexist only through the tombstone (section 6.2).

## 12. Needs owner decision

Most items are decided in the plans. Remaining:

- **N1.** Delete the tombstoned lease endpoints one release later? Recommended yes, so old tabs have one release to refresh.
- **N2.** Move `refreshRecs` server side later? Recommended not now (stays client, deterministic ids).
- **N3.** Accept the `POST /sales/engine/run` nudge as best-effort local-instance only? Recommended yes (lease holder ticks within 30 s regardless).
