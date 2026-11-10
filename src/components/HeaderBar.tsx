import { useEffect, useId, type MouseEvent, type PointerEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { logout } from '../api/auth'
import userIcon from '../assets/image/user.png'
import signOutIcon from '../assets/image/exit.png'
import HeaderAlerts from './HeaderAlerts'
import WorkspaceAccountPicker from './WorkspaceAccountPicker'
import { ownAccountName } from '../features/workspace/workspaceAccount'
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
  // 머리 줄에서 뺀 화면 이름은 브라우저 탭 제목으로
  useEffect(() => { document.title = title && title !== 'Home' ? `${title} · 더채움` : '더채움' }, [title])

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
      {/* 한 줄: 왼쪽 경로(마지막 = 지금 화면 이름, 굵게), 오른쪽 관리 거래처·알림·계정 정보·로그아웃. 본문 큰 제목은 화면에서 숨김(2026-10-16 사용자 요청) */}
      <header className="header-bar header-bar--one-line">
        {breadcrumbs.length > 0 ? (
          <nav className="header-breadcrumbs" aria-label="breadcrumb">
            {breadcrumbs.map((item, index) => (
              <span key={`${item.label}-${index}`} className="header-breadcrumbs__item">
                {item.to && index < breadcrumbs.length - 1 ? (
                  <Link
                    to={item.to}
                    className="header-breadcrumbs__link"
                    onClick={(event) => handleNavigate(event, item.to!)}
                    onPointerDown={(event) => handlePointerDown(event, item.to!)}
                  >
                    {item.label}
                  </Link>
                ) : (
                  <span className={index === breadcrumbs.length - 1 ? 'header-breadcrumbs__current is-page' : 'header-breadcrumbs__current'} aria-current={index === breadcrumbs.length - 1 ? 'page' : undefined}>{item.label}</span>
                )}
                {index < breadcrumbs.length - 1 ? (
                  <span className="header-breadcrumbs__separator" aria-hidden="true">
                    /
                  </span>
                ) : null}
              </span>
            ))}
          </nav>
        ) : <span className="header-breadcrumbs" />}
        <HeaderActions />
      </header>

    </div>
  )
}

/**
 * 사용자 정보 창(popover). 여는 버튼은 popoverTarget={id}로 따로 둔다 —
 * 머리 줄 사람 아이콘(HeaderActions)과 PC 홈 접속자 카드의 사람 아이콘(HomeProfileCard, 2026-11-10)이 같이 쓴다.
 */
export function UserInfoPanel({ id, className = '' }: { id: string; className?: string }) {
  const userInfo = [
    ['이름', localStorage.getItem('user_name')],
    ['아이디', localStorage.getItem('user_id')],
    ['거래처명', ownAccountName()],
    ['거래처 ID', localStorage.getItem('account_id')],
  ]
  return (
    <section id={id} popover="auto" className={`header-bar__user-info${className ? ` ${className}` : ''}`} aria-label="사용자 정보">
      <div className="header-bar__user-info-heading">
        <h2>사용자 정보</h2>
        <button type="button" className="header-bar__icon-button" popoverTarget={id} popoverTargetAction="hide" aria-label="사용자 정보 닫기" title="닫기">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
            <path d="m6 6 12 12M18 6 6 18" />
          </svg>
        </button>
      </div>
      <dl>
        {userInfo.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value?.trim() || '등록된 정보 없음'}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

/**
 * 로그아웃 버튼. 머리 줄은 기존 나가기 그림(image), PC 홈 접속자 카드는 종 아이콘과 같은 선 그림(line, 2026-11-10 사용자 요청 — 색은 currentColor).
 */
export function LogoutButton({ className = '', size = 32, variant = 'image' }: { className?: string; size?: number; variant?: 'image' | 'line' }) {
  return (
    <button type="button" className={`header-bar__icon-button header-bar__icon-button--logout${className ? ` ${className}` : ''}`} onClick={logout} aria-label="로그아웃" title="로그아웃">
      {variant === 'line'
        ? <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M10 4H6.5A2.5 2.5 0 0 0 4 6.5v11A2.5 2.5 0 0 0 6.5 20H10" /><path d="M15 8l4 4-4 4" /><path d="M19 12H9" />
        </svg>
        : <img src={signOutIcon} width={size} height={size} alt="" aria-hidden="true" />}
    </button>
  )
}

/**
 * 머리 줄 오른쪽 묶음: 관리 거래처·알림·사용자 정보·로그아웃. 상단 메뉴 홈(TopMenuLayout)에서도 쓴다.
 * accountOnly: 관리 거래처만(알림·사용자 정보·로그아웃은 PC 홈 접속자 카드가 맡을 때, 2026-11-10)
 */
export function HeaderActions({ accountOnly = false }: { accountOnly?: boolean } = {}) {
  const userInfoId = useId()

  return (
    <div className="header-bar__actions">
      <WorkspaceAccountPicker />
      {accountOnly ? null : <>
        <HeaderAlerts />
        <button
          type="button"
          className="header-bar__icon-button"
          popoverTarget={userInfoId}
          aria-label="사용자 정보"
          title="사용자 정보"
        >
          <img src={userIcon} width="32" height="32" alt="" aria-hidden="true" />
        </button>
        <UserInfoPanel id={userInfoId} />
        <LogoutButton />
      </>}
    </div>
  )
}

export default HeaderBar
