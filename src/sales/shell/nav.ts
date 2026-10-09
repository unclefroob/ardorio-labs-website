export interface NavItem {
  page: string
  label: string
  icon: string
  /** Hidden unless the viewer is an admin of at least one business. */
  admin?: boolean
}
export interface NavGroup {
  group: string
  items: NavItem[]
}

export const NAV: NavGroup[] = [
  { group: 'Overview', items: [
    { page: 'dashboard', label: 'Dashboard', icon: 'home' },
    { page: 'myday', label: 'My Day', icon: 'sun' },
  ] },
  { group: 'Prospecting', items: [
    { page: 'prospecting', label: 'Prospecting', icon: 'search' },
    { page: 'companies', label: 'Companies', icon: 'building' },
    { page: 'contacts', label: 'Contacts', icon: 'user' },
    { page: 'lists', label: 'Lead Lists', icon: 'list' },
  ] },
  { group: 'Sales Engagement', items: [
    { page: 'sequences', label: 'Sequences', icon: 'send' },
    { page: 'inbox', label: 'Inbox', icon: 'inbox' },
    { page: 'activities', label: 'Activities', icon: 'activity' },
    { page: 'tasks', label: 'Tasks', icon: 'checksq' },
  ] },
  { group: 'Revenue', items: [
    { page: 'deals', label: 'Deals & Pipeline', icon: 'kanban' },
    { page: 'reports', label: 'Reports', icon: 'chart' },
    { page: 'goals', label: 'Sales Goals', icon: 'target' },
  ] },
  { group: 'Intelligence', items: [
    { page: 'copilot', label: 'AI Copilot', icon: 'spark' },
    { page: 'recs', label: 'Recommendations', icon: 'bulb' },
  ] },
  { group: 'Administration', items: [
    { page: 'settings', label: 'Settings', icon: 'settings' },
    { page: 'users', label: 'Users & Teams', icon: 'users', admin: true },
    { page: 'integrations', label: 'Integrations', icon: 'plug' },
    { page: 'templates', label: 'Templates', icon: 'file' },
    { page: 'pipelines', label: 'Pipeline Configuration', icon: 'sliders', admin: true },
    { page: 'clock', label: 'Clock', icon: 'clock', admin: true },
  ] },
]

export const ADMIN_PAGES: readonly string[] = NAV.flatMap(g => g.items).filter(i => i.admin).map(i => i.page)
