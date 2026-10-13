import { Act } from '../../data/Act'
import { Q } from '../../data/Q'
import { S } from '../../data/store'
import type { BusinessId, Goal } from '../../data/types'
import { Banner, Btn, Fld, Inp, Modal, Sel, Seg } from '../../kit'
import { ACTIVITY_METRICS, GOAL_METRIC_LABEL, GOAL_PERIODS, isMoneyMetric, isReportMetric, MONEY_METRICS, targetFromCents, targetToInput } from '../../shared/goalMetrics'
import { parseCents } from '../../shared/money'
import { useF } from '../../shared/useF'
import { UI } from '../../ui/store'

/** What each money metric measures, under the Metric field. */
const METRIC_HINT: Record<string, string> = {
  won_value: 'Won value counts contracted amounts on the day a deal is won: deals won in the period by this salesperson or team. A deal with no contract recorded counts its deal value.',
  invoiced_cents: 'Business-wide: every Ardorio invoice by issue date, whoever owns the deal. The salesperson or team is not used. Void and test invoices are left out.',
  collected_cents: 'Business-wide: every Ardorio payment by paid date, whoever owns the deal. The salesperson or team is not used. Void and test invoices are left out.',
}

/** The metrics this business offers: activity and won value everywhere; invoiced and collected for Ardorio, to its admins (or super). */
function metricOptions(businessId: string, current?: string): (readonly [string, string])[] {
  const keys = [...Object.keys(ACTIVITY_METRICS), 'won_value']
  if (businessId === 'ard' && Q.canBill()) keys.push('invoiced_cents', 'collected_cents')
  // Editing a goal keeps its metric on the list, so the select never shows something it is not.
  if (current && !keys.includes(current) && MONEY_METRICS[current]) keys.push(current)
  return keys.map(k => [k, GOAL_METRIC_LABEL[k] ?? k] as const)
}

interface Props { id?: string; period?: Goal['period']; ownerType?: Goal['ownerType'] }
interface Form { businessId: BusinessId | ''; ownerType: Goal['ownerType']; ownerId: string; metric: string; target: string; period: Goal['period'] }

export function GoalModal({ id, period, ownerType }: Props) {
  const g = id ? S.goals.find(x => x.id === id) : undefined
  const bz = Q.myBiz().filter(b => Q.canManage(b))
  const [f, set] = useF<Form>(g
    ? { businessId: g.businessId, ownerType: g.ownerType, ownerId: g.ownerId, metric: g.metric, target: targetToInput(g.metric, g.target), period: g.period }
    : { businessId: bz[0] ?? '', ownerType: ownerType ?? 'user', ownerId: '', metric: 'calls', target: '20', period: period ?? 'week' })
  const owners = f.ownerType === 'team'
    ? S.teams.filter(t => t.businessId === f.businessId).map(t => [t.id, t.name] as const)
    : Q.sellersIn(f.businessId).map(u => [u.id, u.name] as const)
  const money = isMoneyMetric(f.metric)
  const cents = money ? parseCents(f.target) : null
  const target = money ? (cents === null ? NaN : targetFromCents(f.metric, cents)) : Number(f.target)
  const bad = !f.businessId || !f.ownerId || !(target > 0)
  const metrics = metricOptions(f.businessId, g?.metric)

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
        <Fld label="Business"><Sel value={f.businessId} onChange={v => set({ businessId: v as BusinessId, ownerId: '', ...(isReportMetric(f.metric) && v !== 'ard' ? { metric: 'calls' } : {}) })} options={bz.map(b => [b, Q.biz(b)?.name ?? b] as const)} /></Fld>
        <Fld label="For"><Seg value={f.ownerType} onChange={v => set({ ownerType: v as Goal['ownerType'], ownerId: '' })} opts={[['user', 'Individual'], ['team', 'Team']]} /></Fld>
        <Fld label={f.ownerType === 'team' ? 'Team' : 'Salesperson'} style={{ gridColumn: '1/-1' }} hint={owners.length ? undefined : f.ownerType === 'team' ? 'This business has no teams yet. Create one in Users & teams.' : 'This business has no active salespeople.'}>
          <Sel value={f.ownerId} onChange={v => set('ownerId', v)} placeholder="Select…" options={owners} />
        </Fld>
        <Fld label="Metric" hint={METRIC_HINT[f.metric]} style={money ? { gridColumn: '1/-1' } : undefined}><Sel value={f.metric} onChange={v => set('metric', v)} options={metrics} /></Fld>
        <Fld label="Period"><Sel value={f.period} onChange={v => set('period', v as Goal['period'])} options={GOAL_PERIODS} /></Fld>
        {money
          ? <Fld label="Target (A$, ex GST)"><Inp className="money" value={f.target} onChange={v => set('target', v)} inputMode="decimal" /></Fld>
          : <Fld label="Target"><Inp value={f.target} onChange={v => set('target', v)} inputMode="numeric" /></Fld>}
      </div>
    </Modal>
  )
}
