# SalesOS Phase 2: server sequence engine, API plan

**Date:** 2026-10-09 · **Owner:** architect (express-mongo) · **Slug:** sales-engine
**Repo:** `/home/ryan/dev/ardorio-labs-api-sales-os` (branch `feature/sales-engine`)
**Authority:** `sales-engine-2026-10-09.contract.md` wins on any conflict. Brief: `sales-engine-2026-10-09.md`.

Nothing here has been built or run. Line numbers in the brief were not trusted; file and function names below were re-read in the worktrees. Anything not checked is marked **unverified**.

---

## 1. Scope and shape

Move the tick loop out of the browser (`src/sales/engine/engine.ts` in the web repo) into the API. The engine is a **pure planner** over an in-memory working set, plus a thin **I/O shell** that loads records, calls the planner, and applies the resulting ops through in-process `applyBatch` as a system actor.

```
scheduler (30 s) -> acquire server lease -> load per business -> planTick(state, now, tz) -> ops -> applyBatch chunks (renew lease between)
```

No new write protocol, no new collection. One new route (`POST /sales/engine/run`), two tombstoned routes.

## 2. Module layout: `src/services/sales/engine/`

| File | Responsibility | Pure? |
|---|---|---|
| `types.ts` | `EngineClock`, `WorkingSet`, `EngineInput`, `PlannedOp`, `TickResult`, record row types | yes |
| `time.ts` | Intl-based tz helpers | yes |
| `schedule.ts` | `scheduleNext` (delay + window + business days) | yes |
| `tokens.ts` | `findTokens`, `render`, `senderOf` (port of web `Q.ts` 170-198, with the `mbId` bug fixed) | yes |
| `suppression.ts` | `isSuppressed`, `suppressedAddresses` | yes |
| `state.ts` | `WorkingSet` class: indexes, `get/put/patch/create/remove`, dirty and new tracking, `toOps()` | yes |
| `steps.ts` | per-step exec: email, call, linkedin, task, wait | yes |
| `branch.ts` | branch condition evaluation | yes |
| `tick.ts` | `planTick(input): TickResult` orchestrating passes (section 3.3) | yes |
| `load.ts` | targeted Mongo queries to build `EngineInput` for one business | I/O |
| `apply.ts` | chunk ops (200 per chunk), `applyBatch`, interpret results | I/O |
| `actor.ts` | `SYSTEM_ACTOR`, `ENGINE_NAME` | const |
| `scheduler.ts` | cron, lease, run flag, SIGTERM, `runNow()` | I/O |
| `index.ts` | public exports: `startSalesEngine`, `stopSalesEngine`, `runEngineNow`, `engineStatus` | I/O |

Changed outside this folder: `services/sales/lease.ts`, `records.ts`, `errors.ts`, `contract.ts`, `models/sales/SalesRecord.ts`, `routes/sales/engine.ts`, `src/index.ts`.

## 3. Pure engine

### 3.1 Signatures

```ts
// time.ts
export const DEFAULT_TZ = 'Australia/Melbourne'
export function resolveTz(raw: unknown): string                      // valid IANA else DEFAULT_TZ
export interface Wall { y: number; mo: number; d: number; h: number; mi: number; s: number }
export function wallFromMs(ms: number, tz: string): Wall
export function msFromWall(w: Wall, tz: string): number              // gap -> forward, overlap -> earlier instant
export function formatWall(w: Wall): string                          // 'YYYY-MM-DDTHH:mm:ss'
export function parseWall(s: string): Wall | null                    // zoneless string, also accepts 'YYYY-MM-DD'
export function addDaysWall(w: Wall, days: number): Wall             // calendar arithmetic, keeps h:mi:s
export function weekdayOf(w: Wall): number                           // 0=Sun
export function dayKey(w: Wall): string                              // 'YYYY-MM-DD'

// schedule.ts
export type DelayUnit = 'hours' | 'days' | 'businessDays' | string
export interface ScheduleOpts { window?: [number, number]; businessDays?: boolean }
export function scheduleNext(from: Wall, delay: number, unit: DelayUnit, seq: ScheduleOpts, tz: string): Wall

// suppression.ts
export function isSuppressed(ct: ContactRow, businessId: string, sups: SuppressionRow[]): boolean
export function suppressedAddress(addrs: string[], businessId: string, sups: SuppressionRow[]): string | null

// tokens.ts
export function findTokens(s: string): string[]
export function render(tpl: string, vars: Record<string, string>): { text: string; missing: string[] }
export function senderOf(mb: MailboxRow | undefined, enrol: EnrolmentRow, users: Map<string, UserRow>): { name: string; email: string; ownerId: string }

// tick.ts
export interface EngineInput {
  businessId: string
  nowMs: number               // effective now (real + clock offset), caller computes
  tz: string                  // resolved org.tz
  ws: WorkingSet              // already loaded (section 4)
  cfg: { maxSteps: number }
}
export interface TickResult {
  ops: PlannedOp[]            // in application order
  stats: { scheduled: number; executed: number; resolved: number; swept: number; truncated: boolean }
}
export function planTick(input: EngineInput): TickResult
```

