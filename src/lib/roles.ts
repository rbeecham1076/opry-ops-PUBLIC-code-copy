import type { Task } from './data'

// One plain-English "job" tag per task, so the to-do list can be sorted by the kind of work.
export const ROLES = ['Booking & contracts', 'Money', 'Tickets', 'Marketing', 'Production', 'Hospitality & show day', 'After the show', 'Office', 'Systems & web'] as const
export type Role = typeof ROLES[number]

const BY_SECTION: Record<string, Role> = {
  'Artist & Contract': 'Booking & contracts', Money: 'Money', Tickets: 'Tickets', Marketing: 'Marketing',
  Production: 'Production', Hospitality: 'Hospitality & show day', 'Wrap-up': 'After the show', Admin: 'Office',
}
const BY_CATEGORY: [RegExp, Role][] = [
  [/booking|programming/i, 'Booking & contracts'], [/ticket/i, 'Tickets'], [/marketing|content|creative|crm|audience|sms/i, 'Marketing'],
  [/system|website|digital|integration|reporting/i, 'Systems & web'], [/venue|show & artist/i, 'Production'], [/money|finance|deposit/i, 'Money'],
]

export function roleOf(t: Pick<Task, 'section' | 'category'>): Role {
  if (t.section && BY_SECTION[t.section]) return BY_SECTION[t.section]
  for (const [re, role] of BY_CATEGORY) if (t.category && re.test(t.category)) return role
  return 'Office'
}

// Where a show's own to-dos sit inside its workspace.
export const ROLE_SECTION: Partial<Record<Role, string>> = {
  'Booking & contracts': 'Artist & Contract', Money: 'Money', Tickets: 'Tickets', Marketing: 'Marketing',
  Production: 'Production', 'Hospitality & show day': 'Hospitality', 'After the show': 'Wrap-up',
}
