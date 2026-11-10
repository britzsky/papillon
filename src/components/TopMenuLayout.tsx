import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import logo from '../assets/logo/thefull.png'
import logoDark from '../assets/logo/thefull-dark.png' // 어두운 테마용(글자 흰색, 투명 바탕 — 2026-11-10 사용자 제공)
import DeadlineAlertBanner from './DeadlineAlertBanner'
import { HeaderActions } from './HeaderBar'
import HomeSearchBox from './HomeSearchBox'
import QuickLinks, { HeaderSns } from './QuickLinks'
import FontPicker from './FontPicker'
import ThemeSwitch from './ThemeSwitch'
import { useHomeFont, useHomeFontSize } from '../features/home/homeFont'
import { useHomeTheme } from '../features/home/homeTheme'
import { findActiveMenuKey, menusForRole } from '../features/workspace/menus'
import { workspaceAccountId } from '../features/workspace/workspaceAccount'
import './HeaderBar.css'
import './TopMenuLayout.css'
import './TopMenuTheme.css'

/**
 * 상단 메뉴 틀(2026-11-09 사용자 요청, 홈부터): 사이드 메뉴 없이 맨 위 한 줄 = 더채움 로고 · 카테고리 · 통합 검색 · 관리 거래처/알림/계정.
 * 카테고리에 마우스를 올리면(키보드는 포커스, 터치는 누르기) 아래로 그 카테고리 메뉴가 내려온다. 메뉴 정의는 사이드 메뉴와 같은 features/workspace/menus.
 */
/**
 * actionsInPage: 종 알림·사용자 정보·로그아웃을 본문(PC 홈 접속자 카드)이 맡을 때 머리 줄에서 뺀다(관리 거래처만 남음).
 * 머리 줄 내용(로고·메뉴·검색·SNS·관리 거래처·테마 스위치)은 본문과 같은 폭(--top-width)으로 화면 가운데(2026-11-10 사용자 요청).
 */
export default function TopMenuLayout({ children, actionsInPage = false }: { children: ReactNode; actionsInPage?: boolean }) {
  const location = useLocation()
  const menus = useMemo(() => menusForRole(), [])
  const activeKey = findActiveMenuKey(location.pathname)
  const [openKey, setOpenKey] = useState('')
  const closeTimer = useRef<number | undefined>(undefined)
  // 본문만 스크롤된다(맨 위 줄 고정) — 오른쪽 아래 '맨 위로'가 이 요소를 올린다
  const contentRef = useRef<HTMLElement>(null)
  // 글꼴 시험(임시, 오른쪽 아래 '가' 버튼)
  const [font, setFont] = useHomeFont()
  const [fontPlus, setFontPlus] = useHomeFontSize()
  const [theme, setTheme] = useHomeTheme()

  // 화면을 옮기면 펼친 메뉴를 닫는다
  const [menuPath, setMenuPath] = useState(location.pathname)
  if (menuPath !== location.pathname) { setMenuPath(location.pathname); setOpenKey('') }

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpenKey('') }
    window.addEventListener('keydown', closeOnEscape)
    return () => { window.removeEventListener('keydown', closeOnEscape); window.clearTimeout(closeTimer.current) }
  }, [])

  // 마우스가 카테고리 → 내려온 메뉴로 옮겨 가는 사이 잠깐 비어도 닫히지 않게 조금 늦게 닫는다
  const open = (key: string) => { window.clearTimeout(closeTimer.current); setOpenKey(key) }
  const closeSoon = () => { window.clearTimeout(closeTimer.current); closeTimer.current = window.setTimeout(() => setOpenKey(''), 120) }

  // 메뉴로 옮겨도 관리 거래처 유지(사이드 메뉴와 같은 규칙, 거래처 계정은 자기 거래처)
  const withAccount = (to: string) => {
    const accountId = workspaceAccountId(new URLSearchParams(location.search))
    return accountId ? `${to}?${new URLSearchParams({ account_id: accountId })}` : to
  }

  return (
    <div className="rd top-layout" data-font={font} data-theme={theme} style={{ '--home-fs-plus': `${fontPlus}px` } as CSSProperties}>
      {/* data-menus: 메뉴가 많으면(본사 7개) 한 줄에 들어가는 폭이 달라 줄바꿈 기준이 다르다(TopMenuLayout.css) */}
      <header className="top-layout__bar" data-menus={menus.length > 5 ? 'many' : 'few'}>
        <div className="top-layout__inner">
        <Link to="/home" className="top-layout__brand" aria-label="홈으로"><img src={theme === 'dark' ? logoDark : logo} alt="더채움 THE CHAEWOOM" /></Link>

        <nav className="top-layout__nav" aria-label="메뉴">
          {menus.map(menu => {
            const isOpen = openKey === menu.key
            return (
              <div key={menu.key} className={`top-layout__cat${isOpen ? ' is-open' : ''}${activeKey === menu.key ? ' is-current' : ''}`}
                onMouseEnter={() => open(menu.key)} onMouseLeave={closeSoon}
                onFocus={() => open(menu.key)}
                onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) closeSoon() }}>
                <button type="button" className="top-layout__cat-btn" aria-expanded={isOpen} aria-controls={`top-menu-${menu.key}`}
                  onClick={() => setOpenKey(current => current === menu.key ? '' : menu.key)}>{menu.label}</button>
                <div id={`top-menu-${menu.key}`} className="top-layout__drop" hidden={!isOpen}>
                  {menu.items.map(item => item.to ? (
                    <NavLink key={item.label} to={withAccount(item.to)} end={item.exact} onClick={() => setOpenKey('')}
                      className={({ isActive }) => `top-layout__link${isActive ? ' is-active' : ''}`}>{item.label}</NavLink>
                  ) : <span key={item.label} className="top-layout__link is-disabled">{item.label}</span>)}
                </div>
              </div>
            )
          })}
        </nav>

        <HomeSearchBox className="top-layout__search" />
        <HeaderSns />
        {/* header-shell: 머리 줄 아이콘 버튼 규칙(HeaderBar.css)이 이 묶음에도 걸리게 */}
        <div className="header-shell top-layout__actions"><HeaderActions accountOnly={actionsInPage} /></div>
        <ThemeSwitch theme={theme} onChange={setTheme} />
        </div>
      </header>

      <main className="top-layout__content" ref={contentRef}>
        <DeadlineAlertBanner />
        {children}
      </main>
      <QuickLinks scrollRef={contentRef}><FontPicker value={font} onChange={setFont} sizePlus={fontPlus} onSizeChange={setFontPlus} /></QuickLinks>
    </div>
  )
}
