import { useEffect, useState, type ReactNode } from 'react'
import { Check, Eye, EyeOff, KeyRound, MessageSquare, ShieldAlert, ShieldCheck, UserCheck, UserRound, UserX, Users } from 'lucide-react'
import type { AdminOverview, AdminProfile, AdminReview, FoodItem } from '../types'
import { notifyDataChanged, repo } from '../lib/repo'
import { EmptyState, Notice, Spinner } from '../components/ui'
import { SAMPLE_ITEMS } from '../data/seed'

type AdminTab = 'items' | 'samples' | 'reviews' | 'users'
type ModerationTarget = { kind: 'item' | 'sample' | 'review' | 'profile'; id: string; title: string }

// 每次读取与写入均由 Supabase 在服务端重验 admin_users + auth.uid()。
export function AdminPage() {
  const [allowed, setAllowed] = useState<boolean | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [tab, setTab] = useState<AdminTab>('items')
  const [showHidden, setShowHidden] = useState(false)
  const [overview, setOverview] = useState<AdminOverview | null>(null)
  const [items, setItems] = useState<FoodItem[]>([])
  const [reviews, setReviews] = useState<AdminReview[]>([])
  const [profiles, setProfiles] = useState<AdminProfile[]>([])
  const [hiddenSampleIds, setHiddenSampleIds] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [target, setTarget] = useState<ModerationTarget | null>(null)
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [deviceId, setDeviceId] = useState('')
  const [deviceMessage, setDeviceMessage] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    void Promise.resolve().then(() => Promise.all([repo.isAdmin(), repo.getCurrentUserId()])).then(([isAdmin, userId]) => {
      if (!alive) return
      setAllowed(isAdmin); setCurrentUserId(userId)
    }).catch((cause: unknown) => {
      if (!alive) return
      setAllowed(false); setError(cause instanceof Error ? cause.message : '暂时无法核验管理员权限')
    })
    return () => { alive = false }
  }, [])

  useEffect(() => {
    if (!allowed) return
    let alive = true
    void Promise.resolve().then(() => {
      if (alive) { setLoading(true); setError(null) }
      const current = tab === 'items'
        ? repo.listAdminItems(showHidden).then((data) => { if (alive) setItems(data) })
        : tab === 'samples'
          ? repo.listHiddenSampleIds().then((data) => { if (alive) setHiddenSampleIds(data) })
        : tab === 'reviews'
          ? repo.listAdminReviews(showHidden).then((data) => { if (alive) setReviews(data) })
          : repo.listAdminProfiles().then((data) => { if (alive) setProfiles(data) })
      return Promise.all([repo.getAdminOverview().then((data) => { if (alive) setOverview(data) }), current])
    }).catch((cause: unknown) => {
      if (alive) setError(cause instanceof Error ? cause.message : '读取管理数据失败')
    }).finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [allowed, tab, showHidden, reloadKey])

  const refresh = (detail: string) => { notifyDataChanged(detail); setReloadKey((value) => value + 1) }
  const restore = async (kind: ModerationTarget['kind'], id: string) => {
    setSaving(true); setError(null)
    try {
      if (kind === 'item') await repo.setItemVisibility({ itemId: id, hidden: false })
      if (kind === 'sample') await repo.setSampleVisibility({ sampleId: id, hidden: false })
      if (kind === 'review') await repo.setReviewVisibility({ reviewId: id, hidden: false })
      if (kind === 'profile') await repo.setProfileRestriction({ userId: id, restricted: false })
      refresh(`admin-restore-${kind}`)
    } catch (cause) { setError(cause instanceof Error ? cause.message : '恢复失败') } finally { setSaving(false) }
  }
  const confirmModeration = async () => {
    if (!target || reason.trim().length < 2) return
    setSaving(true); setError(null)
    try {
      if (target.kind === 'item') await repo.setItemVisibility({ itemId: target.id, hidden: true, reason })
      if (target.kind === 'sample') await repo.setSampleVisibility({ sampleId: target.id, hidden: true, reason })
      if (target.kind === 'review') await repo.setReviewVisibility({ reviewId: target.id, hidden: true, reason })
      if (target.kind === 'profile') await repo.setProfileRestriction({ userId: target.id, restricted: true, reason })
      setTarget(null); setReason(''); refresh(`admin-hide-${target.kind}`)
    } catch (cause) { setError(cause instanceof Error ? cause.message : '处理失败') } finally { setSaving(false) }
  }
  const grantDevice = async () => {
    if (!deviceId.trim()) return
    setSaving(true); setDeviceMessage(null)
    try { await repo.grantAdminDevice(deviceId.trim()); setDeviceId(''); setDeviceMessage('已授权该浏览器身份；请在目标浏览器刷新“我的”或内容管理页。') }
    catch (cause) { setDeviceMessage(cause instanceof Error ? cause.message : '授权失败') }
    finally { setSaving(false) }
  }

  if (repo.mode !== 'remote') return <div className="page stack-lg"><PageTitle /><Notice tone="yellow"><ShieldAlert size={18} /><span>内容管理需要接通共享数据库；本机示例模式没有管理员权限。</span></Notice></div>
  if (allowed === null) return <div className="page"><PageTitle /><Spinner /></div>
  if (!allowed) return <div className="page stack-lg"><PageTitle /><Notice tone="yellow"><ShieldAlert size={18} /><span><b>此浏览器身份尚未登记为管理员。</b>吃货 ID 是展示名；权限只认云端匿名身份，普通用户不能通过地址、前端参数或按钮取得权限。</span></Notice><div className="info-card stack"><strong>为何同一电脑会不同？</strong><p className="tiny muted">Supabase 匿名会话按浏览器存储。Edge、内置浏览器、无痕窗口会有不同的匿名 ID；这避免别人使用同一电脑时自动继承管理员权限。</p>{currentUserId && <><p className="tiny muted">若需由已有管理员授权此浏览器，请复制以下匿名设备 ID，在已确认的管理员内容管理台粘贴授权：</p><code className="admin-id">{currentUserId}</code></>}</div>{error && <Notice tone="red">{error}</Notice>}</div>

  return <div className="page stack-lg">
    <PageTitle />
    <Notice tone="green"><ShieldCheck size={18} /><span><b>管理员身份已由云端确认。</b>常规审核统一采用“下架/恢复”；为避免公开图片残留，前台不提供物理删除。</span></Notice>
    {overview && <div className="admin-stats" aria-label="社区概览"><Stat label="匿名吃货" value={overview.profileCount} icon={<Users size={15} />} /><Stat label="在架投稿" value={overview.publishedItemCount} icon={<Eye size={15} />} /><Stat label="公开评论" value={overview.publishedReviewCount} icon={<MessageSquare size={15} />} /><Stat label="已隐藏" value={overview.hiddenItemCount + overview.hiddenReviewCount} icon={<EyeOff size={15} />} /></div>}
    <section className="info-card stack" aria-label="管理员浏览器授权"><div className="row-between"><strong><KeyRound size={16} /> 管理员浏览器</strong><span className="tiny faint">当前已确认</span></div><p className="tiny muted">不同浏览器不会自动共享管理员资格。只有已经确认的管理员，才能为另一个已完成资料初始化的匿名浏览器 ID 授权。</p>{currentUserId && <code className="admin-id">当前：{currentUserId}</code>}<label className="field"><span className="field__label">授权另一浏览器的匿名设备 ID</span><input className="text-input" value={deviceId} onChange={(event) => setDeviceId(event.target.value)} placeholder="粘贴目标浏览器在 /#/admin 显示的 UUID" /></label><button type="button" className="btn btn--yellow" disabled={saving || !deviceId.trim()} onClick={() => void grantDevice()}><KeyRound size={15} />授权为管理员</button>{deviceMessage && <p className="tiny muted">{deviceMessage}</p>}</section>
    <div className="btn-row admin-tabs" role="tablist" aria-label="管理内容类别"><TabButton active={tab === 'items'} onClick={() => setTab('items')} icon={<Eye size={15} />}>投稿</TabButton><TabButton active={tab === 'samples'} onClick={() => setTab('samples')} icon={<EyeOff size={15} />}>示例</TabButton><TabButton active={tab === 'reviews'} onClick={() => setTab('reviews')} icon={<MessageSquare size={15} />}>评论</TabButton><TabButton active={tab === 'users'} onClick={() => setTab('users')} icon={<Users size={15} />}>用户</TabButton></div>
    {tab !== 'users' && tab !== 'samples' && <div className="btn-row"><button type="button" className={`btn ${!showHidden ? 'btn--blue' : ''}`} onClick={() => setShowHidden(false)}>公开中</button><button type="button" className={`btn ${showHidden ? 'btn--blue' : ''}`} onClick={() => setShowHidden(true)}>已隐藏</button></div>}
    {error && <Notice tone="red">{error}</Notice>}
    {loading ? <Spinner /> : tab === 'items' ? <ItemList items={items} hidden={showHidden} saving={saving} onHide={(item) => { setTarget({ kind: 'item', id: item.id, title: item.name }); setReason('') }} onRestore={(item) => void restore('item', item.id)} /> : tab === 'samples' ? <SampleList hiddenIds={hiddenSampleIds} saving={saving} onHide={(item) => { setTarget({ kind: 'sample', id: item.id, title: item.name }); setReason('') }} onRestore={(item) => void restore('sample', item.id)} /> : tab === 'reviews' ? <ReviewList reviews={reviews} hidden={showHidden} saving={saving} onHide={(review) => { setTarget({ kind: 'review', id: review.id, title: `@${review.nickname} 的评论` }); setReason('') }} onRestore={(review) => void restore('review', review.id)} /> : <ProfileList profiles={profiles} saving={saving} onRestrict={(profile) => { setTarget({ kind: 'profile', id: profile.userId, title: `@${profile.foodieId}` }); setReason('') }} onRestore={(profile) => void restore('profile', profile.userId)} />}
    {target && <div className="admin-dialog" role="dialog" aria-modal="true" aria-label="确认审核操作"><div className="admin-dialog__card stack"><strong>{target.kind === 'item' ? '下架投稿' : target.kind === 'sample' ? '隐藏起始示例' : target.kind === 'review' ? '隐藏评论' : '限制用户内容发布'}：{target.title}</strong><label className="field"><span className="field__label">原因 <span className="required-mark">*</span></span><textarea className="text-area" maxLength={120} value={reason} onChange={(event) => setReason(event.target.value)} placeholder={target.kind === 'profile' ? '例如：吃货 ID 含明显不当内容' : '例如：广告、攻击性内容或明显不实信息'} /></label><p className="tiny faint">此操作不会删除原数据；恢复后会重新公开。限制用户后，该用户无法继续发布投稿或评论，仍可修改吃货 ID。</p><div className="btn-row"><button type="button" className="btn" disabled={saving} onClick={() => setTarget(null)}>取消</button><button type="button" className="btn btn--red" disabled={saving || reason.trim().length < 2} onClick={() => void confirmModeration()}><EyeOff size={15} />{saving ? '处理中…' : '确认处理'}</button></div></div></div>}
  </div>
}

