# SalesOS Phase 2: server sequence engine, web plan

**Date:** 2026-10-09 · **Owner:** architect (react) · **Slug:** sales-engine
**Repo:** `/home/ryan/dev/ardorio-labs-website-sales-os` (branch `feature/sales-engine`), all paths under `src/sales/` unless stated.
**Authority:** `sales-engine-2026-10-09.contract.md` wins on any conflict.

Nothing here has been built or run. Line numbers in the brief were not trusted. Anything not checked is marked **unverified**.

---

## 1. Deleted, kept, changed

### 1.1 Deleted

| Path / symbol | Notes |
|---|---|
| `engine/engine.ts` | `exec`, `runEngine`, `tick`, `TICK_MS`, `COALESCE_MS`, `startEngine` (`requestEngineTick` lives in `engine/lease.ts` and goes with it) |
| `engine/lease.ts`, `engine/lease.test.ts` | browser lease, `useLeaseStatus` |
| `runEngineLocked` and the `EngineTag` parameter of `sendPlan` in `data/sync.ts` | plus its callers in `engine.ts` |
| `startEngine()` call in `index.tsx` (lines 8 and 35, unverified exact) | |
| Lease functions in `api/engine.ts` | replaced by `nudge()` |
| Lease banner / `leaseLost` paths in `shell/Banners.tsx` `SyncBanner`; lease branch in `sync.ts` `sendPlan` (`LEASE_LOST` -> `leaseLost` return, `renew()` once) | |
| `shared/Approval.tsx` | approval UI; see 3 |
| `Q.suppression(ctid, b)` signature (replaced, see 5) | |
| In `data/internals.ts`: `schedule`, `advance`, `sendMsg`, `bounce`, `sentToday`, `bounce` hook `_bounce` | |
| `pages/admin/Demo.tsx`: `EngineCard`, `ClockCard` (moved), lease imports, `c._bounce = true` | the page stays an orphan, demo loader untouched |
| `act/mail.ts`: `approveMsg`, `rejectMsg`, `snoozeMsg` | **unverified** whether anything else calls `snoozeMsg` |

### 1.2 Kept

- `api/contract.ts` verbatim mirror (deprecated lease types and `LEASE_LOST` code remain; gains `SUPPRESSED` and `EngineRunResponse`).
- `api/http.test.ts:49` LEASE_LOST parse case (the code still exists).
- `data/internals.ts`: `act`, `audit`, `notify`, `mgrsOf`, `ensureRels`, `threadFor`.
- `data/clock.ts` (`now`, `setOffsetMinutes`, `getOffsetMinutes`, `formatOffset`), hydrate offset handling.
- `refreshRecs` (client side, section 7), `act/tasks.ts completeTask` (changed, section 4.5), `simulateReply`, `correctClass`, `simEvent` (changed for suppression, section 5).
- Status labels for `awaiting_approval` in `kit/util.ts` and the LIVE lists (legacy rows exist until swept).

### 1.3 Client behaviour on LEASE_LOST from an old build

Only reachable when an old tab posts an `engine`-tagged batch after the API deploys. That old code already handles a 409 `LEASE_LOST`: `sendPlan` returns `leaseLost`, the caller rolls back and calls `renew()` once, which now returns `held:false` (tombstone), and the old engine never ticks without leases, so there is no retry storm (verified by reading `sendPlan`/`engine.ts`). The old tab shows its "Automations paused" banner. **New code** never sends `engine`; if an unexpected `LEASE_LOST` arrives, `sendPlan` treats it as an ordinary rejected op (existing `rejected` path, toast with message).

## 2. Scheduling responsibilities move to the server

- `Act.enrol` (`act/seq.ts`) writes `status:'active', stepIdx:0, nextDue:null, startedAt:<org-tz wall now>`. No client `schedule()` call. The server schedules `active` + `nextDue:null` within 30 s; `nudgeEngine()` after the flush makes it immediate in the common case.
- Resume (`setEnrol` paused -> active, `setSeqStatus`) writes `nextDue = F.nowIso()` as before (org-tz wall).
- `Act.advance/setClock/resetClock/runSequences` (guarded by `Q.anyAdmin()`): `runSequences` becomes `nudgeEngine()`; `advance/setClock/resetClock` change the offset (existing sync of `settings/clock`) and then call `nudgeEngine()` after the flush. `requestEngineTick` (imported from `engine/lease`) is called today in `act/tasks.ts:81`, `act/seq.ts:38,97,118`, `act/mail.ts:138,154`, `act/deals.ts`, `act/admin.ts` (verified by grep): replace each with `nudgeEngine()` or drop it where the call only existed for approval (`mail.ts`).

