import { useState, type ReactNode } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Ticket, UserRound, UtensilsCrossed, Dices, RotateCw } from 'lucide-react'
import { useProfile } from '../lib/profile'
import { refreshRemoteData, repo, useRemoteSync } from '../lib/repo'
import { Onboarding } from './Onboarding'

export function AppLayout() {
  const { needsOnboarding } = useProfile()
  const [editing, setEditing] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const sync = useRemoteSync()

  return (
    <div className="app-frame">
      <Outlet context={{ openProfileEditor: () => setEditing(true) }} />
      {location.pathname === '/' && repo.mode === 'remote' && (
        <div className="identity-float" aria-label="同步状态">
          <button type="button" className="btn btn--ghost identity-float__sync" onClick={() => void refreshRemoteData()}>
            <RotateCw size={13} className={sync.syncing ? 'spin' : ''} /> {sync.syncing ? '同步中' : sync.error ? '暂未更新 / 重连' : sync.lastSuccessAt ? `已同步 ${new Date(sync.lastSuccessAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : '刷新'}
          </button>
        </div>
      )}

      <nav className="bottom-nav" aria-label="主导航">
        <NavTab to="/" icon={<UtensilsCrossed size={19} />} label="找吃的" end />
        <NavTab to="/blindbox" icon={<Dices size={20} />} label="开盲盒" />
        <NavTab to="/me" icon={<UserRound size={19} />} label="我的" />
      </nav>

      <button
        type="button"
        className="fab-publish"
        onClick={() => navigate('/publish')}
        aria-label="发布一条吃喝推荐"
      >
        <Ticket size={17} />
        发布推荐
      </button>

      {needsOnboarding && location.pathname !== '/admin' && <Onboarding mode="gate" />}
      {editing && <Onboarding mode="edit" onClose={() => setEditing(false)} />}
    </div>
  )
}

function NavTab({
  to,
  icon,
  label,
  end,
}: {
  to: string
  icon: ReactNode
  label: string
  end?: boolean
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) => `bottom-nav__item${isActive ? ' bottom-nav__item--on' : ''}`}
    >
      <span className="bottom-nav__ico">{icon}</span>
      <span className="bottom-nav__label">{label}</span>
    </NavLink>
  )
}
