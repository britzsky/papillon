import { useEffect, useState, type ReactNode } from 'react'
import { Link, NavLink, useNavigate, useSearchParams } from 'react-router-dom'
import { logout } from '../../api/auth'
import { useCart } from '../../features/mall/mallCart'
import './Mall.css'

/**
 * 더채움몰 전용 틀(2026-11-03 사용자 요청): 발주 프로그램의 왼쪽 메뉴·머리 줄 없이 따로 운영되는 쇼핑몰처럼.
 * 맨 위 오른쪽 '발주 프로그램 가기'로 홈(/home)에 돌아간다. 검색은 어느 몰 화면에서든 상품 보기(/mall?q=)로.
 */
export default function MallLayout({ children }: { children: ReactNode }) {
  const cart = useCart()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const query = params.get('q') ?? ''
  const [keyword, setKeyword] = useState(query)
  const [shownQuery, setShownQuery] = useState(query)
  if (shownQuery !== query) { setShownQuery(query); setKeyword(query) }
  useEffect(() => { document.title = '더채움몰' }, [])
  const count = cart.lines.reduce((sum, line) => sum + line.qty, 0)
  const userName = localStorage.getItem('user_name')?.trim() || localStorage.getItem('user_id') || ''

  return <div className="rd mall-site">
    <div className="mall-top">
      <div className="mall-wrap mall-top__inner">
        <span className="mall-top__hello">{userName ? <><b>{userName}</b>님, 반갑습니다</> : '더채움몰'}</span>
        <nav className="mall-top__links" aria-label="계정">
          <Link to="/mall/orders">내 주문</Link>
          <button type="button" onClick={logout}>로그아웃</button>
          <Link to="/home" className="mall-top__back">발주 프로그램 가기<span aria-hidden="true"> →</span></Link>
        </nav>
      </div>
    </div>

    <header className="mall-header">
      <div className="mall-wrap mall-header__inner">
        <Link to="/mall" className="mall-logo" aria-label="더채움몰 처음으로">더채움<b>몰</b><small>산지 직송 · 식자재</small></Link>
        <form className="mall-header__search" role="search" onSubmit={event => {
          event.preventDefault()
          const value = keyword.trim()
          navigate(value ? `/mall?${new URLSearchParams({ q: value })}` : '/mall')
        }}>
          <input type="search" className="rd-bare-input" aria-label="상품 검색" placeholder="찾는 상품이나 협력사를 입력하세요" value={keyword} onChange={event => setKeyword(event.target.value)} />
          <button type="submit" aria-label="검색">
            <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2.2" fill="none" /><path d="M16 16 L21 21" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>
          </button>
        </form>
        <nav className="mall-header__icons" aria-label="쇼핑">
          <NavLink to="/mall/orders" className="mall-icon-link">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 8h6M9 12h6M9 16h4" /></svg>
            <span>내 주문</span>
          </NavLink>
          <NavLink to="/mall/cart" className="mall-icon-link">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 4h2l2.4 11h11.2L21 7H7" /><circle cx="9.5" cy="19.5" r="1.5" /><circle cx="17.5" cy="19.5" r="1.5" /></svg>
            <span>장바구니</span>
            {count ? <b className="mall-icon-link__badge" aria-label={`${count}개 담김`}>{count > 99 ? '99+' : count}</b> : null}
          </NavLink>
        </nav>
      </div>
    </header>

    <main className="mall-main">{children}</main>

    <footer className="mall-footer">
      <div className="mall-wrap">
        <b>더채움몰</b>
        <p>협력사 산지 직송 상품과 더채움 상품을 주문합니다. 주문 내역·입금 안내·배송조회는 <Link to="/mall/orders">내 주문</Link>에서 확인하세요.</p>
        <p><Link to="/home">발주 프로그램으로 돌아가기</Link></p>
      </div>
    </footer>
  </div>
}
