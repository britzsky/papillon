import { useEffect, useMemo, useState } from 'react'
import HeaderBar from '../../components/HeaderBar'
import SideMenuLayout from '../../components/SideMenuLayout'
import { getSearchDashboard, type SearchDashboard } from '../../api/analytics'
import './SearchAnalytics.css'

const empty: SearchDashboard = { summary: {}, popular_searches: [], no_result_searches: [], intent_summary: [] }
const intentNames: Record<string, string> = { INTEGRATED_SEARCH: '통합검색', MENU_SEARCH: '메뉴', INGREDIENT_SEARCH: '식자재', VENDOR_SEARCH: '사업장', HYGIENE_GUIDE_SEARCH: '위생' }

function SearchAnalytics() {
  const [days, setDays] = useState(30)
  const [data, setData] = useState(empty)
  const [error, setError] = useState('')
  useEffect(() => { getSearchDashboard(days).then((result) => { setData(result); setError('') }).catch((e) => setError(e instanceof Error ? e.message : '조회 실패')) }, [days])
  const maxPopular = useMemo(() => Math.max(1, ...data.popular_searches.map((item) => Number(item.search_count))), [data])
  const maxIntent = useMemo(() => Math.max(1, ...data.intent_summary.map((item) => Number(item.search_count))), [data])
  const summary = data.summary

  return <div className="search-admin-page"><SideMenuLayout header={<HeaderBar title="검색어 관리" breadcrumbs={[{ label: '본사관리' }, { label: '검색어 관리' }]} />}><main className="search-admin-content">
    <div className="search-admin-toolbar"><div><h1>검색어 분석</h1><p>고객이 무엇을 찾고 어떤 검색에서 결과를 얻지 못했는지 확인합니다.</p></div><label><span>조회 기간</span><select value={days} onChange={(e) => setDays(Number(e.target.value))}><option value={7}>최근 7일</option><option value={30}>최근 30일</option><option value={90}>최근 90일</option></select></label></div>
    {error ? <p className="search-admin-error">{error}</p> : null}
    <section className="search-admin-kpis"><article><span>전체 검색</span><strong>{summary.total_searches ?? 0}</strong></article><article><span>검색 세션</span><strong>{summary.total_sessions ?? 0}</strong></article><article><span>결과 없음</span><strong>{summary.no_result_searches ?? 0}</strong></article><article><span>결과 제공률</span><strong>{summary.result_rate ?? 0}%</strong></article></section>
    <section className="search-admin-charts"><article><h2>인기 검색어 순위</h2><div className="search-chart">{data.popular_searches.slice(0, 10).map((item, index) => <div className="search-chart__row" key={item.query}><b>{index + 1}</b><span>{item.query}</span><div><i style={{ width: `${Math.max(4, Number(item.search_count) / maxPopular * 100)}%` }} /></div><em>{item.search_count}회</em></div>)}</div></article><article><h2>검색 유형 분포</h2><div className="search-chart search-chart--intent">{data.intent_summary.map((item) => <div className="search-chart__row" key={item.intent_type}><span>{intentNames[item.intent_type] ?? item.intent_type}</span><div><i style={{ width: `${Math.max(4, Number(item.search_count) / maxIntent * 100)}%` }} /></div><em>{item.search_count}회</em></div>)}</div></article></section>
    <section className="search-admin-grid"><article><h2>인기 검색어 상세</h2><div className="workspace-table-scroll" tabIndex={0} role="region" aria-label="조회 결과 테이블"><table><tbody>{data.popular_searches.map((item, index) => <tr key={item.query}><td>{index + 1}</td><th>{item.query}</th><td>{item.search_count}회</td></tr>)}</tbody></table></div></article><article><h2>결과 없는 검색어</h2><div className="workspace-table-scroll" tabIndex={0} role="region" aria-label="조회 결과 테이블"><table><tbody>{data.no_result_searches.map((item, index) => <tr key={item.query}><td>{index + 1}</td><th>{item.query}</th><td>{item.search_count}회</td></tr>)}</tbody></table></div></article></section>
  </main></SideMenuLayout></div>
}
export default SearchAnalytics
