import { useEffect, useState } from 'react'
import { repo, useRepoState } from './repo'

export type IdentityRole = 'checking' | 'member' | 'admin'

/** 管理员身份以云端 is_admin() 为准，前端从不自行推断或缓存为权限。 */
export function useAdminStatus(): IdentityRole {
  const repoState = useRepoState()
  const [role, setRole] = useState<IdentityRole>(() => (repo.mode === 'remote' ? 'checking' : 'member'))

  useEffect(() => {
    let alive = true
    const check = () => {
      if (repo.mode !== 'remote') {
        if (alive) setRole('member')
        return
      }
      void repo.isAdmin()
        .then((isAdmin) => alive && setRole(isAdmin ? 'admin' : 'member'))
        .catch(() => alive && setRole('member'))
    }
    void Promise.resolve().then(check)
    const onVisible = () => document.visibilityState === 'visible' && check()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      alive = false
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [repoState])

  return role
}
