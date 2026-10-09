import type { BusinessId } from '../data/types'

/** Sector playbooks used by the deterministic research and insight helpers (no customer data). */
export interface LibBase { off: string[]; st: string[]; ch: string[] }
export interface LibFamily { ch?: string[]; off?: string[]; st?: string[]; angle?: string }
export interface LibEntry { base: LibBase; fam: Record<string, LibFamily> }

export type Family = 'retail' | 'hosp' | 'edu' | 'cons' | 'mfg' | 'dist' | 'svc'

export function familyOf(industry: string): Family {
  if (/Retail|Supermarket/.test(industry)) return 'retail'
  if (/Hospitality/.test(industry)) return 'hosp'
  if (/Education|Career/.test(industry)) return 'edu'
  if (/Construction/.test(industry)) return 'cons'
  if (/Manufacturing/.test(industry)) return 'mfg'
  if (/Logistics|Distribution/.test(industry)) return 'dist'
  return 'svc'
}

export const LIB: Record<BusinessId, LibEntry> = {
  ard: {
    base: {
      off: ['Operational platform tailored to existing systems', 'Business process automation', 'Systems integration', 'AI strategy and implementation'],
      st: ['Chief Operating Officer', 'Chief Technology / Information Officer', 'Head of Digital', 'Head of Operations'],
      ch: ['Fragmented tools across sites and head office', 'Manual reporting and compliance processes', 'Integration gaps between core systems'],
    },
    fam: {
      retail: {
        ch: ['Store task execution and compliance visibility across locations', 'Employee communications to frontline teams without corporate email', 'Onboarding seasonal staff quickly and consistently', 'Head office and store data in separate systems'],
        off: ['Employee operations platform (tasks, comms, onboarding, compliance)', 'Store operations dashboards', 'ERP / POS integration', 'AI-assisted store operations'],
        angle: 'Lead with store execution and frontline communications; position a phased platform that integrates with existing ERP and identity systems.',
      },
      dist: {
        ch: ['Paper or spreadsheet warehouse workflows', 'Limited real-time visibility of orders and exceptions', 'Disconnected ERP and warehouse tools'],
        off: ['Workflow automation', 'Systems integration', 'Operational dashboards'],
        angle: 'Focus on workflow automation and integration between ERP and operational tools; propose a scoped first workflow.',
      },
      cons: {
        ch: ['Site reporting and safety documentation', 'Project information spread across tools', 'Subcontractor coordination'],
        off: ['Project operations platform', 'Document and compliance workflows', 'Systems integration'],
        angle: 'Start from site reporting and compliance workflows that tie back to project systems.',
      },
    },
  },
  ros: {
    base: {
      off: ['Multi-location rostering', 'Timesheets and payroll export', 'Labour cost visibility', 'Employee self-service and shift swaps'],
      st: ['Operations Manager', 'Payroll Manager', 'HR Manager', 'COO / Owner'],
      ch: ['Manual roster building across locations', 'Last-minute shift cover', 'Payroll reconciliation effort'],
    },
    fam: {
      retail: {
        ch: ['Rostering across many stores with varying trading hours', 'Award interpretation and penalty rates', 'Store manager time spent on rosters', 'Payroll exceptions from manual timesheets'],
        off: ['Multi-location scheduling', 'Store-level labour budgets', 'Timesheet-to-payroll export'],
        angle: 'Lead with store manager time and labour cost visibility across sites; confirm payroll system and award complexity early.',
      },
      hosp: {
        ch: ['Frequent shift swaps and casual staff availability', 'Venue-by-venue labour cost control', 'Award compliance for weekend and late shifts', 'Payroll clean-up each pay cycle'],
        off: ['Venue rostering with availability', 'Shift swap approvals', 'Labour cost by venue', 'Payroll export'],
        angle: 'Lead with shift swaps and venue labour cost; offer a two-venue trial with real rosters.',
      },
      svc: {
        ch: ['Scheduling mobile or multi-site staff', 'Qualification and ratio requirements', 'Timesheet accuracy'],
        off: ['Multi-site scheduling', 'Qualification-aware rostering', 'Timesheets'],
        angle: 'Emphasise multi-site scheduling and qualification-aware rosters.',
      },
    },
  },
  pth: {
    base: {
      off: ['Interactive career simulations', 'Career exploration pathways', 'Cohort reporting for careers staff', 'Pilot program'],
      st: ['Head of Careers', 'Careers Counsellor', 'Principal / Deputy Principal', 'Director of Learning'],
      ch: ['Students struggle to picture real careers before subject selection', 'Limited careers staff time per student', 'Hard to evidence careers program outcomes'],
    },
    fam: {
      edu: { angle: 'Lead with practical career exploration before subject selection; propose a single-cohort pilot with simple teacher reporting.' },
    },
  },
  adv: {
    base: {
      off: ['Confidential employee feedback', 'Wellbeing resources and programs', 'HR support workflows', 'Aggregated, anonymous workforce insights'],
      st: ['Head of HR / People & Culture', 'Wellbeing Manager', 'COO', 'IT / Security lead (review)'],
      ch: ['Low uptake of existing EAP', 'No safe channel for employees to raise concerns', 'Limited visibility of wellbeing trends'],
    },
    fam: {
      cons: {
        ch: ['Site-based workers with limited access to HR channels', 'Psychosocial safety obligations', 'Low EAP uptake among field staff', 'Confidentiality concerns in small crews'],
        angle: 'Lead with confidential support for site workers and psychosocial safety; expect a security and HR review.',
      },
      mfg: {
        ch: ['Shift workers without desk access', 'Fatigue and wellbeing across shifts', 'Engagement in plant teams'],
        angle: 'Focus on mobile-first access for shift workers and anonymous feedback.',
      },
      svc: {
        ch: ['Burnout and workload in professional teams', 'Confidential feedback channels', 'Retention'],
        angle: 'Focus on confidential feedback and wellbeing insights for retention.',
      },
    },
  },
}

export interface Playbook { off: string[]; st: string[]; ch: string[]; angle?: string }

/** Base playbook for the business overlaid with the sector family, as the prototype merged them. */
export function playbook(b: BusinessId, fam: Family): Playbook {
  const L = LIB[b]
  const f = L.fam[fam] ?? {}
  return { off: f.off ?? L.base.off, st: f.st ?? L.base.st, ch: f.ch ?? L.base.ch, angle: f.angle }
}
