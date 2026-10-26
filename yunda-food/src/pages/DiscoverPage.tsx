import { useEffect, useMemo, useState } from 'react'
import { MapPin, Search, SlidersHorizontal, X, Ticket, Plus, Navigation } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import type { Category, FoodItem } from '../types'
import { AREAS, CAMPUSES, campusName } from '../data/campus'
import { SAMPLE_ITEMS } from '../data/seed'
import { defaultFilters, isAreaFilterActive, rankItems, type FoodFilters } from '../lib/match'
import { repo, useRepoState, DATA_CHANGED_EVENT } from '../lib/repo'
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

const LOCATION_AREAS = AREAS

function distanceKm(a: GeolocationCoordinates, latitude: number, longitude: number) {
  const r = 6371
  const dLat = (latitude - a.latitude) * Math.PI / 180
  const dLng = (longitude - a.longitude) * Math.PI / 180
  const q = Math.sin(dLat / 2) ** 2 + Math.cos(a.latitude * Math.PI / 180) * Math.cos(latitude * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return 2 * r * Math.asin(Math.sqrt(q))
}

export function DiscoverPage() {
  const navigate = useNavigate()
  const { profile, updateProfile } = useProfile()
  const favorites = useFavorites()
  const repoState = useRepoState()

  const [items, setItems] = useState<FoodItem[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
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
  const [position, setPosition] = useState<GeolocationCoordinates | null>(null)
  const [nearRadius, setNearRadius] = useState(5)
  const [locationNotice, setLocationNotice] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    setItems(null)
    setLoadError(null)
    repo
      .listItems()
      .then((list) => {
        if (alive) setItems(list)
      })
      .catch((e: unknown) => {
        if (!alive) return
        const message = e instanceof Error ? e.message : '云端读取失败'
        setLoadError(message)
        // 云端故障时仍可浏览明确标注的示例，但绝不让示例掩盖“真实投稿读不到”
        setItems(SAMPLE_ITEMS)
      })
    return () => {
      alive = false
    }
  }, [reloadKey])

  // 投稿/评分等数据变化后即时重拉；标签页重新可见时也刷新（跨标签更新）
  useEffect(() => {
    let alive = true
    const reload = () => {
      repo
        .listItems()
        .then((list) => {
          if (alive) setItems(list)
        })
        .catch(() => undefined)
    }
    window.addEventListener(DATA_CHANGED_EVENT, reload)
    return () => {
      alive = false
      window.removeEventListener(DATA_CHANGED_EVENT, reload)
    }
  }, [])

  // 校区跟随“我的口味/首访”设置
  useEffect(() => {
    setFilters((f) => (f.campusId === profile.campusId ? f : { ...f, campusId: profile.campusId }))
  }, [profile.campusId])

  const effective = useMemo(() => ({ ...filters, query }), [filters, query])
  const results = useMemo(
    () => {
      const ranked = items ? rankItems(items, effective, profile).filter((r) => r.item.status !== 'hidden') : []
      if (!position) return ranked
      return ranked
        .filter((r) => r.item.latitude != null && r.item.longitude != null && distanceKm(position, r.item.latitude, r.item.longitude) <= nearRadius)
        .sort((a, b) => distanceKm(position, a.item.latitude!, a.item.longitude!) - distanceKm(position, b.item.latitude!, b.item.longitude!))
    },
    [items, effective, profile, position, nearRadius],
  )
  const topWanted = useMemo(() => (items ?? []).filter((i) => i.status === 'published').sort((a, b) => (b.favoriteCount ?? 0) - (a.favoriteCount ?? 0)).slice(0, 3), [items])
  const requestLocation = () => {
    if (!navigator.geolocation) { setLocationNotice('当前浏览器不支持定位，请继续按地点/校区筛选。'); return }
    if (!window.isSecureContext) { setLocationNotice('定位仅能在 HTTPS 或 localhost 下使用；请继续按地点/校区筛选。'); return }
    navigator.geolocation.getCurrentPosition(
      (next) => { setPosition(next.coords); setLocationNotice(`已按 ${nearRadius} km 范围排序；无坐标投稿不会进入附近排序。`) },
      (error) => setLocationNotice(error.code === error.PERMISSION_DENIED ? '你拒绝了定位授权，已继续按地点/校区浏览。' : '暂时无法定位，已继续按地点/校区浏览。'),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
    )
  }

  const campusHasContent = CAMPUSES.find((c) => c.id === filters.campusId)?.hasContent ?? false
  const activeFilterCount =
    (isAreaFilterActive(filters.areaIds) ? 1 : 0) +
    filters.categories.length +
    (filters.budget.amount != null ? 1 : 0) +
    (filters.noSpicy ? 1 : 0) +
    (filters.hometownOnly ? 1 : 0)

  const tab = (filters.categories.length === 1 ? filters.categories[0] : 'all') as Category | 'all'
  const locationValue = filters.areaIds.length === 1
    ? `area:${filters.areaIds[0]}`
    : `campus:${filters.campusId}`

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
              {CAMPUSES.find((c) => c.id === filters.campusId)?.short ?? '昆明市'}
            </span>
            <span className="hero__chip">菜品由大学生互相推荐，不含广告。</span>
          </div>
        </div>
      </section>

      {repoState === 'offline' && loadError && (
        <Notice tone="red">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div>
              <b>暂时读不到云端真实投稿。</b>
              {loadError}
            </div>
            <div>下面仅展示标注「示例」的起始内容，真实同学投稿当前无法读取。</div>
            <button
              type="button"
              className="btn btn--soft"
              style={{ alignSelf: 'flex-start' }}
              onClick={() => setReloadKey((k) => k + 1)}
            >
              重新连接
            </button>
          </div>
        </Notice>
      )}
      {repoState === 'checking' && (
        <Notice tone="blue">正在连接共享数据库，稍等就能看到同学的真实投稿……</Notice>
      )}
      <div className="row-between" style={{ marginBottom: 10 }}>
        <select
          className="select-input"
          style={{ width: 'auto', flex: 1, padding: '8px 10px', fontSize: 13 }}
          value={locationValue}
          onChange={(e) => {
            const [kind, id] = e.target.value.split(':')
            if (kind === 'area') {
              const area = AREAS.find((entry) => entry.id === id)
              if (!area) return
              setFilters((f) => ({ ...f, campusId: area.campusId, areaIds: [area.id] }))
              updateProfile({ campusId: area.campusId, defaultArea: area.id })
              return
            }
            setFilters((f) => ({ ...f, campusId: id, areaIds: defaultFilters(id).areaIds }))
            updateProfile({ campusId: id, defaultArea: null })
          }}
          aria-label="切换浏览地点"
        >
          {filters.areaIds.length > 1 && isAreaFilterActive(filters.areaIds) && <option value={locationValue}>已选多个地点</option>}
          <optgroup label="城市">
          {CAMPUSES.map((c) => (
            <option key={c.id} value={`campus:${c.id}`}>
              {c.name}
            </option>
          ))}
          </optgroup>
          <optgroup label="昆明市具体地点">
            {LOCATION_AREAS.map((area) => <option key={area.id} value={`area:${area.id}`}>{area.name}</option>)}
          </optgroup>
        </select>
        <Chip
          active={filters.hometownOnly}
          onClick={() => setFilters((f) => ({ ...f, hometownOnly: !f.hometownOnly }))}
        >
          同乡投稿{filters.hometownOnly ? '筛选中' : '优先'}
        </Chip>
      </div>

      <div className="info-card stack" style={{ marginBottom: 12 }}>
        <div className="row-between"><strong>附近推荐</strong><span className="tiny faint">仅主动授权后定位</span></div>
        <div className="chips-row" style={{ overflow: 'visible' }}>
          {[1, 3, 5, 10].map((km) => <Chip key={km} active={nearRadius === km} onClick={() => setNearRadius(km)}>{km} km</Chip>)}
          <button type="button" className="btn btn--soft" onClick={requestLocation}><Navigation size={14} /> 使用当前位置</button>
          {position && <button type="button" className="btn btn--ghost" onClick={() => { setPosition(null); setLocationNotice('已退出附近排序，继续按地点/校区浏览。') }}>退出附近</button>}
        </div>
        {locationNotice && <span className="tiny faint">{locationNotice}</span>}
      </div>

      <div className="section-title"><h2>❤️ 最想吃 TOP 3</h2><span className="section-title__aside">不同用户想吃数</span></div>
      <div className="stack" style={{ marginBottom: 14 }}>
        {topWanted.length ? topWanted.map((item, index) => <button key={item.id} type="button" className="info-card row-between" onClick={() => navigate(`/item/${item.id}`)}><span>{index + 1}. {item.name}</span><span className="tiny">❤️ {item.favoriteCount ?? 0}</span></button>) : <p className="tiny faint">还没有真实投稿进入想吃榜。</p>}
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
