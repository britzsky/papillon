import DailyWork from '../components/DailyWork'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import HeaderBar from '../components/HeaderBar'
import SideMenuLayout from '../components/SideMenuLayout'
import { searchActions, searchIntentLabels, useHomeSearch } from '../features/home/useHomeSearch'
import './Home.css'

/** 자주 쓰는 화면. 홈에서 화면 입구는 '오늘 할 일'과 여기 두 곳뿐(왼쪽 메뉴에 전체 목록). */
const shortcuts = [
  { title: '발주하기', description: '추천 발주안·부족량·상품 검색', path: '/order_manager/order', icon: 'order' as const },
  { title: '발주서·입고', description: '접수 결과 확인·입고 확정·인쇄', path: '/order_manager/orders', icon: 'product' as const },
  { title: '재고 조정', description: '현재고·직접구매·기초재고', path: '/inventory/account', icon: 'inventory' as const },
  { title: '식단표', description: '식단 작성·주간 사용 확정', path: '/operations/table-meals', icon: 'operations' as const },
  { title: '거래처 메뉴', description: '메뉴 레시피·원가', path: '/operations/account-menu', icon: 'headquarters' as const },
  { title: '위생 점검', description: '거래처별 점검 상태', path: '/sanitation/vendor', icon: 'sanitation' as const },
]

function Home() {
  const navigate = useNavigate()
  const {
    searchText, setSearchText, normalizedSearchText, searchMatches, primaryMatch, suggestedActions,
    isSearchDataLoading, searchDataError, recent, popular, navigateWithSearch, handleSearchSubmit,
  } = useHomeSearch()
  const [searchOpen, setSearchOpen] = useState(false)

  const searchBox = <div className="rd-home__search" role="search" onFocus={() => setSearchOpen(true)}
    onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setSearchOpen(false) }}>
    <label>
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" stroke="#5B6660" strokeWidth="2" fill="none" /><path d="M16 16 L21 21" stroke="#5B6660" strokeWidth="2" strokeLinecap="round" /></svg>
      <input type="search" className="rd-bare-input" aria-label="통합 검색" placeholder="식재료·거래처·메뉴 검색 (예: 양파)" value={searchText}
        onChange={(event) => setSearchText(event.target.value)}
        onKeyDown={(event) => { if (event.key === 'Enter') handleSearchSubmit() }} />
    </label>
    <button type="button" className="rd-btn is-primary" onClick={handleSearchSubmit} disabled={!normalizedSearchText || isSearchDataLoading || Boolean(searchDataError)}>검색</button>
    {searchOpen && (normalizedSearchText || recent.length || popular.length) ? <div className="rd-home__search-pop" aria-live="polite">
      {normalizedSearchText ? <>
        {isSearchDataLoading ? <p className="rd-muted">검색 데이터를 불러오는 중입니다.</p> : null}
        {!isSearchDataLoading && primaryMatch ? <>
          <p><strong>{primaryMatch.name}</strong> — {searchIntentLabels[primaryMatch.intent]}{primaryMatch.matchedIngredients ? <span className="rd-muted"> · 레시피 식재료: {primaryMatch.matchedIngredients}</span> : null}</p>
          {searchMatches.length > 1 ? <div className="rd-home__keywords" aria-label="다른 검색 결과">{searchMatches.map((match) => <button key={`${match.intent}-${match.id}-${match.name}`} type="button"
            onClick={() => navigateWithSearch(searchActions.find((action) => action.intent === match.intent)?.path ?? '/home', match)}>{searchIntentLabels[match.intent]} · {match.name}</button>)}</div> : null}
          {suggestedActions.map((action) => <button key={`${action.intent}-${action.title}`} type="button" className="rd-home__result" onClick={() => navigateWithSearch(action.path, primaryMatch)}>
            <span className="rd-chip is-ok">{action.category}</span>
            <span><strong>{action.title}</strong><small>{action.description}</small></span>
            <span aria-hidden="true">→</span>
          </button>)}
        </> : null}
        {!isSearchDataLoading && !primaryMatch ? <p><strong>{normalizedSearchText}</strong>와 일치하는 식재료·거래처·메뉴가 없습니다.{searchDataError ? ` ${searchDataError}` : ''}</p> : null}
      </> : <div className="rd-home__keywords">
        {recent.length ? <><b>최근</b>{recent.map(value => <button key={value} type="button" onClick={() => setSearchText(value)}>{value}</button>)}</> : null}
        {popular.length ? <><b>많이 찾는</b>{popular.map(item => <button key={item.query} type="button" onClick={() => setSearchText(item.query)}>{item.query}</button>)}</> : null}
      </div>}
    </div> : null}
  </div>

  return (
    <div className="home-page procurement-refresh">
      <main className="home-content">
        <SideMenuLayout header={<HeaderBar title="오늘의 운영" breadcrumbs={[{ label: '홈' }]} />}>
          <div className="home-dashboard rd rd-home">
            {/* 자주 쓰는 화면: 거래처 한 곳이면 왼쪽 열(달력 왼쪽), 본사 여러 거래처면 맨 아래 */}
            <DailyWork search={searchBox} shortcuts={<section className="rd-home__shortcuts" aria-labelledby="home-shortcuts-title">
              <h2 id="home-shortcuts-title" className="rd-h2" style={{ marginBottom: 10 }}>자주 쓰는 화면</h2>
              <div className="rd-shortcuts">
                {shortcuts.map(card => <button key={card.path} type="button" className="rd-shortcut" onClick={() => navigate(card.path)}>
                  <strong>{card.title}</strong><small>{card.description}</small>
                </button>)}
              </div>
            </section>} />
          </div>
        </SideMenuLayout>
      </main>
    </div>
  )
}

export default Home