`planTick` never calls `Date.now()`, never touches Mongo, never generates random ids. It is deterministic given `(ws, nowMs, tz)`.

### 3.2 Time semantics

- **Effective now:** `nowMs = Date.now() + clockOffsetMinutes*60000`. `wallNow = formatWall(wallFromMs(nowMs, tz))`.
- **Intl:** a cached `Intl.DateTimeFormat(locale 'en-CA', {timeZone, hourCycle:'h23', year,month,day,hour,minute,second:'2-digit'})` per tz. `hourCycle:'h23'` avoids the `24:00` quirk.
- **`msFromWall`:** guess `utc = Date.UTC(fields)`, subtract the tz offset at the guess, re-check the offset at the result; if they differ (DST edge) pick per rule: **gap** (no wall time maps back) resolves forward (e.g. 02:30 becomes 03:30 +11); **overlap** (two instants) picks the **earlier** instant (e.g. 02:30 on 2026-04-05 is the +11 one). Verified facts (Node 26): Melbourne 2026-10-04 15:59Z shows 01:59, 16:00Z shows 03:00; 2026-04-04 15:59Z shows 02:59 (+11), 16:00Z shows 02:00 (+10), 17:00Z shows 03:00 (+10).
- **Zoneless `nextDue` strings are org-tz wall time.** String comparison (`nextDue <= wallNow`) is retained for due checks (cheap, indexable). Known caveat: during the repeated overlap hour a string compare can fire up to an hour early or late for rows created inside that hour. Accepted (rows within a 1 hour window once a year); instants are used where it matters: meeting reminders and the 24 h check via `msFromWall`.
- **Where org.tz is read:** `load.ts` reads `settings/org` and `settings/clock` records from `sales_records` at the start of each tick (not cached across ticks, so admin changes apply within 30 s); `resolveTz` guards invalid values. The business-level `tz` (`bootstrapData.ts` ~63) is ignored. **Unverified:** whether `settings/org` is global or per-business; `SETTINGS_IDS` suggests global singletons, load both defensively (business-scoped first, else global).
- **`scheduleNext`:**
  - `days`: `addDaysWall(from, delay)`; `businessDays`: step day by day skipping Sat/Sun; `hours`: `msFromWall(from) + delay*3600000` then back to wall.
  - Window clamp `[w0,w1)` (default `[9,17]`): if the hour is before `w0` set to `w0:00` the same day; if at or after `w1` set to `w0:00` next day (then re-apply weekend skip when `businessDays`). Applied to every unit (matches the browser engine, **unverified** against `data/internals.ts schedule` for `hours`; port by reading it before building and add the divergence to the test list).
  - Daily cap deferral uses `scheduleNext(wallNow day + 1 at 08:00)`, explicitly bypassing the window clamp (08:00 is outside `[9,17)` by design: it is "start of next day"; **decision:** keep 08:00 as the browser did, **unverified** value).

### 3.3 Passes in `planTick` (order matters)

1. **Legacy sweep.** `awaiting_approval` + `pendingMsgId`: create email task, discard pending message, enrolment to `awaiting_task`.
2. **Resolve tasks.** For each `awaiting_task` enrolment:
   - task `Completed` -> advance from `completedAt` (wall).
   - task `Cancelled`, missing or deleted -> advance from `wallNow`. This is the generic skip rule; it also fixes stuck call/linkedin enrolments whose task was cancelled.
   - email task open but a `sent` message with the same `enrolmentId+stepId` exists -> mark task Completed (outcome `Sent (manual)`), advance.
   - `advance(en, from)`: `stepIdx+1`; none left -> `completed`; else schedule with the next step's delay, or `nextDue = wallNow` for branch steps (they run in pass 4 this tick).