```ts
// api/engine.ts (new content)
export async function nudge(): Promise<EngineRunResponse>   // POST /sales/engine/run, {} body
// data/engineNudge.ts
export function nudgeEngine(): void   // flushes pending edits first (await flush()), then calls nudge(); errors swallowed (toast only on unexpected 5xx); coalesced at 1 s
```

## 3. Approval mode removal (minimal)

The engine ignores `mode` and `approval`; data fields stay (no migration). UI removals:

| File | Change |
|---|---|
| `pages/sequences/parts/StepEditor.tsx:90-93` | remove step approval selector |
| `pages/sequences/parts/SeqSettings.tsx:25` | remove mode selector |
| `pages/sequences/parts/Builder.tsx:10,78,97` | remove approval chips |
| `pages/sequences/parts/conds.ts:24 needsApproval` | delete function and callers |
| `pages/sequences/parts/SeqAnalytics.tsx:33,44` | drop approval metrics |
| `modals/seq/NewSeq.tsx:14,33,59` | remove mode choice |
| `modals/comms/Enrol.tsx:108,153` | remove approval note |
| `pages/sequences/Sequence.tsx:83`, `Sequences.tsx:36,91` | remove mode label/column |
| `pages/admin/Settings.tsx:106` | remove approval default |
| `pages/home/MyDay.tsx` | replace the approval card and "Awaiting approval" KPI with "Emails to send" (4.3) |
| `pages/inbox/Inbox.tsx:17,48,67,138` | remove approval filter |
| `pages/inbox/parts/ThreadView.tsx:78,87,90,113,154` | remove approval chip/actions |
| `pages/reports/Recs.tsx` (approval rec rules, lines ~74, 88) | adjust rule text; **unverified** which recs reference approval |
| `ai/rules.ts` | replace "pending approval" rec with "emails waiting to be sent" count |
| `kit/util.ts:7` | keep label map |
| `data/act/seq.ts saveSequence` | stop defaulting `mode:'approval'` (leave existing value untouched) |

Line numbers are from the pre-compaction read and should be re-grepped (`grep -rn "approval\|mode" src/sales`).

## 4. Email tasks UI

### 4.1 Types

`S.tasks` rows gain the optional fields in contract 3.1 (`kind:'email'`, `draft`, `mailboxId`, `day`, `stepIdx`). Add `'Email'` to the task type list (**unverified** which constant; grep the task type options in `TaskDrawer`/`NewTask`). `kit/util.ts` enrolment status label for `awaiting_task` with an email task: "Email to send" (derive from `taskId` -> task `kind`).

### 4.2 Modal `modals/comms/SendEmailTask.tsx`

Registered in `units/u1.ts` as `sendEmailTask` (same pattern as `callOutcome: CallOutcome`). Props `{ taskId }`. Layout: header (contact name, company, step N of M, mailbox/from), rows To / Cc / Subject / Body, each with a **Copy** button (`navigator.clipboard.writeText`, fallback textarea + `execCommand('copy')`, toast "Copied"), plus "Copy all" (To, Subject, Body in mail-ready text). The draft is read-only text by default; an "Edit" toggle lets the rep tweak `draft` (saved to the task via ordinary `Act.updateTask` on blur) **unverified whether to ship; recommended yes, small**.

Footer buttons:

1. **Mark as sent** (primary): `Act.markEmailSent(taskId)` (4.4).
2. **Skip this email**: confirm, then `Act.skipEmailTask(taskId)` (4.5).
3. **Stop emailing this contact**: confirm, then `Act.stopEmailing(taskId)`.
4. Close.

If the contact has become suppressed while the modal is open, show a blocking notice and disable "Mark as sent" (check `Q.suppressed(contact)` reactively).

### 4.3 Where it appears

