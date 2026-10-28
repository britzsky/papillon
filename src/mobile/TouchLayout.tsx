import { visibleForRole } from '../features/workspace/roleScreens'
import { rememberWorkspaceAccount, workspaceAccountId } from '../features/workspace/workspaceAccount'
import { useEffect, useState, type ReactNode } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { logout } from '../api/auth'
import { getAccountOptions, type AccountOption } from '../api/operations'
import { useAccountSuppliers } from '../features/workspace/accountSuppliers'
import TouchAccountPicker from './TouchAccountPicker'
import TouchIcon, { type TouchIconName } from './TouchIcon'
import { useTouchBody } from './useTouchBody'
import logo from '../assets/logo/thefull.png'
import './TouchLayout.css'
import './TouchPcSkin.css'

type NavItem = { label: string; to: string; hint: string }
type NavGroup = { key: string; label: string; icon: TouchIconName; items: NavItem[]; hqOnly?: boolean }

/** 왼쪽 메뉴(휴대폰은 아래 탭). 화면이 하나인 묶음은 바로 이동, 여럿이면 펼쳐서 고른다. PC SideMenuLayout과 같은 주소를 쓴다. */
const NAV: NavGroup[] = [
  { key: 'home', label: '홈', icon: 'home', items: [{ label: '오늘 할 일', to: '/home', hint: '' }] },
  { key: 'meals', label: '식단', icon: 'meals', items: [
    { label: '식단표', to: '/operations/table-meals', hint: '요일별 메뉴 보기 · 사용 확정' },
    { label: '템플릿 식단표', to: '/operations/meal-plan-templates', hint: '본사 1일 식단가별 식단표' },
    { label: '메뉴 관리', to: '/operations/menu', hint: '본사 메뉴 등록' },
  ] },
  { key: 'order', label: '발주', icon: 'order', items: [
    { label: '발주하기', to: '/order_manager/order', hint: '부족한 식재료 주문' },
    { label: '발주서 · 입고', to: '/order_manager/orders', hint: '주문 결과 확인 · 입고 확정' },
    { label: '공급사 연동', to: '/order_manager/suppliers', hint: '웰스토리 · 아워홈 연결 상태' },
    { label: '사업장 매핑', to: '/order_manager/supplier-sites', hint: '거래처별 공급사 사업장' },
  ] },
  { key: 'inventory', label: '재고', icon: 'inventory', items: [
    { label: '거래처별 재고관리', to: '/inventory/account', hint: '식재료별 재고 · 직접 구매 · 조정' },
    { label: '변동 이력', to: '/inventory/history', hint: '입고 · 사용 · 조정 기록' },
    { label: '식자재 관리', to: '/inventory/ingredients', hint: '본사 식자재 목록' },
  ] },
  { key: 'sanitation', label: '위생', icon: 'sanitation', items: [{ label: '위생 점검', to: '/sanitation/vendor', hint: '' }] },
  { key: 'hq', label: '본사', icon: 'hq', hqOnly: true, items: [
    { label: '고객사 관리', to: '/operations/account', hint: '고객사 · 식사 설정' },
    { label: '끼니 종류', to: '/operations/meal-slots', hint: '조식·중식·간식 등 끼니 추가' },
    { label: '검색어 관리', to: '/operations/search-analytics', hint: '검색 기록 분석' },
    { label: 'AI 사용 이력', to: '/operations/ai-usage', hint: 'AI 토큰 · 예상 비용' },
  ] },
]

/** 역할별로 숨기는 화면은 features/workspace/roleScreens(PC 메뉴·주소 직접 입력과 같은 목록) */
const isAccountUser = () => localStorage.getItem('user_type') === '3'

const todayLabel = () => new Date().toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })

/**
 * 태블릿·휴대폰 공통 틀(POS 형태): 왼쪽 아이콘 메뉴 + 위 제목·거래처 + 본문 + 오른쪽 실행 패널(aside).
 * 휴대폰(768px 미만)은 메뉴가 아래 탭, 실행 패널은 본문 아래로 내려간다.
 * PC 전용 전역 스타일(body.workspace-ui)은 이 틀이 있는 동안 끈다.
 */
