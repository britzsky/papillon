import TouchIcon from '../TouchIcon'
import { searchIntentLabels, useHomeSearch } from '../../features/home/useHomeSearch'

/** 터치 홈 통합 검색. 검색·추천 이동·검색 기록은 PC 홈과 같은 useHomeSearch. */
export default function HomeSearchTouch() {
  const {
    searchText, setSearchText, normalizedSearchText, searchMatches, primaryMatch, suggestedActions,
    isSearchDataLoading, searchDataError, recent, popular, navigateWithSearch, openMatch, handleSearchSubmit,
  } = useHomeSearch()

  return <section className="hs" aria-label="통합 검색">
    {/* 검색창은 절반 폭, 남는 오른쪽에 최근·많이 찾는 검색어(휴대폰은 아래 줄) */}
    <div className="hs-top">
    <form className="hs-bar" role="search" onSubmit={event => { event.preventDefault(); handleSearchSubmit() }}>
      <label className="t-chip hs-input">
        <TouchIcon name="search" />
        <input type="search" enterKeyHint="search" value={searchText} placeholder="식자재 · 거래처 · 메뉴 검색" onChange={event => setSearchText(event.target.value)} />
        {searchText && <button type="button" className="hs-clear" aria-label="검색어 지우기" onClick={() => setSearchText('')}><TouchIcon name="close" /></button>}
      </label>
      <button type="submit" className="t-btn is-primary" disabled={!normalizedSearchText || isSearchDataLoading || Boolean(searchDataError)}>검색</button>
    </form>
    {!normalizedSearchText && (recent.length > 0 || popular.length > 0) && <div className="hs-keywords">
      {recent.length > 0 && <div><b>최근</b>{recent.map(value => <button key={value} type="button" className="hs-keyword" onClick={() => setSearchText(value)}>{value}</button>)}</div>}
      {popular.length > 0 && <div><b>많이 찾는</b>{popular.map(item => <button key={item.query} type="button" className="hs-keyword" onClick={() => setSearchText(item.query)}>{item.query}</button>)}</div>}
    </div>}
    </div>

    {normalizedSearchText && <div className="t-card hs-results" aria-live="polite">
      {isSearchDataLoading && <p className="t-msg" role="status">검색하고 있습니다.</p>}
      {!isSearchDataLoading && primaryMatch && <>
        <p className="hs-summary"><strong>{primaryMatch.name}</strong> · {searchIntentLabels[primaryMatch.intent]}
          {primaryMatch.matchedIngredients && <small>레시피 식재료: {primaryMatch.matchedIngredients}</small>}</p>
        {searchMatches.length > 1 && <div className="hs-matches" aria-label="다른 검색 결과">
          {searchMatches.map(match => <button key={`${match.intent}-${match.id}-${match.name}`} type="button" className={`hs-match${match === primaryMatch ? ' is-active' : ''}`} onClick={() => openMatch(match)}>
            <span className="t-badge is-info">{searchIntentLabels[match.intent]}</span>{match.name}
          </button>)}
        </div>}
        <ul className="hs-actions">
          {suggestedActions.map(action => <li key={`${action.intent}-${action.title}`}>
            <button type="button" className="hs-action" onClick={() => navigateWithSearch(action.path, primaryMatch)}>
              <span className="hs-action__category">{action.category}</span>
              <span className="hs-action__text"><strong>{action.title}</strong><small>{action.description}</small></span>
              <TouchIcon name="chevronRight" />
            </button>
          </li>)}
        </ul>
      </>}
      {!isSearchDataLoading && !primaryMatch && <p className="t-msg"><strong>{normalizedSearchText}</strong>와 일치하는 식자재, 거래처, 메뉴가 없습니다.{searchDataError ? ` ${searchDataError}` : ''}</p>}
    </div>}
  </section>
}
