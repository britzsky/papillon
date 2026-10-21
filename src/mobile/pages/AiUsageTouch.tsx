import TouchLayout from '../TouchLayout'
import { AI_FEATURE_LABELS } from '../../api/aiUsage'
import { AI_USAGE_PERIODS, formatKrw, formatTokens, formatUsd, useAiUsage } from '../../features/operations/useAiUsage'
import './AiUsageTouch.css'

/** AI 사용 이력(태블릿·휴대폰, 본사 전용): 기간 → 합계 → 기능별 → 최근 호출. 조회는 PC와 같은 useAiUsage. */
export default function AiUsageTouch() {
  const u = useAiUsage()
  const report = u.report
  const toolbar = <div className="t-segment" role="group" aria-label="조회 기간">
    {AI_USAGE_PERIODS.map(([value, label]) => <button key={value} type="button" className={u.period === value ? 'is-active' : ''} onClick={() => u.setPeriod(value)}>{label}</button>)}
  </div>

  return <TouchLayout title="AI 사용 이력" subtitle="AI 호출 토큰·예상 비용(실제 청구는 OpenAI 기준)" toolbar={toolbar} hideAccount>
    {u.error && <p className="t-msg is-error">{u.error}</p>}
    <div className="au-kpis">
      <div className="t-card au-kpi"><span>예상 비용</span><strong>{formatUsd(u.totals.cost)}</strong><small>{formatKrw(u.totals.cost)}</small></div>
      <div className="t-card au-kpi"><span>호출</span><strong>{formatTokens(u.totals.calls)}회</strong><small>항목 {formatTokens(u.totals.items)}개{u.totals.failed ? ` · 실패 ${u.totals.failed}` : ''}</small></div>
      <div className="t-card au-kpi"><span>오늘 사용</span><strong>{formatUsd(report?.today_cost_usd ?? 0)}</strong><small>{u.dailyLimit > 0 ? `하루 한도 $${u.dailyLimit}` : '한도 없음'}</small></div>
    </div>
    <section className="t-card">
      <h2 className="t-section-title">기능별</h2>
      {(report?.summary ?? []).length === 0 && <p className="au-empty">이 기간에는 AI 호출이 없습니다.</p>}
      <ul className="au-list">{(report?.summary ?? []).map(item => <li key={item.feature}>
        <strong>{AI_FEATURE_LABELS[item.feature] ?? item.feature}</strong>
        <span>{item.call_count}회 · 항목 {item.item_count}개 · 토큰 {formatTokens(item.input_tokens + item.output_tokens)}</span>
        <em>{formatUsd(item.cost_usd)} <small>{formatKrw(item.cost_usd)}</small></em>
      </li>)}</ul>
    </section>
    <section className="t-card">
      <h2 className="t-section-title">최근 호출</h2>
      <ul className="au-list">{(report?.rows ?? []).slice(0, 50).map(row => <li key={row.ai_usage_log_id} className={row.status === 'FAILED' ? 'is-failed' : ''}>
        <strong>{AI_FEATURE_LABELS[row.feature] ?? row.feature}{row.status === 'FAILED' ? ' · 실패' : ''}</strong>
        <span>{String(row.created_at).replace('T', ' ').slice(5, 16)} · {row.account_name || row.account_id || '-'} · {row.user_id || '-'} · 토큰 {formatTokens(row.input_tokens + row.output_tokens)}</span>
        <em>{formatUsd(row.cost_usd)}</em>
      </li>)}</ul>
    </section>
  </TouchLayout>
}
