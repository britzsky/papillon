import { useEffect, type ReactNode } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { PC_ROUTES, setUiModePreference } from './deviceMode'
import './MobileLayout.css'

/** 하단 탭. 모바일 화면을 추가하면 여기에 넣는다(2개 이상일 때만 탭 막대를 보인다). */
const MOBILE_TABS: Array<{ to: string; label: string }> = [
  { to: '/m/table-meals', label: '식단표' },
]

/**
 * 모바일·태블릿 공통 틀: 상단 바(제목·거래처·PC 화면 전환) + 본문 스크롤 + 하단 탭.
 * PC 전용 전역 스타일(body.workspace-ui, 30px 컨트롤 등)은 이 화면에 있는 동안 끈다.
 */
export default function MobileLayout({ title, subtitle, onBack, children }: {
  title: string
  subtitle?: string
  /** 상세에서 목록으로 돌아가기(휴대폰 폭에서만 보임) */
  onBack?: () => void
  children: ReactNode
}) {
  const { pathname, search } = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    const body = document.body
    const hadWorkspaceUi = body.classList.contains('workspace-ui')
    body.classList.remove('workspace-ui')
    body.classList.add('m-ui')
    return () => {
      body.classList.remove('m-ui')
      if (hadWorkspaceUi) body.classList.add('workspace-ui')
    }
  }, [])

  const switchToPc = () => {
    setUiModePreference('pc')
    navigate(`${PC_ROUTES[pathname] || '/home'}${search}`)
  }

  return <div className="m-app">
    <header className="m-topbar">
      {onBack
        ? <button type="button" className="m-topbar__back" onClick={onBack} aria-label="목록으로">‹</button>
        : <span className="m-topbar__spacer" />}
      <div className="m-topbar__title">
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      <button type="button" className="m-topbar__switch" onClick={switchToPc}>PC 화면</button>
    </header>
    <main className="m-main">{children}</main>
    {MOBILE_TABS.length > 1 && <nav className="m-tabbar" aria-label="모바일 메뉴">
      {MOBILE_TABS.map(tab => <NavLink key={tab.to} to={`${tab.to}${search}`} className={({ isActive }) => `m-tabbar__item${isActive ? ' is-active' : ''}`}>{tab.label}</NavLink>)}
    </nav>}
  </div>
}
