import { useEffect, useMemo, useState, type MouseEvent, type PointerEvent, type ReactNode } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import './SideMenuLayout.css'
import logo from '../assets/logo/the-full-logo2.png'

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

const majorMenus: MajorMenu[] = [
  {
    key: 'order',
    label: '발주관리',
    basePaths: ['/order_manager'],
    items: [
      { label: '식자재 발주', to: '/order_manager/food_order', exact: true },
      { label: 'Welstory 연계 발주', to: '/order_manager/welstory', exact: true },
      { label: '발주서 관리' },
      { label: '거래명세서 관리' },
    ],
  },
  {
    key: 'inventory',
    label: '재고관리',
    basePaths: ['/inventory'],
    items: [
      { label: '거래처 재고관리', to: '/inventory/account', exact: true },
      { label: '식자재 재고관리' },
      // { label: '재고 이동관리' },
    ],
  },
  {
    key: 'sanitation',
    label: '위생관리',
    basePaths: ['/sanitation'],
    items: [{ label: '거래처별 위생관리', to: '/sanitation/vendor', exact: true }],
  },
  {
    key: 'operations',
    label: '운영관리',
    basePaths: ['/operations'],
    items: [
      { label: '고객사 관리', to: '/operations/account', exact: true },
      { label: '메뉴 관리', to: '/operations/menu', exact: true },
      { label: '거래처 메뉴 관리', to: '/operations/account-menu', exact: true },
      { label: '식단표 관리', to: '/operations/table-meals', exact: true },
      // { label: '거래명세서 관리' },
    ],
  },
]

function findActiveMenuKey(pathname: string) {
  const matchedMenu = majorMenus.find((menu) =>
    menu.basePaths.some((basePath) => pathname === basePath || pathname.startsWith(`${basePath}/`)),
  )

  return matchedMenu?.key ?? 'order'
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

  useEffect(() => {
    setOpenMenuKey(findActiveMenuKey(location.pathname))
  }, [location.pathname])

  const activeMenuKey = useMemo(() => findActiveMenuKey(location.pathname), [location.pathname])

  const navigateWithFallback = (to: string) => {
    navigate(to)

    window.setTimeout(() => {
      if (window.location.pathname !== to) {
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
    if (!to || to === location.pathname) return

    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur()
    }

    event.preventDefault()
    event.stopPropagation()
    navigateWithFallback(to)
  }

  return (
    <div className={`side-layout${isCollapsed ? ' is-collapsed' : ''}`}>
      <aside
        className="side-layout__sidebar"
        aria-label="사이드 메뉴"
        onPointerDownCapture={handleSidebarPointerDownCapture}
        onClickCapture={handleSidebarClickCapture}
      >
        <div className="side-layout__sidebar-top">
          <div className="side-layout__brand">
            <img src={logo} alt="The Full" />
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
            홈
          </NavLink>

          {majorMenus.map((menu) => {
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
                  <span>{menu.label}</span>
                  <span className={`side-layout__chevron${isOpen ? ' is-open' : ''}`} aria-hidden="true">
                    v
                  </span>
                </button>

                {isOpen ? (
                  <div className="side-layout__submenu">
                    {menu.items.map((item) =>
                      item.to ? (
                        <NavLink
                          key={`${menu.key}-${item.label}`}
                          to={item.to}
                          end={item.exact}
                          data-side-nav-to={item.to}
                          onClick={(event) => handleNavigate(event, item.to!)}
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
        <div className="side-layout__content">{children}</div>
      </section>
    </div>
  )
}

export default SideMenuLayout
