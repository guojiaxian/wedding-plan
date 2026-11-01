// ===== 数据类型 =====
export interface Settings {
  id: number
  groom_name: string
  bride_name: string
  wedding_date: string
  venue: string
  total_budget: number
}

export interface BudgetCategory {
  id: number
  name: string
  budget: number
  sort: number
  spent?: number
}

export interface ItemCategory {
  id: number
  key: string
  name: string
  icon: string
  sort: number
}

export interface Expense {
  id: number
  category_id: number | null
  name: string
  amount: number
  date: string
  note: string
}

export interface Item {
  id: number
  category: string          // bride / groom / ceremony / favor / other
  name: string
  budget_category_id: number | null
  estimated_price: number
  actual_price: number | null
  purchased: number         // 0/1
  channel: string
  note: string
  sort: number
}

export interface Task {
  id: number
  title: string
  phase: string             // m12/m9/m6/m3/m1/w1
  due_date: string
  status: 'todo' | 'doing' | 'done'
  assignee: string
  note: string
  sort: number
}

export interface TimelineEvent {
  id: number
  time: string
  title: string
  duration: string
  location: string
  owner: string
  note: string
  sort: number
}

export interface Staff {
  id: number
  name: string
  role: string
  phone: string
  duty: string
  event_title: string
}

export interface Guest {
  id: number
  name: string
  side: 'groom' | 'bride' | 'common'
  grp: string
  relationship: string
  phone: string
  rsvp: 'pending' | 'yes' | 'no'
  count: number
  table_no: string
  gift: number | null
  note: string
}

export interface Decoration {
  id: number
  area: string              // sign/ceremony/banquet/photo/home
  name: string
  done: number
  source: string
  note: string
  sort: number
}

export interface Summary {
  budget: {
    totalBudget: number
    totalSpent: number
    categories: BudgetCategory[]
  }
  tasks: { total: number; todo: number; doing: number; done: number }
  items: { total: number; purchased: number; estimatedTotal: number; actualTotal: number }
  guests: { total: number; pending: number; yes: number; no: number; confirmedHeads: number; invitedHeads: number; giftTotal: number }
  decorations: { total: number; done: number }
  upcoming: Task[]
}
