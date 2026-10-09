import type { FC } from 'react'
import { Q } from '../../../data/Q'
import type { Task } from '../../../data/types'
import { BizDot, Chip, DataTable, Due, Empty, Icon, Owner, TONE, type Col } from '../../../kit'
import { completeFlow } from '../../../shared/moves'
import { UI } from '../../../ui/store'

export interface TaskTableProps { rows: Task[]; showAssignee?: boolean }

const WEIGHT: Record<string, number> = { High: 3, Medium: 2, Low: 1 }

export const TaskTable: FC<TaskTableProps> = ({ rows, showAssignee = true }) => {
  const cols: Array<Col<Task> | false> = [
    {
      k: 'd', l: '', nosort: true, w: 30,
      r: t => Q.done(t)
        ? <Icon n="check" s={14} style={{ color: 'var(--ok)' }} />
        : <button type="button" className="btn xs icon" title={t.kind === 'email' ? 'Open email' : 'Complete'} aria-label={(t.kind === 'email' ? 'Open email: ' : 'Complete task: ') + t.title} disabled={!Q.canEdit(t.businessId)} onClick={e => { e.stopPropagation(); completeFlow(t) }} style={{ width: 20, height: 20, borderRadius: 10 }} />,
    },
    {
      k: 'title', l: 'Task',
      r: t => (
        <div style={{ opacity: Q.done(t) ? 0.55 : 1 }}>
          <div className="row" style={{ gap: 6 }}>
            <BizDot b={t.businessId} s={6} />
            {t.kind === 'email' && <Icon n="mail" s={12} />}
            <span className="trunc" style={{ maxWidth: 340, textDecoration: t.status === 'Completed' ? 'line-through' : undefined }}>{t.title}</span>
          </div>
          <div className="faint xs">{t.type}{t.companyId ? ' · ' + (Q.company(t.companyId)?.name ?? '') : ''}{t.seqId ? ' · sequence' : ''}</div>
        </div>
      ),
    },
    { k: 'priority', l: 'Priority', r: t => <Chip tone={TONE[t.priority]}>{t.priority}</Chip>, sort: t => WEIGHT[t.priority] ?? 0 },
    { k: 'due', l: 'Due', r: t => <Due t={t} /> },
    !!showAssignee && { k: 'a', l: 'Assigned', r: t => <Owner id={t.assigneeId} />, sort: t => Q.user(t.assigneeId)?.name },
    { k: 'status', l: 'Status', r: t => <Chip tone={t.status === 'Completed' ? 'ok' : t.status === 'In Progress' ? 'info' : ''}>{t.status}</Chip> },
  ]
  return (
    <DataTable
      rows={rows}
      onRow={t => UI.drawer('task', { id: t.id })}
      empty={<Empty icon="checksq" title="No tasks" body="Tasks linked to this record will appear here." />}
      cols={cols.filter((c): c is Col<Task> => !!c)}
    />
  )
}