function ItemList({ items, hidden, saving, onHide, onRestore }: { items: FoodItem[]; hidden: boolean; saving: boolean; onHide: (item: FoodItem) => void; onRestore: (item: FoodItem) => void }) { if (!items.length) return <EmptyState art="🧾" title={hidden ? '没有已隐藏投稿' : '没有可管理的投稿'} />; return <div className="stack">{items.map((item) => <article key={item.id} className={`info-card ${item.status === 'hidden' ? 'admin-item--hidden' : ''}`}><div className="row-between"><strong>{item.name}</strong><span className="tiny faint">{item.venue}</span></div><p className="tiny muted mt-8">{item.status === 'hidden' ? `已隐藏：${item.hiddenReason ?? '未填写原因'}` : '公开中'}</p>{item.status === 'hidden' ? <button type="button" className="btn btn--soft mt-8" disabled={saving} onClick={() => onRestore(item)}><Check size={15} />恢复公开</button> : <button type="button" className="btn btn--red mt-8" disabled={saving} onClick={() => onHide(item)}><EyeOff size={15} />下架投稿</button>}</article>)}</div> }
function SampleList({ hiddenIds, saving, onHide, onRestore }: { hiddenIds: string[]; saving: boolean; onHide: (item: FoodItem) => void; onRestore: (item: FoodItem) => void }) { const hidden = new Set(hiddenIds); return <div className="stack">{SAMPLE_ITEMS.map((item) => <article key={item.id} className={`info-card ${hidden.has(item.id) ? 'admin-item--hidden' : ''}`}><div className="row-between"><strong>{item.name}</strong><span className="tiny faint">起始示例</span></div><p className="tiny muted mt-8">{hidden.has(item.id) ? '已从所有前台列表隐藏' : '当前公开，会参与展示与盲盒'}</p>{hidden.has(item.id) ? <button type="button" className="btn btn--soft mt-8" disabled={saving} onClick={() => onRestore(item)}><Check size={15} />恢复公开</button> : <button type="button" className="btn btn--red mt-8" disabled={saving} onClick={() => onHide(item)}><EyeOff size={15} />隐藏示例</button>}</article>)}</div> }
function ReviewList({ reviews, hidden, saving, onHide, onRestore }: { reviews: AdminReview[]; hidden: boolean; saving: boolean; onHide: (review: AdminReview) => void; onRestore: (review: AdminReview) => void }) { if (!reviews.length) return <EmptyState art="💬" title={hidden ? '没有已隐藏评论' : '没有可审核评论'} />; return <div className="stack">{reviews.map((review) => <article key={review.id} className={`info-card ${review.moderationStatus === 'hidden' ? 'admin-item--hidden' : ''}`}><div className="row-between"><strong>@{review.nickname} · {review.rating} 星</strong><span className="tiny faint">{review.itemName}</span></div><p className="mt-8">{review.text}</p><p className="tiny muted mt-8">{review.moderationStatus === 'hidden' ? `已隐藏：${review.moderationReason ?? '未填写原因'}` : '公开中'}</p>{review.moderationStatus === 'hidden' ? <button type="button" className="btn btn--soft mt-8" disabled={saving} onClick={() => onRestore(review)}><Check size={15} />恢复公开</button> : <button type="button" className="btn btn--red mt-8" disabled={saving} onClick={() => onHide(review)}><EyeOff size={15} />隐藏评论</button>}</article>)}</div> }
function ProfileList({ profiles, saving, onRestrict, onRestore }: { profiles: AdminProfile[]; saving: boolean; onRestrict: (profile: AdminProfile) => void; onRestore: (profile: AdminProfile) => void }) { if (!profiles.length) return <EmptyState art="👥" title="还没有已初始化资料的用户" />; return <div className="stack">{profiles.map((profile) => <article key={profile.userId} className={`info-card ${profile.restricted ? 'admin-item--hidden' : ''}`}><div className="row-between"><strong><UserRound size={16} /> @{profile.foodieId}</strong><span className="tiny faint">投稿 {profile.itemCount} · 评论 {profile.reviewCount}</span></div><p className="tiny muted mt-8">{profile.defaultArea || '未设置默认地点'}{profile.hometown ? ` · ${profile.hometown}` : ''}</p><p className="tiny muted mt-8">{profile.restricted ? `已限制：${profile.restrictionReason ?? '未填写原因'}` : '可正常发布内容'}</p>{profile.restricted ? <button type="button" className="btn btn--soft mt-8" disabled={saving} onClick={() => onRestore(profile)}><UserCheck size={15} />解除限制</button> : <button type="button" className="btn btn--red mt-8" disabled={saving} onClick={() => onRestrict(profile)}><UserX size={15} />限制内容发布</button>}</article>)}</div> }
function Stat({ label, value, icon }: { label: string; value: number; icon: ReactNode }) { return <div className="admin-stat"><span>{icon} {label}</span><strong>{value}</strong></div> }
function TabButton({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: ReactNode; children: string }) { return <button type="button" role="tab" aria-selected={active} className={`btn ${active ? 'btn--blue' : ''}`} onClick={onClick}>{icon}{children}</button> }
function PageTitle() { return <div className="topbar" style={{ position: 'static', padding: '8px 0' }}><span className="topbar__title"><ShieldCheck size={18} />内容管理</span></div> }
