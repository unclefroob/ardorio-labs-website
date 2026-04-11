import type { Handler } from '@netlify/functions'
import sgMail from '@sendgrid/mail'

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' }
  }

  const apiKey = process.env.SENDGRID_API_KEY
  const toEmail = process.env.SENDGRID_TO_EMAIL

  if (!apiKey || !toEmail) {
    console.error('Missing SENDGRID_API_KEY or SENDGRID_TO_EMAIL env vars')
    return { statusCode: 500, body: JSON.stringify({ error: 'Server misconfiguration' }) }
  }

  let body: Record<string, string>
  try {
    body = JSON.parse(event.body || '{}')
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) }
  }

  const { name, email, company, message, type } = body

  if (!name?.trim() || !email?.trim() || !message?.trim()) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing required fields' }) }
  }

  sgMail.setApiKey(apiKey)

  const inquiryLabels: Record<string, string> = {
    enterprise: 'Enterprise technology',
    ai: 'AI engineering',
    startup: 'Startup partnership',
    other: 'Something else',
  }

  const msg = {
    to: toEmail,
    from: { name: 'Ardorio Website', email: toEmail },
    replyTo: { name, email },
    subject: `New enquiry from ${name}${company ? ` at ${company}` : ''}`,
    text: [
      `Name: ${name}`,
      `Email: ${email}`,
      company ? `Company: ${company}` : '',
      type ? `Inquiry type: ${inquiryLabels[type] ?? type}` : '',
      '',
      message,
    ]
      .filter(Boolean)
      .join('\n'),
    html: `
      <table style="font-family:sans-serif;font-size:14px;color:#1c1917;max-width:560px">
        <tr><td style="padding-bottom:24px">
          <strong style="font-size:18px">New enquiry from ${name}</strong>
        </td></tr>
        <tr><td style="padding-bottom:8px"><strong>Name:</strong> ${name}</td></tr>
        <tr><td style="padding-bottom:8px"><strong>Email:</strong> <a href="mailto:${email}">${email}</a></td></tr>
        ${company ? `<tr><td style="padding-bottom:8px"><strong>Company:</strong> ${company}</td></tr>` : ''}
        ${type ? `<tr><td style="padding-bottom:8px"><strong>Inquiry type:</strong> ${inquiryLabels[type] ?? type}</td></tr>` : ''}
        <tr><td style="padding-top:16px;border-top:1px solid #e7e5e4">
          <p style="white-space:pre-wrap;margin:0">${message.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>
        </td></tr>
      </table>
    `,
  }

  try {
    await sgMail.send(msg)
    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true }),
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('SendGrid error:', message)
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to send email' }),
    }
  }
}
