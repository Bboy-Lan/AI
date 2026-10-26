import { useCallback, useEffect, useState } from 'react'
import { KEYS, readJSON, writeJSON } from './storage'
import { DATA_CHANGED_EVENT, repo, notifyDataChanged } from './repo'

// “想吃”收藏仅保存在本机（PRD：跨设备收藏属于后续版本）
export function useFavorites() {
  const [ids, setIds] = useState<string[]>(() => readJSON<string[]>(KEYS.favorites, []))
  const [removedCount, setRemovedCount] = useState(0)

  useEffect(() => {
    writeJSON(KEYS.favorites, ids)
  }, [ids])

  useEffect(() => {
    if (repo.mode !== 'remote') return
    let active = true
    const sync = () => {
      repo.listFavoriteIds().then((remote) => {
        if (!active) return
        setIds((current) => {
          const removed = current.filter((id) => !remote.includes(id)).length
          if (removed) setRemovedCount((count) => count + removed)
          return remote
        })
      }).catch(() => undefined)
    }
    sync()
    window.addEventListener(DATA_CHANGED_EVENT, sync)
    return () => { active = false; window.removeEventListener(DATA_CHANGED_EVENT, sync) }
  }, [])

  const toggle = useCallback((id: string) => {
    const before = ids
    const optimistic = before.includes(id) ? before.filter((x) => x !== id) : [...before, id]
    setIds(optimistic)
    if (repo.mode === 'remote') {
      void repo.toggleFavorite(id).then((saved) => {
        setIds((current) => saved ? (current.includes(id) ? current : [...current, id]) : current.filter((x) => x !== id))
        notifyDataChanged('favorite')
      }).catch(() => setIds(before))
    }
  }, [ids])

  const has = useCallback((id: string) => ids.includes(id), [ids])

  return { ids, toggle, has, removedCount }
}
