import { useState } from 'react'
import { ArrowLeft, Ticket } from 'lucide-react'
import type {
  OilPref,
  SpicyPref,
  StaplePref,
  SweetSaltyPref,
} from '../types'
import {
  DEFAULT_CITY_ID,
  OIL_PREF_LABEL,
  QUICK_BUDGETS_PER_PERSON,
  SPICY_PREF_LABEL,
  STAPLE_PREF_LABEL,
  SWEETSALTY_PREF_LABEL,
} from '../data/campus'
import { useProfile } from '../lib/profile'
import { repo } from '../lib/repo'
import { Chip, Notice } from './ui'

function ChoiceRow<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: T; label: string }>
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="chips-row" style={{ flexWrap: 'wrap', overflow: 'visible' }}>
      {options.map((o) => (
        <Chip key={String(o.value)} active={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
        </Chip>
      ))}
    </div>
  )
}

export function Onboarding({ mode, onClose }: { mode: 'gate' | 'edit'; onClose?: () => void }) {
  const { profile, saveProfile, updateProfile } = useProfile()
  const [hometown, setHometown] = useState(profile.hometown ?? '')
  const [spicy, setSpicy] = useState<SpicyPref>(profile.spicy)
  const [sweetSalty, setSweetSalty] = useState<SweetSaltyPref>(profile.sweetSalty)
  const [staple, setStaple] = useState<StaplePref>(profile.staple)
  const [oil, setOil] = useState<OilPref>(profile.oil)
  const [quickBudget, setQuickBudget] = useState<number | null>(profile.quickBudget)
  const [foodieId, setFoodieId] = useState(profile.foodieId ?? '')
  const [defaultArea, setDefaultArea] = useState(profile.defaultArea ?? '')
  const [saving, setSaving] = useState(false)
  const [identityError, setIdentityError] = useState<string | null>(null)

  const buildPayload = () => ({
    campusId: DEFAULT_CITY_ID,
    hometown: hometown.trim() || null,
    spicy,
    sweetSalty,
    staple,
    oil,
    quickBudget,
  })

  const save = async (skipped: boolean) => {
    const normalized = foodieId.trim()
    const normalizedHometown = hometown.trim()
    if (!/^[A-Za-z0-9_\-\u4e00-\u9fff]{2,16}$/.test(normalized)) {
      setIdentityError('吃货 ID 需为 2–16 个中文、字母、数字、下划线或连字符，且不能含明显不当词。')
      return
    }
    if (normalizedHometown.length < 2) {
      setIdentityError('请如实填写至少 2 个字的户籍/吃货家乡，例如“昭通镇雄”。')
      return
    }
    setSaving(true)
    setIdentityError(null)
    const payload = { ...buildPayload(), hometown: normalizedHometown, foodieId: normalized, defaultArea: defaultArea || null }
    try {
      if (repo.mode === 'remote') {
        await repo.saveIdentity({ foodieId: normalized, hometown: payload.hometown, defaultArea: payload.defaultArea, tastes: payload })
      }
      const localPayload = skipped ? { ...payload, skipped: true, spicy: 'any' as SpicyPref, sweetSalty: 'any' as SweetSaltyPref, staple: 'any' as StaplePref, oil: 'any' as OilPref, quickBudget: null } : { ...payload, skipped: false }
      if (mode === 'gate') saveProfile(localPayload)
      else { updateProfile(localPayload); onClose?.() }
    } catch (e) {
      setIdentityError(e instanceof Error ? e.message : '吃货 ID 保存失败，请检查网络后重试。')
    } finally { setSaving(false) }
  }

  return (
    <div className="fullscreen-mask">
      <div className="fullscreen-mask__inner">
        {mode === 'edit' && (
          <button type="button" className="icon-btn" onClick={onClose} aria-label="返回" style={{ marginBottom: 10 }}>
            <ArrowLeft size={17} />
          </button>
        )}

        <div className="rise">
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 4 }}>
            <span className="hero__brand-mark" style={{ position: 'static', width: 38, height: 38 }}>
              <Ticket size={20} />
            </span>
            <span className="brand-font" style={{ fontSize: 21 }}>
              云大饭搭子
            </span>
          </div>
          <h1 className="display-xl" style={{ margin: '8px 0 4px' }}>
            先补全你的吃货身份
          </h1>
          <p className="muted" style={{ fontSize: 13, marginBottom: 14 }}>
            吃货 ID 和户籍/吃货家乡为进入饭搭子的必填资料；后者用于同乡推荐。请如实填写到市县/区，不填精确住址。
          </p>
        </div>

        <div className="stack-lg" style={{ gap: 13 }}>
          <div className="field">
            <label className="field__label">吃货 ID <span className="required-mark">*</span></label>
            <input className="text-input" value={foodieId} maxLength={16} autoFocus placeholder="例：云大面条研究员" onChange={(e) => setFoodieId(e.target.value)} />
            <span className="field__hint">2–16 个中文、字母、数字、下划线或连字符；拒绝辱骂、色情等明显不当内容。</span>
          </div>
          <div className="field">
            <label className="field__label">所在城市</label>
            <div className="text-input">昆明市</div>
          </div>
          <div className="field">
            <label className="field__label">常用地点说明（可选）</label>
            <input className="text-input" value={defaultArea} maxLength={40} placeholder="例：云南大学呈贡校区" onChange={(e) => setDefaultArea(e.target.value)} />
          </div>

          <div className="field">
            <label className="field__label">
              吃货家乡 <span className="required-mark">*</span><span className="field__hint">请如实填写户籍/家乡地点，如“昭通镇雄”；仅用于匹配同乡投稿</span>
            </label>
            <input
              className="text-input"
              value={hometown}
              onChange={(e) => setHometown(e.target.value)}
              maxLength={30}
              placeholder="例：昭通镇雄"
            />
          </div>

          <div className="field">
            <div className="field__label">口味资料（可选，之后可在“我的”补充）</div>
            <label className="field__label">吃辣水平</label>
            <ChoiceRow<SpicyPref>
              options={([0, 1, 2, 3, 'any'] as SpicyPref[]).map((v) => ({
                value: v,
                label: SPICY_PREF_LABEL[v],
              }))}
              value={spicy}
              onChange={setSpicy}
            />
          </div>

          <div className="field">
            <label className="field__label">咸甜偏好</label>
            <ChoiceRow<SweetSaltyPref>
              options={(['light', 'normal', 'salty', 'sweet', 'any'] as SweetSaltyPref[]).map((v) => ({
                value: v,
                label: SWEETSALTY_PREF_LABEL[v],
              }))}
              value={sweetSalty}
              onChange={setSweetSalty}
            />
          </div>

          <div className="field">
            <label className="field__label">主食站队</label>
            <ChoiceRow<StaplePref>
              options={(['noodle', 'rice', 'any'] as StaplePref[]).map((v) => ({
                value: v,
                label: STAPLE_PREF_LABEL[v],
              }))}
              value={staple}
              onChange={setStaple}
            />
          </div>

          <div className="field">
            <label className="field__label">油重点</label>
            <ChoiceRow<OilPref>
              options={(['less', 'normal', 'heavy', 'any'] as OilPref[]).map((v) => ({
                value: v,
                label: OIL_PREF_LABEL[v],
              }))}
              value={oil}
              onChange={setOil}
            />
          </div>

          <div className="field">
            <label className="field__label">
              常用预算（可选）<span className="field__hint">人均，元/顿</span>
            </label>
            <div className="chips-row" style={{ flexWrap: 'wrap', overflow: 'visible' }}>
              <Chip active={quickBudget === null} onClick={() => setQuickBudget(null)}>
                不限
              </Chip>
              {QUICK_BUDGETS_PER_PERSON.map((b) => (
                <Chip key={b} yellow active={quickBudget === b} onClick={() => setQuickBudget(b)}>
                  ¥{b}
                </Chip>
              ))}
            </div>
          </div>
        </div>

        <div className="stack" style={{ marginTop: 20 }}>
          {identityError && <Notice tone="red">{identityError}</Notice>}
          {mode === 'gate' ? (
            <>
              <button
                type="button"
                className="btn btn--blue btn--lg btn--block"
                disabled={saving || foodieId.trim().length < 2 || hometown.trim().length < 2}
                onClick={() => void save(false)}
              >
                按我的口味找
              </button>
              <button
                type="button"
                className="btn btn--ghost btn--block"
                disabled={saving || foodieId.trim().length < 2 || hometown.trim().length < 2}
                onClick={() => void save(true)}
              >
                先进入看看，口味以后再补
              </button>
              <p className="tiny faint" style={{ textAlign: 'center' }}>
                匿名身份保存在当前浏览器；清除浏览器数据或换设备后无法自动恢复。
              </p>
            </>
          ) : (
            <>
              <button
                type="button"
                className="btn btn--blue btn--lg btn--block"
                disabled={saving || foodieId.trim().length < 2 || hometown.trim().length < 2}
                onClick={() => void save(false)}
              >
                保存修改
              </button>
              <button type="button" className="btn btn--ghost btn--block" onClick={onClose}>
                取消
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
