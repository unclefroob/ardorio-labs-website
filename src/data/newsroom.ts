export type NewsCategory = 'Partnership' | 'New Work' | 'Company'

export interface NewsItem {
  slug: string
  date: string           // ISO date string, e.g. "2026-03-18"
  category: NewsCategory
  title: string
  excerpt: string
  body: string           // markdown-ish HTML string rendered via dangerouslySetInnerHTML
}

export const news: NewsItem[] = [
  {
    slug: 'ardorio-partners-with-pathiq',
    date: '2026-01-14',
    category: 'Partnership',
    title: 'Ardorio partners with PathIQ to launch Australia\'s career navigation platform',
    excerpt:
      'We joined forces with the PathIQ team from day one — shaping product strategy, building the full-stack platform, and shipping the AI recommendation engine that sits at the core of their product.',
    body: `
<p>PathIQ is a career navigation platform built to help professionals move through career transitions with more clarity and confidence. The founders came to Ardorio with a sharp idea and deep domain expertise — and needed a technical co-builder who could own the full product.</p>

<p>We joined the team at the beginning: shaped the product architecture, built the full-stack application, designed the user flows, and shipped the AI-powered recommendation engine powered by Claude. From first commit to launch, we moved fast without cutting corners.</p>

<p>PathIQ is now live at <a href="https://pathiq.com.au" target="_blank" rel="noopener noreferrer">pathiq.com.au</a> — serving professionals across Australia, New Zealand, and the UK.</p>

<h3>What we built</h3>
<ul>
  <li>Product strategy and architecture from scratch</li>
  <li>Full-stack Next.js application with TypeScript</li>
  <li>AI career recommendation engine (Claude API)</li>
  <li>12 career archetypes and structured assessment flows</li>
  <li>UX and interface design end to end</li>
  <li>Go-to-market support and launch readiness</li>
</ul>

<p>This partnership is a model for how Ardorio works with founders — deeply embedded, technically responsible, and committed through to launch.</p>
    `.trim(),
  },
  {
    slug: 'rosterio-launch',
    date: '2026-04-10',
    category: 'Company',
    title: 'Introducing Rosterio — our in-house rostering tool, now available to everyone',
    excerpt:
      'Rosterio started as an internal tool we built to manage our own team scheduling. When more than one client asked for the same thing, we knew it was worth building properly — so we did.',
    body: `
<p>Rosterio is a staff rostering and scheduling tool built by Ardorio for Ardorio. We created it to solve a real problem we were living ourselves — keeping track of who was working on what, when, and across which projects.</p>

<p>It worked well enough internally that clients started asking about it. Not once, but repeatedly. That's usually a signal worth listening to.</p>

<p>So we took what we'd built, stripped out the bespoke edges, and rebuilt it as a product that any team can use — from small agencies to multi-site operators who need a simple, fast way to manage their roster without the bloat of enterprise workforce software.</p>

<h3>What Rosterio does</h3>
<ul>
  <li>Drag-and-drop shift scheduling across days, weeks, and roles</li>
  <li>Staff availability and leave management</li>
  <li>Real-time updates — changes propagate instantly across the team</li>
  <li>Role-based access — managers set the roster, staff see their shifts</li>
  <li>Export-ready for payroll and reporting</li>
</ul>

<p>This is what happens when you build for yourself first and the market second — you end up with something that actually solves the problem, because you couldn't afford for it not to.</p>

<p>Rosterio is now available as a standalone product. If your team is still running rosters in spreadsheets or chasing confirmations over text, it's worth a look.</p>
    `.trim(),
  },
  {
    slug: 'clevedon-ai-task-platform-launch',
    date: '2026-02-28',
    category: 'New Work',
    title: 'We built Clevedon — an AI task breakdown platform for teams',
    excerpt:
      'Clevedon turns any brief into a structured, role-specific plan. We built the product end to end: full-stack Next.js, AI breakdown engine, team collaboration, and a three-tier subscription model.',
    body: `
<p>Clevedon is an AI-powered task breakdown platform that transforms any brief — a Jira ticket, a client scope, an unclear instruction — into a structured, role-specific plan that teams can actually start on.</p>

<p>We built the product entirely in-house with the Clevedon founders, from the first product conversation through to production deployment.</p>

<h3>What we built</h3>
<ul>
  <li>Full-stack Next.js application with TypeScript</li>
  <li>AI breakdown engine built on Claude — domain-aware, role-specific output</li>
  <li>Team collaboration and task distribution features</li>
  <li>Usage metering and a three-tier monetisation model (Free, Pro, Team)</li>
  <li>Subscription and billing infrastructure</li>
</ul>

<p>The AI layer is built to behave like a knowledgeable colleague — using domain vocabulary specific to the user's profession, learning from their history, and reasoning across a team when distributing work.</p>

<p>Clevedon is live at <a href="https://clevedon.app" target="_blank" rel="noopener noreferrer">clevedon.app</a>.</p>
    `.trim(),
  },
]

export function getNewsItem(slug: string): NewsItem | undefined {
  return news.find((item) => item.slug === slug)
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}
