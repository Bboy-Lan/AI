import { ChevronDown, Minus, Plus } from 'lucide-react'
import type { FoodFilters } from '../lib/match'
import { AREAS, QUICK_BUDGETS_PER_PERSON, QUICK_BUDGETS_TOTAL } from '../data/campus'
import { allAreaIds, isAreaFilterActive } from '../lib/match'
import type { Category } from '../types'
import { Chip, Seg, cn } from './ui'

export function BudgetControl({
  budget,
  onChange,
  showPeople = true,
}: {
  budget: FoodFilters['budget']
  onChange: (next: FoodFilters['budget']) => void
  showPeople?: boolean
}) {
  const quick = budget.basis === 'per_person' ? QUICK_BUDGETS_PER_PERSON : QUICK_BUDGETS_TOTAL
  const people = Math.max(1, budget.people || 1)

  return (
    <div className="stack" style={{ gap: 10 }}>
      <Seg
        value={budget.basis}
        onChange={(basis) => onChange({ ...budget, basis, amount: null })}
        options={[
          { value: 'per_person', label: '按人均' },
          { value: 'total', label: '按一桌总额' },
        ]}
      />

      {budget.basis === 'total' && showPeople && (
        <div className="row-between">
          <span className="tiny muted">人数（总额按人数折算每人预算）</span>
          <div className="stepper" aria-label="人数">
            <button
              type="button"
              onClick={() => onChange({ ...budget, people: Math.max(1, people - 1) })}
              aria-label="减少一人"
            >
              <Minus size={15} />
            </button>
            <span className="stepper__value">
              {people}
              <span className="stepper__unit"> 人</span>
            </span>
            <button
              type="button"
              onClick={() => onChange({ ...budget, people: Math.min(12, people + 1) })}
              aria-label="增加一人"
            >
              <Plus size={15} />
            </button>
          </div>
        </div>
      )}

      <div className="chips-row" style={{ flexWrap: 'wrap', overflow: 'visible' }}>
        <Chip yellow active={budget.amount === null} onClick={() => onChange({ ...budget, amount: null })}>
          不限
        </Chip>
        {quick.map((b) => (
          <Chip key={b} yellow active={budget.amount === b} onClick={() => onChange({ ...budget, amount: b })}>
            ¥{b}
          </Chip>
        ))}
        <label
          className={cn('chip', (budget.amount ?? 0) > 0 && !quick.includes(budget.amount as number) && 'chip--on')}
          style={{ gap: 4 }}
        >
          ¥
          <input
            type="number"
            inputMode="numeric"
            min={1}
            placeholder="其他"
            value={
              budget.amount != null && !quick.includes(budget.amount) ? String(budget.amount) : ''
            }
            onChange={(e) => {
              const v = e.target.value
              onChange({ ...budget, amount: v === '' ? null : Math.max(0, Number(v)) })
            }}
            style={{ width: 56, border: 0, outline: 0, background: 'transparent', font: 'inherit', color: 'inherit' }}
          />
        </label>
      </div>

      <p className="tiny faint">
        口径说明：标“人均”的店按店内人均算；标“单份”的粉面/小吃按每人一份估算。总额 = 每人价格 × 人数，属于估价，不是精确 AA。
      </p>
    </div>
  )
}

/** 折叠地点选择器：默认全选，展开后可逐项多选，避免地点列表挤占小屏。 */
export function AreaMultiSelect({
  areaIds,
  onChange,
  label = '区域 / 地点',
}: {
  areaIds: string[]
  onChange: (next: string[]) => void
  label?: string
}) {
  const allSelected = !isAreaFilterActive(areaIds)
  // 兼容早期版本留下的空数组：它过去表示“不限”，现在也按全选显示和操作。
  const selected = new Set(allSelected ? allAreaIds() : areaIds)
  const selectedCount = allSelected ? AREAS.length : selected.size

  const toggle = (id: string) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onChange([...next])
  }

  return (
    <details className="area-picker">
      <summary>
        <span>{label}</span>
        <span className="area-picker__summary">
          {allSelected ? '默认全选' : `已选 ${selectedCount}/${AREAS.length}`} <ChevronDown size={16} />
        </span>
      </summary>
      <div className="area-picker__body">
        <div className="row-between">
          <span className="tiny faint">可多选；不限定地点时显示全部内容</span>
          <button type="button" className="btn btn--ghost area-picker__all" onClick={() => onChange(allAreaIds())}>
            全选
          </button>
        </div>
        <div className="option-grid">
          {AREAS.map((area) => (
            <Chip key={area.id} active={allSelected || selected.has(area.id)} onClick={() => toggle(area.id)}>
              {area.name}
            </Chip>
          ))}
        </div>
      </div>
    </details>
  )
}

export function FiltersSheetContent({
  draft,
  setDraft,
}: {
  draft: FoodFilters
  setDraft: (next: FoodFilters) => void
}) {
  const toggleArray = <T,>(arr: T[], v: T): T[] =>
    arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]

  const categories: Array<{ value: Category; label: string }> = [
    { value: 'meal', label: '正餐' },
    { value: 'snack', label: '小吃' },
    { value: 'drink', label: '饮品' },
  ]

  return (
    <div className="stack-lg">
      <AreaMultiSelect areaIds={draft.areaIds} onChange={(areaIds) => setDraft({ ...draft, areaIds })} />

      <div className="field">
        <label className="field__label">类别（可多选）</label>
        <div className="option-grid">
          {categories.map((c) => (
            <Chip
              key={c.value}
              active={draft.categories.includes(c.value)}
              onClick={() => setDraft({ ...draft, categories: toggleArray(draft.categories, c.value) })}
            >
              {c.label}
            </Chip>
          ))}
        </div>
      </div>

      <div className="field">
        <label className="field__label">预算</label>
        <BudgetControl budget={draft.budget} onChange={(b) => setDraft({ ...draft, budget: b })} />
      </div>

      <div className="switch-row">
        <div>
          <div style={{ fontWeight: 700, fontSize: 13.5 }}>完全不要辣</div>
          <div className="tiny faint">硬条件：直接排除所有辣度 ≥ 微辣 的内容</div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={draft.noSpicy}
          className={cn('switch', draft.noSpicy && 'switch--on')}
          onClick={() => setDraft({ ...draft, noSpicy: !draft.noSpicy })}
          aria-label="完全不要辣"
        />
      </div>

      <div className="switch-row">
        <div>
          <div style={{ fontWeight: 700, fontSize: 13.5 }}>只看同乡投稿</div>
          <div className="tiny faint">默认关闭：同乡投稿会轻微优先；开启后只保留同乡投稿</div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={draft.hometownOnly}
          className={cn('switch', draft.hometownOnly && 'switch--on')}
          onClick={() => setDraft({ ...draft, hometownOnly: !draft.hometownOnly })}
          aria-label="只看同乡投稿"
        />
      </div>
    </div>
  )
}