3. **Reconcile email tasks.** Open email task whose enrolment is not `awaiting_task`, or whose contact is now suppressed or Bounced: task `Cancelled`, outcome `Enrolment <status>` / `Contact suppressed`. If suppressed while `awaiting_task`: enrolment -> `removed`.
4. **Schedule.** `active` with `nextDue == null`: `nextDue = scheduleNext(parse(startedAt), step[0].delay...)`.
5. **Wake.** `paused` with `resumeAt && resumeAt <= wallNow` -> `active`, `nextDue = wallNow`. `Snoozed` tasks with `snoozeUntil <= wallNow` -> `Not Started`, `due = snoozeUntil`.
6. **Execute due.** `active` with `nextDue <= wallNow`, oldest first, up to `maxSteps`. Per step (`steps.ts`):
   - **Branch** (`branch.ts`): conds `no_reply, replied, positive, meeting, bounced, unsub, task_done, clicked`. False: `onFalse==='skip'` -> `stepIdx++` and continue scheduling; else `completed` with reason "Exited at branch". Conds read facts from the working set (section 4.3).
   - **Wait:** advance (the delay was already applied when the wait step was scheduled).
   - **Call / LinkedIn / Task:** create task `tk_<enrolmentId>_<stepIdx>` (fields as browser engine) and set the enrolment `awaiting_task` + `taskId`; `wait`-flavoured tasks too.
   - **Email**, in this order:
     1. contact suppressed (contactId OR email OR email2) -> enrolment `removed`, reason "Suppressed".
     2. no `email` or contact status `Bounced` -> `failed`, notification `nt_fail_...`.
     3. mailbox missing or not `connected` -> `failed`, notification.
     4. render subject/body/to with tokens; sender via `senderOf(mb, en)` using **`mbId`** (the resolved mailbox id; bug 1 fix, the browser passed `e.mailboxId`).
     5. missing tokens -> `paused`, `pauseReason: "Held: missing {{x}}"`, no `resumeAt` (unchanged behaviour).
     6. daily cap reached -> `nextDue` = next day 08:00 (enrolment stays `active`).
     7. else create the email task (contract 3.1) and set the enrolment `awaiting_task` + `taskId`, `nextDue: null`.
7. **Time-based notifications.** High-priority overdue tasks without `_od` -> `nt_od_<taskId>`, set `_od`. Meetings within 24 h (via `msFromWall`) without `_nt` -> `nt_mt_<meetingId>`, set `_nt`.
8. **Group notification.** One `nt_em_<hash>` per assignee for email tasks created this tick.

If `truncated` (more due than `maxSteps`), the scheduler runs up to 4 follow-up passes in the same tick, each reloading (cheap by index).

### 3.4 Ordering inside the op list

For any enrolment: **task create precedes enrolment update**; **activity creates follow**; notifications last. A crashed tick that applied the task but not the enrolment update is repaired next tick: `ensureStepTask` sees the task id exists and open, and reuses it (section 8).

## 4. Loading state per business

`load.ts` builds a `WorkingSet` using targeted queries (not "load the whole business"). All filters include `scopeBiz` and `deleted:false`. Mongo field names use the `data.` prefix.

| What | Query | Index |
|---|---|---|
| Enrolments to schedule/execute | `coll:'enrolments'`, `data.status:'active'` and (`data.nextDue:null` or `<= wallNow`) | new partial `{scopeBiz,'data.status','data.nextDue'}` where `coll:'enrolments'` |
| Paused due | `data.status:'paused'`, `data.resumeAt <= wallNow` | same index |
| awaiting_task / awaiting_approval | `data.status in [...]` | same index |
| Sequences, contacts, companies | by id from the enrolment set | `{coll,id}` unique (existing) |
| Tasks | by id of `taskId`s; plus Snoozed with `snoozeUntil <= wallNow`; High-priority overdue without `_od`; open `kind:'email'` | by id, plus new partial `{coll:'tasks','data.kind','data.status'}` |
| Mailboxes | all in business (small) | `{scopeBiz,coll,deleted}` |
| Members/users | `SalesMember` + `User` for owners referenced | existing |
| Suppressions | `coll:'suppressions'`, `data.contactId in ids` OR `data.email in lowercased addresses` (global scope or business) | new partials `{'data.contactId'}`, `{'data.email'}` where `coll:'suppressions'` (**unverified** existing partial indexes cover `data.contactId` for other colls only) |
| Cap counters | tasks `kind:'email'`, `data.day = today`, per `mailboxId` (count, excluding Cancelled with outcome Skipped) plus manual `sent` messages with no `stepId` today | new partial `{'data.mailboxId','data.day'}` where `coll:'tasks'` and `data.kind:'email'` |
| Branch facts | only for enrolments whose sequence has a branch step: inbound `received` messages by `threadId`; activities `link_click` / `meeting_booked` by contactId since `startedAt` | existing `data.threadId`, `data.contactId` partials |
| Meetings | upcoming within 25 h, no `_nt` | **unverified**: use `{scopeBiz,coll,deleted}` and filter in memory |

