import { useEffect, useMemo, useState } from 'react'
import { MapPin, Search, SlidersHorizontal, X, Ticket, Plus } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import type { Category, FoodItem } from '../types'
import { CAMPUSES, campusName } from '../data/campus'
import { defaultFilters, rankItems, type FoodFilters } from '../lib/match'
import { repo } from '../lib/repo'
import { useProfile } from '../lib/profile'
import { useFavorites } from '../lib/useFavorites'
import { HERO_IMAGE } from '../lib/images'
import { FoodCard } from '../components/FoodCard'
import { FiltersSheetContent } from '../components/FiltersSheet'
import { Chip, EmptyState, FoodImage, Notice, Sheet, Spinner } from '../components/ui'

const CATEGORY_TABS: Array<{ value: Category | 'all'; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'meal', label: '正餐' },
  { value: 'snack', label: '小吃' },
  { value: 'drink', label: '饮品' },
]

export function DiscoverPage() {
  const navigate = useNavigate()
  const { profile, updateProfile } = useProfile()
  const favorites = useFavorites()

  const [items, setItems] = useState<FoodItem[] | null>(null)
  const [filters, setFilters] = useState<FoodFilters>(() => ({
    ...defaultFilters(profile.campusId),
    budget: {
      basis: 'per_person' as const,
      amount: profile.quickBudget,
      people: 1,
    },
  }))
  const [query, setQuery] = useState('')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [draft, setDraft] = useState<FoodFilters>(filters)

  useEffect(() => {
    let alive = true
    repo.listItems().then((list) => {
      if (alive) setItems(list)
    })
    return () => {
      alive = false
    }
  }, [])

  // 校区跟随“我的口味/首访”设置
  useEffect(() => {
    setFilters((f) => (f.campusId === profile.campusId ? f : { ...f, campusId: profile.campusId }))
  }, [profile.campusId])

  const effective = useMemo(() => ({ ...filters, query }), [filters, query])
  const results = useMemo(
    () => (items ? rankItems(items, effective, profile) : []),
    [items, effective, profile],
  )

  const campusHasContent = CAMPUSES.find((c) => c.id === filters.campusId)?.hasContent ?? false
  const activeFilterCount =
    filters.areaIds.length +
    filters.categories.length +
    (filters.budget.amount != null ? 1 : 0) +
    (filters.noSpicy ? 1 : 0) +
    (filters.hometownOnly ? 1 : 0)

  const tab = (filters.categories.length === 1 ? filters.categories[0] : 'all') as Category | 'all'

  return (
    <div className="page">
      {/* 品牌首屏 */}
      <section className="hero" aria-label="云大饭搭子">
        <FoodImage
          src={HERO_IMAGE}
          alt="云大学生平价美食"
          fallbackChar="饭"
          category="meal"
          className="hero__img"
        />
        <div className="hero__inner">
          <div className="hero__brand">
            <span className="hero__brand-mark">
              <Ticket size={19} />
            </span>
            云大饭搭子
          </div>
          <div className="hero__slogan">
            今天<em>吃点啥</em>？
          </div>
          <div className="hero__meta">
            <span className="hero__chip">
              <MapPin size={11} style={{ display: 'inline', marginRight: 3 }} />
              {CAMPUSES.find((c) => c.id === filters.campusId)?.short ?? '云大呈贡'}
            </span>
            <span className="hero__chip">同学推荐 · 无广告</span>
          </div>
        </div>
      </section>

      {/* 校区切换 */}
      <div className="row-between" style={{ marginBottom: 10 }}>
        <select
          className="select-input"
          style={{ width: 'auto', flex: 1, padding: '8px 10px', fontSize: 13 }}
          value={filters.campusId}
          onChange={(e) => {
            const id = e.target.value
            setFilters((f) => ({ ...f, campusId: id }))
            updateProfile({ campusId: id })
          }}
          aria-label="切换校区"
        >
          {CAMPUSES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <Chip
          active={filters.hometownOnly}
          onClick={() => setFilters((f) => ({ ...f, hometownOnly: !f.hometownOnly }))}
        >
          家乡味{filters.hometownOnly ? '优先中' : '线索'}
        </Chip>
      </div>

      {/* 搜索 */}
      <div className="searchbar">
        <Search size={17} color="var(--ink-faint)" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜菜名、口味、店或窗口，比如 米线 / 不辣 / 炸洋芋"
          aria-label="搜索吃喝"
        />
        {query && (
          <button type="button" onClick={() => setQuery('')} aria-label="清空搜索">
            <X size={16} color="var(--ink-faint)" />
          </button>
        )}
      </div>

      {/* 类别 */}
      <div className="chips-row" style={{ paddingTop: 10 }}>
        {CATEGORY_TABS.map((t) => (
          <Chip
            key={t.value}
            active={tab === t.value}
            onClick={() =>
              setFilters((f) => ({
                ...f,
                categories: t.value === 'all' ? [] : [t.value as Category],
              }))
            }
          >
            {t.label}
          </Chip>
        ))}
        <Chip yellow onClick={() => { setDraft(filters); setSheetOpen(true) }}>
          <SlidersHorizontal size={14} />
          筛选{activeFilterCount > 0 ? ` ${activeFilterCount}` : ''}
        </Chip>
      </div>

      {/* 结果 */}
      {!items ? (
        <Spinner />
      ) : !campusHasContent && results.length === 0 ? (
        <div className="mt-16">
          <EmptyState
            art="🚏"
            title={`${campusName(filters.campusId)}还没有内容`}
            action={
              <button
                type="button"
                className="btn btn--red"
                onClick={() => navigate('/publish')}
              >
                <Plus size={16} /> 当第一个投稿人
              </button>
            }
          >
            我们不会用其他校区的内容假装已覆盖。先切回云大呈贡逛示例，或者发布你身边的第一份吃喝。
          </EmptyState>
        </div>
      ) : results.length === 0 ? (
        <div className="mt-16">
          <EmptyState art="🍜" title="没有符合这些条件的饭票">
            试试放宽预算、区域或辣度。
          </EmptyState>
          <div className="mt-12">
            <button
              type="button"
              className="btn btn--soft btn--block"
              onClick={() => {
                setQuery('')
                setFilters(defaultFilters(filters.campusId))
              }}
            >
              清空全部条件
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="result-count">
            共 {results.length} 张饭票 · {profile.skipped ? '未启用口味画像，按条件排序' : '按你的口味匹配排序'}
          </div>
          {profile.skipped && (
            <Notice tone="blue">
              你是“先逛逛”模式，口味都设成了不限。去“我的 → 修改我的口味”设置后，这里会给出具体匹配理由。
            </Notice>
          )}
          <div className="stack mt-12">
            {results.map((r, i) => (
              <FoodCard
                key={r.item.id}
                result={r}
                index={i}
                fav={favorites.has(r.item.id)}
                onToggleFav={favorites.toggle}
              />
            ))}
          </div>
        </>
      )}

      <Sheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="筛选条件"
      >
        <FiltersSheetContent draft={draft} setDraft={setDraft} />
        <div className="btn-row mt-20">
          <button
            type="button"
            className="btn"
            onClick={() => setDraft(defaultFilters(filters.campusId))}
          >
            重置
          </button>
          <button
            type="button"
            className="btn btn--blue"
            onClick={() => {
              setFilters(draft)
              setSheetOpen(false)
            }}
          >
            看结果
          </button>
        </div>
      </Sheet>
    </div>
  )
}
