import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Dices, RotateCw, Ticket, ArrowLeft } from 'lucide-react'
import type { Category, FoodItem } from '../types'
import { AREAS, areaName, SPICY_PREF_LABEL, STAPLE_PREF_LABEL } from '../data/campus'
import {
  defaultFilters,
  drawOne,
  emptySuggestions,
  estimateTotal,
  priceBasisLabel,
  rankItems,
  type FoodFilters,
  type MatchResult,
} from '../lib/match'
import { repo } from '../lib/repo'
import { useProfile } from '../lib/profile'
import { Chip, cn, EmptyState, FoodImage, Notice, Spinner, Stamp } from '../components/ui'
import { BudgetControl } from '../components/FiltersSheet'
import { profileTags } from '../lib/taste'

type Phase = 'setup' | 'flipping' | 'result' | 'empty'

const CATEGORY_OPTIONS: Array<{ value: Category | 'any'; label: string }> = [
  { value: 'any', label: '不挑' },
  { value: 'meal', label: '正餐' },
  { value: 'snack', label: '小吃' },
  { value: 'drink', label: '饮品' },
]

export function BlindBoxPage() {
  const navigate = useNavigate()
  const { profile } = useProfile()

  const [items, setItems] = useState<FoodItem[] | null>(null)
  const [phase, setPhase] = useState<Phase>('setup')
  const [filters, setFilters] = useState<FoodFilters>(() => ({
    ...defaultFilters(profile.campusId),
    budget: { basis: 'per_person', amount: profile.quickBudget ?? 20, people: 1 },
  }))
  const [people, setPeople] = useState(1)
  const [result, setResult] = useState<MatchResult | null>(null)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [candidateCount, setCandidateCount] = useState(0)
  const timer = useRef<number | null>(null)

  useEffect(() => {
    let alive = true
    repo.listItems().then((list) => alive && setItems(list))
    return () => {
      alive = false
      if (timer.current) window.clearTimeout(timer.current)
    }
  }, [])

  useEffect(() => {
    setFilters((f) => (f.campusId === profile.campusId ? f : { ...f, campusId: profile.campusId }))
  }, [profile.campusId])

  const effective = useMemo<FoodFilters>(
    () => ({ ...filters, budget: { ...filters.budget, people }, query: '' }),
    [filters, people],
  )

  const candidates = useMemo(
    () => (items ? rankItems(items, effective, profile) : []),
    [items, effective, profile],
  )

  const startDraw = () => {
    if (!items) return
    const pool = rankItems(items, effective, profile)
    setCandidateCount(pool.length)
    if (pool.length === 0) {
      setSuggestions(emptySuggestions(items, effective))
      setPhase('empty')
      return
    }
    const picked = drawOne(pool, result?.item.id)
    if (!picked) return
    setResult(picked)
    setPhase('flipping')
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setPhase('result'), 750)
  }

  const toggleArea = (id: string) =>
    setFilters((f) => ({
      ...f,
      areaIds: f.areaIds.includes(id) ? f.areaIds.filter((x) => x !== id) : [...f.areaIds, id],
    }))

  const cat = (filters.categories.length === 1 ? filters.categories[0] : 'any') as Category | 'any'

  return (
    <div className="page">
      <div className="topbar" style={{ position: 'static', padding: '8px 0 6px' }}>
        <span className="topbar__title">开盲盒 · 今天吃点啥</span>
        <span className="stamp stamp--blue">随机不编造</span>
      </div>

      <Notice tone="yellow">
        盲盒只从<b>当前符合条件的真实候选</b>里等概率抽取；候选为空就直接告诉你，绝不编店。物理摇手机本轮未做，点击即抽。
      </Notice>

      {/* 票的舞台 */}
      <div className="blindbox-stage">
        <div className={cn('ticket-flip', (phase === 'result' || phase === 'flipping') && 'ticket-flip--flipped')}>
          <div className="ticket-flip__inner">
            {/* 正面：待翻的饭票 */}
            <div className="ticket-flip__face ticket-back-cover">
              <div className="ticket-back-cover__holes">
                {Array.from({ length: 6 }).map((_, i) => (
                  <i key={i} />
                ))}
              </div>
              <div className="ticket-back-cover__holes ticket-back-cover__holes--r">
                {Array.from({ length: 6 }).map((_, i) => (
                  <i key={i} />
                ))}
              </div>
              <div className={cn('ticket-back-cover__big', phase === 'flipping' && 'shaking')}>
                <Ticket size={72} strokeWidth={1.4} />
              </div>
              <div className="ticket-back-cover__text">饭 票</div>
              <div className="ticket-back-cover__sub">云大饭搭子 · 呈贡校区专用</div>
              <div className="ticket-back-cover__sub">候选 {candidateCount || candidates.length} 张</div>
            </div>

            {/* 背面：抽中的结果 */}
            <div className="ticket-flip__face ticket-flip__back">
              {result && (
                <>
                  <div className="flip-result__img">
                    <FoodImage
                      src={result.item.image}
                      alt={result.item.name}
                      fallbackChar={result.item.name.slice(0, 1)}
                      category={result.item.category}
                    />
                    {result.item.source === 'sample' && (
                      <Stamp corner className="stamp-pop">
                        示例
                      </Stamp>
                    )}
                  </div>
                  <div className="flip-result__body">
                    <div className="flip-result__name">{result.item.name}</div>
                    <div className="tiny muted">
                      {result.item.venue} · {areaName(result.item.areaId)}
                    </div>
                    {result.reasons.length > 0 && (
                      <div className="ticket__reason">{result.reasons.join(' · ')}</div>
                    )}
                    <PriceMath item={result.item} people={people} budget={effective.budget} compact />
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 动作区 */}
      {items === null ? (
        <Spinner />
      ) : phase === 'result' && result ? (
        <div className="stack mt-16">
          <div className="btn-row">
            <button type="button" className="btn" onClick={startDraw}>
              <RotateCw size={16} /> 再抽一次{candidates.length > 1 ? `（还有 ${candidates.length - 1} 个）` : ''}
            </button>
            <button
              type="button"
              className="btn btn--blue"
              onClick={() => navigate(`/item/${result.item.id}`)}
            >
              看详情 <ArrowRight size={16} />
            </button>
          </div>
          <button type="button" className="btn btn--ghost btn--block" onClick={() => setPhase('setup')}>
            换一批条件
          </button>
        </div>
      ) : phase === 'empty' ? (
        <div className="stack mt-16">
          <EmptyState art="🎫" title="这一批条件里没有候选">
            盲盒不会硬给你编一个。按下面调一调：
          </EmptyState>
          <div className="info-card">
            {suggestions.map((s, i) => (
              <div key={i} className="kv-list__row">
                <span className="kv-list__k">建议{i + 1}</span>
                <span className="kv-list__v">{s}</span>
              </div>
            ))}
          </div>
          <button type="button" className="btn btn--blue btn--block" onClick={() => setPhase('setup')}>
            回去调条件
          </button>
        </div>
      ) : (
        <div className="stack-lg mt-16">
          {/* 条件区 */}
          <div className="info-card stack-lg">
            <div className="field">
              <label className="field__label">几个人吃？</label>
              <div className="row-between">
                <span className="tiny muted">用于估价：单份按每人一份、人均按店内人均 × 人数</span>
                <div className="stepper">
                  <button type="button" aria-label="减一人" onClick={() => setPeople((p) => Math.max(1, p - 1))}>
                    −
                  </button>
                  <span className="stepper__value">
                    {people}
                    <span className="stepper__unit"> 人</span>
                  </span>
                  <button type="button" aria-label="加一人" onClick={() => setPeople((p) => Math.min(12, p + 1))}>
                    +
                  </button>
                </div>
              </div>
            </div>

            <div className="field">
              <label className="field__label">抽哪类？</label>
              <div className="chips-row" style={{ flexWrap: 'wrap', overflow: 'visible' }}>
                {CATEGORY_OPTIONS.map((c) => (
                  <Chip
                    key={c.value}
                    active={cat === c.value}
                    onClick={() =>
                      setFilters((f) => ({
                        ...f,
                        categories: c.value === 'any' ? [] : [c.value as Category],
                      }))
                    }
                  >
                    {c.label}
                  </Chip>
                ))}
              </div>
            </div>

            <div className="field">
              <label className="field__label">区域（不选=全部）</label>
              <div className="chips-row" style={{ flexWrap: 'wrap', overflow: 'visible' }}>
                {AREAS.map((a) => (
                  <Chip key={a.id} active={filters.areaIds.includes(a.id)} onClick={() => toggleArea(a.id)}>
                    {a.name}
                  </Chip>
                ))}
              </div>
            </div>

            <div className="field">
              <label className="field__label">预算口径与金额</label>
              <BudgetControl
                budget={effective.budget}
                showPeople={false}
                onChange={(b) => setFilters((f) => ({ ...f, budget: b }))}
              />
            </div>

            <div className="field">
              <label className="field__label">口味条件</label>
              <div className="switch-row">
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13.5 }}>完全不要辣</div>
                  <div className="tiny faint">开启后只从不辣候选里抽</div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={filters.noSpicy}
                  className={cn('switch', filters.noSpicy && 'switch--on')}
                  onClick={() => setFilters((f) => ({ ...f, noSpicy: !f.noSpicy }))}
                />
              </div>
              <div className="switch-row">
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13.5 }}>家乡味线索</div>
                  <div className="tiny faint">
                    {profile.hometown
                      ? `当前线索：${profileTags(profile).find((t) => t.includes('同乡')) ?? profile.hometown}；开启后只抽同风味`
                      : '你还没填家乡，可在“我的 → 修改口味”里补，不填也能抽'}
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={filters.hometownOnly}
                  className={cn('switch', filters.hometownOnly && 'switch--on')}
                  onClick={() => setFilters((f) => ({ ...f, hometownOnly: !f.hometownOnly }))}
                />
              </div>
              <p className="tiny muted">
                排序偏好沿用你的口味画像：辣度
                {SPICY_PREF_LABEL[profile.spicy]} · {STAPLE_PREF_LABEL[profile.staple]}
                ；盲盒在合格候选内随机，偏好只决定结果页的“为什么是它”。
              </p>
            </div>
          </div>

          <div className="row-between">
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => navigate('/me')}
            >
              <ArrowLeft size={15} /> 改我的口味
            </button>
            <span className="tiny faint">当前候选 {candidates.length} 个</span>
          </div>

          <button type="button" className="btn btn--red btn--lg btn--block" onClick={startDraw} disabled={!items}>
            <Dices size={20} /> 开！给我抽一张饭票
          </button>
        </div>
      )}
    </div>
  )
}

