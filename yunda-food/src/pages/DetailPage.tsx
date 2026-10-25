import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  CalendarDays,
  Flag,
  Heart,
  MapPin,
  MapPinned,
  PenLine,
  RotateCw,
  Send,
  Ticket,
} from 'lucide-react'
import type { FoodItem, Review } from '../types'
import {
  areaName,
  campusName,
  CATEGORY_LABEL,
  hometownLabel,
  OIL_LABEL,
  SPICY_LABEL,
  STAPLE_LABEL,
  SWEETSALTY_LABEL,
} from '../data/campus'
import { priceBasisLabel } from '../lib/match'
import { DATA_CHANGED_EVENT, repo, useRepoState, notifyDataChanged } from '../lib/repo'
import { useFavorites } from '../lib/useFavorites'
import { EmptyState, FoodImage, Notice, Sheet, Spinner, Stamp, Stars } from '../components/ui'

function monthNow(): string {
  return new Date().toISOString().slice(0, 7)
}

type LoadState<T> = { status: 'loading' } | { status: 'ok'; data: T } | { status: 'error'; message: string }

export function DetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const favorites = useFavorites()
  const repoState = useRepoState()

  const [itemState, setItemState] = useState<LoadState<FoodItem | null>>({ status: 'loading' })
  const [reviewsState, setReviewsState] = useState<LoadState<Review[]>>({ status: 'loading' })
  const [alreadyRated, setAlreadyRated] = useState(false)
  const [editingReview, setEditingReview] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [reviewDone, setReviewDone] = useState(false)
  const [reviewError, setReviewError] = useState<string | null>(null)
  const [feedbackOpen, setFeedbackOpen] = useState(false)

  // 评论表单
  const [ate, setAte] = useState(false)
  const [ateDate, setAteDate] = useState(monthNow())
  const [nickname, setNickname] = useState('')
  const [rating, setRating] = useState(0)
  const [text, setText] = useState('')

  const loadAll = (itemId: string, background = false) => {
    let alive = true
    if (!background) {
      setItemState({ status: 'loading' })
      setReviewsState({ status: 'loading' })
    }
    repo
      .getItem(itemId)
      .then((it) => alive && setItemState({ status: 'ok', data: it }))
      .catch((e: unknown) =>
        alive &&
        setItemState({ status: 'error', message: e instanceof Error ? e.message : '详情读取失败' }),
      )
    repo
      .listReviews(itemId)
      .then((rs) => alive && setReviewsState({ status: 'ok', data: rs }))
      .catch((e: unknown) =>
        alive &&
        setReviewsState({ status: 'error', message: e instanceof Error ? e.message : '评论读取失败' }),
      )
    repo
      .hasOwnRating(itemId)
      .then((own) => alive && setAlreadyRated(own))
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }

  useEffect(() => {
    if (!id) return
    let dispose = loadAll(id)
    const refresh = () => { dispose(); dispose = loadAll(id, true) }
    window.addEventListener(DATA_CHANGED_EVENT, refresh)
    return () => { dispose(); window.removeEventListener(DATA_CHANGED_EVENT, refresh) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const submitReview = async (e: FormEvent) => {
    e.preventDefault()
    if (!id || !ate || !ateDate || !rating || !nickname.trim() || !text.trim()) return
    setSubmitting(true)
    setReviewError(null)
    try {
      const saved = await repo.addReview({
        itemId: id,
        nickname: nickname.trim().slice(0, 16),
        rating,
        text: text.trim().slice(0, 200),
        ateDate,
      })
      setReviewsState((prev) =>
        prev.status === 'ok'
          ? { status: 'ok', data: [saved, ...prev.data.filter((r) => r.id !== saved.id)] }
          : { status: 'ok', data: [saved] },
      )
      setAlreadyRated(true)
      setReviewDone(true)
      setEditingReview(false)
      // 聚合分由触发器更新；失效缓存后重读，并通知其他页面刷新
      repo.invalidateItems()
      notifyDataChanged('review', false)
      try {
        const fresh = await repo.getItem(id)
        if (fresh) setItemState({ status: 'ok', data: fresh })
      } catch {
        /* 聚合数字刷新失败不阻断评论成功提示 */
      }
    } catch (err) {
      setReviewError(err instanceof Error ? err.message : '评论提交失败，请重试')
    } finally {
      setSubmitting(false)
    }
  }

  const startEditReview = async () => {
    if (!id) return
    setReviewError(null)
    setAte(true)
    setEditingReview(true)
    if (repo.mode === 'remote') {
      try {
        const own = await repo.getOwnReview(id)
        if (own) {
          setNickname(own.nickname)
          setRating(own.rating)
          setText(own.text)
          setAteDate(own.ateDate || monthNow())
          return
        }
      } catch {
        /* 预填失败则用空表单 */
      }
    }
  }

  if (itemState.status === 'loading') {
    return (
      <div className="page">
        <Spinner />
      </div>
    )
  }
  if (itemState.status === 'error') {
    return (
      <div className="page">
        <div className="topbar" style={{ position: 'static', padding: '8px 0' }}>
          <button type="button" className="icon-btn" onClick={() => navigate(-1)} aria-label="返回">
            <ArrowLeft size={17} />
          </button>
          <span className="topbar__title">详情暂时打不开</span>
        </div>
        <Notice tone="red">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>{itemState.message}</div>
            <button
              type="button"
              className="btn btn--soft"
              style={{ alignSelf: 'flex-start' }}
              onClick={() => id && loadAll(id)}
            >
              <RotateCw size={15} /> 重试
            </button>
          </div>
        </Notice>
      </div>
    )
  }

  const item = itemState.data
  if (item === null) {
    return (
      <div className="page">
        <div className="topbar" style={{ position: 'static', padding: '8px 0' }}>
          <button type="button" className="icon-btn" onClick={() => navigate(-1)} aria-label="返回">
            <ArrowLeft size={17} />
          </button>
          <span className="topbar__title">饭票找不到了</span>
        </div>
        <EmptyState art="🚫" title="没有这条吃喝记录">
          它可能已被撤下，或链接不完整。
        </EmptyState>
      </div>
    )
  }

  const isSample = item.source === 'sample'
  // 示例内容：云端模式不允许提交“真实评价”；本机示例模式允许本机留言但不会同步
  const reviewBlocked = isSample && repo.mode === 'remote'
  const reviews = reviewsState.status === 'ok' ? reviewsState.data : []

  return (
    <div className="page" style={{ paddingTop: 0 }}>
      <div className="detail-hero">
        <FoodImage
          src={item.image}
          alt={item.name}
          fallbackChar={item.name.slice(0, 1)}
          category={item.category}
        />
        <button type="button" className="icon-btn detail-hero__back" onClick={() => navigate(-1)} aria-label="返回">
          <ArrowLeft size={17} />
        </button>
        {isSample && <Stamp corner>示例数据</Stamp>}
        {item.status === 'local-draft' && (
          <Stamp corner variant="blue">
            本机草稿
          </Stamp>
        )}
      </div>

      <div className="info-card" style={{ marginTop: -18, position: 'relative', zIndex: 2 }}>
        <div className="row-between" style={{ alignItems: 'flex-start' }}>
          <div style={{ minWidth: 0 }}>
            <h1 className="display-lg">{item.name}</h1>
            <div className="muted tiny mt-8" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <MapPin size={13} />
              {item.venue} · {areaName(item.areaId)} · {campusName(item.campusId)}
            </div>
          </div>
          <div style={{ textAlign: 'right', flex: 'none' }}>
            <div className="price price--lg">
              <span className="price__sym">¥</span>
              <span className="price__num">{item.price}</span>
            </div>
            <div className="price__basis">{priceBasisLabel(item)}</div>
          </div>
        </div>

        <div className="ticket__tags mt-12">
          <span className="badge badge--blue">{CATEGORY_LABEL[item.category]}</span>
          <span className={item.spicy >= 2 ? 'badge badge--spicy' : 'badge'}>
            {SPICY_LABEL[item.spicy]}
          </span>
          {item.staple && <span className="badge">{STAPLE_LABEL[item.staple]}</span>}
          <span className="badge">{SWEETSALTY_LABEL[item.sweetSalty]}</span>
          <span className="badge">{OIL_LABEL[item.oil]} </span>
          {item.flavors.map((f) => (
            <span key={f} className="tag">{f}</span>
          ))}
          {item.cuisine && <span className="badge badge--green">{item.cuisine}</span>}
        </div>

        <p style={{ marginTop: 12, fontSize: 14 }}>{item.description}</p>

        {!isSample && (
          <div className="row-between mt-12" style={{ justifyContent: 'flex-start', gap: 12 }}>
            <span className="tiny muted">同学评价</span>
            {item.ratingCount > 0 && item.ratingAvg != null ? (
              <>
                <Stars value={Math.round(item.ratingAvg)} size={15} />
                <strong style={{ fontSize: 14 }}>{item.ratingAvg.toFixed(1)} 分</strong>
                <span className="tiny muted">{item.ratingCount} 人吃过并打分</span>
              </>
            ) : (
              <span className="tiny muted">还没有人自报吃过打分，你来第一个</span>
            )}
          </div>
        )}

        <div className="btn-row mt-12">
          <button
            type="button"
            className={`btn ${favorites.has(item.id) ? 'btn--red' : 'btn--soft'}`}
            onClick={() => favorites.toggle(item.id)}
          >
            <Heart size={17} fill={favorites.has(item.id) ? '#fff' : 'none'} />
            {favorites.has(item.id) ? '已想吃（本机收藏）' : '想吃 · 本机收藏'}
          </button>
          <button type="button" className="btn btn--yellow" onClick={() => navigate('/blindbox')}>
            <Ticket size={16} /> 再开盲盒
          </button>
        </div>
      </div>

      <div className="section-title"><h2>来源与状态</h2></div>
      <div className="info-card">
        <div className="kv-list">
          <div className="kv-list__row">
            <span className="kv-list__k">内容来源</span>
            <span className="kv-list__v">
              {isSample ? (
                <>
                  起始<b>示例数据</b>（店名/价格/照片均未现场核验，仅用于演示流程）
                </>
              ) : item.status === 'local-draft' ? (
                <span style={{ color: 'var(--blue-deep)' }}>
                  本机草稿：只存在这台设备，尚未进入共享数据库，其他手机看不到
                </span>
              ) : (
                '同学投稿（云端共享，其他手机可见）'
              )}
            </span>
          </div>
          <div className="kv-list__row">
            <span className="kv-list__k">投稿人</span>
            <span className="kv-list__v">
              {item.author?.nickname || '匿名同学'}
              {item.author?.hometown && ` · 来自${hometownLabel(item.author.hometown)}（自填，未认证）`}
            </span>
          </div>
          <div className="kv-list__row">
            <span className="kv-list__k">亲自吃过</span>
            <span className="kv-list__v">
              {item.author?.ate
                ? `自报吃过${item.author.ateDate ? `（约 ${item.author.ateDate}）` : ''}，非消费认证`
                : '未自报吃过'}
            </span>
          </div>
          <div className="kv-list__row">
            <span className="kv-list__k">价格日期</span>
            <span className="kv-list__v" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <CalendarDays size={13} />
              {item.priceUpdatedAt ?? item.submittedAt.slice(0, 10)} 记录，涨价信息待核实，不自动覆盖
            </span>
          </div>
          <div className="kv-list__row">
            <span className="kv-list__k">位置距离</span>
            <span className="kv-list__v" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <MapPinned size={13} />
              暂无坐标，只显示具体片区与窗口，不显示距离
            </span>
          </div>
        </div>
        {repoState === 'offline' && (
          <Notice tone="red">
            当前云端连接异常，这条记录的评论与最新评分暂时无法同步。
          </Notice>
        )}
      </div>

      <div className="section-title">
        <h2>吃过的同学怎么说{reviewsState.status === 'ok' ? `（${reviews.length}）` : ''}</h2>
        {!isSample && (
          <button type="button" className="section-title__aside" style={{ background: 'none' }} onClick={() => setFeedbackOpen(true)}>
            价格纠错 / 举报
          </button>
        )}
      </div>

      {reviewsState.status === 'loading' ? (
        <Spinner />
      ) : reviewsState.status === 'error' ? (
        <Notice tone="red">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <b>评论暂时加载失败。</b>
              {reviewsState.message}
            </div>
            <button
              type="button"
              className="btn btn--soft"
              style={{ alignSelf: 'flex-start' }}
              onClick={() => id && loadAll(id)}
            >
              <RotateCw size={15} /> 重试加载评论
            </button>
          </div>
        </Notice>
      ) : reviewBlocked ? (
        <Notice tone="yellow">
          这是起始<b>示例内容</b>，不能对它提交真实云端评价——它不是云大现场投稿。打开同学真实投稿即可自报吃过并评分。
        </Notice>
      ) : alreadyRated && !editingReview ? (
        <Notice tone="green">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              {reviewDone
                ? '已记下你的体验分与评论。同一身份对这条投稿只保留一份评分，再提交会覆盖原来的，不会重复计数。'
                : '你已经给它打过分；同一身份只保留一份评分，修改后覆盖原来的，评价人数不会重复增加。'}
            </div>
            <button
              type="button"
              className="btn btn--soft"
              style={{ alignSelf: 'flex-start' }}
              onClick={() => void startEditReview()}
            >
              <PenLine size={15} /> 修改我的评分与评论
            </button>
          </div>
        </Notice>
      ) : (
        <form className="info-card stack" onSubmit={submitReview}>
          <label className="switch-row" style={{ border: '1.5px solid var(--line-strong)' }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 13.5 }}>我自报吃过这一家</div>
              <div className="tiny faint">必须勾选并填写大致日期，才能给体验分（自报不认证）</div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={ate}
              className={ate ? 'switch switch--on' : 'switch'}
              onClick={() => setAte((v) => !v)}
            />
          </label>

          {ate && (
            <>
              <div className="row-between">
                <input
                  type="month"
                  className="text-input"
                  style={{ flex: 1 }}
                  value={ateDate}
                  max={monthNow()}
                  onChange={(e) => setAteDate(e.target.value)}
                  required
                />
                <input
                  type="text"
                  className="text-input"
                  style={{ flex: 1 }}
                  maxLength={16}
                  placeholder="昵称（自填）"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  required
                />
              </div>
              <div className="row-between">
                <span className="field__label">体验分</span>
                <Stars value={rating} onChange={setRating} />
              </div>
              <textarea
                className="text-area"
                maxLength={200}
                placeholder="两句真话：味道、份量、排队、踩雷或惊喜……（200 字内）"
                value={text}
                onChange={(e) => setText(e.target.value)}
                required
              />
              {reviewError && (
                <Notice tone="red">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div>{reviewError}</div>
                    <button type="button" className="btn btn--soft" style={{ alignSelf: 'flex-start' }} onClick={() => setReviewError(null)}>
                      知道了，修改后重试
                    </button>
                  </div>
                </Notice>
              )}
              <button
                type="submit"
                className="btn btn--blue btn--block"
                disabled={submitting || !ate || !ateDate || !rating || !nickname.trim() || !text.trim()}
              >
                <Send size={15} /> {submitting ? '提交中…' : editingReview ? '覆盖更新（不增加评价人数）' : '提交体验分与评论'}
              </button>
            </>
          )}
        </form>
      )}

      <div className="stack mt-12">
        {reviewsState.status === 'ok' && reviews.length === 0 && (
          <p className="tiny faint" style={{ padding: '0 4px' }}>
            还没有评论。吃过的话，自报一句，帮后面的同学做决定。
          </p>
        )}
        {reviews.map((r) => (
          <div className="info-card review-item" key={r.id}>
            <div className="review-item__head">
              <span style={{ fontWeight: 700, fontSize: 13.5 }}>
                {r.nickname}
                <span className="tiny faint"> · 自报 {r.ateDate} 吃过</span>
              </span>
              <Stars value={r.rating} size={14} />
            </div>
            <p style={{ fontSize: 13.5 }}>{r.text}</p>
          </div>
        ))}
      </div>

      <button
        type="button"
        className="btn btn--ghost btn--block mt-20"
        onClick={() => navigate('/publish')}
      >
        <PenLine size={15} /> 我也想推荐一道
      </button>

      <FeedbackSheet
        open={feedbackOpen}
        onClose={() => setFeedbackOpen(false)}
        itemName={item.name}
        itemId={item.id}
        currentPrice={item.price}
      />
    </div>
  )
}

function FeedbackSheet({
  open,
  onClose,
  itemId,
  itemName,
  currentPrice,
}: {
  open: boolean
  onClose: () => void
  itemId: string
  itemName: string
  currentPrice: number
}) {
  const [type, setType] = useState<'price_correction' | 'report'>('price_correction')
  const [price, setPrice] = useState(String(currentPrice))
  const [reason, setReason] = useState('')
  const [sending, setSending] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    if (!reason.trim() || reason.trim().length < 2) return
    if (type === 'price_correction' && !(Number(price) > 0 && Number(price) < 1000)) return
    setSending(true)
    setError(null)
    try {
      await repo.submitFeedback({
        itemId,
        type,
        suggestedPrice: type === 'price_correction' ? Number(price) : null,
        reason: reason.trim().slice(0, 200),
      })
      setDone(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : '提交失败，请重试')
    } finally {
      setSending(false)
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title={`反馈 · ${itemName}`}>
      {done ? (
        <div className="stack">
          <Notice tone="green">
            已收到，状态为<b>待处理</b>。价格纠错不会自动覆盖原价，项目所有者核实后统一处理。
          </Notice>
          <button type="button" className="btn btn--blue btn--block" onClick={onClose}>
            完成
          </button>
        </div>
      ) : (
        <div className="stack-lg">
          <div className="chips-row" style={{ overflow: 'visible' }}>
            <button
              type="button"
              className={`chip${type === 'price_correction' ? ' chip--on' : ''}`}
              onClick={() => setType('price_correction')}
            >
              价格不对
            </button>
            <button
              type="button"
              className={`chip${type === 'report' ? ' chip--on' : ''}`}
              onClick={() => setType('report')}
            >
              <Flag size={13} /> 举报内容
            </button>
          </div>

          {type === 'price_correction' && (
            <div className="field">
              <label className="field__label">你最近买到的实际价格（元）</label>
              <input
                type="number"
                inputMode="decimal"
                min={0.5}
                max={999}
                step={0.5}
                className="text-input"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
              <span className="field__hint">当前记录价 ¥{currentPrice}；新价格标记待核实，不自动覆盖。</span>
            </div>
          )}

          <div className="field">
            <label className="field__label">{type === 'price_correction' ? '补充说明' : '举报理由'} *</label>
            <textarea
              className="text-area"
              maxLength={200}
              placeholder={
                type === 'price_correction'
                  ? '例如：这学期涨到 15 元了，窗口换过位置……'
                  : '例如：广告、抄袭、信息不实、违法或泄露隐私……'
              }
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>

          {error && <Notice tone="red">{error}</Notice>}

          <div className="btn-row">
            <button type="button" className="btn" onClick={onClose}>
              取消
            </button>
            <button
              type="button"
              className="btn btn--blue"
              disabled={sending || reason.trim().length < 2}
              onClick={submit}
            >
              {sending ? '提交中…' : '提交待处理'}
            </button>
          </div>
        </div>
      )}
    </Sheet>
  )
}
