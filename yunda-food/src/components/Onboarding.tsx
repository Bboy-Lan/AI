import { useState } from 'react'
import { ArrowLeft, Ticket } from 'lucide-react'
import type {
  OilPref,
  SpicyPref,
  StaplePref,
  SweetSaltyPref,
} from '../types'
import {
  CAMPUSES,
  HOMETOWNS,
  OIL_PREF_LABEL,
  QUICK_BUDGETS_PER_PERSON,
  SPICY_PREF_LABEL,
  STAPLE_PREF_LABEL,
  SWEETSALTY_PREF_LABEL,
} from '../data/campus'
import { useProfile } from '../lib/profile'
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
  const [campusId, setCampusId] = useState(profile.campusId)
  const [hometown, setHometown] = useState(profile.hometown ?? '')
  const [spicy, setSpicy] = useState<SpicyPref>(profile.spicy)
  const [sweetSalty, setSweetSalty] = useState<SweetSaltyPref>(profile.sweetSalty)
  const [staple, setStaple] = useState<StaplePref>(profile.staple)
  const [oil, setOil] = useState<OilPref>(profile.oil)
  const [quickBudget, setQuickBudget] = useState<number | null>(profile.quickBudget)

  const buildPayload = () => ({
    campusId,
    hometown: hometown || null,
    spicy,
    sweetSalty,
    staple,
    oil,
    quickBudget,
  })

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
            先认识你的胃
          </h1>
          <p className="muted" style={{ fontSize: 13, marginBottom: 14 }}>
            30 秒选完，我们按你的口味排吃喝。随时能在“我的”里改，不用登录。
          </p>
        </div>

        <div className="stack-lg" style={{ gap: 13 }}>
          <div className="field">
            <label className="field__label">你在哪个校区？</label>
            <ChoiceRow
              options={CAMPUSES.map((c) => ({ value: c.id, label: c.short }))}
              value={campusId}
              onChange={setCampusId}
            />
            {campusId !== 'ynu-chenggong' && (
              <Notice tone="yellow">
                这个校区暂时还没有起始内容。你可以先逛呈贡的示例，也欢迎当这个校区的第一个投稿人。
              </Notice>
            )}
          </div>

          <div className="field">
            <label className="field__label">
              家乡（可选）<span className="field__hint">只作家乡味线索，不会限制你看别的菜</span>
            </label>
            <select
              className="select-input"
              value={hometown}
              onChange={(e) => setHometown(e.target.value)}
            >
              <option value="">不填 / 先不透露</option>
              {HOMETOWNS.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.label}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
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
              options={(['light', 'salty', 'sweet', 'any'] as SweetSaltyPref[]).map((v) => ({
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
          {mode === 'gate' ? (
            <>
              <button
                type="button"
                className="btn btn--blue btn--lg btn--block"
                onClick={() => saveProfile({ ...buildPayload(), skipped: false })}
              >
                按我的口味找
              </button>
              <button
                type="button"
                className="btn btn--ghost btn--block"
                onClick={() =>
                  saveProfile({
                    ...buildPayload(),
                    skipped: true,
                    spicy: 'any',
                    sweetSalty: 'any',
                    staple: 'any',
                    oil: 'any',
                    quickBudget: null,
                  })
                }
              >
                先逛逛，口味设为不限
              </button>
              <p className="tiny faint" style={{ textAlign: 'center' }}>
                选择只存在这台设备上；家乡、“吃过”均为自报，不做认证。
              </p>
            </>
          ) : (
            <>
              <button
                type="button"
                className="btn btn--blue btn--lg btn--block"
                onClick={() => {
                  updateProfile({ ...buildPayload(), skipped: false })
                  onClose?.()
                }}
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
