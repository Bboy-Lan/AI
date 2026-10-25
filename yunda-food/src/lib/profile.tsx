import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import type { TasteProfile } from '../types'
import { KEYS, readJSON, writeJSON } from './storage'

export const DEFAULT_PROFILE: TasteProfile = {
  saved: false,
  skipped: false,
  campusId: 'ynu-chenggong',
  hometown: null,
  spicy: 'any',
  sweetSalty: 'any',
  staple: 'any',
  oil: 'any',
  quickBudget: null,
  savedAt: null,
}

interface ProfileContextValue {
  profile: TasteProfile
  needsOnboarding: boolean
  /** 保存明确选择；或用 skipped 记录“先逛逛”（中性口味） */
  saveProfile: (next: Omit<TasteProfile, 'saved' | 'savedAt'> & { skipped?: boolean }) => void
  /** 从“我的”页修改时，保留已完成状态 */
  updateProfile: (patch: Partial<TasteProfile>) => void
}

const ProfileContext = createContext<ProfileContextValue | null>(null)

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<TasteProfile>(() =>
    readJSON<TasteProfile>(KEYS.profile, DEFAULT_PROFILE),
  )

  const saveProfile = useCallback<ProfileContextValue['saveProfile']>(
    (next) => {
      const saved: TasteProfile = {
        ...next,
        saved: true,
        skipped: next.skipped ?? false,
        savedAt: new Date().toISOString(),
      }
      writeJSON(KEYS.profile, saved)
      setProfile(saved)
    },
    [],
  )

  const updateProfile = useCallback<ProfileContextValue['updateProfile']>((patch) => {
    setProfile((prev) => {
      const next = { ...prev, ...patch, saved: true, savedAt: new Date().toISOString() }
      writeJSON(KEYS.profile, next)
      return next
    })
  }, [])

  const value = useMemo<ProfileContextValue>(
    () => ({
      profile,
      needsOnboarding: !profile.saved,
      saveProfile,
      updateProfile,
    }),
    [profile, saveProfile, updateProfile],
  )

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>
}

export function useProfile(): ProfileContextValue {
  const ctx = useContext(ProfileContext)
  if (!ctx) throw new Error('useProfile 必须在 ProfileProvider 内使用')
  return ctx
}
