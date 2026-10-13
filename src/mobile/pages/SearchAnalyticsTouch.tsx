import TouchLayout from '../TouchLayout'
import TouchIcon, { type TouchIconName } from '../TouchIcon'
import { INTENT_NAMES, useSearchDashboard } from '../../features/operations/useSearchDashboard'
import './SearchAnalyticsTouch.css'

const PERIODS = [7, 30, 90]

/** 검색어 관리(태블릿·휴대폰): 기간 → 요약 칸 → 인기 검색어 막대·검색 유형·결과 없는 검색어. 조회는 PC와 같은 useSearchDashboard. */
export default function SearchAnalyticsTouch() {
  const d = useSearchDashboard()
  const kpis: { label: string; value: string; icon: TouchIconName; tone?: string }[] = [
    { label: '전체 검색', value: String(d.summary.total_searches ?? 0), icon: 'search' },
    { label: '검색 세션', value: String(d.summary.total_sessions ?? 0), icon: 'users' },
    { label: '결과 없음', value: String(d.summary.no_result_searches ?? 0), icon: 'alert', tone: 'is-warn' },
    { label: '결과 제공률', value: `${d.summary.result_rate ?? 0}%`, icon: 'check', tone: 'is-ok' },
  ]
  const toolbar = <div className="t-segment" role="group" aria-label="조회 기간">
    {PERIODS.map(days => <button key={days} type="button" className={d.days === days ? 'is-active' : ''} onClick={() => d.setDays(days)}>최근 {days}일</button>)}
  </div>

  return <TouchLayout title="검색어 관리" subtitle="고객이 무엇을 찾고, 어떤 검색에서 결과를 못 얻었는지" toolbar={toolbar} hideAccount>
    {d.error && <p className="t-msg is-error">{d.error}</p>}
    <div className="sa-kpis">{kpis.map(k => <div key={k.label} className={`t-card sa-kpi ${k.tone || ''}`}>
      <span className="sa-kpi__icon"><TouchIcon name={k.icon} /></span><span>{k.label}</span><strong>{k.value}</strong>
    </div>)}</div>

    <div className="sa-grid">
      <section className="t-card">
        <h2 className="t-section-title">인기 검색어</h2>
        {d.data.popular_searches.length === 0 && <p className="sa-empty">검색 기록이 없습니다.</p>}
        <ol className="sa-bars">{d.data.popular_searches.slice(0, 15).map((item, index) => <li key={item.query}>
          <b className={index < 3 ? 'is-top' : ''}>{index + 1}</b>
          <span>{item.query}</span>
          <div><i style={{ width: `${Math.max(4, Number(item.search_count) / d.maxPopular * 100)}%` }} /></div>
          <em>{item.search_count}회</em>
        </li>)}</ol>
      </section>
      <section className="t-card">
        <h2 className="t-section-title">검색 유형</h2>
        <ol className="sa-bars">{d.data.intent_summary.map(item => <li key={item.intent_type}>
          <span>{INTENT_NAMES[item.intent_type] ?? item.intent_type}</span>
          <div><i style={{ width: `${Math.max(4, Number(item.search_count) / d.maxIntent * 100)}%` }} /></div>
          <em>{item.search_count}회</em>
        </li>)}</ol>
        <h2 className="t-section-title sa-gap">결과 없는 검색어</h2>
        {d.data.no_result_searches.length === 0 && <p className="sa-empty">없습니다.</p>}
        <ul className="sa-chips">{d.data.no_result_searches.map(item => <li key={item.query}><span>{item.query}</span><em>{item.search_count}</em></li>)}</ul>
      </section>
    </div>
  </TouchLayout>
}
