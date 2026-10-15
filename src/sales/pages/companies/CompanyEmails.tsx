import { F } from '../../data/F'
import { Q } from '../../data/Q'
import { S } from '../../data/store'
import type { Company } from '../../data/types'
import { BizChip, Card, Chip, Empty, Icon } from '../../kit'
import { UI } from '../../ui/store'

/** Every email conversation with this company you can see, newest first. A private one shows only to its owner, as in the Inbox. */
export function CompanyEmails({ c }: { c: Company }) {
  const rows = S.threads.filter(t => t.companyId === c.id && !t.archived).sort((a, b) => F.ms(b.updatedAt) - F.ms(a.updatedAt))
  if (!rows.length) return <Card><Empty icon="mail" title="No emails with this company yet" body="Mail to and from its contacts shows here once a mailbox is connected." /></Card>
  return (
    <Card pad={false} title="Emails">
      <div className="col" style={{ gap: 0 }}>
        {rows.map(t => (
          <button key={t.id} type="button" className="ni" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 8, padding: '10px 14px', borderBottom: '1px solid var(--line)', textAlign: 'left', width: '100%', borderRadius: 0 }} onClick={() => UI.nav('inbox', { id: t.id })}>
            <span style={{ minWidth: 0 }}>
              <span className="row" style={{ gap: 6 }}>
                <b className="sm trunc">{t.subject}</b>
                {t.relation === 'customer' && <Chip tone="ok">Customer account</Chip>}
                {t.dealId && Q.deal(t.dealId) && <Chip>{Q.deal(t.dealId)?.name}</Chip>}
                {t.needsReply && <Chip tone="warn">Needs reply</Chip>}
                {t.visibility === 'private' && <Icon n="lock" s={12} />}
              </span>
              <span className="faint xs">{Q.contact(t.contactId)?.name ?? ''}{t.contactId ? ' · ' : ''}{Q.mailbox(t.mailboxId)?.address ?? ''}</span>
            </span>
            <span className="row xs faint" style={{ gap: 6 }}><BizChip b={t.businessId} />{F.rel(t.updatedAt)}</span>
          </button>
        ))}
      </div>
    </Card>
  )
}
