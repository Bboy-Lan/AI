import { Crown, UtensilsCrossed } from 'lucide-react'
import type { IdentityRole } from '../lib/useAdminStatus'

export function IdentityBadge({ role, compact = false }: { role: IdentityRole; compact?: boolean }) {
  const isAdmin = role === 'admin'
  return (
    <span className={`identity-badge${isAdmin ? ' identity-badge--admin' : ''}`} title={isAdmin ? '云端已确认管理员身份' : '匿名吃货身份'}>
      {isAdmin ? <Crown size={compact ? 13 : 15} /> : <UtensilsCrossed size={compact ? 13 : 15} />}
      {isAdmin ? '吃货大王' : '小吃货'}
    </span>
  )
}