export function PriceMath({
  item,
  people,
  budget,
  compact,
}: {
  item: FoodItem
  people: number
  budget: FoodFilters['budget']
  compact?: boolean
}) {
  const total = estimateTotal(item, people)
  const withinBudget =
    budget.amount == null
      ? null
      : budget.basis === 'per_person'
        ? item.price <= budget.amount
        : total <= budget.amount

  return (
    <div className={cn('math-board', compact && 'mt-8')}>
      <div className="math-board__row">
        <span>
          {priceBasisLabel(item)}（每人）
        </span>
        <span className="price" style={{ color: 'var(--ink)' }}>
          <span className="price__sym">¥</span>
          <span className="price__num" style={{ fontSize: 18 }}>{item.price}</span>
        </span>
      </div>
      <div className="math-board__row">
        <span>{people} 人估价 = ¥{item.price} × {people}</span>
        <span>约 ¥{total}</span>
      </div>
      {budget.amount != null && (
        <div className="math-board__row">
          <span>你的{budget.basis === 'per_person' ? '人均' : `${people} 人总额`}预算</span>
          <span style={{ color: withinBudget ? 'var(--green)' : 'var(--red-deep)', fontWeight: 700 }}>
            ¥{budget.amount} · {withinBudget ? '在预算内' : '超预算'}
          </span>
        </div>
      )}
      <div className="math-board__note">
        算法明示：单份价格按“每人一份”估价，人均价格按店内人均 × 人数；结果为估算，实际以现场价为准。
      </div>
    </div>
  )
}
