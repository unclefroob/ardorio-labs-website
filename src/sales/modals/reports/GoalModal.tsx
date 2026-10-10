import { Act } from '../../data/Act'
import { Q } from '../../data/Q'
import { S } from '../../data/store'
import type { BusinessId, Goal } from '../../data/types'
import { Banner, Btn, Fld, Inp, Modal, Sel, Seg } from '../../kit'
import { useF } from '../../shared/useF'
import { UI } from '../../ui/store'
import { METRIC_LABEL } from '../../pages/reports/Goals'

interface Props { id?: string; period?: Goal['period']; ownerType?: Goal['ownerType'] }
interface Form { businessId: BusinessId | ''; ownerType: Goal['ownerType']; ownerId: string; metric: string; target: string; period: Goal['period'] }

export function GoalModal({ id, period, ownerType }: Props) {
  const g = id ? S.goals.find(x => x.id === id) : undefined
  const bz = Q.myBiz().filter(b => Q.canManage(b))
  const [f, set] = useF<Form>(g
    ? { businessId: g.businessId, ownerType: g.ownerType, ownerId: g.ownerId, metric: g.metric, target: String(g.target), period: g.period }
    : { businessId: bz[0] ?? '', ownerType: ownerType ?? 'user', ownerId: '', metric: 'calls', target: '20', period: period ?? 'week' })
  const owners = f.ownerType === 'team'
    ? S.teams.filter(t => t.businessId === f.businessId).map(t => [t.id, t.name] as const)
    : Q.sellersIn(f.businessId).map(u => [u.id, u.name] as const)
  const target = Number(f.target)
  const bad = !f.businessId || !f.ownerId || !(target > 0)

  if (!bz.length || (id && !g)) {
    return (
      <Modal title="Set goal" icon="target" width={480} footer={<Btn onClick={UI.close}>Close</Btn>}>
        <Banner tone={id ? 'bad' : 'warn'}>{id ? 'This goal no longer exists.' : 'Only managers and admins can set goals. Ask a manager of your business.'}</Banner>
      </Modal>
    )
  }
  const save = (): void => {
    if (bad || !f.businessId) {
      UI.toast('Choose an owner and a positive target', 'bad')
      return
    }
    Act.saveGoal({ id: g?.id, businessId: f.businessId, ownerType: f.ownerType, ownerId: f.ownerId, metric: f.metric, target, period: f.period })
    UI.close()
    UI.toast('Goal saved')
  }
  return (
    <Modal
      title={g ? 'Edit goal' : 'Set goal'}
      icon="target"
      width={480}
      footer={
        <>
          <Btn onClick={UI.close}>Cancel</Btn>
          <Btn kind="pri" onClick={save}>Save</Btn>
        </>
      }
    >
      <div className="grid g2">
        <Fld label="Business"><Sel value={f.businessId} onChange={v => set({ businessId: v as BusinessId, ownerId: '' })} options={bz.map(b => [b, Q.biz(b)?.name ?? b] as const)} /></Fld>
        <Fld label="For"><Seg value={f.ownerType} onChange={v => set({ ownerType: v as Goal['ownerType'], ownerId: '' })} opts={[['user', 'Individual'], ['team', 'Team']]} /></Fld>
        <Fld label={f.ownerType === 'team' ? 'Team' : 'Salesperson'} style={{ gridColumn: '1/-1' }} hint={owners.length ? undefined : f.ownerType === 'team' ? 'This business has no teams yet. Create one in Users & teams.' : 'This business has no active salespeople.'}>
          <Sel value={f.ownerId} onChange={v => set('ownerId', v)} placeholder="Select…" options={owners} />
        </Fld>
        <Fld label="Metric"><Sel value={f.metric} onChange={v => set('metric', v)} options={Object.entries(METRIC_LABEL)} /></Fld>
        <Fld label="Period"><Sel value={f.period} onChange={v => set('period', v as Goal['period'])} options={[['day', 'Daily'], ['week', 'Weekly'], ['month', 'Monthly']]} /></Fld>
        <Fld label="Target"><Inp value={f.target} onChange={v => set('target', v)} inputMode="numeric" /></Fld>
      </div>
    </Modal>
  )
}