- **My Day** (`pages/home/MyDay.tsx`): card "Emails to send" listing open `kind==='email'` tasks assigned to me (due now or earlier), with an "Open" button per row and a count KPI replacing "Awaiting approval". Row click -> `completeFlow(t)`.
- **Tasks** (`pages/tasks/Tasks.tsx:95` and `TaskTable`): email tasks appear as normal rows with a mail icon and type "Email"; the complete checkbox/row action routes through `completeFlow` (opens the modal; never a bare completion).
- **TaskDrawer:76**: the complete action routes through `completeFlow`; show the draft read-only inline with a "Open email" button.
- **Enrolment views** (`pages/sequences/Sequence.tsx` enrolments table, `Contact.tsx` enrolments section): status shows "Email to send" and a link "Open email" that opens the modal.
- `shared/moves.ts completeFlow(t)`: add `if (t.kind === 'email') return UI.modal('sendEmailTask', { taskId: t.id })` ahead of the Call and LinkedIn branches.

### 4.4 `Act.markEmailSent(taskId)` (new, `data/act/mail.ts`)

One `commit()`, one batch, idempotent, DUPLICATE_SEND treated as success:

1. Re-check suppression (`Q.suppressed(contact, business)` and every `to`/`cc` address); if suppressed return `{ok:false, reason:'suppressed'}` and write nothing.
2. Resolve the thread via `threadFor`; create it when the enrolment has none (private visibility for a personal mailbox; attach an open deal if one exists), before the message.
3. Create message `ms_<taskId>` (`dir:'out', status:'sent', enrolmentId, stepId, mailboxId, manual:true`, subject with the `Re:` rule, `sentAt = new Date(now()).toISOString()`).
4. Create activity `ac_ms_<taskId>` (`email_out`, `manual:true`, `taskId`, `messageId`, `actorId = me`).
5. Complete the task: `status:'Completed', completedAt: F.nowIso(), outcome:'Sent (manual)'`.
6. Set `enrolment.threadId` if it was empty.

The web does **not** advance the enrolment. The server advances it on the next tick (or the nudge). After commit call `nudgeEngine()`.

Returns `{ ok: true } | { ok: false, reason: 'suppressed' | 'no_task' | 'duplicate' }`. A server `SUPPRESSED` rejection surfaces as a toast and the local optimistic message is rolled back by the existing `reject` path in `results.ts`.

### 4.5 Skip, stop, and generic completion

- `Act.skipEmailTask(taskId)`: task `Cancelled`, `outcome:'Skipped'`, `completedAt` set; activity `ac_sk_<taskId>` (`seq_paused`, "Email step skipped"). Enrolment untouched; the server advances (task Cancelled -> advance).
- `Act.stopEmailing(taskId)`: `setEnrol(enrolmentId, 'removed', 'Rep chose not to send')` plus cancel the task, in one batch. Does not create a suppression.
- `Act.completeTask` (`act/tasks.ts`): **no longer advances the enrolment** (server does); keeps the "Meeting Booked" exit and rec update; refuses `kind==='email'` (returns without writing, dev warning) so the generic path can never mark an email task done without a sent message.

## 5. Suppression: one helper, three bug fixes

### 5.1 Read side

`Q.suppression(ctid, b)` becomes `Q.suppressed(ct: Contact, b: BusinessId): Suppression | null` implementing contract 3.7 (contactId OR email OR email2, case-insensitive, global or business scope, ignore `removed`). A second helper `Q.suppressedAddr(addr: string, b): Suppression | null` for compose to/cc. Call sites (verified by grep): `data/Q.ts:208` (eligibility), `ai/rules.ts:147`, `modals/comms/Compose.tsx:53`, `pages/companies/Contact.tsx:49`, `pages/inbox/parts/ListsInner.tsx:12`, `pages/inbox/parts/ThreadView.tsx:87,113`, `data/act/mail.ts:126` (inside `approveMsg`, deleted), plus `engine/engine.ts:33,121` (deleted).

### 5.2 Write side: `suppressContact(ct, reason, source)` in `data/internals.ts`

The single path used by (a) bounce (simulated Delivery Failure reply), (b) Unsubscribe reply, (c) `correctClass` to Unsubscribe, (d) any future UI "mark do not contact". It does, in one batch:

