import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, CloudOff, ImagePlus, Loader2, Navigation, RotateCw, Ticket } from 'lucide-react'
import type { Category, FoodItem, MyProfileStatus, OilLevel, PriceMode, SpicyLevel, Staple, SubmissionInput, SweetSalty } from '../types'
import {
  AREAS,
  OIL_LABEL,
  SPICY_LABEL,
  STAPLE_LABEL,
  SWEETSALTY_LABEL,
} from '../data/campus'
import { repo, useRepoState, notifyDataChanged } from '../lib/repo'
import { useProfile } from '../lib/profile'
import { compressImage, ImagePickError, MAX_SOURCE_BYTES } from '../lib/imageProcess'
import { Chip, Notice, Seg, Stamp } from '../components/ui'

function monthNow(): string {
  return new Date().toISOString().slice(0, 7)
}

type Phase = 'form' | 'sending' | 'remote-ok' | 'local-draft' | 'error'

export function PublishPage() {
  const navigate = useNavigate()
  const { profile } = useProfile()
  const repoState = useRepoState()

  const [phase, setPhase] = useState<Phase>('form')
  const [savedItem, setSavedItem] = useState<FoodItem | null>(null)
  const [message, setMessage] = useState('')
  const [restriction, setRestriction] = useState<MyProfileStatus | null>(null)
  const inFlight = useRef(false)

  // 表单
  const [name, setName] = useState('')
  const [category, setCategory] = useState<Category>('meal')
  const [campusId] = useState(profile.campusId)
  const [areaId, setAreaId] = useState('ynu-chenggong')
  const [venue, setVenue] = useState('')
  const [priceMode, setPriceMode] = useState<PriceMode>('per_item')
  const [price, setPrice] = useState<string>('')
  const [spicy, setSpicy] = useState<SpicyLevel>(1)
  const [sweetSalty, setSweetSalty] = useState<SweetSalty>('salty')
  const [oil, setOil] = useState<OilLevel>('normal')
  const [staple, setStaple] = useState<Staple | ''>('')
  const [flavorsText, setFlavorsText] = useState('')
  const [description, setDescription] = useState('')
  const [image, setImage] = useState<string | null>(null)
  const [imgError, setImgError] = useState('')
  const [ate, setAte] = useState(true)
  const [ateDate, setAteDate] = useState(monthNow())
  const [placeCoords, setPlaceCoords] = useState<{ latitude: number; longitude: number } | null>(null)
  const [placeNotice, setPlaceNotice] = useState<string | null>(null)

  const areas = useMemo(() => AREAS, [])

  useEffect(() => {
    if (repo.mode !== 'remote') return
    let active = true
    repo.getMyProfileStatus().then((status) => active && setRestriction(status)).catch(() => undefined)
    return () => { active = false }
  }, [])

  const onPickImage = async (file: File | undefined) => {
    if (!file) return
    setImgError('')
    try {
      const dataUrl = await compressImage(file)
      setImage(dataUrl)
    } catch (e) {
      setImage(null)
      setImgError(e instanceof ImagePickError ? e.message : '图片处理失败')
    }
  }

  const recordPlaceLocation = () => {
    if (!navigator.geolocation || !window.isSecureContext) {
      setPlaceNotice('当前环境无法定位；仍可按文字地点投稿，但不会进入附近推荐。')
      return
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setPlaceCoords({ latitude: position.coords.latitude, longitude: position.coords.longitude })
        setPlaceNotice('已记录菜品大致位置，只用于附近匹配，不记录你的实时轨迹。')
      },
      () => setPlaceNotice('暂时无法记录位置；你仍可继续投稿。'),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
    )
  }

  const valid =
    name.trim().length >= 2 &&
    venue.trim().length >= 2 &&
    Number(price) > 0 &&
    Number(price) <= 999 &&
    description.trim().length >= 5 &&
    Boolean(profile.foodieId?.trim()) &&
    image !== null &&
    (!ate || Boolean(ateDate))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!valid || !image || inFlight.current) return
    inFlight.current = true
    const input: SubmissionInput = {
      name: name.trim().slice(0, 30),
      category,
      venue: venue.trim().slice(0, 40),
      areaId,
      campusId,
      priceMode,
      price: Math.round(Number(price) * 100) / 100,
      spicy,
      sweetSalty,
      oil,
      staple: category === 'drink' ? null : staple === '' ? null : staple,
      flavors: flavorsText
        .split(/[\s,，、;；]+/)
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 6),
      description: description.trim().slice(0, 200),
      image,
      latitude: placeCoords?.latitude ?? null,
      longitude: placeCoords?.longitude ?? null,
      author: {
        nickname: profile.foodieId!.trim(),
        hometown: profile.hometown ?? null,
        ate,
        ateDate: ate ? ateDate : null,
      },
    }
    setPhase('sending')
    const res = await repo.submit(input)
    if (res.ok) {
      setSavedItem(res.item)
      setPhase('remote-ok')
      // 缓存已就地插入新投稿；通知各页面刷新（dropCache=false，避免无谓重复请求）
      notifyDataChanged('item-created', false)
    } else if (res.savedDraft && res.item) {
      setSavedItem(res.item)
      setMessage(res.message)
      setPhase('local-draft')
    } else {
      setMessage(res.message)
      setPhase('error')
    }
    inFlight.current = false
  }

  if (phase === 'remote-ok' && savedItem) {
    return (
      <div className="page">
        <Header onBack={() => navigate('/')} />
        <div className="stack-lg mt-20">
          <Notice tone="green">
            <b>发布成功，已进入共享数据库。</b>其他手机打开同一个链接就能刷到这条投稿。
          </Notice>
          <button type="button" className="btn btn--blue btn--lg btn--block" onClick={() => navigate(`/item/${savedItem.id}`)}>
            查看这条投稿
          </button>
          <button type="button" className="btn btn--ghost btn--block" onClick={() => navigate('/')}>
            回到找吃的
          </button>
        </div>
      </div>
    )
  }

  if (restriction?.restricted) {
    return (
      <div className="page">
        <Header onBack={() => navigate('/me')} />
        <div className="stack-lg mt-20">
          <Notice tone="red"><b>当前不能发布投稿。</b>{restriction.reason ? `处理说明：${restriction.reason}` : '请到“我的”查看处理说明。'} 浏览、收藏和修改资料仍可使用。</Notice>
          <button type="button" className="btn btn--soft btn--block" onClick={() => navigate('/me')}>返回我的</button>
        </div>
      </div>
    )
  }

  if (phase === 'local-draft' && savedItem) {
    return (
      <div className="page">
        <Header onBack={() => navigate('/')} />
        <div className="stack-lg mt-20">
          <Notice tone="yellow">
            <div style={{ display: 'flex', gap: 8 }}>
              <CloudOff size={18} style={{ flex: 'none' }} />
              <div>
                <b>{message}</b>
                <div style={{ marginTop: 6 }}>
                  我们没有假装发布成功：这条内容已存为“本机草稿”，可在“我的”里看到，换手机前不会丢，但其他人搜不到。
                </div>
              </div>
            </div>
          </Notice>

          <div className="info-card">
            <div className="row-between">
              <span className="brand-font" style={{ fontSize: 18 }}>{savedItem.name}</span>
              <Stamp variant="blue">本机草稿</Stamp>
            </div>
            <p className="tiny muted mt-8">{savedItem.venue} · ¥{savedItem.price}</p>
          </div>

          <div className="info-card">
            <div className="field__label" style={{ marginBottom: 8 }}>
              让它真正上线，只需一个配置动作
            </div>
            <ol style={{ margin: 0, paddingLeft: 20, fontSize: 13, lineHeight: 1.9 }}>
              <li>在 supabase.com 免费建一个项目（约 2 分钟）</li>
              <li>打开 SQL Editor，粘贴并执行项目内 <b>server/supabase-schema.sql</b></li>
              <li>把 Project URL 和 anon public key 填进 <b>.env.local</b>（模板见 .env.example），重启 <code>npm run dev</code></li>
            </ol>
            <p className="tiny faint mt-8">
              配置后投稿、图片和评论自动走云端，两部手机可互相看到；口味和收藏仍然只留本机。
            </p>
          </div>

          <button type="button" className="btn btn--blue btn--block" onClick={() => navigate(`/item/${savedItem.id}`)}>
            查看本机草稿
          </button>
          <button type="button" className="btn btn--ghost btn--block" onClick={() => navigate('/')}>
            回到找吃的
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <Header onBack={() => navigate(-1)} />

      <Notice tone={repoState === 'online' ? 'green' : repoState === 'offline' ? 'red' : 'yellow'}>
        {repoState === 'online' ? (
          <>已接通共享数据库：投稿与图片会真实保存，其他手机可见。</>
        ) : repoState === 'checking' ? (
          <>正在连接共享数据库……连接成功后投稿会直接云端共享。</>
        ) : repoState === 'offline' ? (
          <>
            <b>云端当前连不上</b>：{repo.getLastError() ?? '请检查网络或数据库配置'}。提交会失败并提示重试，不会假装发布成功。
          </>
        ) : (
          <>
            当前是<b>示例模式</b>：提交后只存本机草稿并明确标注，不会假报“发布成功”。接通云端只需页面底部说明的一个配置动作。
          </>
        )}
      </Notice>

      <form className="stack-lg mt-16" onSubmit={submit}>
        <section className="info-card stack-lg">
          <h2 className="display-md">这口吃的是什么</h2>

          <div className="field">
            <label className="field__label">名称 <span className="required-mark">*</span></label>
            <input
              className="text-input"
              maxLength={30}
              placeholder="例：过桥米线套餐、炸洋芋、手打柠檬茶"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="field">
            <label className="field__label">类别 <span className="required-mark">*</span></label>
            <Seg<Category>
              value={category}
              onChange={setCategory}
              options={[
                { value: 'meal', label: '正餐' },
                { value: 'snack', label: '小吃' },
                { value: 'drink', label: '饮品' },
              ]}
            />
          </div>

          <div className="field">
            <label className="field__label">城市</label>
            <div className="text-input" aria-label="投稿城市">昆明市</div>
          </div>

          <div className="field">
            <label className="field__label">地点 <span className="required-mark">*</span></label>
            <select className="select-input" value={areaId} onChange={(e) => setAreaId(e.target.value)}>
              {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <span className="field__hint">仅支持昆明市内地点；没有坐标的内容不会进入“附近”排序。</span>
          </div>

          <div className="field">
            <label className="field__label">菜品大致位置（推荐）</label>
            <button type="button" className="btn btn--soft" onClick={recordPlaceLocation}><Navigation size={14} />{placeCoords ? '重新记录当前位置' : '在菜品附近记录当前位置'}</button>
            <span className="field__hint">建议到店附近再记录；只保存这条菜品的大致坐标，浏览者位置不会保存。</span>
            {placeNotice && <span className="field__hint">{placeNotice}</span>}
          </div>

          <div className="field">
            <label className="field__label">具体店 / 食堂窗口 / 餐馆 <span className="required-mark">*</span></label>
            <input
              className="text-input"
              maxLength={40}
              placeholder="例：知味堂二楼云南风味窗口 / 仕林街南口炸洋芋摊"
              value={venue}
              onChange={(e) => setVenue(e.target.value)}
              required
            />
          </div>
        </section>

        <section className="info-card stack-lg">
          <h2 className="display-md">多少钱、什么味</h2>

          <div className="field">
            <label className="field__label">价格口径 <span className="required-mark">*</span></label>
            <Seg<PriceMode>
              value={priceMode}
              onChange={setPriceMode}
              options={[
                { value: 'per_item', label: '单份（一碗/一杯/一份）' },
                { value: 'per_person', label: '人均（进店点菜）' },
              ]}
            />
            <div className="row-between mt-8">
              <div className="price price-input" style={{ color: 'var(--red-deep)' }}>
                <span className="price__sym">￥</span>
                <input
                  type="number"
                  inputMode="decimal"
                  min={0.5}
                  max={999}
                  step={0.5}
                  className="price__num"
                  style={{ width: 150, minHeight: 48, border: '1.5px solid var(--red-deep)', borderRadius: 10, outline: 0, font: 'inherit', color: 'inherit', background: 'var(--cream)', padding: '0 10px' }}
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  required
                />
              </div>
              <span className="tiny faint">{priceMode === 'per_item' ? '元 / 份' : '元 / 人'}</span>
            </div>
          </div>

          <div className="field">
            <label className="field__label">辣度 <span className="required-mark">*</span></label>
            <div className="chips-row" style={{ flexWrap: 'wrap', overflow: 'visible' }}>
              {[0, 1, 2, 3].map((v) => (
                <Chip key={v} active={spicy === v} onClick={() => setSpicy(v as SpicyLevel)}>
                  {SPICY_LABEL[v as SpicyLevel]}
                </Chip>
              ))}
            </div>
          </div>

          <div className="field">
            <label className="field__label">咸甜 <span className="required-mark">*</span></label>
            <div className="chips-row" style={{ flexWrap: 'wrap', overflow: 'visible' }}>
              {(['light', 'normal', 'salty', 'sweet'] as SweetSalty[]).map((v) => (
                <Chip key={v} active={sweetSalty === v} onClick={() => setSweetSalty(v)}>
                  {SWEETSALTY_LABEL[v]}
                </Chip>
              ))}
            </div>
          </div>

          {category !== 'drink' && (
            <div className="field">
              <label className="field__label">面 / 米饭（小吃可不选）</label>
              <div className="chips-row" style={{ flexWrap: 'wrap', overflow: 'visible' }}>
                <Chip active={staple === ''} onClick={() => setStaple('')}>不适用</Chip>
                {(['noodle', 'rice'] as Staple[]).map((v) => (
                  <Chip key={v} active={staple === v} onClick={() => setStaple(v)}>
                    {STAPLE_LABEL[v]}
                  </Chip>
                ))}
              </div>
            </div>
          )}

          <div className="field">
            <label className="field__label">油重 <span className="required-mark">*</span></label>
            <div className="chips-row" style={{ flexWrap: 'wrap', overflow: 'visible' }}>
              {(['less', 'normal', 'heavy'] as OilLevel[]).map((v) => (
                <Chip key={v} active={oil === v} onClick={() => setOil(v)}>
                  {OIL_LABEL[v]}
                </Chip>
              ))}
            </div>
          </div>

          <div className="field">
            <label className="field__label">口味关键词</label>
            <input
              className="text-input"
              maxLength={40}
              placeholder="空格/逗号隔开，如：麻辣 鸡汤 解辣 折耳根"
              value={flavorsText}
              onChange={(e) => setFlavorsText(e.target.value)}
            />
          </div>

          <div className="field">
            <label className="field__label">两句真话 <span className="required-mark">*</span></label>
            <textarea
              className="text-area"
              maxLength={200}
              placeholder="味道、份量、大概位置、排队久不久、踩雷或惊喜……（5–200 字）"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
            />
          </div>
        </section>

        <section className="info-card stack-lg">
          <h2 className="display-md">照片与发布身份</h2>

          <div className="field">
            <label className="field__label">实拍照片 <span className="required-mark">*</span>（≤ {Math.round(MAX_SOURCE_BYTES / 1024 / 1024)}MB）</label>
            {image ? (
              <div className="photo-picker" style={{ justifyContent: 'flex-start' }}>
                <img src={image} alt="投稿预览" />
                <button type="button" className="btn btn--soft" style={{ margin: 8 }} onClick={() => setImage(null)}>
                  重新选择
                </button>
              </div>
            ) : (
              <label className="photo-picker">
                <ImagePlus size={26} />
                点击选一张实拍图（自动压缩到约 1280px）
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  style={{ display: 'none' }}
                  onChange={(e) => void onPickImage(e.target.files?.[0])}
                />
              </label>
            )}
            {imgError && <span className="tiny" style={{ color: 'var(--red-deep)' }}>{imgError}</span>}
          </div>

          <Notice tone="blue">将以吃货 ID「{profile.foodieId || '未设置'}」发布；昵称与家乡只可在“我的”修改。</Notice>

          <label className="switch-row" style={{ border: '1.5px solid var(--line-strong)' }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 13.5 }}>我亲自吃过（自报，不认证）</div>
              <div className="tiny faint">勾选后填写大致时间；未吃过也可以转发线索，但不会显示“吃过”</div>
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
            <input
              type="month"
              className="text-input"
              max={monthNow()}
              value={ateDate}
              onChange={(e) => setAteDate(e.target.value)}
            />
          )}

          <p className="tiny faint">
            提交即表示这是你的真实经历，不刷榜、不发广告；违法、辱骂或泄露隐私的内容会被隐藏。没有商家入驻、没有付费排名。
          </p>
        </section>

        {phase === 'error' && (
          <Notice tone="red">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <b>没有发布成功。</b>
                {message}
              </div>
              <button
                type="button"
                className="btn btn--soft"
                style={{ alignSelf: 'flex-start' }}
                onClick={() => setPhase('form')}
              >
                <RotateCw size={15} /> 保留内容，重试提交
              </button>
            </div>
          </Notice>
        )}

        <button type="submit" className="btn btn--red btn--lg btn--block" disabled={!valid || phase === 'sending'}>
          {phase === 'sending' ? (
            <>
              <Loader2 size={18} className="spin" /> 提交中…
            </>
          ) : (
            <>
              <CheckCircle2 size={18} /> 确认投稿
            </>
          )}
        </button>
        {!valid && (
          <p className="tiny faint" style={{ textAlign: 'center', marginTop: -8 }}>
            带 * 的项都填好、照片选好才能提交
          </p>
        )}
      </form>
    </div>
  )
}

function Header({ onBack }: { onBack: () => void }) {
  return (
    <div className="topbar" style={{ position: 'static', padding: '8px 0 6px' }}>
      <button type="button" className="icon-btn" onClick={onBack} aria-label="返回">
        <ArrowLeft size={17} />
      </button>
      <span className="topbar__title" style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <Ticket size={18} color="var(--red-deep)" /> 发布一条吃喝推荐
      </span>
    </div>
  )
}
