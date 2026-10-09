import { Act } from '../../data/Act'
import { Q } from '../../data/Q'
import { S } from '../../data/store'
import type { Contact, Deal } from '../../data/types'
import { Btn, Card, Chip, DataTable, Empty, Sel, type MenuItem, Menu } from '../../kit'
import { UI } from '../../ui/store'

const ROLES = ['Decision Maker', 'Economic Buyer', 'Champion', 'Influencer', 'Technical Evaluator', 'End User', 'Gatekeeper']

export function Stakeholders({ d }: { d: Deal }) {
  const can = Q.canEdit(d.businessId)
  const cts = d.contactIds.map(Q.contact).filter((c): c is Contact => !!c)
  const avail = S.contacts.filter(c => c.companyId === d.companyId && !c.archived && !d.contactIds.includes(c.id))
  const newContact: MenuItem = { label: 'New contact…', icon: 'plus', onClick: () => UI.open('newContact', { companyId: d.companyId, businessId: d.businessId }) }
  const items: MenuItem[] = avail.length
    ? [
        ...avail.map(c => ({
          label: c.name,
          right: c.title,
          onClick: () => {
            Act.updateDeal(d.id, { contactIds: d.contactIds.concat(c.id) })
            UI.toast(c.name + ' added')
          },
        })),
        '-',
        newContact,
      ]
    : [newContact]
  return (
    <Card
      pad={false}
      title="Stakeholders"
      right={can && <Menu align="right" trigger={<Btn size="sm" icon="plus">Add stakeholder</Btn>} items={items} />}
    >
      <DataTable<Contact>
        rows={cts}
        onRow={c => UI.nav('contact', { id: c.id })}
        empty={
          <Empty
            icon="users"
            title="No stakeholders linked"
            body={can ? 'Add the people involved in this buying decision so the deal is not single-threaded.' : 'No contacts have been linked to this deal.'}
          />
        }
        cols={[
          { k: 'name', l: 'Name', r: c => <span className="row"><b>{c.name}</b>{c.id === d.primaryContact && <Chip tone="acc">Primary</Chip>}</span> },
          { k: 'title', l: 'Title' },
          {
            k: 'buyingRole',
            l: 'Buying role',
            r: c =>
              can ? (
                <Sel className="sm" style={{ width: 160 }} aria-label={`Buying role for ${c.name}`} value={c.buyingRole} onChange={v => Act.updateContact(c.id, { buyingRole: v })} onClick={e => e.stopPropagation()} options={ROLES} />
              ) : (
                c.buyingRole
              ),
          },
          { k: 'email', l: 'Email' },
          { k: 's', l: 'Score', r: c => Q.score(c.id, d.businessId).total },
          {
            k: 'a',
            l: '',
            nosort: true,
            r: c =>
              can && (
                <span className="row" style={{ gap: 2 }} onClick={e => e.stopPropagation()}>
                  {c.id !== d.primaryContact && (
                    <Btn size="xs" kind="ghost" onClick={() => Act.updateDeal(d.id, { contactIds: [c.id].concat(d.contactIds.filter(x => x !== c.id)) })}>Make primary</Btn>
                  )}
                  <Btn size="xs" kind="ghost" icon="x" aria-label={`Remove ${c.name}`} onClick={() => Act.updateDeal(d.id, { contactIds: d.contactIds.filter(x => x !== c.id) })} />
                </span>
              ),
          },
        ]}
      />
    </Card>
  )
}