- create the `suppressions` record (global scope for unsubscribe; business scope for bounce), reason and source set, deterministic id `sp_<contactId>_<reason>` so retries are idempotent;
- move live enrolments for the contact to `bounced` / `unsubscribed`;
- `contactRels` eligible=false and `leadStatus = 'Do Not Contact'` (unsubscribe); `status='Bounced'` (bounce);
- a `suppressed` activity, an audit entry, a notify.

**Bug 3 fix:** the Delivery Failure branch in `simulateReply` previously set only the contact status and enrolment status; it now calls `suppressContact(ct, 'bounce', 'delivery_failure')`, matching what `bounce()` did. The orphaned `_bounce` hook (`data/internals.ts:184` reader, `data/types.ts:129` field; its only setter, `Demo.tsx`, is orphaned) is removed.

### 5.3 Manual compose and `Act.sendEmail`

**Bug 2 fix:** `Act.sendEmail` (`act/mail.ts`) checks `Q.suppressedAddr` for every `to`/`cc` address and `Q.suppressed(contact)` when a contact matches by `contactId`, `email` or `email2`. Drafts (`draftId` flow, saving as draft) are exempt. New return type:

```ts
type SendResult =
  | { ok: true; thread: Thread; msg: Message }
  | { ok: false; reason: 'no_mailbox' | 'suppressed'; detail?: string }
```

Callers `Compose.tsx:53,70` and `ThreadView.tsx` handle `ok:false`: inline error ("Not sent: <address> is on the suppression list"), keep the editor content, do not close. The server `SUPPRESSED` guard is the backstop (4.4).

### 5.4 Bug 1

Server-side only (`senderOf` `mbId`); web `Q.senderOf` is deleted with the engine (grep for other users; **unverified**; if the Compose path uses it, fix to pass the resolved id).

## 6. Admin clock control and banner

- **Page:** `pages/admin/Clock.tsx`. Registered in `units/u4.ts` and `routes.ts` `SEGMENT` (`clock`). Nav: `shell/nav.ts` Administration group, item "Clock" with `admin: true` (visible and routable only to `Q.anyAdmin()`; the page also guards itself).
- **Content:** reuse the `ClockCard` UI from `Demo.tsx`: shows real org-tz time, simulated time, offset (`formatOffset`), buttons +1h/+4h/+1d/+3d/+1w (`Act.advance`), a `datetime-local` input with "Set" (`Act.setClock`), "Reset" (`Act.resetClock`). The datetime-local string is interpreted as **org.tz wall time** using `data/tz.ts` (`msFromWall`), not browser-local `new Date(...)`. After each change, `nudgeEngine()`; a "Run due steps" button calls `nudgeEngine()` and shows the response (`ran`, `reason`, serverNow).
- **Banner:** `shell/Banners.tsx` `ClockBanner` stays, reworded "Simulated clock: +3d 4h (now Mon 12 Oct, 09:41 AEDT)" with a "Reset" link for admins. `SyncBanner` keeps offline/sync states but loses lease states.
- **`data/tz.ts` (new):** web copy of the Intl helpers (`wallFromMs`, `msFromWall`, `formatWall`, `resolveTz`) with org.tz from `S.settings.org?.tz`, fallback `Australia/Melbourne`. `F.nowIso()` (F.ts:28) and `F.today()` use it so every wall string the web writes is org-tz wall time. Test vectors from contract section 10.
- **`Demo.tsx`:** stripped of `EngineCard`, lease imports and `ClockCard`; remains an orphan page. The demo loader is untouched (**unverified** other referrers; grep `Demo` before deleting any export).

## 7. Recs

