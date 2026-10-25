import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  CalendarDays,
  Heart,
  MapPin,
  MapPinned,
  PenLine,
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
import { repo } from '../lib/repo'
import { useFavorites } from '../lib/useFavorites'
import { EmptyState, FoodImage, Notice, Spinner, Stamp, Stars } from '../components/ui'

function monthNow(): string {
  return new Date().toISOString().slice(0, 7)
}

export function DetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const favorites = useFavorites()

  const [item, setItem] = useState<FoodItem | null | undefined>(undefined)
  const [reviews, setReviews] = useState<Review[]>([])
  const [alreadyRated, setAlreadyRated] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [reviewDone, setReviewDone] = useState(false)

  // 评论表单
  const [ate, setAte] = useState(false)
  const [ateDate, setAteDate] = useState(monthNow())
  const [nickname, setNickname] = useState('')
  const [rating, setRating] = useState(0)
  const [text, setText] = useState('')

  useEffect(() => {
    if (!id) return
    let alive = true
    void Promise.all([repo.getItem(id), repo.listReviews(id), repo.hasOwnRating(id)]).then(
      ([it, rs, own]) => {
        if (!alive) return
        setItem(it)
        setReviews(rs)
        setAlreadyRated(own)
      },
    )
    return () => {
      alive = false
    }
  }, [id])

  const submitReview = async (e: FormEvent) => {
    e.preventDefault()
    if (!id || !ate || !ateDate || !rating || !nickname.trim() || !text.trim()) return
    setSubmitting(true)
    try {
      const saved = await repo.addReview({
        itemId: id,
        nickname: nickname.trim().slice(0, 16),
        rating,
        text: text.trim().slice(0, 200),
        ateDate,
      })
      setReviews((prev) => [saved, ...prev.filter((r) => r.id !== saved.id)])
      setAlreadyRated(true)
      setReviewDone(true)
    } finally {
      setSubmitting(false)
    }
  }

  if (item === undefined) return <div className="page"><Spinner /></div>
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
        {item.source === 'sample' && <Stamp corner>示例数据</Stamp>}
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
              {item.source === 'sample' ? (
                <>
                  起始<b>示例数据</b>（店名/价格/照片均未现场核验，仅用于演示流程）
                </>
              ) : item.status === 'local-draft' ? (
                <span style={{ color: 'var(--blue-deep)' }}>
                  本机草稿：只存在这台设备，尚未进入共享数据库，其他手机看不到
                </span>
              ) : (
                '同学投稿'
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
      </div>

      <div className="section-title">
        <h2>吃过的同学怎么说（{reviews.length}）</h2>
      </div>

      {alreadyRated ? (
        <Notice tone="green">
          {reviewDone
            ? '已记下你的体验分与评论。同一台浏览器对这条投稿只保留一份评分，再提交会覆盖原来的。'
            : '你在这台浏览器上已经给它打过分；如需修改，重新提交即可覆盖。'}
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
              <button
                type="submit"
                className="btn btn--blue btn--block"
                disabled={submitting || !ate || !ateDate || !rating || !nickname.trim() || !text.trim()}
              >
                <Send size={15} /> {submitting ? '提交中…' : '提交体验分与评论'}
              </button>
            </>
          )}
        </form>
      )}

      <div className="stack mt-12">
        {reviews.length === 0 ? (
          <p className="tiny faint" style={{ padding: '0 4px' }}>
            还没有评论。吃过的话，自报一句，帮后面的同学做决定。
          </p>
        ) : (
          reviews.map((r) => (
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
          ))
        )}
      </div>

      <button
        type="button"
        className="btn btn--ghost btn--block mt-20"
        onClick={() => navigate('/publish')}
      >
        <PenLine size={15} /> 我也想推荐一道
      </button>
    </div>
  )
}
