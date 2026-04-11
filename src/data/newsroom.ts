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
