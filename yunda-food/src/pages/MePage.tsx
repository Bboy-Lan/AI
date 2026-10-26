import { useEffect, useState } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import {
  Cloud,
  CloudOff,
  Heart,
  MapPin,
  PencilLine,
  Plus,
  Ticket,
  BadgeInfo,
  ShieldCheck,
} from 'lucide-react'
import type { FoodItem, MyProfileStatus, MyReview } from '../types'
import { campusName } from '../data/campus'
import { repo, useRepoState, DATA_CHANGED_EVENT } from '../lib/repo'
import { useFavorites } from '../lib/useFavorites'
import { useProfile } from '../lib/profile'
import { profileTags } from '../lib/taste'
import { useAdminStatus } from '../lib/useAdminStatus'
import { EmptyState, Notice, Spinner, Stamp } from '../components/ui'
import { IdentityBadge } from '../components/IdentityBadge'

interface LayoutContext {
  openProfileEditor: () => void
}

export function MePage() {
  const navigate = useNavigate()
  const { profile } = useProfile()
  const favorites = useFavorites()
  const { openProfileEditor } = useOutletContext<LayoutContext>()
  const repoState = useRepoState()
  const identityRole = useAdminStatus()

  const [items, setItems] = useState<FoodItem[] | null>(null)
  const [myItems, setMyItems] = useState<FoodItem[] | null>(null)
  const [myItemsError, setMyItemsError] = useState<string | null>(null)
  const [myReviews, setMyReviews] = useState<MyReview[]>([])
  const [myProfileStatus, setMyProfileStatus] = useState<MyProfileStatus | null>(null)
  const [myItemsExpanded, setMyItemsExpanded] = useState(false)

  const loadAll = () => {
    repo.listItems().then(setItems).catch(() => setItems([]))
    if (repo.mode === 'remote') {
      repo
        .listMyItems()
        .then((list) => {
          setMyItems(list)
          setMyItemsError(null)
        })
        .catch((e: unknown) => {
          setMyItems([])
          setMyItemsError(e instanceof Error ? e.message : '读取我的云端投稿失败')
        })
      repo.listMyReviews().then(setMyReviews).catch(() => setMyReviews([]))
      repo.getMyProfileStatus().then(setMyProfileStatus).catch(() => setMyProfileStatus(null))
    } else {
      // 本地模式：listMyItems 返回本机草稿，与下面的草稿分区一致，这里不重复展示
      setMyItems([])
      repo.listMyReviews().then(setMyReviews).catch(() => setMyReviews([]))
      setMyProfileStatus({ restricted: false })
    }
  }

  useEffect(() => {
    loadAll()
    const onChange = () => loadAll()
    window.addEventListener(DATA_CHANGED_EVENT, onChange)
    const onVisible = () => document.visibilityState === 'visible' && loadAll()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener(DATA_CHANGED_EVENT, onChange)
      document.removeEventListener('visibilitychange', onVisible)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repoState])

  const favItems = (items ?? []).filter((i) => favorites.ids.includes(i.id))
  const unavailableFavoriteCount = favorites.ids.length - favItems.length
  const drafts = (items ?? []).filter((i) => i.status === 'local-draft')

  return (
    <div className="page">
      <div className="topbar" style={{ position: 'static', padding: '8px 0 6px' }}>
        <span className="topbar__title">我的</span>
      </div>

      {/* 口味画像饭票 */}
      <section className="ticket" style={{ display: 'block', padding: 0 }}>
        <div style={{ padding: 16 }}>
          <div className="row-between">
            <h1 className="display-md" style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
              <Ticket size={19} color="var(--red-deep)" /> {profile.foodieId ? `@${profile.foodieId}` : '我的吃货 ID'} <IdentityBadge role={identityRole} />
            </h1>
            <button type="button" className="btn btn--soft" onClick={openProfileEditor}>
              <PencilLine size={15} /> 修改资料
            </button>
          </div>

          <div className="muted tiny mt-8" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <MapPin size={13} /> {campusName(profile.campusId)}
          </div>

          <div className="ticket__tags mt-12">
            {profileTags(profile).map((t) => (
              <span key={t} className="badge badge--blue">{t}</span>
            ))}
          </div>

          {identityRole === 'admin' && (
            <button type="button" className="btn btn--yellow mt-12" onClick={() => navigate('/admin')}>
              <ShieldCheck size={16} /> 内容管理
            </button>
          )}

          {profile.skipped && (
            <Notice tone="blue" >
              你在用“先逛逛”模式，所有口味都是不限。设置后推荐卡会写出具体匹配理由。
            </Notice>
          )}
          <p className="tiny faint mt-8">
            匿名身份保存在当前浏览器，清除浏览器数据或换设备后无法自动恢复。不会收集姓名、手机号、学号、通讯录或精确住址。
          </p>
        </div>
      </section>

      {myProfileStatus?.restricted && (
        <Notice tone="red">
          <b>你的投稿与评论功能已被限制。</b>{myProfileStatus.reason ? `处理说明：${myProfileStatus.reason}` : '请联系管理员了解处理说明。'} 浏览、收藏和修改资料仍可使用。
        </Notice>
      )}

      {/* 后端状态 */}
      <div className="section-title"><h2>数据状态</h2></div>
      {repoState === 'local' && (
        <Notice tone="yellow">
          <span style={{ display: 'flex', gap: 8 }}>
            <CloudOff size={17} style={{ flex: 'none' }} />
            <span>
              <b>示例模式（未接共享数据库）</b>：起始内容全部标“示例”，新投稿只进本机草稿。
              上线只需项目说明里的一个配置动作（Supabase 免费项目 + .env.local）。
            </span>
          </span>
        </Notice>
      )}
      {repoState === 'online' && (
        <Notice tone="green">
          <span style={{ display: 'flex', gap: 8 }}>
            <Cloud size={17} style={{ flex: 'none' }} />
            <span>
              <b>已接通共享数据库</b>：投稿、图片、评论云端保存，其他手机可见。
            </span>
          </span>
        </Notice>
      )}
      {repoState === 'checking' && <Notice tone="blue">正在连接共享数据库……</Notice>}
      {repoState === 'offline' && (
        <Notice tone="red">
          <span style={{ display: 'flex', gap: 8 }}>
            <CloudOff size={17} style={{ flex: 'none' }} />
            <span>
              <b>云端连接异常</b>：{repo.getLastError() ?? '暂时无法读取共享内容'}
              。本机口味与收藏仍可用；请检查网络或数据库配置后重新打开页面。
            </span>
          </span>
        </Notice>
      )}

      {/* 我的云端投稿 */}
      {repoState === 'online' && (
        <>
          <div className="section-title">
            <h2>我的云端投稿</h2>
            <span className="section-title__aside">{myItems?.length ?? 0} 条</span>
          </div>
          {myItems === null ? (
            <Spinner />
          ) : myItemsError ? (
            <Notice tone="red">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div>{myItemsError}</div>
                <button type="button" className="btn btn--soft" style={{ alignSelf: 'flex-start' }} onClick={loadAll}>
                  重试
                </button>
              </div>
            </Notice>
          ) : myItems.length === 0 ? (
            <EmptyState
              art="📤"
              title="还没有云端投稿"
              action={
                <button type="button" className="btn btn--red" onClick={() => navigate('/publish')}>
                  <Plus size={16} /> 发布第一条推荐
                </button>
              }
            >
              发布后所有手机都能看到，也会出现在这里。
            </EmptyState>
          ) : (
            <>
              <div className={`stack${myItemsExpanded ? ' my-items-scroll' : ''}`}>
              {myItems.slice(0, myItemsExpanded ? myItems.length : 3).map((d) => (
                <article key={d.id} className="ticket">
                  <button type="button" className="ticket__body" disabled={d.status === 'hidden'} onClick={() => d.status !== 'hidden' && navigate(`/item/${d.id}`)}>
                  <div className="ticket__body">
                    <div className="ticket__name">{d.name}</div>
                    <div className="ticket__venue">{d.venue}</div>
                    <div className="ticket__tags" style={{ marginTop: 6 }}>
                      {d.status === 'hidden' ? <Stamp variant="red">已下架</Stamp> : <Stamp>已共享</Stamp>}
                      {d.ratingCount > 0 && d.ratingAvg != null && (
                        <span className="tag" style={{ color: 'var(--green)' }}>
                          {d.ratingAvg.toFixed(1)} 分 · {d.ratingCount} 人评价
                        </span>
                      )}
                    </div>
                    {d.status === 'hidden' && <p className="tiny" style={{ color: 'var(--red-deep)' }}>处理说明：{d.hiddenReason ?? '内容暂不可公开'}</p>}
                  </div>
                  </button>
                  <div className="ticket__price-col">
                    <div className="price"><span className="price__sym">¥</span><span className="price__num">{d.price}</span></div>
                    <button type="button" className="btn btn--soft tiny" onClick={() => navigate(`/my-items/${d.id}/edit`)}><PencilLine size={13} />补充/编辑</button>
                  </div>
                </article>
              ))}
              </div>
              {myItems.length > 3 && <button type="button" className="btn btn--soft my-items-toggle" onClick={() => setMyItemsExpanded((expanded) => !expanded)}>{myItemsExpanded ? '收起我的投稿' : `展开全部 ${myItems.length} 条`}</button>}
            </>
          )}
        </>
      )}

      {/* 本机草稿 */}
      <div className="section-title">
        <h2>{repoState === 'online' ? '本机草稿（未上传）' : '我的投稿 / 本机草稿'}</h2>
        <span className="section-title__aside">{drafts.length} 条</span>
      </div>
      {items === null ? (
        <Spinner />
      ) : drafts.length === 0 ? (
        repoState === 'online' ? (
          <p className="tiny faint" style={{ padding: '0 4px' }}>没有本机草稿；你的投稿都已在云端共享。</p>
        ) : (
          <EmptyState
            art="📝"
            title="还没有投稿"
            action={
              <button type="button" className="btn btn--red" onClick={() => navigate('/publish')}>
                <Plus size={16} /> 发布第一条推荐
              </button>
            }
          >
            一道食堂菜、一杯饮品都能投，没有商家门槛。
          </EmptyState>
        )
      ) : (
        <div className="stack">
          {drafts.map((d) => (
            <button key={d.id} type="button" className="ticket" onClick={() => navigate(`/item/${d.id}`)}>
              <div className="ticket__body">
                <div className="ticket__name">{d.name}</div>
                <div className="ticket__venue">{d.venue}</div>
                <div><Stamp variant="blue">仅本机可见</Stamp></div>
              </div>
              <div className="ticket__price-col">
                <div className="price"><span className="price__sym">¥</span><span className="price__num">{d.price}</span></div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* 想吃 */}
      <div className="section-title">
        <h2>
          <Heart size={16} color="var(--red-deep)" /> 想吃清单
        </h2>
        <span className="section-title__aside">{repo.mode === 'remote' ? '云端想吃' : '本机收藏'} · {favItems.length}</span>
      </div>
      {unavailableFavoriteCount > 0 && <Notice tone="yellow">有 {unavailableFavoriteCount} 条想吃内容暂不可查看；若只是下架，恢复公开后会自动回到清单。</Notice>}
      {favorites.removedCount > 0 && <Notice tone="blue">已有 {favorites.removedCount} 条无法访问的旧收藏已从你的云端清单移除。</Notice>}
      {items === null ? (
        <Spinner />
      ) : favItems.length === 0 ? (
        <EmptyState art="🎟️" title="还没有收藏">
          在吃喝卡片或详情页点“想吃”。云端模式按匿名身份唯一保存，重复点击只切换，不会刷量。
        </EmptyState>
      ) : (
        <div className="stack">
          {favItems.map((i) => (
            <button key={i.id} type="button" className="ticket" onClick={() => navigate(`/item/${i.id}`)}>
              <div className="ticket__body">
                <div className="ticket__name">{i.name}</div>
                <div className="ticket__venue">{i.venue}</div>
              </div>
              <div className="ticket__price-col">
                <div className="price"><span className="price__sym">¥</span><span className="price__num">{i.price}</span></div>
              </div>
            </button>
          ))}
        </div>
      )}

      <div className="section-title"><h2>我的评论 / 评分</h2><span className="section-title__aside">{myReviews.length} 条</span></div>
      {myReviews.length === 0 ? <p className="tiny faint">还没有评论或评分；每条投稿仅保留你最新的一份评分。</p> : (
        <div className="stack">{myReviews.map((review) => <button key={review.id} type="button" className="info-card" disabled={review.itemStatus === 'hidden'} onClick={() => review.itemStatus !== 'hidden' && navigate(`/item/${review.itemId}`)}><strong>{review.rating} 星</strong><span className="tiny faint"> · {review.itemName || review.ateDate}</span><p className="tiny mt-8">{review.text}</p>{review.moderationStatus === 'hidden' && <p className="tiny" style={{ color: 'var(--red-deep)' }}>该评论未公开：{review.moderationReason ?? '请联系管理员了解处理说明'}</p>}{review.itemStatus === 'hidden' && <p className="tiny faint">关联投稿已下架，暂不能打开详情。</p>}</button>)}</div>
      )}

      {/* 说明 */}
      <div className="section-title"><h2><BadgeInfo size={16} /> 数据与信任说明</h2></div>
      <div className="info-card">
        <div className="kv-list">
          <div className="kv-list__row">
            <span className="kv-list__k">示例内容</span>
            <span className="kv-list__v">带“示例”印章的店名、价格与照片均为起始演示，未在云大现场核验；示例内容不提供评分。</span>
          </div>
          <div className="kv-list__row">
            <span className="kv-list__k">示例图片</span>
            <span className="kv-list__v">示意图由 AI 生成，非云大实拍；图片加载失败时显示饭票样式占位，不影响使用。</span>
          </div>
          <div className="kv-list__row">
            <span className="kv-list__k">家乡信息</span>
            <span className="kv-list__v">家乡与“吃过”都是用户自报，只作展示和推荐线索，不做身份或老乡认证。</span>
          </div>
          <div className="kv-list__row">
            <span className="kv-list__k">距离</span>
            <span className="kv-list__v">当前没有采集坐标，只显示片区与窗口，绝不显示伪造距离。</span>
          </div>
          <div className="kv-list__row">
            <span className="kv-list__k">商业化</span>
            <span className="kv-list__v">无商家入驻、无广告位、无付费排名；评分必须自报吃过才能提交。</span>
          </div>
        </div>
      </div>
    </div>
  )
}
