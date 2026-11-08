export const SPICY = ['正常', '不辣', '微辣', '中辣', '爆辣'] as const
export const SWEET = ['正常', '无糖', '少糖', '较甜'] as const
export const BUDGET_MODES = { per_person: { min: 5, max: 100, step: 5, initial: 30 }, total: { min: 50, max: 300, step: 10, initial: 50 } } as const
export type BudgetMode = keyof typeof BUDGET_MODES
export type BudgetMemory = { mode: BudgetMode, amounts: Record<BudgetMode, string> }
export const defaultBudget = (): BudgetMemory => ({ mode: 'per_person', amounts: { per_person: '30', total: '50' } })
export function validBudget(value: string, mode: BudgetMode) { const c = BUDGET_MODES[mode], n = Number(value); return value === '' || (Number.isFinite(n) && n >= c.min && n <= c.max && (n - c.min) % c.step === 0) }
export function readBudget(stored: unknown): BudgetMemory { const next = defaultBudget(); if (!stored || typeof stored !== 'object') return next; const value = stored as Partial<BudgetMemory>; if (value.mode && value.mode in BUDGET_MODES) next.mode = value.mode; for (const mode of Object.keys(BUDGET_MODES) as BudgetMode[]) { const amount = value.amounts?.[mode]; if (typeof amount === 'string' && validBudget(amount, mode)) next.amounts[mode] = amount } return next }

export {label as hometownLabel,same as sameHometown} from './hometown'

export type Message = { _id: string, createdAt: string, lastActivityAt?: string, replies?:{createdAt:string}[], read?: boolean, userUnread?: boolean, readState?: 'read' | 'unread', status?: string, kind?: string }
export function messageTime(row: Message) { return new Date(row.lastActivityAt || row.replies?.at(-1)?.createdAt || row.createdAt).getTime() || 0 }
export function urgent(row: Message, mode: 'feedback' | 'issues' | 'messages', admin = false) { return mode === 'feedback' ? admin ? row.readState === 'unread' : Boolean(row.userUnread || row.readState === 'unread') : mode === 'issues' ? row.status === 'pending' || !row.read : !row.read }
export function sortMessages(rows: Message[], mode: 'feedback' | 'issues' | 'messages', admin = false) { return [...rows].sort((a,b) => Number(urgent(b, mode, admin)) - Number(urgent(a, mode, admin)) || messageTime(b) - messageTime(a) || a._id.localeCompare(b._id)) }
export function clearable(row:Message,mode:'feedback'|'issues'|'messages',admin=false){return mode==='feedback'?row.kind!=='account_appeal'&&(admin?row.readState==='read':!row.userUnread&&row.readState==='read'):row.read===true&&(mode!=='issues'||row.status==='resolved')}
