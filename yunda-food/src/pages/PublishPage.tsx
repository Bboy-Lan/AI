import { useMemo, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, CloudOff, ImagePlus, Loader2, Ticket } from 'lucide-react'
import type { Category, FoodItem, OilLevel, PriceMode, SpicyLevel, Staple, SubmissionInput, SweetSalty } from '../types'
import {
  AREAS,
  CAMPUSES,
  HOMETOWNS,
  OIL_LABEL,
  SPICY_LABEL,
  STAPLE_LABEL,
  SWEETSALTY_LABEL,
} from '../data/campus'
import { repo } from '../lib/repo'
import { useProfile } from '../lib/profile'
import { compressImage, ImagePickError, MAX_SOURCE_BYTES } from '../lib/imageProcess'
import { Chip, Notice, Seg, Stamp } from '../components/ui'

function monthNow(): string {
  return new Date().toISOString().slice(0, 7)
}

type Phase = 'form' | 'sending' | 'remote-ok' | 'local-draft' | 'error'

export function PublishPage() {
  const navigate = useNavigate()
  const { profile, updateProfile } = useProfile()

  const [phase, setPhase] = useState<Phase>('form')
  const [savedItem, setSavedItem] = useState<FoodItem | null>(null)
  const [message, setMessage] = useState('')

  // 表单
  const [name, setName] = useState('')
  const [category, setCategory] = useState<Category>('meal')
  const [campusId, setCampusId] = useState(profile.campusId)
  const [areaId, setAreaId] = useState(AREAS[0].id)
  const [venue, setVenue] = useState('')
  const [priceMode, setPriceMode] = useState<PriceMode>('per_item')
  const [price, setPrice] = useState<string>('')
  const [spicy, setSpicy] = useState<SpicyLevel>(1)
  const [sweetSalty, setSweetSalty] = useState<SweetSalty>('salty')
  const [oil, setOil] = useState<OilLevel>('normal')
  const [staple, setStaple] = useState<Staple | ''>('')
  const [flavorsText, setFlavorsText] = useState('')
  const [cuisine, setCuisine] = useState('')
  const [description, setDescription] = useState('')
  const [image, setImage] = useState<string | null>(null)
  const [imgError, setImgError] = useState('')
  const [nickname, setNickname] = useState('')
  const [hometown, setHometown] = useState(profile.hometown ?? '')
  const [ate, setAte] = useState(true)
  const [ateDate, setAteDate] = useState(monthNow())

  const areas = useMemo(() => AREAS.filter((a) => a.campusId === campusId), [campusId])

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

  const valid =
    name.trim().length >= 2 &&
    venue.trim().length >= 2 &&
    Number(price) > 0 &&
    Number(price) <= 999 &&
    description.trim().length >= 5 &&
    nickname.trim().length >= 1 &&
    image !== null &&
    (!ate || Boolean(ateDate)) &&
    (campusId !== 'ynu-chenggong' || Boolean(areaId))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!valid || !image) return
    if (campusId !== 'ynu-chenggong') {
      updateProfile({ campusId })
    }
    const input: SubmissionInput = {
      name: name.trim().slice(0, 30),
      category,
      venue: venue.trim().slice(0, 40),
      areaId: campusId === 'ynu-chenggong' ? areaId : `other-${campusId}`,
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
      cuisine: cuisine || null,
      description: description.trim().slice(0, 200),
      image,
      author: {
        nickname: nickname.trim().slice(0, 16),
        hometown: hometown || null,
        ate,
        ateDate: ate ? ateDate : null,
      },
    }
    setPhase('sending')
    const res = await repo.submit(input)
    if (res.ok) {
      setSavedItem(res.item)
      setPhase('remote-ok')
    } else if (res.savedDraft && res.item) {
      setSavedItem(res.item)
      setMessage(res.message)
      setPhase('local-draft')
    } else {
      setMessage(res.message)
      setPhase('error')
    }
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

      <Notice tone={repo.connected ? 'green' : 'yellow'}>
        {repo.connected ? (
          <>已接通共享数据库：投稿与图片会真实保存，其他手机可见。</>
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
            <label className="field__label">名称 *</label>
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
            <label className="field__label">类别 *</label>
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
            <label className="field__label">校区 *</label>
            <select className="select-input" value={campusId} onChange={(e) => setCampusId(e.target.value)}>
              {CAMPUSES.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {campusId === 'ynu-chenggong' ? (
            <div className="field">
              <label className="field__label">在哪个片区 *</label>
              <select className="select-input" value={areaId} onChange={(e) => setAreaId(e.target.value)}>
                {areas.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
          ) : (
            <Notice tone="blue">该校区还没有区域表，位置写在下面店名/摊位里即可，你将是第一批投稿。</Notice>
          )}

          <div className="field">
            <label className="field__label">具体店 / 食堂窗口 / 摊位 *</label>
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
            <label className="field__label">价格口径 *</label>
            <Seg<PriceMode>
              value={priceMode}
              onChange={setPriceMode}
              options={[
                { value: 'per_item', label: '单份（一碗/一杯/一份）' },
                { value: 'per_person', label: '人均（进店点菜）' },
              ]}
            />
            <div className="row-between mt-8">
              <div className="price" style={{ color: 'var(--ink)' }}>
                <span className="price__sym">¥</span>
                <input
                  type="number"
                  inputMode="decimal"
                  min={0.5}
                  max={999}
                  step={0.5}
                  className="price__num"
                  style={{ width: 90, border: 0, outline: 0, font: 'inherit', color: 'inherit', background: 'transparent' }}
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  required
                />
              </div>
              <span className="tiny faint">{priceMode === 'per_item' ? '元 / 份' : '元 / 人'}</span>
            </div>
          </div>

          <div className="field">
            <label className="field__label">辣度 *</label>
            <div className="chips-row" style={{ flexWrap: 'wrap', overflow: 'visible' }}>
              {[0, 1, 2, 3].map((v) => (
                <Chip key={v} active={spicy === v} onClick={() => setSpicy(v as SpicyLevel)}>
                  {SPICY_LABEL[v as SpicyLevel]}
                </Chip>
              ))}
            </div>
          </div>

          <div className="field">
            <label className="field__label">咸甜 *</label>
            <div className="chips-row" style={{ flexWrap: 'wrap', overflow: 'visible' }}>
              {(['light', 'salty', 'sweet'] as SweetSalty[]).map((v) => (
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
            <label className="field__label">油重 *</label>
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
            <label className="field__label">家乡风味线索（可选）</label>
            <select className="select-input" value={cuisine} onChange={(e) => setCuisine(e.target.value)}>
              <option value="">无 / 不明显</option>
              {Array.from(new Set(HOMETOWNS.map((h) => h.cuisine).filter(Boolean))).map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div className="field">
            <label className="field__label">两句真话 *</label>
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
          <h2 className="display-md">照片与署名</h2>

          <div className="field">
            <label className="field__label">实拍照片 *（≤ {Math.round(MAX_SOURCE_BYTES / 1024 / 1024)}MB）</label>
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

          <div className="field">
            <label className="field__label">昵称 *</label>
            <input
              className="text-input"
              maxLength={16}
              placeholder="随便起，不用真名学号"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              required
            />
          </div>

          <div className="field">
            <label className="field__label">家乡（可选，仅作家乡味线索展示）</label>
            <select className="select-input" value={hometown} onChange={(e) => setHometown(e.target.value)}>
              <option value="">不填</option>
              {HOMETOWNS.map((h) => (
                <option key={h.id} value={h.id}>{h.label}</option>
              ))}
            </select>
          </div>

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

        {phase === 'error' && <Notice tone="red">{message}</Notice>}

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