`refreshRecs` stays client-side with no lease. It runs on Recs page mount, the Refresh button, and once after hydrate. Rec ids become deterministic via `stableId('rc', key)` (hash of the rec's natural key) so concurrent clients converge instead of creating duplicates. The "Automations paused" banner in `pages/reports/Recs.tsx` is removed.

## 8. System user

`data/conflicts.ts userName(id)` and `Q.user(id)`: for `'system'` return a constant `SYSTEM_USER = { id:'system', name:'SalesOS engine', ... }` (not added to `S.users`, so pickers and counts stay unchanged). Audit, activity feeds, and notification "by" labels render "SalesOS engine" for `createdBy/updatedBy === 'system'`.

## 9. Test plan (Vitest: `npx vitest run`; also `npx tsc -b`, `npx eslint src/sales`, `npm run build`)

### 9.1 Existing tests that must change

| File | Change |
|---|---|
| `engine/lease.test.ts` | delete |
| `data/sync.test.ts` (~236-261) | delete the `runEngineLocked` and LEASE_LOST cases; keep the rest |
| `shell/Banners.test.tsx:9-10` | remove lease-hook mocks; add `ClockBanner` wording test |
| `api/http.test.ts` | keep line 49 case; add `SUPPRESSED` parse |
| `data/plan.test.ts`, `results.test.ts`, `bootstrap.test.ts`, `conflicts.test.ts`, `fieldLabels.test.ts`, `ai/client.test.ts`, `pages/companies/query.test.ts`, `shared/url.test.ts` | expected unchanged; run to confirm |

### 9.2 New tests (write first)

| File | Cases |
|---|---|
| `data/tz.test.ts` | contract vectors T1-T6; run once with `process.env.TZ='America/New_York'` (set before `loadSales()`) to prove independence from the browser tz; `F.nowIso` is org-tz |
| `data/suppression.test.ts` | S1-S6 vectors; `suppressedAddr`; global vs business scope |
| `data/act/mail.test.ts` | `sendEmail`: blocked for contactId/email/email2/cc match, allowed for draft, allowed when `removed`; returns `{ok:false,reason:'suppressed'}` with no records written; Delivery Failure reply creates a suppression (bug 3) with enrolments -> bounced; Unsubscribe reply and `correctClass` produce the same record set via `suppressContact`; `_bounce` hook gone |
| `data/act/markSent.test.ts` | creates thread when missing, message `manual:true`, activity, task Completed with outcome `Sent (manual)`; double call is idempotent; blocked when suppressed; does not change enrolment status; personal mailbox thread is private |
| `data/act/tasks.test.ts` | `completeTask` refuses `kind:'email'`; no longer advances an `awaiting_task` enrolment; Meeting Booked exit retained; `skipEmailTask` cancels with outcome and writes the activity; `stopEmailing` removes the enrolment and cancels the task |
| `data/act/seq.test.ts` | `enrol` writes `nextDue:null`, `status:'active'`, `startedAt` org-tz; resume sets `nextDue` to now |
| `data/engineNudge.test.ts` | coalescing, flush-before-nudge ordering, swallow errors |
| `modals/comms/SendEmailTask.test.tsx` | copy buttons call clipboard with the right text; Mark as sent calls the action; suppressed state disables it; skip/stop need confirmation |
| `pages/admin/Clock.test.tsx` | hidden for non-admin; presets call `Act.advance` and nudge; datetime-local set interprets org-tz (assert resulting offset) |
| `pages/home/MyDay` test (if the page has one; **unverified**) | "Emails to send" card lists only my open email tasks |

Testing helper: `testing/load.ts loadSales()` for module resets; `testing/fixtures.ts` gets `emailTask()`, `suppression()` builders.

## 10. Build order

1. `data/tz.ts` + tests. 2. `Q.suppressed` + all call sites + tests. 3. `suppressContact` + mail.ts changes (bugs 2 and 3) + tests. 4. Email task action functions + tests. 5. `SendEmailTask` modal, `completeFlow`, My Day / Tasks / drawer surfaces. 6. `enrol` null `nextDue`, `completeTask` change. 7. `nudgeEngine`, `api/engine.ts`. 8. Approval UI removals (section 3). 9. Admin Clock page, nav, banners, `Demo.tsx` strip. 10. Delete the browser engine, lease, banners, tests. 11. `npx tsc -b`, `npx eslint src/sales`, `npx vitest run`, `npm run build`.

Do not deploy before the API; deleting the engine before the API engine exists would stop all sequences.

## 11. Risks

- **R1** Zoneless strings now interpreted as org-tz; if a rep created data while on another tz, due times shift.
- **R2** Old tabs during rollout (see 1.3).
- **R3** Recs duplicates until deterministic ids land everywhere.
- **R4** Missed call site on the suppression signature change: TypeScript (`tsc -b`) will flag them because the signature changes from `(ctid, b)` to `(ct, b)`.
- **R5** Mark-as-sent is honour-system: the app cannot verify the rep really sent the email (accepted; real sending is out of scope).
