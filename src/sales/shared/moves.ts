import { Act } from '../data/Act'
import { F } from '../data/F'
import { Q } from '../data/Q'
import type { Task } from '../data/types'
import { UI } from '../ui/store'

export function doMove(dealId: string, stageId: string): void {
  const d = Q.deal(dealId)
  if (!d) return
  const sug = Act.moveStage(dealId, stageId)
  const st = Q.stage(d)
  if (!st) return
  const action = sug
    ? {
        label: 'Add task: ' + sug.split(' ').slice(0, 3).join(' ') + '…',
        fn: () => {
          Act.createTask({
            title: sug + ' — ' + d.title,
            type: 'Follow-up',
            businessId: d.businessId,
            assigneeId: d.ownerId,
            due: F.addDays(F.today() + 'T10:00', 1),
            dealId: d.id,
            companyId: d.companyId,
            contactId: d.primaryContact,
            source: 'Stage-change suggestion',
          })
          UI.toast('Task created')
        },
      }
    : undefined
  UI.toast(d.title + ' → ' + st.name + ' (' + st.prob + '%)', 'ok', action)
}

export function tryMove(dealId: string, stageId: string): void {
  const d = Q.deal(dealId)
  if (!d || !UI.guard(d.businessId, 'Changing deal stage')) return
  const st = Q.pipeline(d.businessId).stages.find(s => s.id === stageId)
  if (!st || d.stageId === stageId) return
  if (d.status !== 'open') {
    UI.confirm({
      title: 'Reopen deal?',
      body: 'This deal is closed. Reopen it and move to ' + st.name + '?',
      confirm: 'Reopen',
      onConfirm: () => {
        Act.reopenDeal(dealId)
        if (!st.won && !st.lost) Act.moveStage(dealId, stageId)
      },
    })
    return
  }
  if (st.won) return UI.open('won', { id: dealId })
  if (st.lost) return UI.open('lost', { id: dealId })
  const miss = Q.missingFor(d, st)
  if (miss.length) return UI.open('stageCheck', { id: dealId, stageId, missing: miss })
  doMove(dealId, stageId)
}

export function completeFlow(t: Task): void {
  if (!UI.guard(t.businessId, 'Completing tasks')) return
  if (t.type === 'Call') return UI.open('callOutcome', { taskId: t.id })
  if (t.type === 'LinkedIn Activity') return UI.open('linkedin', { contactId: t.contactId, taskId: t.id, businessId: t.businessId })
  Act.completeTask(t.id, {})
  UI.toast('Task completed', undefined, {
    label: 'Create follow-up',
    fn: () => UI.open('newTask', { businessId: t.businessId, companyId: t.companyId || '', contactId: t.contactId || '', dealId: t.dealId || '', title: 'Follow up: ' + t.title }),
  })
}
