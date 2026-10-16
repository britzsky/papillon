import { useEffect, useMemo, useState, type MouseEvent, type PointerEvent, type ReactNode } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import './SideMenuLayout.css'
import logo from '../assets/logo/thefull.png'
import WorkspaceIcon, { type WorkspaceIconName } from './WorkspaceIcon'
import DeadlineAlertBanner from './DeadlineAlertBanner'
import WorkflowBar from './WorkflowBar'
import { matchesBase, workflowSteps } from '../features/workspace/workflow'

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

/** 업무 순서 아래: 기준정보(메뉴·식재료·공급사) → 위생 → 본사 */
const majorMenus: MajorMenu[] = [
  {
    key: 'operations',
    label: '메뉴·식재료',
    basePaths: ['/operations/menu', '/operations/account-menu', '/inventory/account-ingredients', '/inventory/ingredients', '/inventory/history'],
    items: [
      { label: '거래처 메뉴 관리', to: '/operations/account-menu', exact: true },
      { label: '본사 메뉴 가져오기', to: '/operations/account-menu/import', exact: true },
      { label: '거래처 재고 관리', to: '/inventory/account-ingredients', exact: true },
      { label: '재고 변동 이력', to: '/inventory/history', exact: true },
      { label: '메뉴 관리', to: '/operations/menu', exact: true },
      { label: '식자재 관리', to: '/inventory/ingredients', exact: true },
    ],
  },
  {
    key: 'order',
    label: '공급사',
    basePaths: ['/order_manager/suppliers', '/order_manager/supplier-sites', '/order_manager/welstory'],
    items: [
      { label: '공급사 통합 연동', to: '/order_manager/suppliers', exact: true },
      { label: '공급사 사업장 매핑', to: '/order_manager/supplier-sites', exact: true },
      { label: '거래명세서 관리' },
    ],
  },
  {
    key: 'sanitation',
    label: '위생관리',
    basePaths: ['/sanitation'],
    items: [{ label: '거래처별 위생관리', to: '/sanitation/vendor', exact: true }],
  },
  {
    key: 'headquarters',
    label: '본사관리',
    basePaths: ['/operations/account', '/operations/search-analytics'],
    items: [
      { label: '고객사 관리', to: '/operations/account', exact: true },
      { label: '검색어 관리', to: '/operations/search-analytics', exact: true },
    ],
  },
]

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
  const [openMenuKey, setOpenMenuKey] = useState(() => findActiveMenuKey(location.pathname))

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
    setOpenMenuKey(findActiveMenuKey(location.pathname))
  }

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && window.innerWidth <= 960) setIsCollapsed(true)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [])

  const activeMenuKey = useMemo(() => findActiveMenuKey(location.pathname), [location.pathname])

  const withAccount = (to: string) => {
    if (!to.startsWith('/')) return to
    const query = new URLSearchParams(location.search)
    const accountId = query.get('account_id') || (location.pathname === '/inventory/account' ? query.get('id') : '') || localStorage.getItem('account_id')
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



          <div className="side-layout__flow" aria-label="업무 순서">
            <span className="side-layout__flow-title">업무 순서</span>
            {workflowSteps.map((step) => {
              const active = step.basePaths.some((basePath) => matchesBase(location.pathname, basePath))
              return (
                <NavLink
                  key={step.to}
                  to={withAccount(step.to)}
                  data-side-nav-to={withAccount(step.to)}
                  onClick={(event) => handleNavigate(event, withAccount(step.to))}
                  className={`side-layout__flow-link${active ? ' is-active' : ''}`}
                  aria-current={active ? 'page' : undefined}
                >
                  <span className="side-layout__flow-no">{step.no}</span><span>{step.label}</span>
                </NavLink>
              )
            })}
          </div>

          {majorMenus.filter(menu => localStorage.getItem('user_type') !== '3' || menu.key !== 'headquarters').map((menu) => {
            const isOpen = openMenuKey === menu.key
            const isActive = activeMenuKey === menu.key

            return (
              <section
                key={menu.key}
                className={`side-layout__group${isOpen ? ' is-open' : ''}${isActive ? ' is-current' : ''}`}
              >
                <button
                  type="button"
                  className={`side-layout__major-button${isActive ? ' is-active' : ''}`}
                  onClick={() => setOpenMenuKey((current) => (current === menu.key ? '' : menu.key))}
                  aria-expanded={isOpen}
                >
                  <WorkspaceIcon name={menu.key as WorkspaceIconName} /><span>{menu.label}</span>
                  <span className={`side-layout__chevron${isOpen ? ' is-open' : ''}`} aria-hidden="true">
                    v
                  </span>
                </button>

                {isOpen ? (
                  <div className="side-layout__submenu">
                    {menu.items.filter(item => localStorage.getItem('user_type') !== '3' || !['/order_manager/suppliers', '/order_manager/supplier-sites', '/order_manager/welstory', '/inventory/ingredients', '/operations/menu'].includes(item.to || '')).map((item) =>
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
        <div className="side-layout__content"><WorkflowBar /><DeadlineAlertBanner />{children}</div>
      </section>
    </div>
  )
}

export default SideMenuLayout
