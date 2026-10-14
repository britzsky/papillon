import DailyWork from '../components/DailyWork'
import { useNavigate } from 'react-router-dom'
import HeaderBar from '../components/HeaderBar'
import SideMenuLayout from '../components/SideMenuLayout'
import WorkspaceIcon from '../components/WorkspaceIcon'
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

  return (
    <div className="home-page procurement-refresh">
      <main className="home-content">
        <SideMenuLayout header={<HeaderBar title="오늘의 운영" breadcrumbs={[{ label: '홈' }]} />}>
          <div className="home-dashboard">
            <div className="home-top">
              {/* 화면 제목은 머리글 '오늘의 운영' 하나만 두고 여기에는 날짜만 */}
              <p className="home-top__title">{new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}</p>
            <section className="home-search" aria-label="업무 검색">
              <label className="home-search__box">
                <span aria-hidden="true">⌕</span>
                <input
                  type="search"
                  placeholder="식자재, 거래처, 메뉴명을 검색해보세요"
                  value={searchText}
                  onChange={(event) => setSearchText(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      handleSearchSubmit()
                    }
                  }}
                />
              </label>
              <button type="button" className="home-search__assistant" onClick={handleSearchSubmit} disabled={!normalizedSearchText || isSearchDataLoading || Boolean(searchDataError)}>
                🔍 통합 추천 검색
              </button>
              {normalizedSearchText ? (
                <div className="home-search__results" aria-live="polite">
                  {isSearchDataLoading ? <p className="home-search__summary">검색 데이터를 불러오는 중입니다.</p> : null}
                  {!isSearchDataLoading && primaryMatch ? (
                    <>
                      <p className="home-search__summary">
                        <strong>{primaryMatch.name}</strong> 항목을 {searchIntentLabels[primaryMatch.intent]}로 찾았습니다.
                        {primaryMatch.matchedIngredients && <span> 레시피 식재료: {primaryMatch.matchedIngredients}</span>}
                      </p>
                      {searchMatches.length > 1 ? (
                        <div className="home-search__matches" aria-label="다른 검색 결과">
                          {searchMatches.map((match) => (
                            <button
                              key={`${match.intent}-${match.id}-${match.name}`}
                              type="button"
                              className={`home-search__match${match === primaryMatch ? ' is-active' : ''}`}
                              onClick={() => navigateWithSearch(searchActions.find((action) => action.intent === match.intent)?.path ?? '/home', match)}
                            >
                              {searchIntentLabels[match.intent]} · {match.name}
                              {match.matchedIngredients && <small> · 레시피 식재료: {match.matchedIngredients}</small>}
                            </button>
                          ))}
                        </div>
                      ) : null}
                      {suggestedActions.map((action) => (
                        <button
                          key={`${action.intent}-${action.title}`}
                          type="button"
                          className="home-search__result"
                          onClick={() => navigateWithSearch(action.path, primaryMatch)}
                        >
                          <span className="home-search__category">{action.category}</span>
                          <span className="home-search__result-text">
                            <strong>{action.title}</strong>
                            <span>{action.description}</span>
                          </span>
                          <span className="home-search__arrow" aria-hidden="true">
                            →
                          </span>
                        </button>
                      ))}
                    </>
                  ) : null}
                  {!isSearchDataLoading && !primaryMatch ? (
                    <p className="home-search__summary">
                      <strong>{normalizedSearchText}</strong>와 일치하는 식자재, 거래처, 메뉴가 없습니다.
                      {searchDataError ? ` ${searchDataError}` : ''}
                    </p>
                  ) : null}
                </div>
              ) : null}
              {recent.length || popular.length ? <div className="home-search__keywords">
                {recent.length ? <span><b>최근</b>{recent.map(value => <button key={value} type="button" onClick={() => setSearchText(value)}>{value}</button>)}</span> : null}
                {popular.length ? <span><b>많이 찾는</b>{popular.map(item => <button key={item.query} type="button" onClick={() => setSearchText(item.query)}>{item.query}</button>)}</span> : null}
              </div> : null}
            </section>
            </div>

            <DailyWork />

            <section className="home-shortcuts" aria-labelledby="home-shortcuts-title">
              <h2 id="home-shortcuts-title">자주 쓰는 화면</h2>
              <div className="home-shortcuts__grid">
                {shortcuts.map(card => <button key={card.path} type="button" className="home-shortcut" onClick={() => navigate(card.path)}>
                  <span className="home-shortcut__icon"><WorkspaceIcon name={card.icon} /></span>
                  <span className="home-shortcut__text"><strong>{card.title}</strong><small>{card.description}</small></span>
                </button>)}
              </div>
            </section>
          </div>
        </SideMenuLayout>
      </main>
    </div>
  )
}

export default Home
