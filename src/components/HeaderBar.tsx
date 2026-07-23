import type { MouseEvent, PointerEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import './HeaderBar.css'

type BreadcrumbItem = {
  label: string
  to?: string
}

type HeaderBarProps = {
  title?: string
  breadcrumbs?: BreadcrumbItem[]
}

function HeaderBar({ title = 'Home', breadcrumbs = [] }: HeaderBarProps) {
  const navigate = useNavigate()

  const blurActiveElement = () => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur()
    }
  }

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

    blurActiveElement()
    event.preventDefault()
    navigateWithFallback(to)
  }

  const handlePointerDown = (event: PointerEvent<HTMLAnchorElement>, to: string) => {
    if (event.button !== 0 || event.metaKey || event.altKey || event.ctrlKey || event.shiftKey) {
      return
    }

    blurActiveElement()
    event.preventDefault()
    navigateWithFallback(to)
  }

  return (
    <div className="header-shell">
      <header className="header-bar">
        <div className="header-bar__brand">
          {/* <img src={logo} alt="The Full logo" /> */}
        </div>
        <div className="header-bar__status">{title}</div>
      </header>

      {breadcrumbs.length > 0 ? (
        <nav className="header-breadcrumbs" aria-label="breadcrumb">
          {breadcrumbs.map((item, index) => (
            <span key={`${item.label}-${index}`} className="header-breadcrumbs__item">
              {item.to ? (
                <Link
                  to={item.to}
                  className="header-breadcrumbs__link"
                  onClick={(event) => handleNavigate(event, item.to!)}
                  onPointerDown={(event) => handlePointerDown(event, item.to!)}
                >
                  {item.label}
                </Link>
              ) : (
                <span className="header-breadcrumbs__current">{item.label}</span>
              )}
              {index < breadcrumbs.length - 1 ? (
                <span className="header-breadcrumbs__separator" aria-hidden="true">
                  /
                </span>
              ) : null}
            </span>
          ))}
        </nav>
      ) : null}
    </div>
  )
}

export default HeaderBar