The `WorkingSet` records each loaded record's `rev` and original `data` so `toOps()` can emit minimal `set` payloads with `baseRev`.

### 4.1 Performance bounds (client looped up to 2000 enrolments per tick)

- `MAX_STEPS_PER_TICK = 500` per business; up to 4 follow-up passes (so at most about 2500, the previous cap's order of magnitude).
- Per-business time budget 20 s; the tick stops starting new work after the budget and logs `truncated`.
- Chunks of 200 ops (< `MAX_OPS=500`); `applyBatch` does per-op reads and CAS writes, so cost is roughly a few Mongo round trips per op. **Unverified**: throughput numbers. The test plan includes a 2000-enrolment timing test whose number is recorded, not asserted tightly.
- A tick with nothing due must stay cheap: a handful of indexed queries per business (target under 50 ms on a small dataset, **unverified**).

## 5. The actor and writing

- `SYSTEM_ACTOR: MemberCtx = { userId: 'system', super: true, roles: {} }`. `super` gives rank 5 and bypasses role checks (`checkWriteRole`, including `notifications` create).
- `applyBatch(SYSTEM_ACTOR, { ops, ... })` is called with no `engine` tag and no `sessionId`, so `assertLease` is not invoked. The server lease (section 6) is held for mutual exclusion between servers, not enforced by `applyBatch`.
- `createdBy/updatedBy = 'system'` (`records.ts` stamps `updatedBy`/`deletedBy` from `m.userId`, verified). Matches bootstrap, audit and suppression writers.
- **Names:** no synthetic `users` entry on the API (`users` projection stays real users only). Web resolves `'system'` to "SalesOS engine" (web plan 6). Activities use `actorId = enrolment owner` so feeds show a person; notifications target `userId = assignee`.
- **Hidden records:** super is still "hidden" from records whose `privateTo` lacks `system`. The engine therefore only **creates** private notifications, threads and activities and never updates them; replays hit the rejected-CONFLICT path (section 8).
- **Op shapes:** `PutOp` create `{op:'put', coll, id, data}`; update `{op:'put', coll, id, baseRev, set:{...}}`; delete via `DeleteOp` with `baseRev`. **Unverified**: exact `BatchRequest` field names (`ops`, `batchId`?): read `contract.ts` when implementing and use the existing types, do not redefine.
- **Result handling (`apply.ts`):**

| Result | Engine action |
|---|---|
| `applied`, `merged` | ok |
| `noop` | ok |
| `conflict` kind `exists` on a create | already done, ok |
| `rejected` code `CONFLICT` on a create ("id in use", hidden record) | already done, ok |
| `conflict` on an update (rev moved) | skip this record this tick; it is reloaded next tick |
| `rejected` `CONTENTION` | retry the chunk once, else skip |
| `rejected` other | log with op id, continue |
| `SUPPRESSED` (messages) | not produced by the engine (it never writes `sent`) |

Ops that depend on an earlier op in the same batch (update after create of the same task) are independent in `applyBatch` (no transaction). If the create is skipped, the dependent update is applied anyway. This is safe because the enrolment update only references a `taskId` and `ensureStepTask` (section 8) heals a missing task. Mitigation: `apply.ts` applies each enrolment's ops group in one chunk and, if the task create result is a hard `rejected`, drops that group's update.

## 6. Scheduler and lease

### 6.1 Scheduler

- `scheduler.ts` uses `setInterval(30000)` (not node-cron: no cron semantics needed; `weeklyPriorityReport` uses node-cron with `timezone: 'Australia/Melbourne'` as a pattern for being started from `index.ts`). `startSalesEngine()` is called right after `scheduleWeeklyPriorityReport()` inside the `connectDB().then(...)` block in `src/index.ts`.
- Disabled when `NODE_ENV==='test'` or `SALES_ENGINE==='off'` (kill switch). Tests call `runEngineNow()` directly.
- `running` flag per instance prevents overlap; a tick that finds `running` skips.
- Every tick: list businesses (with sequences, **unverified** source: `Business` records in `sales_records` coll `businesses`), then for each: acquire/renew lease, load, plan, apply.
- `/health` returns `salesEngine: {enabled, running, lastTickAt}`.

### 6.2 Lease

- Reuse `SalesEngineLease` (`_id = BusinessId`). New functions in `lease.ts`:

```ts
export const SERVER_LEASE_TTL_MS = 90_000
export function serverSessionId(instanceId: string): string          // `server:${instanceId}`
export async function acquireServerLease(instanceId: string, businessIds: string[]): Promise<{ held: string[]; blocked: string[] }>
export async function renewServerLease(instanceId: string, businessIds: string[]): Promise<string[]>   // returns still-held
export async function releaseServerLeases(instanceId: string): Promise<number>   // expiresAt = now
```

- `acquireServerLease` uses the same upsert and E11000 handling as `acquire()`: take if absent, expired, or owned by this `sessionId`.
- **Instance id:** `SALES_ENGINE_INSTANCE_ID` or `${hostname}-${pid}-${random4}` computed once at boot.
- **Renewal:** at the start of each tick and before every apply chunk. If `renewServerLease` no longer returns the business, abort that business (another instance won).
- **Release on SIGTERM/SIGINT:** `process.once` handlers in `scheduler.ts`: clear interval, wait up to 10 s for the in-flight tick, `releaseServerLeases`, then a hard `setTimeout(...).unref()` exit guard. `src/index.ts` currently has no signal handling (verified) so the handler must not call `process.exit` before the server closes; it calls `server.close()` if the server handle is exported (**unverified**; otherwise just release and let the default handler terminate).
- **Browser holding a lease during rollout:** a leftover browser lease (userId = real user, 45 s TTL) makes `acquireServerLease` report that business as `blocked`. The server logs, skips, and retries on the next tick, so the maximum delay is about 45 s after the last old tab stops renewing (old tabs keep renewing while open!). Therefore the tombstone (below) matters: once the API is deployed, old tabs' next `acquire()` call gets `held:false` and no longer renews; their existing lease expires within 45 s.
- **Browser lease endpoints (tombstone, one release):** `POST /engine/lease` returns `held:false` with holder `{userId:'system', name:'SalesOS engine'}` for all requested businesses and never writes; `release` returns `{released: []}`. `holderOf` maps userId `system` to the display name "SalesOS engine" (it resolves names from the `User` collection, which has no `system` user).
- **Old batches:** engine-tagged batches from old builds hit `assertLease`, find no browser-held lease, return 409 `LEASE_LOST`; old `sendPlan` rolls back and shows its paused banner.
- **Multiple instances:** only the lease winner ticks a business. If two instances ever tick the same business (lease expiry race), deterministic ids and CAS make it mostly harmless: creates return `noop`/`conflict exists`, updates with stale `baseRev` return `conflict` and are skipped.
- **Clock skew between instances:** `expiresAt` uses server wall time; skew of seconds is tolerated by the 90 s TTL.

## 7. Email step as a task: details

- Record shapes: contract 3.1 to 3.4.
- **Approval mode is moot.** `seq.mode` and `step.approval` are ignored by the engine (the fields stay in data, no migration). Legacy `awaiting_approval` rows are swept (pass 1).
- **Daily cap semantics.** `limit = mailbox.dailyLimit || 50`. A mailbox's "sent today" = email tasks created today (`data.day === dayKey(wallNow)`, not Cancelled-with-outcome-Skipped) + manual-compose `sent` messages with no `stepId` today. This keeps the cap meaningful: it bounds how many drafts we hand to a rep per mailbox per day, and counts what they really sent from compose. In-memory counters add tasks created earlier in the same tick. Day boundary is the org-tz calendar day.
- **Mark as sent, skip, stop** are web writes (web plan 4). The server never creates `sent` messages. The server **does** react: pass 2 advances the enrolment when the task becomes `Completed` or `Cancelled`.
- **Status transitions** as contract 3.2.
- **Resume from paused** with an existing step task: `ensureStepTask(en, stepIdx)`: task exists and open -> reuse; `Completed` -> treat as sent, advance; `Cancelled` -> reopen: status `Not Started`, new `draft` rendered now, `due` = now.

## 8. Idempotency and crash safety

- **Deterministic ids** via `detId(prefix, ...parts)`: `${prefix}_${parts.join('_')}`; if longer than 80 or containing characters outside `[A-Za-z0-9_-]`, use `${prefix}_${sha1(parts.join('|')).slice(0,24)}`. Examples: `tk_<enrolmentId>_<stepIdx>`, `ac_sd_<enrolmentId>`, `nt_fail_<enrolmentId>_<stepIdx>`, `nt_od_<taskId>`, `nt_mt_<meetingId>`, `nt_em_<hash>`.
- **Creates are idempotent:** same id + same data -> `noop`; same id + different data -> `conflict exists`; tombstone -> `conflict deleted` (not resurrected); hidden private -> rejected CONFLICT. All four are "already done" for creates.
- **Update flags** (`_od`, `_nt`) prevent re-notification.
- **Crash between ops:** pass ordering (3.4) ensures a replayed tick converges: the task exists, enrolment still `active`, so exec runs again, `ensureStepTask` reuses the open task and sets the enrolment `awaiting_task`.
- **Duplicate send:** the server never writes sent messages; `sent_step_unique` + `assertNotDuplicateSend` protect the web's Mark-as-sent path and a double click.
- **Two concurrent ticks** (same instance prevented by `running`; two instances by lease; both failing -> CAS + deterministic ids).
- **Task id reuse across a reopened step:** `tk_<enrolmentId>_<stepIdx>` is stable; a sequence that revisits the same stepIdx for the same enrolment (re-enrolment creates a new enrolment id) cannot collide.

## 9. Suppression helper unification and the three bug fixes

All fixes are test-first (section 11). Server-side parts here; web parts in the web plan.

1. **Bug 1 (`mbId`):** ported `senderOf` uses the resolved `mbId`. Test: enrolment with `mailboxId` unset, sequence mailbox set; sender must be from the sequence mailbox.
2. **Bug 2 (manual compose, email2):** the web gap is fixed in web; the **server guard** is the safety net: `records.ts` `putCreate`/`putUpdate` on `messages`: when the resulting data has `dir:'out'` and `status:'sent'` (and the previous status was not `sent`), load the thread's contact (if any) and suppressions for the thread's business (global or business), compare `to`/`cc` addresses (split on `,;`) and contact email/email2 case-insensitively; on match throw `SUPPRESSED` (409) naming the address. Drafts and inbound messages are exempt.
3. **Bug 3 (Delivery Failure reply creating no suppression):** web write path (web plan 5). Server contributes only the read-side `isSuppressed` and the reconcile pass.
4. **Unification:** `suppression.ts` is the only server implementation; `records.ts` guard and the engine both import it. The web has its own copy with identical semantics and the shared vectors (contract 10).

## 10. Clock offset

- Read `settings/clock.offsetMinutes` each tick (admin-writable record; the check already bounds it to ±525600). Missing or non-integer -> 0.
- `ChangesResponse.clockOffsetMinutes` is already synced to the web; nothing to add. The nudge endpoint returns `serverNow`.
- `runEngineNow()` accepts an optional `nowMs` override for tests (never exposed over HTTP).

## 11. `POST /sales/engine/run`

- `routes/sales/engine.ts`: `requireAuth`, `requireSalesMember` already apply; handler additionally requires a role with `sales` tier in at least one business (reuse `checkWriteRole` helper with `'enrolments'`, **unverified** helper signature).
- Calls `runEngineNow({ businessIds: editable })`; coalesced with a 1 s minimum gap using a module-level timestamp.
- Response: contract 6.1. Never errors on busy.

## 12. TDD test plan (Jest + mongodb-memory-server; `npm test`, `npm run build`)

Write each test file first, watch it fail, then implement. Pure tests need no DB.

| File | Cases |
|---|---|
| `src/__tests__/sales-engine-time.unit.test.ts` | contract vectors T1-T6 (gap, overlap, edges), `resolveTz` fallback, `wallFromMs` round trips for every hour of 2026-10-04 and 2026-04-05, non-Melbourne tz (`America/New_York`) |
| `sales-engine-schedule.unit.test.ts` | T7-T9, window clamp before/after, Fri-to-Mon business days, hours across the gap, delay 0, days across DST end |
| `sales-engine-steps.unit.test.ts` | email: suppression (contactId, email, email2, case), no email, Bounced, mailbox missing/disconnected, token pause, cap defer, `mbId` fix (bug 1), personal-mailbox sender; call/linkedin/task create tasks; wait advances; branch conds x8 with true/false and `onFalse` skip vs exit; `planTick` is deterministic (same input -> same ops) |
| `sales-engine-tick.test.ts` | with DB + fake clock (`nowMs` override): enrol -> schedule -> email task created with deterministic id; replay the same tick -> all `noop`/no new records; Mark-as-sent simulated by the test (message + task Completed) -> next tick advances; skip (task Cancelled) advances; paused -> resume wake; Snoozed wake; High-priority overdue notification once; meeting 24 h reminder once and uses instants across DST; legacy `awaiting_approval` sweep; reconcile (replied enrolment cancels open email task; suppressed contact removes); clock offset +3 days makes a delayed step due; 2000-enrolment timing (records number, no tight assert); `truncated` follow-up passes |
| `sales-engine-lease.test.ts` | server lease acquire/renew/release; two instances, only one ticks (assert via counts of created tasks after two concurrent `runEngineNow` calls with different instance ids); expired lease takeover; leftover browser lease blocks then clears; `server:` session cannot be forged by a browser (`SESSION_ID` regex rejects `:`); SIGTERM handler releases (call the exported `shutdown()`); lease abort mid-tick when renewal fails |
| `sales-engine-run-route.test.ts` | auth (no sales role -> 403), `ran:true` for a sales user, `busy` reason, disabled reason, coalescing, `serverNow` includes offset |
| `sales-suppressed-send.test.ts` | creating a `sent` out message to suppressed contact / email / email2 / cc -> `rejected` `SUPPRESSED`; draft allowed; other business scope allowed; global suppression blocks; `removed` suppression allowed; update draft -> sent blocked; inbound unaffected; DUPLICATE_SEND still raised for double send |
| `sales-lease.test.ts` (existing, **rewrite**) | assert tombstone: `acquire` returns `held:false` with holder `SalesOS engine`, writes nothing, `release` returns `[]`; engine-tagged batch -> `LEASE_LOST`. The old acquire/renew/steal cases are deleted (they tested the browser lease) |

Existing suites expected to stay green unchanged: `sales-{access,ai,bootstrap,concurrency,isolation,members,merge,records,sync,url,xai}`. **Unverified:** whether any of them seed through `/engine/lease` (grep `engine/lease` before editing).

Harness: `src/__tests__/helpers/salesHarness.ts` (`connect, buildApp, seedAll, seedPeople, api, runOps, put, patch, del, task`) is reused. Add helpers in the harness only: `seedEnrolment`, `seedMailbox`, `seedSequence`, `tickAt(nowMs)` wrapping `runEngineNow`.

## 13. Build order for the implementer

1. `time.ts` + tests (vectors). 2. `schedule.ts` + tests. 3. `suppression.ts`, `tokens.ts` + tests. 4. `state.ts`, `steps.ts`, `branch.ts`, `tick.ts` + pure tests. 5. `load.ts`, `apply.ts` + tick DB tests. 6. `lease.ts` additions + lease tests, tombstone. 7. `scheduler.ts`, `index.ts` wiring, health. 8. `/engine/run`. 9. `SUPPRESSED` guard + tests. 10. Indexes in `SalesRecord.ts` (check `autoIndex` and how existing partial indexes are declared). 11. `npm test`, `npm run build`.

## 14. Risks

- **R1** Org-tz vs old browser-local zoneless strings (migration none; fine for single-region).
- **R2** Per-op round trips: tick throughput unverified.
- **R3** Old tabs during rollout (mitigated by tombstone + LEASE_LOST rollback).
- **R4** System actor is "hidden" from private records: engine never updates them.
- **R5** `applyBatch` ops are independent (no transaction): partially applied groups; healed by `ensureStepTask`.
- **R6** String-compare due checks in the one-hour overlap per year.
