import { Card, Empty } from '../../kit'

export function InvoicesDenied() {
  return (
    <div className="page">
      <Card pad={false}>
        <Empty icon="lock" title="Invoices are for Ardorio admins" body="You can see customers and deals, but invoices and billing details are limited to admins of the Ardorio business. Ask an admin if you need access." />
      </Card>
    </div>
  )
}
