import { useState, type ReactNode } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { Ticket, UserRound, UtensilsCrossed, Dices } from 'lucide-react'
import { useProfile } from '../lib/profile'
import { Onboarding } from './Onboarding'

export function AppLayout() {
  const { needsOnboarding } = useProfile()
  const [editing, setEditing] = useState(false)
  const navigate = useNavigate()

  return (
    <div className="app-frame">
      <Outlet context={{ openProfileEditor: () => setEditing(true) }} />

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

      {needsOnboarding && <Onboarding mode="gate" />}
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
