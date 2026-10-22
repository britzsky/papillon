import { useCallback, useEffect, useMemo, useState, type MouseEvent, type PointerEvent, type ReactNode } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import './SideMenuLayout.css'
import logo from '../assets/logo/thefull.png'
import WorkspaceIcon, { type WorkspaceIconName } from './WorkspaceIcon'
import DeadlineAlertBanner from './DeadlineAlertBanner'
import { DeadlineSlotContext } from './deadlineSlot'
import WorkflowBar from './WorkflowBar'
import WorkspaceAccountPicker from './WorkspaceAccountPicker'
import { isHeadquarters, workspaceAccountId } from '../features/workspace/workspaceAccount'
import { matchesBase } from '../features/workspace/workflow'
import { visibleForRole } from '../features/workspace/roleScreens'

type SideMenuLayoutProps = {
  children: ReactNode
  header?: ReactNode
}

type SubMenuItem = {
  label: string
  to?: string
  exact?: boolean
}

type MajorMenu = {
  key: string
  label: string
  basePaths: string[]
  items: SubMenuItem[]
}

/**
 * 카테고리는 업무 순서대로(2026-10-16 사용자 결정: 식단표부터 발주까지 클릭 5번 안).
 * 운영관리(식단표) → 발주관리(발주하기·발주서) → 재고관리(재고) 순서이고, 각 카테고리 첫 메뉴가 그 단계의 화면이다.
 */
const majorMenus: MajorMenu[] = [
  {
    key: 'operations',
    label: '운영관리',
    basePaths: ['/operations/table-meals', '/operations/menu', '/operations/account-menu', '/operations/meal-plan-templates'],
    items: [
      { label: '식단표 관리', to: '/operations/table-meals', exact: true },
      { label: '금액대 식단표 템플릿', to: '/operations/meal-plan-templates', exact: true },
      { label: '거래처 메뉴 관리', to: '/operations/account-menu', exact: true },
      { label: '본사 메뉴 가져오기', to: '/operations/account-menu/import', exact: true },
      { label: '메뉴 관리', to: '/operations/menu', exact: true },
    ],
  },
  {
    key: 'order',
    label: '발주관리',
    basePaths: ['/order_manager'],
    items: [
      { label: '발주하기', to: '/order_manager/order', exact: true },
      { label: '발주서·입고 관리', to: '/order_manager/orders', exact: true },
      { label: '공급사 통합 연동', to: '/order_manager/suppliers', exact: true },
      { label: '공급사 사업장 매핑', to: '/order_manager/supplier-sites', exact: true },
    ],
  },
  {
    key: 'inventory',
    label: '재고관리',
    basePaths: ['/inventory'],
    items: [
      { label: '재고', to: '/inventory/account', exact: true },
      { label: '재고 변동 이력', to: '/inventory/history', exact: true },
      { label: '식자재 관리', to: '/inventory/ingredients', exact: true },
    ],
  },
  {
    key: 'sanitation',
    label: '위생관리',
    basePaths: ['/sanitation'],
    items: [{ label: '위생 점검 관리', to: '/sanitation/vendor', exact: true }],
  },
  {
    key: 'headquarters',
    label: '본사관리',
    basePaths: ['/operations/account', '/operations/search-analytics', '/operations/ai-usage'],
    items: [
      { label: '고객사 관리', to: '/operations/account', exact: true },
      { label: '검색어 관리', to: '/operations/search-analytics', exact: true },
      { label: 'AI 사용 이력', to: '/operations/ai-usage', exact: true },
    ],
  },
]

/** 거래처를 고르지 않아도 되는 화면(본사 공통 기준정보·전체 현황) */
const ACCOUNT_FREE_PATHS = ['/home', '/home/sidebar', '/operations/menu', '/inventory/ingredients', '/operations/search-analytics', '/operations/ai-usage', '/order_manager/supplier-sites', '/order_manager/welstory', '/order_manager']

function AccountChoiceNotice() {
  return (
    <div className="rd rd-page">
      <section className="rd-card rd-page__empty rd-account-choice">
        <h2 className="rd-h2">관리할 거래처를 먼저 고르세요</h2>
        <p>본사 계정은 거래처를 골라 관리합니다. 한 번 고르면 다른 화면으로 옮겨도 그 거래처가 유지됩니다.</p>
        <WorkspaceAccountPicker />
      </section>
    </div>
  )
}

