# Feature Brief: SalesOS Phase 2 (no email): server sequence engine

Branch: feature/sales-engine in both worktrees (cut from feature/sales-os, already merged into Staging):
- API: /home/ryan/dev/ardorio-labs-api-sales-os
- Web: /home/ryan/dev/ardorio-labs-website-sales-os
Never touch /home/ryan/dev/ardorio-labs-api or /home/ryan/dev/ardorio-labs-website. Do not commit, push or merge; the coordinator does that.

## Ruling
Real email (Gmail send/receive, inbound sync, classification on real mail, unsubscribe/footer compliance) is OUT of scope and is its own later phase. Keep the adapter seam so it can be added without changing the engine.

## Goals
1. Fix engine correctness bugs found in audit (with tests, test-first):
   - engine.ts:30 passes e.mailboxId instead of mbId to senderOf (tokens can pick the wrong sender).
   - Manual compose (act/mail.ts sendEmail) does not check suppression; email2 not covered.
   - Delivery Failure reply path (classification) creates no suppression, unlike bounce().
   - Bounce and unsubscribe paths differ; unify behind one suppression helper.
2. Move the sequence engine to the server (API), simulated sends only.
   - A scheduler in the API process (node-cron or setInterval, started in src/index.ts next to the weekly report job) runs ticks; multi-instance safe by taking the existing per-business SalesEngineLease under a server id (e.g. `server:<instanceId>`), renewing it, releasing on shutdown.
   - Port the pure logic of engine/engine.ts + data/internals.ts (exec, tick, runEngine, schedule, advance, sentToday, bounce, branch conditions, task wake/overdue, meeting reminders, resume paused) to TypeScript under src/services/sales/engine/ taking explicit (state, now, clock) arguments, not global singletons.
   - Writes go through applyBatch (records.ts) in-process as a system actor so revisions/CAS/DUPLICATE_SEND still apply. Define the system actor (name e.g. "SalesOS engine") and how updatedBy/actorId/notification names resolve for it.
   - Schedules are computed in the org timezone (settings org.tz, default Australia/Melbourne) using Intl, DST-safe; zoneless existing nextDue strings are interpreted in that zone. Remove reliance on browser-local Date.
   - The browser engine (engine/engine.ts tick, engine/lease.ts, runEngineLocked in sync) is DELETED on the web side, not left dormant, so there is exactly one engine. Old tabs on a previous build will get LEASE_LOST; confirm that is handled.
   - Clock: real time + settings/clock.offsetMinutes. Bring back an admin-only control (small page or section under Administration; the Demo page stays removed) to set/reset the offset, with the existing visible banner when non-zero. The offset only moves simulated timing (there is no live mail).
3. Email steps become "send this email" tasks (user decision, recommended by coordinator).
   - When a server-run sequence reaches an email step, instead of writing a fake `sent` message it creates a task (kind email) holding the rendered draft: to, subject, body (tokens merged), mailbox/sender, thread/enrolment/step ids. Unresolved {{tokens}} behaviour stays (pause).
   - The rep opens the task, sees the draft with copy buttons (subject, body, to), sends it themselves, then clicks "Mark as sent": that creates the `sent` message + email_out activity (flagged as manually sent) and advances the enrolment. Skip / "not sending" path must exist (enrolment advance or removal, architect to decide).
   - Approval mode becomes moot (the rep reviewing the draft is the approval). Architect decides the minimal change and states it; daily cap (`dailyLimit`, `sentToday`) must still mean something (counts email tasks created or marked sent; decide and justify).
   - Suppression, no-email/Bounced, unresolved-token and wait/branch semantics are preserved.

## Out of scope
Gmail/OAuth/inbound/classification on real mail, unsubscribe links, Wiza, typed rewrite, new Staging deploys (coordinator handles).

## Test commands
API (/home/ryan/dev/ardorio-labs-api-sales-os): `npm test`, `npm run build`. Jest + mongodb-memory-server; TDD, new tests must fail before the change.
Web (/home/ryan/dev/ardorio-labs-website-sales-os): `npx tsc -b`, `npx eslint src/sales`, `npx vitest run`, `npm run build`.

## Existing state (from audits; verify before relying)
- Client engine: src/sales/engine/engine.ts (exec 17-138, runEngine 143-155, tick 158-192), data/internals.ts (schedule 76-99, threadFor 101, advance 120, sentToday 139, bounce 143, sendMsg 169), engine/lease.ts, data/sync.ts runEngineLocked (~260), clock data/clock.ts.
- API: services/sales/lease.ts (acquireLeases 79, releaseLeases 93), records.ts applyBatch(caller: MemberCtx, req) ~517, assertLease ~479, DUPLICATE_SEND index in models/sales/SalesRecord.ts, classifyRules.ts, ai/*.
- Reply outcomes today: src/sales/data/act/mail.ts 245-301 (simulateReply) — Unsubscribe, Out of Office, Delivery Failure, replied; classification and rules stay as they are.
- Only engine test today is engine/lease.test.ts with tick mocked. exec/schedule/advance/sendMsg/simulateReply have no tests.
- D10 (browser engine + lease) is superseded by this work. D9 clock stays real time + offset.
