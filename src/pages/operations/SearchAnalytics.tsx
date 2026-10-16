import HeaderBar from '../../components/HeaderBar'
import SideMenuLayout from '../../components/SideMenuLayout'
import { INTENT_NAMES, useSearchDashboard } from '../../features/operations/useSearchDashboard'
import './SearchAnalytics.css'

const count = (value: unknown) => Number(value ?? 0).toLocaleString('ko-KR')

/** 검색어 관리(PC). 조회는 features/operations/useSearchDashboard(터치와 공용). 2026-10-16 개편 모양(.rd-page). */
function SearchAnalytics() {
  const { days, setDays, data, summary, error, maxPopular, maxIntent } = useSearchDashboard()
  const noResult = Number(summary.no_result_searches ?? 0)

  return <div className="search-admin-page"><SideMenuLayout header={<HeaderBar title="검색어 관리" breadcrumbs={[{ label: '본사관리' }, { label: '검색어 관리' }]} />}>
    <div className="rd rd-page rd-search">
      <header className="rd-page__head">
        <div>
          <h1 className="rd-h1">검색어 관리</h1>
          <p className="rd-muted">고객이 무엇을 찾고, 어떤 검색에서 결과를 얻지 못했는지 확인합니다.</p>
        </div>
        <div className="rd-page__actions">
          <div className="rd-seg" role="group" aria-label="조회 기간">
            {[7, 30, 90].map((value) => <button type="button" key={value} className={days === value ? 'is-active' : ''} onClick={() => setDays(value)}>최근 {value}일</button>)}
          </div>
        </div>
      </header>
      {error ? <p className="rd-alert">{error}</p> : null}
      <div className="rd-page__tiles">
        <div className="rd-card rd-page__tile"><span>전체 검색</span><strong>{count(summary.total_searches)}</strong><small>최근 {days}일</small></div>
        <div className="rd-card rd-page__tile is-info"><span>검색 세션</span><strong>{count(summary.total_sessions)}</strong><small>사용자 검색 묶음</small></div>
        <div className={`rd-card rd-page__tile${noResult > 0 ? ' is-warn' : ' is-ok'}`}><span>결과 없음</span><strong>{count(noResult)}</strong><small>아래 '결과 없는 검색어' 확인</small></div>
        <div className="rd-card rd-page__tile is-ok"><span>결과 제공률</span><strong>{summary.result_rate ?? 0}%</strong><small>결과를 하나 이상 보여 준 비율</small></div>
      </div>
      <div className="rd-search__grid">
        <section className="rd-card rd-page__box"><h2 className="rd-h2">인기 검색어 순위</h2><div className="rd-search__chart">{data.popular_searches.slice(0, 10).map((item, index) => <div className="rd-search__row" key={item.query}><b>{index + 1}</b><span>{item.query}</span><div className="rd-bar"><span style={{ width: `${Math.max(4, Number(item.search_count) / maxPopular * 100)}%` }} /></div><em>{item.search_count}회</em></div>)}{!data.popular_searches.length ? <p className="rd-muted">검색 기록이 없습니다.</p> : null}</div></section>
        <section className="rd-card rd-page__box"><h2 className="rd-h2">검색 유형 분포</h2><div className="rd-search__chart is-intent">{data.intent_summary.map((item) => <div className="rd-search__row" key={item.intent_type}><span>{INTENT_NAMES[item.intent_type] ?? item.intent_type}</span><div className="rd-bar"><span style={{ width: `${Math.max(4, Number(item.search_count) / maxIntent * 100)}%` }} /></div><em>{item.search_count}회</em></div>)}</div></section>
      </div>
      <div className="rd-search__grid">
        <section className="rd-card rd-page__main"><div className="rd-page__list-head"><h2 className="rd-h2">인기 검색어 상세</h2></div><div className="rd-page__scroll rd-search__table" tabIndex={0} role="region" aria-label="인기 검색어 표"><table className="rd-table"><thead><tr><th>순위</th><th>검색어</th><th className="is-num">횟수</th></tr></thead><tbody>{data.popular_searches.map((item, index) => <tr key={item.query}><td>{index + 1}</td><td><strong>{item.query}</strong></td><td className="is-num">{item.search_count}회</td></tr>)}</tbody></table></div></section>
        <section className="rd-card rd-page__main"><div className="rd-page__list-head"><h2 className="rd-h2">결과 없는 검색어</h2><span className="rd-chip is-warn">상품·메뉴 이름 보완 후보</span></div><div className="rd-page__scroll rd-search__table" tabIndex={0} role="region" aria-label="결과 없는 검색어 표"><table className="rd-table"><thead><tr><th>순위</th><th>검색어</th><th className="is-num">횟수</th></tr></thead><tbody>{data.no_result_searches.map((item, index) => <tr key={item.query}><td>{index + 1}</td><td><strong>{item.query}</strong></td><td className="is-num">{item.search_count}회</td></tr>)}</tbody></table>{!data.no_result_searches.length ? <p className="rd-page__empty">결과 없는 검색이 없습니다.</p> : null}</div></section>
      </div>
    </div>
  </SideMenuLayout></div>
}
export default SearchAnalytics