export default function TouchLayout({ title, subtitle, toolbar, aside, asideNarrow = false, children, onAccountChange, hideAccount = false }: {
  title: string
  subtitle?: string
  /** 제목 옆 조회 조건(월 이동 등) */
  toolbar?: ReactNode
  /** 오른쪽 실행 패널(요약·확정 버튼) */
  aside?: ReactNode
  /** 오른쪽 패널을 좁게(본문을 넓게) — 식단표처럼 패널 내용이 짧은 화면 */
  asideNarrow?: boolean
  children: ReactNode
  /** 위 거래처 선택이 바뀔 때. 없으면 주소의 account_id만 바꾼다 */
  onAccountChange?: (accountId: string) => void
  /** 거래처와 무관한 본사 화면(식자재 관리·고객사 관리 등)은 거래처 선택을 숨긴다 */
  hideAccount?: boolean
}) {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [openGroup, setOpenGroup] = useState('')
  const [accounts, setAccounts] = useState<AccountOption[]>([])
  // 관리 거래처(PC와 같은 규칙: 거래처 계정 고정, 본사는 주소 → 마지막 선택)
  const accountId = workspaceAccountId(searchParams)
  const accountUser = isAccountUser()
  // 공급사 사업장 매핑 색(왼쪽 웰스토리 주황 · 오른쪽 아워홈 파랑) — 본사만
  const suppliers = useAccountSuppliers(!accountUser)

  useTouchBody()

  useEffect(() => {
    if (accountUser) return
    let alive = true
    getAccountOptions().then(rows => { if (alive) setAccounts(rows) }).catch(() => { if (alive) setAccounts([]) })
    return () => { alive = false }
  }, [accountUser])

  const groups = NAV
    .filter(group => !(accountUser && group.hqOnly))
    .map(group => ({ ...group, items: group.items.filter(item => visibleForRole(item.to)) }))
    .filter(group => group.items.length > 0)
  const activeGroup = groups.find(group => group.items.some(item => pathname === item.to || pathname.startsWith(`${item.to}/`)))?.key || ''
  const flyout = groups.find(group => group.key === openGroup)
  // 넓은 메뉴(1100px 이상)에서 펼친 묶음. 처음엔 지금 화면이 든 묶음
  const [expandedChoice, setExpandedChoice] = useState<string | null>(null)
  const expanded = expandedChoice ?? activeGroup

  const go = (to: string) => {
    setOpenGroup('')
    navigate(accountId ? `${to}?${new URLSearchParams({ account_id: accountId })}` : to)
  }
  const pressGroup = (group: NavGroup) => {
    if (group.items.length === 1) go(group.items[0].to)
    else if (window.matchMedia('(min-width: 1100px)').matches) setExpandedChoice(expanded === group.key ? '' : group.key)
    else setOpenGroup(current => current === group.key ? '' : group.key)
  }
  const changeAccount = (value: string) => {
    // 로그인한 사람의 거래처 정보(account_id·account_name)는 건드리지 않고 '관리 거래처'만 바꾼다(비우면 전체 거래처)
    rememberWorkspaceAccount(value)
    const next = new URLSearchParams(searchParams)
    if (value) next.set('account_id', value); else next.delete('account_id')
    setSearchParams(next, { replace: true })
    onAccountChange?.(value)
  }
  const accountName = accounts.find(option => option.value === accountId)?.text || localStorage.getItem('account_name') || ''

  const userName = localStorage.getItem('user_name') || ''

  return <div className={`t-app${aside ? ' has-aside' : ''}${aside && asideNarrow ? ' is-aside-narrow' : ''}`}>
    <nav className="t-rail" aria-label="메뉴">
      <div className="t-rail__brand">
        <img className="t-rail__logo" src={logo} alt="더채움" />
      </div>
      <div className="t-rail__items">
        {groups.map(group => {
          const expandedHere = group.items.length > 1 && expanded === group.key
          return <div key={group.key} className="t-rail__group">
            <button type="button"
              className={`t-rail__item${activeGroup === group.key ? ' is-active' : ''}${openGroup === group.key ? ' is-open' : ''}`}
              aria-expanded={group.items.length > 1 ? expandedHere || openGroup === group.key : undefined}
              onClick={() => pressGroup(group)}>
              <TouchIcon name={group.icon} />
              <span>{group.label}</span>
            </button>
            {/* 넓은 화면: 묶음 안 화면을 메뉴 아래에 펼친다(좁은 화면은 펼침 창) */}
            {expandedHere && <ul className="t-rail__sub">
              {group.items.map(item => <li key={item.to}>
                <button type="button" className={pathname === item.to ? 'is-active' : ''} onClick={() => go(item.to)}>{item.label}</button>
              </li>)}
            </ul>}
          </div>
        })}
      </div>
      <div className="t-rail__foot">
        {userName && <span className="t-rail__user"><i>{userName.slice(0, 1)}</i><span>{userName}</span></span>}
        <button type="button" className="t-rail__item t-rail__logout" onClick={logout}>
          <TouchIcon name="logout" />
          <span>로그아웃</span>
        </button>
      </div>
    </nav>

    {flyout && <div className="t-flyout-backdrop" role="presentation" onClick={() => setOpenGroup('')}>
      <section className="t-flyout" role="dialog" aria-label={`${flyout.label} 메뉴`} onClick={e => e.stopPropagation()}>
        <h2>{flyout.label}</h2>
        <ul>
          {flyout.items.map(item => <li key={item.to}>
            <button type="button" className={pathname === item.to ? 'is-active' : ''} onClick={() => go(item.to)}>
              <strong>{item.label}</strong>
              {item.hint && <small>{item.hint}</small>}
            </button>
          </li>)}
        </ul>
      </section>
    </div>}

    <div className="t-page">
      <header className="t-top">
        <div className="t-top__title">
          <p>{todayLabel()}</p>
          <h1>{title}</h1>
          {subtitle && <span>{subtitle}</span>}
        </div>
        {toolbar && <div className="t-top__toolbar">{toolbar}</div>}
        {!hideAccount && <div className="t-top__account">
          {accountUser
            ? <span className="t-chip"><TouchIcon name="store" />{accountName || '내 거래처'}</span>
            : <TouchAccountPicker accounts={accounts} accountId={accountId} suppliers={suppliers} onChange={changeAccount} />}
        </div>}
      </header>
      <div className="t-body">
        <main className="t-main">{children}</main>
        {aside && <aside className="t-aside">{aside}</aside>}
      </div>
    </div>
  </div>
}
