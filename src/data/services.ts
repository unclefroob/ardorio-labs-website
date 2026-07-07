import {
  Search,
  ClipboardCheck,
  Blocks,
  Users,
  GraduationCap,
  ShieldCheck,
  Sprout,
  PenTool,
  Zap,
  FlaskConical,
  Rocket,
  BookOpen,
  Network,
  Bot,
  FileStack,
  Gauge,
  type LucideIcon,
} from 'lucide-react'

export interface ServiceStep {
  title: string
  body: string
  icon: LucideIcon
}

export interface ServiceCapability {
  name: string
  description: string
  icon: LucideIcon
}

export interface Service {
  slug: string
  title: string
  tagline: string // short summary for the listing card
  bestFit: string
  description: string
  offerings: string[]
  steps: ServiceStep[]
  capabilities?: ServiceCapability[]
}

export const services: Service[] = [
  {
    slug: 'applied-ai',
    title: 'Find the gap, build the fix',
    tagline:
      'We work out where AI and technology create real leverage in your business, then build the product that captures it.',
    bestFit: 'Established businesses that know AI matters but not yet where it pays off',
    description:
      "Most organisations don't have an AI problem, they have an adoption problem. We come in, work out where AI and better technology actually create leverage, and build the thing that captures it. We build what we recommend, so you end up with a working system in production rather than a strategy deck that sits on a shelf.",
    offerings: [
      'Opportunity and gap assessments',
      'Custom AI features (RAG, agents, LLM integration)',
      'Full-stack products and internal tooling',
      'Workflow automation and integration',
      'Legacy and infrastructure modernisation',
      'Governance, guardrails and responsible use',
    ],
    steps: [
      {
        title: 'Find the gaps',
        icon: Search,
        body: 'We come in for a small, focused engagement and work alongside your team to find the process optimisations worth pursuing. And if you already know what you need, we can skip ahead and go straight to the plan.',
      },
      {
        title: 'Agree the plan',
        icon: ClipboardCheck,
        body: "We turn what we find into a plan with measurable outcomes. You decide whether to go ahead, and the plan is vendor-neutral, so it stays commercially viable with anyone, not just us.",
      },
      {
        title: 'Build and integrate',
        icon: Blocks,
        body: 'We build the product and handle the integrations. Start low-cost upfront on a monthly model, or we build the IP for you at a fixed price.',
      },
      {
        title: 'Enable your team',
        icon: Users,
        body: "We train and enable your team to run it day to day. This is our AI Training & Enablement work built into the handover, so the capability stays in-house after we're gone.",
      },
    ],
    capabilities: [
      {
        name: 'LLM-Wiki',
        icon: BookOpen,
        description: 'A searchable, cited knowledge base your team can ask in plain language.',
      },
      {
        name: 'Algorithmic search',
        icon: Search,
        description: 'Semantic and vector search that surfaces the right answer across your data, not just keyword matches.',
      },
      {
        name: 'RAG pipelines',
        icon: Network,
        description: 'Answers grounded in your own documents and systems, with citations back to the source.',
      },
      {
        name: 'AI agents',
        icon: Bot,
        description: 'Agents that take multi-step actions across your tools, inside clear guardrails.',
      },
      {
        name: 'Document ingestion',
        icon: FileStack,
        description: 'Turn PDFs, emails and messy files into structured, queryable data.',
      },
      {
        name: 'Evaluation engines',
        icon: Gauge,
        description: 'Score open-ended work consistently against your own rubric.',
      },
    ],
  },
  {
    slug: 'training',
    title: 'AI Training & Enablement',
    tagline:
      "We upskill your team on AI that's genuinely useful in day-to-day work, and set the guardrails to use it safely.",
    bestFit: 'Teams rolling AI out and unsure where to start',
    description:
      "Most teams don't need another AI talking point, they need to use it well in real work. We train your people directly, with hands-on workshops, practical prompting and workflow design, and the responsible-use guardrails that keep it safe. It's also how much of our build work starts, because once a team sees what's possible, the gaps worth fixing become obvious.",
    offerings: [
      'AI literacy and hands-on training',
      'Team workshops and enablement',
      'Prompting and workflow design',
      'Tool selection and rollout',
      'Responsible-use policy and guardrails',
      'Executive and board advisory',
    ],
    steps: [
      {
        title: 'Assess',
        icon: Search,
        body: 'We look at how your team works today and where AI could genuinely help, so the training targets real tasks rather than generic demos.',
      },
      {
        title: 'Train hands-on',
        icon: GraduationCap,
        body: 'We run practical workshops on the tools and workflows your team actually uses, with prompting and workflow design built around your work.',
      },
      {
        title: 'Set the guardrails',
        icon: ShieldCheck,
        body: 'We put responsible-use policy and guardrails in place so your people can move quickly without creating risk.',
      },
      {
        title: 'Embed it',
        icon: Sprout,
        body: 'We check back in and help the new habits stick. This is often where the gaps worth building surface.',
      },
    ],
  },
  {
    slug: 'mvp',
    title: 'Zero to MVP',
    tagline:
      'We build POCs and MVPs for founders fast, enough real product to test the idea, launch, and raise or sell against.',
    bestFit: 'Founders with strong domain insight and no time to build a team',
    description:
      'Founders come to us with sharp domain insight and no time to build a team. We build the POC or MVP fast, enough real product to put in front of users, test the idea, and raise or sell against. Product strategy, full-stack build, AI features, and the push to launch.',
    offerings: [
      'Rapid POC and MVP builds',
      'Product strategy and validation',
      'Full-stack development',
      'AI-powered product features',
      'UX and interface design',
      'Launch and go-to-market support',
    ],
    steps: [
      {
        title: 'Shape it',
        icon: PenTool,
        body: 'We sharpen the idea into a scope you can actually ship, focused on the riskiest assumptions first.',
      },
      {
        title: 'Build fast',
        icon: Zap,
        body: 'We build the POC or MVP quickly, full-stack and with the AI features that matter, enough real product to put in front of users.',
      },
      {
        title: 'Test and learn',
        icon: FlaskConical,
        body: 'We get it in front of real users, measure what happens, and iterate on what the evidence tells us.',
      },
      {
        title: 'Launch',
        icon: Rocket,
        body: "We push it to launch and set you up to keep going, whether that's raising, selling, or scaling.",
      },
    ],
  },
]

export function getService(slug: string): Service | undefined {
  return services.find((s) => s.slug === slug)
}
