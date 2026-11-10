import { useState } from 'react'
import { searchActions, searchIntentLabels, useHomeSearch } from '../features/home/useHomeSearch'

/** PC 통합 검색(식재료·거래처·메뉴). 예전 홈 머리 줄과 상단 메뉴 홈 맨 위 줄이 같이 쓴다 */
export default function HomeSearchBox({ className = '' }: { className?: string }) {
  const {
    searchText, setSearchText, normalizedSearchText, searchMatches, primaryMatch, suggestedActions,
    isSearchDataLoading, searchDataError, recent, popular, navigateWithSearch, handleSearchSubmit,
  } = useHomeSearch()
  const [searchOpen, setSearchOpen] = useState(false)

  return <div className={`rd-home__search${className ? ` ${className}` : ''}`} role="search" onFocus={() => setSearchOpen(true)}
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
}