/**
 * 대분류는 한 번에 하나만 펼친다(2026-10-16 사용자 요청: 다른 대분류를 누르면 열려 있던 것은 닫힘). 업무 흐름 이동은 WorkflowBar가 맡는다.
 * 처음엔 지금 화면의 대분류, 홈처럼 속한 대분류가 없으면 업무 첫 단계(운영관리 — 식단표)를 펼쳐 둔다(홈 → 식단표 한 번에).
 */
const initialOpenKeys = (pathname: string) => new Set([findActiveMenuKey(pathname) || 'operations'])

function findActiveMenuKey(pathname: string) {
  // '/operations/account'는 '/operations/account-menu'의 앞부분이라 정확히 비교한다
  const matchedMenu = majorMenus.find((menu) => menu.basePaths.some((basePath) =>
    basePath === '/operations/account' ? pathname === basePath : matchesBase(pathname, basePath)))

  return matchedMenu?.key ?? ''
}

function SideMenuLayout({ children, header }: SideMenuLayoutProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const [isCollapsed, setIsCollapsed] = useState(false)
  // 화면 머리 줄에 마감 알림 자리(DeadlineAlertSlot)가 있으면 본문 위 공용 알림은 그리지 않는다
  const [deadlineSlots, setDeadlineSlots] = useState(0)
  const registerDeadlineSlot = useCallback((present: boolean) => setDeadlineSlots(count => count + (present ? 1 : -1)), [])
  const [openMenuKeys, setOpenMenuKeys] = useState(() => initialOpenKeys(location.pathname))

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const handleResize = () => {
      if (window.innerWidth <= 960) {
        setIsCollapsed(true)
      }
    }

    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const [menuPath, setMenuPath] = useState(location.pathname)
  if (menuPath !== location.pathname) {
    setMenuPath(location.pathname)
    setOpenMenuKeys((current) => { const key = findActiveMenuKey(location.pathname); return key && !current.has(key) ? new Set([key]) : current })
  }

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && window.innerWidth <= 960) setIsCollapsed(true)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [])

  const activeMenuKey = useMemo(() => findActiveMenuKey(location.pathname), [location.pathname])
  // 본사가 '전체 거래처'인 채로 거래처가 필요한 화면을 열면 화면 대신 거래처 선택 안내
  const needsAccountChoice = isHeadquarters() && !workspaceAccountId(location.search) && !ACCOUNT_FREE_PATHS.includes(location.pathname)

  const withAccount = (to: string) => {
    if (!to.startsWith('/')) return to
    const query = new URLSearchParams(location.search)
    // 메뉴로 옮겨도 관리 거래처 유지(거래처 계정은 자기 거래처)
    const accountId = workspaceAccountId(query) || (location.pathname === '/inventory/account' ? query.get('id') : '')
    return accountId ? `${to}?${new URLSearchParams({ account_id: accountId })}` : to
  }

  const navigateWithFallback = (to: string) => {
    if (window.innerWidth <= 960) setIsCollapsed(true)
    navigate(to)

    window.setTimeout(() => {
      if (window.location.pathname + window.location.search !== to) {
        window.location.assign(to)
      }
    }, 0)
  }

  const handleNavigate = (event: MouseEvent<HTMLAnchorElement>, to: string) => {
    if (event.button !== 0 || event.metaKey || event.altKey || event.ctrlKey || event.shiftKey) {
      return
    }

    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur()
    }

    event.preventDefault()
    navigateWithFallback(to)
  }

  const handleSidebarClickCapture = (event: MouseEvent<HTMLElement>) => {
    if (event.button !== 0 || event.metaKey || event.altKey || event.ctrlKey || event.shiftKey) {
      return
    }

    const target = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[data-side-nav-to]') : null
    const to = target?.dataset.sideNavTo
    if (!to) return

    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur()
    }

    event.preventDefault()
    event.stopPropagation()
    navigateWithFallback(to)
  }

  const handleSidebarPointerDownCapture = (event: PointerEvent<HTMLElement>) => {
    if (event.button !== 0 || event.metaKey || event.altKey || event.ctrlKey || event.shiftKey) {
      return
    }

    const target = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[data-side-nav-to]') : null
    const to = target?.dataset.sideNavTo
    if (!to || to === location.pathname + location.search) return

    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur()
    }

    event.preventDefault()
    event.stopPropagation()
    navigateWithFallback(to)
  }

  return (
    <div className={`side-layout${isCollapsed ? ' is-collapsed' : ''}`}>
      {!isCollapsed ? <button type="button" className="side-layout__backdrop" aria-label="메뉴 닫기" onClick={() => setIsCollapsed(true)} /> : null}
      <aside
        className="side-layout__sidebar"
        aria-label="사이드 메뉴"
        onPointerDownCapture={handleSidebarPointerDownCapture}
        onClickCapture={handleSidebarClickCapture}
      >
        <div className="side-layout__sidebar-top">
          <div className="side-layout__brand">
            <img src={logo} alt="더채움 THE CHAEWOOM" />
          </div>
          <button
            type="button"
            className="side-layout__toggle"
            onClick={() => setIsCollapsed(true)}
            aria-label="사이드 메뉴 숨기기"
          >
            X
          </button>
        </div>

        <nav className="side-layout__nav">
          <NavLink
            to="/home"
            end
            className={({ isActive }) => `side-layout__home-link${isActive ? ' is-active' : ''}`}
            data-side-nav-to="/home"
            onClick={(event) => handleNavigate(event, '/home')}
          >
            <WorkspaceIcon name="home" /><span>홈</span>
          </NavLink>



          {majorMenus.filter(menu => localStorage.getItem('user_type') !== '3' || menu.key !== 'headquarters').map((menu) => {
            const isOpen = openMenuKeys.has(menu.key)
            const isActive = activeMenuKey === menu.key

            return (
              <section
                key={menu.key}
                className={`side-layout__group${isOpen ? ' is-open' : ''}${isActive ? ' is-current' : ''}`}
              >
                <button
                  type="button"
                  className={`side-layout__major-button${isActive ? ' is-active' : ''}`}
                  onClick={() => setOpenMenuKeys((current) => current.has(menu.key) ? new Set<string>() : new Set([menu.key]))}
                  aria-expanded={isOpen}
                >
                  <WorkspaceIcon name={menu.key as WorkspaceIconName} /><span>{menu.label}</span>
                  <span className={`side-layout__chevron${isOpen ? ' is-open' : ''}`} aria-hidden="true">
                    v
                  </span>
                </button>

                {isOpen ? (
                  <div className="side-layout__submenu">
                    {menu.items.filter(item => visibleForRole(item.to)).map((item) =>
                      item.to ? (
                        <NavLink
                          key={`${menu.key}-${item.label}`}
                          to={withAccount(item.to)}
                          end={item.exact}
                          data-side-nav-to={withAccount(item.to)}
                          onClick={(event) => handleNavigate(event, withAccount(item.to!))}
                          className={({ isActive: isSubActive }) =>
                            `side-layout__sublink${isSubActive ? ' is-active' : ''}`
                          }
                        >
                          {item.label}
                        </NavLink>
                      ) : (
                        <button
                          key={`${menu.key}-${item.label}`}
                          type="button"
                          className="side-layout__sublink side-layout__sublink--disabled"
                        >
                          {item.label}
                        </button>
                      ),
                    )}
                  </div>
                ) : null}
              </section>
            )
          })}
        </nav>
        <div className="side-layout__account">
          <WorkspaceIcon name="headquarters" />
          <div><strong>{localStorage.getItem('account_name') || '더채움'}</strong><span>{localStorage.getItem('user_name') || '구매·재고 업무 공간'}</span></div>
        </div>
      </aside>

      <section className="side-layout__main">
        {header}
        {isCollapsed ? (
          <div className="side-layout__main-top">
            <button
              type="button"
              className="side-layout__reopen"
              onClick={() => setIsCollapsed(false)}
              aria-label="사이드 메뉴 펼치기"
            >
              메뉴
            </button>
          </div>
        ) : null}
        <div className="side-layout__content"><WorkflowBar />{deadlineSlots > 0 ? null : <DeadlineAlertBanner />}<DeadlineSlotContext.Provider value={registerDeadlineSlot}>{needsAccountChoice ? <AccountChoiceNotice /> : children}</DeadlineSlotContext.Provider></div>
      </section>
    </div>
  )
}

export default SideMenuLayout
