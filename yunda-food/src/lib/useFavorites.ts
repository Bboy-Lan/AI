import { useCallback, useEffect, useState } from 'react'
import { KEYS, readJSON, writeJSON } from './storage'

// “想吃”收藏仅保存在本机（PRD：跨设备收藏属于后续版本）
export function useFavorites() {
  const [ids, setIds] = useState<string[]>(() => readJSON<string[]>(KEYS.favorites, []))

  useEffect(() => {
    writeJSON(KEYS.favorites, ids)
  }, [ids])

  const toggle = useCallback((id: string) => {
    setIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }, [])

  const has = useCallback((id: string) => ids.includes(id), [ids])

  return { ids, toggle, has }
}
