import type { CommissionStatus } from '@/types'

export interface SeedCommission {
  id:           string
  client:       string
  project:      string
  project_type: string
  value:        number
  deposit:      number | null
  deadline:     string   // YYYY-MM-DD
  status:       CommissionStatus
  notes:        string | null
}

export const SEED_COMMISSIONS: SeedCommission[] = [
  {
    id:           'c01',
    client:       'Mint Street',
    project:      'Portrait pack',
    project_type: 'Illustration',
    value:        675,
    deposit:      200,
    deadline:     '2026-04-28',
    status:       'Paid',
    notes:        null,
  },
  {
    id:           'c02',
    client:       'Aurum House',
    project:      'Brand illustration',
    project_type: 'Branding',
    value:        2400,
    deposit:      800,
    deadline:     '2026-05-04',
    status:       'Completed',
    notes:        'Awaiting final approval before payment',
  },
  {
    id:           'c03',
    client:       'Lumen Studio',
    project:      'Icon set',
    project_type: 'UI / Icons',
    value:        480,
    deposit:      null,
    deadline:     '2026-05-20',
    status:       'In Progress',
    notes:        null,
  },
  {
    id:           'c04',
    client:       'Marble & Co',
    project:      'Event poster',
    project_type: 'Print',
    value:        320,
    deposit:      null,
    deadline:     '2026-06-01',
    status:       'Pending',
    notes:        null,
  },
  {
    id:           'c05',
    client:       'Dusk Collective',
    project:      'Album artwork',
    project_type: 'Illustration',
    value:        950,
    deposit:      300,
    deadline:     '2026-06-15',
    status:       'Approved',
    notes:        'Rush job — priority',
  },
]

// Status transition map
export const NEXT_STATUS: Partial<Record<CommissionStatus, CommissionStatus>> = {
  Pending:     'Approved',
  Approved:    'In Progress',
  'In Progress': 'Completed',
  Completed:   'Paid',
}

export const STATUS_LABEL: Partial<Record<CommissionStatus, string>> = {
  Pending:     'Approve',
  Approved:    'Start',
  'In Progress': 'Complete',
  Completed:   'Mark Paid →',
}

export const STATUS_COLORS: Record<CommissionStatus, string> = {
  Pending:     'text-gold     bg-gold/10     border-gold/20',
  Approved:    'text-emerald  bg-emerald/10  border-emerald/20',
  'In Progress': 'text-blue-400 bg-blue-400/10 border-blue-400/20',
  Completed:   'text-purple-400 bg-purple-400/10 border-purple-400/20',
  Paid:        'text-emerald  bg-emerald/10  border-emerald/20',
}

// 0–1 progress per status (visual only)
export const STATUS_PROGRESS: Record<CommissionStatus, number> = {
  Pending:     0,
  Approved:    0.15,
  'In Progress': 0.5,
  Completed:   0.85,
  Paid:        1,
}
