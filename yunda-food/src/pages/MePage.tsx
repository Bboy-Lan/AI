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
} from 'lucide-react'
import type { FoodItem } from '../types'
import { campusName } from '../data/campus'
import { repo } from '../lib/repo'
import { useFavorites } from '../lib/useFavorites'
import { useProfile } from '../lib/profile'
import { profileTags } from '../lib/taste'
import { EmptyState, Notice, Spinner, Stamp } from '../components/ui'

interface LayoutContext {
  openProfileEditor: () => void
}

export function MePage() {
  const navigate = useNavigate()
  const { profile } = useProfile()
  const favorites = useFavorites()
  const { openProfileEditor } = useOutletContext<LayoutContext>()

  const [items, setItems] = useState<FoodItem[] | null>(null)
  useEffect(() => {
    void repo.listItems().then(setItems)
  }, [])

  const favItems = (items ?? []).filter((i) => favorites.ids.includes(i.id))
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
            <h1 className="display-md" style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <Ticket size={19} color="var(--red-deep)" /> 我的胃
            </h1>
            <button type="button" className="btn btn--soft" onClick={openProfileEditor}>
              <PencilLine size={15} /> 修改口味
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

          {profile.skipped && (
            <Notice tone="blue" >
              你在用“先逛逛”模式，所有口味都是不限。设置后推荐卡会写出具体匹配理由。
            </Notice>
          )}
          <p className="tiny faint mt-8">
            口味与收藏只存在这台设备上；没有学号、邮箱或登录。
          </p>
        </div>
      </section>

      {/* 后端状态 */}
      <div className="section-title"><h2>数据状态</h2></div>
      <Notice tone={repo.connected ? 'green' : 'yellow'}>
        {repo.connected ? (
          <span style={{ display: 'flex', gap: 8 }}>
            <Cloud size={17} style={{ flex: 'none' }} />
            <span>
              <b>已接通共享数据库</b>：投稿、图片、评论云端保存，其他手机可见。
            </span>
          </span>
        ) : (
          <span style={{ display: 'flex', gap: 8 }}>
            <CloudOff size={17} style={{ flex: 'none' }} />
            <span>
              <b>示例模式（未接共享数据库）</b>：起始内容全部标“示例”，新投稿只进本机草稿。
              上线只需项目说明里的一个配置动作（Supabase 免费项目 + .env.local）。
            </span>
          </span>
        )}
      </Notice>

      {/* 本机草稿 */}
      <div className="section-title">
        <h2>我的投稿 / 本机草稿</h2>
        <span className="section-title__aside">{drafts.length} 条</span>
      </div>
      {items === null ? (
        <Spinner />
      ) : drafts.length === 0 ? (
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
        <span className="section-title__aside">本机收藏 · {favItems.length}</span>
      </div>
      {items === null ? (
        <Spinner />
      ) : favItems.length === 0 ? (
        <EmptyState art="🎟️" title="还没有收藏">
          在吃喝卡片或详情页点“想吃”，清单只留在这台手机。
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
